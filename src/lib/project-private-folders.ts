import { randomUUID } from "node:crypto";

import {
  AttachmentAssetType,
  AttachmentStatus,
  type Prisma,
  type User,
} from "@prisma/client";

import { prisma, withPrismaRetry } from "@/lib/prisma";
import {
  buildProjectAssetKey,
  createPresignedDownloadUrl,
  createPresignedPreviewUrl,
  createPresignedUploadTarget,
  deleteObjectIfNeeded,
  getDefaultS3UploadEndpointMode,
  getMaxAssetUploadBytes,
  getS3BucketName,
  isAllowedAssetFile,
  readTextObject,
  sanitizeFileName,
  type S3UploadEndpointMode,
} from "@/lib/storage/s3";
import {
  PROJECT_ASSET_ALLOWED_EXTENSIONS,
  buildFileTypeNotAllowedPayload,
} from "@/lib/upload-validation";

type PrivateFolderUser = Pick<User, "id" | "email" | "name" | "role">;

const PRIVATE_TEXT_PREVIEW_MAX_BYTES = 1024 * 1024;
const PRIVATE_TEXT_EXCERPT_MAX_BYTES = 6 * 1024;

function displayName(user: Pick<User, "name" | "email">) {
  return user.name?.trim() || user.email;
}

function activeParticipantWhere(userId: string) {
  return {
    OR: [
      { ownerId: userId },
      { coOwners: { some: { userId } } },
      { executors: { some: { userId } } },
      { collaborators: { some: { userId } } },
    ],
  } satisfies Prisma.ProjectWhereInput;
}

export async function ensureProjectPrivateFolderTx(
  tx: Prisma.TransactionClient,
  projectId: string,
  ownerUserId: string,
) {
  return tx.projectPrivateFolder.upsert({
    where: { projectId_ownerUserId: { projectId, ownerUserId } },
    create: { projectId, ownerUserId },
    update: {},
    select: { id: true },
  });
}

export async function ensureProjectPrivateFolder(
  projectId: string,
  ownerUserId: string,
) {
  return withPrismaRetry(() =>
    prisma.$transaction((tx) =>
      ensureProjectPrivateFolderTx(tx, projectId, ownerUserId),
    ),
  );
}

export async function ensureProjectPrivateFoldersForProjectTx(
  tx: Prisma.TransactionClient,
  projectId: string,
) {
  const project = await tx.project.findUnique({
    where: { id: projectId },
    select: {
      ownerId: true,
      coOwners: { select: { userId: true } },
      executors: { select: { userId: true } },
      collaborators: { select: { userId: true } },
    },
  });

  if (!project) throw new Error("Project not found.");

  const participantIds = [
    ...new Set([
      ...(project.ownerId ? [project.ownerId] : []),
      ...project.coOwners.map((record) => record.userId),
      ...project.executors.map((record) => record.userId),
      ...project.collaborators.map((record) => record.userId),
    ]),
  ];

  for (const participantId of participantIds) {
    await ensureProjectPrivateFolderTx(tx, projectId, participantId);
  }

  return participantIds;
}

export async function ensureProjectPrivateFoldersForProject(projectId: string) {
  return withPrismaRetry(() =>
    prisma.$transaction(
      (tx) => ensureProjectPrivateFoldersForProjectTx(tx, projectId),
      { timeout: 30_000 },
    ),
  );
}

async function getOwnedPrivateFolder(
  user: PrivateFolderUser,
  input: { projectId: string; folderId: string },
) {
  const folder = await withPrismaRetry(() =>
    prisma.projectPrivateFolder.findFirst({
      where: {
        id: input.folderId,
        projectId: input.projectId,
        ownerUserId: user.id,
        project: activeParticipantWhere(user.id),
      },
      select: {
        id: true,
        projectId: true,
        ownerUserId: true,
        owner: { select: { name: true, email: true } },
        project: { select: { id: true, name: true } },
      },
    }),
  );

  if (!folder) {
    throw new Error("You do not have access to this private folder.");
  }

  return folder;
}

export async function assertProjectPrivateAttachmentAccess(
  user: PrivateFolderUser,
  attachmentId: string,
) {
  const attachment = await withPrismaRetry(() =>
    prisma.projectAttachment.findFirst({
      where: {
        id: attachmentId,
        assetType: AttachmentAssetType.PROJECT_PRIVATE_FILE,
        privateFolder: {
          ownerUserId: user.id,
          project: activeParticipantWhere(user.id),
        },
      },
      select: {
        id: true,
        projectId: true,
        privateFolderId: true,
        bucket: true,
        storageKey: true,
        originalFileName: true,
        mimeType: true,
        fileSize: true,
        status: true,
        uploadedById: true,
        createdAt: true,
        uploadedBy: { select: { name: true, email: true } },
        privateFolder: { select: { projectId: true, ownerUserId: true } },
      },
    }),
  );

  if (
    !attachment ||
    !attachment.privateFolder ||
    attachment.privateFolder.projectId !== attachment.projectId
  ) {
    throw new Error("You do not have access to this private file.");
  }

  return attachment;
}

