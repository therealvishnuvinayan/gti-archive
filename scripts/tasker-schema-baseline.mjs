import { withoutArchiveFoldersSchema } from "./archive-folders-schema-baseline.mjs";
// Reconstruct the reviewed Phase 2.3 shape for disposable migration tests only.
export function withoutTaskerSchema(schema) {
  schema = withoutTaskDeliverablesSchema(schema);
  for (const name of ["UniversalTask", "UniversalTaskEntry", "UniversalTaskSpectator", "UniversalTaskUpload", "UniversalTaskType", "UniversalTaskStatus", "UniversalTaskPriority"]) {
    schema = schema.replace(new RegExp(`^(?:model|enum) ${name} \\{[\\s\\S]*?^\\}`, "m"), "");
  }
  schema = schema.replace(/^  (?:ownedUniversalTasks|executedUniversalTasks|universalTaskSpectators|universalTaskEntries|universalTaskUploads|universalTasks|taskUpload|taskUploadId|taskEntry|taskEntryId|taskId|task)\s+[^\n]+\n/gm, "");
  schema = schema.replace(/^  @@unique\(\[taskEntryId, versionId\]\)[^\n]*\n/gm, "").replace(/^  TASK_ACTIVITY\n/m, "");
  schema = schema.replace(/model FlexibleProject \{[\s\S]*?^\}/m, b => b.replace(/^  businessEvents\s+[^\n]+\n/m, ""));
  schema = schema.replace(/model SharedFileProvenance \{[\s\S]*?^\}/m, b => b.replace(/(completionEventId\s+String)\?/, "$1").replace(/(completionEvent\s+CompletionDocumentEvent)\?/, "$1"));
  schema = schema.replace(/model BusinessEvent \{[\s\S]*?^\}/m, b => b.replace(/^  flexibleProject(?:Id)?\s+[^\n]+\n/gm, "").replace(/\?/g, "" ).replace(/(delivery\s+EventOutbox)/, "$1?"));
  return schema;
}

// Phase 3.1 schema remains usable while the deliverable capability is off.
export function withoutTaskDeliverablesSchema(schema) {
  schema = withoutTaskConceptsSchema(schema);
  for (const name of ["UniversalTaskTarget", "UniversalTaskApplication", "UniversalTaskPublication"]) schema = schema.replace(new RegExp(`^model ${name} \\{[\\s\\S]*?^\\}`, "m"), "");
  schema = schema.replace(/^  (?:deliverableTarget|applications|applicationRequest|applicationAcceptance|taskPublicationSources|taskPublicationResult|taskPublication|reviewedTaskApplications)\s+[^\n]+\n/gm, "");
  return schema.replace(/^  TASK_DELIVERABLE_ACCEPTED\n/m, "");
}

// Phase 3.2 compatibility: relation-only additions must not leak into old schemas.
export function withoutTaskConceptsSchema(schema) {
  schema = withoutTaskSistersSchema(schema);
  return schema.replace(/^model UniversalTaskReference \{[\s\S]*?^\}/m, "")
    .replace(/^  (?:taskReferences|selectedTaskReferences|submittedTaskReferences|reviewedTaskReferences)\s+[^\n]+\n/gm, "");
}

export function withoutTaskSistersSchema(schema) {
  schema = withoutStageBuilderSchema(schema);
  for (const name of ["UniversalTaskFamilyLink", "UniversalTaskInheritedEvidence"]) schema = schema.replace(new RegExp(`^model ${name} \\{[\\s\\S]*?^\\}`, "m"), "");
  return schema.replace(/^  (?:sisterLink|sisterChildren|familyMembers|sisterCreation|inheritedSubmissions|inheritedReviews|inheritedEvidence)\s+[^\n]+\n/gm, "");
}

// Phase 4.1 adds only virtual relations to existing models and one event type.
export function withoutStageBuilderSchema(schema) {
  schema = withoutWorkflowPublicationSchema(schema);
  for (const name of ["WorkflowDraft", "WorkflowDraftRevision"]) schema = schema.replace(new RegExp(`^model ${name} \{[\\s\\S]*?^\}`, "m"), "");
  return schema.replace(/^  (?:workflowDrafts|workflowDraftRevisions|workflowDraftRevision)\s+[^\n]+\n/gm, "").replace(/^  WORKFLOW_DRAFT_REVISED\n/m, "");
}

