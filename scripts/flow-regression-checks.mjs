import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

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

function assertIncludesAll(source, snippets, label) {
  for (const snippet of snippets) {
    assertIncludes(source, snippet, `${label}: ${snippet}`);
  }
}

async function runExistingPhaseChecks() {
  await import(pathToFileURL(join(rootDir, "scripts/phase0-regression-checks.mjs")));
  await import(pathToFileURL(join(rootDir, "scripts/phase3-caption-regression-checks.mjs")));
}

await runExistingPhaseChecks();

const pngOnlyHelpText =
  "Formal stage submissions must be PNG. Only valid PNG stage submissions can be compared or captioned.";

const participantTypes = read("src/lib/project-collaborator-participant-types.ts");
assertIncludesAll(
  participantTypes,
  [
    "GTI_INTERNAL_CLIENT",
    "GTI_SISTER_COMPANY_INTERNAL_CLIENT",
    "EXTERNAL_FREELANCER",
    "EXTERNAL_AGENCY",
    "EXTERNAL_VENDOR",
    "CLIENT_OF_GTI",
  ],
  "participant type coverage",
);

const resolver = read("src/lib/permissions/resolver.ts");
assertIncludesAll(
  resolver,
  [
    "user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN",
    "project.createdById === user.id",
    "ProjectExecutorRole.MAIN_EXECUTOR",
    "hasProjectCollaboratorGrant(user, project, \"canInteract\")",
    "hasProjectCollaboratorGrant(user, project, \"canAddCaptions\")",
    "hasProjectCollaboratorGrant(user, project, \"canViewBudget\")",
    "hasProjectArchiveAccessGrant(user, project)",
    "case \"stage.submitWork\":",
    "case \"file.uploadSubmission\":",
    "return !isProjectOwner(user, project) && isMainProjectExecutor(user, project);",
    "case \"compare.createComment\":\n      return canAddProjectCaptions(user, project);",
    "isArchiveSensitivePermission(permissionKey) && isClientOfGtiUser(user)",
    "archives: canUseArchives(user)",
  ],
  "project permission resolver",
);

const collaboratorPermissions = read("src/lib/project-collaborator-permissions.ts");
assertIncludesAll(
  collaboratorPermissions,
  [
    "canAccessProjectArchives: false",
    "permissions.canAccessProjectArchives = false",
    "canInteract: Boolean(input.canInteract)",
    "canAddCaptions: Boolean(input.canAddCaptions)",
    "canViewBudget: Boolean(input.canViewBudget)",
  ],
  "project collaborator permission normalization",
);

const archivesPage = read("src/app/(dashboard)/archives/page.tsx");
const archiveCategoryPage = read("src/app/(dashboard)/archives/[slug]/page.tsx");
assertIncludes(archivesPage, "if (!canUseArchives(user))", "archives page client hard-deny");
assertIncludes(
  archiveCategoryPage,
  "if (!canUseArchives(user))",
  "archive category page client hard-deny",
);
assertIncludes(
  archiveCategoryPage,
  "canAccessArchiveCategoryRecord(user, category)",
  "archive category access check",
);

const archiveCategories = read("src/lib/archive-categories.ts");
assertIncludes(
  archiveCategories,
  "if (!canUseArchives(user))",
  "archive category API option hard-deny",
);

const archives = read("src/lib/archives.ts");
assertIncludesAll(
  archives,
  [
    "assertCanUseArchives(user);",
    "assertCanAccessArchiveCategory(user, manualArchiveFile.archiveCategoryId)",
    "assertCanUseArchives(user, \"You do not have permission to download archive files.\")",
    "if (!hasProjectPermission(user, project, \"archive.download\"))",
    "if (!hasProjectPermission(user, project, \"archive.view\"))",
    "Final completion requirements must be resolved before archive.",
    "getFinalCompletionArchiveBlockers",
    "latestProject.archive || latestProject.archivedAt || latestProject.completedAt",
  ],
  "archive access and final archive gating",
);

const projectAssetPreviewRoute = read("src/app/api/project-assets/[attachmentId]/preview/route.ts");
const projectAssetDownloadRoute = read("src/app/api/project-assets/[attachmentId]/download/route.ts");
const archivePreviewRoute = read("src/app/api/archives/files/[archivedFileId]/preview/route.ts");
const archiveDownloadRoute = read("src/app/api/archives/files/[archivedFileId]/download/route.ts");
assertIncludes(projectAssetPreviewRoute, "getAttachmentPreviewUrlForUser", "project asset preview route");
assertIncludes(projectAssetDownloadRoute, "getAttachmentDownloadUrlForUser", "project asset download route");
assertIncludes(archivePreviewRoute, "getArchivedFilePreviewUrlForUser", "archive preview route");
assertIncludes(archiveDownloadRoute, "getArchivedFileDownloadUrlForUser", "archive download route");

