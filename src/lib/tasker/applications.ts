import "server-only";
import { randomUUID } from "node:crypto";
import type { Prisma, UniversalTask, UniversalTaskEntry } from "@prisma/client";
import { approvalHash } from "../approvals/contracts";
import { captureFileIntegrity } from "../files/contracts";
import { copyStoredObject, getObjectMetadata } from "@/lib/storage/s3";
import { publishTaskAttachmentTx } from "../project-history";
import { applyTaskChecklistValueTx } from "../stage-five";
import { ensure } from "./contracts";
import { recheckTarget } from "./targets";

type Tx = Prisma.TransactionClient;
export type DeliverableEvidence = { submissionIds: string[]; fileVersionIds: string[]; proposedValue: Prisma.InputJsonObject; targetHash: string; evidenceHash: string };
export async function exactRequest(tx: Tx, task: UniversalTask, reviewerId: string) {
  ensure(task.status === "COMPLETION_REQUESTED" && !task.deletedAt, "NO_COMPLETION_REQUEST", 409);
  const request = await tx.universalTaskEntry.findFirstOrThrow({ where: { taskId: task.id, action: "REQUEST_COMPLETION" }, orderBy: { version: "desc" } });
  ensure(request.actorId !== reviewerId && task.executorId !== reviewerId, "SELF_REVIEW_DENIED", 403);
  const evidence = request.snapshot as unknown as DeliverableEvidence;
  const latest = await tx.universalTaskEntry.findFirst({ where: { taskId: task.id, action: "SUBMIT" }, orderBy: { version: "desc" } });
  ensure(latest && evidence.submissionIds.length === 1 && latest.id === evidence.submissionIds[0], "SUBMISSION_SUPERSEDED", 409);
  return { request, evidence };
}
export async function prepareApplication(tx: Tx, task: UniversalTask, reviewerId: string) {
  const { request, evidence } = await exactRequest(tx, task, reviewerId);
  const { stored } = await recheckTarget(tx, task, reviewerId);
  ensure(evidence.targetHash === stored.expectedHash, "FIELD_CONFLICT_REFRESH_AND_RESUBMIT", 409);
  let application = await tx.universalTaskApplication.findUnique({ where: { requestEntryId: request.id } });
  if (application) { ensure(application.reviewerId === reviewerId && application.state !== "APPLIED", "APPLICATION_REVIEWER_CHANGED", 409); return { application, created: false }; }
  application = await tx.universalTaskApplication.create({ data: { taskId: task.id, requestEntryId: request.id, reviewerId } });
  for (const sourceVersionId of evidence.fileVersionIds) {
    const upload = await tx.universalTaskUpload.findFirst({ where: { taskId: task.id, versionId: sourceVersionId, submittedEntryId: evidence.submissionIds[0], version: { status: "READY" } }, include: { version: true } });
    ensure(upload, "INVALID_SUBMISSION_FILES");
    await tx.universalTaskPublication.create({ data: { applicationId: application.id, sourceVersionId, bucket: upload.version.bucket,
      storageKey: `projects/${task.projectId}/task-publications/${application.id}/${randomUUID()}` } });
  }
  return { application, created: true };
}
export async function applyApplication(tx: Tx, task: UniversalTask, reviewerId: string, note: string) {
  const { request, evidence } = await exactRequest(tx, task, reviewerId);
  const { stored, current } = await recheckTarget(tx, task, reviewerId);
  ensure(evidence.targetHash === stored.expectedHash, "FIELD_CONFLICT_REFRESH_AND_RESUBMIT", 409);
  const application = await tx.universalTaskApplication.findUniqueOrThrow({ where: { requestEntryId: request.id }, include: { publications: { include: { sourceVersion: true } } } });
  ensure(application.reviewerId === reviewerId && application.state !== "APPLIED", "APPLICATION_REVIEWER_CHANGED", 409);
  ensure(approvalHash(application.publications.map(p => p.sourceVersionId).sort()) === approvalHash([...evidence.fileVersionIds].sort()), "INVALID_SUBMISSION_FILES");
  const attachmentIds: string[] = [], versionIds: string[] = [];
  for (const publication of application.publications) {
    const source = publication.sourceVersion;
    ensure(source.status === "READY" && source.objectETag && source.uploadedById, "FILE_UNAVAILABLE", 409);
    // A committed intent reserves this unique destination. A crash/rollback may
    // leave its object; an explicit retry validates and reuses it without copying.
    let observed: Awaited<ReturnType<typeof getObjectMetadata>>;
    try { observed = await getObjectMetadata(publication.storageKey, publication.bucket); }
    catch (error) {
      const missing = error as { name?: string; $metadata?: { httpStatusCode?: number } };
      if (missing.name !== "NotFound" && missing.name !== "NoSuchKey" && missing.$metadata?.httpStatusCode !== 404) throw error;
      await copyStoredObject({ sourceBucket: source.bucket, sourceKey: source.storageKey, sourceETag: source.objectETag, sourceVersionId: source.objectVersionId,
        bucket: publication.bucket, storageKey: publication.storageKey });
      observed = await getObjectMetadata(publication.storageKey, publication.bucket);
    }
    const integrity = captureFileIntegrity(observed, source);
    ensure(integrity.objectETag === source.objectETag && (!source.checksumSha256 || integrity.checksumSha256 === source.checksumSha256), "FILE_CHANGED", 409);
    const attachment = await publishTaskAttachmentTx(tx, { projectId: current.projectId, kind: stored.kind, nativeId: stored.nativeId, source, reviewerId, note,
      bucket: publication.bucket, storageKey: publication.storageKey });
    const file = await tx.sharedFile.create({ select: { id: true }, data: { projectId: current.projectId } });
    const version = await tx.sharedFileVersion.create({ data: { fileId: file.id, number: 1, uploadedById: source.uploadedById,
      originalFileName: source.originalFileName, mimeType: source.mimeType, fileSize: source.fileSize, bucket: publication.bucket, storageKey: publication.storageKey, applicationSealed: true } });
    await tx.sharedFileReference.create({ select: { id: true }, data: { versionId: version.id, role: "SOURCE", projectAttachmentId: attachment.id } });
    await tx.sharedFileVersion.update({ where: { id: version.id }, data: { ...integrity, status: "READY", observedAt: new Date(), finalizedAt: new Date() } });
    await tx.universalTaskPublication.update({ where: { id: publication.id }, data: { attachmentId: attachment.id, publishedVersionId: version.id } });
    attachmentIds.push(attachment.id); versionIds.push(version.id);
  }
  if (stored.kind === "checklist") await applyTaskChecklistValueTx(tx, stored.nativeId, evidence.proposedValue, attachmentIds, reviewerId);
  return { application, request, evidence, attachmentIds, versionIds, before: current.state };
}
export async function completeApplication(tx: Tx, applied: Awaited<ReturnType<typeof applyApplication>>, task: UniversalTask, entry: UniversalTaskEntry) {
  await tx.universalTaskApplication.update({ where: { id: applied.application.id }, data: { state: "APPLIED", errorCode: null, acceptedEntryId: entry.id } });
  for (const versionId of [...applied.evidence.fileVersionIds, ...applied.versionIds]) await tx.sharedFileProvenance.create({ data: { versionId, taskEntryId: entry.id } });
  await tx.projectActivityLog.create({ data: { projectId: task.projectId!, actorId: entry.actorId, action: "TASK_DELIVERABLE_ACCEPTED",
    metadata: { taskId: task.id, taskOwnerId: task.ownerId, executorId: task.executorId, requestId: applied.request.id, submissionIds: applied.evidence.submissionIds,
      fileVersionIds: applied.evidence.fileVersionIds, attachmentIds: applied.attachmentIds, applicationId: applied.application.id, taskEntryId: entry.id,
      before: applied.before, target: (await tx.universalTaskTarget.findUniqueOrThrow({ where: { taskId: task.id } })).identity, proposedValue: applied.evidence.proposedValue } } });
}
