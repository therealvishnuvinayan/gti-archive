import { randomUUID } from "node:crypto";
import { readTaskFile, taskFileReaders, type TaskFileAccessMode } from "./file-access";
import { Prisma, type TaskerFamily, type TaskerTask } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { canUseTasks, hasProjectPermission, isGlobalProjectAdministrator, type PermissionUser } from "@/lib/permissions/resolver";
import { createPresignedDownloadUrl, copyStoredObject, getObjectMetadata } from "@/lib/storage/s3";
import { assertTaskParticipant, getTaskProjectAdapter, type ProjectTaskContext, type TaskDb } from "./adapters";
import { taskAssert } from "./errors";
import { lockTaskerProject } from "./field-changes";
import { conceptTaskAccessWhere, listConceptTasks, listItem, loadTaskForUser, taskAccessWhere, taskInclude, taskTransaction } from "./service";
import type { TaskFamilyDetail, TaskFamilyFile, TaskFamilyMutation, TaskSource } from "./types";

export function taskFamilyHref(source: TaskSource) {
  return source.type === "CONCEPT" ? `/tasks/concepts/${encodeURIComponent(source.id)}/revisions` : `/tasks/${encodeURIComponent(source.id)}/revisions`;
}

function validateSource(source: TaskSource) {
  taskAssert(source && ["TASK", "CONCEPT"].includes(source.type) && typeof source.id === "string" && source.id.length > 0 && source.id.length <= 200, "Choose an available original task.");
}

async function resolveFamily(db: TaskDb, user: PermissionUser, source: TaskSource) {
  validateSource(source);
  taskAssert(canUseTasks(user), "Tasker access is not enabled.", 403);
  if (source.type === "TASK") {
    const { task, context } = await loadTaskForUser(db, user, source.id);
    const family = task.parentFamilyId
      ? await db.taskerFamily.findUniqueOrThrow({ where: { id: task.parentFamilyId } })
      : await db.taskerFamily.findUnique({ where: { originalTaskId: task.id } });
    return { family, context, original: { type: "TASK", id: task.id } as TaskSource };
  }
  const concept = await db.projectConceptFolder.findFirst({ where: { id: source.id, ...conceptTaskAccessWhere(user) } });
  taskAssert(concept, "Task not found or no longer available.", 404);
  const context = await getTaskProjectAdapter("STRUCTURED").load(db, concept.projectId);
  assertTaskParticipant(context, user.id);
  return { family: await db.taskerFamily.findUnique({ where: { originalConceptId: concept.id } }), context, original: source };
}

async function ensureFamily(db: TaskDb, resolved: Awaited<ReturnType<typeof resolveFamily>>) {
  return resolved.family ?? db.taskerFamily.create({ data: {
    ...(resolved.context.projectType === "STRUCTURED" ? { projectId: resolved.context.projectId } : { flexibleProjectId: resolved.context.projectId }),
    ...(resolved.original.type === "TASK" ? { originalTaskId: resolved.original.id } : { originalConceptId: resolved.original.id }),
  } });
}

async function hasIssuedWorkflow(db: TaskDb, context: ProjectTaskContext) {
  if (context.projectType !== "STRUCTURED") return false;
  return Boolean(await db.projectProductionUnit.count({ where: { projectId: context.projectId, OR: [
    { approvedAt: { not: null } }, { handedOverAt: { not: null } },
    { approvalSteps: { some: { status: "APPROVED" } } }, { handover: { isNot: null } },
  ] } }));
}

const membersWhere = (family: TaskerFamily): Prisma.TaskerTaskWhereInput => ({ OR: [
  { parentFamilyId: family.id }, ...(family.originalTaskId ? [{ id: family.originalTaskId }] : []),
] });

