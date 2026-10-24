export type RuntimeArchiveEvidence = { submissionId: string; referenceId: string; versionId: string };
export type RuntimeArchiveManifest = { projectId: string; finalDecisionId: string; publishedVersionId: string; categoryId: string; folderId: string | null; files: RuntimeArchiveEvidence[]; nonSensitiveConfirmed: true };
export type RuntimeArchiveCommand = { commandId: string; reason: string; confirmed: true; manifest: RuntimeArchiveManifest };
export class ArchiveRuntimeError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}
const identifier = (v: unknown): v is string => typeof v === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(v);
export function parseRuntimeArchiveCommand(raw: unknown): RuntimeArchiveCommand {
  const fail = (): never => { throw new ArchiveRuntimeError("Invalid runtime Archive publication. Review the selected files again."); };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return fail();
  const c = raw as Record<string, unknown>;
  if (Object.keys(c).sort().join() !== "commandId,confirmed,manifest,reason" || !identifier(c.commandId) || c.confirmed !== true || typeof c.reason !== "string" || !c.reason.trim() || c.reason.trim().length > 2000 || c.reason.includes("\0")) return fail();
  if (!c.manifest || typeof c.manifest !== "object" || Array.isArray(c.manifest)) return fail();
  const m = c.manifest as Record<string, unknown>;
  if (Object.keys(m).sort().join() !== "categoryId,files,finalDecisionId,folderId,nonSensitiveConfirmed,projectId,publishedVersionId" || ![m.projectId,m.finalDecisionId,m.publishedVersionId,m.categoryId].every(identifier) || (m.folderId !== null && !identifier(m.folderId)) || m.nonSensitiveConfirmed !== true || !Array.isArray(m.files) || m.files.length < 1 || m.files.length > 50) return fail();
  const files = m.files.map((f: unknown) => {
    if (!f || typeof f !== "object" || Array.isArray(f)) return fail();
    const item = f as Record<string, unknown>;
    if (Object.keys(item).sort().join() !== "referenceId,submissionId,versionId" || !Object.values(item).every(identifier)) return fail();
    return { submissionId: item.submissionId as string, referenceId: item.referenceId as string, versionId: item.versionId as string };
  }).sort((a,b) => a.submissionId < b.submissionId ? -1 : a.submissionId > b.submissionId ? 1 : 0);
  if (new Set(files.map(f => f.submissionId)).size !== files.length) return fail();
  return { commandId: c.commandId, reason: c.reason.trim(), confirmed: true, manifest: { projectId: m.projectId as string, finalDecisionId: m.finalDecisionId as string, publishedVersionId: m.publishedVersionId as string, categoryId: m.categoryId as string, folderId: m.folderId as string | null, files, nonSensitiveConfirmed: true } };
}
