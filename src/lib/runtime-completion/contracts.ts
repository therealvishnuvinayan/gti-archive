import { commandId, ensure, record } from "../stage-builder/contracts";
export const documentCategories = ["AUTHORITY_APPROVAL_PROOF", "COPYRIGHT_TRANSFER", "INVOICE"] as const;
export const documentRequirements = ["REQUIRED", "OPTIONAL", "NOT_APPLICABLE"] as const;
export type DocumentSettings = Record<typeof documentCategories[number], typeof documentRequirements[number]>;
export const completionActions = ["POLICY_APPROVED", "UPLOAD_PREPARED", "DOCUMENT_SUBMITTED", "UPLOAD_CANCELLED", "DOCUMENT_REVIEWED", "COMPLETION_REQUESTED", "COMPLETION_DECIDED"] as const;
export function settings(raw: unknown): DocumentSettings {
  const r = record(raw, [...documentCategories]);
  for (const c of documentCategories) ensure(documentRequirements.includes(r[c] as DocumentSettings[typeof c]), "EXPLICIT_DOCUMENT_REQUIREMENTS_REQUIRED");
  return r as DocumentSettings;
}
export function completionCommand(raw: unknown) {
  ensure(raw && typeof raw === "object" && !Array.isArray(raw), "INVALID_COMMAND");
  const action = (raw as Record<string, unknown>).action;
  ensure(typeof action === "string" && completionActions.includes(action as typeof completionActions[number]), "UNSUPPORTED_COMPLETION_ACTION");
  const extra: Record<string, string[]> = { POLICY_APPROVED: ["settings", "reason", "confirmed"], UPLOAD_PREPARED: ["category", "fileName", "mimeType", "fileSize"], DOCUMENT_SUBMITTED: ["submissionId"], UPLOAD_CANCELLED: ["submissionId"], DOCUMENT_REVIEWED: ["submissionId", "expected", "outcome", "reason", "confirmed"], COMPLETION_REQUESTED: ["reason", "confirmed"], COMPLETION_DECIDED: ["requestId", "requestHash", "outcome", "reason", "confirmed"] };
  const r = record(raw, ["action", "commandId", "expectedProjectRevision", "expectedPolicyRevision", "expectedRevision", ...extra[action]]);
  commandId(r.commandId);
  for (const k of ["expectedProjectRevision", "expectedPolicyRevision", "expectedRevision"]) ensure(Number.isSafeInteger(r[k]) && Number(r[k]) >= 0, "INVALID_REVISION");
  return r as typeof r & { action: typeof completionActions[number]; commandId: string };
}
