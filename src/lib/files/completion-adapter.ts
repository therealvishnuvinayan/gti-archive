import "server-only";
import type { Prisma } from "@prisma/client";
import { sharedFileIdentityAvailable, sharedFileIdentityEnabled } from "./activation";
import { captureFileIntegrity, fileCondition, type FileObjectObservation } from "./contracts";

/** Trusted native-workflow adapter, called inside the already authorized completion
 * transaction. It observes persisted native events; it cannot approve a file or
 * choose an actor. The existing service owns project/session/external-link locks. */
export async function recordCompletionFileEvent(tx: Prisma.TransactionClient, eventId: string, observation?: FileObjectObservation) {
  const adoptNewFiles = sharedFileIdentityEnabled();
  if (!adoptNewFiles && !await sharedFileIdentityAvailable(tx)) return;
  const event = await tx.completionDocumentEvent.findUniqueOrThrow({ where: { id: eventId } });
  if (!event.submissionId || !["UPLOAD_PREPARED", "UPLOAD_FAILED", "DOCUMENT_SUBMITTED", "DOCUMENT_ACCEPTED", "DOCUMENT_REJECTED"].includes(event.action)) return;
  if (event.action === "UPLOAD_PREPARED" && !adoptNewFiles) return;
  if (await tx.sharedFileProvenance.findUnique({ where: { completionEventId: event.id } })) return;
  const submission = await tx.completionDocumentSubmission.findUniqueOrThrow({ where: { id: event.submissionId } });
  fileCondition(submission.projectId === event.projectId && submission.workflowId === event.workflowId, "FILE_EVENT_SOURCE_MISMATCH");
  let reference = await tx.sharedFileReference.findUnique({ where: { completionSubmissionId: submission.id }, include: { version: true } });
  if (event.action === "UPLOAD_PREPARED") {
    fileCondition(submission.status === "UPLOADING" && !reference, "FILE_UPLOAD_ALREADY_REGISTERED");
    // Native operations already hold the project root lock. The identity lock also
    // makes numbering explicit for future adapters; no filename-based deduplication.
    let file = await tx.sharedFile.findUnique({ where: { completionWorkflowId_completionDocumentType: {
      completionWorkflowId: submission.workflowId, completionDocumentType: submission.type,
    } } });
    if (!file) file = await tx.sharedFile.create({ data: { projectId: submission.projectId,
      completionWorkflowId: submission.workflowId, completionDocumentType: submission.type } });
    await tx.$queryRaw`SELECT id FROM "SharedFile" WHERE id = ${file.id} FOR UPDATE`;
    const previous = await tx.sharedFileVersion.aggregate({ where: { fileId: file.id }, _max: { number: true } });
    const version = await tx.sharedFileVersion.create({ data: { fileId: file.id, number: (previous._max.number ?? 0) + 1,
      uploadedById: submission.submittedById, externalUploaderEmail: submission.externalSubmitterEmail,
      originalFileName: submission.originalFileName, mimeType: submission.mimeType, fileSize: submission.fileSize,
      bucket: submission.bucket, storageKey: submission.storageKey, applicationSealed: true } });
    reference = await tx.sharedFileReference.create({ data: { versionId: version.id, role: "SOURCE", completionSubmissionId: submission.id }, include: { version: true } });
  }
  // Historical/cutover uploads are not backfilled or relabelled as verified.
  if (!reference) return;
  const version = reference.version;
  fileCondition(version.bucket === submission.bucket && version.storageKey === submission.storageKey &&
    version.fileSize === submission.fileSize && version.mimeType === submission.mimeType &&
    version.uploadedById === submission.submittedById && version.externalUploaderEmail === submission.externalSubmitterEmail, "FILE_SOURCE_CHANGED");
  if (event.action === "DOCUMENT_SUBMITTED") {
    fileCondition(submission.status === "SUBMITTED" && observation && version.status === "UPLOADING", "INVALID_FILE_FINALIZATION");
    const integrity = captureFileIntegrity(observation, version);
    fileCondition(integrity.objectETag === submission.objectETag, "FILE_OBSERVATION_MISMATCH");
    await tx.sharedFileVersion.update({ where: { id: version.id }, data: { status: "READY", ...integrity,
      observedAt: event.createdAt, finalizedAt: event.createdAt } });
  } else if (event.action === "UPLOAD_FAILED") {
    fileCondition(submission.status === "FAILED" && version.status === "UPLOADING", "INVALID_FILE_FINALIZATION");
    await tx.sharedFileVersion.update({ where: { id: version.id }, data: { status: "FAILED", finalizedAt: event.createdAt } });
  } else if (event.action === "DOCUMENT_ACCEPTED") {
    fileCondition(version.status === "READY" && submission.status === "ACCEPTED" && version.objectETag === submission.objectETag, "INVALID_FILE_ACCEPTANCE");
    const document = await tx.projectCompletionDocument.findUniqueOrThrow({ where: { submissionId: submission.id } });
    await tx.sharedFileReference.create({ data: { versionId: version.id, role: "ACCEPTED_EVIDENCE", completionDocumentId: document.id } });
  } else if (event.action === "DOCUMENT_REJECTED") {
    fileCondition(version.status === "READY" && submission.status === "REJECTED", "INVALID_FILE_REJECTION");
  }
  await tx.sharedFileProvenance.create({ data: { versionId: version.id, completionEventId: event.id } });
}

/** Extra version guard for an adopted upload; absence means legacy/unmapped, never
 * verified history. The existing native review/evidence checks always still run. */
export async function assertCompletionFileObservation(tx: Prisma.TransactionClient, submissionId: string, observation: FileObjectObservation) {
  if (!await sharedFileIdentityAvailable(tx)) return;
  const reference = await tx.sharedFileReference.findUnique({ where: { completionSubmissionId: submissionId }, include: { version: true } });
  if (!reference) return;
  const version = reference.version, observed = captureFileIntegrity(observation, version);
  fileCondition(version.status === "READY" && version.objectETag === observed.objectETag &&
    (!version.objectVersionId || version.objectVersionId === observed.objectVersionId) &&
    (!version.checksumSha256 || version.checksumSha256 === observed.checksumSha256), "FILE_VERSION_OBJECT_CHANGED");
}
