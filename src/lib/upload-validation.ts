export const PROJECT_ASSET_ALLOWED_EXTENSIONS = [
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
  "csv",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
] as const;

export const SUBMISSION_IMAGE_ALLOWED_EXTENSIONS = [
  "png",
  "jpg",
  "jpeg",
  "webp",
] as const;

export const SUBMISSION_IMAGE_ALLOWED_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

export const PROFILE_IMAGE_ALLOWED_EXTENSIONS = [
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
] as const;

export const PROFILE_IMAGE_ALLOWED_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
] as const;

export const COMPLETION_DOCUMENT_ALLOWED_EXTENSIONS = [
  "pdf",
  "png",
  "jpg",
  "jpeg",
  "webp",
] as const;

export const COMPLETION_DOCUMENT_ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

const projectAssetAllowedExtensionSet = new Set<string>(
  PROJECT_ASSET_ALLOWED_EXTENSIONS,
);
const submissionImageAllowedExtensionSet = new Set<string>(
  SUBMISSION_IMAGE_ALLOWED_EXTENSIONS,
);
const submissionImageAllowedMimeTypeSet = new Set<string>(
  SUBMISSION_IMAGE_ALLOWED_MIME_TYPES,
);
const profileImageAllowedExtensionSet = new Set<string>(
  PROFILE_IMAGE_ALLOWED_EXTENSIONS,
);
const profileImageAllowedMimeTypeSet = new Set<string>(
  PROFILE_IMAGE_ALLOWED_MIME_TYPES,
);
const completionDocumentAllowedExtensionSet = new Set<string>(
  COMPLETION_DOCUMENT_ALLOWED_EXTENSIONS,
);
const completionDocumentAllowedMimeTypeSet = new Set<string>(
  COMPLETION_DOCUMENT_ALLOWED_MIME_TYPES,
);

export type UploadFileTypeErrorPayload = {
  error: string;
  code: "FILE_TYPE_NOT_ALLOWED";
  fileName: string;
  detectedExtension: string | null;
  detectedMimeType: string | null;
  allowedExtensions: string[];
  allowedFormats: string[];
};

export class UploadFileTypeError extends Error {
  payload: UploadFileTypeErrorPayload;

  constructor(payload: UploadFileTypeErrorPayload) {
    super(payload.error);
    this.name = "UploadFileTypeError";
    this.payload = payload;
  }
}

export function getFileExtension(fileName: string) {
  const parts = fileName.split(".");

  if (parts.length < 2) {
    return "";
  }

  return parts.at(-1)?.toLowerCase() ?? "";
}

export function getAllowedFormatLabels(extensions: readonly string[]) {
  return extensions.map((extension) => extension.toUpperCase());
}

export function isAllowedAssetFile(fileName: string) {
  const extension = getFileExtension(fileName);
  return extension ? projectAssetAllowedExtensionSet.has(extension) : false;
}

export function isAllowedSubmissionImage(fileName: string, mimeType: string) {
  const extension = getFileExtension(fileName);

  return (
    (!!extension && submissionImageAllowedExtensionSet.has(extension)) ||
    submissionImageAllowedMimeTypeSet.has(mimeType.toLowerCase())
  );
}

export function isAllowedProfileImage(fileName: string, mimeType: string) {
  const extension = getFileExtension(fileName);

  return (
    (!!extension && profileImageAllowedExtensionSet.has(extension)) ||
    profileImageAllowedMimeTypeSet.has(mimeType.toLowerCase())
  );
}

export function isAllowedProjectCompletionDocument(
  fileName: string,
  mimeType: string,
) {
  const extension = getFileExtension(fileName);

  return (
    (!!extension && completionDocumentAllowedExtensionSet.has(extension)) ||
    completionDocumentAllowedMimeTypeSet.has(mimeType.toLowerCase())
  );
}

export function buildFileTypeNotAllowedPayload(input: {
  fileName: string;
  mimeType?: string | null;
  allowedExtensions: readonly string[];
  error?: string;
}): UploadFileTypeErrorPayload {
  const extension = getFileExtension(input.fileName);
  const mimeType = input.mimeType?.trim() || null;

  return {
    error: input.error ?? "File type is not allowed.",
    code: "FILE_TYPE_NOT_ALLOWED",
    fileName: input.fileName.trim() || "Selected file",
    detectedExtension: extension ? `.${extension}` : null,
    detectedMimeType: mimeType,
    allowedExtensions: [...input.allowedExtensions],
    allowedFormats: getAllowedFormatLabels(input.allowedExtensions),
  };
}

export function formatUploadFileTypeError(payload: UploadFileTypeErrorPayload) {
  const detected =
    payload.detectedMimeType && payload.detectedExtension
      ? `Detected type: ${payload.detectedMimeType} / ${payload.detectedExtension}.`
      : payload.detectedMimeType
        ? `Detected type: ${payload.detectedMimeType}.`
        : payload.detectedExtension
          ? `Detected format: ${payload.detectedExtension}.`
          : "Detected format: unknown.";

  return `This file cannot be uploaded. "${payload.fileName}" is not an allowed format. ${detected} Allowed formats: ${payload.allowedFormats.join(", ")}.`;
}

export function isUploadFileTypeErrorPayload(
  payload: unknown,
): payload is UploadFileTypeErrorPayload {
  return (
    typeof payload === "object" &&
    payload !== null &&
    (payload as { code?: unknown }).code === "FILE_TYPE_NOT_ALLOWED" &&
    typeof (payload as { fileName?: unknown }).fileName === "string" &&
    Array.isArray((payload as { allowedFormats?: unknown }).allowedFormats)
  );
}

export function getUploadErrorMessage(payload: unknown, fallback: string) {
  if (isUploadFileTypeErrorPayload(payload)) {
    return formatUploadFileTypeError(payload);
  }

  if (
    typeof payload === "object" &&
    payload !== null &&
    typeof (payload as { error?: unknown }).error === "string"
  ) {
    return (payload as { error: string }).error;
  }

  return fallback;
}
