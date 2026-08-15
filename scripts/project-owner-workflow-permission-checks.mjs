import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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

for (const permissionKey of [
  'permissionKey === "stage.reviewSubmission"',
  'permissionKey === "stage.requestRevision"',
  'permissionKey === "stage.markSubmissionComplete"',
  'permissionKey === "stage.markStageComplete"',
  'permissionKey === "completion.setApprovalRequired"',
  'permissionKey === "completion.prepareApproval"',
  'permissionKey === "completion.setCopyrightRequired"',
  'permissionKey === "completion.prepareCopyrightTransfer"',
]) {
  assertIncludes(
    resolver,
    permissionKey,
    `Project owner workflow bypass ${permissionKey}`,
  );
}

assert(
  /if\s*\(\s*isProjectOwnerOrCoOwner\(user, project\)\s*&&\s*isProjectOwnerManagePermission\(permissionKey\)\s*\)\s*\{\s*return true;\s*\}/.test(
    resolver,
  ),
  "Project owner/co-owner workflow permissions must bypass the base role grant before hard-rule checks.",
);

for (const snippet of [
  "isGlobalProjectAdministrator",
  "isProjectCoOwner",
  "isProjectExecutor",
  'case "stage.acceptBrief"',
  'case "stage.submitWork"',
]) {
  assertIncludes(resolver, snippet, `V2 project access rule ${snippet}`);
}

const projectHistory = read("src/lib/project-history.ts");
for (const snippet of [
  '"stage.markSubmissionComplete"',
  '"Only a project owner, co-owner, or administrator can request an invoice."',
  "isProjectExecutorUser",
  "executor.userId === requestedFromId",
]) {
  assertIncludes(projectHistory, snippet, `V2 workflow guard ${snippet}`);
}

assert(
  !projectHistory.includes("ProjectExecutorRole") &&
    !projectHistory.includes("MAIN_EXECUTOR"),
  "Project history must not retain executor hierarchy checks.",
);

console.log("Project owner workflow permission checks passed.");
