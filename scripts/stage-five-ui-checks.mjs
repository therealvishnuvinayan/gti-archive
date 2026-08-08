import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [workspace, summaryAlias, summary, page, workflowAccess, overview, schema, chatWorkspace, service, actions, uploadClient, stageFourWorkspace, conceptActions, emailTemplate, migration, integrityMigration] =
  await Promise.all([
    readFile("src/components/projects/stage-five-workspace.tsx", "utf8"),
    readFile("src/components/projects/project-stage-summary.tsx", "utf8"),
    readFile("src/components/projects/project-summary-strip.tsx", "utf8"),
    readFile("src/app/(dashboard)/projects/[slug]/stages/5/page.tsx", "utf8"),
    readFile("src/lib/workflow-stage-access.ts", "utf8"),
    readFile("src/components/projects/project-overview-workspace.tsx", "utf8"),
    readFile("prisma/schema.prisma", "utf8"),
    readFile("src/components/projects/project-chat-workspace.tsx", "utf8"),
    readFile("src/lib/stage-five.ts", "utf8"),
    readFile("src/app/(dashboard)/projects/[slug]/stages/5/actions.ts", "utf8"),
    readFile("src/lib/stage-five-upload-client.ts", "utf8"),
    readFile("src/components/projects/concept-stage-workspace.tsx", "utf8"),
    readFile("src/app/(dashboard)/projects/[slug]/stages/concept-actions.ts", "utf8"),
    readFile("src/lib/email/checklist-information-request.ts", "utf8"),
    readFile("prisma/migrations/20260808160000_stage_five_file_checklists/migration.sql", "utf8"),
    readFile("prisma/migrations/20260808170000_stage_five_attachment_delete_integrity/migration.sql", "utf8"),
  ]);

const checklistItems = [
  "Output Name",
  "Technical Drawing",
  "Health Warning",
  "Tar / Nicotine",
  "Compulsory Text",
  "Marketing Copy",
  "Related Graphics",
  "Printing Technology",
  "Finishes",
  "Barcode",
  "Track & Trace",
  "3D's",
  "Tax Stamp",
  "QR Code",
  "Invoice",
];

let lastPosition = -1;
for (const item of checklistItems) {
  const position = workspace.indexOf(`title: "${item}"`);
  assert(position > lastPosition, `Missing or out-of-order Stage 5 checklist item: ${item}`);
  lastPosition = position;
}

for (const content of [
  "Stage 5 - File Checklist",
  "Complete or request the required project information and files.",
  "Pending",
  "Filled",
  "Requested",
  "Request",
  "Existing collaborator",
  "Manual email",
  "All Stages",
  "Next Stage",
]) {
  assert(workspace.includes(content), `Missing Stage 5 UI content: ${content}`);
}
for (const label of ["Project Name", "Project Owner", "Project Co-Owners", "Project Executors"]) {
  assert(summary.includes(label), `Missing shared project summary label: ${label}`);
}
assert(
  workspace.includes("ProjectStageSummary") &&
    workspace.includes('from "@/components/projects/project-stage-summary"') &&
    summaryAlias.includes("ProjectFlowSummaryStrip"),
  "Stage 5 must use the shared real-data project summary.",
);

assert(
  workspace.includes("CHECKLIST_ITEMS.map") &&
    workspace.includes("onRequest={() => setRequestField(item)}"),
  "Every checklist definition must render the shared Request action.",
);
assert(
  workspace.includes('const [mode, setMode] = useState<"edit" | "view">(') &&
    workspace.includes('updateMode("edit")') &&
    workspace.includes('updateMode("view")') &&
    workspace.includes('aria-label="File Checklist presentation mode"'),
  "Stage 5 must default to Edit and provide the Stage 1-style Edit/View control.",
);
assert(
  workspace.includes("StageFiveReadOnlyView") &&
    workspace.includes('aria-label="View File Checklist"') &&
    workspace.includes("Not provided") &&
    workspace.includes("Read-only checklist summary."),
  "Stage 5 View mode must render a dedicated readable checklist with explicit empty values.",
);
assert(
  workspace.includes("textValues={activeDraft.textValues}") &&
    workspace.includes("files={activeDraft.files}") &&
    workspace.includes("multiValues={activeDraft.multiValues}") &&
    workspace.includes("healthWarningIncluded={activeDraft.healthWarningIncluded}"),
  "Stage 5 View mode must read the same per-file draft state used by Edit mode.",
);
assert(
  workspace.includes("selectedFiles.map") &&
    workspace.includes("formatFileSize(file.size)") &&
    workspace.includes("values.map"),
  "Stage 5 View mode must show selected file metadata and repeatable values.",
);
const readOnlyView = workspace.slice(
  workspace.indexOf("function StageFiveReadOnlyView"),
  workspace.indexOf("function RequestInformationDialog"),
);
assert(
  !readOnlyView.includes("<Input") &&
    !readOnlyView.includes("<Textarea") &&
    !readOnlyView.includes("<button") &&
    !readOnlyView.includes("ChecklistUploadField") &&
    !readOnlyView.includes("Request"),
  "Stage 5 View mode must not render editing, upload, removal, Add, or Request controls.",
);
assert(
  workspace.includes('type="file"') && workspace.includes("multiple={multiple}"),
  "Stage 5 must support single and multiple checklist attachments.",
);
assert(
  workspace.includes("uploadStageFiveChecklistAttachment") &&
    uploadClient.includes('assetType: "FILE_CHECKLIST_ATTACHMENT"') &&
    uploadClient.includes("/api/project-assets/upload-url") &&
    uploadClient.includes("/api/project-assets/complete"),
  "Stage 5 attachments must reuse authenticated ProjectAttachment upload infrastructure.",
);
assert(
  workspace.includes("requestStageFiveChecklistInformationAction") &&
    workspace.includes("Existing collaborator") &&
    workspace.includes("Manual email") &&
    workspace.includes("Send Request") &&
    !workspace.includes("Request functionality will be connected"),
  "The Request dialog must dispatch real collaborator and manual-email requests.",
);
assert(
  workspace.includes('href={`/projects/${project.id}/stages/6`}') &&
    !workspace.includes("completeProject") &&
    !workspace.includes("completeProjectStage"),
  "Next Stage must open Stage 6 directly without mutating Stage 5 workflow state.",
);
assert(
  workspace.includes("href={`/projects/${project.id}`}") && workspace.includes("All Stages"),
  "All Stages must return to the project overview.",
);

