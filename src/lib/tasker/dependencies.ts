import type { TaskerDependency } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { canUseTasks, type PermissionUser } from "@/lib/permissions/resolver";
import type { TaskDb } from "./adapters";
import { TaskerError, taskAssert } from "./errors";
import { lockTaskerProject } from "./field-changes";
import { conceptTaskAccessWhere, listConceptTasks, taskAccessWhere, taskTransaction } from "./service";
import { dependencySourceRecord, dependencyState, mainSource, requiredSource, recordDependencyEvent } from "./dependency-runtime";
import type { TaskDependencyDetail, TaskDependencyMutation, TaskProjectRef, TaskSource } from "./types";

function validSource(source: TaskSource) {
  taskAssert(source && ["TASK", "CONCEPT"].includes(source.type) && typeof source.id === "string" && source.id.length > 0 && source.id.length <= 200, "Choose an available task.");
}
async function loadSource(db: TaskDb, user: PermissionUser, source: TaskSource) {
  validSource(source);
  taskAssert(canUseTasks(user), "Tasker access is not enabled.", 403);
  const accessible = source.type === "TASK"
    ? await db.taskerTask.count({ where: { id: source.id, ...taskAccessWhere(user) } })
    : await db.projectConceptFolder.count({ where: { id: source.id, ...conceptTaskAccessWhere(user) } });
  const record = accessible ? await dependencySourceRecord(db, source) : null;
  taskAssert(record && record.viewers.includes(user.id), "Task not found or no longer available.", 404);
  return record;
}
const canCreate = (record: NonNullable<Awaited<ReturnType<typeof dependencySourceRecord>>>, userId: string) => record.active && (record.assigneeId === userId || record.managers.includes(userId));
function reason(value: unknown, required = true) {
  taskAssert(typeof value === "string" && value.length <= 20000 && (!required || value.trim()), "Explain the dependency or pause decision (up to 20000 characters).");
  return value.trim();
}
const projectWhere = (ref: TaskProjectRef) => ref.projectType === "STRUCTURED" ? { projectId: ref.projectId } : { flexibleProjectId: ref.projectId };
const key = (source: TaskSource) => `${source.type}:${source.id}`;

// Called by Create Task in the same transaction as the new task and outbox.
export async function linkTaskDependency(db: TaskDb, user: PermissionUser, source: TaskSource, required: TaskSource, requestPause: boolean, note: string) {
  taskAssert(typeof requestPause === "boolean", "Choose whether to request a pause.");
  const why = reason(note);
  const main = await loadSource(db, user, source);
  taskAssert(canCreate(main, user.id), "Only the task owner, co-owner, recipient or project owner can add a dependency to an active task.", 403);
  const prerequisite = await loadSource(db, user, required);
  taskAssert(main.projectId === prerequisite.projectId && main.projectType === prerequisite.projectType, "Dependencies must belong to the same project.");
  taskAssert(key(source) !== key(required), "A task cannot depend on itself.");
  taskAssert(prerequisite.active, "Choose an active task as the dependency.", 409);
  taskAssert(!await db.taskerDependency.count({ where: { mainType: source.type, mainId: source.id, requiredType: required.type, requiredId: required.id } }), "These tasks already have a dependency link.", 409);
  const edges = await db.taskerDependency.findMany({ where: { ...projectWhere(main), resolvedAt: null }, select: { mainType: true, mainId: true, requiredType: true, requiredId: true } });
  const next = new Map<string, string[]>();
  for (const edge of edges) {
    const from = `${edge.mainType}:${edge.mainId}`;
    next.set(from, [...next.get(from) ?? [], `${edge.requiredType}:${edge.requiredId}`]);
  }
  const pending = [key(required)], visited = new Set<string>();
  while (pending.length) {
    const node = pending.pop()!;
    taskAssert(node !== key(source), "This dependency would create a cycle.", 409);
    if (visited.has(node)) continue;
    visited.add(node); pending.push(...next.get(node) ?? []);
  }
  const link = await db.taskerDependency.create({ data: { ...projectWhere(main), mainType: source.type, mainId: source.id, requiredType: required.type, requiredId: required.id, requestedById: user.id, reason: why, pauseStatus: requestPause ? "REQUESTED" : "NONE" } });
  await recordDependencyEvent(db, link, user.id, "DEPENDENCY_CREATED", why);
  if (requestPause) await recordDependencyEvent(db, link, user.id, "PAUSE_REQUESTED", "The main task continues until the project owner approves the pause.");
  return link.id;
}

