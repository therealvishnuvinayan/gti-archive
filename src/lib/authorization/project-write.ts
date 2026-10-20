import "server-only";
import { getCurrentUser } from "../auth";
import { projectReadActor } from "./project-read-rules";
import { projectWriteOperations, type ProjectWriteOperation } from "./project-write-operations";
import { projectMutationTarget, resolveProjectWriteTarget, type ProjectWriteTarget } from "./project-write-policies";
import { activeProjectMutation, projectMutationTransactions } from "./project-transaction";
import { runtimeAuthorization } from "./runtime";

class RejectedNativeMutation extends Error {
  constructor(readonly result: unknown) { super("Native mutation rejected; transaction rolled back."); }
}

/** Public domain services enter here before validation, queries or side effects.
 * The callback receives a newly authenticated user, never caller-supplied roles.
 * All native helpers use the same transaction through the request-local client. */
export async function runProjectMutation<T>(
  expected: { id: string }, operation: ProjectWriteOperation, target: ProjectWriteTarget,
  mutation: (user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>) => Promise<T>,
  input?: unknown,
): Promise<T> {
  const spec = projectWriteOperations[operation];
  if (!spec || spec.mode === "blocked") {
    throw new Error("This operation is blocked pending project governance integration (Phase 1.5D).");
  }
  const data = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const reason = typeof data.reason === "string" ? data.reason : undefined;
  if (data.recipientType === "EXTERNAL_EMAIL" || data.channel === "EMAIL" || ["resendStageFiveExternalChecklistRequest", "retryProductionSampleRequestEmail", "retryProductionApprovalDispatch"].includes(operation)) {
    throw new Error("External request dispatch is disabled pending a durable post-commit delivery workflow.");
  }
  const parent = activeProjectMutation();
  const afterCommit = parent?.afterCommit ?? [];
  try {
    const result = await runtimeAuthorization.runAuthorized({
      capability: spec.capability, targetId: projectMutationTarget(operation, target),
      ...(reason !== undefined ? { reason } : {}),
    }, async (tx, grant) => {
      if (grant.actorUserId !== expected?.id) throw new Error("The supplied actor does not match the authenticated session.");
      const resource = await resolveProjectWriteTarget(tx, target);
      if (!resource || (typeof data.projectId === "string" && data.projectId !== resource.projectId)) throw new Error("Project/resource mismatch.");
      if (parent && (parent.actorId !== grant.actorUserId || parent.projectId !== resource.projectId || parent.projectKind !== resource.projectKind)) throw new Error("Cross-project nested mutation denied.");
      return projectMutationTransactions.run({ tx, actorId: grant.actorUserId, projectId: resource.projectId,
        projectKind: resource.projectKind, operation, afterCommit }, async () => {
        const user = await getCurrentUser();
        if (!user || user.id !== grant.actorUserId) throw new Error("Authentication expired.");
        const actor = projectReadActor(user);
        if (["sendProductionApprovalRequest", "resendRejectedProductionApproval"].includes(operation) && typeof data.stepId === "string") {
          const step = await tx.productionApprovalStep.findUnique({ where: { id: data.stepId }, select: { recipientType: true } });
          if (step?.recipientType === "EXTERNAL_EMAIL") throw new Error("External dispatch requires a durable post-commit workflow.");
        }
        // A concept assignment authorizes task files, never invoices or unrelated assets.
        if (operation === "requestAttachmentUpload" && actor?.businessRole !== "DIRECTOR" &&
          !["STAGE_SUBMISSION", "REVISION_ORIGINAL", "COMMENT_ATTACHMENT", "GENERAL_PROJECT_ASSET"].includes(String(data.assetType))) {
          const project = await tx.project.findUnique({ where: { id: resource.projectId }, select: {
            ownerId: true, coOwners: { select: { userId: true } },
          } });
          const manager = actor && ["SENIOR_PROJECT_MANAGER", "JUNIOR_PROJECT_MANAGER"].includes(actor.businessRole ?? "") &&
            (project?.ownerId === actor.userId || project?.coOwners.some(row => row.userId === actor.userId));
          if (!manager) throw new Error("This file purpose is not authorized for assigned task execution.");
        }
        const value = await mutation(user);
        if (!actor || Date.parse(actor.session.expiresAt) <= Date.now()) throw new Error("Authentication expired during the mutation.");
        // Legacy functions sometimes catch a database error and return an error
        // object. Convert it to rollback before returning it to their caller.
        if (value && typeof value === "object" && "error" in value) throw new RejectedNativeMutation(value);
        afterCommit.push(async () => { console.info("[project-mutation]", JSON.stringify({
          operation, capability: grant.capability, actorUserId: grant.actorUserId,
          projectId: resource.projectId, projectKind: resource.projectKind, targetId: grant.targetId,
          directorOverride: grant.directorOverride, reason: grant.reason ?? null,
        })); });
        return value;
      });
    }, { isolationLevel: "Serializable", timeout: 30_000 });
    if (!parent) for (const effect of afterCommit) await effect();
    return result;
  } catch (error) {
    if (error instanceof RejectedNativeMutation && !parent) return error.result as T;
    throw error;
  }
}
