import type { BusinessEvent } from "@prisma/client";

export const EVENT_TYPE = "COMPLETION_DOCUMENT_REVIEW_DECIDED" as const;
export const CONSUMER_KEY = "internal.audit.v1" as const;
export const MAX_ATTEMPTS = 5;
export function retryDelayMs(attempt: number) {
  if (!Number.isInteger(attempt) || attempt < 1 || attempt > MAX_ATTEMPTS) throw new Error("INVALID_EVENT_ATTEMPT");
  return Math.min(300_000, 5_000 * 2 ** (attempt - 1));
}
/** Reserved attribution variants do not authorize another producer. Each future
 * type needs its own trusted native adapter, FKs, policy and payload validator. */
export type EventActor = { kind: "INTERNAL"; userId: string; businessRole: string; authorizationVersion: number }
  | { kind: "TRUSTED_EXTERNAL"; nativeAccessId: string }
  | { kind: "UNKNOWN_HISTORICAL" };
export type ReviewPayload = {
  outcome: "APPROVE" | "REJECT";
  documentType: "AUTHORITY_APPROVAL_PROOF" | "COPYRIGHT_TRANSFER" | "INVOICE";
  requestId: string;
  evidenceHash: string;
  checksumEvidence: "UNKNOWN" | "S3_FULL_OBJECT_SHA256";
};
export type ReviewDecidedEvent = {
  id: string; type: typeof EVENT_TYPE; schemaVersion: 1;
  aggregate: { type: "COMPLETION_DOCUMENT_SUBMISSION"; id: string; sequence: number };
  native: { type: "ApprovalDecision"; id: string; eventId: string };
  actor: Extract<EventActor, { kind: "INTERNAL" }>;
  context: { projectId: string; taskId: null; fileVersionId: string; approvalEvidenceId: string };
  operation: "reviewCompletionDocument";
  correlationId: string; causationId: string; idempotencyKey: string; occurredAt: string;
  payload: ReviewPayload;
};

/** Strict wire projection: never serialize Prisma relations, approval reason,
 * session IDs, emails, filenames, storage locators or arbitrary snapshots. */
export function reviewEvent(row: BusinessEvent): ReviewDecidedEvent {
  const p = row.payload;
  if (!p || Array.isArray(p) || typeof p !== "object" || Object.keys(p).sort().join() !== "checksumEvidence,documentType,evidenceHash,outcome,requestId" ||
    (typeof p.outcome !== "string" || !["APPROVE", "REJECT"].includes(p.outcome)) || (typeof p.documentType !== "string" || !["AUTHORITY_APPROVAL_PROOF", "COPYRIGHT_TRANSFER", "INVOICE"].includes(p.documentType)) ||
    (typeof p.checksumEvidence !== "string" || !["UNKNOWN", "S3_FULL_OBJECT_SHA256"].includes(p.checksumEvidence)) || typeof p.requestId !== "string" || !p.requestId ||
    typeof p.evidenceHash !== "string" || !/^[a-f0-9]{64}$/.test(p.evidenceHash) ||
    !row.projectId || !row.decisionId || !row.nativeEventId || !row.fileVersionId || !row.approvalEvidenceId || row.taskId !== null || row.taskEntryId !== null || row.flexibleProjectId !== null ||
    row.type !== EVENT_TYPE || row.schemaVersion !== 1 || row.aggregateType !== "COMPLETION_DOCUMENT_SUBMISSION" ||
    row.operation !== "reviewCompletionDocument" || !Number.isInteger(row.sequence) || row.sequence < 1 ||
    !["DIRECTOR", "SENIOR_PROJECT_MANAGER", "JUNIOR_PROJECT_MANAGER"].includes(row.actorRole) || row.actorVersion < 1 ||
    !Number.isFinite(row.occurredAt.getTime())) throw new Error("UNSUPPORTED_EVENT_CONTRACT");
  return { id: row.id, type: EVENT_TYPE, schemaVersion: 1,
    aggregate: { type: "COMPLETION_DOCUMENT_SUBMISSION", id: row.aggregateId, sequence: row.sequence },
    native: { type: "ApprovalDecision", id: row.decisionId, eventId: row.nativeEventId },
    actor: { kind: "INTERNAL", userId: row.actorId, businessRole: row.actorRole, authorizationVersion: row.actorVersion },
    context: { projectId: row.projectId, taskId: null, fileVersionId: row.fileVersionId, approvalEvidenceId: row.approvalEvidenceId },
    operation: "reviewCompletionDocument", correlationId: row.correlationId, causationId: row.causationId,
    idempotencyKey: row.idempotencyKey, occurredAt: row.occurredAt.toISOString(), payload: p as ReviewPayload };
}


