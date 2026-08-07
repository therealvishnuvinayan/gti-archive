import { AttachmentAssetType } from "@prisma/client";

import {
  completeAttachmentUpload,
  deleteAttachmentForUser,
  getAttachmentDownloadUrlForUser,
  requestAttachmentUpload,
  type ProjectHistoryAccessUser,
  type RequestUploadInput,
} from "@/lib/project-history";
import {
  assertResearchFolderReadAccess,
  assertResearchFolderWriteAccess,
} from "@/lib/project-research-access";
import { prisma, withPrismaRetry } from "@/lib/prisma";

export async function requestProjectResearchFileUpload(
  user: ProjectHistoryAccessUser,
  input: {
    projectId: string;
    folderId: string;
    originalFileName: string;
    mimeType: string;
    fileSize: number;
    uploadEndpointMode?: RequestUploadInput["uploadEndpointMode"];
  },
) {
  await assertResearchFolderWriteAccess(user, {
    projectId: input.projectId,
    folderId: input.folderId,
  });

  return requestAttachmentUpload(user, {
    projectId: input.projectId,
    originalFileName: input.originalFileName,
    mimeType: input.mimeType.trim() || "application/octet-stream",
    fileSize: input.fileSize,
    assetType: AttachmentAssetType.PROJECT_RESEARCH_FILE,
    uploadEndpointMode: input.uploadEndpointMode,
    researchFolderId: input.folderId,
  });
}

export async function completeProjectResearchFileUpload(
  user: ProjectHistoryAccessUser,
  input: {
    projectId: string;
    folderId: string;
    attachmentId: string;
    failed?: boolean;
  },
) {
  await assertResearchFolderWriteAccess(user, {
    projectId: input.projectId,
    folderId: input.folderId,
  });

  const attachment = await withPrismaRetry(() =>
    prisma.projectAttachment.findFirst({
      where: {
        id: input.attachmentId,
        projectId: input.projectId,
        uploadedById: user.id,
        assetType: AttachmentAssetType.PROJECT_RESEARCH_FILE,
      },
      select: { id: true },
    }),
  );

  if (!attachment) {
    throw new Error("Research upload not found.");
  }

  return completeAttachmentUpload(
    user,
    attachment.id,
    Boolean(input.failed),
    undefined,
    { researchFolderId: input.folderId },
  );
}

async function getExactResearchFile(
  input: { projectId: string; folderId: string; fileId: string },
) {
  return withPrismaRetry(() =>
    prisma.projectResearchFolderFile.findFirst({
      where: {
        id: input.fileId,
        folderId: input.folderId,
        folder: { workspace: { projectId: input.projectId } },
      },
      select: { id: true, attachmentId: true },
    }),
  );
}

export async function getProjectResearchFileDownloadUrl(
  user: ProjectHistoryAccessUser,
  input: { projectId: string; folderId: string; fileId: string },
) {
  await assertResearchFolderReadAccess(user, input);
  const file = await getExactResearchFile(input);

  if (!file) {
    throw new Error("Research file not found.");
  }

  return getAttachmentDownloadUrlForUser(user, file.attachmentId);
}

export async function deleteProjectResearchFile(
  user: ProjectHistoryAccessUser,
  input: { projectId: string; folderId: string; fileId: string },
) {
  await assertResearchFolderWriteAccess(user, input);
  const file = await getExactResearchFile(input);

  if (!file) {
    throw new Error("Research file not found.");
  }

  await deleteAttachmentForUser(user, file.attachmentId);
}
