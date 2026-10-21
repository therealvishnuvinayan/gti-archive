import "server-only";
import { randomUUID } from "node:crypto";
import type { Prisma, UniversalTask } from "@prisma/client";
import { approvalHash } from "../approvals/contracts";
import { runtimeAuthorization } from "../authorization/runtime";
import type { AuthorizationDecision } from "../authorization/policy";
import { structuredProjectReadWhere, flexibleProjectReadWhere } from "../authorization/project-read-rules";
import { readCurrentSessionToken } from "../auth";
import { resolveAuthenticatedSession } from "../authorization/session";
import { captureFileIntegrity } from "../files/contracts";
import { copyStoredObject, createPresignedUploadUrl, getObjectMetadata, getS3BucketName, readPinnedStoredObject } from "@/lib/storage/s3";
import { actions, contextTarget, deadline, ensure, expectedVersion, id, ids, object, priority, statuses, taskEnabled, text, type TaskAction, type TaskDetail, type TaskSummary } from "./contracts";

type Tx = Prisma.TransactionClient;
type Grant = Extract<AuthorizationDecision, { decision: "ALLOW" }>;
const person = { id: true, name: true } as const;
const relations = { owner: { select: person }, executor: { select: person }, spectators: { include: { user: { select: person } } },
  project: { select: { id: true, name: true } }, flexibleProject: { select: { id: true, name: true } } } as const;
