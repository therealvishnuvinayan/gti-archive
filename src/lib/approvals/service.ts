import "server-only";
import { prepareCompletionReviewEvent } from "../events/producer";
import type { Prisma } from "@prisma/client";
import { readCurrentSessionToken } from "../auth";
import { resolveAuthenticatedSession } from "../authorization/session";
import { activeProjectMutation } from "../authorization/project-transaction";
import { approvalCondition, approvalHash, nextApprovalState, parseApprovalExpectation, validateApprovalPlan,
  type ApprovalOutcome, type ApprovalPlan } from "./contracts";

import { approvalEngineAvailable } from "./activation";

type DB = Prisma.TransactionClient;
const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value));
export const completionReviewPlan: ApprovalPlan = Object.freeze({ key: "completion-document-review.v1", steps: Object.freeze(["DOCUMENT_REVIEWER" as const]) });

/** Internal typed subject adapter. Plans are supplied by trusted server code,
 * never a route parameter. New adapters require their own native FK and policy. */
export async function openCompletionApproval(tx: DB, eventId: string, plan: ApprovalPlan = completionReviewPlan, expiresAt: Date | null = null) {
  validateApprovalPlan(plan);
  approvalCondition(expiresAt === null || Number.isFinite(expiresAt.getTime()), "INVALID_APPROVAL_EXPIRY");
  const event = await tx.completionDocumentEvent.findUniqueOrThrow({ where: { id: eventId } });
  approvalCondition(event.action === "DOCUMENT_SUBMITTED" && event.submissionId, "INVALID_APPROVAL_SUBMISSION_EVENT");
  const submission = await tx.completionDocumentSubmission.findUniqueOrThrow({ where: { id: event.submissionId } });
  const reference = await tx.sharedFileReference.findUnique({ where: { completionSubmissionId: submission.id }, include: { version: true } });
  // Cutover/legacy submissions retain native review; do not invent an identity,
  // reviewer, cryptographic digest or historical engine approval for them.
  if (!reference) return null;
  approvalCondition(reference.role === "SOURCE" && reference.version.status === "READY" && submission.status === "SUBMITTED" &&
    event.projectId === submission.projectId && event.workflowId === submission.workflowId &&
    event.actorId === submission.submittedById && event.externalActorEmail === submission.externalSubmitterEmail, "INVALID_APPROVAL_SOURCE");
  const subjectSnapshot = json({ submissionId: submission.id, workflowId: submission.workflowId, projectId: submission.projectId,
    type: submission.type, requestTime: submission.requestTime.toISOString(), sourceEvidenceHash: submission.evidenceHash,
    submittedAt: submission.uploadedAt?.toISOString(), accessId: submission.accessId });
  const evidence = [{ fileVersionId: reference.versionId, snapshot: json(reference.version) }];
  const policySnapshot = json(plan);
  const evidenceHash = approvalHash({ subjectSnapshot, evidence, policySnapshot });
  const existing = await tx.approvalRequest.findUnique({ where: { completionSubmissionId: submission.id } });
  if (existing) {
    approvalCondition(existing.submissionEventId === event.id && existing.evidenceHash === evidenceHash &&
      (existing.expiresAt?.getTime() ?? null) === (expiresAt?.getTime() ?? null), "CONFLICTING_APPROVAL_REQUEST_REPLAY");
    return existing;
  }
  const request = await tx.approvalRequest.create({ data: {
    subjectType: "COMPLETION_DOCUMENT_SUBMISSION", subjectId: submission.id, subjectVersion: reference.versionId,
    completionSubmissionId: submission.id, projectId: submission.projectId, submissionEventId: event.id,
    requestedById: submission.submittedById, externalRequesterEmail: submission.externalSubmitterEmail, requestedAt: event.createdAt,
    policyKey: plan.key, policySnapshot, subjectSnapshot, evidenceHash, expiresAt,
    steps: { create: plan.steps.map((eligibility, index) => ({ position: index + 1, eligibility })) },
    evidence: { create: evidence },
  } });
  await tx.approvalEvent.create({ data: { requestId: request.id, action: "REQUESTED", actorId: event.actorId,
    externalActorEmail: event.externalActorEmail, nativeEventId: event.id, details: { evidenceHash } } });
  return request;
}

/** Every decision, including an identical replay, requires the current native
 * V2 authorization transaction and its locked genuine session. No actor input. */
export async function approvalActor(tx: DB, projectId: string) {
  const scope = activeProjectMutation();
  approvalCondition(scope && scope.tx === tx && scope.projectKind === "structured" && scope.projectId === projectId &&
    scope.operation === "reviewCompletionDocument", "AUTHORIZED_APPROVAL_TRANSACTION_REQUIRED");
  const token = await readCurrentSessionToken(), session = token ? await resolveAuthenticatedSession(tx, token) : null;
  approvalCondition(session && session.principal.userId === scope.actorId && session.principal.authorizationVersion !== null &&
    ["DIRECTOR", "SENIOR_PROJECT_MANAGER", "JUNIOR_PROJECT_MANAGER"].includes(session.principal.businessRole ?? ""), "APPROVER_SESSION_INVALID");
  const actor = session.principal;
  const project = await tx.project.findUniqueOrThrow({ where: { id: projectId }, select: { ownerId: true, coOwners: { select: { userId: true } } } });
  approvalCondition(actor.businessRole === "DIRECTOR" || project.ownerId === actor.userId || project.coOwners.some(p => p.userId === actor.userId), "APPROVER_RESOURCE_DENIED");
  await tx.$queryRaw`SELECT set_config('flux.approval_actor', ${actor.userId}, true), set_config('flux.approval_session', ${actor.session.id}, true)`;
  return actor;
}

