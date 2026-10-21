import "server-only";
import type { Prisma, UniversalTask, UniversalTaskEntry } from "@prisma/client";
import { conceptsEnabled, ensure, id, TaskerError, type ConceptSourceChoice, type TaskReference } from "./contracts";
import { authorizedTarget } from "./targets";

type Tx = Prisma.TransactionClient;
type Context = Pick<UniversalTask, "projectId" | "flexibleProjectId">;
const person = { id: true, name: true } as const;
export const conceptCreationCapabilities = { INSPECT_FILE: "task.createInspectFile", INITIAL_CONCEPT: "task.createInitialConcept", FINAL_CONCEPT: "task.createFinalConcept" } as const;
export function conceptManager(role: string | null) { return ["DIRECTOR", "SENIOR_PROJECT_MANAGER", "JUNIOR_PROJECT_MANAGER"].includes(role ?? ""); }
export function submissionState(entry: UniversalTaskEntry, entries: UniversalTaskEntry[]) {
  const review = entries.find(e => ["APPROVE", "REJECT"].includes(e.action) &&
    ((e.snapshot as { evidence?: { submissionIds?: string[] } }).evidence?.submissionIds ?? []).includes(entry.id));
  const invalidated = entries.some(e => e.version > entry.version && ["SUBMIT", "EDIT", "CLOSE"].includes(e.action));
  return { state: review?.action === "APPROVE" ? "APPROVED" : review?.action === "REJECT" ? "REJECTED" : invalidated ? "SUPERSEDED" : "SUBMITTED", review };
}
function sameContext(a: Context, b: Context) { return a.projectId === b.projectId && a.flexibleProjectId === b.flexibleProjectId; }

/** Deliberately narrow adapter: only adopted, sealed project attachments in a
 * folder the selector can currently write. Archive/Library read grants cannot
 * be laundered into delegation. Historical unmapped files are not adopted here. */
