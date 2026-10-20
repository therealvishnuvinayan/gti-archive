import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Prisma, ProjectCompletionDocumentType, ProjectCompletionWorkflow } from "@prisma/client";
import { prisma } from "../prisma";
import { activeProjectMutation } from "../authorization/project-transaction";
import { runProjectMutation } from "../authorization/project-write";
import { requireProjectResourceRead } from "../authorization/project-read";
import { isProjectStatusCompleted } from "../project-statuses";
import { buildProjectCompletionDocumentKey, copyStoredObject, createPresignedDownloadUrl, createPresignedUploadUrl,
  getMaxAssetUploadBytes, getObjectMetadata, getS3BucketName, isAllowedProjectCompletionDocument, sanitizeFileName } from "@/lib/storage/s3";
import { completionDocumentEvidenceHash, completionStep, stepState } from "./evidence";
import { recordCompletionFileEvent, assertCompletionFileObservation } from "@/lib/files/completion-adapter";
import { getSharedFileDownloadPath } from "@/lib/files/access";
import type { FileObjectObservation } from "@/lib/files/contracts";

type DB = Prisma.TransactionClient;
type Actor = { userId: string } | { accessId: string; email: string };
type Target = { id: string; projectId: string };
export type CompletionUploadInput = { projectId: string; documentType: ProjectCompletionDocumentType; originalFileName: string; mimeType: string; fileSize: number };
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
function transaction(actor: { userId: string }, projectId: string) {
  const context = activeProjectMutation();
  if (!context || context.actorId !== actor.userId || context.projectId !== projectId || context.projectKind !== "structured") throw new Error("Authorized completion transaction required.");
  return context.tx;
}
async function bindActor(tx: DB, actor: Actor) {
  await tx.$queryRaw`SELECT set_config('flux.completion_actor', ${"userId" in actor ? actor.userId : ""}, true), set_config('flux.completion_access', ${"accessId" in actor ? actor.accessId : ""}, true)`;
}
async function event(tx: DB, actor: Actor, workflow: Target, action: string, details: unknown, links: { submissionId?: string; accessId?: string } = {}, observation?: FileObjectObservation) {
  await bindActor(tx, actor);
  const recorded = await tx.completionDocumentEvent.create({ data: { projectId: workflow.projectId, workflowId: workflow.id, action,
    actorId: "userId" in actor ? actor.userId : null, externalActorEmail: "email" in actor ? actor.email : null,
    details: JSON.parse(JSON.stringify(details)), ...links } });
  await recordCompletionFileEvent(tx, recorded.id, observation);
}
export async function completionDocumentEvent(actor: { userId: string }, workflow: Target, action: string, details: unknown) {
  await event(transaction(actor, workflow.projectId), actor, workflow, action, details);
}
async function activeWorkflow(tx: DB, projectId: string) {
  // Same root lock as native writes and Director finalization. All checks and
  // persistence are in one serializable transaction; no blind mutation retries.
  await tx.$queryRaw`SELECT id FROM "Project" WHERE id = ${projectId} FOR UPDATE`;
  const project = await tx.project.findUniqueOrThrow({ where: { id: projectId }, include: { status: { include: { group: true } }, closure: true, completionWorkflow: true } });
  if (project.completedAt || project.archivedAt || project.closure || isProjectStatusCompleted(project.status)) throw new Error("Completed or archived projects cannot accept completion documents.");
  if (!project.completionWorkflow) throw new Error("Configure completion document requirements first.");
  return project.completionWorkflow;
}
function assertRequested(workflow: ProjectCompletionWorkflow, type: ProjectCompletionDocumentType) {
  const state = stepState(workflow, type);
  if (!state.required || state.status !== "PENDING" || !state.requestedAt) throw new Error("Prepare a current required document request before submitting.");
  const prerequisites = type === "INVOICE" ? ["approval", "copyright"] as const : type === "COPYRIGHT_TRANSFER" ? ["approval"] as const : [];
  for (const prefix of prerequisites) if (workflow[`${prefix}Required`] === null || (workflow[`${prefix}Required`] && workflow[`${prefix}Status`] !== "COMPLETED")) throw new Error("Resolve preceding document requirements first.");
  return state.requestedAt;
}
function validateFile(input: CompletionUploadInput) {
  if (typeof input.originalFileName !== "string" || !input.originalFileName.trim() || input.originalFileName.length > 240 ||
    typeof input.mimeType !== "string" || !isAllowedProjectCompletionDocument(input.originalFileName, input.mimeType) ||
    !Number.isSafeInteger(input.fileSize) || input.fileSize <= 0 || input.fileSize > Math.min(getMaxAssetUploadBytes(), 2147483647)) throw new Error("Invalid completion document file type or size.");
}
async function prepare(tx: DB, actor: Actor, input: CompletionUploadInput) {
  validateFile(input);
  const workflow = await activeWorkflow(tx, input.projectId), requestTime = assertRequested(workflow, input.documentType);
  const evidenceHash = await completionDocumentEvidenceHash(tx, workflow, input.documentType);
  if (await tx.completionDocumentSubmission.count({ where: { workflowId: workflow.id, type: input.documentType, requestTime, status: "SUBMITTED" } })) throw new Error("Review the submitted document before uploading a revision.");
  const safeFileName = `${randomUUID()}-${sanitizeFileName(input.originalFileName)}`;
  const uploadKey = buildProjectCompletionDocumentKey({ projectId: input.projectId, documentType: input.documentType, safeFileName: `incoming/${safeFileName}` });
  const storageKey = buildProjectCompletionDocumentKey({ projectId: input.projectId, documentType: input.documentType, safeFileName: `evidence/${randomUUID()}-${sanitizeFileName(input.originalFileName)}` });
  await bindActor(tx, actor);
  const submission = await tx.completionDocumentSubmission.create({ data: { projectId: input.projectId, workflowId: workflow.id, type: input.documentType, requestTime, evidenceHash,
    submittedById: "userId" in actor ? actor.userId : null, externalSubmitterEmail: "email" in actor ? actor.email : null, accessId: "accessId" in actor ? actor.accessId : null,
    originalFileName: input.originalFileName, mimeType: input.mimeType, fileSize: input.fileSize, bucket: getS3BucketName(), uploadKey, storageKey, expiresAt: new Date(Date.now() + 10 * 60_000) } });
  await event(tx, actor, workflow, "UPLOAD_PREPARED", { type: input.documentType, originalFileName: input.originalFileName, fileSize: input.fileSize }, { submissionId: submission.id });
  return { storageKey: uploadKey, uploadUrl: await createPresignedUploadUrl({ storageKey: uploadKey, mimeType: input.mimeType, expiresInSeconds: 600 }) };
}
export async function prepareCompletionUpload(actor: { userId: string }, input: CompletionUploadInput) { return prepare(transaction(actor, input.projectId), actor, input); }

