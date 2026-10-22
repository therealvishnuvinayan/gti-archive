import "server-only";
import type { ApprovalDecision, ApprovalEvent, Prisma } from "@prisma/client";
import type { AuthenticatedPrincipal } from "../authorization/session";
import { approvalCondition, approvalHash, nextApprovalState, parseApprovalExpectation, type ApprovalOutcome } from "./contracts";

type Tx = Prisma.TransactionClient;
export type ApprovalSubjectRequest = Prisma.ApprovalRequestGetPayload<{ include: { steps: true; evidence: true } }>;
/** Trusted, explicitly registered native adapters only. No public route accepts
 * adapters, subjects, policy plans, principals or callbacks from a client. */
type NativeDecisionAdapter = {
  subjectType: "COMPLETION_DOCUMENT_SUBMISSION" | "WORKFLOW_DRAFT_REVISION" | "RUNTIME_STAGE";
  authorize: (request: ApprovalSubjectRequest) => Promise<AuthenticatedPrincipal>;
  applyNative: (outcome: ApprovalOutcome, at: Date) => Promise<string | null>;
  afterDecision?: (decision: ApprovalDecision, event: ApprovalEvent) => Promise<void>;
};

/** One decision engine for both typed subjects: ordered decisions, immutable
 * evidence, current authorization, replay and projection are shared. */
export async function decideTypedApproval(tx: Tx, requestId: string,
  input: { expected: unknown; outcome: ApprovalOutcome; reason: string }, adapter: NativeDecisionAdapter) {
  const expected = parseApprovalExpectation(input.expected), reason = input.reason?.trim();
  approvalCondition(reason && reason.length <= 2000 && ["APPROVE", "REJECT"].includes(input.outcome), "APPROVAL_DECISION_REASON_REQUIRED");
  await tx.$queryRaw`SELECT id FROM "ApprovalRequest" WHERE id = ${requestId} FOR UPDATE`;
  const request = await tx.approvalRequest.findUniqueOrThrow({ where: { id: requestId }, include: {
    steps: { orderBy: { position: "asc" } }, evidence: { orderBy: { fileVersionId: "asc" } },
  } });
  approvalCondition(request.subjectType === adapter.subjectType, "APPROVAL_SUBJECT_MISMATCH");
  const actor = await adapter.authorize(request);
  approvalCondition(expected.requestId === request.id && expected.evidenceHash === request.evidenceHash &&
    approvalHash({ subjectSnapshot: request.subjectSnapshot, policySnapshot: request.policySnapshot,
      evidence: request.evidence.map(e => ({ fileVersionId: e.fileVersionId, snapshot: e.snapshot })) }) === request.evidenceHash, "APPROVAL_EVIDENCE_CHANGED");
  const step = request.steps.find(s => s.id === expected.stepId);
  approvalCondition(step && (step.eligibility === "DOCUMENT_REVIEWER" || (adapter.subjectType === "RUNTIME_STAGE" && step.eligibility === "RUNTIME_STAGE_REVIEWER") || actor.businessRole === "DIRECTOR"), "APPROVER_STEP_DENIED");
  approvalCondition(!request.expiresAt || request.expiresAt > new Date(), "APPROVAL_REQUEST_EXPIRED");
  const previous = await tx.approvalDecision.findUnique({ where: { requestId_commandId: { requestId, commandId: expected.commandId } } });
  if (previous) {
    approvalCondition(request.state !== "SUPERSEDED" && previous.actorId === actor.userId && previous.stepId === step.id &&
      previous.expectedRevision === expected.revision && previous.evidenceHash === expected.evidenceHash &&
      previous.outcome === input.outcome && previous.reason === reason, "CONFLICTING_APPROVAL_DECISION_REPLAY");
    return { state: request.state, duplicate: true, decisionId: previous.id };
  }
  approvalCondition(request.state === "PENDING" && request.revision === expected.revision && request.currentStep === step.position, "APPROVAL_REQUEST_STALE");
  const next = nextApprovalState(request.currentStep, request.steps.length, input.outcome), decidedAt = new Date();
  const nativeEventId = next.state === "PENDING" ? null : await adapter.applyNative(input.outcome, decidedAt);
  const decision = await tx.approvalDecision.create({ data: { requestId, stepId: step.id, commandId: expected.commandId,
    expectedRevision: expected.revision, evidenceHash: expected.evidenceHash, outcome: input.outcome, reason,
    actorId: actor.userId, actorRole: actor.businessRole!, actorVersion: actor.authorizationVersion!, sessionId: actor.session.id,
    decidedAt, nativeEventId } });
  await tx.approvalRequest.update({ where: { id: requestId }, data: { ...next, revision: { increment: 1 } } });
  const event = await tx.approvalEvent.create({ data: { requestId, action: "DECIDED", actorId: actor.userId, nativeEventId,
    decisionId: decision.id, ...(adapter.subjectType !== "COMPLETION_DOCUMENT_SUBMISSION" ? { createdAt: decidedAt } : {}),
    details: { outcome: input.outcome, reason, revision: expected.revision + 1, evidenceHash: expected.evidenceHash } } });
  await adapter.afterDecision?.(decision, event);
  approvalCondition(Date.parse(actor.session.expiresAt) > Date.now(), "APPROVER_SESSION_EXPIRED");
  return { state: next.state, duplicate: false, decisionId: decision.id };
}
