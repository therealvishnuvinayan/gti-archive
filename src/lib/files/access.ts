import "server-only";
import { nativeReferenceSelect, nativeFileSelect } from "./legacy-select";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { runtimeAuthorization } from "@/lib/authorization/runtime";
import { readPinnedStoredObject } from "@/lib/storage/s3";
import { sharedFileIdentityAvailable } from "./activation";
import { captureFileIntegrity, fileCondition, parseFileSource, type FileSource } from "./contracts";

type DB = Prisma.TransactionClient;
const objectSelect = { id: true, bucket: true, storageKey: true, originalFileName: true, mimeType: true, fileSize: true } as const;
function referenceWhere(source: FileSource): Prisma.SharedFileReferenceWhereUniqueInput {
  switch (source.kind) {
    case "project-attachment": case "library-attachment": return { projectAttachmentId: source.id };
    case "flexible-attachment": return { flexibleAttachmentId: source.id };
    case "archived-project-file": return { archivedProjectFileId: source.id };
    case "manual-archive-file": return { manualArchiveFileId: source.id };
    case "manual-library-asset": return { manualLibraryAssetId: source.id };
    case "completion-submission": return { completionSubmissionId: source.id };
    case "completion-document": return { completionDocumentId: source.id };
  }
}
async function sourceRecord(tx: DB, source: FileSource) {
  switch (source.kind) {
    case "project-attachment": case "library-attachment":
      return tx.projectAttachment.findUniqueOrThrow({ where: { id: source.id }, select: { ...objectSelect, status: true, projectId: true, stageId: true } });
    case "flexible-attachment":
      return tx.flexibleProjectAttachment.findUniqueOrThrow({ where: { id: source.id }, select: { ...objectSelect, status: true, projectId: true, milestoneId: true } });
    case "manual-archive-file":
      return tx.manualArchiveFile.findUniqueOrThrow({ where: { id: source.id }, select: { ...objectSelect, status: true } });
    case "manual-library-asset":
      return tx.manualLibraryAsset.findUniqueOrThrow({ where: { id: source.id }, select: { ...objectSelect, status: true } });
    case "archived-project-file": {
      const row = await tx.archivedProjectFile.findUniqueOrThrow({ where: { id: source.id }, select: { ...objectSelect, projectId: true } });
      return { ...row, status: "READY" as const };
    }
    case "completion-document": {
      const row = await tx.projectCompletionDocument.findUniqueOrThrow({ where: { id: source.id }, select: { ...objectSelect, projectId: true, archiveFileName: true } });
      return { ...row, status: "READY" as const };
    }
    case "completion-submission": {
      const row = await tx.completionDocumentSubmission.findUniqueOrThrow({ where: { id: source.id }, select: { ...objectSelect, status: true, projectId: true, uploadedAt: true, objectETag: true } });
      return { ...row, status: ["SUBMITTED", "ACCEPTED", "REJECTED"].includes(row.status) && row.uploadedAt && row.objectETag ? "READY" as const : row.status };
    }
  }
}

/** A canonical ID is not a capability. Always enter through a currently authorized
 * business source; never search for another, more permissive link to the version. */
async function withSource<T>(raw: unknown, download: boolean, execute: (tx: DB, source: FileSource, record: Awaited<ReturnType<typeof sourceRecord>>) => Promise<T>) {
  const source = parseFileSource(raw);
  const read = async (tx: DB, expectedProjectId?: string) => {
    const record = await sourceRecord(tx, source);
    fileCondition(record.status === "READY", "FILE_NOT_READY");
    if (expectedProjectId) fileCondition("projectId" in record && record.projectId === expectedProjectId, "FILE_SOURCE_CHANGED");
    return execute(tx, source, record);
  };
  // Use one consistent source/policy snapshot; identity and session locks are
  // still taken by the central service. No metadata is loaded after it commits.
  const authorize = (request: unknown, expectedProjectId?: string) => runtimeAuthorization.runAuthorized(request,
    tx => read(tx, expectedProjectId), { isolationLevel: "Serializable", timeout: 30_000 });
  switch (source.kind) {
    case "project-attachment": return authorize({ capability: "project.viewFile", targetId: `file:${source.id}` });
    case "flexible-attachment": return authorize({ capability: "project.viewFile", targetId: `flexible-file:${source.id}` });
    case "library-attachment": return authorize({ capability: download ? "library.download" : "library.view", targetId: `attachment:${source.id}` });
    case "manual-library-asset": return authorize({ capability: download ? "library.download" : "library.view", targetId: `manual:${source.id}` });
    case "archived-project-file": case "manual-archive-file":
      return authorize({ capability: download ? "archive.download" : "archive.view", targetId: `file:${source.id}` });
    case "completion-document": case "completion-submission": {
      // Only the resource's project ID is resolved before policy evaluation. No
      // metadata is returned until fresh V2 full-project authority is established.
      const selector = { where: { id: source.id }, select: { projectId: true } } as const;
      const record = source.kind === "completion-document" ? await prisma.projectCompletionDocument.findUniqueOrThrow(selector)
        : await prisma.completionDocumentSubmission.findUniqueOrThrow(selector);
      return authorize({ capability: "project.view", targetId: `structured:${record.projectId}` }, record.projectId);
    }
  }
}