function mapPrivateFile(
  attachment: Awaited<ReturnType<typeof assertProjectPrivateAttachmentAccess>>,
) {
  return {
    id: attachment.id,
    attachmentId: attachment.id,
    name: attachment.originalFileName,
    mimeType: attachment.mimeType,
    size: attachment.fileSize,
    uploadedAt: attachment.createdAt.toISOString(),
    uploadedBy: displayName(attachment.uploadedBy),
  };
}

export async function getProjectPrivateFolderPageData(
  user: PrivateFolderUser,
  input: { projectId: string; folderId: string },
) {
  const folder = await getOwnedPrivateFolder(user, input);
  const files = await withPrismaRetry(() =>
    prisma.projectAttachment.findMany({
      where: {
        projectId: input.projectId,
        privateFolderId: folder.id,
        assetType: AttachmentAssetType.PROJECT_PRIVATE_FILE,
        status: AttachmentStatus.READY,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        projectId: true,
        privateFolderId: true,
        bucket: true,
        storageKey: true,
        originalFileName: true,
        mimeType: true,
        fileSize: true,
        status: true,
        uploadedById: true,
        createdAt: true,
        uploadedBy: { select: { name: true, email: true } },
        privateFolder: { select: { projectId: true, ownerUserId: true } },
      },
    }),
  );

  return {
    project: folder.project,
    workspace: {
      id: folder.id,
      ownerUserId: folder.ownerUserId,
      ownerName: displayName(folder.owner),
    },
    folder: { id: folder.id, name: "My Private Folder", isSystem: true },
    canWrite: true,
    files: files.map(mapPrivateFile),
  };
}

export async function requestProjectPrivateFileUpload(
  user: PrivateFolderUser,
  input: {
    projectId: string;
    folderId: string;
    originalFileName: string;
    mimeType: string;
    fileSize: number;
    uploadEndpointMode?: S3UploadEndpointMode;
  },
) {
  await getOwnedPrivateFolder(user, input);

  if (!input.originalFileName.trim()) {
    return { error: "Choose a file to upload." } as const;
  }
  if (!Number.isFinite(input.fileSize) || input.fileSize <= 0) {
    return { error: "File size is invalid." } as const;
  }
  if (input.fileSize > getMaxAssetUploadBytes()) {
    return { error: "This file exceeds the allowed size limit." } as const;
  }
  if (!isAllowedAssetFile(input.originalFileName)) {
    return buildFileTypeNotAllowedPayload({
      fileName: input.originalFileName,
      mimeType: input.mimeType,
      allowedExtensions: PROJECT_ASSET_ALLOWED_EXTENSIONS,
    });
  }

  const uniqueFileName = `${Date.now()}-${randomUUID().slice(0, 8)}-${sanitizeFileName(
    input.originalFileName,
  )}`;
  const storageKey = buildProjectAssetKey({
    projectId: input.projectId,
    privateFolderId: input.folderId,
    assetType: AttachmentAssetType.PROJECT_PRIVATE_FILE,
    safeFileName: uniqueFileName,
  });
  const attachment = await withPrismaRetry(() =>
    prisma.projectAttachment.create({
      data: {
        projectId: input.projectId,
        privateFolderId: input.folderId,
        uploadedById: user.id,
        fileName: uniqueFileName,
        originalFileName: input.originalFileName,
        mimeType: input.mimeType.trim() || "application/octet-stream",
        fileSize: input.fileSize,
        bucket: getS3BucketName(),
        storageKey,
        assetType: AttachmentAssetType.PROJECT_PRIVATE_FILE,
        status: AttachmentStatus.UPLOADING,
      },
      select: { id: true, fileName: true, storageKey: true },
    }),
  );
  const uploadTarget = await createPresignedUploadTarget({
    storageKey: attachment.storageKey,
    mimeType: input.mimeType.trim() || "application/octet-stream",
    endpointMode:
      input.uploadEndpointMode ?? getDefaultS3UploadEndpointMode(),
  });

  return {
    attachmentId: attachment.id,
    fileName: attachment.fileName,
    uploadUrl: uploadTarget.uploadUrl,
    uploadHost: uploadTarget.uploadHost,
    uploadEndpointMode: uploadTarget.endpointMode,
    uploadRegion: uploadTarget.region,
    uploadExpiresInSeconds: uploadTarget.expiresInSeconds,
    uploadExpectedHeaders: uploadTarget.expectedHeaders,
    storageKey: attachment.storageKey,
  } as const;
}

