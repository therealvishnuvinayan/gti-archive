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
import { availableTaskType, deliverablesEnabled, TaskerError, actions, contextTarget, deadline, ensure, expectedVersion, id, ids, object, priority, statuses, taskEnabled, text, type TaskAction, type TaskDetail, type TaskSummary } from "./contracts";

import { conceptCreationCapabilities, conceptManager, conceptSourceChoices, resolveTaskReference, saveTaskReference, submissionState, taskReferences } from "./concepts";
import { conceptsEnabled, enabledTaskTypes, isConceptType, isDeliverable } from "./contracts";
import { authorizedTarget, targetChoices, proposedValue, recheckTarget } from "./targets";
import { prepareApplication, applyApplication, completeApplication } from "./applications";

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
  ensure(availableTaskType(row.type), "TASK_TYPE_UNAVAILABLE");
  const p = row.project ?? row.flexibleProject!;
  return { id: row.id, title: row.title, type: row.type as TaskSummary["type"], brief: row.brief, context: row.context, priority: row.priority,
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
      tx.universalTask.findMany({ where: { deletedAt: null, type: { in: enabledTaskTypes() }, OR: [{ ownerId: grant.actorUserId }, { executorId: grant.actorUserId }] }, select: { id: true, title: true }, orderBy: { updatedAt: "desc" } }),
    ]);
    // Names/roles only. No account administration, legacy labels or email export.
    const people = await tx.user.findMany({ where: { authorization: { accountStatus: "ACTIVE", businessRole: { not: null } } },
      select: { ...person, authorization: { select: { businessRole: true } } }, orderBy: { name: "asc" } });
    const projectIds = target ? [ (await projectFor(tx, contextTarget(target))).projectId ].filter((v): v is string => !!v) : structured.map(p => p.id);
    const targets = deliverablesEnabled() ? await targetChoices(tx, grant.actorUserId, projectIds) : [];
    const conceptContexts = target ? [await projectFor(tx, contextTarget(target))] : [
      ...structured.map(p => ({ projectId: p.id, flexibleProjectId: null })), ...flexible.map(p => ({ projectId: null, flexibleProjectId: p.id }))];
    const conceptSources = conceptsEnabled() ? await conceptSourceChoices(tx, grant.actorUserId, conceptContexts) : [];
    return { conceptSources, canCreateConcepts: conceptsEnabled() && conceptManager(actor.businessRole), targets, actorId: grant.actorUserId, people: people.map(p => ({ id: p.id, name: p.name, role: p.authorization!.businessRole })), contexts: [
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
    const where: Prisma.UniversalTaskWhereInput = { deletedAt: null, type: { in: enabledTaskTypes() }, status: v.status as typeof statuses[number] | undefined, ownerId, executorId,
      AND: [project, ...(actor.businessRole === "DIRECTOR" && ctx ? [] : [relationWhere(grant.actorUserId)]),
        ...(search ? [{ OR: [{ title: { contains: search, mode: "insensitive" as const } }, { brief: { contains: search, mode: "insensitive" as const } }] }] : [])] };
    const [rows, total] = await Promise.all([tx.universalTask.findMany({ where, include: relations, orderBy: [{ deadline: "asc" }, { id: "asc" }], skip: offset, take: 60 }), tx.universalTask.count({ where })]);
    return { tasks: rows.map(summary), total };
  });
}
export async function createTask(raw: unknown) {
  enabled(); const v = object(raw, ["commandId", "contextTarget", "type", "title", "brief", "context", "deadline", "priority", "executorId", "spectatorIds", "destination", "inputMode", "sourceVersionId", "inspirationVersionIds"]);
  ensure(typeof v.type === "string" && availableTaskType(v.type), "TASK_TYPE_UNAVAILABLE");
  const commandId = id(v.commandId), target = contextTarget(v.contextTarget);
  const fields = { title: text(v.title, 200), brief: text(v.brief, 20000), context: text(v.context, 5000, true) || null,
    deadline: deadline(v.deadline), priority: priority(v.priority), executorId: id(v.executorId) };
  const spectators = ids(v.spectatorIds), commandHash = hash(v);
  const taskType = v.type as TaskSummary["type"], newType = isDeliverable(taskType);
  return runtimeAuthorization.runAuthorized({ capability: taskType === "FILE_UPLOAD" ? "task.createFileUpload" : taskType === "DATA_INPUT" ? "task.createDataInput" : isConceptType(taskType) ? conceptCreationCapabilities[taskType as keyof typeof conceptCreationCapabilities] : "task.createGeneral", targetId: newType ? text(v.destination, 160) : target.target }, async (tx, grant) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${grant.actorUserId + ":" + commandId}, 0))`;
    const old = await replay(tx, grant, commandId, commandHash); if (old) return { id: old.taskId, version: old.version, replayed: true };
    await eligible(tx, grant.actorUserId, fields.executorId, spectators);
    const destination = newType ? await authorizedTarget(tx, grant.actorUserId, v.destination) : null;
    if (destination) {
      ensure(target.kind === "structured" && destination.projectId === target.key, "CROSS_PROJECT_TARGET", 403);
      ensure(destination.modes.includes(text(v.inputMode, 20)), "UNSUPPORTED_INPUT_MODE");
    }
    const task = await tx.universalTask.create({ data: { type: taskType, ...fields, ...await projectFor(tx, target), ownerId: grant.actorUserId,
      spectators: { create: spectators.map(userId => ({ userId })) } } });
    if (destination) await tx.universalTaskTarget.create({ data: { taskId: task.id, kind: destination.kind, nativeId: destination.nativeId,
      inputMode: text(v.inputMode, 20), label: destination.label, identity: destination.identity, identityHash: hash(destination.identity),
      expectedState: destination.state, expectedHash: hash(destination.state) } });
    ensure(v.sourceVersionId === undefined || taskType === "INSPECT_FILE", "UNSUPPORTED_SOURCE");
    ensure(v.inspirationVersionIds === undefined || taskType === "FINAL_CONCEPT", "UNSUPPORTED_SOURCE");
    const sourceIds = taskType === "INSPECT_FILE" && v.sourceVersionId !== undefined ? [id(v.sourceVersionId)] : ids(v.inspirationVersionIds);
    const sources = [];
    for (const versionId of sourceIds) sources.push(await resolveTaskReference(tx, grant.actorUserId, task, versionId));
    const created = await record(tx, task, grant, commandId, commandHash, "CREATED", fields.brief,
      { ...(isConceptType(task.type) ? { referenceVersionIds: sourceIds } : {}), title: fields.title, deadline: fields.deadline.toISOString(), priority: fields.priority, executorId: fields.executorId, spectatorIds: spectators, context: fields.context });
    for (const source of sources) await saveTaskReference(tx, task.id, created.id, source);
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
    const sensitive = task.type === "GENERAL" || director || owner || executor;
    let deliverable: TaskDetail["deliverable"];
    if (isDeliverable(task.type)) {
      const target = await tx.universalTaskTarget.findUniqueOrThrow({ where: { taskId } });
      const application = sensitive ? await tx.universalTaskApplication.findFirst({ where: { taskId }, orderBy: { createdAt: "desc" }, include: { publications: true } }) : null;
      deliverable = { label: target.label, inputMode: target.inputMode, fieldType: (target.identity as { fieldType?: string }).fieldType, publishedAttachmentIds: sensitive ? application?.publications.flatMap(p => p.attachmentId ? [p.attachmentId] : []) ?? [] : [],
        ...(sensitive ? { applicationState: application?.state, errorCode: application?.errorCode } : {}) };
      if (active && (director || owner) && task.type === "DATA_INPUT") {
        try { const checked = await recheckTarget(tx, task, grant.actorUserId, false); deliverable.expectedState = target.expectedState;
          deliverable.currentState = checked.current.state; deliverable.conflict = hash(checked.current.state) !== target.expectedHash; }
        catch (error) { if (!(error instanceof TaskerError)) throw error; deliverable.errorCode = error.code; }
      }
    }
    const references = isConceptType(task.type) && sensitive ? await taskReferences(tx, task) : undefined;
    const submissions = ["INITIAL_CONCEPT", "FINAL_CONCEPT"].includes(task.type) && sensitive ? entries.filter(e => e.action === "SUBMIT").map(e => {
      const result = submissionState(e, entries); return { id: e.id, state: result.state, reviewer: result.review ? entries.find(r => r.id === result.review!.id)!.actor : null };
    }) : undefined;
    const sourceReady = task.type !== "INSPECT_FILE" || !!references?.length;
    return { ...summary(task), deliverable, references, submissions, entries: (sensitive ? entries : []).map(e => ({ id: e.id, version: e.version, action: e.action, text: e.text,
      actor: e.actor, directorOverride: e.directorOverride, createdAt: e.createdAt.toISOString(), snapshot: task.type !== "GENERAL" && !director && !owner && e.action === "REFRESH_TARGET" ? {} : e.snapshot })),
      files: (sensitive ? uploads : []).map(u => ({ id: u.id, fileId: u.version.fileId, versionId: u.versionId, number: u.version.number,
        name: u.version.originalFileName, size: u.version.fileSize, status: u.version.status, uploadedById: u.uploadedById, submittedEntryId: u.submittedEntryId })),
      permissions: { uploadSource: task.type === "INSPECT_FILE" && working && owner && !sourceReady, manage: working && (director || owner), message: active && (director || owner || executor), submit: working && sourceReady && (director || executor),
        requestCompletion: working && sourceReady && (director || executor), review: active && task.status === "COMPLETION_REQUESTED" && (director || owner) && !executor && pendingRequest?.actorId !== grant.actorUserId,
        close: active && (director || owner), delete: !task.deletedAt && (director || owner) } };
  });
}
const capability: { [K in TaskAction]: string } = { EDIT: "task.manage", MESSAGE: "task.message", SUBMIT: "task.execute", REQUEST_COMPLETION: "task.requestCompletion",
  APPROVE: "task.review", REJECT: "task.review", CLOSE: "task.complete", DELETE: "task.delete", PREPARE_UPLOAD: "task.message", FINALIZE_UPLOAD: "task.message", REFRESH_TARGET: "task.manage", SET_SOURCE: "task.manage" };
export async function mutateTask(taskId: string, raw: unknown) {
  enabled(); id(taskId);
  const v = object(raw, ["commandId", "expectedVersion", "action", "text", "fileIds", "title", "brief", "context", "deadline", "priority", "executorId", "spectatorIds", "uploadId", "fileName", "mimeType", "fileSize", "replaceFileId", "proposedText", "sourceVersionId"]);
  ensure(actions.includes(v.action as TaskAction), "INVALID_ACTION"); const action = v.action as TaskAction;
  const commandId = id(v.commandId), commandHash = hash({ taskId, ...v });
  let version = expectedVersion(v.expectedVersion);
  const note = text(v.text, action === "MESSAGE" || action === "SUBMIT" ? 20000 : 2000, action === "EDIT" || action.endsWith("UPLOAD"));
  let applicationId: string | undefined;
  if (action === "APPROVE" && deliverablesEnabled()) {
    const prepared = await runtimeAuthorization.runAuthorized({ capability: "task.review", targetId: taskId, reason: note }, async (tx, grant) => {
      const task = await tx.universalTask.findUniqueOrThrow({ where: { id: taskId } });
      if (!isDeliverable(task.type) || await replay(tx, grant, commandId, commandHash, taskId)) return null;
      ensure(task.version === version, "STALE_TASK_VERSION", 409);
      const result = await prepareApplication(tx, task, grant.actorUserId);
      if (!result.created) return { version: task.version, id: result.application.id };
      const updated = await tx.universalTask.update({ where: { id: taskId }, data: { version: { increment: 1 } } });
      await record(tx, updated, grant, `prepare_${result.application.id}`, hash({ applicationId: result.application.id }), "PREPARE_APPLICATION", note, { applicationId: result.application.id });
      return { version: updated.version, id: result.application.id };
    });
    if (prepared) { version = prepared.version; applicationId = prepared.id; }
  }
  try { return await runtimeAuthorization.runAuthorized({ capability: capability[action], targetId: taskId, reason: note.slice(0, 2000) }, async (tx, grant) => {
    const previous = await replay(tx, grant, commandId, commandHash, taskId);
    if (previous) return { id: taskId, version: previous.version, replayed: true, entryId: previous.id };
    const task = await tx.universalTask.findUniqueOrThrow({ where: { id: taskId }, include: { spectators: true } });
    ensure(!task.deletedAt, "TASK_DELETED", 409); ensure(task.version === version, "STALE_TASK_VERSION", 409);
    const active = !["COMPLETED", "CLOSED"].includes(task.status);
    ensure(active || action === "DELETE", "TASK_TERMINAL", 409);
    let source: Awaited<ReturnType<typeof resolveTaskReference>> | undefined;
    let applied: Awaited<ReturnType<typeof applyApplication>> | undefined;
    const data: Prisma.UniversalTaskUncheckedUpdateInput = { version: { increment: 1 } };
    let snapshot: Prisma.InputJsonObject = {}, files: string[] = [], uploadId: string | undefined, newSpectators: string[] | null = null;
    if (["EDIT", "SUBMIT", "REQUEST_COMPLETION", "PREPARE_UPLOAD", "FINALIZE_UPLOAD", "SET_SOURCE"].includes(action)) ensure(task.status !== "COMPLETION_REQUESTED", "REVIEW_PENDING", 409);
    if (task.type === "INSPECT_FILE" && ["SUBMIT", "REQUEST_COMPLETION"].includes(action)) ensure(await tx.universalTaskReference.count({ where: { taskId, kind: "INSPECTION" } }) === 1, "INSPECTION_SOURCE_REQUIRED", 409);
    if (action === "SET_SOURCE") {
      ensure(conceptsEnabled() && task.type === "INSPECT_FILE", "UNSUPPORTED_SOURCE");
      ensure(await tx.universalTaskReference.count({ where: { taskId } }) === 0, "SOURCE_ALREADY_PINNED", 409);
      source = await resolveTaskReference(tx, grant.actorUserId, task, id(v.sourceVersionId));
      snapshot = { referenceVersionIds: [source.version.id] };
    } else if (action === "EDIT") {
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
      if (action === "SUBMIT") {
        data.status = "IN_PROGRESS";
        if (isDeliverable(task.type)) {
          const target = await tx.universalTaskTarget.findUniqueOrThrow({ where: { taskId } });
          snapshot = { ...snapshot, proposedValue: proposedValue(target, v.proposedText, uploads.length), targetHash: target.expectedHash };
        }
      }
    } else if (action === "REQUEST_COMPLETION") {
      data.status = "COMPLETION_REQUESTED";
      snapshot = { submissionIds: (await tx.universalTaskEntry.findMany({ where: { taskId, action: "SUBMIT" }, select: { id: true } })).map(e => e.id),
        fileVersionIds: (await tx.universalTaskUpload.findMany({ where: { taskId, submittedEntryId: { not: null } }, select: { versionId: true } })).map(u => u.versionId) };
      if (task.type !== "GENERAL") {
        const last = await tx.universalTaskEntry.findFirst({ where: { taskId, action: "SUBMIT" }, orderBy: { version: "desc" } });
        const invalidator = await tx.universalTaskEntry.findFirst({ where: { taskId, action: { in: ["REJECT", "REFRESH_TARGET", "EDIT"] } }, orderBy: { version: "desc" } });
        ensure(last && (!invalidator || last.version > invalidator.version), "FRESH_SUBMISSION_REQUIRED", 409);
        snapshot = { ...(last.snapshot as Prisma.InputJsonObject), submissionIds: [last.id] };
      }
      snapshot = { ...snapshot, evidenceHash: approvalHash(snapshot) };
    } else if (action === "APPROVE" || action === "REJECT") {
      ensure(task.status === "COMPLETION_REQUESTED", "NO_COMPLETION_REQUEST", 409);
      const request = await tx.universalTaskEntry.findFirstOrThrow({ where: { taskId, action: "REQUEST_COMPLETION" }, orderBy: { version: "desc" } });
      ensure(request.actorId !== grant.actorUserId, "SELF_REVIEW_DENIED", 403);
      data.status = action === "APPROVE" ? "COMPLETED" : "IN_PROGRESS";
      snapshot = { requestId: request.id, evidence: request.snapshot };
      if (action === "APPROVE" && isDeliverable(task.type)) {
        applied = await applyApplication(tx, task, grant.actorUserId, note);
        snapshot = { ...snapshot, applicationId: applied.application.id };
      }
    } else if (action === "REFRESH_TARGET") {
      ensure(task.type === "DATA_INPUT", "UNSUPPORTED_TARGET");
      const checked = await recheckTarget(tx, task, grant.actorUserId, false);
      snapshot = { before: checked.stored.expectedState, refreshed: checked.current.state };
      await tx.universalTaskTarget.update({ where: { taskId }, data: { expectedState: checked.current.state, expectedHash: hash(checked.current.state) } });
      data.status = "IN_PROGRESS";
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
    if (source) await saveTaskReference(tx, taskId, entry.id, source);
    if (applied) await completeApplication(tx, applied, updated, entry);
    if (files.length) await tx.universalTaskUpload.updateMany({ where: { id: { in: files } }, data: { submittedEntryId: entry.id } });
    if (Array.isArray(snapshot.fileVersionIds)) for (const versionId of snapshot.fileVersionIds) {
      if (typeof versionId === "string") await tx.sharedFileProvenance.create({ data: { versionId, taskEntryId: entry.id } });
    }
    return { id: taskId, version: updated.version, replayed: false, entryId: entry.id, ...(uploadId ? { uploadId } : {}) };
  }, { timeout: 30000 });
  } catch (error) {
    if (applicationId) {
      // Failure recording is best effort after rollback; an interrupted/revoked
      // session leaves the committed PREPARED intent available for reconciliation.
      await runtimeAuthorization.runAuthorized({ capability: "task.review", targetId: taskId, reason: note }, async (tx, grant) => {
        const task = await tx.universalTask.findUniqueOrThrow({ where: { id: taskId } });
        const app = await tx.universalTaskApplication.findUniqueOrThrow({ where: { id: applicationId } });
        if (app.state === "APPLIED" || task.status !== "COMPLETION_REQUESTED" || task.deletedAt) return;
        const code = error instanceof TaskerError ? error.code : "PUBLICATION_FAILED";
        await tx.universalTaskApplication.update({ where: { id: app.id }, data: { state: "FAILED", errorCode: code } });
        const updated = await tx.universalTask.update({ where: { id: taskId }, data: { version: { increment: 1 } } });
        await record(tx, updated, grant, randomUUID(), hash({ app: app.id, version: updated.version, code }), "APPLICATION_FAILED", "Acceptance failed; review and explicitly retry.", { applicationId: app.id, errorCode: code });
      }).catch(() => undefined);
    }
    throw error;
  }
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
    tx.universalTask.count({ where: { type: { in: enabledTaskTypes() }, deletedAt: null, ...relationWhere(grant.actorUserId) } }));
}

export async function downloadTaskReference(taskId: string, referenceId: string, versionId: string) {
  enabled(); ensure(conceptsEnabled(), "TASK_TYPE_UNAVAILABLE", 404); id(taskId); id(referenceId); id(versionId);
  return runtimeAuthorization.runAuthorized({ capability: "task.download", targetId: taskId }, async tx => {
    const task = await tx.universalTask.findUniqueOrThrow({ where: { id: taskId } });
    ensure(isConceptType(task.type), "SOURCE_UNAVAILABLE", 403);
    const available = await taskReferences(tx, task);
    ensure(available.some(r => r.id === referenceId && r.versionId === versionId), "SOURCE_UNAVAILABLE", 403);
    const fv = await tx.sharedFileVersion.findUniqueOrThrow({ where: { id: versionId } });
    ensure(fv.status === "READY" && fv.objectETag && (fv.applicationSealed || fv.objectVersionId), "SOURCE_UNAVAILABLE", 403);
    const result = await readPinnedStoredObject({ bucket: fv.bucket, storageKey: fv.storageKey, objectVersionId: fv.objectVersionId, objectETag: fv.objectETag, checksumSha256: fv.checksumSha256 });
    try {
      const observed = captureFileIntegrity(result, fv);
      ensure(result.Body && observed.objectETag === fv.objectETag && (!fv.objectVersionId || observed.objectVersionId === fv.objectVersionId) && (!fv.checksumSha256 || observed.checksumSha256 === fv.checksumSha256), "FILE_CHANGED", 409);
      return { body: result.Body, name: fv.originalFileName, mimeType: fv.mimeType, size: fv.fileSize };
    } catch (error) { if (result.Body && "destroy" in result.Body) result.Body.destroy(); throw error; }
  });
}
