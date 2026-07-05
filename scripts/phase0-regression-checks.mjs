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
assertIncludes(resolver, "isClientOfGtiUser", "CLIENT_OF_GTI helper");
assertIncludes(resolver, "archives: canUseArchives(user)", "archive sidebar hard block");
assertIncludes(
  resolver,
  "isArchiveSensitivePermission(permissionKey) && isClientOfGtiUser(user)",
  "project archive-sensitive client deny",
);
assertIncludes(
  resolver,
  "case \"project.viewBudget\"",
  "budget project permission case",
);
assertIncludes(
  resolver,
  "return isProjectAdmin(user) || isProjectOwner(user, project);",
  "owner/admin project management rule",
);

const definitions = read("src/lib/permissions/definitions.ts");
const collaboratorDefaults = definitions.match(
  /defaultCollaboratorTypePermissions[\s\S]*?criticalSuperAdminPermissionKeys/,
)?.[0] ?? "";
assert(
  !/allPermissionKeys/.test(collaboratorDefaults),
  "Collaborator type defaults must not grant all permissions.",
);
assert(
  !/"archive\.(view|download|uploadFile)"/.test(collaboratorDefaults),
  "Collaborator type defaults must not include archive permissions.",
);

const archives = read("src/lib/archives.ts");
assertIncludes(archives, "assertCanUseArchives(user);", "archive list guard");
assertIncludes(
  archives,
  "assertCanUseArchives(user, \"You do not have permission to download archive files.\")",
  "manual archive download guard",
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

const projects = read("src/lib/projects.ts");
assertIncludes(projects, "canUseBudgetFilters", "budget filter gate");
assertIncludes(
  projects,
  "const canUseBudgetFilters = isProjectAdmin(currentUser);",
  "budget filters restricted to admin list queries",
);
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

const comparison = read("src/lib/comparison.ts");
assertIncludes(
  comparison,
  "assertStageChatWriteAccess(user",
  "comparison comment chat guard",
);
assertIncludes(
  comparison,
  "isAllowedStageSubmissionFile",
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
  "isAllowedStageSubmissionFile",
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
  "export const STAGE_SUBMISSION_ALLOWED_EXTENSIONS = [\"png\"] as const;",
  "PNG-only non-video submission extension rule",
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

const projectCollaboratorPermissions = read("src/lib/project-collaborator-permissions.ts");
assertIncludes(
  projectCollaboratorPermissions,
  "canAccessProjectArchives: false",
  "conservative archive default",
);
assertIncludes(
  projectCollaboratorPermissions,
  "permissions.canAccessProjectArchives = false",
  "CLIENT_OF_GTI archive hard override",
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

const newProjectActions = read("src/app/(dashboard)/projects/new/actions.ts");
for (const field of [
  "collaboratorCanInteract",
  "collaboratorCanAddCaptions",
  "collaboratorCanDownloadFiles",
  "collaboratorCanViewBudget",
  "collaboratorCanViewVendorInfo",
  "collaboratorCanAccessProjectArchives",
]) {
  assertIncludes(newProjectActions, field, `project form action field ${field}`);
}
assertIncludes(
  newProjectActions,
  "normalizeProjectCollaboratorPermissions(",
  "project create/edit permission persistence",
);

const createWorkspace = read("src/components/projects/create-project-workspace.tsx");
assertIncludes(
  createWorkspace,
  "projectCollaboratorPermissionLabels",
  "project collaborator permission labels",
);
assertIncludes(
  createWorkspace,
  "isClientOfGtiParticipantType",
  "CLIENT_OF_GTI archive checkbox disable",
);
assertIncludes(
  createWorkspace,
  "buildCollaboratorSavePayload",
  "collaborator quick-save permission payload",
);

const aiAccess = read("src/lib/ai/access.ts");
assertIncludes(
  aiAccess,
  "projectCollaboratorPermissionSelect",
  "AI chat project grant select",
);

const helpCenter = read("src/lib/help-center.ts");
assertIncludes(
  helpCenter,
  "Formal stage submissions must be PNG unless the project category is video. Only valid PNG artwork submissions can be compared. Video-category projects may support the configured video submission formats.",
  "PNG-only submission help text",
);

console.log("Phase 0/1 regression checks passed.");