async function adoptedReference(tx: DB, source: FileSource, record: Awaited<ReturnType<typeof sourceRecord>>) {
  if (!await sharedFileIdentityAvailable(tx)) return null;
  const reference = await tx.sharedFileReference.findUnique({ where: referenceWhere(source), select: { ...nativeReferenceSelect, version: { include: { file: { select: nativeFileSelect } } } } });
  if (!reference) return null;
  const version = reference.version;
  fileCondition(version.status === "READY" && version.bucket === record.bucket && version.storageKey === record.storageKey &&
    version.fileSize === record.fileSize && version.mimeType === record.mimeType, "FILE_REFERENCE_CHANGED");
  const projectId = "projectId" in record ? record.projectId : null;
  fileCondition((source.kind === "flexible-attachment" ? version.file.flexibleProjectId : version.file.projectId) === projectId &&
    (reference.role !== "SOURCE" || !("stageId" in record) || record.stageId === version.file.stageId) &&
    (reference.role !== "SOURCE" || !("milestoneId" in record) || record.milestoneId === version.file.milestoneId), "FILE_ORIGIN_CHANGED");
  return reference;
}

export async function getSharedFileIdentity(raw: unknown) {
  return withSource(raw, false, async (tx, source, record) => {
    const reference = await adoptedReference(tx, source, record);
    const version = reference?.version;
    // No storage keys, other references, unrelated approvals, external submitter
    // addresses or project history are exposed through Archive/Library grants.
    return { source, fileId: version?.fileId ?? null, versionId: version?.id ?? null, number: version?.number ?? null,
      originalFileName: record.originalFileName, mimeType: record.mimeType, fileSize: record.fileSize,
      adoption: version ? "VERSIONED" as const : "LEGACY_UNMAPPED" as const,
      integrity: { checksumEvidence: version?.checksumEvidence ?? "UNKNOWN", checksumSha256: version?.checksumSha256 ?? null,
        objectVersionPinned: !!version?.objectVersionId, applicationSealed: version?.applicationSealed ?? false } };
  });
}

export async function getSharedFileDownloadPath(source: FileSource, inline = false) {
  const identity = await getSharedFileIdentity(source);
  return identity.versionId ? `/api/file-versions/${encodeURIComponent(identity.versionId)}/download?kind=${source.kind}&id=${encodeURIComponent(source.id)}${inline ? "&disposition=inline" : ""}` : null;
}

/** Conditional S3 GET prevents a later overwrite from changing this response.
 * The version/source association, current business policy and metadata are checked
 * in the same authorization transaction. No generic version-ID access bypass. */
export async function openSharedFileVersion(rawSource: unknown, versionId: string) {
  fileCondition(typeof versionId === "string" && versionId.length > 0 && versionId.length <= 256, "INVALID_FILE_VERSION");
  return withSource(rawSource, true, async (tx, source, record) => {
    const reference = await adoptedReference(tx, source, record);
    fileCondition(reference?.versionId === versionId, "FILE_VERSION_SOURCE_MISMATCH");
    const version = reference.version;
    fileCondition(version.objectETag, "FILE_INTEGRITY_UNAVAILABLE");
    const object = await readPinnedStoredObject({ bucket: version.bucket, storageKey: version.storageKey,
      objectVersionId: version.objectVersionId, objectETag: version.objectETag, checksumSha256: version.checksumSha256 });
    try {
      const observed = captureFileIntegrity(object, version);
      fileCondition(observed.objectETag === version.objectETag && (!version.objectVersionId || version.objectVersionId === observed.objectVersionId) &&
        (!version.checksumSha256 || version.checksumSha256 === observed.checksumSha256), "FILE_VERSION_OBJECT_CHANGED");
      fileCondition(object.Body, "FILE_BODY_UNAVAILABLE");
      return { body: object.Body, originalFileName: "archiveFileName" in record && typeof record.archiveFileName === "string" ? record.archiveFileName : version.originalFileName, mimeType: version.mimeType, fileSize: version.fileSize };
    } catch (error) {
      if (object.Body && "destroy" in object.Body) object.Body.destroy();
      throw error;
    }
  });
}

/** Native folder text previews retain the same version pin as downloads. */
export async function readSharedFileTextIfAdopted(source: FileSource, maxBytes: number) {
  const identity = await getSharedFileIdentity(source);
  if (!identity.versionId) return null;
  const opened = await openSharedFileVersion(source, identity.versionId);
  const reader = opened.body.transformToWebStream().getReader();
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (size < maxBytes) {
      const next = await reader.read(); if (next.done) break;
      const chunk = next.value.subarray(0, maxBytes - size); chunks.push(chunk); size += chunk.length;
    }
  } finally { await reader.cancel(); }
  return Buffer.concat(chunks).toString("utf8");
}
