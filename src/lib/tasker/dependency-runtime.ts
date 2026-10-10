import type { TaskerDependency } from "@prisma/client";
import type { TaskDb } from "./adapters";
import type { TaskSource } from "./types";
import { taskAssert } from "./errors";
import { lockTaskerProject } from "./field-changes";

export const dependencyHref = (source: TaskSource) => source.type === "TASK"
  ? `/tasks/${encodeURIComponent(source.id)}/dependencies`
  : `/tasks/concepts/${encodeURIComponent(source.id)}/dependencies`;
export const mainSource = (link: TaskerDependency): TaskSource => ({ type: link.mainType as TaskSource["type"], id: link.mainId });
export const requiredSource = (link: TaskerDependency): TaskSource => ({ type: link.requiredType as TaskSource["type"], id: link.requiredId });

export async function dependencySourceRecord(db: TaskDb, source: TaskSource) {
  if (source.type === "TASK") {
    const task = await db.taskerTask.findUnique({ where: { id: source.id }, include: {
      participants: true,
      project: { select: { ownerId: true, coOwners: true, executors: true } },
      flexibleProject: { select: { ownerId: true, collaborators: true } },
    } });
    if (!task || task.deletedAt) return null;
    const projectOwnerId = task.project?.ownerId ?? task.flexibleProject!.ownerId;
    const members = task.project ? [projectOwnerId, ...task.project.coOwners.map((p) => p.userId), ...task.project.executors.map((p) => p.userId)] : [projectOwnerId, ...task.flexibleProject!.collaborators.map((p) => p.userId)];
    return { source, title: task.title, projectId: task.projectId ?? task.flexibleProjectId!, projectType: task.projectId ? "STRUCTURED" as const : "FLEXIBLE" as const, projectOwnerId,
      managers: [task.ownerId, task.coOwnerId, projectOwnerId].filter((id): id is string => !!id), assigneeId: task.assigneeId,
      viewers: [...new Set([task.ownerId, task.assigneeId, task.coOwnerId, projectOwnerId, ...task.participants.map((p) => p.userId)])].filter((id): id is string => !!id && members.includes(id)),
      active: !["COMPLETED", "REJECTED", "CANCELLED"].includes(task.status), href: `/tasks/${task.id}` };
  }
  const concept = await db.projectConceptFolder.findUnique({ where: { id: source.id }, include: { taskerStage: true, project: { select: { ownerId: true, coOwners: true, executors: true } } } });
  if (!concept || !concept.assignedById || !concept.assignedExecutorId) return null;
  const members = [concept.project.ownerId, ...concept.project.coOwners.map((p) => p.userId), ...concept.project.executors.map((p) => p.userId)];
  return { source, title: concept.name, projectId: concept.projectId, projectType: "STRUCTURED" as const, projectOwnerId: concept.project.ownerId,
    managers: [concept.assignedById, concept.project.ownerId].filter((id): id is string => !!id), assigneeId: concept.assignedExecutorId,
    viewers: [...new Set([concept.assignedById, concept.assignedExecutorId, concept.project.ownerId])].filter((id): id is string => !!id && members.includes(id)),
    active: concept.taskerStage.status !== "COMPLETED", href: `/projects/${concept.projectId}/stages/${concept.workflowStageKey === "CONCEPT_CREATION" ? 3 : 4}/concepts/${concept.id}?returnTo=%2Ftasks` };
}

export async function dependencyState(db: TaskDb, source: TaskSource) {
  const rows = await db.taskerDependency.groupBy({ by: ["pauseStatus"], where: { mainType: source.type, mainId: source.id, resolvedAt: null }, _count: true });
  return { paused: rows.some((r) => r.pauseStatus === "APPROVED"), pendingPauses: rows.find((r) => r.pauseStatus === "REQUESTED")?._count ?? 0 };
}

export async function assertTaskNotPaused(db: TaskDb, source: TaskSource) {
  taskAssert(!(await dependencyState(db, source)).paused, "This task is paused for a dependency. Discussion and reference files remain available; submissions and completion resume when all blocking dependencies resolve.", 409);
}