assert(
  page.includes("DashboardLayout") &&
    page.includes("getProjectStageShellById") &&
    page.includes("requireUser") &&
    page.includes("StageFiveWorkspace") &&
    page.includes("getStageFiveWorkspaceData") &&
    page.includes("searchParams"),
  "The Stage 5 route must use the existing shell and real authenticated project data.",
);
assert(
  page.includes("ProjectWorkflowStageKey.FINAL_LAYOUT") &&
    page.includes("canOpenImplementedWorkflowStage") &&
    page.includes("StageLockedState"),
  "Stage 5 must reuse centralized persisted workflow access.",
);
assert(
  workflowAccess.includes("ProjectWorkflowStageKey.FINAL_LAYOUT") &&
    overview.includes("stage.number >= 1 && stage.number <= 7"),
  "The centralized SUPER_ADMIN testing bypass and overview must include implemented Stage 5.",
);

assert(
  schema.includes("model ProjectStageFileHandoff") &&
    schema.includes("model ProjectFileChecklist") &&
    schema.includes("model ProjectFileChecklistItem") &&
    schema.includes("model ProjectFileChecklistItemAttachment") &&
    schema.includes("model ProjectFileChecklistRequest") &&
    schema.includes("enum ProjectFileChecklistField"),
  "Stage 5 must use typed per-file checklist, attachment association, handoff, and request models.",
);
assert(
  migration.includes("ProjectStageFileHandoff_stage_pair_check") &&
    migration.includes("ProjectFileChecklistRequest_recipient_check") &&
    migration.includes("ProjectFileChecklist_projectId_sourceAttachmentId_key"),
  "The additive migration must enforce the Stage 4/5 pair, recipient channel shape, and per-file uniqueness.",
);
assert(
  integrityMigration.includes("ProjectStageFileHandoff_sourceAttachmentId_fkey") &&
    integrityMigration.includes("ProjectFileChecklist_sourceAttachmentId_fkey") &&
    integrityMigration.includes("ProjectFileChecklistItemAttachment_attachmentId_fkey") &&
    (integrityMigration.match(/ON DELETE CASCADE/g)?.length ?? 0) === 3,
  "Stage 5 attachment relations must preserve project deletion integrity.",
);
assert(
  stageFourWorkspace.includes("Final files for Stage 5") &&
    stageFourWorkspace.includes("Send to Stage 5") &&
    conceptActions.includes("handoffStageFourFiles") &&
    service.includes("stageFourAttachmentWhere") &&
    service.includes("skipDuplicates: true"),
  "Stage 4 must expose a minimal idempotent final-file designation surface.",
);
assert(
  workspace.includes("selectedHandoffId") &&
    workspace.includes("dirtyHandoffIds") &&
    workspace.includes("Save Changes") &&
    service.includes("saveStageFiveChecklist") &&
    actions.includes("saveStageFiveChecklistAction"),
  "Stage 5 must keep independent per-file drafts and persist them explicitly.",
);
assert(
  service.includes("CHECKLIST_INFORMATION_REQUESTED") &&
    service.includes("clientRequestId") &&
    service.includes("recipientUserId") &&
    service.includes("ProjectFileChecklistRequestStatus.FAILED") &&
    emailTemplate.includes("Please reply to this email") &&
    emailTemplate.includes("secure external response link will be introduced in a later phase"),
  "Checklist requests must persist, notify project participants, and send the approved reply-by-email template.",
);
assert(
  !service.includes("ProjectWorkflowStageStatus.COMPLETED") &&
    !service.includes("PRODUCTION_AND_HANDOVER") &&
    !actions.includes("completeProject") &&
    !workspace.includes("response token") &&
    !page.includes("public"),
  "This phase must not complete Stage 5, unlock Stage 6, or add an external response portal.",
);
assert(
  chatWorkspace.includes("ProjectChatWorkspace") && !workspace.includes("ProjectChatWorkspace"),
  "Stage 5 must not modify or embed the existing project chat workspace.",
);

console.log("Stage 5 persistent per-file checklist UI checks passed.");
