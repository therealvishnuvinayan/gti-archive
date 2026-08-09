import { randomUUID } from "node:crypto";
import {
  AttachmentAssetType,
  AttachmentStatus,
  Prisma,
  ProjectAttachmentUploadSource,
  ProjectFileChecklistItemStatus,
  ProjectFileChecklistRequestChannel,
  ProjectFileChecklistRequestStatus,
  ProjectFileChecklistRequestWorkflowStatus,
  ProjectFileChecklistResponseSource,
} from "@prisma/client";

import { hashExternalChecklistToken } from "@/lib/checklist-external-token";
import { prisma, withPrismaRetry } from "@/lib/prisma";
import {
  getStageFiveFieldDefinition,
  STAGE_FIVE_FIELD_LABELS,
  type StageFiveFieldDefinition,
} from "@/lib/stage-five-fields";
import {
  type StageFiveAttachmentRecord,
  type StageFiveChecklistValue,
  validateStageFiveChecklistResponse,
} from "@/lib/stage-five";
import {
  buildProjectAssetKey,
  createPresignedDownloadUrl,
  createPresignedPreviewUrl,
  createPresignedUploadTarget,
  getDefaultS3UploadEndpointMode,
  getMaxAssetUploadBytes,
  getS3BucketName,
  isAllowedAssetFile,
  sanitizeFileName,
} from "@/lib/storage/s3";
import {
  PROJECT_ASSET_ALLOWED_EXTENSIONS,
  buildFileTypeNotAllowedPayload,
} from "@/lib/upload-validation";

export type ExternalChecklistRequestData =
  | { state: "invalid" | "expired" | "unavailable" }
  | {
      state: "completed";
      projectName: string;
      fieldLabel: string;
      completedAt: string | null;
    }
  | {
      state: "declined";
      projectName: string;
      fieldLabel: string;
      declinedAt: string | null;
    }
  | {
      state: "active";
      projectName: string;
      file: StageFiveAttachmentRecord;
      field: StageFiveFieldDefinition;
      message: string | null;
      requestedBy: string;
      requestedAt: string;
      expiresAt: string;
      recipientName: string;
    };

const externalRequestSelect = {
  id: true,
  projectId: true,
  checklistItemId: true,
  fieldKey: true,
  requestedById: true,
  recipientName: true,
  recipientEmail: true,
  message: true,
  status: true,
  workflowStatus: true,
  requestedAt: true,
  acceptedAt: true,
  completedAt: true,
  declinedAt: true,
  externalTokenHash: true,
  externalTokenExpiresAt: true,
  externalTokenRevokedAt: true,
  project: { select: { name: true } },
  requestedBy: { select: { name: true, email: true } },
  checklist: {
    select: {
      handoffId: true,
      sourceAttachment: {
        select: {
          id: true,
          originalFileName: true,
          mimeType: true,
          fileSize: true,
          bucket: true,
          storageKey: true,
          status: true,
        },
      },
    },
  },
} satisfies Prisma.ProjectFileChecklistRequestSelect;

type ExternalRequestRecord = Prisma.ProjectFileChecklistRequestGetPayload<{
  select: typeof externalRequestSelect;
}>;

function displayName(user: { name: string | null; email: string }) {
  return user.name?.trim() || user.email;
}

function mapAttachment(attachment: ExternalRequestRecord["checklist"]["sourceAttachment"]) {
  return {
    id: attachment.id,
    name: attachment.originalFileName,
    mimeType: attachment.mimeType,
    size: attachment.fileSize,
  } satisfies StageFiveAttachmentRecord;
}

function isActiveExternalRequest(request: ExternalRequestRecord, now = new Date()) {
  return Boolean(
    request.recipientEmail &&
      request.status === ProjectFileChecklistRequestStatus.SENT &&
      (request.workflowStatus === ProjectFileChecklistRequestWorkflowStatus.REQUESTED ||
        request.workflowStatus === ProjectFileChecklistRequestWorkflowStatus.ACCEPTED) &&
      request.externalTokenExpiresAt &&
      request.externalTokenExpiresAt > now &&
      !request.externalTokenRevokedAt,
  );
}

async function findExternalRequest(token: string) {
  const tokenHash = hashExternalChecklistToken(token);
  if (!tokenHash) return null;
  return withPrismaRetry(() =>
    prisma.projectFileChecklistRequest.findFirst({
      where: {
        externalTokenHash: tokenHash,
        channel: ProjectFileChecklistRequestChannel.EMAIL,
      },
      select: externalRequestSelect,
    }),
  );
}

async function findActiveExternalRequest(token: string) {
  const request = await findExternalRequest(token);
  return request && isActiveExternalRequest(request) ? request : null;
}

