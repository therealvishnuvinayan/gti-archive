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
  /if \(isProjectOwner\(user, project\) && isProjectOwnerManagePermission\(permissionKey\)\) \{\s*return true;\s*\}/.test(
    resolver,
  ),
  "Project owner workflow permissions must bypass the base role grant before hard-rule checks.",
);

const projectHistory = read("src/lib/project-history.ts");
for (const snippet of [
  '"stage.markSubmissionComplete"',
  '"Only the project owner can request an invoice."',
  "if (stage.project.createdById !== user.id)",
  "throw new Error(\"Only the project owner can request an invoice.\");",
  "if (requestedFromId === stage.project.createdById)",
]) {
  assertIncludes(projectHistory, snippet, `Invoice request owner guard ${snippet}`);
}

console.log("Project owner workflow permission checks passed.");
