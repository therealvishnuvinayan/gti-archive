import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (relativePath) => readFileSync(join(rootDir, relativePath), "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const assertIncludes = (source, value, label) =>
  assert(source.includes(value), `${label} is missing.`);

const definitions = read("src/lib/permissions/definitions.ts");
const profiles = read("src/lib/permissions/profiles.ts");
const effective = read("src/lib/permissions/effective.ts");
const resolver = read("src/lib/permissions/resolver.ts");
const projectCreation = read("src/lib/project-creation.ts");
const projectCandidates = read("src/lib/project-owner-candidates.ts");
const projectGrants = read("src/lib/project-collaborator-permissions.ts");
const usersWorkspace = read("src/components/users/users-workspace.tsx");

assertIncludes(definitions, 'USER: defaultUserWorkflowPermissions', "USER defaults");
const userDefaults = definitions.slice(
  definitions.indexOf("const defaultUserWorkflowPermissions"),
  definitions.indexOf("export const defaultRolePermissions"),
);
assert(!userDefaults.includes('"project.create"'), "USER defaults must not grant project.create.");
assert(!profiles.includes("CollaboratorTypePermission"), "Type profiles must be removed.");
assert(!effective.includes("collaboratorTypePermissions"), "Effective permissions must be role-only.");
assert(!resolver.includes("isClientOfGtiUser"), "Client-type hard denials must be removed.");
assert(!usersWorkspace.includes("Collaborator Type"), "The permissions UI must be role-only.");

for (const snippet of [
  "const ownerId = creator.id",
  "user.role !== UserRole.ADMIN",
  "userById.get(userId)?.role !== UserRole.USER",
  "normalizeProjectCollaboratorPermissions(null, {",
]) {
  assertIncludes(projectCreation, snippet, `Project creation invariant ${snippet}`);
}
assertIncludes(projectCandidates, "role: UserRole.ADMIN", "ADMIN co-owner candidate query");

for (const snippet of [
  "canInteract: true",
  "canAddCaptions: false",
  "canDownloadFiles: false",
  "canViewBudget: false",
  "canViewVendorInfo: false",
  "canAccessProjectArchives: false",
]) {
  assertIncludes(projectGrants, snippet, `Project participant default ${snippet}`);
}

for (const guardedPath of [
  "src/app/(dashboard)/projects/new/page.tsx",
  "src/app/(dashboard)/projects/new/v2-actions.ts",
]) {
  assertIncludes(
    read(guardedPath),
    'hasPermission(user, "project.create")',
    `${guardedPath} project.create guard`,
  );
}

console.log("Project creation final-role checks passed.");
