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
  for (const name of ["UniversalTaskTarget", "UniversalTaskApplication", "UniversalTaskPublication"]) schema = schema.replace(new RegExp(`^model ${name} \\{[\\s\\S]*?^\\}`, "m"), "");
  schema = schema.replace(/^  (?:deliverableTarget|applications|applicationRequest|applicationAcceptance|taskPublicationSources|taskPublicationResult|taskPublication|reviewedTaskApplications)\s+[^\n]+\n/gm, "");
  return schema.replace(/^  TASK_DELIVERABLE_ACCEPTED\n/m, "");
}