type Record = Prisma.UniversalTaskGetPayload<{ include: typeof relations }>;
const relationWhere = (actorId: string): Prisma.UniversalTaskWhereInput => ({ OR: [{ ownerId: actorId }, { executorId: actorId }, { spectators: { some: { userId: actorId } } }] });
function enabled() { ensure(taskEnabled(), "TASKER_DISABLED", 404); }
const hash = approvalHash;
function summary(row: Record): TaskSummary {
  ensure(row.type === "GENERAL", "TASK_TYPE_UNAVAILABLE");
  const p = row.project ?? row.flexibleProject!;
  return { id: row.id, title: row.title, type: "GENERAL", brief: row.brief, context: row.context, priority: row.priority,
    deadline: row.deadline.toISOString(), status: row.status, version: row.version, owner: row.owner, executor: row.executor,
    spectators: row.spectators.map(s => s.user), project: { ...p, kind: row.project ? "structured" : "flexible" },
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), deletedAt: row.deletedAt?.toISOString() ?? null };
}
async function principal(tx: Tx) {
  const session = await resolveAuthenticatedSession(tx, await readCurrentSessionToken());
  ensure(session?.principal.businessRole, "ACCESS_DENIED", 403); return session.principal;
}
async function eligible(tx: Tx, ownerId: string, executorId: string, spectators: string[]) {
  ensure(executorId !== ownerId, "DISTINCT_EXECUTOR_REQUIRED");
  ensure(!spectators.includes(ownerId) && !spectators.includes(executorId), "SPECTATORS_MUST_BE_VIEW_ONLY");
  const all = [...new Set([ownerId, executorId, ...spectators])];
  const count = await tx.userAuthorization.count({ where: { userId: { in: all }, accountStatus: "ACTIVE", businessRole: { not: null } } });
  ensure(count === all.length, "ACTIVE_BUSINESS_PARTICIPANTS_REQUIRED");
}
async function replay(tx: Tx, grant: Grant, commandId: string, commandHash: string, taskId?: string) {
  const entry = await tx.universalTaskEntry.findUnique({ where: { actorId_commandId: { actorId: grant.actorUserId, commandId } } });
  if (entry) ensure(entry.commandHash === commandHash && (!taskId || entry.taskId === taskId), "COMMAND_REUSED", 409);
  return entry;
}
async function record(tx: Tx, task: UniversalTask, grant: Grant, commandId: string, commandHash: string, action: string, note: string, snapshot: Prisma.InputJsonValue = {}) {
  const actor = await tx.userAuthorization.findUniqueOrThrow({ where: { userId: grant.actorUserId } });
  return tx.universalTaskEntry.create({ data: { taskId: task.id, version: task.version, commandId, commandHash, action, text: note, snapshot,
    actorId: grant.actorUserId, actorRole: actor.businessRole!, actorVersion: actor.authorizationVersion, directorOverride: grant.directorOverride } });
}
async function projectFor(tx: Tx, target: ReturnType<typeof contextTarget>) {
  if (target.kind === "task") {
    const source = await tx.universalTask.findUniqueOrThrow({ where: { id: target.key } });
    return { projectId: source.projectId, flexibleProjectId: source.flexibleProjectId };
  }
  return { projectId: target.kind === "structured" ? target.key : null, flexibleProjectId: target.kind === "flexible" ? target.key : null };
}
export async function taskOptions(target?: string) {
  enabled();
  if (target) contextTarget(target);
  return runtimeAuthorization.runAuthorized({ capability: target ? "task.createGeneral" : "task.list", targetId: target ?? "root" }, async (tx, grant) => {
    const actor = await principal(tx);
    const [structured, flexible, assigned] = target ? [[], [], []] : await Promise.all([
      tx.project.findMany({ where: structuredProjectReadWhere(actor), select: { id: true, name: true }, orderBy: { name: "asc" } }),
      tx.flexibleProject.findMany({ where: flexibleProjectReadWhere(actor), select: { id: true, name: true }, orderBy: { name: "asc" } }),
      tx.universalTask.findMany({ where: { deletedAt: null, type: "GENERAL", OR: [{ ownerId: grant.actorUserId }, { executorId: grant.actorUserId }] }, select: { id: true, title: true }, orderBy: { updatedAt: "desc" } }),
    ]);
    // Names/roles only. No account administration, legacy labels or email export.
    const people = await tx.user.findMany({ where: { authorization: { accountStatus: "ACTIVE", businessRole: { not: null } } },
      select: { ...person, authorization: { select: { businessRole: true } } }, orderBy: { name: "asc" } });
    return { actorId: grant.actorUserId, people: people.map(p => ({ id: p.id, name: p.name, role: p.authorization!.businessRole })), contexts: [
      ...structured.map(p => ({ target: `structured:${p.id}`, name: p.name })),
      ...flexible.map(p => ({ target: `flexible:${p.id}`, name: p.name })),
      ...assigned.map(t => ({ target: `task:${t.id}`, name: `Task context: ${t.title}` })),
    ] };
  });
}
export async function listTasks(raw: unknown = {}) {
  enabled(); const v = object(raw, ["context", "status", "ownerId", "executorId", "search", "offset"]);
  const ctx = v.context === undefined ? null : contextTarget(v.context);
  if (v.status !== undefined) ensure(statuses.includes(v.status as typeof statuses[number]), "INVALID_STATUS");
  const ownerId = v.ownerId === undefined ? undefined : id(v.ownerId), executorId = v.executorId === undefined ? undefined : id(v.executorId);
  const search = text(v.search, 120, true), offset = v.offset === undefined ? 0 : Number(v.offset);
  ensure(Number.isSafeInteger(offset) && offset >= 0 && offset <= 100000, "INVALID_OFFSET");
  return runtimeAuthorization.runAuthorized({ capability: "task.list", targetId: "root" }, async (tx, grant) => {
    const actor = await principal(tx);
    let project: Prisma.UniversalTaskWhereInput = {};
    if (ctx) {
      if (ctx.kind === "task") throw new Error("Use a project context for task lists");
      project = ctx.kind === "structured" ? { projectId: ctx.key } : { flexibleProjectId: ctx.key };
    }
    const where: Prisma.UniversalTaskWhereInput = { deletedAt: null, type: "GENERAL", status: v.status as typeof statuses[number] | undefined, ownerId, executorId,
      AND: [project, ...(actor.businessRole === "DIRECTOR" && ctx ? [] : [relationWhere(grant.actorUserId)]),
        ...(search ? [{ OR: [{ title: { contains: search, mode: "insensitive" as const } }, { brief: { contains: search, mode: "insensitive" as const } }] }] : [])] };
    const [rows, total] = await Promise.all([tx.universalTask.findMany({ where, include: relations, orderBy: [{ deadline: "asc" }, { id: "asc" }], skip: offset, take: 60 }), tx.universalTask.count({ where })]);
    return { tasks: rows.map(summary), total };
  });
}
export async function createTask(raw: unknown) {
  enabled(); const v = object(raw, ["commandId", "contextTarget", "type", "title", "brief", "context", "deadline", "priority", "executorId", "spectatorIds"]);
  ensure(v.type === "GENERAL", "TASK_TYPE_UNAVAILABLE");
  const commandId = id(v.commandId), target = contextTarget(v.contextTarget);
  const fields = { title: text(v.title, 200), brief: text(v.brief, 20000), context: text(v.context, 5000, true) || null,
    deadline: deadline(v.deadline), priority: priority(v.priority), executorId: id(v.executorId) };
  const spectators = ids(v.spectatorIds), commandHash = hash(v);
  return runtimeAuthorization.runAuthorized({ capability: "task.createGeneral", targetId: target.target }, async (tx, grant) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${grant.actorUserId + ":" + commandId}, 0))`;
    const old = await replay(tx, grant, commandId, commandHash); if (old) return { id: old.taskId, version: old.version, replayed: true };
    await eligible(tx, grant.actorUserId, fields.executorId, spectators);
    const task = await tx.universalTask.create({ data: { ...fields, ...await projectFor(tx, target), ownerId: grant.actorUserId,
      spectators: { create: spectators.map(userId => ({ userId })) } } });
    await record(tx, task, grant, commandId, commandHash, "CREATED", fields.brief,
      { title: fields.title, deadline: fields.deadline.toISOString(), priority: fields.priority, executorId: fields.executorId, spectatorIds: spectators, context: fields.context });
    return { id: task.id, version: task.version, replayed: false };
  });
}
export async function getTask(taskId: string): Promise<TaskDetail> {
  enabled(); id(taskId);
  return runtimeAuthorization.runAuthorized({ capability: "task.view", targetId: taskId }, async (tx, grant) => {
    const task = await tx.universalTask.findUniqueOrThrow({ where: { id: taskId }, include: relations });
    const actor = await principal(tx), director = actor.businessRole === "DIRECTOR", owner = task.ownerId === grant.actorUserId, executor = task.executorId === grant.actorUserId;
    const active = !task.deletedAt && !["COMPLETED", "CLOSED"].includes(task.status), working = active && task.status !== "COMPLETION_REQUESTED";
    const entries = await tx.universalTaskEntry.findMany({ where: { taskId }, include: { actor: { select: person } }, orderBy: { version: "asc" } });
    const pendingRequest = [...entries].reverse().find(e => e.action === "REQUEST_COMPLETION");
    const uploads = await tx.universalTaskUpload.findMany({ where: { taskId, OR: [{ submittedEntryId: { not: null } }, { uploadedById: grant.actorUserId }] }, include: { version: true }, orderBy: { createdAt: "asc" } });
    return { ...summary(task), entries: entries.map(e => ({ id: e.id, version: e.version, action: e.action, text: e.text,
      actor: e.actor, directorOverride: e.directorOverride, createdAt: e.createdAt.toISOString(), snapshot: e.snapshot })),
      files: uploads.map(u => ({ id: u.id, fileId: u.version.fileId, versionId: u.versionId, number: u.version.number,
        name: u.version.originalFileName, size: u.version.fileSize, status: u.version.status, uploadedById: u.uploadedById, submittedEntryId: u.submittedEntryId })),
      permissions: { manage: working && (director || owner), message: active && (director || owner || executor), submit: working && (director || executor),
        requestCompletion: working && (director || executor), review: active && task.status === "COMPLETION_REQUESTED" && (director || owner) && !executor && pendingRequest?.actorId !== grant.actorUserId,
        close: active && (director || owner), delete: !task.deletedAt && (director || owner) } };
  });
}
const capability: { [K in TaskAction]: string } = { EDIT: "task.manage", MESSAGE: "task.message", SUBMIT: "task.execute", REQUEST_COMPLETION: "task.requestCompletion",
  APPROVE: "task.review", REJECT: "task.review", CLOSE: "task.complete", DELETE: "task.delete", PREPARE_UPLOAD: "task.message", FINALIZE_UPLOAD: "task.message" };
export async function mutateTask(taskId: string, raw: unknown) {
  enabled(); id(taskId);
  const v = object(raw, ["commandId", "expectedVersion", "action", "text", "fileIds", "title", "brief", "context", "deadline", "priority", "executorId", "spectatorIds", "uploadId", "fileName", "mimeType", "fileSize", "replaceFileId"]);
  ensure(actions.includes(v.action as TaskAction), "INVALID_ACTION"); const action = v.action as TaskAction;
  const commandId = id(v.commandId), version = expectedVersion(v.expectedVersion), commandHash = hash({ taskId, ...v });
  const note = text(v.text, action === "MESSAGE" || action === "SUBMIT" ? 20000 : 2000, action === "EDIT" || action.endsWith("UPLOAD"));
  return runtimeAuthorization.runAuthorized({ capability: capability[action], targetId: taskId, reason: note.slice(0, 2000) }, async (tx, grant) => {
    const previous = await replay(tx, grant, commandId, commandHash, taskId);
    if (previous) return { id: taskId, version: previous.version, replayed: true, entryId: previous.id };
    const task = await tx.universalTask.findUniqueOrThrow({ where: { id: taskId }, include: { spectators: true } });
    ensure(!task.deletedAt, "TASK_DELETED", 409); ensure(task.version === version, "STALE_TASK_VERSION", 409);
    const active = !["COMPLETED", "CLOSED"].includes(task.status);
    ensure(active || action === "DELETE", "TASK_TERMINAL", 409);
    const data: Prisma.UniversalTaskUncheckedUpdateInput = { version: { increment: 1 } };
    let snapshot: Prisma.InputJsonObject = {}, files: string[] = [], uploadId: string | undefined, newSpectators: string[] | null = null;
    if (["EDIT", "SUBMIT", "REQUEST_COMPLETION", "PREPARE_UPLOAD", "FINALIZE_UPLOAD"].includes(action)) ensure(task.status !== "COMPLETION_REQUESTED", "REVIEW_PENDING", 409);
    if (action === "EDIT") {
      data.title = text(v.title, 200); data.brief = text(v.brief, 20000); data.context = text(v.context, 5000, true) || null;
      data.deadline = deadline(v.deadline); data.priority = priority(v.priority); data.executorId = id(v.executorId);
      const spectators = ids(v.spectatorIds); await eligible(tx, task.ownerId, data.executorId, spectators);
      await tx.universalTaskSpectator.deleteMany({ where: { taskId } });
      newSpectators = spectators;
      snapshot = { title: data.title, brief: data.brief, context: data.context, deadline: data.deadline.toISOString(), priority: data.priority, executorId: data.executorId, spectatorIds: spectators };
    } else if (action === "SUBMIT" || action === "MESSAGE") {
      files = ids(v.fileIds);
      ensure(task.status !== "COMPLETION_REQUESTED" || files.length === 0, "REVIEW_PENDING", 409);
      const uploads = await tx.universalTaskUpload.findMany({ where: { id: { in: files }, taskId, uploadedById: grant.actorUserId, submittedEntryId: null, version: { status: "READY" } } });
      ensure(uploads.length === files.length, "INVALID_SUBMISSION_FILES");
      snapshot = { fileVersionIds: uploads.map(u => u.versionId) };
      if (action === "SUBMIT") data.status = "IN_PROGRESS";
    } else if (action === "REQUEST_COMPLETION") {
      data.status = "COMPLETION_REQUESTED";
      snapshot = { submissionIds: (await tx.universalTaskEntry.findMany({ where: { taskId, action: "SUBMIT" }, select: { id: true } })).map(e => e.id),
        fileVersionIds: (await tx.universalTaskUpload.findMany({ where: { taskId, submittedEntryId: { not: null } }, select: { versionId: true } })).map(u => u.versionId) };
      snapshot = { ...snapshot, evidenceHash: approvalHash(snapshot) };
    } else if (action === "APPROVE" || action === "REJECT") {
      ensure(task.status === "COMPLETION_REQUESTED", "NO_COMPLETION_REQUEST", 409);
      const request = await tx.universalTaskEntry.findFirstOrThrow({ where: { taskId, action: "REQUEST_COMPLETION" }, orderBy: { version: "desc" } });
      ensure(request.actorId !== grant.actorUserId, "SELF_REVIEW_DENIED", 403);
      data.status = action === "APPROVE" ? "COMPLETED" : "IN_PROGRESS";
      snapshot = { requestId: request.id, evidence: request.snapshot };
    } else if (action === "CLOSE") data.status = "CLOSED";
    else if (action === "DELETE") data.deletedAt = new Date();
    else if (action === "PREPARE_UPLOAD") {
      const fileName = text(v.fileName, 240), mimeType = text(v.mimeType, 120), fileSize = Number(v.fileSize);
      ensure(Number.isSafeInteger(fileSize) && fileSize > 0 && fileSize <= 100 * 1024 * 1024, "INVALID_FILE_SIZE");
      ensure(/^[\w.+-]+\/[\w.+-]+$/.test(mimeType), "INVALID_MIME_TYPE");
      const replacing = v.replaceFileId === undefined ? null : await tx.sharedFile.findFirst({ where: { id: id(v.replaceFileId), taskId } });
      ensure(v.replaceFileId === undefined || replacing, "INVALID_REPLACEMENT");
      const file = replacing ?? await tx.sharedFile.create({ data: { taskId, projectId: task.projectId, flexibleProjectId: task.flexibleProjectId } });
      const last = await tx.sharedFileVersion.aggregate({ where: { fileId: file.id }, _max: { number: true } });
      uploadId = randomUUID(); const bucket = getS3BucketName(), prefix = `universal-tasks/${taskId}/${uploadId}`;
      const fv = await tx.sharedFileVersion.create({ data: { fileId: file.id, number: (last._max.number ?? 0) + 1, uploadedById: grant.actorUserId,
        originalFileName: fileName, mimeType, fileSize, bucket, storageKey: `${prefix}/evidence`, applicationSealed: true } });
      await tx.universalTaskUpload.create({ data: { id: uploadId, taskId, versionId: fv.id, uploadedById: grant.actorUserId,
        stagingKey: `${prefix}/upload`, expiresAt: new Date(Date.now() + 600000) } });
      await tx.sharedFileReference.create({ data: { versionId: fv.id, role: "SOURCE", taskUploadId: uploadId } });
      snapshot = { uploadId, fileVersionIds: [fv.id] };
    } else if (action === "FINALIZE_UPLOAD") {
      uploadId = id(v.uploadId);
      const upload = await tx.universalTaskUpload.findFirst({ where: { id: uploadId, taskId, uploadedById: grant.actorUserId, submittedEntryId: null }, include: { version: true } });
      ensure(upload && upload.expiresAt > new Date() && upload.version.status === "UPLOADING", "UPLOAD_UNAVAILABLE", 409);
      const fv = upload.version;
      // The task row is locked before any storage operation. Conditional copy
      // seals exact observed bytes; no presigned ticket ever addresses evidence.
      const observed = captureFileIntegrity(await getObjectMetadata(upload.stagingKey, fv.bucket), fv);
      await copyStoredObject({ sourceBucket: fv.bucket, sourceKey: upload.stagingKey, bucket: fv.bucket, storageKey: fv.storageKey, sourceETag: observed.objectETag });
      const sealed = captureFileIntegrity(await getObjectMetadata(fv.storageKey, fv.bucket), fv);
      ensure(sealed.objectETag === observed.objectETag, "FILE_CHANGED", 409);
      await tx.sharedFileVersion.update({ where: { id: fv.id }, data: { status: "READY", ...sealed, observedAt: new Date(), finalizedAt: new Date() } });
      snapshot = { uploadId, fileVersionIds: [fv.id] };
    }
    const updated = await tx.universalTask.update({ where: { id: taskId, version }, data });
    if (newSpectators) await tx.universalTaskSpectator.createMany({ data: newSpectators.map(userId => ({ taskId, userId })) });
    const entry = await record(tx, updated, grant, commandId, commandHash, action, note, snapshot);
    if (files.length) await tx.universalTaskUpload.updateMany({ where: { id: { in: files } }, data: { submittedEntryId: entry.id } });
    if (Array.isArray(snapshot.fileVersionIds)) for (const versionId of snapshot.fileVersionIds) {
      if (typeof versionId === "string") await tx.sharedFileProvenance.create({ data: { versionId, taskEntryId: entry.id } });
    }
    return { id: taskId, version: updated.version, replayed: false, entryId: entry.id, ...(uploadId ? { uploadId } : {}) };
  }, { timeout: 30000 });
}
export async function uploadTicket(taskId: string, uploadId: string) {
  enabled(); id(taskId); id(uploadId);
  return runtimeAuthorization.runAuthorized({ capability: "task.message", targetId: taskId }, async (tx, grant) => {
    const upload = await tx.universalTaskUpload.findFirst({ where: { id: uploadId, taskId, uploadedById: grant.actorUserId, version: { status: "UPLOADING" }, task: { deletedAt: null, status: { in: ["OPEN", "IN_PROGRESS"] } } }, include: { version: true } });
    ensure(upload && upload.expiresAt > new Date(), "UPLOAD_UNAVAILABLE", 409);
    return { uploadUrl: await createPresignedUploadUrl({ bucket: upload.version.bucket, storageKey: upload.stagingKey, mimeType: upload.version.mimeType,
      expiresInSeconds: Math.max(1, Math.floor((upload.expiresAt.getTime() - Date.now()) / 1000)) }) };
  });
}
export async function downloadTaskFile(taskId: string, uploadId: string, versionId: string) {
  enabled(); id(taskId); id(uploadId); id(versionId);
  return runtimeAuthorization.runAuthorized({ capability: "task.download", targetId: taskId }, async (tx, grant) => {
    const upload = await tx.universalTaskUpload.findFirst({ where: { id: uploadId, taskId, versionId, OR: [{ submittedEntryId: { not: null } }, { uploadedById: grant.actorUserId }] }, include: { version: true } });
    ensure(upload?.version.status === "READY" && upload.version.objectETag, "FILE_UNAVAILABLE", 403);
    const fv = upload.version;
    const result = await readPinnedStoredObject({ bucket: fv.bucket, storageKey: fv.storageKey, objectVersionId: fv.objectVersionId, objectETag: fv.objectETag!, checksumSha256: fv.checksumSha256 });
    try {
      const observed = captureFileIntegrity(result, fv);
      ensure(result.Body && observed.objectETag === fv.objectETag && (!fv.objectVersionId || observed.objectVersionId === fv.objectVersionId) && (!fv.checksumSha256 || observed.checksumSha256 === fv.checksumSha256), "FILE_CHANGED", 409);
      return { body: result.Body, name: fv.originalFileName, mimeType: fv.mimeType, size: fv.fileSize };
    } catch (error) { if (result.Body && "destroy" in result.Body) result.Body.destroy(); throw error; }
  });
}

export async function countMyGeneralTasks() {
  if (!taskEnabled()) return 0;
  return runtimeAuthorization.runAuthorized({ capability: "task.list", targetId: "root" }, (tx, grant) =>
    tx.universalTask.count({ where: { type: "GENERAL", deletedAt: null, ...relationWhere(grant.actorUserId) } }));
}
