export class ArchiveSharingError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}
export type AccessCommand = {
  commandId: string; sourceKind: "manual" | "project" | "runtime"; sourceId: string; categoryId: string;
  referenceId: string | null; versionId: string | null; recipientId: string;
  expectedRevision: number; expectedDecisionId: string | null; expectedGrantId: string | null;
  action: "GRANT" | "REVOKE"; expiresAt: string | null; reason: string; confirmed: true;
};
const id = (v: unknown) => typeof v === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(v);
const nullableId = (v: unknown) => v === null || id(v);
export function parseAccessCommand(raw: unknown): AccessCommand {
  const fail = () => { throw new ArchiveSharingError("Confirm the recipient and access scope. A revocation reason is required (1–2000 characters)."); };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return fail();
  const p = raw as Record<string, unknown>;
  if (Object.keys(p).sort().join() !== "action,categoryId,commandId,confirmed,expectedDecisionId,expectedGrantId,expectedRevision,expiresAt,reason,recipientId,referenceId,sourceId,sourceKind,versionId" ||
    !["manual", "project", "runtime"].includes(String(p.sourceKind)) || !["GRANT", "REVOKE"].includes(String(p.action)) || p.confirmed !== true ||
    ![p.commandId, p.sourceId, p.categoryId, p.recipientId].every(id) || ![p.referenceId, p.versionId, p.expectedDecisionId, p.expectedGrantId].every(nullableId) ||
    (p.referenceId === null) !== (p.versionId === null) || !Number.isSafeInteger(p.expectedRevision) || Number(p.expectedRevision) < 0 || Number(p.expectedRevision) > 2147483646 ||
    typeof p.reason !== "string" || p.reason.trim().length > 2000 || p.action === "REVOKE" && !p.reason.trim() ||
    !(p.expiresAt === null || typeof p.expiresAt === "string" && Number.isFinite(Date.parse(p.expiresAt))) || p.action === "REVOKE" && p.expiresAt !== null) return fail();
  return { ...p, reason: p.reason.trim() || "Confirmed preview/download access", expiresAt: p.expiresAt === null ? null : new Date(String(p.expiresAt)).toISOString() } as AccessCommand;
}
export type AccessRecipient = { id: string; name: string | null; email: string; revision: number; decisionId: string | null };
export type AccessView = {
  sourceKind: "manual" | "project" | "runtime"; sourceId: string; categoryId: string; referenceId: string | null; versionId: string | null;
  users: AccessRecipient[]; moreUsers: boolean;
  grants: Array<AccessRecipient & { grantId: string; createdAt: string; grantedBy: string | null; scope: "NATIVE" | "VERSION" | "LEGACY_NATIVE"; expiresAt: string | null; effective: boolean }>;
  history: Array<{ id: string; action: string; actor: string | null; recipient: string | null; reason: string; createdAt: string; versionId: string | null; expiresAt: string | null }>;
  nextHistoryBefore: string | null;
};
