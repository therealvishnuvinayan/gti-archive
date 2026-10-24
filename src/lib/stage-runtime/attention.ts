import "server-only";
import type { Prisma } from "@prisma/client";
import type { AuthenticatedPrincipal } from "../authorization/session";
import { isConfiguredRuntimeReviewer } from "../approvals/runtime-stage-eligibility";
import { approvalHash } from "../approvals/contracts";
import type { StageDefinition } from "../stage-builder/contracts";
import type { Values, Checks } from "./contracts";

// No file names, storage keys, conversations or project-wide evidence are read.
// Evidence-heavy stages are omitted instead of weakening the exact snapshot check.
export async function actionableRuntimeApproval(tx: Prisma.TransactionClient, actor: AuthenticatedPrincipal, id: string) {
  const sub = await tx.runtimeApprovalSubmission.findUniqueOrThrow({ where: { id }, select: {
    capabilityId: true, evidenceRevision: true, snapshotHash: true, requestedById: true, actorVersion: true,
    request: { select: { state: true, currentStep: true } },
    stage: { select: { id: true, projectId: true, definitionStageId: true, evidenceRevision: true, state: true, configuration: true, values: true, checklist: true,
      project: { select: { state: true, ownerId: true, participants: { where: { role: "CO_OWNER" }, take: 30, select: { role: true, userId: true } },
        stages: { where: { state: "COMPLETED" }, take: 100, select: { definitionStageId: true } } } },
      submissions: { where: { replacement: { is: null } }, take: 501, orderBy: { createdAt: "asc" }, select: { id: true, capabilityId: true, versionId: true, state: true, submittedById: true, reviewedById: true } },
    } },
  } });
  const s = sub.stage, definition = s.configuration as unknown as StageDefinition;
  if (sub.request.state !== "PENDING" || s.state === "COMPLETED" || s.project.state !== "ACTIVE" || sub.evidenceRevision !== s.evidenceRevision) return false;
  if (s.submissions.length > 500) return "REQUIRES_WORKSPACE" as const;
  const configured = definition.capabilities.find(c => c.id === sub.capabilityId && c.type === "APPROVAL");
  if (!configured || configured.type !== "APPROVAL") return false;
  const step = configured.steps[sub.request.currentStep - 1];
  if (!step) return false;
  const completed = s.project.stages.map(x => x.definitionStageId);
  if (definition.gates.some(g => g.type === "PRECEDING_STAGE" && !completed.includes(g.stageId))) return false;
  const blocking = definition.capabilities.filter(c => c.type === "APPROVAL" && c.rejection === "BLOCK_STAGE").map(c => c.id);
  if (blocking.length && await tx.runtimeApprovalSubmission.count({ where: { stageId: s.id, capabilityId: { in: blocking }, request: { state: "REJECTED" } } })) return false;
  const contributors = [sub.requestedById, ...Object.values(s.values as Values).map(v => v.actorId), ...Object.values(s.checklist as Checks).filter(v => v.complete).map(v => v.actorId), ...s.submissions.map(f => f.submittedById)];
  if (!isConfiguredRuntimeReviewer(actor, step.approver, s.project, contributors)) return false;
  const requester = await tx.userAuthorization.findUnique({ where: { userId: sub.requestedById }, select: { accountStatus: true, authorizationVersion: true, businessRole: true } });
  if (requester?.accountStatus !== "ACTIVE" || requester.authorizationVersion !== sub.actorVersion || !["DIRECTOR", "SENIOR_PROJECT_MANAGER", "JUNIOR_PROJECT_MANAGER"].includes(requester.businessRole ?? "")) return false;
  return sub.snapshotHash === approvalHash({ stageId: s.id, projectId: s.projectId, definitionStageId: s.definitionStageId, evidenceRevision: s.evidenceRevision,
    values: s.values, checklist: s.checklist, files: s.submissions.map(f => ({ submissionId: f.id, capabilityId: f.capabilityId, versionId: f.versionId, state: f.state, submittedById: f.submittedById, reviewedById: f.reviewedById })),
    completedDependencies: definition.gates.flatMap(g => g.type === "PRECEDING_STAGE" && completed.includes(g.stageId) ? [g.stageId] : []), capabilityId: configured.id });
}
