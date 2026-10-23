export class ArchiveVerificationError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}
export type VerificationCommand = {
  commandId: string; sourceKind: "manual" | "project"; sourceId: string; categoryId: string;
  versionId: string; expectedRevision: number; expectedDecisionId: string | null;
  action: "VERIFY" | "REVOKE"; reason: string; confirmed: true;
};
export function parseVerificationCommand(raw: unknown): VerificationCommand {
  const fail = () => { throw new ArchiveVerificationError("Confirm the exact version and enter a review reason (1–2000 characters)."); };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return fail();
  const p = raw as Record<string, unknown>;
  if (Object.keys(p).sort().join() !== "action,categoryId,commandId,confirmed,expectedDecisionId,expectedRevision,reason,sourceId,sourceKind,versionId" ||
    !["manual", "project"].includes(String(p.sourceKind)) || !["VERIFY", "REVOKE"].includes(String(p.action)) || p.confirmed !== true ||
    !Number.isSafeInteger(p.expectedRevision) || Number(p.expectedRevision) < 0 || Number(p.expectedRevision) > 2147483646 ||
    typeof p.reason !== "string" || !p.reason.trim() || p.reason.trim().length > 2000 ||
    ![p.commandId, p.sourceId, p.categoryId, p.versionId].every(v => typeof v === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(v)) ||
    !(p.expectedDecisionId === null || typeof p.expectedDecisionId === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(p.expectedDecisionId))) return fail();
  return { commandId: String(p.commandId), sourceKind: p.sourceKind as VerificationCommand["sourceKind"], sourceId: String(p.sourceId), categoryId: String(p.categoryId), versionId: String(p.versionId), expectedRevision: Number(p.expectedRevision), expectedDecisionId: p.expectedDecisionId as string | null, action: p.action as VerificationCommand["action"], reason: p.reason.trim(), confirmed: true };
}
export type VerificationView = {
  status: "NOT VERIFIED" | "VERIFIED" | "REVOKED" | "UNAVAILABLE";
  explanation: string | null; versionId: string | null; versionNumber: number | null;
  revision: number; decisionId: string | null; canVerify: boolean; canRevoke: boolean;
  integrity: { objectVersionPinned: boolean; applicationSealed: boolean; checksumEvidence: string } | null;
  nextHistoryBefore: number | null;
  history: Array<{ id: string; action: string; reviewer: string; createdAt: string; reason: string; versionId: string }>;
};