// Family notifications use each recipient's own accessible task as the link.
// Neither the subject nor the message reveals a sibling's title, brief or files.
async function notifyFamily(db: TaskDb, family: TaskerFamily, context: ProjectTaskContext, actorId: string, eventId: string) {
  const tasks = await db.taskerTask.findMany({ where: { ...membersWhere(family), deletedAt: null }, include: { participants: true } });
  const recipients = new Map<string, TaskSource>();
  if (family.originalConceptId) {
    const concept = await db.projectConceptFolder.findUniqueOrThrow({ where: { id: family.originalConceptId } });
    for (const id of [context.ownerId, concept.assignedById, concept.assignedExecutorId]) if (id) recipients.set(id, { type: "CONCEPT", id: concept.id });
  }
  for (const task of tasks) {
    for (const id of [context.ownerId, task.ownerId, task.assigneeId, task.coOwnerId, ...task.participants.map((p) => p.userId)]) {
      if (id) recipients.set(id, { type: "TASK", id: task.id });
    }
  }
  for (const [userId, source] of recipients) {
    if (userId === actorId || !context.people.some((p) => p.id === userId)) continue;
    const dedupeKey = `tasker-family:${eventId}:${userId}`;
    const subject = "Task revisions updated";
    const message = `Task revisions in ${context.name} have been updated. Open the task to see the details available to you.`;
    await db.notification.create({ data: { userId, type: "TASKER_UPDATED", entityType: "TASKER_TASK", entityId: source.id, projectId: context.projectType === "STRUCTURED" ? context.projectId : null, title: subject, message, url: taskFamilyHref(source), dedupeKey } });
    await db.taskerDelivery.create({ data: { userId, ...(source.type === "TASK" ? { taskId: source.id } : { conceptId: source.id }), subject, message, dedupeKey } });
  }
}

async function familyEvent(db: TaskDb, user: PermissionUser, family: TaskerFamily, context: ProjectTaskContext, source: TaskSource, action: string, note: string, data: Prisma.TaskerFamilyUpdateInput = {}, fileKey?: string) {
  const updated = await db.taskerFamily.update({ where: { id: family.id }, data: { ...data, version: { increment: 1 } } });
  const entry = await db.taskerFamilyEvent.create({ data: { familyId: family.id, actorId: user.id, sourceType: source.type, sourceId: source.id, action, note, fileKey, version: updated.version } });
  await notifyFamily(db, updated, context, user.id, entry.id);
  return updated;
}

export async function prepareSisterTask(db: TaskDb, user: PermissionUser, source: TaskSource, context: ProjectTaskContext) {
  const resolved = await resolveFamily(db, user, source);
  taskAssert(resolved.context.projectId === context.projectId && resolved.context.projectType === context.projectType, "A Sister Task must belong to the original project.");
  const family = await ensureFamily(db, resolved);
  return { family, number: family.nextSisterNumber };
}

export async function recordSisterTask(db: TaskDb, user: PermissionUser, task: TaskerTask, family: TaskerFamily, context: ProjectTaskContext) {
  await familyEvent(db, user, family, context, { type: "TASK", id: task.id }, "SISTER_CREATED", `Sister Task ${task.sisterNumber} created.`, {
    nextSisterNumber: { increment: 1 }, ...(await hasIssuedWorkflow(db, context) ? { cycleDecision: "PENDING" } : {}),
  });
}

async function importDestinations(db: TaskDb, context: ProjectTaskContext, user: PermissionUser) {
  if (context.ownerId !== user.id && !context.coOwnerIds.includes(user.id)) return [];
  const destinations = context.destinations.map((d) => ({ id: `folder:${d.id}`, label: d.label }));
  if (context.projectType === "STRUCTURED") {
    const stage = await db.projectWorkflowStage.findUnique({ where: { projectId_stageKey: { projectId: context.projectId, stageKey: "FINAL_LAYOUT" } }, select: { status: true } });
    if (stage?.status === "AVAILABLE" && isGlobalProjectAdministrator(user) && hasProjectPermission(user, { ownerId: context.ownerId, coOwners: context.coOwnerIds.map((userId) => ({ userId })) }, "file.uploadAttachment")) destinations.unshift({ id: "stage:5", label: "Stage 5 · New final-layout file and checklist" });
  }
  return destinations;
}

function importHref(context: ProjectTaskContext, destinationId: string) {
  if (context.projectType === "FLEXIBLE") return context.referenceFolders?.find((f) => `folder:${f.id}` === destinationId)?.href ?? null;
  return destinationId === "stage:5" ? `/projects/${context.projectId}/stages/5` : context.referenceFolders?.find((f) => `folder:${f.id}` === destinationId)?.href ?? null;
}