const projects = read("src/lib/projects.ts");
assertIncludesAll(
  projects,
  [
    "export function canViewProjectBudget",
    "hasProjectPermission(currentUser, projectContext, \"project.viewBudget\")",
    "hasProjectPermission(currentUser, projectContext, \"project.updateBudget\")",
    "budget: allowBudgetView",
    "currency: allowBudgetView ? project.currency : null",
    "const canUseBudgetFilters = options.canUseBudgetFilters === true;",
    "const budgetMin = canUseBudgetFilters",
    "if (canUseBudgetFilters)",
  ],
  "budget visibility and filter gates",
);

const projectsPage = read("src/app/(dashboard)/projects/page.tsx");
assertIncludesAll(
  projectsPage,
  [
    "const canUseBudgetFilters = isProjectAdmin(user);",
    "const budgetRequiredFilter = canUseBudgetFilters ? activeBudgetRequired : \"\";",
    "const budgetMinFilter = canUseBudgetFilters ? activeBudgetMin : \"\";",
    "const budgetMaxFilter = canUseBudgetFilters ? activeBudgetMax : \"\";",
  ],
  "projects page budget filter stripping",
);

const projectHistory = read("src/lib/project-history.ts");
assertIncludesAll(
  projectHistory,
  [
    "export async function assertStageChatWriteAccess",
    "input.stage.status === StageStatus.COMPLETED",
    "input.requireBriefAccepted !== false && !input.stage.actualStartedAt",
    "visibilityState?.chatVisibilityPaused",
    "isProjectStatusCompleted(input.stage.project.status)",
    "input.stage.project.archivedAt",
    "export async function createStageComment",
    "export async function createStageTextCommentFast",
    "export async function prepareStageCommentUploads",
    "export async function finalizePreparedStageCommentUploads",
    "export async function completePreparedChatAttachmentUpload",
    "const isFormalStageSubmission =",
    "input.assetType === AttachmentAssetType.STAGE_SUBMISSION ||",
    "input.assetType === AttachmentAssetType.REVISION_ORIGINAL",
    "isFormalStageSubmission &&",
    "Formal stage submissions must be PNG.",
    "Only a Main Executor can upload submissions for review.",
    "Only the requested invoice recipient can upload the invoice for this stage.",
    "Invoice is required before completing this stage.",
    "await ensureFinalCompletionWorkflowExistsTx(tx, input.projectId);",
    "await ensureFinalCompletionWorkflowExistsTx(tx, revision.projectId);",
  ],
  "stage chat, submission, invoice, and completion guards",
);
for (const functionName of [
  "createStageComment",
  "createStageTextCommentFast",
  "prepareStageCommentUploads",
  "finalizePreparedStageCommentUploads",
  "completePreparedChatAttachmentUpload",
]) {
  assert(
    new RegExp(`export async function ${functionName}[\\s\\S]*?assertStageChatWriteAccess`).test(
      projectHistory,
    ),
    `${functionName} must use assertStageChatWriteAccess.`,
  );
}
assert(
  !projectHistory.includes("FINAL_ARCHIVED") &&
    !projectHistory.includes("completedAt: archivedAt"),
  "Final stage completion must create the final workflow without auto-archiving the project.",
);

assertIncludesAll(
  projects,
  [
    "export async function removeProjectCollaborator",
    "prisma.projectCollaborator.delete",
    "export async function setProjectCollaboratorChatVisibility",
    "chatVisibilityPaused: true",
    "projectCollaboratorVisibilityPause.create",
  ],
  "removed and paused collaborator access",
);

const uploadValidation = read("src/lib/upload-validation.ts");
assertIncludesAll(
  uploadValidation,
  [
    "export const STAGE_SUBMISSION_ALLOWED_EXTENSIONS = [\"png\"] as const;",
    "export const STAGE_SUBMISSION_ALLOWED_MIME_TYPES = [\"image/png\"] as const;",
    "return STAGE_SUBMISSION_ALLOWED_EXTENSIONS;",
    "stageSubmissionAllowedExtensionSet",
    "stageSubmissionAllowedMimeTypeSet",
  ],
  "PNG-only upload validation",
);

