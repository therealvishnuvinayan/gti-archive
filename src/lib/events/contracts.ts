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
  context: { projectId: string | null; flexibleProjectId: string | null; runtimeProjectId?: string; taskId: string };
  operation: "generalTaskCommand" | "deliverableTaskCommand" | "conceptTaskCommand"; correlationId: string; causationId: string; idempotencyKey: string; occurredAt: string;
  payload: { action: string; status: string; directorOverride: boolean };
};
export type WorkflowDraftEvent = {
  id: string; type: "WORKFLOW_DRAFT_REVISED"; schemaVersion: 1;
  aggregate: { type: "WORKFLOW_DRAFT"; id: string; sequence: number };
  native: { type: "WorkflowDraftRevision"; id: string };
  actor: Extract<EventActor, { kind: "INTERNAL" }>;
  operation: "draftWorkflowCommand"; correlationId: string; causationId: string; idempotencyKey: string; occurredAt: string;
  payload: { action: "CREATE" | "REVISE" | "CLONE"; configurationHash: string; validationStatus: "VALID" | "INCOMPLETE" };
};
export type WorkflowPublicationEvent = {
  id: string; type: "WORKFLOW_PUBLICATION_SUBMITTED" | "WORKFLOW_PUBLICATION_SUPERSEDED" | "WORKFLOW_PUBLICATION_DECIDED" | "WORKFLOW_VERSION_PUBLISHED"; schemaVersion: 1;
  aggregate: { type: "WORKFLOW_PUBLICATION_REQUEST"; id: string; sequence: number };
  native: { type: "WorkflowPublicationAudit" | "PublishedWorkflowVersion"; id: string };
  actor: Extract<EventActor, { kind: "INTERNAL" }>;
  operation: "workflowPublicationCommand"; correlationId: string; causationId: string; idempotencyKey: string; occurredAt: string;
  payload: { action: "SUBMITTED" | "SUPERSEDED" | "APPROVE" | "REJECT" | "PUBLISHED"; workflowId: string; draftRevisionId: string; configurationHash: string; requestId: string; versionId?: string; versionNumber?: number };
};
function workflowPublicationEvent(row: BusinessEvent): WorkflowPublicationEvent {
  const p = row.payload, published = row.type === "WORKFLOW_VERSION_PUBLISHED";
  const actions = row.type === "WORKFLOW_PUBLICATION_SUBMITTED" ? ["SUBMITTED"] : row.type === "WORKFLOW_PUBLICATION_SUPERSEDED" ? ["SUPERSEDED"] : published ? ["PUBLISHED"] : ["APPROVE", "REJECT"];
  const sequence = row.type === "WORKFLOW_PUBLICATION_SUBMITTED" ? 1 : published ? 3 : 2;
  if (row.schemaVersion !== 1 || row.aggregateType !== "WORKFLOW_PUBLICATION_REQUEST" || row.operation !== "workflowPublicationCommand" ||
    !row.aggregateId || !row.causationId || row.id !== `${published ? "workflow-version" : "workflow-approval"}:${row.causationId}` || row.idempotencyKey !== row.id || row.correlationId !== row.aggregateId ||
    row.sequence !== sequence || !Number.isInteger(row.actorVersion) || row.actorVersion < 1 || !row.actorId || !Number.isFinite(row.occurredAt.getTime()) ||
    !["DIRECTOR", "SENIOR_PROJECT_MANAGER"].includes(row.actorRole) || ((published || row.type === "WORKFLOW_PUBLICATION_DECIDED") && row.actorRole !== "DIRECTOR") ||
    [row.projectId, row.flexibleProjectId, row.taskId, row.taskEntryId, row.decisionId, row.nativeEventId, row.approvalEvidenceId, row.fileVersionId].some(v => v !== null) ||
    !p || typeof p !== "object" || Array.isArray(p) || Object.keys(p).sort().join() !== (published ? "action,configurationHash,draftRevisionId,requestId,versionId,versionNumber,workflowId" : "action,configurationHash,draftRevisionId,requestId,workflowId") ||
    typeof p.action !== "string" || !actions.includes(p.action) || p.requestId !== row.aggregateId || typeof p.workflowId !== "string" || !p.workflowId || typeof p.draftRevisionId !== "string" || !p.draftRevisionId ||
    typeof p.configurationHash !== "string" || !/^[a-f0-9]{64}$/.test(p.configurationHash) || (published && (p.versionId !== row.causationId || !Number.isSafeInteger(p.versionNumber) || Number(p.versionNumber) < 1))) throw new Error("UNSUPPORTED_EVENT_CONTRACT");
  return { id: row.id, type: row.type as WorkflowPublicationEvent["type"], schemaVersion: 1, aggregate: { type: "WORKFLOW_PUBLICATION_REQUEST", id: row.aggregateId, sequence },
    native: { type: published ? "PublishedWorkflowVersion" : "WorkflowPublicationAudit", id: row.causationId }, actor: { kind: "INTERNAL", userId: row.actorId, businessRole: row.actorRole, authorizationVersion: row.actorVersion },
    operation: "workflowPublicationCommand", correlationId: row.correlationId, causationId: row.causationId, idempotencyKey: row.idempotencyKey, occurredAt: row.occurredAt.toISOString(), payload: p as WorkflowPublicationEvent["payload"] };
}
export type RuntimeActivityEvent = {
  id: string; type: "RUNTIME_ACTIVITY"; schemaVersion: 1;
  aggregate: { type: "RUNTIME_PROJECT"; id: string; sequence: number };
  native: { type: "RuntimeActivity"; id: string };
  actor: Extract<EventActor, { kind: "INTERNAL" }>;
  operation: "runtimeStageCommand"; correlationId: string; causationId: string; idempotencyKey: string; occurredAt: string;
  payload: { action: string; stageId: string | null };
};
export type RuntimeCreationEvent = { id: string; type: "RUNTIME_CREATION_REQUESTED" | "RUNTIME_CREATION_DECIDED"; schemaVersion: 1; aggregate: { type: "RUNTIME_CREATION"; id: string; sequence: number }; native: { type: "RuntimeCreationRequest" | "RuntimeCreationDecision"; id: string }; actor: Extract<EventActor, { kind: "INTERNAL" }>; operation: "runtimeCreationCommand"; correlationId: string; causationId: string; idempotencyKey: string; occurredAt: string; payload: { snapshotHash: string } };
export type RuntimeCompletionEvent = Omit<RuntimeActivityEvent, "type" | "aggregate" | "native" | "operation" | "payload"> & { type: "RUNTIME_COMPLETION_ACTIVITY"; aggregate: { type: "RUNTIME_COMPLETION"; id: string; sequence: number }; native: { type: "RuntimeCompletionActivity"; id: string }; operation: "runtimeCompletionCommand"; payload: { action: string } };
export type SharedBusinessEvent = RuntimeCompletionEvent | RuntimeCreationEvent | RuntimeActivityEvent | ReviewDecidedEvent | TaskActivityEvent | WorkflowDraftEvent | WorkflowPublicationEvent;
export function decodeBusinessEvent(row: BusinessEvent & { runtimeTaskContext?: { projectId: string; taskId: string; eventId: string } | null }): SharedBusinessEvent {
  if (row.type === "RUNTIME_COMPLETION_ACTIVITY") {
    const p = row.payload;
    if (row.schemaVersion !== 1 || row.aggregateType !== "RUNTIME_COMPLETION" || row.operation !== "runtimeCompletionCommand" || !row.aggregateId || !row.causationId || row.id !== `runtime-completion:${row.causationId}` || row.idempotencyKey !== row.id || row.correlationId !== row.aggregateId || !Number.isSafeInteger(row.sequence) || row.sequence < 1 || !Number.isSafeInteger(row.actorVersion) || row.actorVersion < 1 || !row.actorId || !Number.isFinite(row.occurredAt.getTime()) || !["DIRECTOR", "SENIOR_PROJECT_MANAGER", "JUNIOR_PROJECT_MANAGER"].includes(row.actorRole) || [row.projectId, row.flexibleProjectId, row.taskId, row.taskEntryId, row.decisionId, row.nativeEventId, row.approvalEvidenceId, row.fileVersionId].some(v => v !== null) || !p || typeof p !== "object" || Array.isArray(p) || Object.keys(p).join() !== "action" || typeof p.action !== "string" || !["POLICY_APPROVED", "UPLOAD_PREPARED", "DOCUMENT_SUBMITTED", "UPLOAD_CANCELLED", "DOCUMENT_REVIEWED", "COMPLETION_REQUESTED", "COMPLETION_DECIDED"].includes(p.action) || (["POLICY_APPROVED", "COMPLETION_DECIDED"].includes(p.action) && row.actorRole !== "DIRECTOR")) throw new Error("UNSUPPORTED_EVENT_CONTRACT");
    return { id: row.id, type: row.type, schemaVersion: 1, aggregate: { type: "RUNTIME_COMPLETION", id: row.aggregateId, sequence: row.sequence }, native: { type: "RuntimeCompletionActivity", id: row.causationId }, actor: { kind: "INTERNAL", userId: row.actorId, businessRole: row.actorRole, authorizationVersion: row.actorVersion }, operation: "runtimeCompletionCommand", correlationId: row.correlationId, causationId: row.causationId, idempotencyKey: row.idempotencyKey, occurredAt: row.occurredAt.toISOString(), payload: { action: p.action } };
  }
  if (row.type === "RUNTIME_CREATION_REQUESTED" || row.type === "RUNTIME_CREATION_DECIDED") {
    const p = row.payload, requested = row.type === "RUNTIME_CREATION_REQUESTED";
    if (row.schemaVersion !== 1 || row.aggregateType !== "RUNTIME_CREATION" || row.operation !== "runtimeCreationCommand" || !row.aggregateId || !row.causationId || !row.actorId || row.actorVersion < 1 || row.sequence !== (requested ? 1 : 2) || row.actorRole !== (requested ? "JUNIOR_PROJECT_MANAGER" : "DIRECTOR") || row.id !== `runtime-creation:${row.causationId}` || row.idempotencyKey !== row.id || row.correlationId !== row.aggregateId || !Number.isFinite(row.occurredAt.getTime()) || [row.projectId,row.flexibleProjectId,row.taskId,row.taskEntryId,row.decisionId,row.nativeEventId,row.approvalEvidenceId,row.fileVersionId].some(v=>v!==null) || !p || typeof p !== "object" || Array.isArray(p) || Object.keys(p).join() !== "snapshotHash" || typeof p.snapshotHash !== "string" || !/^[a-f0-9]{64}$/.test(p.snapshotHash)) throw new Error("UNSUPPORTED_EVENT_CONTRACT");
    return { id: row.id, type: row.type, schemaVersion: 1, aggregate: { type: "RUNTIME_CREATION", id: row.aggregateId, sequence: row.sequence }, native: { type: requested ? "RuntimeCreationRequest" : "RuntimeCreationDecision", id: row.causationId }, actor: { kind: "INTERNAL", userId: row.actorId, businessRole: row.actorRole, authorizationVersion: row.actorVersion }, operation: "runtimeCreationCommand", correlationId: row.correlationId, causationId: row.causationId, idempotencyKey: row.idempotencyKey, occurredAt: row.occurredAt.toISOString(), payload: { snapshotHash: p.snapshotHash } };
  }

  if (row.type === "RUNTIME_ACTIVITY") {
    const p = row.payload;
    if (row.schemaVersion !== 1 || row.aggregateType !== "RUNTIME_PROJECT" || row.operation !== "runtimeStageCommand" || !row.aggregateId || !row.causationId || row.id !== `runtime:${row.causationId}` || row.idempotencyKey !== row.id || row.correlationId !== row.aggregateId || !Number.isSafeInteger(row.sequence) || row.sequence < 1 || !Number.isSafeInteger(row.actorVersion) || row.actorVersion < 1 || !row.actorId || !Number.isFinite(row.occurredAt.getTime()) || !["DIRECTOR", "SENIOR_PROJECT_MANAGER", "JUNIOR_PROJECT_MANAGER"].includes(row.actorRole) || [row.projectId, row.flexibleProjectId, row.taskId, row.taskEntryId, row.decisionId, row.nativeEventId, row.approvalEvidenceId, row.fileVersionId].some(v => v !== null) || !p || typeof p !== "object" || Array.isArray(p) || Object.keys(p).sort().join() !== "action,stageId" || typeof p.action !== "string" || !["CREATED", "FIELDS", "CHECKLIST", "UPLOAD_PREPARED", "FILE_SUBMITTED", "UPLOAD_FAILED", "FILE_DECIDED", "APPROVAL_SUBMITTED", "APPROVAL_DECIDED", "COMPLETED"].includes(p.action) || (p.action === "CREATED" ? p.stageId !== null : typeof p.stageId !== "string" || !p.stageId)) throw new Error("UNSUPPORTED_EVENT_CONTRACT");
    return { id: row.id, type: "RUNTIME_ACTIVITY", schemaVersion: 1, aggregate: { type: "RUNTIME_PROJECT", id: row.aggregateId, sequence: row.sequence }, native: { type: "RuntimeActivity", id: row.causationId }, actor: { kind: "INTERNAL", userId: row.actorId, businessRole: row.actorRole, authorizationVersion: row.actorVersion }, operation: "runtimeStageCommand", correlationId: row.correlationId, causationId: row.causationId, idempotencyKey: row.idempotencyKey, occurredAt: row.occurredAt.toISOString(), payload: p as RuntimeActivityEvent["payload"] };
  }
  if (["WORKFLOW_PUBLICATION_SUBMITTED", "WORKFLOW_PUBLICATION_SUPERSEDED", "WORKFLOW_PUBLICATION_DECIDED", "WORKFLOW_VERSION_PUBLISHED"].includes(row.type)) return workflowPublicationEvent(row);
  if (row.type === EVENT_TYPE) return reviewEvent(row);
  if (row.type === "WORKFLOW_DRAFT_REVISED") {
    const p = row.payload;
    if (row.schemaVersion !== 1 || row.aggregateType !== "WORKFLOW_DRAFT" || row.operation !== "draftWorkflowCommand" ||
      !row.aggregateId || !row.causationId || row.id !== `draft:${row.causationId}` || row.idempotencyKey !== row.id || row.correlationId !== row.aggregateId ||
      !Number.isInteger(row.sequence) || row.sequence < 1 || !Number.isInteger(row.actorVersion) || row.actorVersion < 1 || !row.actorId || !Number.isFinite(row.occurredAt.getTime()) ||
      !["DIRECTOR", "SENIOR_PROJECT_MANAGER"].includes(row.actorRole) || [row.projectId, row.flexibleProjectId, row.taskId, row.taskEntryId, row.decisionId, row.nativeEventId, row.approvalEvidenceId, row.fileVersionId].some(v => v !== null) ||
      !p || typeof p !== "object" || Array.isArray(p) || Object.keys(p).sort().join() !== "action,configurationHash,validationStatus" ||
      typeof p.action !== "string" || !["CREATE", "REVISE", "CLONE"].includes(p.action) || typeof p.configurationHash !== "string" || !/^[a-f0-9]{64}$/.test(p.configurationHash) ||
      typeof p.validationStatus !== "string" || !["VALID", "INCOMPLETE"].includes(p.validationStatus)) throw new Error("UNSUPPORTED_EVENT_CONTRACT");
    return { id: row.id, type: "WORKFLOW_DRAFT_REVISED", schemaVersion: 1, aggregate: { type: "WORKFLOW_DRAFT", id: row.aggregateId, sequence: row.sequence },
      native: { type: "WorkflowDraftRevision", id: row.causationId }, actor: { kind: "INTERNAL", userId: row.actorId, businessRole: row.actorRole, authorizationVersion: row.actorVersion },
      operation: "draftWorkflowCommand", correlationId: row.correlationId, causationId: row.causationId, idempotencyKey: row.idempotencyKey, occurredAt: row.occurredAt.toISOString(), payload: p as WorkflowDraftEvent["payload"] };
  }
  const p = row.payload;
  if (row.type !== "TASK_ACTIVITY" || row.schemaVersion !== 1 || row.aggregateType !== "UNIVERSAL_TASK" ||
    !["generalTaskCommand", "deliverableTaskCommand", "conceptTaskCommand"].includes(row.operation) || !row.taskId || !row.taskEntryId || row.aggregateId !== row.taskId ||
    Number(!!row.projectId) + Number(!!row.flexibleProjectId) + Number(!!row.runtimeTaskContext) !== 1 || (row.runtimeTaskContext && (row.runtimeTaskContext.taskId !== row.taskId || row.runtimeTaskContext.eventId !== row.id || !row.runtimeTaskContext.projectId || !["generalTaskCommand", "deliverableTaskCommand", "conceptTaskCommand"].includes(row.operation))) || row.decisionId || row.nativeEventId || row.approvalEvidenceId || row.fileVersionId ||
    !Number.isInteger(row.sequence) || row.sequence < 1 || !Number.isInteger(row.actorVersion) || row.actorVersion < 1 || !Number.isFinite(row.occurredAt.getTime()) || row.id !== `task:${row.taskEntryId}` || row.idempotencyKey !== row.id || row.causationId !== row.taskEntryId || row.correlationId !== row.taskId || !["DIRECTOR","SENIOR_PROJECT_MANAGER","JUNIOR_PROJECT_MANAGER","DESIGNER","DIGITAL_LEAD"].includes(row.actorRole) ||
    !p || typeof p !== "object" || Array.isArray(p) || Object.keys(p).sort().join() !== "action,directorOverride,status" ||
    typeof p.action !== "string" || !["CREATED","EDIT","MESSAGE","SUBMIT","REQUEST_COMPLETION","APPROVE","REJECT","CLOSE","DELETE","PREPARE_UPLOAD","FINALIZE_UPLOAD","REFRESH_TARGET","PREPARE_APPLICATION","APPLICATION_FAILED","SET_SOURCE"].includes(p.action) ||
    typeof p.status !== "string" || !["OPEN","IN_PROGRESS","COMPLETION_REQUESTED","COMPLETED","CLOSED"].includes(p.status) || typeof p.directorOverride !== "boolean") throw new Error("UNSUPPORTED_EVENT_CONTRACT");
  return { id: row.id, type: "TASK_ACTIVITY", schemaVersion: 1, aggregate: { type: "UNIVERSAL_TASK", id: row.taskId, sequence: row.sequence },
    native: { type: "UniversalTaskEntry", id: row.taskEntryId }, actor: { kind: "INTERNAL", userId: row.actorId, businessRole: row.actorRole, authorizationVersion: row.actorVersion },
    context: { projectId: row.projectId, flexibleProjectId: row.flexibleProjectId, ...(row.runtimeTaskContext ? { runtimeProjectId: row.runtimeTaskContext.projectId } : {}), taskId: row.taskId }, operation: row.operation as TaskActivityEvent["operation"],
    correlationId: row.correlationId, causationId: row.causationId, idempotencyKey: row.idempotencyKey, occurredAt: row.occurredAt.toISOString(),
    payload: { action: p.action, status: p.status, directorOverride: p.directorOverride } };
}