// Native writes share the Tasker project lock, including the final transaction
// check. A pause approval and a submission/completion cannot pass each other.
export async function assertConceptNotPaused(db: TaskDb, projectId: string, source: { folderId?: string; stageId?: string }) {
  await lockTaskerProject(db, projectId);
  const concept = await db.projectConceptFolder.findFirst({ where: { projectId, ...(source.folderId ? { id: source.folderId } : { taskerStageId: source.stageId }) }, select: { id: true } });
  if (concept) await assertTaskNotPaused(db, { type: "CONCEPT", id: concept.id });
}

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
export async function recordDependencyEvent(db: TaskDb, link: TaskerDependency, actorId: string, action: string, note: string) {
  const entry = await db.taskerDependencyEvent.create({ data: { dependencyId: link.id, actorId, action, note } });
  for (const source of [mainSource(link), requiredSource(link)]) {
    const record = await dependencySourceRecord(db, source);
    if (!record) continue;
    // The task's own history is deliberately stage-neutral and contains no
    // linked-task title, brief, files or review notes from a restricted task.
    const message = `Dependency update: ${action.toLowerCase().replaceAll("_", " ")}. Open Dependencies for details.`;
    if (source.type === "TASK") {
      await db.taskerTask.update({ where: { id: source.id }, data: { version: { increment: 1 } } });
      await db.taskerEvent.create({ data: { taskId: source.id, actorId, action, note: message, detail: { dependencyId: link.id } } });
    } else {
      await db.projectComment.create({ data: { projectId: record.projectId, stageId: (await db.projectConceptFolder.findUniqueOrThrow({ where: { id: source.id }, select: { taskerStageId: true } })).taskerStageId, authorId: actorId, body: `<p>${escape(message)}</p>` } });
    }
    for (const userId of record.viewers.filter((id) => id !== actorId)) {
      const dedupeKey = `tasker-dependency:${entry.id}:${source.type}:${source.id}:${userId}`;
      const subject = `Task dependency updated: ${record.title}`;
      await db.notification.create({ data: { userId, type: "TASKER_UPDATED", entityType: "TASKER_TASK", entityId: source.id, title: subject, message, projectId: record.projectType === "STRUCTURED" ? record.projectId : null, url: dependencyHref(source), dedupeKey } });
      await db.taskerDelivery.create({ data: { ...(source.type === "TASK" ? { taskId: source.id } : { conceptId: source.id }), userId, dedupeKey, subject, message } });
    }
  }
}

export async function resolveTaskDependencies(db: TaskDb, source: TaskSource, actorId: string, outcome: "COMPLETED" | "REJECTED" | "CANCELLED" | "DELETED") {
  const links = await db.taskerDependency.findMany({ where: { requiredType: source.type, requiredId: source.id, resolvedAt: null } });
  for (const link of links) {
    const updated = await db.taskerDependency.update({ where: { id: link.id }, data: { resolvedAt: new Date(), outcome, version: { increment: 1 } } });
    await recordDependencyEvent(db, updated, actorId, "DEPENDENCY_RESOLVED", `Dependency ${outcome.toLowerCase()}.${outcome !== "COMPLETED" ? " The requested requirement may still be unmet." : ""}`);
    if (link.pauseStatus === "APPROVED" && !(await dependencyState(db, mainSource(link))).paused) {
      await recordDependencyEvent(db, updated, actorId, "TASK_RESUMED", "All approved blocking dependencies have resolved. The task has resumed in its existing state.");
    }
  }
  // Ending a main task does not cancel its independent requests or leave a
  // pending pause approval behind. The relationship and all history remain.
  const outgoing = await db.taskerDependency.findMany({ where: { mainType: source.type, mainId: source.id, resolvedAt: null } });
  for (const link of outgoing) {
    const updated = await db.taskerDependency.update({ where: { id: link.id }, data: { resolvedAt: new Date(), outcome: "MAIN_ENDED", version: { increment: 1 } } });
    await recordDependencyEvent(db, updated, actorId, "MAIN_TASK_ENDED", "The main task ended. Its dependency request can continue independently.");
  }
}