async function finish(tx: DB, actor: Actor, input: CompletionUploadInput & { storageKey: string; failed?: boolean }) {
  const workflow = await activeWorkflow(tx, input.projectId);
  // Lock the row that finalization actually changes BEFORE any storage effect.
  // A project lock alone does not refresh a waiting Serializable snapshot; a
  // replay could otherwise copy twice before its later database update aborts.
  await tx.$queryRaw`SELECT id FROM "CompletionDocumentSubmission" WHERE "uploadKey" = ${input.storageKey} FOR UPDATE`;
  const s = await tx.completionDocumentSubmission.findUnique({ where: { uploadKey: input.storageKey } });
  if (!s || s.projectId !== input.projectId || s.workflowId !== workflow.id || s.type !== input.documentType || s.originalFileName !== input.originalFileName || s.mimeType !== input.mimeType || s.fileSize !== input.fileSize ||
    ("userId" in actor ? s.submittedById !== actor.userId || !!s.accessId : s.accessId !== actor.accessId || s.externalSubmitterEmail !== actor.email)) throw new Error("Upload ticket does not match this project, file or submitter.");
  if (["SUBMITTED", "ACCEPTED"].includes(s.status) && !input.failed) return { submissionId: s.id, status: s.status };
  if (s.status === "FAILED" && input.failed) return { submissionId: s.id, status: s.status };
  const requestedAt = assertRequested(workflow, input.documentType);
  if (s.status !== "UPLOADING" || s.expiresAt <= new Date() || s.requestTime.getTime() !== requestedAt.getTime() || s.evidenceHash !== await completionDocumentEvidenceHash(tx, workflow, s.type)) throw new Error("Upload is expired, stale or already resolved.");
  if (await tx.completionDocumentSubmission.count({ where: { workflowId: workflow.id, type: s.type, requestTime: requestedAt, status: "SUBMITTED" } })) throw new Error("A submission already awaits review.");
  await bindActor(tx, actor);
  if (input.failed) {
    await tx.completionDocumentSubmission.update({ where: { id: s.id }, data: { status: "FAILED" } });
    await event(tx, actor, workflow, "UPLOAD_FAILED", {}, { submissionId: s.id });
    return { submissionId: s.id, status: "FAILED" };
  }
  const metadata = await getObjectMetadata(s.uploadKey, s.bucket);
  if (metadata.ContentLength !== s.fileSize || metadata.ContentType !== s.mimeType || !metadata.ETag) throw new Error("Uploaded object metadata does not match the issued ticket.");
  // A presigned PUT can be replayed until expiry. Conditional server-side copy
  // seals a separate key that is never exposed through an upload grant.
  await copyStoredObject({ sourceBucket: s.bucket, sourceKey: s.uploadKey, bucket: s.bucket, storageKey: s.storageKey, sourceETag: metadata.ETag });
  const sealed = await getObjectMetadata(s.storageKey, s.bucket);
  if (sealed.ContentLength !== s.fileSize || sealed.ContentType !== s.mimeType || !sealed.ETag) throw new Error("Unable to verify the sealed completion evidence.");
  await tx.completionDocumentSubmission.update({ where: { id: s.id }, data: { status: "SUBMITTED", uploadedAt: new Date(), objectETag: sealed.ETag } });
  await event(tx, actor, workflow, "DOCUMENT_SUBMITTED", { etag: sealed.ETag }, { submissionId: s.id }, sealed);
  return { submissionId: s.id, status: "SUBMITTED" };
}
export async function finishCompletionUpload(actor: { userId: string }, input: CompletionUploadInput & { storageKey: string; failed?: boolean }) { return finish(transaction(actor, input.projectId), actor, input); }