async function familyDetail(db: TaskDb, user: PermissionUser, source: TaskSource): Promise<TaskFamilyDetail> {
  const { family, context, original: sourceOriginal } = await resolveFamily(db, user, source);
  const originalSource: TaskSource = family
    ? family.originalTaskId ? { type: "TASK", id: family.originalTaskId } : { type: "CONCEPT", id: family.originalConceptId ?? "" }
    : sourceOriginal;
  const tasks = await db.taskerTask.findMany({ where: { AND: [taskAccessWhere(user), family ? membersWhere(family) : { id: originalSource.type === "TASK" ? originalSource.id : "" }] }, include: taskInclude, orderBy: { sisterNumber: "asc" } });
  // The same access predicate as the Tasks page is applied to the native original.
  const concepts = originalSource.type === "CONCEPT" ? await listConceptTasks(user, context.projectId, db) : [];
  const concept = concepts.find((t) => t.id === originalSource.id);
  const original = originalSource.type === "TASK" ? tasks.find((t) => t.id === originalSource.id) : null;
  const records = await db.taskerFile.findMany({ where: { taskId: { in: tasks.map((t) => t.id) }, status: "READY", submissionId: { not: null } }, include: { submission: { select: { createdAt: true } } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  const reviews = await db.taskerEvent.findMany({ where: { taskId: { in: tasks.map((t) => t.id) }, action: "ACCEPT" }, select: { taskId: true, detail: true } });
  const accepted = new Set(reviews.flatMap((review) => {
    const detail = review.detail as { submissionId?: unknown } | null;
    return typeof detail?.submissionId === "string" ? [`${review.taskId}:${detail.submissionId}`] : [];
  }));
  const files: TaskFamilyFile[] = records.map((file) => {
    const task = tasks.find((t) => t.id === file.taskId)!;
    return { key: `TASK:${file.id}`, name: file.originalFileName, mimeType: file.mimeType, size: file.fileSize, source: { type: "TASK", id: task.id }, taskTitle: task.title, revisionLabel: task.sisterNumber ? `Sister Task ${task.sisterNumber}` : "Parent task", submittedAt: file.submission!.createdAt.toISOString(), canSelect: accepted.has(`${task.id}:${file.submissionId}`) };
  });
  if (concept) {
    const native = await db.projectConceptFolder.findUniqueOrThrow({ where: { id: concept.id }, select: { taskerStageId: true } });
    const attachments = await db.projectAttachment.findMany({ where: { projectId: context.projectId, stageId: native.taskerStageId, revisionId: { not: null }, commentId: null, status: "READY", assetType: { in: ["REVISION_ORIGINAL", "STAGE_SUBMISSION"] } }, include: { revision: { select: { revisionNumber: true, status: true } } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
    files.push(...attachments.map((file) => ({ key: `CONCEPT:${file.id}`, name: file.originalFileName, mimeType: file.mimeType, size: file.fileSize, source: originalSource, taskTitle: concept.title, revisionLabel: `Parent task · submission ${file.revision!.revisionNumber}`, submittedAt: file.createdAt.toISOString(), canSelect: file.revision?.status === "APPROVED" })));
  }
  const visible = new Set(tasks.map((t) => `TASK:${t.id}`));
  if (concept) visible.add(`CONCEPT:${concept.id}`);
  const events = family ? await db.taskerFamilyEvent.findMany({ where: { familyId: family.id }, include: { actor: { select: { id: true, name: true, email: true } } }, orderBy: { version: "desc" } }) : [];
  const imported = family ? await db.taskerFileImport.findMany({ where: { familyId: family.id }, orderBy: { createdAt: "desc" } }) : [];
  return {
    importDestinations: await importDestinations(db, context, user),
    imports: imported.filter((i) => files.some((f) => f.key === i.fileKey)).map((i) => ({ id: i.id, fileName: i.sourceName, sourceLabel: i.sourceLabel, destinationLabel: i.destinationLabel, importedBy: i.importedByLabel, createdAt: i.createdAt.toISOString(), href: importHref(context, i.destinationId) })),
    source, project: { projectId: context.projectId, projectType: context.projectType, name: context.name }, version: family?.version ?? 0,
    original: original ? listItem(original, user.id) : concept ?? null,
    children: tasks.filter((t) => t.id !== family?.originalTaskId && t.id !== (originalSource.type === "TASK" ? originalSource.id : "")).map((t) => listItem(t, user.id)),
    files, finalFile: files.find((f) => f.key === family?.finalFileKey) ?? null,
    canSelectFinal: context.ownerId === user.id || context.coOwnerIds.includes(user.id),
    canDecideCycle: context.ownerId === user.id && Boolean(family?.cycleDecision),
    cycleDecision: context.ownerId === user.id || context.coOwnerIds.includes(user.id) ? family?.cycleDecision as TaskFamilyDetail["cycleDecision"] ?? null : null,
    history: events.filter((e) => visible.has(`${e.sourceType}:${e.sourceId}`)).map((e) => ({ id: e.id, action: e.action, note: e.note, actor: { id: e.actor.id, label: e.actor.name || e.actor.email }, createdAt: e.createdAt.toISOString(), fileName: files.find((f) => f.key === e.fileKey)?.name ?? null })),
  };
}

export async function getTaskFamily(user: PermissionUser, source: TaskSource) {
  // A consistent view also avoids rendering a stale final-file choice with a new version.
  return prisma.$transaction((db) => familyDetail(db, user, source), { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 30000 });
}

export const familyImportStorage = { copy: copyStoredObject, metadata: getObjectMetadata };
export async function mutateTaskFamily(user: PermissionUser, source: TaskSource, input: TaskFamilyMutation, store = familyImportStorage) {
  taskAssert(Number.isSafeInteger(input.version) && input.version >= 0, "Refresh the task revisions before continuing.", 409);
  taskAssert(typeof (input.note ?? "") === "string" && (input.note?.length ?? 0) <= 20000, "Enter a note up to 20000 characters.");
  let prepared: { id: string; key: string; file: Awaited<ReturnType<typeof loadTaskFamilyFile>> } | undefined;
  if (input.action === "IMPORT_FINAL") {
    const view = await getTaskFamily(user, source);
    taskAssert(view.canSelectFinal, "Only the project owner or project co-owner can import final files.", 403);
    taskAssert(view.version === input.version, "Refresh the task revisions before importing.", 409);
    taskAssert(view.finalFile && view.finalFile.key === input.fileKey && view.finalFile.canSelect, "Select an accepted final file first.", 409);
    taskAssert(view.importDestinations.some((d) => d.id === input.destinationId), "Choose an available destination.", 409);
    const file = await loadTaskFamilyFile(user, source, input.fileKey!);
    const id = randomUUID(), key = `tasker/imports/${id}`;
    await store.copy({ sourceBucket: file.bucket, sourceKey: file.storageKey, bucket: file.bucket, storageKey: key });
    const metadata = await store.metadata(key, file.bucket);
    taskAssert(metadata.ContentLength === file.fileSize && metadata.ContentType === file.mimeType, "The imported file failed verification.", 409);
    prepared = { id, key, file };
  }
  return taskTransaction(async (db) => {
    const initial = await resolveFamily(db, user, source);
    await lockTaskerProject(db, initial.context.projectId);
    const resolved = await resolveFamily(db, user, source), { context } = resolved;
    const view = await familyDetail(db, user, source);
    taskAssert(view.version === input.version, "The task revisions changed. Refresh and review the latest choice.", 409);
    const family = await ensureFamily(db, resolved);
    if (input.action === "SELECT_FINAL") {
      taskAssert(view.canSelectFinal, "Only the project owner or project co-owner can select the final file.", 403);
      const file = view.files.find((f) => f.key === input.fileKey);
      taskAssert(file, "Choose a submitted file available to you in this task family.", 404);
      taskAssert(file.canSelect, "The submission must be accepted or approved before it can be selected as the final file.", 409);
      taskAssert(family.finalFileKey !== file.key, "This is already the selected final file.", 409);
      await familyEvent(db, user, family, context, file.source, "FINAL_FILE_SELECTED", input.note?.trim() ?? "", { finalFileKey: file.key, ...(await hasIssuedWorkflow(db, context) ? { cycleDecision: "PENDING" } : {}) }, file.key);
    } else if (input.action === "IMPORT_FINAL") {
      taskAssert(view.canSelectFinal && prepared, "You cannot import this file.", 403);
      const file = view.finalFile, destination = view.importDestinations.find((d) => d.id === input.destinationId);
      taskAssert(file && file.key === input.fileKey && file.canSelect && destination, "The selected file or destination changed. Refresh and try again.", 409);
      const { id, key, file: stored } = prepared;
      await db.taskerFileImport.create({ data: { id, familyId: family.id, fileKey: file.key, sourceType: file.source.type, sourceId: file.source.id, sourceName: file.name, sourceLabel: file.revisionLabel, sourceSubmissionId: "submissionId" in stored ? stored.submissionId : stored.revisionId, destinationId: destination.id, destinationLabel: destination.label, destinationAttachmentId: id, importedById: user.id, importedByLabel: context.people.find((p) => p.id === user.id)!.label } });
      const common = { id, taskerImportId: id, projectId: context.projectId, uploadedById: user.id, fileName: file.name, originalFileName: file.name, mimeType: stored.mimeType, fileSize: stored.fileSize, bucket: stored.bucket, storageKey: key, status: "READY" as const };
      if (context.projectType === "FLEXIBLE") {
        await db.flexibleProjectAttachment.create({ data: { ...common, milestoneId: destination.id.slice(7) } });
      } else {
        await db.projectAttachment.create({ data: { ...common, assetType: destination.id === "stage:5" ? "GENERAL_PROJECT_ASSET" : "PROJECT_RESEARCH_FILE" } });
        if (destination.id === "stage:5") {
          await db.projectStageFileHandoff.create({ data: { projectId: context.projectId, sourceAttachmentId: id, sourceWorkflowStageKey: "FINAL_LAYOUT", targetWorkflowStageKey: "FINAL_LAYOUT", handedOffById: user.id, checklist: { create: { projectId: context.projectId, sourceAttachmentId: id } } } });
        } else {
          await db.projectResearchFolderFile.create({ data: { folderId: destination.id.slice(7), attachmentId: id, addedById: user.id } });
        }
      }
      await familyEvent(db, user, family, context, file.source, "FINAL_FILE_IMPORTED", `Imported ${file.name} (${file.revisionLabel}) into ${destination.label}.`, {}, file.key);
    } else if (input.action === "DECIDE_CYCLE") {
      taskAssert(view.canDecideCycle, "Only the project owner can decide whether another approval or handover cycle is needed.", 403);
      taskAssert(input.decision === "REQUIRED" || input.decision === "NOT_REQUIRED", "Choose whether another cycle is required.");
      taskAssert(input.note?.trim(), "Record the reason for this decision.");
      await familyEvent(db, user, family, context, source, input.decision === "REQUIRED" ? "ANOTHER_CYCLE_REQUIRED" : "ANOTHER_CYCLE_NOT_REQUIRED", input.note!.trim(), { cycleDecision: input.decision });
    } else taskAssert(false, "Unknown revision action.");
    return { familyId: family.id };
  });
}

export async function taskFamilyFileDownload(user: PermissionUser, source: TaskSource, key: string, download = createPresignedDownloadUrl) {
  const file = await loadTaskFamilyFile(user, source, key);
  return download({ bucket: file.bucket, storageKey: file.storageKey, fileName: file.originalFileName, expiresInSeconds: 60 });
}

export async function loadTaskFamilyFile(user: PermissionUser, source: TaskSource, key: string) {
  const view = await getTaskFamily(user, source);
  const choice = view.files.find((f) => f.key === key);
  taskAssert(choice, "File not found or no longer available.", 404);
  const id = key.slice(key.indexOf(":") + 1);
  const file = choice.source.type === "TASK" ? await prisma.taskerFile.findUnique({ where: { id } }) : await prisma.projectAttachment.findUnique({ where: { id } });
  taskAssert(file?.status === "READY", "File no longer available.", 404);
  return file;
}

export async function taskFamilyFileAccess(user: PermissionUser, source: TaskSource, key: string, mode: TaskFileAccessMode, readers = taskFileReaders) {
  return readTaskFile(await loadTaskFamilyFile(user, source, key), mode, readers);
}
