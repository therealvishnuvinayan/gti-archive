/** Stable business entry points, never bucket/key or a caller-supplied actor. */
export const fileSourceKinds = ["project-attachment", "library-attachment", "flexible-attachment", "archived-project-file",
  "runtime-archive-file", "manual-archive-file", "manual-library-asset", "completion-submission", "completion-document"] as const;
export type FileSource = { kind: typeof fileSourceKinds[number]; id: string };
export class FileIdentityError extends Error {
  constructor(readonly code: string) { super(code); this.name = "FileIdentityError"; }
}
export function fileCondition(condition: unknown, code: string): asserts condition {
  if (!condition) throw new FileIdentityError(code);
}
export function parseFileSource(raw: unknown): FileSource {
  fileCondition(raw && typeof raw === "object" && !Array.isArray(raw), "INVALID_FILE_SOURCE");
  const value = raw as Record<string, unknown>;
  fileCondition(Object.keys(value).length === 2 && Object.hasOwn(value, "kind") && Object.hasOwn(value, "id") &&
    typeof value.kind === "string" && fileSourceKinds.some(kind => kind === value.kind) &&
    typeof value.id === "string" && value.id.length > 0 && value.id.length <= 256 && value.id.trim() === value.id && !value.id.includes("\0"), "INVALID_FILE_SOURCE");
  return { kind: value.kind as FileSource["kind"], id: value.id };
}

/** Observation from trusted storage, never upload-completion request fields.
 * ETag is an opaque validator, not a cryptographic digest. */
export type FileObjectObservation = {
  ContentLength?: number; ContentType?: string; ETag?: string; VersionId?: string;
  ChecksumSHA256?: string; ChecksumType?: string;
};
export function captureFileIntegrity(observation: FileObjectObservation, expected: { fileSize: number; mimeType: string }) {
  fileCondition(observation.ContentLength === expected.fileSize && observation.ContentType === expected.mimeType &&
    typeof observation.ETag === "string" && observation.ETag.trim().length > 0, "INVALID_FILE_OBJECT");
  const checksum = observation.ChecksumType === "FULL_OBJECT" ? observation.ChecksumSHA256 : undefined;
  fileCondition(checksum === undefined || /^[A-Za-z0-9+/]{43}=$/.test(checksum), "INVALID_FILE_CHECKSUM");
  return { objectETag: observation.ETag,
    objectVersionId: observation.VersionId && observation.VersionId !== "null" ? observation.VersionId : null,
    checksumSha256: checksum ?? null,
    checksumEvidence: checksum ? "S3_FULL_OBJECT_SHA256" as const : "UNKNOWN" as const,
  };
}