export async function decideApproval(tx: DB, requestId: string, input: { expected: unknown; outcome: ApprovalOutcome; reason: string },
  applyNative: (outcome: ApprovalOutcome, decidedAt: Date) => Promise<string>) {
  const expected = parseApprovalExpectation(input.expected), reason = input.reason?.trim();
  approvalCondition(reason && reason.length <= 2000 && ["APPROVE", "REJECT"].includes(input.outcome), "APPROVAL_DECISION_REASON_REQUIRED");
  await tx.$queryRaw`SELECT id FROM "ApprovalRequest" WHERE id = ${requestId} FOR UPDATE`;
  const request = await tx.approvalRequest.findUniqueOrThrow({ where: { id: requestId }, include: {
    steps: { orderBy: { position: "asc" } }, evidence: { orderBy: { fileVersionId: "asc" } },
  } });
  const actor = await approvalActor(tx, request.projectId);
  approvalCondition(expected.requestId === request.id && expected.evidenceHash === request.evidenceHash &&
    approvalHash({ subjectSnapshot: request.subjectSnapshot, policySnapshot: request.policySnapshot,
      evidence: request.evidence.map(e => ({ fileVersionId: e.fileVersionId, snapshot: e.snapshot })) }) === request.evidenceHash, "APPROVAL_EVIDENCE_CHANGED");
  const step = request.steps.find(s => s.id === expected.stepId);
  approvalCondition(step && (step.eligibility === "DOCUMENT_REVIEWER" || actor.businessRole === "DIRECTOR"), "APPROVER_STEP_DENIED");
  approvalCondition(!request.expiresAt || request.expiresAt > new Date(), "APPROVAL_REQUEST_EXPIRED");
  const previous = await tx.approvalDecision.findUnique({ where: { requestId_commandId: { requestId, commandId: expected.commandId } } });
  if (previous) {
    approvalCondition(request.state !== "SUPERSEDED" && previous.actorId === actor.userId && previous.stepId === step.id &&
      previous.expectedRevision === expected.revision && previous.evidenceHash === expected.evidenceHash &&
      previous.outcome === input.outcome && previous.reason === reason, "CONFLICTING_APPROVAL_DECISION_REPLAY");
    return { state: request.state, duplicate: true };
  }
  approvalCondition(request.state === "PENDING" && request.revision === expected.revision && request.currentStep === step.position, "APPROVAL_REQUEST_STALE");
  const next = nextApprovalState(request.currentStep, request.steps.length, input.outcome), decidedAt = new Date();
  // A trusted adapter changes the authoritative native state in this transaction.
  // Deferred SQL guards prohibit committing either side without the other.
  const nativeEventId = next.state === "PENDING" ? null : await applyNative(input.outcome, decidedAt);
  await prepareCompletionReviewEvent(tx, request.projectId, nativeEventId);
  const decision = await tx.approvalDecision.create({ data: { requestId, stepId: step.id, commandId: expected.commandId,
    expectedRevision: expected.revision, evidenceHash: expected.evidenceHash, outcome: input.outcome, reason,
    actorId: actor.userId, actorRole: actor.businessRole!, actorVersion: actor.authorizationVersion!, sessionId: actor.session.id,
    decidedAt, nativeEventId } });
  await tx.approvalRequest.update({ where: { id: requestId }, data: { ...next, revision: { increment: 1 } } });
  await tx.approvalEvent.create({ data: { requestId, action: "DECIDED", actorId: actor.userId, nativeEventId,
    decisionId: decision.id, details: { outcome: input.outcome, reason, revision: expected.revision + 1, evidenceHash: expected.evidenceHash } } });
  approvalCondition(Date.parse(actor.session.expiresAt) > Date.now(), "APPROVER_SESSION_EXPIRED");
  return { state: next.state, duplicate: false };
}

/** Additional defense at the existing mandatory-document/final-completion gate.
 * Native submission and workflow state remain authoritative for legacy records. */
export async function assertCompletionApprovalAccepted(tx: DB, submissionId: string) {
  if (!await approvalEngineAvailable(tx)) return;
  const request = await tx.approvalRequest.findUnique({ where: { completionSubmissionId: submissionId } });
  if (!request) return;
  const s = await tx.completionDocumentSubmission.findUniqueOrThrow({ where: { id: submissionId } });
  const evidence = await tx.approvalEvidence.findMany({ where: { requestId: request.id } });
  const reference = await tx.sharedFileReference.findUnique({ where: { completionSubmissionId: submissionId } });
  approvalCondition(request.state === "APPROVED" && s.status === "ACCEPTED" && reference && evidence.length === 1 &&
    evidence[0].fileVersionId === reference.versionId && request.subjectVersion === reference.versionId, "COMPLETION_APPROVAL_NOT_VALID");
}