// Phase 4.2 adds no scalar columns to old models: generated clients remain compatible.
export function withoutWorkflowPublicationSchema(schema) {
  schema = withoutStageRuntimeSchema(schema);
  for (const name of ["WorkflowPublicationSubmission", "PublishedWorkflow", "PublishedWorkflowVersion", "WorkflowPublicationAudit"]) {
    schema = schema.replace(new RegExp(`^model ${name} \{[\\s\\S]*?^\}`, "m"), "");
    schema = schema.replace(new RegExp(`^  \\w+\\s+${name}(?:\\[\\]|\\?)?[^\\n]*\\n`, "gm"), "");
  }
  schema = schema.replace(/^  (?:WORKFLOW_DRAFT_REVISION|WORKFLOW_PUBLICATION_SUBMITTED|WORKFLOW_PUBLICATION_SUPERSEDED|WORKFLOW_PUBLICATION_DECIDED|WORKFLOW_VERSION_PUBLISHED)\n/gm, "");
  return schema.replace(/model ApprovalRequest \{[\s\S]*?^\}/m, block => block.replace(/^(  (?:projectId|project|completionSubmissionId|completionSubmission|submissionEventId|submissionEvent)\s+\w+)\?/gm, "$1"));
}

// Phase 4.3 stays disabled on the existing 114-migration database.
export function withoutStageRuntimeSchema(schema) {
  schema = withoutRuntimeIntegrationSchema(schema);
  for (const name of ["RuntimeProject", "RuntimeParticipant", "RuntimeStage", "RuntimeFileSubmission", "RuntimeApprovalSubmission", "RuntimeActivity"]) {
    schema = schema.replace(new RegExp(`^model ${name} \{[\\s\\S]*?^\}`, "m"), "");
    schema = schema.replace(new RegExp(`^  \\w+\\s+${name}(?:\\[\\]|\\?)?[^\\n]*\\n`, "gm"), "");
  }
  return schema.replace(/^  (?:runtimeStageId|runtimeSubmissionId)\s+[^\n]+\n/gm, "")
    .replace(/^  (?:RUNTIME_STAGE|RUNTIME_STAGE_REVIEWER|RUNTIME_ACTIVITY)\n/gm, "");
}

// Phase 4.3 compatibility: integration models are queried only behind their flag.
export function withoutRuntimeIntegrationSchema(schema) {
  schema = withoutArchiveFoldersSchema(schema);
  for (const name of ["RuntimeCompletionActivity", "RuntimeDocumentPolicy", "RuntimeDocumentFile", "RuntimeDocumentSubmission", "RuntimeDocumentReference", "RuntimeDocumentProvenance", "RuntimeCompletionRequest", "RuntimeCompletionDecision"]) {
    schema = schema.replace(new RegExp(`^model ${name} \{[\\s\\S]*?^\}`, "m"), "");
    schema = schema.replace(new RegExp(`^  \\w+\\s+${name}(?:\\[\\]|\\?)?[^\\n]*\\n`, "gm"), "");
  }
  schema = schema.replace(/^  (?:RUNTIME_DOCUMENT|RUNTIME_COMPLETION_ACTIVITY)\n/gm, "");
  for (const name of ["RuntimeCreationRequest", "RuntimeCreationDecision", "RuntimeTaskContext", "RuntimeTaskEventContext", "RuntimeTaskTarget", "RuntimeTaskApplication", "RuntimeTaskPublication", "RuntimeTaskReference"]) schema = schema.replace(new RegExp(`^model ${name} \\{[\\s\\S]*?^\\}`, "m"), "");
  schema = schema.replace(/^  (?:runtimeSource|runtimeInspectionReferences|runtimeTarget|taskTargets|runtimeApplication|taskApplication|runtimePublication|runtimeTaskPublicationLink|runtimeContext|runtimeContextChildren|taskContexts|taskEventContexts|runtimeTaskContext|runtimeCreationRequests|runtimeCreationDecisions|runtimeCreationRequest|runtimeCreationDecision|creationDecision)\s+[^\n]+\n/gm, "");
  return schema.replace(/^  RUNTIME_CREATION_(?:REQUESTED|DECIDED)\n/gm, "");
}
