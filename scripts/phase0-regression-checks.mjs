import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));

function read(relativePath) {
  return readFileSync(join(rootDir, relativePath), "utf8");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertIncludes(source, value, label) {
  assert(source.includes(value), `${label} is missing.`);
}

const resolver = read("src/lib/permissions/resolver.ts");
assert(!resolver.includes("isClientOfGtiUser"), "Removed client-type helper must stay absent.");
assertIncludes(resolver, "archives: canUseArchives(user)", "archive sidebar entitlement block");
assertIncludes(
  resolver,
  "case \"project.viewBudget\"",
  "budget project permission case",
);
assertIncludes(
  resolver,
  "return isProjectAdmin(user) || isProjectOwnerOrCoOwner(user, project);",
  "owner/co-owner/admin project management rule",
);

const definitions = read("src/lib/permissions/definitions.ts");
assert(!definitions.includes("defaultCollaboratorTypePermissions"), "Type defaults must stay removed.");

const archives = read("src/lib/archives.ts");
assertIncludes(archives, "await canAccessArchivesArea(user)", "archive list guard");
assertIncludes(
  archives,
  "if (!hasPermission(user, \"archive.download\"))",
  "manual archive download guard",
);
assertIncludes(
  archives,
  "assertCanAccessManualArchiveFileAsset",
  "manual archive access guard",
);
assertIncludes(
  archives,
  "const canViewArchivedFiles = hasProjectPermission(user, project, \"archive.view\");",
  "project archive summary per-project view guard",
);
assertIncludes(
  archives,
  "if (!hasProjectPermission(user, project, \"archive.download\"))",
  "project archive download per-project guard",
);
assertIncludes(
  archives,
  "if (!hasProjectPermission(user, project, \"archive.view\"))",
  "project archive preview per-project guard",
);
assertIncludes(
  archives,
  "getFinalCompletionArchiveBlockers",
  "final completion archive blocker helper",
);
assertIncludes(
  archives,
  "Final completion requirements must be resolved before archive.",
  "archive blocked until final completion requirements resolve",
);
assert(
  (archives.match(/getFinalCompletionArchiveBlockers/g) ?? []).length >= 3,
  "Archive preparation, summary, and transaction must all use final completion blockers.",
);

const projects = read("src/lib/projects.ts");
assertIncludes(
  projects,
  "buildProjectListStatusWhere(filter.status ?? \"ALL\")",
  "V2 workflow status filter",
);
assert(!projects.includes("filter.budgetMin"), "project list must not retain legacy budget filters");
assertIncludes(
  projects,
  "visibleCollaboratorRecords",
  "participant directory response filtering",
);
assertIncludes(
  projects,
  "normalizeProjectCollaboratorPermissions(",
  "project collaborator permission normalization",
);

const schema = read("prisma/schema.prisma");
for (const field of [
  "canInteract",
  "canAddCaptions",
  "canDownloadFiles",
  "canViewBudget",
  "canViewVendorInfo",
  "canAccessProjectArchives",
]) {
  assertIncludes(schema, `${field}`, `ProjectCollaborator.${field} schema field`);
}
for (const field of [
  "approvalSelectedProjectFileIds",
  "invoiceRequired",
  "invoiceContactUserId",
  "invoiceNote",
  "invoiceRequestedAt",
]) {
  assertIncludes(schema, field, `ProjectCompletionWorkflow.${field} schema field`);
}

const phase1Migration = read(
  "prisma/migrations/20260705000100_add_project_collaborator_permissions/migration.sql",
);
assertIncludes(
  phase1Migration,
  "ADD COLUMN \"canInteract\" BOOLEAN NOT NULL DEFAULT false",
  "per-project permission migration",
);
assertIncludes(
  phase1Migration,
  "SET \"canInteract\" = true",
  "executor interaction backfill",
);

const phase2Migration = read(
  "prisma/migrations/20260705000200_add_pre_archive_completion_workflow_fields/migration.sql",
);
assertIncludes(
  phase2Migration,
  "ADD COLUMN \"approvalSelectedProjectFileIds\"",
  "pre-archive approval file selection migration",
);
assertIncludes(
  phase2Migration,
  "ADD COLUMN \"invoiceContactUserId\"",
  "final invoice recipient migration",
);

const history = read("src/lib/project-history.ts");
assertIncludes(history, "export async function assertStageChatWriteAccess", "chat write guard");
assertIncludes(
  history,
  "!input.stage.actualStartedAt",
  "chat guard brief acceptance check",
);
assertIncludes(
  history,
  "input.stage.status === StageStatus.COMPLETED",
  "chat guard completed stage check",
);
for (const functionName of [
  "createStageComment",
  "createStageTextCommentFast",
  "prepareStageCommentUploads",
  "finalizePreparedStageCommentUploads",
  "completePreparedChatAttachmentUpload",
]) {
  const pattern = new RegExp(
    `export async function ${functionName}[\\s\\S]*?assertStageChatWriteAccess`,
  );
  assert(pattern.test(history), `${functionName} must use assertStageChatWriteAccess.`);
}
assertIncludes(
  history,
  "ensureFinalCompletionWorkflowExistsTx",
  "final stage completion workflow upsert helper",
);
assert(
  (history.match(/ensureFinalCompletionWorkflowExistsTx/g) ?? []).length >= 3,
  "Final completion workflow must be created from final stage completion paths.",
);

const projectCompletion = read("src/lib/project-completion.ts");
for (const requiredSnippet of [
  "canUseFinalCompletionWorkflow",
  "areAllStagesCompleted",
  "getFinalCompletionArchiveBlockers",
  "getPreArchiveFinalFileOptions",
  "approvalSelectedProjectFileIds",
  "sourceAttachmentId",
  "requestProjectFinalInvoice",
  "invoiceContactUserId",
  "invoiceStatus: ProjectCompletionStepStatus.PENDING",
  "Only the selected approval contact can upload authority approval proof.",
  "Only the selected copyright contact can upload copyright transfer documents.",
  "Only the selected final invoice recipient can upload the final invoice.",
]) {
  assertIncludes(projectCompletion, requiredSnippet, `project completion ${requiredSnippet}`);
}
assert(
  !projectCompletion.includes("Email/notification sending will be connected later"),
  "Completion workflow must not keep placeholder email/notification copy.",
);

const comparison = read("src/lib/comparison.ts");
assertIncludes(
  comparison,
  "assertStageChatWriteAccess(user",
  "comparison comment chat guard",
);
assertIncludes(
  comparison,
  "isAllowedComparisonSubmissionFile",
  "comparison server submission validator",
);
assert(
  !comparison.includes("\"jpg\"") &&
    !comparison.includes("\"jpeg\"") &&
    !comparison.includes("\"image/jpeg\"") &&
    !comparison.includes("\"image/webp\""),
  "Comparison server validation must not allow legacy JPG/JPEG/WebP artwork submissions.",
);

const comparisonUtils = read("src/lib/comparison-utils.ts");
assertIncludes(
  comparisonUtils,
  "isAllowedComparisonSubmissionFile",
  "comparison candidate submission validator",
);
assert(
  !comparisonUtils.includes("\"jpg\"") &&
    !comparisonUtils.includes("\"jpeg\"") &&
    !comparisonUtils.includes("\"image/jpeg\"") &&
    !comparisonUtils.includes("\"image/webp\""),
  "Comparison candidates must not allow legacy JPG/JPEG/WebP artwork submissions.",
);

const uploadValidation = read("src/lib/upload-validation.ts");
assertIncludes(
  uploadValidation,
  "PROJECT_ASSET_ALLOWED_EXTENSIONS;",
  "standard project format formal submission extension rule",
);
assertIncludes(
  uploadValidation,
  "export const COMPARISON_SUBMISSION_ALLOWED_EXTENSIONS = [\"png\"] as const;",
  "PNG-only comparison submission extension rule",
);
assertIncludes(
  uploadValidation,
  "isAllowedStageSubmissionFile",
  "stage submission validation helper",
);
assertIncludes(
  uploadValidation,
  "extensionSet.has(extension)",
  "submission validation extension check",
);
assert(
  !/VIDEO_STAGE_SUBMISSION|isVideoProjectCategory|videoStageSubmissionAllowed/.test(
    uploadValidation,
  ),
  "Formal submission validation must not keep video-category exceptions.",
);

const projectCollaboratorPermissions = read("src/lib/project-collaborator-permissions.ts");
assertIncludes(
  projectCollaboratorPermissions,
  "canAccessProjectArchives: false",
  "conservative archive default",
);
assertIncludes(
  projectCollaboratorPermissions,
  "canInteract: true",
  "uniform project-participant interaction default",
);
assertIncludes(
  projectCollaboratorPermissions,
  "canInteract",
  "canInteract per-project grant",
);

for (const resolverCheck of [
  "hasProjectCollaboratorGrant(user, project, \"canViewBudget\")",
  "hasProjectCollaboratorGrant(user, project, \"canViewVendorInfo\")",
  "hasProjectCollaboratorGrant(user, project, \"canDownloadFiles\")",
  "hasProjectCollaboratorGrant(user, project, \"canInteract\")",
  "hasProjectArchiveAccessGrant(user, project)",
  "hasProjectCollaboratorGrant(user, project, \"canAddCaptions\")",
]) {
  assertIncludes(resolver, resolverCheck, `resolver grant ${resolverCheck}`);
}

const projectCreation = read("src/lib/project-creation.ts");
assertIncludes(
  projectCreation,
  "normalizeProjectCollaboratorPermissions(",
  "V2 project creation permission persistence",
);

const projectActions = read("src/app/(dashboard)/projects/actions.ts");
for (const requiredSnippet of [
  "notifyFinalInvoiceRequested",
  "requestProjectFinalInvoiceAction",
  "requestProjectFinalInvoice(user, input)",
  "selectedProjectFileIds",
  "recipientUserId: input.contactUserId",
]) {
  assertIncludes(projectActions, requiredSnippet, `project action ${requiredSnippet}`);
}

const createProjectForm = read("src/components/projects/create-project-form.tsx");
assertIncludes(
  createProjectForm,
  "ProjectUserSelector",
  "V2 project participant selector",
);
assertIncludes(
  createProjectForm,
  "createProjectV2Action",
  "V2 project creation action",
);

const completionChecklist = read("src/components/projects/project-completion-checklist.tsx");
for (const requiredSnippet of [
  "requestProjectFinalInvoiceAction",
  "Request Final Invoice",
  "workflowState.canUploadApprovalProof",
  "workflowState.canUploadCopyrightDocument",
  "workflowState.canUploadInvoice",
  "workflow.invoiceRequired",
  "workflow.approvalSelectedProjectFileIds",
]) {
  assertIncludes(completionChecklist, requiredSnippet, `completion checklist ${requiredSnippet}`);
}
assert(
  !completionChecklist.includes("Email/notification sending will be connected later"),
  "Completion checklist must not keep placeholder notification copy.",
);

const projectChatWorkspace = read("src/components/projects/project-chat-workspace.tsx");
for (const requiredSnippet of [
  "shouldExpectCompletionWorkflow",
  "shouldShowCompletionChecklist",
  "completionState.isFinalCompletionPending",
  "completionState.finalCompletionBlockers",
  "Archive Project",
]) {
  assertIncludes(projectChatWorkspace, requiredSnippet, `chat workspace ${requiredSnippet}`);
}

const projectDetailWorkspace = read("src/components/projects/project-detail-workspace.tsx");
for (const requiredSnippet of [
  "shouldExpectCompletionWorkflow",
  "shouldShowCompletionChecklist",
  "completionSummary?.isFinalCompletionPending",
  "completionSummary.finalCompletionBlockers",
  "Archive Final Files",
]) {
  assertIncludes(projectDetailWorkspace, requiredSnippet, `detail workspace ${requiredSnippet}`);
}

const notificationTriggers = read("src/lib/notification-center/triggers.ts");
for (const requiredSnippet of [
  "recipientUserId: string;",
  "notifyFinalInvoiceRequested",
  "Final invoice requested",
  "COMPLETION_WORKFLOW",
]) {
  assertIncludes(notificationTriggers, requiredSnippet, `notification trigger ${requiredSnippet}`);
}

const aiAccess = read("src/lib/ai/access.ts");
assertIncludes(
  aiAccess,
  "projectCollaboratorPermissionSelect",
  "AI chat project grant select",
);

const helpCenter = read("src/lib/help-center.ts");
assertIncludes(
  helpCenter,
  "Stage submissions support standard project file formats. PNG submissions can also be compared or captioned.",
  "stage upload and PNG comparison help text",
);

console.log("Phase 0/1/2 regression checks passed.");