export async function getExternalChecklistRequestData(
  token: string,
): Promise<ExternalChecklistRequestData> {
  const request = await findExternalRequest(token);
  if (!request) return { state: "invalid" };
  const field = getStageFiveFieldDefinition(request.fieldKey);
  if (!field) return { state: "unavailable" };

  if (request.workflowStatus === ProjectFileChecklistRequestWorkflowStatus.COMPLETED) {
    return {
      state: "completed",
      projectName: request.project.name,
      fieldLabel: field.title,
      completedAt: request.completedAt?.toISOString() ?? null,
    };
  }
  if (request.workflowStatus === ProjectFileChecklistRequestWorkflowStatus.DECLINED) {
    return {
      state: "declined",
      projectName: request.project.name,
      fieldLabel: field.title,
      declinedAt: request.declinedAt?.toISOString() ?? null,
    };
  }
  if (
    request.externalTokenExpiresAt &&
    request.externalTokenExpiresAt <= new Date() &&
    !request.externalTokenRevokedAt
  ) {
    return { state: "expired" };
  }
  if (!isActiveExternalRequest(request) || !request.externalTokenExpiresAt) {
    return { state: "unavailable" };
  }

  await withPrismaRetry(() =>
    prisma.projectFileChecklistRequest.updateMany({
      where: { id: request.id, externalOpenedAt: null },
      data: { externalOpenedAt: new Date() },
    }),
  );
  return {
    state: "active",
    projectName: request.project.name,
    file: mapAttachment(request.checklist.sourceAttachment),
    field,
    message: request.message,
    requestedBy: displayName(request.requestedBy),
    requestedAt: request.requestedAt.toISOString(),
    expiresAt: request.externalTokenExpiresAt.toISOString(),
    recipientName: request.recipientName?.trim() || "External recipient",
  };
}

function fieldSupportsAttachments(field: StageFiveFieldDefinition) {
  return [
    "file",
    "multi-file",
    "finishes",
    "text-attachment",
    "health-warning",
  ].includes(field.control);
}

