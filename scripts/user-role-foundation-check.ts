import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { UserRole } from "@prisma/client";
import { allPermissionKeys, permissionRoleValues, editablePermissionRoleValues } from "../src/lib/permissions/definitions";
import { bindProjectReadIdentity } from "../src/lib/authorization/project-read-rules";
import { businessRoleValues } from "../src/lib/authorization/definitions";
import { getAuthenticatedDefaultRoute } from "../src/lib/permissions/fallback-route";
import { canCreateProjects, getSidebarVisibility, hasPermission, hasProjectPermission, getUserPermissionSet } from "../src/lib/permissions/resolver";
import { getUserRoleLabel, isKnownUserRole, isProtectedRootRole } from "../src/lib/user-role-compatibility";
function read(path: string) { return readFileSync(join(process.cwd(), path), "utf8"); }
assert.deepEqual(Object.values(UserRole), ["SUPER_ADMIN", "ADMIN", "USER"]);
assert.deepEqual([...permissionRoleValues], Object.values(UserRole));
assert.deepEqual([...editablePermissionRoleValues], ["ADMIN", "USER"]);
assert.equal(isKnownUserRole("NOT_A_ROLE"), false);
assert.equal(isProtectedRootRole("SUPER_ADMIN"), true);
assert.equal(getUserRoleLabel("USER"), "User");
for (const role of Object.values(UserRole)) {
  const forged = { id: "forged", role, projectCreationAccessGranted: true,
    permissionProfileSnapshot: { effectivePermissions: new Set(allPermissionKeys), rolePermissions: new Set(allPermissionKeys), archiveAccessGranted: true, archiveAccessLevel: "FULL" as const } };
  assert.equal(getUserPermissionSet(forged).size, 0, "Legacy ALL/FULL profiles cannot authenticate an identity");
  assert.equal(Object.values(getSidebarVisibility(forged)).some(Boolean), false);
  assert.equal(getAuthenticatedDefaultRoute(forged), "/no-access");
  assert.equal(canCreateProjects(forged), false);
  assert.equal(hasProjectPermission(forged, { ownerId: forged.id }, "project.update"), false);
}
for (const businessRole of [...businessRoleValues, null]) {
 for (const legacyRole of Object.values(UserRole)) {
  const user = bindProjectReadIdentity({ id: "real", role: legacyRole }, { userId: "real", identity: { email: "real@example.invalid", name: "Real" }, businessRole,
    technicalPrivileges: businessRole ? [] : ["TECHNICAL_ADMIN"], accountStatus: "ACTIVE", authorizationVersion: 1,
    session: { id: "session", expiresAt: new Date(Date.now() + 60000).toISOString() } });
  const nav = getSidebarVisibility(user), manager = ["DIRECTOR", "SENIOR_PROJECT_MANAGER", "JUNIOR_PROJECT_MANAGER"].includes(businessRole ?? "");
  assert.equal(nav.dashboard, manager); assert.equal(nav.projects, manager); assert.equal(nav.projectApprovals, manager);
  assert.equal(nav.tasks, !!businessRole); assert.equal(nav.projectTracker, false); assert.equal(nav.collaboration, false);
  assert.equal(nav.library, !!businessRole); assert.equal(nav.archives, !!businessRole && businessRole !== "JUNIOR_PROJECT_MANAGER");
  assert.equal(nav.archiveCategories, ["DIRECTOR", "SENIOR_PROJECT_MANAGER", "DIGITAL_LEAD"].includes(businessRole ?? ""));
  assert.equal(nav.users, businessRole === "DIRECTOR"); assert.equal(nav.clients, businessRole === "DIRECTOR");
  assert.equal(nav.notifications, !!businessRole); assert.equal(nav.settings, true); assert.equal(nav.help, true);
  assert.equal(canCreateProjects(user), manager); assert.equal(hasPermission(user, "project.create"), false, "Creation needs governance, never a compatibility flag");
  for (const key of ["users.update", "users.managePermissions", "settings.managePermissions", "collaboration.createUser", "calendar.assignParticipants"] as const) assert.equal(hasPermission(user, key), false);
  assert.equal(getAuthenticatedDefaultRoute(user), manager ? "/" : businessRole ? "/tasks" : "/settings");
  assert.equal(getUserPermissionSet({ ...user }).size, 0, "Serialization cannot transfer authority");
 }
}
const schema = read("prisma/schema.prisma");
assert.match(schema, /enum UserRole \{\s+SUPER_ADMIN\s+ADMIN\s+USER\s+\}/);
assert.match(schema, /role\s+UserRole\s+@default\(USER\)/);
assert.doesNotMatch(schema, /enum CollaboratorType \{/);
assert.doesNotMatch(schema, /enum ProjectCollaboratorParticipantType \{/);
assert.doesNotMatch(schema, /collaboratorType\s+CollaboratorType/);
assert.doesNotMatch(schema, /participantType\s+ProjectCollaboratorParticipantType/);
assert.doesNotMatch(schema, /model CollaboratorTypePermission \{/);

const migration = read(
  "prisma/migrations/20260816193000_remove_legacy_collaborator_architecture/migration.sql",
);
for (const requiredFragment of [
  "Migration blocked: User rows still use role COLLABORATOR",
  "Migration blocked: Project rows exist",
  "Migration blocked: ProjectCollaborator rows exist",
  'DROP TABLE "CollaboratorTypePermission"',
  'DROP COLUMN "collaboratorType"',
  'DROP COLUMN "participantType"',
  'CREATE TYPE "UserRole" AS ENUM (\'SUPER_ADMIN\', \'ADMIN\', \'USER\')',
]) {
  assert.equal(migration.includes(requiredFragment), true, requiredFragment);
}

const profiles = read("src/lib/permissions/profiles.ts");
assert.doesNotMatch(profiles, /CollaboratorTypePermission/);
assert.doesNotMatch(profiles, /profileType:\s*"collaboratorType"/);
assert.doesNotMatch(profiles, /prisma\.permissionDefinition\.(?:create|upsert)/);

const usersWorkspace = read("src/components/users/users-workspace.tsx");
assert.match(usersWorkspace, /editablePermissionRoleValues\.map/);
assert.doesNotMatch(usersWorkspace, /Collaborator Type/);


console.log("PASS: V2 navigation/authority matrix across all legacy labels; forged profiles denied; historical schema guards preserved.");
