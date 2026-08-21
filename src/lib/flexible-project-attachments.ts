import { randomUUID } from "node:crypto";

import { AttachmentStatus } from "@prisma/client";

import {
  canManageFlexibleProject,
  hasFlexibleProjectAccess,
} from "@/lib/flexible-projects";
import { hasPermission, type PermissionUser } from "@/lib/permissions/resolver";
import { prisma, withPrismaRetry } from "@/lib/prisma";
import {
  createPresignedDownloadUrl,
  createPresignedPreviewUrl,
  createPresignedUploadTarget,
  deleteObjectIfNeeded,
  getMaxAssetUploadBytes,
  getObjectMetadata,
  getS3BucketName,
  sanitizeFileName,
  type S3UploadEndpointMode,
} from "@/lib/storage/s3";
import {
  buildFileTypeNotAllowedPayload,
  isAllowedAssetFile,
  PROJECT_ASSET_ALLOWED_EXTENSIONS,
  type UploadFileTypeErrorPayload,
} from "@/lib/upload-validation";

export type FlexibleAttachmentUploadInput = {
  projectId: string;
  originalFileName: string;
  mimeType: string;
  fileSize: number;
  uploadEndpointMode?: S3UploadEndpointMode;
};

export type FlexibleAttachmentUploadResult =
  | { error: string }
  | UploadFileTypeErrorPayload
  | {
      attachmentId: string;
      uploadUrl: string;
      uploadExpectedHeaders: { "Content-Type": string };
    };

async function getAttachmentProjectContext(projectId: string) {
  return withPrismaRetry(() =>
    prisma.flexibleProject.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        slug: true,
        ownerId: true,
        collaborators: { select: { userId: true } },
      },
    }),
  );
}

function canUpload(user: PermissionUser, project: NonNullable<Awaited<ReturnType<typeof getAttachmentProjectContext>>>) {
  return (
    hasFlexibleProjectAccess(user, project) &&
    (hasPermission(user, "file.uploadAttachment") || canManageFlexibleProject(user, project))
  );
}

export async function requestFlexibleProjectAttachmentUpload(
  user: PermissionUser,
  input: FlexibleAttachmentUploadInput,
): Promise<FlexibleAttachmentUploadResult> {
  const originalFileName = input.originalFileName.trim();
  const mimeType = input.mimeType.trim() || "application/octet-stream";
  if (!originalFileName) return { error: "Choose a file to upload." };
  if (!isAllowedAssetFile(originalFileName)) {
    return buildFileTypeNotAllowedPayload({
      fileName: originalFileName,
      mimeType,
      allowedExtensions: PROJECT_ASSET_ALLOWED_EXTENSIONS,
    });
  }
  if (!Number.isFinite(input.fileSize) || input.fileSize <= 0) return { error: "File size is invalid." };
  if (input.fileSize > getMaxAssetUploadBytes()) return { error: "This file exceeds the allowed size limit." };

  const project = await getAttachmentProjectContext(input.projectId);
  if (!project) return { error: "Flexible Project not found." };
  if (!canUpload(user, project)) return { error: "You are not allowed to upload files to this Flexible Project." };

  const fileName = `${Date.now()}-${randomUUID().slice(0, 8)}-${sanitizeFileName(originalFileName)}`;
  const storageKey = `flexible-projects/${project.id}/attachments/${fileName}`;
  const bucket = getS3BucketName();
  const attachment = await withPrismaRetry(() =>
    prisma.flexibleProjectAttachment.create({
      data: {
        projectId: project.id,
        uploadedById: user.id,
        fileName,
        originalFileName,
        mimeType,
        fileSize: input.fileSize,
        bucket,
        storageKey,
        status: AttachmentStatus.UPLOADING,
      },
      select: { id: true },
    }),
  );
  const target = await createPresignedUploadTarget({
    bucket,
    storageKey,
    mimeType,
    endpointMode: input.uploadEndpointMode,
  });
  return {
    attachmentId: attachment.id,
    uploadUrl: target.uploadUrl,
    uploadExpectedHeaders: target.expectedHeaders,
  };
}

