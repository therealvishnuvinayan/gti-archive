import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { PermissionUser } from "@/lib/permissions/resolver";
import { isAllowedAssetFile } from "@/lib/upload-validation";
import { copyStoredObject, createPresignedDownloadUrl, createPresignedUploadTarget, getMaxAssetUploadBytes, getObjectMetadata, getS3BucketName, sanitizeFileName } from "@/lib/storage/s3";
import { assertTaskDestination, type PublishedTaskFile } from "./adapters";
import { taskAssert } from "./errors";
import { loadTaskForUser, taskTransaction, terminalTaskStatuses } from "./service";

export type TaskerStorage = {
  bucket: typeof getS3BucketName;
  upload: typeof createPresignedUploadTarget;
  metadata: typeof getObjectMetadata;
  copy: typeof copyStoredObject;
  download: typeof createPresignedDownloadUrl;
};
const storage: TaskerStorage = { bucket: getS3BucketName, upload: createPresignedUploadTarget, metadata: getObjectMetadata, copy: copyStoredObject, download: createPresignedDownloadUrl };

async function assertUploadAccess(user: PermissionUser, taskId: string) {
  const { task, context } = await loadTaskForUser(prisma, user, taskId);
  taskAssert(task.assigneeId === user.id && !terminalTaskStatuses.includes(task.status) && task.status !== "IN_REVIEW", "This task is not accepting files from you.", 403);
  if (task.destinationId) assertTaskDestination(context, task.destinationId, task.ownerId, task.assigneeId);
  if (task.kind === "FIELD_INPUT") taskAssert(context.fields.find((f) => f.id === task.targetId)?.acceptsFiles, "The requested field does not accept files.");
  return task;
}

export async function requestTaskUpload(user: PermissionUser, taskId: string, input: { name: string; size: number; mimeType: string }, store: TaskerStorage = storage) {
  await assertUploadAccess(user, taskId);
  taskAssert(typeof input.name === "string" && input.name.length <= 255 && isAllowedAssetFile(input.name), "Choose a supported file.");
  taskAssert(Number.isSafeInteger(input.size) && input.size > 0 && input.size <= Math.min(getMaxAssetUploadBytes(), 2147483647), "The file is empty or exceeds the upload limit.");
  taskAssert(typeof input.mimeType === "string" && /^[\w.+-]+\/[\w.+-]+$/.test(input.mimeType) && input.mimeType.length <= 150, "Invalid file type.");
  const count = await prisma.taskerFile.count({ where: { taskId, submissionId: null, status: { in: ["UPLOADING", "READY"] } } });
  taskAssert(count < 40, "Submit or remove existing uploads before adding more files.");
  const id = randomUUID(), bucket = store.bucket();
  const file = await prisma.taskerFile.create({ data: { id, taskId, uploadedById: user.id, originalFileName: sanitizeFileName(input.name), mimeType: input.mimeType, fileSize: input.size, bucket, uploadKey: `tasker/uploads/${taskId}/${id}`, storageKey: `tasker/files/${taskId}/${id}` } });
  return { fileId: file.id, ...(await store.upload({ bucket, storageKey: file.uploadKey, mimeType: file.mimeType, expiresInSeconds: 300 })) };
}

export async function finalizeTaskUpload(user: PermissionUser, taskId: string, fileId: string, store: TaskerStorage = storage) {
  await assertUploadAccess(user, taskId);
  const file = await prisma.taskerFile.findFirst({ where: { id: fileId, taskId, uploadedById: user.id, submissionId: null } });
  taskAssert(file, "File not found.", 404);
  if (file.status === "READY") return { fileId };
  taskAssert(file.status === "UPLOADING", "This upload is not available.");
  const uploaded = await store.metadata(file.uploadKey, file.bucket);
  taskAssert(uploaded.ContentLength === file.fileSize && uploaded.ContentType === file.mimeType, "The uploaded file does not match its declared size or type.");
  // Copy to a different, unique key per finalization attempt so concurrent finalizers
  // cannot replace an object after a task submission has referenced it.
  const immutableKey = `tasker/files/${taskId}/${file.id}/${randomUUID()}`;
  await store.copy({ sourceBucket: file.bucket, sourceKey: file.uploadKey, bucket: file.bucket, storageKey: immutableKey });
  const copied = await store.metadata(immutableKey, file.bucket);
  taskAssert(copied.ContentLength === file.fileSize && copied.ContentType === file.mimeType, "The copied file failed verification.");
  await taskTransaction(async (db) => {
    const { task, context } = await loadTaskForUser(db, user, taskId);
    taskAssert(task.assigneeId === user.id && !terminalTaskStatuses.includes(task.status) && task.status !== "IN_REVIEW", "The task changed during upload.", 409);
    if (task.destinationId) assertTaskDestination(context, task.destinationId, task.ownerId, task.assigneeId);
    await db.taskerFile.updateMany({ where: { id: fileId, status: "UPLOADING", submissionId: null }, data: { storageKey: immutableKey, status: "READY" } });
  });
  return { fileId };
}

export async function discardTaskUpload(user: PermissionUser, taskId: string, fileId: string) {
  await loadTaskForUser(prisma, user, taskId);
  const result = await prisma.taskerFile.updateMany({ where: { id: fileId, taskId, uploadedById: user.id, submissionId: null, status: { in: ["UPLOADING", "READY"] } }, data: { status: "DELETED" } });
  taskAssert(result.count, "Only your unsubmitted files can be removed.", 403);
}

export async function taskFileDownload(user: PermissionUser, taskId: string, fileId: string, store: TaskerStorage = storage) {
  const { task } = await loadTaskForUser(prisma, user, taskId);
  const file = await prisma.taskerFile.findFirst({ where: { id: fileId, taskId, status: "READY" } });
  taskAssert(file && (file.submissionId || file.uploadedById === user.id), "File not found.", 404);
  taskAssert(!task.deletedAt, "Task no longer available.", 404);
  return store.download({ bucket: file.bucket, storageKey: file.storageKey, fileName: file.originalFileName, expiresInSeconds: 60 });
}

export async function prepareAcceptedTaskFiles(user: PermissionUser, taskId: string, version: number, store: TaskerStorage = storage): Promise<PublishedTaskFile[]> {
  const { task, context } = await loadTaskForUser(prisma, user, taskId);
  taskAssert((task.ownerId === user.id || task.coOwnerId === user.id) && task.status === "IN_REVIEW" && task.version === version, "Refresh the task before reviewing it.", 409);
  if (task.kind === "GENERAL") return [];
  if (task.destinationId) assertTaskDestination(context, task.destinationId, task.ownerId, task.assigneeId);
  const submission = await prisma.taskerSubmission.findFirst({ where: { taskId }, include: { files: true }, orderBy: { createdAt: "desc" } });
  taskAssert(submission, "Submission not found.");
  for (const file of submission.files) {
    taskAssert(file.status === "READY", "A submitted file is not ready.", 409);
    await store.copy({ sourceBucket: file.bucket, sourceKey: file.storageKey, bucket: file.bucket, storageKey: `tasker/published/${taskId}/${file.id}` });
  }
  return submission.files.map((f) => ({ id: `${f.id}-published`, name: f.originalFileName, mimeType: f.mimeType, size: f.fileSize }));
}