export type TaskActivityEvent = {
  id: string; type: "TASK_ACTIVITY"; schemaVersion: 1;
  aggregate: { type: "UNIVERSAL_TASK"; id: string; sequence: number };
  native: { type: "UniversalTaskEntry"; id: string };
  actor: Extract<EventActor, { kind: "INTERNAL" }>;
  context: { projectId: string | null; flexibleProjectId: string | null; taskId: string };
  operation: "generalTaskCommand"; correlationId: string; causationId: string; idempotencyKey: string; occurredAt: string;
  payload: { action: string; status: string; directorOverride: boolean };
};
export type SharedBusinessEvent = ReviewDecidedEvent | TaskActivityEvent;
export function decodeBusinessEvent(row: BusinessEvent): SharedBusinessEvent {
  if (row.type === EVENT_TYPE) return reviewEvent(row);
  const p = row.payload;
  if (row.type !== "TASK_ACTIVITY" || row.schemaVersion !== 1 || row.aggregateType !== "UNIVERSAL_TASK" ||
    row.operation !== "generalTaskCommand" || !row.taskId || !row.taskEntryId || row.aggregateId !== row.taskId ||
    Number(!!row.projectId) + Number(!!row.flexibleProjectId) !== 1 || row.decisionId || row.nativeEventId || row.approvalEvidenceId || row.fileVersionId ||
    !Number.isInteger(row.sequence) || row.sequence < 1 || !Number.isInteger(row.actorVersion) || row.actorVersion < 1 || !Number.isFinite(row.occurredAt.getTime()) || row.id !== `task:${row.taskEntryId}` || row.idempotencyKey !== row.id || row.causationId !== row.taskEntryId || row.correlationId !== row.taskId || !["DIRECTOR","SENIOR_PROJECT_MANAGER","JUNIOR_PROJECT_MANAGER","DESIGNER","DIGITAL_LEAD"].includes(row.actorRole) ||
    !p || typeof p !== "object" || Array.isArray(p) || Object.keys(p).sort().join() !== "action,directorOverride,status" ||
    typeof p.action !== "string" || !["CREATED","EDIT","MESSAGE","SUBMIT","REQUEST_COMPLETION","APPROVE","REJECT","CLOSE","DELETE","PREPARE_UPLOAD","FINALIZE_UPLOAD"].includes(p.action) ||
    typeof p.status !== "string" || !["OPEN","IN_PROGRESS","COMPLETION_REQUESTED","COMPLETED","CLOSED"].includes(p.status) || typeof p.directorOverride !== "boolean") throw new Error("UNSUPPORTED_EVENT_CONTRACT");
  return { id: row.id, type: "TASK_ACTIVITY", schemaVersion: 1, aggregate: { type: "UNIVERSAL_TASK", id: row.taskId, sequence: row.sequence },
    native: { type: "UniversalTaskEntry", id: row.taskEntryId }, actor: { kind: "INTERNAL", userId: row.actorId, businessRole: row.actorRole, authorizationVersion: row.actorVersion },
    context: { projectId: row.projectId, flexibleProjectId: row.flexibleProjectId, taskId: row.taskId }, operation: "generalTaskCommand",
    correlationId: row.correlationId, causationId: row.causationId, idempotencyKey: row.idempotencyKey, occurredAt: row.occurredAt.toISOString(),
    payload: { action: p.action, status: p.status, directorOverride: p.directorOverride } };
}