export async function reviewCompletionDocument(user: { id: string }, input: { projectId: string; submissionId: string; decision: "ACCEPT" | "REJECT"; reason: string }) {
  return runProjectMutation(user, "reviewCompletionDocument", { kind: "structured", id: input.projectId }, async actor => {
    if (!["ACCEPT", "REJECT"].includes(input.decision) || !input.reason?.trim() || input.reason.length > 2000) throw new Error("A review decision and reason are required.");
    const identity = { userId: actor.id }, tx = transaction(identity, input.projectId), workflow = await activeWorkflow(tx, input.projectId);
    const s = await tx.completionDocumentSubmission.findUniqueOrThrow({ where: { id: input.submissionId } });
    if (s.projectId !== input.projectId || s.workflowId !== workflow.id) throw new Error("Submission belongs to another project.");
    const resultStatus = input.decision === "ACCEPT" ? "ACCEPTED" : "REJECTED";
    if (s.status === resultStatus && s.reviewedById === actor.id && s.reviewReason === input.reason.trim()) return { status: s.status };
    if (s.status !== "SUBMITTED") throw new Error("Submission has already been reviewed or is incomplete.");
    if (input.decision === "ACCEPT") {
      const requestedAt = assertRequested(workflow, s.type);
      if (s.requestTime.getTime() !== requestedAt.getTime() || s.evidenceHash !== await completionDocumentEvidenceHash(tx, workflow, s.type)) throw new Error("This submission is stale; reject it and request a revision.");
      if (s.accessId) {
        const access = await tx.completionDocumentAccess.findUniqueOrThrow({ where: { id: s.accessId } });
        if (access.revokedAt) throw new Error("The external submission capability was revoked; reject this submission.");
      }
      if (!s.uploadedAt || !s.objectETag) throw new Error("Verified upload evidence is missing.");
      const metadata = await getObjectMetadata(s.storageKey, s.bucket);
      if (metadata.ETag !== s.objectETag || metadata.ContentLength !== s.fileSize || metadata.ContentType !== s.mimeType) throw new Error("Stored evidence has changed or is missing.");
      await assertCompletionFileObservation(tx, s.id, metadata);
    }
    await bindActor(tx, identity);
    const reviewedAt = new Date();
    await tx.completionDocumentSubmission.update({ where: { id: s.id }, data: { status: resultStatus, reviewedById: actor.id, reviewedAt, reviewReason: input.reason.trim() } });
    if (input.decision === "ACCEPT") {
      await tx.projectCompletionDocument.create({ data: { projectId: s.projectId, workflowId: s.workflowId, type: s.type, originalFileName: s.originalFileName, archiveFileName: s.originalFileName,
        mimeType: s.mimeType, fileSize: s.fileSize, bucket: s.bucket, storageKey: s.storageKey, uploadedById: s.submittedById, externalSubmitterEmail: s.externalSubmitterEmail, uploadedAt: s.uploadedAt!, submissionId: s.id } });
      const prefix = completionStep[s.type];
      const updated = await tx.projectCompletionWorkflow.update({ where: { id: workflow.id }, data: { [`${prefix}Status`]: "COMPLETED", [`${prefix}CompletedAt`]: reviewedAt } });
      const resolved = Object.values(completionStep).every(p => updated[`${p}Required`] === false || (updated[`${p}Required`] === true && updated[`${p}Status`] === "COMPLETED"));
      await tx.projectCompletionWorkflow.update({ where: { id: workflow.id }, data: { completedAt: resolved ? reviewedAt : null } });
    }
    await event(tx, identity, workflow, `DOCUMENT_${resultStatus}`, { reason: input.reason.trim() }, { submissionId: s.id });
    return { status: resultStatus };
  }, input);
}

