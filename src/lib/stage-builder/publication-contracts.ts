import { commandId, ensure, record, validateDefinition, type WorkflowDefinition } from "./contracts";

export const PUBLICATION_NOTICE = "Approved definition — retained for future project use. Project creation and stage execution are not available yet.";
export const WORKFLOW_PUBLICATION_POLICY = Object.freeze({ key: "workflow-publication.director.v1", steps: Object.freeze(["DIRECTOR" as const]) });
// Explicitly confirmed by the business owner for Phase 4.2. This does not
// alter Tasker/native-file self-review policies or create another approver.
export const DIRECTOR_AUTHORED_PUBLICATION_POLICY = "EXPLICIT_DIRECTOR_DECISION" as const;
export function publicationIssues(definition: WorkflowDefinition) {
  const issues = validateDefinition(definition);
  if (!definition.intendedProjectType) issues.push({ path: "intendedProjectType", message: "Choose the intended project type before submitting for approval." });
  return issues;
}
export function parsePublicationSubmission(raw: unknown) {
  const value = record(raw, ["commandId", "expectedRevision", "configurationHash", "changeSummary"]);
  commandId(value.commandId);
  ensure(Number.isSafeInteger(value.expectedRevision) && Number(value.expectedRevision) > 0, "INVALID_REVISION");
  ensure(typeof value.configurationHash === "string" && /^[a-f0-9]{64}$/.test(value.configurationHash), "INVALID_CONFIGURATION_HASH");
  ensure(typeof value.changeSummary === "string" && value.changeSummary.trim().length > 0 && value.changeSummary.length <= 2000, "CHANGE_SUMMARY_REQUIRED");
  return { commandId: value.commandId, expectedRevision: Number(value.expectedRevision), configurationHash: value.configurationHash, changeSummary: value.changeSummary.trim() };
}