const comparisonUtils = read("src/lib/comparison-utils.ts");
const comparison = read("src/lib/comparison.ts");
const chatWorkspace = read("src/components/projects/project-chat-workspace.tsx");
const compareWorkspace = read("src/components/projects/project-compare-workspace.tsx");
const captionDialog = read("src/components/projects/submission-caption-dialog.tsx");
const helpCenter = read("src/lib/help-center.ts");
assertIncludesAll(
  comparisonUtils,
  [
    pngOnlyHelpText,
    "isAllowedStageSubmissionFile",
    "isCaptionableStageSubmissionAttachment",
    'attachment.mimeType.toLowerCase() === "image/png"',
  ],
  "comparison candidate and captionable helpers",
);
assertIncludesAll(
  comparison,
  [
    "Only valid PNG stage submissions can be compared.",
    "Only valid PNG stage submissions can be captioned.",
    "attachments.some((attachment) =>",
    "!isComparableSubmissionAttachment",
    "throw new Error(getUnsupportedComparisonSubmissionMessage())",
    "getLatestFormalSubmissionAttachmentId",
    "This submission has been superseded. Existing captions are read-only.",
    "if (!canAddProjectCaptions(user, project))",
    "permissionMessage: \"You do not have permission to add captions.\"",
    "captionAttachmentId: context.attachment.id",
    "captionAttachmentId: captionTarget.attachment.id",
    "isCaption: true",
  ],
  "comparison and caption server guards",
);
assert(!comparison.includes("\"archive."), "Captions must not grant archive permissions.");
assert(!comparison.includes("\"file.download\""), "Captions must not grant download permission.");

assertIncludesAll(
  chatWorkspace,
  [
    "PNG_STAGE_SUBMISSION_ACCEPT",
    "accept={PNG_STAGE_SUBMISSION_ACCEPT}",
    "Formal stage submissions must be PNG.",
    "PNG only.",
    "assetType: \"REVISION_ORIGINAL\"",
  ],
  "formal submission client PNG-only UI",
);
assertIncludesAll(
  compareWorkspace,
  [
    "stageSubmissionCaptionHelpText",
    "No valid PNG stage submissions available for comparison.",
    "isCaptionableStageSubmissionAttachment",
    "canAddCaptions={canAddCaptions}",
  ],
  "compare UI PNG-only and caption wiring",
);
assertIncludesAll(
  captionDialog,
  [
    "stageSubmissionCaptionHelpText",
    "/api/project-assets/${attachment.id}/captions",
    "canAddCaption",
    "readOnlyReason",
  ],
  "caption dialog guard display",
);
assertIncludes(helpCenter, pngOnlyHelpText, "help center PNG-only copy");

const activePngOnlyFlowSources = [
  ["upload-validation", uploadValidation],
  ["comparison", comparison],
  ["comparison-utils", comparisonUtils],
  ["project-history", projectHistory],
  ["project-chat-workspace", chatWorkspace],
  ["project-compare-workspace", compareWorkspace],
  ["submission-caption-dialog", captionDialog],
  ["help-center", helpCenter],
];
for (const [label, source] of activePngOnlyFlowSources) {
  assert(
    !/VIDEO_STAGE_SUBMISSION|isVideoProjectCategory|project category is video|Video-category projects|PNG or video files only|configured video submission formats|video submission caption support|video\/(mp4|quicktime|webm|x-m4v)/i.test(
      source,
    ),
    `${label} must not keep video comparison/caption/submission exception wording.`,
  );
}

const projectCompletion = read("src/lib/project-completion.ts");
assertIncludesAll(
  projectCompletion,
  [
    "Approval is required and still pending.",
    "Copyright transfer is required and still pending.",
    "Final invoice is required and still pending.",
    "ProjectCompletionStepStatus.NOT_REQUIRED",
    "canUploadApprovalProofForProject",
    "canUploadCopyrightDocumentForProject",
    "canUploadInvoiceForProject",
    "Only the selected approval contact can upload authority approval proof.",
    "Only the selected copyright contact can upload copyright transfer documents.",
    "Only the selected final invoice recipient can upload the final invoice.",
    "requestProjectFinalInvoice",
    "ProjectCompletionDocumentType.AUTHORITY_APPROVAL_PROOF",
    "ProjectCompletionDocumentType.COPYRIGHT_TRANSFER",
    "ProjectCompletionDocumentType.INVOICE",
  ],
  "final completion checklist contact and archive gates",
);

console.log("Final GTI flow regression checks passed.");