export async function reopenCompletionDocument(user: { id: string }, input: { projectId: string; type: ProjectCompletionDocumentType; reason: string }) {
  return runProjectMutation(user, "reopenCompletionDocument", { kind: "structured", id: input.projectId }, async actor => {
    if (!input.reason?.trim() || input.reason.length > 2000) throw new Error("A reason for the document revision is required.");
    const identity = { userId: actor.id }, tx = transaction(identity, input.projectId), workflow = await activeWorkflow(tx, input.projectId);
    const state = stepState(workflow, input.type);
    if (!state.required || state.status !== "COMPLETED") throw new Error("Only accepted required evidence can be reopened for revision.");
    const types = Object.keys(completionStep) as ProjectCompletionDocumentType[];
    const affected = types.slice(types.indexOf(input.type));
    await bindActor(tx, identity);
    for (const type of affected) {
      if (!stepState(workflow, type).required) continue;
      const prefix = completionStep[type];
      await tx.projectCompletionWorkflow.update({ where: { id: workflow.id }, data: { [`${prefix}Status`]: "NOT_STARTED", [`${prefix}RequestedAt`]: null, [`${prefix}CompletedAt`]: null, completedAt: null } });
      await tx.completionDocumentAccess.updateMany({ where: { workflowId: workflow.id, type, revokedAt: null }, data: { revokedAt: new Date() } });
    }
    await event(tx, identity, workflow, "DOCUMENT_REVISION_REQUESTED", { type: input.type, affected, reason: input.reason.trim() });
    return { reopened: true };
  }, input);
}