export async function prepareExternalChecklistAttachment(
  token: string,
  input: { originalFileName: string; mimeType: string; fileSize: number },
) {
  const request = await findActiveExternalRequest(token);
  if (!request?.recipientEmail) return { error: "This request link is unavailable." } as const;
  const field = getStageFiveFieldDefinition(request.fieldKey);
  if (!field || !fieldSupportsAttachments(field)) {
    return { error: "This requested field does not accept file uploads." } as const;
  }
  if (!input.originalFileName.trim()) return { error: "Choose a file to upload." } as const;
  if (!isAllowedAssetFile(input.originalFileName)) {
    return buildFileTypeNotAllowedPayload({
      fileName: input.originalFileName,
      mimeType: input.mimeType,
      allowedExtensions: PROJECT_ASSET_ALLOWED_EXTENSIONS,
    });
  }
  if (!Number.isFinite(input.fileSize) || input.fileSize <= 0) {
    return { error: "File size is invalid." } as const;
  }
  if (input.fileSize > getMaxAssetUploadBytes()) {
    return { error: "This file exceeds the allowed size limit." } as const;
  }

  const uniqueFileName = `${Date.now()}-${randomUUID().slice(0, 8)}-${sanitizeFileName(
    input.originalFileName,
  )}`;
  const storageKey = buildProjectAssetKey({
    projectId: request.projectId,
    assetType: AttachmentAssetType.FILE_CHECKLIST_ATTACHMENT,
    safeFileName: uniqueFileName,
  });
  const attachment = await withPrismaRetry(() =>
    prisma.projectAttachment.create({
      data: {
        projectId: request.projectId,
        uploadedById: request.requestedById,
        fileName: uniqueFileName,
        originalFileName: input.originalFileName,
        mimeType: input.mimeType || "application/octet-stream",
        fileSize: input.fileSize,
        bucket: getS3BucketName(),
        storageKey,
        assetType: AttachmentAssetType.FILE_CHECKLIST_ATTACHMENT,
        checklistResponseRequestId: request.id,
        uploadSource: ProjectAttachmentUploadSource.EXTERNAL_CHECKLIST_REQUEST,
        externalUploaderName: request.recipientName,
        externalUploaderEmail: request.recipientEmail,
        status: AttachmentStatus.UPLOADING,
      },
      select: { id: true, fileName: true, storageKey: true },
    }),
  );
  const uploadTarget = await createPresignedUploadTarget({
    storageKey: attachment.storageKey,
    mimeType: input.mimeType || "application/octet-stream",
    endpointMode: getDefaultS3UploadEndpointMode(),
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
  } as const;
}

export async function completeExternalChecklistAttachment(
  token: string,
  attachmentId: string,
  failed = false,
) {
  const request = await findActiveExternalRequest(token);
  if (!request?.recipientEmail) return { error: "This request link is unavailable." } as const;
  const attachment = await withPrismaRetry(() =>
    prisma.projectAttachment.findFirst({
      where: {
        id: attachmentId,
        projectId: request.projectId,
        checklistResponseRequestId: request.id,
        uploadSource: ProjectAttachmentUploadSource.EXTERNAL_CHECKLIST_REQUEST,
        externalUploaderEmail: request.recipientEmail,
        assetType: AttachmentAssetType.FILE_CHECKLIST_ATTACHMENT,
      },
      select: { id: true, status: true },
    }),
  );
  if (!attachment) return { error: "Attachment not found." } as const;
  if (attachment.status === AttachmentStatus.READY && !failed) return { success: true } as const;
  if (attachment.status !== AttachmentStatus.UPLOADING) {
    return { error: "Attachment cannot be completed." } as const;
  }
  await withPrismaRetry(() =>
    prisma.projectAttachment.update({
      where: { id: attachment.id },
      data: { status: failed ? AttachmentStatus.FAILED : AttachmentStatus.READY },
    }),
  );
  return { success: true } as const;
}

export async function getExternalChecklistSourceFileUrl(
  token: string,
  mode: "preview" | "download",
) {
  const request = await findActiveExternalRequest(token);
  const attachment = request?.checklist.sourceAttachment;
  if (!attachment || attachment.status !== AttachmentStatus.READY) {
    throw new Error("Requested file not found.");
  }
  const input = {
    bucket: attachment.bucket,
    storageKey: attachment.storageKey,
    fileName: attachment.originalFileName,
    mimeType: attachment.mimeType,
  };
  return mode === "download"
    ? createPresignedDownloadUrl(input)
    : createPresignedPreviewUrl(input);
}

export async function submitExternalChecklistResponse(
  token: string,
  input: { value: StageFiveChecklistValue; attachmentIds: string[] },
) {
  const tokenHash = hashExternalChecklistToken(token);
  const request = await findActiveExternalRequest(token);
  if (!tokenHash || !request?.recipientEmail) {
    return { error: "This request link is unavailable." } as const;
  }
  const attachmentIds = Array.from(
    new Set(input.attachmentIds.map((id) => id.trim()).filter(Boolean)),
  );
  if (attachmentIds.length > 20) return { error: "Select no more than 20 files." } as const;
  const validated = validateStageFiveChecklistResponse(
    request.fieldKey,
    input.value,
    attachmentIds,
  );
  if ("error" in validated) return validated;

  if (attachmentIds.length > 0) {
    const attachmentCount = await withPrismaRetry(() =>
      prisma.projectAttachment.count({
        where: {
          id: { in: attachmentIds },
          projectId: request.projectId,
          checklistResponseRequestId: request.id,
          uploadSource: ProjectAttachmentUploadSource.EXTERNAL_CHECKLIST_REQUEST,
          externalUploaderEmail: request.recipientEmail,
          assetType: AttachmentAssetType.FILE_CHECKLIST_ATTACHMENT,
          status: AttachmentStatus.READY,
          fileChecklistItems: { none: {} },
        },
      }),
    );
    if (attachmentCount !== attachmentIds.length) {
      return { error: "One or more response files are invalid or belong to another request." } as const;
    }
  }

  const completedAt = new Date();
  const completed = await withPrismaRetry(() =>
    prisma.$transaction(async (tx) => {
      const updated = await tx.projectFileChecklistRequest.updateMany({
        where: {
          id: request.id,
          externalTokenHash: tokenHash,
          externalTokenRevokedAt: null,
          externalTokenExpiresAt: { gt: completedAt },
          status: ProjectFileChecklistRequestStatus.SENT,
          workflowStatus: {
            in: [
              ProjectFileChecklistRequestWorkflowStatus.REQUESTED,
              ProjectFileChecklistRequestWorkflowStatus.ACCEPTED,
            ],
          },
        },
        data: {
          workflowStatus: ProjectFileChecklistRequestWorkflowStatus.COMPLETED,
          acceptedAt: request.acceptedAt ?? completedAt,
          completedAt,
          responseSource: ProjectFileChecklistResponseSource.EXTERNAL_EMAIL,
          externalResponderName: request.recipientName,
          externalResponderEmail: request.recipientEmail,
          externalTokenRevokedAt: completedAt,
        },
      });
      if (updated.count !== 1) return false;

      await tx.projectFileChecklistItem.update({
        where: { id: request.checklistItemId },
        data: {
          value: validated.value as Prisma.InputJsonValue,
          status: ProjectFileChecklistItemStatus.FILLED,
          updatedById: null,
        },
      });
      await tx.projectFileChecklistItemAttachment.deleteMany({
        where: { checklistItemId: request.checklistItemId },
      });
      if (attachmentIds.length > 0) {
        await tx.projectFileChecklistItemAttachment.createMany({
          data: attachmentIds.map((attachmentId) => ({
            checklistItemId: request.checklistItemId,
            attachmentId,
          })),
        });
      }
      await tx.notification.create({
        data: {
          userId: request.requestedById,
          type: "CHECKLIST_INFORMATION_COMPLETED",
          title: "Requested information received",
          message: `${request.recipientEmail} provided "${STAGE_FIVE_FIELD_LABELS[request.fieldKey]}" for "${request.checklist.sourceAttachment.originalFileName}".`,
          entityType: "CHECKLIST_REQUEST",
          entityId: request.id,
          projectId: request.projectId,
          attachmentId: request.checklist.sourceAttachment.id,
          url: `/projects/${request.projectId}/stages/5?file=${encodeURIComponent(request.checklist.handoffId)}&field=${request.fieldKey}&mode=view`,
        },
      });
      return true;
    }),
  );
  return completed
    ? ({ status: ProjectFileChecklistRequestWorkflowStatus.COMPLETED } as const)
    : ({ error: "This request changed before the response was submitted." } as const);
}

export async function declineExternalChecklistRequest(token: string, reasonInput: string) {
  const reason = reasonInput.trim().replace(/\s+/g, " ");
  if (reason.length < 3) return { error: "Enter a short reason for declining." } as const;
  if (reason.length > 1_000) return { error: "The decline reason is too long." } as const;
  const tokenHash = hashExternalChecklistToken(token);
  const request = await findActiveExternalRequest(token);
  if (!tokenHash || !request?.recipientEmail) {
    return { error: "This request link is unavailable." } as const;
  }
  const declinedAt = new Date();
  const declined = await withPrismaRetry(() =>
    prisma.$transaction(async (tx) => {
      const updated = await tx.projectFileChecklistRequest.updateMany({
        where: {
          id: request.id,
          externalTokenHash: tokenHash,
          externalTokenRevokedAt: null,
          externalTokenExpiresAt: { gt: declinedAt },
          status: ProjectFileChecklistRequestStatus.SENT,
          workflowStatus: {
            in: [
              ProjectFileChecklistRequestWorkflowStatus.REQUESTED,
              ProjectFileChecklistRequestWorkflowStatus.ACCEPTED,
            ],
          },
        },
        data: {
          workflowStatus: ProjectFileChecklistRequestWorkflowStatus.DECLINED,
          declinedAt,
          declineReason: reason,
          responseSource: ProjectFileChecklistResponseSource.EXTERNAL_EMAIL,
          externalResponderName: request.recipientName,
          externalResponderEmail: request.recipientEmail,
          externalTokenRevokedAt: declinedAt,
        },
      });
      if (updated.count !== 1) return false;
      const otherActiveRequests = await tx.projectFileChecklistRequest.count({
        where: {
          checklistItemId: request.checklistItemId,
          status: ProjectFileChecklistRequestStatus.SENT,
          workflowStatus: {
            in: [
              ProjectFileChecklistRequestWorkflowStatus.REQUESTED,
              ProjectFileChecklistRequestWorkflowStatus.ACCEPTED,
            ],
          },
        },
      });
      if (otherActiveRequests === 0) {
        await tx.projectFileChecklistItem.updateMany({
          where: {
            id: request.checklistItemId,
            status: ProjectFileChecklistItemStatus.REQUESTED,
          },
          data: { status: ProjectFileChecklistItemStatus.PENDING },
        });
      }
      await tx.notification.create({
        data: {
          userId: request.requestedById,
          type: "CHECKLIST_INFORMATION_DECLINED",
          title: "Information request declined",
          message: `${request.recipientEmail} could not provide "${STAGE_FIVE_FIELD_LABELS[request.fieldKey]}". ${reason}`.slice(0, 500),
          entityType: "CHECKLIST_REQUEST",
          entityId: request.id,
          projectId: request.projectId,
          url: `/projects/${request.projectId}/stages/5?file=${encodeURIComponent(request.checklist.handoffId)}&field=${request.fieldKey}&mode=edit`,
        },
      });
      return true;
    }),
  );
  return declined
    ? ({ status: ProjectFileChecklistRequestWorkflowStatus.DECLINED } as const)
    : ({ error: "This request changed before it could be declined." } as const);
}
