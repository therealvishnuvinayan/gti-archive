import { createPresignedDownloadUrl, createPresignedPreviewUrl, readTextObject } from "@/lib/storage/s3";
import { taskAssert } from "./errors";

type StoredFile = { bucket: string; storageKey: string; originalFileName: string; mimeType: string; fileSize: number };
export type TaskFileAccessMode = "download" | "preview" | "text";
export const taskFileReaders = { download: createPresignedDownloadUrl, preview: createPresignedPreviewUrl, text: readTextObject };

// Callers authorize the exact file before reaching storage. Never redirect HTML
// or SVG to an inline browser document; text is returned as JSON and rendered escaped.
export async function readTaskFile(file: StoredFile, mode: TaskFileAccessMode, readers = taskFileReaders) {
  const input = { bucket: file.bucket, storageKey: file.storageKey, fileName: file.originalFileName, mimeType: file.mimeType, expiresInSeconds: 60 };
  if (mode === "download") return { url: await readers.download(input) };
  if (mode === "text") {
    taskAssert(file.mimeType.startsWith("text/"), "Text preview is not available for this file.");
    const maxBytes = 1024 * 1024;
    return { content: await readers.text({ bucket: file.bucket, storageKey: file.storageKey, maxBytes }), truncated: file.fileSize > maxBytes };
  }
  taskAssert(mode === "preview" && (/^image\/(png|jpeg|gif|webp|avif|bmp)$/.test(file.mimeType) || file.mimeType === "application/pdf"), "Preview is not available for this file. Download it instead.");
  return { url: await readers.preview(input) };
}
