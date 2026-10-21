import "server-only";
import type { AuthorizationContext, ResourcePolicies } from "./policy";
import { structuredProjectReadWhere, flexibleProjectReadWhere } from "./project-read-rules";
import { taskEnabled, availableTaskType, deliverablesEnabled } from "../tasker/contracts";

import { conceptsEnabled } from "../tasker/contracts";
import { conceptManager } from "../tasker/concepts";
import { authorizedTarget } from "../tasker/targets";

async function context({ tx, actor, request }: Parameters<NonNullable<ResourcePolicies["task.view"]>>[0]): Promise<AuthorizationContext | null> {
  if (!taskEnabled() || !actor.businessRole) return null;
  // These are genuine authenticated values, never supplied through command JSON.
  await tx.$queryRaw`SELECT set_config('flux.task_actor', ${actor.userId}, true), set_config('flux.task_session', ${actor.session.id}, true)`;
  if (request.capability === "task.list") return request.targetId === "root" ? { resource: { id: "root", kind: "workspace" }, resourcePermission: true, integrity: { workflowAllowed: true, actorUserId: actor.userId, preservesOwnership: true, preservesHistory: true } } : null;
  if (["task.createFileUpload", "task.createDataInput"].includes(request.capability)) {
    if (!deliverablesEnabled()) return null;
    const target = await authorizedTarget(tx, actor.userId, request.targetId);
    if ((target.kind === "checklist") !== (request.capability === "task.createDataInput")) return null;
    return { resource: { id: request.targetId, kind: "project", projectId: target.projectId }, project: { id: target.projectId, participantUserIds: target.participantUserIds },
      resourcePermission: true, authorizedDestinationFolder: true,
      integrity: { workflowAllowed: true, actorUserId: actor.userId, preservesOwnership: true, preservesHistory: true } };
  }
  const conceptCreation = ["task.createInspectFile", "task.createInitialConcept", "task.createFinalConcept"].includes(request.capability);
  if (conceptCreation && (!conceptsEnabled() || !conceptManager(actor.businessRole))) return null;
  if (request.capability === "task.createGeneral" || conceptCreation) {
    const [kind, key, extra] = request.targetId.split(":");
    if (!key || extra) return null;
    let permitted = false;
    if (kind === "task") {
      await tx.$queryRaw`SELECT id FROM "UniversalTask" WHERE id=${key} FOR SHARE`;
      const source = await tx.universalTask.findUnique({ where: { id: key } });
      // A spectator cannot turn read access into creation authority. Only a task's
      // owner/executor may reuse its minimal project identity; no stage is exposed.
      permitted = !!source && !source.deletedAt && availableTaskType(source.type) &&
        (actor.businessRole === "DIRECTOR" || source.ownerId === actor.userId || source.executorId === actor.userId);
    } else if (["structured", "flexible"].includes(kind)) {
      await tx.$executeRaw`LOCK TABLE "Project", "ProjectCoOwner", "ProjectExecutor", "ProjectCollaborator", "ProjectConceptFolder", "FlexibleProject", "FlexibleProjectCollaborator", "FlexibleMilestone" IN SHARE MODE`;
      permitted = kind === "structured"
        ? !!await tx.project.findFirst({ where: { id: key, AND: structuredProjectReadWhere(actor) }, select: { id: true } })
        : !!await tx.flexibleProject.findFirst({ where: { id: key, AND: flexibleProjectReadWhere(actor) }, select: { id: true } });
    }
    if (!permitted) return null;
    return { resource: { id: request.targetId, kind: "project" }, project: { id: request.targetId, participantUserIds: [actor.userId] },
      resourcePermission: true, integrity: { workflowAllowed: true, actorUserId: actor.userId, preservesOwnership: true, preservesHistory: true } };
  }
  await tx.$queryRaw`SELECT id FROM "UniversalTask" WHERE id=${request.targetId} FOR UPDATE`;
  const task = await tx.universalTask.findUnique({ where: { id: request.targetId }, include: { spectators: true } });
  if (!task || !availableTaskType(task.type)) return null;
  const director = actor.businessRole === "DIRECTOR", owner = task.ownerId === actor.userId, executor = task.executorId === actor.userId;
  const spectatorIds = task.spectators.map(s => s.userId), spectator = spectatorIds.includes(actor.userId);
  if (task.type !== "GENERAL" && request.capability === "task.download" && !(director || owner || executor)) return null;
  const read = ["task.view", "task.download"].includes(request.capability);
  // Deleted evidence is retained for its owner/Director. Normal lists exclude it.
  if (!(director || owner || executor || spectator) || (task.deletedAt && !(director || owner))) return null;
  const resourcePermission = read || (request.capability === "task.message" ? owner || executor :
    ["task.execute", "task.requestCompletion"].includes(request.capability) ? executor : owner);
  const projectId = task.projectId ? `structured:${task.projectId}` : `flexible:${task.flexibleProjectId}`;
  // Narrow native task relationships satisfy task context only. No memberships
  // are inserted, and no project/stage/file policies consume this evidence.
  return { resource: { id: task.id, kind: "task", projectId }, project: { id: projectId, participantUserIds: [task.ownerId, task.executorId, ...spectatorIds] },
    task: { id: task.id, ownerUserId: task.ownerId, executorUserIds: [task.executorId], spectatorUserIds: spectatorIds },
    resourcePermission, integrity: { workflowAllowed: read || request.capability === "task.delete" || !task.deletedAt, actorUserId: actor.userId, preservesOwnership: true, preservesHistory: true },
    // State transitions and request-specific self-review are checked after replay
    // lookup under this same row lock. Self-execution is excluded at assignment.
    taskLifecycleAllowed: request.capability === "task.delete" || !task.deletedAt, selfReviewPolicy: { policyId: "general.distinct-reviewer.v1", permitted: !executor } };
}
export const taskPolicies: ResourcePolicies = Object.freeze({
  "task.createInspectFile": context, "task.createInitialConcept": context, "task.createFinalConcept": context,
  "task.createFileUpload": context, "task.createDataInput": context,
  "task.list": context, "task.createGeneral": context, "task.view": context, "task.download": context,
  "task.message": context, "task.execute": context, "task.requestCompletion": context,
  "task.review": context, "task.complete": context, "task.delete": context, "task.manage": context,
});
