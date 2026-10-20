import "server-only";
import type { Prisma } from "@prisma/client";
import { approvalAdoptionEnabled, approvalEngineAvailable } from "./activation";
import { approvalActor, openCompletionApproval } from "./service";
import { approvalCondition, parseApprovalExpectation } from "./contracts";
import { stepState } from "../completion-documents/evidence";

type DB = Prisma.TransactionClient;

/** Invoked after the native event and Phase 2.1 version/provenance are written.
 * Historical accepted/rejected records are never backfilled. */
export async function recordCompletionApprovalEvent(tx: DB, eventId: string) {
  if (!await approvalEngineAvailable(tx)) return;
  const event = await tx.completionDocumentEvent.findUniqueOrThrow({ where: { id: eventId } });
  if (event.action === "DOCUMENT_SUBMITTED" && approvalAdoptionEnabled()) await openCompletionApproval(tx, event.id);
  if (!["configureProjectCompletionWorkflow", "prepareAuthorityApprovalRequest", "prepareCopyrightTransferRequest",
    "requestProjectFinalInvoice", "markProjectInvoiceNotRequired", "DOCUMENT_REVISION_REQUESTED"].includes(event.action)) return;
  const workflow = await tx.projectCompletionWorkflow.findUniqueOrThrow({ where: { id: event.workflowId } });
  const pending = await tx.approvalRequest.findMany({ where: { projectId: event.projectId, state: "PENDING" }, include: { completionSubmission: true } });
  for (const request of pending) {
    const s = request.completionSubmission, state = stepState(workflow, s.type);
    if (s.workflowId === workflow.id && (!state.required || state.status !== "PENDING" || state.requestedAt?.getTime() !== s.requestTime.getTime())) {
      await tx.approvalRequest.update({ where: { id: request.id }, data: { state: "SUPERSEDED", revision: { increment: 1 },
        supersededAt: event.createdAt, supersessionReason: "Native document request changed; a fresh submission is required." } });
      await tx.approvalEvent.create({ data: { requestId: request.id, action: "SUPERSEDED", actorId: event.actorId,
        externalActorEmail: event.externalActorEmail, nativeEventId: event.id, details: { reason: "Native document request changed" } } });
    }
  }
}

export async function completionApproval(tx: DB, submissionId: string) {
  if (!await approvalEngineAvailable(tx)) return null;
  return tx.approvalRequest.findUnique({ where: { completionSubmissionId: submissionId } });
}

/** Stale native evidence can still be rejected for cleanup, as before. It can
 * never become an engine approval; the terminal SUPERSEDED history is retained. */
export async function rejectSupersededCompletion(tx: DB, requestId: string, expectedValue: unknown, reason: string,
  applyNative: (outcome: "REJECT", at: Date) => Promise<string>) {
  const expected = parseApprovalExpectation(expectedValue);
  await tx.$queryRaw`SELECT id FROM "ApprovalRequest" WHERE id = ${requestId} FOR UPDATE`;
  const request = await tx.approvalRequest.findUniqueOrThrow({ where: { id: requestId }, include: { steps: true, completionSubmission: true } });
  const actor = await approvalActor(tx, request.projectId);
  approvalCondition(request.state === "SUPERSEDED" && expected.requestId === request.id && expected.revision === request.revision &&
    expected.evidenceHash === request.evidenceHash && request.steps.some(s => s.id === expected.stepId && s.position === request.currentStep), "APPROVAL_REQUEST_STALE");
  const s = request.completionSubmission;
  if (s.status === "REJECTED" && s.reviewedById === actor.userId && s.reviewReason === reason) return;
  approvalCondition(s.status === "SUBMITTED", "SUPERSEDED_SUBMISSION_ALREADY_RESOLVED");
  const nativeEventId = await applyNative("REJECT", new Date());
  await tx.approvalEvent.create({ data: { requestId, action: "STALE_REJECTED", actorId: actor.userId, nativeEventId,
    details: { reason, commandId: expected.commandId } } });
}

export async function completionApprovalViews(tx: DB, projectId: string) {
  if (!await approvalEngineAvailable(tx)) return [];
  const requests = await tx.approvalRequest.findMany({ where: { projectId }, select: {
    id: true, completionSubmissionId: true, state: true, revision: true, currentStep: true, evidenceHash: true,
    steps: { select: { id: true, position: true } },
    decisions: { orderBy: { decidedAt: "asc" }, select: { outcome: true, reason: true, decidedAt: true, actor: { select: { name: true, email: true } } } },
  } });
  return requests.map(r => ({ submissionId: r.completionSubmissionId, requestId: r.id, state: r.state, revision: r.revision,
    evidenceHash: r.evidenceHash, stepId: r.steps.find(s => s.position === r.currentStep)!.id, decisions: r.decisions }));
}

