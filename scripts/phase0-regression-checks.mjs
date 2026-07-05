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
  "archive download guard",
);
assertIncludes(
  archives,
  "assertCanUseArchives(user, \"You do not have permission to preview archive files.\")",
  "archive preview guard",
);

const projects = read("src/lib/projects.ts");
assertIncludes(projects, "canUseBudgetFilters", "budget filter gate");
assertIncludes(
  projects,
  "const canUseBudgetFilters = isProjectAdmin(currentUser);",
  "budget filters restricted to admin list queries",
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

console.log("Phase 0 regression checks passed.");
