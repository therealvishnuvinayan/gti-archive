import { randomUUID } from "node:crypto";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  AttachmentAssetType,
  ProjectCompletionDocumentType,
} from "@prisma/client";

const DEFAULT_MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024;
const PROFILE_AVATAR_MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024;

const allowedExtensions = new Set([
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
  "pdf",
  "ai",
  "psd",
  "zip",
  "rar",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
]);

let cachedClient: S3Client | null = null;

function getRequiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function getOptionalBooleanEnv(name: string, defaultValue = false) {
  const value = process.env[name]?.trim().toLowerCase();

  if (!value) {
    return defaultValue;
  }

  if (["1", "true", "yes", "on"].includes(value)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(value)) {
    return false;
  }

  return defaultValue;
}

export function getS3BucketName() {
  return getRequiredEnv("AWS_S3_BUCKET");
}

export function isS3TransferAccelerationEnabled() {
  return getOptionalBooleanEnv("AWS_S3_TRANSFER_ACCELERATION", false);
}

export function getMaxAssetUploadBytes() {
  const raw = process.env.ASSET_UPLOAD_MAX_BYTES;
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;

  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }

  return DEFAULT_MAX_FILE_SIZE_BYTES;
}

function getS3Client() {
  if (cachedClient) {
    return cachedClient;
  }

  cachedClient = new S3Client({
    region: getRequiredEnv("AWS_REGION"),
    useAccelerateEndpoint: isS3TransferAccelerationEnabled(),
    credentials: {
      accessKeyId: getRequiredEnv("AWS_ACCESS_KEY_ID"),
      secretAccessKey: getRequiredEnv("AWS_SECRET_ACCESS_KEY"),
    },
  });

  return cachedClient;
}

export function sanitizeFileName(input: string) {
  const normalized = input
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();

  if (!normalized) {
    return `file-${randomUUID()}`;
  }

  return normalized;
}

export function getFileExtension(fileName: string) {
  const parts = fileName.split(".");

  if (parts.length < 2) {
    return "";
  }

  return parts.at(-1)?.toLowerCase() ?? "";
}

export function isAllowedAssetFile(fileName: string) {
  const extension = getFileExtension(fileName);
  return extension ? allowedExtensions.has(extension) : false;
}

const submissionImageExtensions = new Set(["png", "jpg", "jpeg", "webp"]);
const submissionImageMimeTypes = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);

const profileImageExtensions = new Set(["png", "jpg", "jpeg", "gif", "webp"]);
const profileImageMimeTypes = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

const completionDocumentExtensions = new Set(["pdf", "png", "jpg", "jpeg", "webp"]);
const completionDocumentMimeTypes = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
]);

export function isAllowedSubmissionImage(fileName: string, mimeType: string) {
  const extension = getFileExtension(fileName);

  return (
    (!!extension && submissionImageExtensions.has(extension)) ||
    submissionImageMimeTypes.has(mimeType.toLowerCase())
  );
}

export function getMaxProfileAvatarBytes() {
  return PROFILE_AVATAR_MAX_FILE_SIZE_BYTES;
}

export function isAllowedProfileImage(fileName: string, mimeType: string) {
  const extension = getFileExtension(fileName);

  return (
    (!!extension && profileImageExtensions.has(extension)) ||
    profileImageMimeTypes.has(mimeType.toLowerCase())
  );
}

export function isAllowedProjectCompletionDocument(fileName: string, mimeType: string) {
  const extension = getFileExtension(fileName);

  return (
    (!!extension && completionDocumentExtensions.has(extension)) ||
    completionDocumentMimeTypes.has(mimeType.toLowerCase())
  );
}

export function buildUserAvatarKey(userId: string, originalFileName: string) {
  const safeFileName = sanitizeFileName(originalFileName);
  const uniqueFileName = `${Date.now()}-${randomUUID().slice(0, 8)}-${safeFileName}`;

  return `users/${userId}/avatar/${uniqueFileName}`;
}

type BuildProjectAssetKeyInput = {
  projectId: string;
  stageId?: string | null;
  revisionId?: string | null;
  commentId?: string | null;
  assetType: AttachmentAssetType;
  safeFileName: string;
};