async function projectSource(tx: Tx, actorId: string, context: Context, versionId: string) {
  const ref = await tx.sharedFileReference.findFirst({ where: { versionId, projectAttachmentId: { not: null } },
    include: { projectAttachment: { include: { researchFolderFile: true } }, version: { include: { file: true } } } });
  const a = ref?.projectAttachment, v = ref?.version;
  ensure(a && v && context.projectId && !context.flexibleProjectId && a.projectId === context.projectId && sameContext(v.file, context), "SOURCE_UNAVAILABLE", 403);
  ensure(a.status === "READY" && v.status === "READY" && v.objectETag && (v.applicationSealed || v.objectVersionId) &&
    a.bucket === v.bucket && a.storageKey === v.storageKey && a.fileSize === v.fileSize && a.mimeType === v.mimeType, "SOURCE_UNAVAILABLE", 403);
  const folder = a.privateFolderId ? `private-folder:${a.privateFolderId}` : a.researchFolderFile ? `research-folder:${a.researchFolderFile.folderId}` : null;
  ensure(folder, "UNSUPPORTED_SOURCE", 403);
  const target = await authorizedTarget(tx, actorId, folder);
  ensure(target.projectId === context.projectId, "SOURCE_UNAVAILABLE", 403);
  return { version: v, sourceAttachmentId: a.id, sourceUploadId: null, sourceSubmissionId: null, sourceReviewId: null, sourceState: "SEALED" };
}
async function inspirationSource(tx: Tx, actorId: string, context: Context, versionId: string) {
  const upload = await tx.universalTaskUpload.findUnique({ where: { versionId }, include: { version: { include: { file: true } } } });
  ensure(upload?.submittedEntryId, "SOURCE_UNAVAILABLE", 403);
  await tx.$queryRaw`SELECT id FROM "UniversalTask" WHERE id=${upload.taskId} FOR SHARE`;
  const source = await tx.universalTask.findUniqueOrThrow({ where: { id: upload.taskId } });
  const auth = await tx.userAuthorization.findUniqueOrThrow({ where: { userId: actorId } });
  ensure(auth.accountStatus === "ACTIVE" && conceptManager(auth.businessRole) && (auth.businessRole === "DIRECTOR" || source.ownerId === actorId), "SOURCE_DELEGATION_DENIED", 403);
  ensure(source.type === "INITIAL_CONCEPT" && !source.deletedAt && source.status !== "CLOSED" && sameContext(source, context) && sameContext(upload.version.file, context), "SOURCE_UNAVAILABLE", 403);
  ensure(upload.version.status === "READY" && upload.version.objectETag && (upload.version.applicationSealed || upload.version.objectVersionId), "SOURCE_UNAVAILABLE", 403);
  const entries = await tx.universalTaskEntry.findMany({ where: { taskId: source.id }, orderBy: { version: "asc" } });
  const submission = entries.find(e => e.id === upload.submittedEntryId && e.action === "SUBMIT");
  ensure(submission && submission.actorId === upload.uploadedById, "SOURCE_UNAVAILABLE", 403);
  const { state, review } = submissionState(submission, entries);
  ensure(["SUBMITTED", "APPROVED"].includes(state), "SOURCE_INELIGIBLE", 403);
  return { version: upload.version, sourceUploadId: upload.id, sourceAttachmentId: null, sourceSubmissionId: submission.id, sourceReviewId: review?.id ?? null, sourceState: state, sourceTaskTitle: source.title };
}
export async function resolveTaskReference(tx: Tx, actorId: string, task: UniversalTask, versionId: string) {
  ensure(conceptsEnabled(), "TASK_TYPE_UNAVAILABLE", 404); id(versionId);
  if (task.type === "FINAL_CONCEPT") return { ...await inspirationSource(tx, actorId, task, versionId), kind: "INSPIRATION" };
  ensure(task.type === "INSPECT_FILE", "UNSUPPORTED_SOURCE");
  const own = await tx.universalTaskUpload.findFirst({ where: { taskId: task.id, versionId, uploadedById: task.ownerId }, include: { version: true } });
  if (own) {
    const owner = await tx.userAuthorization.findUniqueOrThrow({ where: { userId: task.ownerId } });
    ensure(owner.accountStatus === "ACTIVE" && owner.businessRole, "SOURCE_DELEGATION_DENIED", 403);
    ensure(own.version.status === "READY" && own.version.applicationSealed && own.version.objectETag, "SOURCE_UNAVAILABLE", 403);
    return { version: own.version, sourceUploadId: own.id, sourceAttachmentId: null, sourceSubmissionId: null, sourceReviewId: null, sourceState: "SEALED", kind: "INSPECTION" };
  }
  // Director intervention also rechecks the actual owner's delegation authority.
  const selected = await projectSource(tx, task.ownerId, task, versionId);
  if (actorId !== task.ownerId) await projectSource(tx, actorId, task, versionId);
  return { ...selected, kind: "INSPECTION" };
}
export async function saveTaskReference(tx: Tx, taskId: string, selectedEntryId: string, source: Awaited<ReturnType<typeof resolveTaskReference>>) {
  const { version, sourceUploadId, sourceAttachmentId, sourceSubmissionId, sourceReviewId, sourceState, kind } = source;
  await tx.universalTaskReference.create({ data: { taskId, selectedEntryId, versionId: version.id, sourceUploadId, sourceAttachmentId, sourceSubmissionId, sourceReviewId, sourceState, kind } });
  await tx.sharedFileProvenance.create({ data: { versionId: version.id, taskEntryId: selectedEntryId } });
}
export async function conceptSourceChoices(tx: Tx, actorId: string, contexts: Context[]): Promise<ConceptSourceChoice[]> {
  const auth = await tx.userAuthorization.findUniqueOrThrow({ where: { userId: actorId } });
  if (!conceptsEnabled() || !conceptManager(auth.businessRole)) return [];
  const result: ConceptSourceChoice[] = [];
  for (const context of contexts) {
    const contextTarget = context.projectId ? `structured:${context.projectId}` : `flexible:${context.flexibleProjectId}`;
    const candidates = await tx.sharedFileVersion.findMany({ where: { status: "READY", file: context,
      OR: [{ references: { some: { projectAttachmentId: { not: null } } } }, { taskUpload: { task: { type: "INITIAL_CONCEPT", deletedAt: null }, submittedEntryId: { not: null } } }] },
      select: { id: true, taskUpload: { select: { id: true } } }, orderBy: { createdAt: "desc" }, take: 500 });
    for (const c of candidates) {
      try {
        const source = c.taskUpload ? await inspirationSource(tx, actorId, context, c.id) : await projectSource(tx, actorId, context, c.id);
        result.push({ versionId: c.id, name: source.version.originalFileName, number: source.version.number, contextTarget,
          kind: c.taskUpload ? "INSPIRATION" : "INSPECTION", sourceState: source.sourceState, ...("sourceTaskTitle" in source ? { sourceTaskTitle: source.sourceTaskTitle } : {}) });
      } catch (error) { if (!(error instanceof TaskerError)) throw error; }
    }
  }
  return result;
}
export async function taskReferences(tx: Tx, task: UniversalTask): Promise<TaskReference[]> {
  const rows = await tx.universalTaskReference.findMany({ where: { taskId: task.id }, include: {
    version: { include: { file: true, uploadedBy: { select: person } } }, sourceAttachment: { select: { projectId: true } }, sourceUpload: { include: { task: { include: { owner: { select: person } } } } },
    sourceSubmission: { include: { actor: { select: person } } }, sourceReview: { include: { actor: { select: person } } },
  }, orderBy: { id: "asc" } });
  return rows.map(r => {
    ensure((!r.sourceAttachment || r.sourceAttachment.projectId === task.projectId) && sameContext(r.version.file, task) && (!r.sourceUpload || sameContext(r.sourceUpload.task, task)), "SOURCE_UNAVAILABLE", 403);
    const source = r.kind === "INSPIRATION" ? r.sourceUpload?.task : null;
    return { id: r.id, kind: r.kind, fileId: r.version.fileId, versionId: r.versionId, number: r.version.number, name: r.version.originalFileName, mimeType: r.version.mimeType,
      sourceState: r.sourceState, sourceTask: source ? { id: source.id, title: source.title, owner: source.owner } : null, uploader: r.version.uploadedBy,
      submission: r.sourceSubmission ? { id: r.sourceSubmission.id, actor: r.sourceSubmission.actor, createdAt: r.sourceSubmission.createdAt.toISOString() } : null,
      review: r.sourceReview ? { id: r.sourceReview.id, actor: r.sourceReview.actor, action: r.sourceReview.action, createdAt: r.sourceReview.createdAt.toISOString() } : null };
  });
}
