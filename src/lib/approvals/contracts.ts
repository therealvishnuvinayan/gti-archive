import { createHash } from "node:crypto";

export type ApprovalEligibility = "DOCUMENT_REVIEWER" | "DIRECTOR";
export type ApprovalOutcome = "APPROVE" | "REJECT";
export type ApprovalState = "PENDING" | "APPROVED" | "REJECTED" | "SUPERSEDED";
export type ApprovalPlan = Readonly<{ key: string; steps: readonly ApprovalEligibility[] }>;
export type ApprovalExpectation = {
  requestId: string; stepId: string; revision: number; evidenceHash: string; commandId: string;
};
const messages: Record<string, string> = {
  REFRESH_APPROVAL_BEFORE_DECIDING: "Refresh the document review before recording your decision.",
  INVALID_APPROVAL_EXPECTATION: "The review details are invalid. Refresh the document review.",
  APPROVAL_REQUEST_STALE: "This review changed or already has a decision. Refresh before deciding.",
  APPROVAL_EVIDENCE_CHANGED: "The submitted evidence has changed. Refresh and review it again.",
  APPROVAL_REQUEST_EXPIRED: "This approval request has expired.",
  APPROVAL_DECISION_REASON_REQUIRED: "A review decision and reason are required.",
  APPROVER_STEP_DENIED: "You are not authorized to decide this approval step.",
  APPROVER_RESOURCE_DENIED: "You are not authorized to review this project's documents.",
  APPROVER_SESSION_INVALID: "Your session or review permission has changed. Sign in again.",
  APPROVER_SESSION_EXPIRED: "Your session expired. Sign in again before reviewing.",
  CONFLICTING_APPROVAL_DECISION_REPLAY: "This decision was already recorded with different details. Refresh the review.",
  COMPLETION_APPROVAL_NOT_VALID: "Required document approval is missing or no longer valid.",
};
export class ApprovalError extends Error {
  constructor(readonly code: string) { super(messages[code] ?? "The approval could not be recorded. Refresh the review and try again."); this.name = "ApprovalError"; }
}
export function approvalCondition(value: unknown, code: string): asserts value {
  if (!value) throw new ApprovalError(code);
}
/** Canonical JSON hashes identify immutable database evidence, not S3 bytes. */
export function approvalHash(value: unknown): string {
  function canonical(v: unknown): string {
    if (v === null || typeof v === "string" || typeof v === "boolean") return JSON.stringify(v);
    if (typeof v === "number" && Number.isFinite(v)) return JSON.stringify(v);
    if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
    approvalCondition(v && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype, "INVALID_APPROVAL_SNAPSHOT");
    return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(",")}}`;
  }
  return createHash("sha256").update(canonical(value)).digest("hex");
}
export function validateApprovalPlan(plan: ApprovalPlan) {
  approvalCondition(/^[a-z][a-z0-9.-]{2,99}$/.test(plan.key) && plan.steps.length > 0 && plan.steps.length <= 8 &&
    plan.steps.every(s => s === "DOCUMENT_REVIEWER" || s === "DIRECTOR"), "INVALID_APPROVAL_PLAN");
}
export function parseApprovalExpectation(raw: unknown): ApprovalExpectation {
  approvalCondition(raw && typeof raw === "object" && !Array.isArray(raw), "REFRESH_APPROVAL_BEFORE_DECIDING");
  const v = raw as Record<string, unknown>;
  approvalCondition(Object.keys(v).length === 5 && ["requestId", "stepId", "revision", "evidenceHash", "commandId"].every(k => Object.hasOwn(v, k)) &&
    typeof v.requestId === "string" && v.requestId.length > 0 && v.requestId.length <= 256 &&
    typeof v.stepId === "string" && v.stepId.length > 0 && v.stepId.length <= 256 &&
    Number.isSafeInteger(v.revision) && Number(v.revision) >= 0 && typeof v.evidenceHash === "string" && /^[a-f0-9]{64}$/.test(v.evidenceHash) &&
    typeof v.commandId === "string" && /^[a-zA-Z0-9_-]{12,128}$/.test(v.commandId), "INVALID_APPROVAL_EXPECTATION");
  return { requestId: v.requestId, stepId: v.stepId, revision: Number(v.revision), evidenceHash: v.evidenceHash, commandId: v.commandId };
}
export function nextApprovalState(current: number, count: number, outcome: ApprovalOutcome) {
  approvalCondition(Number.isSafeInteger(current) && current >= 1 && current <= count && ["APPROVE", "REJECT"].includes(outcome), "INVALID_APPROVAL_TRANSITION");
  return { state: outcome === "REJECT" ? "REJECTED" as const : current === count ? "APPROVED" as const : "PENDING" as const,
    currentStep: outcome === "APPROVE" && current < count ? current + 1 : current };
}