export async function completeProjectPrivateFileUpload(
  user: PrivateFolderUser,
  input: {
    projectId: string;
    folderId: string;
    attachmentId: string;
    failed?: boolean;
  },
) {
  await getOwnedPrivateFolder(user, input);
  const attachment = await assertProjectPrivateAttachmentAccess(
    user,
    input.attachmentId,
  );

  if (
    attachment.projectId !== input.projectId ||
    attachment.privateFolderId !== input.folderId ||
    attachment.uploadedById !== user.id
  ) {
    throw new Error("Private upload context is invalid.");
  }
  const expectedPrefix = `projects/${input.projectId}/private/${input.folderId}/`;
  if (!attachment.storageKey.startsWith(expectedPrefix)) {
    throw new Error("Private upload context is invalid.");
  }
  if (attachment.status === AttachmentStatus.READY) {
    return mapPrivateFile(attachment);
  }
  if (attachment.status !== AttachmentStatus.UPLOADING) {
    throw new Error("Attachment cannot be completed.");
  }
  if (input.failed) {
    await withPrismaRetry(() =>
      prisma.projectAttachment.update({
        where: { id: attachment.id },
        data: { status: AttachmentStatus.FAILED },
      }),
    );
    return null;
  }

  const ready = await withPrismaRetry(() =>
    prisma.projectAttachment.update({
      where: { id: attachment.id },
      data: { status: AttachmentStatus.READY },
      select: {
        id: true,
        projectId: true,
        privateFolderId: true,
        bucket: true,
        storageKey: true,
        originalFileName: true,
        mimeType: true,
        fileSize: true,
        status: true,
        uploadedById: true,
        createdAt: true,
        uploadedBy: { select: { name: true, email: true } },
        privateFolder: { select: { projectId: true, ownerUserId: true } },
      },
    }),
  );
  return mapPrivateFile(ready);
}

async function getExactPrivateFile(
  user: PrivateFolderUser,
  input: { projectId: string; folderId: string; fileId: string },
) {
  await getOwnedPrivateFolder(user, input);
  const attachment = await assertProjectPrivateAttachmentAccess(
    user,
    input.fileId,
  );
  if (
    attachment.projectId !== input.projectId ||
    attachment.privateFolderId !== input.folderId ||
    attachment.status !== AttachmentStatus.READY
  ) {
    throw new Error("Private file not found.");
  }
  return attachment;
}

export async function getProjectPrivateFilePreviewUrl(
  user: PrivateFolderUser,
  input: { projectId: string; folderId: string; fileId: string },
) {
  const attachment = await getExactPrivateFile(user, input);
  return createPresignedPreviewUrl({
    bucket: attachment.bucket,
    storageKey: attachment.storageKey,
    fileName: attachment.originalFileName,
    mimeType: attachment.mimeType,
  });
}

export async function getProjectPrivateFileDownloadUrl(
  user: PrivateFolderUser,
  input: { projectId: string; folderId: string; fileId: string },
) {
  const attachment = await getExactPrivateFile(user, input);
  return createPresignedDownloadUrl({
    bucket: attachment.bucket,
    storageKey: attachment.storageKey,
    fileName: attachment.originalFileName,
    mimeType: attachment.mimeType,
  });
}

export async function getProjectPrivateTextFileContent(
  user: PrivateFolderUser,
  input: {
    projectId: string;
    folderId: string;
    fileId: string;
    excerpt?: boolean;
  },
) {
  const attachment = await getExactPrivateFile(user, input);
  const extension = attachment.originalFileName
    .split(".")
    .pop()
    ?.toLocaleLowerCase("en");
  const isTextFile =
    attachment.mimeType.toLocaleLowerCase("en").startsWith("text/") ||
    ["txt", "md", "json", "xml"].includes(extension ?? "");
  if (!isTextFile) {
    throw new Error("This file does not contain previewable text.");
  }

  const maxBytes = input.excerpt
    ? PRIVATE_TEXT_EXCERPT_MAX_BYTES
    : PRIVATE_TEXT_PREVIEW_MAX_BYTES;
  const content = await readTextObject({
    bucket: attachment.bucket,
    storageKey: attachment.storageKey,
    maxBytes,
  });
  return { content, truncated: attachment.fileSize > maxBytes };
}

export async function deleteProjectPrivateFile(
  user: PrivateFolderUser,
  input: { projectId: string; folderId: string; fileId: string },
) {
  const attachment = await getExactPrivateFile(user, input);
  await deleteObjectIfNeeded(attachment.storageKey, attachment.bucket).catch(
    () => undefined,
  );
  await withPrismaRetry(() =>
    prisma.projectAttachment.update({
      where: { id: attachment.id },
      data: { status: AttachmentStatus.DELETED },
    }),
  );
}
