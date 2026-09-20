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
const projectAction = read("src/app/(dashboard)/projects/new/v2-actions.ts");
const projectPage = read("src/app/(dashboard)/projects/new/page.tsx");
const projectCandidates = read("src/lib/project-owner-candidates.ts");
const projectGrants = read("src/lib/project-collaborator-permissions.ts");
const usersWorkspace = read("src/components/users/users-workspace.tsx");
const flexibleProjectsBrowser = read(
  "src/components/projects/flexible-projects-browser.tsx",
);
const flexibleProjectsRouteWorkspace = read(
  "src/components/projects/flexible-projects-route-workspace.tsx",
);
const userPermissions = read("src/lib/user-permissions.ts");
const schema = read("prisma/schema.prisma");
const defaultUserProjectCreationMigration = read(
  "prisma/migrations/20260920160000_disable_existing_user_project_creation_access/migration.sql",
);

assertIncludes(definitions, 'USER: defaultUserWorkflowPermissions', "USER defaults");
const userDefaults = definitions.slice(
  definitions.indexOf("const defaultUserWorkflowPermissions"),
  definitions.indexOf("export const defaultRolePermissions"),
);
assert(!userDefaults.includes('"project.create"'), "USER defaults must not grant project.create.");
assert(!profiles.includes("CollaboratorTypePermission"), "Type profiles must be removed.");
assertIncludes(
  profiles,
  'nextState["project.create"] = false',
  "USER role profile project creation denial",
);
assert(!effective.includes("collaboratorTypePermissions"), "Effective permissions must be role-only.");
assert(!resolver.includes("isClientOfGtiUser"), "Client-type hard denials must be removed.");
assert(!usersWorkspace.includes("Collaborator Type"), "The permissions UI must be role-only.");

for (const snippet of [
  "const ownerId = creator.id",
  "isBusinessAdministratorRole(owner.role)",
  "user.role !== UserRole.ADMIN",
  "userById.get(userId)?.role !== UserRole.USER",
  "normalizeProjectCollaboratorPermissions(null, {",
]) {
  assertIncludes(projectCreation, snippet, `Project creation invariant ${snippet}`);
}

assertIncludes(projectAction, "canCreateProjects(user)", "project creation action access gate");
assertIncludes(projectPage, "canCreateProjects(user)", "project creation route access gate");
assertIncludes(projectCandidates, "role: UserRole.ADMIN", "ADMIN co-owner candidate query");
assertIncludes(
  schema,
  "projectCreationAccessGranted",
  "persisted per-user project creation access",
);
assert(
  /projectCreationAccessGranted\s+Boolean\s+@default\(false\)/.test(schema),
  "USER project creation access must default to disabled.",
);
assertIncludes(
  defaultUserProjectCreationMigration,
  'SET "projectCreationAccessGranted" = false',
  "existing USER project creation access reset",
);
assertIncludes(
  resolver,
  "user.projectCreationAccessGranted === true",
  "selected USER project creation resolver",
);
assertIncludes(
  projectCreation,
  "!owner.projectCreationAccessGranted",
  "project creation service entitlement gate",
);
assertIncludes(
  userPermissions,
  "projectCreationAccessGranted:",
  "managed-user project creation persistence",
);
assertIncludes(
  usersWorkspace,
  "Assigned per user",
  "managed-user Create Project switch",
);
assertIncludes(
  usersWorkspace,
  "min-h-0 flex-1 overflow-y-auto overscroll-contain",
  "Edit User modal body-only scrolling",
);
assertIncludes(
  usersWorkspace,
  'projectCreationEnabled ? "left-6" : "left-1"',
  "Create Project switch thumb positioning",
);
assertIncludes(
  flexibleProjectsRouteWorkspace,
  "canCreateProject={canCreateProject}",
  "Flexible Project creation permission propagation",
);
assertIncludes(
  flexibleProjectsBrowser,
  "{canCreateProject ? (",
  "Flexible Project creation visibility guard",
);

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
    "canCreateProjects(user)",
    `${guardedPath} project creation role and permission guard`,
  );
}

console.log("Project creation final-role checks passed.");