export async function issueCompletionDocumentAccess(user: { id: string }, input: { projectId: string; type: ProjectCompletionDocumentType; recipientEmail: string }) {
  return runProjectMutation(user, "issueCompletionDocumentAccess", { kind: "structured", id: input.projectId }, async actor => {
    const email = input.recipientEmail?.trim().toLowerCase();
    if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("A valid recipient email is required.");
    const identity = { userId: actor.id }, tx = transaction(identity, input.projectId), workflow = await activeWorkflow(tx, input.projectId);
    const requestTime = assertRequested(workflow, input.type);
    await bindActor(tx, identity);
    const previous = await tx.completionDocumentAccess.findMany({ where: { workflowId: workflow.id, type: input.type, revokedAt: null }, select: { id: true } });
    await tx.completionDocumentAccess.updateMany({ where: { id: { in: previous.map(row => row.id) } }, data: { revokedAt: new Date() } });
    const token = randomBytes(32).toString("base64url"), expiresAt = new Date(Date.now() + 7 * 86400_000);
    const access = await tx.completionDocumentAccess.create({ data: { workflowId: workflow.id, projectId: input.projectId, type: input.type, requestTime, recipientEmail: email, tokenHash: hashToken(token), issuedById: actor.id, expiresAt } });
    await event(tx, identity, workflow, "EXTERNAL_ACCESS_ISSUED", { recipientEmail: email, expiresAt, revokedAccessIds: previous.map(row => row.id) }, { accessId: access.id });
    // Fragment keeps the bearer out of server access logs and Referer headers.
    return { accessId: access.id, path: `/completion-documents/submit#${token}`, expiresAt: expiresAt.toISOString() };
  }, input);
}
export async function revokeCompletionDocumentAccess(user: { id: string }, input: { projectId: string; accessId: string }) {
  return runProjectMutation(user, "revokeCompletionDocumentAccess", { kind: "structured", id: input.projectId }, async actor => {
    const identity = { userId: actor.id }, tx = transaction(identity, input.projectId), workflow = await activeWorkflow(tx, input.projectId);
    const access = await tx.completionDocumentAccess.findUniqueOrThrow({ where: { id: input.accessId } });
    if (access.workflowId !== workflow.id || access.projectId !== input.projectId) throw new Error("Capability belongs to another project.");
    if (access.revokedAt) return;
    await bindActor(tx, identity);
    await tx.completionDocumentAccess.update({ where: { id: access.id }, data: { revokedAt: new Date() } });
    await event(tx, identity, workflow, "EXTERNAL_ACCESS_REVOKED", {}, { accessId: access.id });
  }, input);
}
async function withExternal<T>(token: string, fn: (tx: DB, actor: Extract<Actor, { accessId: string }>, access: { projectId: string; type: ProjectCompletionDocumentType }) => Promise<T>) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Error("Invalid or expired submission link.");
  return prisma.$transaction(async tx => {
    const access = await tx.completionDocumentAccess.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!access) throw new Error("Invalid or expired submission link.");
    const workflow = await activeWorkflow(tx, access.projectId);
    if (access.revokedAt || access.expiresAt <= new Date() || access.workflowId !== workflow.id || stepState(workflow, access.type).requestedAt?.getTime() !== access.requestTime.getTime()) throw new Error("Invalid or expired submission link.");
    const result = await fn(tx, { accessId: access.id, email: access.recipientEmail }, access);
    if (access.expiresAt <= new Date()) throw new Error("Submission link expired during this operation.");
    return result;
  }, { isolationLevel: "Serializable", timeout: 30_000 });
}
export async function externalCompletionSubmission(token: string, command: "INFO" | "PREPARE" | "FINISH", input?: Omit<CompletionUploadInput, "projectId" | "documentType"> & { storageKey?: string; failed?: boolean }) {
  return withExternal(token, async (tx, actor, access) => {
    if (command === "INFO") {
      const submissions = await tx.completionDocumentSubmission.findMany({ where: { accessId: actor.accessId }, orderBy: { createdAt: "desc" }, select: { id: true, originalFileName: true, status: true, reviewReason: true } });
      return { type: access.type, recipientEmail: actor.email, submissions };
    }
    if (!input) throw new Error("File metadata is required.");
    const data = { ...input, projectId: access.projectId, documentType: access.type };
    if (command === "PREPARE") return prepare(tx, actor, data);
    if (command === "FINISH" && input.storageKey) return finish(tx, actor, { ...data, storageKey: input.storageKey });
    throw new Error("Invalid submission operation.");
  });
}
export async function getCompletionDocumentReviews(user: { id: string }, projectId: string) {
  await requireProjectResourceRead("structured", projectId, "project.view", user);
  const submissions = await prisma.completionDocumentSubmission.findMany({ where: { projectId }, orderBy: { createdAt: "desc" }, select: {
    id: true, type: true, originalFileName: true, status: true, uploadedAt: true, createdAt: true, reviewedAt: true, reviewReason: true,
    externalSubmitterEmail: true, submittedBy: { select: { name: true, email: true } }, reviewedBy: { select: { name: true, email: true } },
  } });
  const accesses = await prisma.completionDocumentAccess.findMany({ where: { projectId }, orderBy: { createdAt: "desc" }, select: { id: true, type: true, recipientEmail: true, expiresAt: true, revokedAt: true } });
  return { submissions, accesses };
}
export async function getCompletionSubmissionDownload(user: { id: string }, submissionId: string) {
  const s = await prisma.completionDocumentSubmission.findUniqueOrThrow({ where: { id: submissionId } });
  await requireProjectResourceRead("structured", s.projectId, "project.view", user);
  if (!s.uploadedAt || !s.objectETag || ["UPLOADING", "FAILED"].includes(s.status)) throw new Error("Document has not been submitted.");
  const versionPath = await getSharedFileDownloadPath({ kind: "completion-submission", id: submissionId });
  if (versionPath) return versionPath;
  return createPresignedDownloadUrl({ bucket: s.bucket, storageKey: s.storageKey, fileName: s.originalFileName, mimeType: s.mimeType });
}
