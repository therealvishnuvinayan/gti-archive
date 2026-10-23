import "server-only";
import type { Prisma } from "@prisma/client";
import { captureFileIntegrity } from "../files/contracts";
import { copyStoredObject, createPresignedUploadTarget, getMaxAssetUploadBytes, getObjectMetadata, getS3BucketName, readPinnedStoredObject, sanitizeFileName } from "../storage/s3";
import { ensure, identifier } from "../stage-builder/contracts";
import { runtimeAuthorization } from "../authorization/runtime";
import { capability, text, type FileGate } from "./contracts";
import { runtimeActor, type StageData, type Tx } from "./data";
import { requireRuntime } from "./activation";
export async function prepareRuntimeFile(tx: Tx, data: StageData, input: Record<string, unknown>, publicationId?: string) {
  const c = capability(data.definition, input.capabilityId, "FILE_REQUIREMENT"), actor = await runtimeActor(tx);
  text(input.fileName, 255, true); text(input.mimeType, 160, true);
  ensure(/^[\w.+-]+\/[\w.+-]+$/.test(input.mimeType) && Number.isSafeInteger(input.fileSize) && Number(input.fileSize) > 0 && Number(input.fileSize) <= Math.min(getMaxAssetUploadBytes(), 100 * 1024 * 1024), "INVALID_FILE_SIZE_OR_TYPE");
  const name = sanitizeFileName(input.fileName), ext = name.includes(".") ? `.${name.split(".").pop()!.toLowerCase()}` : "";
  ensure(c.acceptedTypes.includes(input.mimeType) || c.acceptedTypes.includes(ext), "FILE_TYPE_DENIED");
  const current = data.files.filter(f => f.capabilityId === c.id && !f.replaced);
  let fileId: string;
  if (input.supersedesId !== null) {
    identifier(input.supersedesId); const old = current.find(f => f.id === input.supersedesId); ensure(old, "FILE_REVISION_MISMATCH"); fileId = old.version.fileId;
    ensure(old.state !== "UPLOADING", "UPLOAD_STILL_PENDING", 409);
  } else { ensure(current.length < c.maxFiles, "FILE_COUNT_LIMIT"); fileId = (await tx.sharedFile.create({ data: { runtimeStageId: data.stage.id }, select: { id: true } })).id; }
  const publication = publicationId ? await tx.universalTaskPublication.findUniqueOrThrow({ where: { id: publicationId }, include: { sourceVersion: true, application: true } }) : null;
  if (publication) ensure(publication.application.reviewerId === actor.userId && publication.application.state !== "APPLIED" && publication.sourceVersion.status === "READY" && publication.sourceVersion.originalFileName === input.fileName && publication.sourceVersion.mimeType === input.mimeType && publication.sourceVersion.fileSize === input.fileSize, "INVALID_TASK_PUBLICATION");
  const id = publication ? publication.storageKey.split("/")[3] : `rf_${crypto.randomUUID().replaceAll("-", "")}`, bucket = publication?.bucket ?? getS3BucketName();
  const prefix = `runtime/${data.stage.projectId}/${data.stage.id}/${id}`;
  ensure(!publication || publication.storageKey === `${prefix}/sealed/${name}`, "INVALID_TASK_PUBLICATION");
  const uploaderId = publication?.sourceVersion.uploadedById ?? actor.userId;
  const number = await tx.sharedFileVersion.count({ where: { fileId } }) + 1;
  const version = await tx.sharedFileVersion.create({ data: { fileId, number, uploadedById: uploaderId, originalFileName: publication?.sourceVersion.originalFileName ?? name, mimeType: input.mimeType, fileSize: Number(input.fileSize), bucket, storageKey: `${prefix}/sealed/${name}`, applicationSealed: true } });
  await tx.runtimeFileSubmission.create({ data: { id, stageId: data.stage.id, capabilityId: c.id, versionId: version.id, supersedesId: input.supersedesId as string | null, submittedById: uploaderId, stagingKey: `${prefix}/upload/${name}`, createdAt: new Date(), expiresAt: new Date(Date.now() + 30 * 60_000) } });
  await tx.sharedFileReference.create({ data: { runtimeSubmissionId: id, versionId: version.id, role: "SOURCE" }, select: { id: true } });
  if (publication) await tx.runtimeTaskPublication.create({ data: { publicationId: publication.id, submissionId: id } });
  return { submissionId: id, versionId: version.id };
}
export async function finalizeRuntimeFile(tx: Tx, data: StageData, id: unknown, cancel: boolean, publicationId?: string) {
  identifier(id); const f = data.files.find(f => f.id === id); const actor = await runtimeActor(tx);
  const publication = publicationId ? await tx.runtimeTaskPublication.findUniqueOrThrow({ where: { publicationId }, include: { publication: { include: { sourceVersion: true, application: true } } } }) : null;
  if (publication) ensure(publication.submissionId === id && publication.publication.application.reviewerId === actor.userId && publication.publication.application.state !== "APPLIED", "INVALID_TASK_PUBLICATION");
  ensure(f && !f.replaced && f.state === "UPLOADING" && f.version.status === "UPLOADING" && (f.submittedById === actor.userId || !!publication), "UPLOAD_UNAVAILABLE", 409);
  let failure = cancel ? "CANCELLED" : f.expiresAt <= new Date() ? "EXPIRED" : null;
  let integrity: ReturnType<typeof captureFileIntegrity> | null = null;
  if (!failure) {
    try {
      const source = await getObjectMetadata(publication ? f.version.storageKey : f.stagingKey, f.version.bucket), observed = captureFileIntegrity(source, f.version);
      if (!publication) await copyStoredObject({ sourceBucket: f.version.bucket, sourceKey: f.stagingKey, bucket: f.version.bucket, storageKey: f.version.storageKey, sourceETag: observed.objectETag, sourceVersionId: observed.objectVersionId });
      const sealed = await getObjectMetadata(f.version.storageKey, f.version.bucket); integrity = captureFileIntegrity(sealed, f.version);
      ensure(integrity.objectETag === observed.objectETag && (!observed.checksumSha256 || integrity.checksumSha256 === observed.checksumSha256), "SEALED_FILE_CHANGED");
    } catch { failure = "STORAGE_INTEGRITY_FAILED"; }
  }
  ensure(!publication || !failure, "TASK_PUBLICATION_STORAGE_FAILED", 409);
  const at = new Date();
  await tx.sharedFileVersion.update({ where: { id: f.versionId }, data: failure ? { status: "FAILED", finalizedAt: at } : { status: "READY", ...integrity!, observedAt: at, finalizedAt: at } });
  await tx.runtimeFileSubmission.update({ where: { id }, data: failure ? { state: "FAILED", failureCode: failure } : { state: "SUBMITTED", submittedAt: at } });
  return { submissionId: id, state: failure ? "FAILED" : "SUBMITTED", failureCode: failure };
}
export async function verifyRuntimeFiles(data: StageData, only?: FileGate[]) {
  for (const f of data.files.filter(f => !f.replaced && ["ACCEPTED", "SUBMITTED"].includes(f.state) && (!only || only.some(o => o.id === f.id)))) {
    ensure(f.version.status === "READY" && f.version.applicationSealed && f.version.objectETag, "FILE_NOT_SEALED", 409);
    const observed = captureFileIntegrity(await getObjectMetadata(f.version.storageKey, f.version.bucket), f.version);
    ensure(observed.objectETag === f.version.objectETag && (!f.version.objectVersionId || observed.objectVersionId === f.version.objectVersionId) && (!f.version.checksumSha256 || observed.checksumSha256 === f.version.checksumSha256), "FILE_INTEGRITY_CHANGED", 409);
  }
}
export async function runtimeUploadTarget(projectId: string, stageId: string, submissionId: string) {
  requireRuntime(); identifier(projectId); identifier(stageId); identifier(submissionId);
  return runtimeAuthorization.runAuthorized({ capability: "project.runtimeManage", targetId: `runtime-project:${projectId}` }, async tx => {
    const actor = await runtimeActor(tx);
    const f = await tx.runtimeFileSubmission.findFirst({ where: { id: submissionId, stageId, stage: { projectId, state: { not: "COMPLETED" } } }, include: { version: true } });
    ensure(f && f.submittedById === actor.userId && f.state === "UPLOADING" && f.expiresAt > new Date(), "UPLOAD_UNAVAILABLE", 403);
    return createPresignedUploadTarget({ bucket: f.version.bucket, storageKey: f.stagingKey, mimeType: f.version.mimeType, expiresInSeconds: Math.min(600, Math.floor((f.expiresAt.getTime() - Date.now()) / 1000)) });
  });
}
export async function openRuntimeFile(projectId: string, stageId: string, versionId: string) {
  requireRuntime(); identifier(projectId); identifier(stageId); identifier(versionId);
  return runtimeAuthorization.runAuthorized({ capability: "project.runtimeRead", targetId: `runtime-project:${projectId}` }, async tx => {
    const f = await tx.runtimeFileSubmission.findFirst({ where: { stageId, versionId, stage: { projectId } }, include: { version: true } });
    ensure(f && ["SUBMITTED", "ACCEPTED", "REJECTED"].includes(f.state) && f.version.status === "READY" && f.version.objectETag && f.version.applicationSealed, "FILE_UNAVAILABLE", 404);
    const v = f.version;
    const object = await readPinnedStoredObject({ bucket: v.bucket, storageKey: v.storageKey, objectETag: v.objectETag!, objectVersionId: v.objectVersionId, checksumSha256: v.checksumSha256 });
    try {
      const observed = captureFileIntegrity(object, v);
      ensure(object.Body && observed.objectETag === v.objectETag && (!v.objectVersionId || observed.objectVersionId === v.objectVersionId) && (!v.checksumSha256 || observed.checksumSha256 === v.checksumSha256), "FILE_INTEGRITY_CHANGED", 409);
      return { body: object.Body, fileName: v.originalFileName, mimeType: v.mimeType, size: v.fileSize };
    } catch (error) { if (object.Body && "destroy" in object.Body) object.Body.destroy(); throw error; }
  }, { timeout: 30_000 });
}
export type FileProjection = Pick<Prisma.RuntimeFileSubmissionGetPayload<{ include: { version: true } }>, "id" | "versionId" | "capabilityId" | "state" | "reason" | "submittedById" | "reviewedById">;