export async function mutateTaskDependency(user: PermissionUser, source: TaskSource, input: TaskDependencyMutation) {
  return taskTransaction(async (db) => {
    const initial = await loadSource(db, user, source);
    await lockTaskerProject(db, initial.projectId);
    const main = await loadSource(db, user, source);
    if (input.action === "LINK") return { id: await linkTaskDependency(db, user, source, input.required, input.requestPause, input.reason) };
    taskAssert(["REQUEST_PAUSE", "APPROVE_PAUSE", "REJECT_PAUSE"].includes(input.action), "Unknown dependency action.");
    taskAssert(Number.isSafeInteger(input.version) && input.version > 0 && typeof input.dependencyId === "string", "Refresh the dependency before continuing.", 409);
    const link = await db.taskerDependency.findFirst({ where: { id: input.dependencyId, mainType: source.type, mainId: source.id } });
    taskAssert(link && !link.resolvedAt && link.version === input.version && main.active, "This dependency changed or resolved. Refresh before continuing.", 409);
    const prerequisite = await dependencySourceRecord(db, requiredSource(link));
    taskAssert(prerequisite?.active, "The dependency is no longer active. Refresh before continuing.", 409);
    const note = reason(input.note, input.action !== "APPROVE_PAUSE");
    let updated: TaskerDependency;
    if (input.action === "REQUEST_PAUSE") {
      taskAssert(canCreate(main, user.id), "You cannot request a pause for this task.", 403);
      taskAssert(["NONE", "REJECTED"].includes(link.pauseStatus), "A pause is already requested or approved.", 409);
      updated = await db.taskerDependency.update({ where: { id: link.id }, data: { pauseStatus: "REQUESTED", requestedById: user.id, reason: note, reviewNote: null, reviewedById: null, reviewedAt: null, version: { increment: 1 } } });
    } else {
      taskAssert(main.projectOwnerId === user.id, "Only the project owner can approve or reject a pause.", 403);
      taskAssert(link.pauseStatus === "REQUESTED", "There is no pause request awaiting a decision.", 409);
      updated = await db.taskerDependency.update({ where: { id: link.id }, data: { pauseStatus: input.action === "APPROVE_PAUSE" ? "APPROVED" : "REJECTED", reviewedById: user.id, reviewedAt: new Date(), reviewNote: note, version: { increment: 1 } } });
    }
    await recordDependencyEvent(db, updated, user.id, input.action === "REQUEST_PAUSE" ? "PAUSE_REQUESTED" : input.action === "APPROVE_PAUSE" ? "PAUSE_APPROVED" : "PAUSE_REJECTED", note || "The project owner approved the pause.");
    return { id: link.id };
  });
}

export async function getTaskDependencies(user: PermissionUser, source: TaskSource): Promise<TaskDependencyDetail> {
  return prisma.$transaction(async (db) => {
    const main = await loadSource(db, user, source);
    const state = await dependencyState(db, source);
    const links = await db.taskerDependency.findMany({ where: { OR: [{ mainType: source.type, mainId: source.id }, { requiredType: source.type, requiredId: source.id }] }, include: { events: { include: { actor: { select: { name: true, email: true } } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] } }, orderBy: { createdAt: "desc" } });
    const mapped = await Promise.all(links.map(async (link) => {
      const direction = link.mainType === source.type && link.mainId === source.id ? "REQUIRES" as const : "REQUIRED_BY" as const;
      let related = null;
      try { related = await loadSource(db, user, direction === "REQUIRES" ? requiredSource(link) : mainSource(link)); }
      catch (e) { if (!(e instanceof TaskerError && [403, 404].includes(e.status))) throw e; }
      const showNotes = direction === "REQUIRES" || !!related;
      return { id: link.id, version: link.version, direction, relatedTask: related ? { title: related.title, href: related.href } : null,
        pauseStatus: link.pauseStatus, reason: showNotes ? link.reason : "", reviewNote: showNotes ? link.reviewNote : null, outcome: link.outcome,
        canRequestPause: direction === "REQUIRES" && canCreate(main, user.id) && !link.resolvedAt && ["NONE", "REJECTED"].includes(link.pauseStatus),
        canReviewPause: direction === "REQUIRES" && main.active && main.projectOwnerId === user.id && !link.resolvedAt && link.pauseStatus === "REQUESTED",
        history: showNotes ? link.events.map((e) => ({ id: e.id, action: e.action, note: e.note, actor: e.actor.name || e.actor.email, createdAt: e.createdAt.toISOString() })) : [] };
    }));
    const tasks = canCreate(main, user.id) ? await db.taskerTask.findMany({ where: { ...taskAccessWhere(user), ...projectWhere(main), status: { notIn: ["COMPLETED", "REJECTED", "CANCELLED"] } }, select: { id: true, title: true }, orderBy: { updatedAt: "desc" } }) : [];
    const concepts = canCreate(main, user.id) && main.projectType === "STRUCTURED" ? await listConceptTasks(user, main.projectId, db) : [];
    const availableTasks = [...tasks.map((t) => ({ source: { type: "TASK" as const, id: t.id }, title: t.title })), ...concepts.filter((t) => t.status !== "COMPLETED").map((t) => ({ source: { type: "CONCEPT" as const, id: t.id }, title: t.title }))].filter((t) => key(t.source) !== key(source) && !links.some((link) => link.mainType === source.type && link.mainId === source.id && link.requiredType === t.source.type && link.requiredId === t.source.id));
    return { source, project: { projectType: main.projectType, projectId: main.projectId }, title: main.title, href: main.href, ...state, canCreate: canCreate(main, user.id), links: mapped, availableTasks };
  }, { isolationLevel: "RepeatableRead", timeout: 30000 });
}