export async function completeFlexibleProjectAttachmentUpload(
  user: PermissionUser,
  projectId: string,
  attachmentId: string,
  failed = false,
) {
  const attachment = await withPrismaRetry(() =>
    prisma.flexibleProjectAttachment.findFirst({
      where: { id: attachmentId, projectId },
      select: {
        id: true,
        projectId: true,
        uploadedById: true,
        bucket: true,
        storageKey: true,
        fileSize: true,
        mimeType: true,
        status: true,
        project: {
          select: { id: true, slug: true, ownerId: true, collaborators: { select: { userId: true } } },
        },
      },
    }),
  );
  if (!attachment || attachment.uploadedById !== user.id) throw new Error("Attachment not found.");
  if (!canUpload(user, attachment.project)) throw new Error("You are not allowed to complete this upload.");
  if (!attachment.storageKey.startsWith(`flexible-projects/${attachment.projectId}/attachments/`)) {
    throw new Error("Attachment upload context is invalid.");
  }
  if (attachment.status === AttachmentStatus.READY && !failed) return attachment.project.slug;
  if (attachment.status !== AttachmentStatus.UPLOADING) throw new Error("Attachment cannot be completed.");

  if (failed) {
    await withPrismaRetry(() =>
      prisma.flexibleProjectAttachment.update({ where: { id: attachment.id }, data: { status: AttachmentStatus.FAILED } }),
    );
    await deleteObjectIfNeeded(attachment.storageKey, attachment.bucket).catch(() => undefined);
    return attachment.project.slug;
  }

  const metadata = await getObjectMetadata(attachment.storageKey, attachment.bucket);
  if (typeof metadata.ContentLength === "number" && metadata.ContentLength !== attachment.fileSize) {
    throw new Error("Uploaded file size does not match the requested upload.");
  }
  if (metadata.ContentType && metadata.ContentType !== attachment.mimeType) {
    throw new Error("Uploaded file type does not match the requested upload.");
  }
  await withPrismaRetry(() =>
    prisma.flexibleProjectAttachment.update({
      where: { id: attachment.id },
      data: { status: AttachmentStatus.READY },
    }),
  );
  return attachment.project.slug;
}

async function getReadyAttachment(user: PermissionUser, attachmentId: string) {
  const attachment = await withPrismaRetry(() =>
    prisma.flexibleProjectAttachment.findUnique({
      where: { id: attachmentId },
      select: {
        id: true,
        projectId: true,
        bucket: true,
        storageKey: true,
        originalFileName: true,
        mimeType: true,
        status: true,
        project: { select: { ownerId: true, collaborators: { select: { userId: true } } } },
      },
    }),
  );
  if (!attachment || attachment.status !== AttachmentStatus.READY) throw new Error("Attachment not found.");
  if (!hasFlexibleProjectAccess(user, attachment.project)) throw new Error("You do not have access to this attachment.");
  return attachment;
}

export async function getFlexibleAttachmentUrl(
  user: PermissionUser,
  attachmentId: string,
  mode: "preview" | "download",
) {
  const attachment = await getReadyAttachment(user, attachmentId);
  const permission = mode === "preview" ? "file.view" : "file.download";
  if (!hasPermission(user, permission)) throw new Error(`You do not have permission to ${mode} this attachment.`);
  const input = {
    bucket: attachment.bucket,
    storageKey: attachment.storageKey,
    fileName: attachment.originalFileName,
    mimeType: attachment.mimeType,
  };
  return mode === "preview"
    ? createPresignedPreviewUrl(input)
    : createPresignedDownloadUrl(input);
}

export async function deleteFlexibleProjectAttachment(user: PermissionUser, attachmentId: string) {
  const attachment = await getReadyAttachment(user, attachmentId);
  if (!canManageFlexibleProject(user, attachment.project) || !hasPermission(user, "file.delete")) {
    throw new Error("You do not have permission to delete this attachment.");
  }
  await deleteObjectIfNeeded(attachment.storageKey, attachment.bucket).catch(() => undefined);
  await withPrismaRetry(() =>
    prisma.flexibleProjectAttachment.update({
      where: { id: attachment.id },
      data: { status: AttachmentStatus.DELETED },
    }),
  );
  return attachment.projectId;
}
