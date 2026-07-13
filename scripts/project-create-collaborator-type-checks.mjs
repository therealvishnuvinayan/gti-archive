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

function extractArray(source, marker) {
  const start = source.indexOf(marker);

  assert(start >= 0, `${marker} block is missing.`);

  const arrayStart = source.indexOf("[", start);
  const arrayEnd = source.indexOf("]", arrayStart);

  assert(arrayStart >= 0 && arrayEnd >= 0, `${marker} array could not be parsed.`);

  return source.slice(arrayStart, arrayEnd + 1);
}

const definitions = read("src/lib/permissions/definitions.ts");
const collaboratorRoleDefaults = extractArray(definitions, "COLLABORATOR:");
const collaboratorTypeDefaults = extractArray(
  definitions,
  "const defaultCollaboratorWorkflowPermissions",
);

assert(
  !collaboratorRoleDefaults.includes('"project.create"'),
  "COLLABORATOR role defaults must not include project.create.",
);
assert(
  !collaboratorTypeDefaults.includes('"project.create"'),
  "Collaborator type defaults must not include project.create.",
);
for (const collaboratorType of [
  "GTI_SISTER_COMPANY_INTERNAL_CLIENT",
  "EXTERNAL_FREELANCER",
  "EXTERNAL_AGENCY",
  "EXTERNAL_VENDOR",
  "CLIENT_OF_GTI",
]) {
  assertIncludes(
    definitions,
    `${collaboratorType}: defaultRestrictedCollaboratorPermissions`,
    `${collaboratorType} reset defaults must be restricted.`,
  );
}

const profiles = read("src/lib/permissions/profiles.ts");
for (const snippet of [
  "function canCollaboratorTypeCreateProjects",
  'return collaboratorType === "GTI_INTERNAL_CLIENT";',
  "function getCollaboratorTypesForPropagatedPermission",
  'if (permissionKey === "project.create")',
  'return ["GTI_INTERNAL_CLIENT"] as const;',
  "defaultCollaboratorTypePermissions[collaboratorType].includes(permissionKey)",
  "function applyPermissionProfileHardRules",
  'state["project.create"] = false;',
  'permissionKey === "project.create"',
  "canCollaboratorTypeCreateProjects(user.collaboratorType)",
  "continue;",
]) {
  assertIncludes(profiles, snippet, `Project-create collaborator type gate ${snippet}`);
}

const resolver = read("src/lib/permissions/resolver.ts");
for (const snippet of [
  'permissionKey === "project.create"',
  'user.collaboratorType !== "GTI_INTERNAL_CLIENT"',
  "return false;",
]) {
  assertIncludes(resolver, snippet, `Project-create hasPermission hard deny ${snippet}`);
}

const usersWorkspace = read("src/components/users/users-workspace.tsx");
for (const snippet of [
  "function isPermissionUnavailableForProfile",
  'input.permissionKey === "project.create"',
  'input.profileKey !== "GTI_INTERNAL_CLIENT"',
  "isUnavailableForProfile ? false : draftState[item.key]",
  "Internal clients only",
]) {
  assertIncludes(usersWorkspace, snippet, `Project-create permission UI guard ${snippet}`);
}

for (const guardedPath of [
  "src/app/(dashboard)/projects/new/page.tsx",
  "src/app/(dashboard)/projects/new/actions.ts",
  "src/app/api/flux-ai/create-project/route.ts",
  "src/app/api/flux-ai/validate-draft/route.ts",
]) {
  const source = read(guardedPath);

  assertIncludes(
    source,
    'hasPermission(user, "project.create")',
    `${guardedPath} project.create guard`,
  );
}

assertIncludes(
  read("src/lib/flux-ai/tools.ts"),
  'hasPermission(input.user, "project.create")',
  "src/lib/flux-ai/tools.ts project.create guard",
);

console.log("Project create collaborator type checks passed.");
