import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { UserRole } from "@prisma/client";

import {
  defaultRolePermissions,
  editablePermissionRoleValues,
  permissionRoleValues,
  type PermissionKey,
} from "../src/lib/permissions/definitions";
import { resolveEffectivePermissionSet } from "../src/lib/permissions/effective";
import { hasPermission } from "../src/lib/permissions/resolver";
import {
  getUserRoleLabel,
  isBusinessAdministratorRole,
  isKnownUserRole,
  isProtectedRootRole,
  isStandardUserRole,
} from "../src/lib/user-role-compatibility";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

const expectedRoles = ["SUPER_ADMIN", "ADMIN", "USER"];
const expectedEditableRoles = ["ADMIN", "USER"];
const expectedUserPermissions: PermissionKey[] = [
  "dashboard.view",
  "dashboard.viewProjectCounts",
  "dashboard.viewRecentProjects",
  "project.list",
  "project.view",
  "project.viewParticipants",
  "stage.view",
  "stage.acceptBrief",
  "stage.submitWork",
  "chat.view",
  "chat.createComment",
  "chat.uploadAttachment",
  "chat.mentionUser",
  "file.view",
  "file.download",
  "file.favorite",
  "file.uploadAttachment",
  "file.uploadSubmission",
  "library.view",
  "library.filter",
  "completion.viewChecklist",
  "completion.uploadInvoice",
  "calendar.view",
  "notification.view",
  "notification.markRead",
  "settings.viewOwnProfile",
  "settings.updateOwnProfile",
  "settings.changeOwnPassword",
  "compare.view",
  "compare.createComment",
  "help.view",
];

assert.deepEqual(Object.values(UserRole), expectedRoles);
assert.deepEqual([...permissionRoleValues], expectedRoles);
assert.deepEqual([...editablePermissionRoleValues], expectedEditableRoles);
for (const role of expectedRoles) assert.equal(isKnownUserRole(role), true);
assert.equal(isKnownUserRole("NOT_A_ROLE"), false);
assert.equal(isBusinessAdministratorRole(UserRole.SUPER_ADMIN), true);
assert.equal(isBusinessAdministratorRole(UserRole.ADMIN), true);
assert.equal(isBusinessAdministratorRole(UserRole.USER), false);
assert.equal(isProtectedRootRole(UserRole.SUPER_ADMIN), true);
assert.equal(isStandardUserRole(UserRole.USER), true);
assert.equal(isStandardUserRole(UserRole.ADMIN), false);
assert.equal(getUserRoleLabel(UserRole.USER), "User");

assert.deepEqual(defaultRolePermissions.USER, expectedUserPermissions);
assert.equal(defaultRolePermissions.USER.includes("project.create"), false);
assert.deepEqual(
  [...resolveEffectivePermissionSet({
    user: { role: UserRole.USER },
    rolePermissions: new Set(defaultRolePermissions.USER),
  })],
  expectedUserPermissions,
);
assert.equal(
  hasPermission({ id: "user", role: UserRole.USER }, "dashboard.view"),
  true,
);
assert.equal(
  hasPermission({ id: "user", role: UserRole.USER }, "project.create"),
  false,
);

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
assert.match(profiles, /editablePermissionRoleValues\.flatMap/);

const usersWorkspace = read("src/components/users/users-workspace.tsx");
assert.match(usersWorkspace, /editablePermissionRoleValues\.map/);
assert.doesNotMatch(usersWorkspace, /Collaborator Type/);

const projectCreation = read("src/lib/project-creation.ts");
assert.match(projectCreation, /const ownerId = creator\.id/);
assert.match(projectCreation, /user\.role !== UserRole\.ADMIN/);
assert.match(projectCreation, /UserRole\.USER/);
assert.doesNotMatch(projectCreation, /UserRole\.COLLABORATOR/);

const collaboration = read("src/lib/collaboration.ts");
assert.match(collaboration, /role: UserRole\.USER/);
assert.doesNotMatch(collaboration, /collaboratorType/);

console.log("Final ADMIN/USER role architecture checks passed.");