export function buildProjectAssetKey({
  projectId,
  stageId,
  revisionId,
  commentId,
  assetType,
  safeFileName,
}: BuildProjectAssetKeyInput) {
  switch (assetType) {
    case AttachmentAssetType.REVISION_ORIGINAL: {
      if (!stageId || !revisionId) {
        throw new Error("Revision original assets require stageId and revisionId.");
      }

      return `projects/${projectId}/stages/${stageId}/revisions/${revisionId}/assets/original/${safeFileName}`;
    }
    case AttachmentAssetType.STAGE_SUBMISSION: {
      if (!stageId || !commentId) {
        throw new Error("Stage submissions require stageId and commentId.");
      }

      if (revisionId) {
        return `projects/${projectId}/stages/${stageId}/revisions/${revisionId}/comments/${commentId}/submissions/${safeFileName}`;
      }

      return `projects/${projectId}/stages/${stageId}/comments/${commentId}/submissions/${safeFileName}`;
    }
    case AttachmentAssetType.REVISION_PREVIEW: {
      if (!stageId || !revisionId) {
        throw new Error("Revision preview assets require stageId and revisionId.");
      }

      return `projects/${projectId}/stages/${stageId}/revisions/${revisionId}/assets/preview/${safeFileName}`;
    }
    case AttachmentAssetType.REVISION_THUMBNAIL: {
      if (!stageId || !revisionId) {
        throw new Error("Revision thumbnail assets require stageId and revisionId.");
      }

      return `projects/${projectId}/stages/${stageId}/revisions/${revisionId}/assets/thumbnails/${safeFileName}`;
    }
    case AttachmentAssetType.COMMENT_ATTACHMENT: {
      if (!stageId || !commentId) {
        throw new Error("Comment attachments require stageId and commentId.");
      }

      if (revisionId) {
        return `projects/${projectId}/stages/${stageId}/revisions/${revisionId}/comments/${commentId}/attachments/${safeFileName}`;
      }

      return `projects/${projectId}/stages/${stageId}/comments/${commentId}/attachments/${safeFileName}`;
    }
    case AttachmentAssetType.FINAL_ARCHIVE: {
      if (!stageId) {
        throw new Error("Final archive assets require stageId.");
      }

      return `projects/${projectId}/stages/${stageId}/final/archive/${safeFileName}`;
    }
    case AttachmentAssetType.GENERAL_PROJECT_ASSET:
    default:
      return `projects/${projectId}/assets/general/${safeFileName}`;
  }
}

type BuildProjectCompletionDocumentKeyInput = {
  projectId: string;
  documentType: ProjectCompletionDocumentType;
  safeFileName: string;
};

export function buildProjectCompletionDocumentKey({
  projectId,
  documentType,
  safeFileName,
}: BuildProjectCompletionDocumentKeyInput) {
  switch (documentType) {
    case ProjectCompletionDocumentType.AUTHORITY_APPROVAL_PROOF:
      return `archives/${projectId}/completion/approval/${safeFileName}`;
    case ProjectCompletionDocumentType.COPYRIGHT_TRANSFER:
      return `archives/${projectId}/completion/copyright/${safeFileName}`;
    case ProjectCompletionDocumentType.INVOICE:
    default:
      return `archives/${projectId}/completion/invoices/${safeFileName}`;
  }
}

type PresignedUploadInput = {
  bucket?: string;
  storageKey: string;
  mimeType: string;
  expiresInSeconds?: number;
};

export async function createPresignedUploadUrl({
  bucket = getS3BucketName(),
  storageKey,
  mimeType,
  expiresInSeconds = 60 * 10,
}: PresignedUploadInput) {
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: storageKey,
    ContentType: mimeType,
  });

  return getSignedUrl(getS3Client(), command, {
    expiresIn: expiresInSeconds,
  });
}

type PresignedDownloadInput = {
  bucket?: string;
  storageKey: string;
  fileName: string;
  mimeType?: string;
  expiresInSeconds?: number;
};

export async function createPresignedDownloadUrl({
  bucket = getS3BucketName(),
  storageKey,
  fileName,
  expiresInSeconds = 60 * 5,
}: PresignedDownloadInput) {
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: storageKey,
    ResponseContentDisposition: `attachment; filename="${fileName}"`,
  });

  return getSignedUrl(getS3Client(), command, {
    expiresIn: expiresInSeconds,
  });
}

export async function createPresignedPreviewUrl({
  bucket = getS3BucketName(),
  storageKey,
  fileName,
  mimeType,
  expiresInSeconds = 60 * 5,
}: PresignedDownloadInput) {
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: storageKey,
    ResponseContentDisposition: `inline; filename="${fileName}"`,
    ResponseContentType: mimeType || undefined,
  });

  return getSignedUrl(getS3Client(), command, {
    expiresIn: expiresInSeconds,
  });
}

export async function getObjectMetadata(
  storageKey: string,
  bucket = getS3BucketName(),
) {
  return getS3Client().send(
    new HeadObjectCommand({
      Bucket: bucket,
      Key: storageKey,
    }),
  );
}

export async function deleteObjectIfNeeded(
  storageKey: string,
  bucket = getS3BucketName(),
) {
  await getS3Client().send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: storageKey,
    }),
  );
}
