import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { UserRole } from "@prisma/client";

import {
  collaboratorTypeValues,
  defaultCollaboratorTypePermissions,
  defaultRolePermissions,
  editablePermissionRoleValues,
  permissionRoleValues,
  type PermissionKey,
} from "../src/lib/permissions/definitions";
import { resolveEffectivePermissionSet } from "../src/lib/permissions/effective";
import { hasPermission } from "../src/lib/permissions/resolver";
import {
  getUserRoleLabel,
  isAdminRole,
  isKnownUserRole,
  isLegacyCollaboratorRole,
  isStandardUserRole,
  isSuperAdminRole,
  isUserRole,
} from "../src/lib/user-role-compatibility";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

const expectedRoles = ["SUPER_ADMIN", "ADMIN", "COLLABORATOR", "USER"];
const expectedEditableRoles = ["SUPER_ADMIN", "ADMIN", "COLLABORATOR"];
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

for (const role of expectedRoles) {
  assert.equal(isKnownUserRole(role), true);
}
assert.equal(isKnownUserRole("NOT_A_ROLE"), false);
assert.equal(isSuperAdminRole(UserRole.SUPER_ADMIN), true);
assert.equal(isAdminRole(UserRole.ADMIN), true);
assert.equal(isLegacyCollaboratorRole(UserRole.COLLABORATOR), true);
assert.equal(isUserRole(UserRole.USER), true);
assert.equal(isStandardUserRole(UserRole.COLLABORATOR), true);
assert.equal(isStandardUserRole(UserRole.USER), true);
assert.equal(isStandardUserRole(UserRole.ADMIN), false);
assert.equal(getUserRoleLabel(UserRole.USER), "User");

assert.deepEqual(defaultRolePermissions.USER, expectedUserPermissions);
assert.deepEqual(
  defaultRolePermissions.USER,
  defaultRolePermissions.COLLABORATOR,
  "USER and the legacy internal collaborator role must share Round 1 defaults.",
);
assert.deepEqual(
  defaultRolePermissions.USER,
  defaultCollaboratorTypePermissions.GTI_INTERNAL_CLIENT,
  "USER defaults must match the current internal collaborator effective profile.",
);
assert.equal(defaultRolePermissions.USER.includes("project.create"), false);

const userEffectivePermissions = resolveEffectivePermissionSet({
  user: {
    role: UserRole.USER,
    collaboratorType: "CLIENT_OF_GTI",
  },
  rolePermissions: new Set(defaultRolePermissions.USER),
  collaboratorTypePermissions: new Set(),
});
assert.deepEqual(
  [...userEffectivePermissions],
  expectedUserPermissions,
  "USER permissions must not be intersected with Collaborator Type permissions.",
);

const collaboratorEffectivePermissions = resolveEffectivePermissionSet({
  user: {
    role: UserRole.COLLABORATOR,
    collaboratorType: "GTI_INTERNAL_CLIENT",
  },
  rolePermissions: new Set(defaultRolePermissions.COLLABORATOR),
  collaboratorTypePermissions: new Set(
    defaultCollaboratorTypePermissions.GTI_INTERNAL_CLIENT,
  ),
});
assert.deepEqual([...collaboratorEffectivePermissions], expectedUserPermissions);

const restrictedCollaboratorPermissions = resolveEffectivePermissionSet({
  user: {
    role: UserRole.COLLABORATOR,
    collaboratorType: "EXTERNAL_FREELANCER",
  },
  rolePermissions: new Set(defaultRolePermissions.COLLABORATOR),
  collaboratorTypePermissions: new Set(),
});
assert.equal(
  restrictedCollaboratorPermissions.size,
  0,
  "Existing COLLABORATOR type intersection must remain active.",
);

for (const role of [UserRole.ADMIN, UserRole.SUPER_ADMIN]) {
  const effective = resolveEffectivePermissionSet({
    user: { role, collaboratorType: "EXTERNAL_FREELANCER" },
    rolePermissions: new Set(defaultRolePermissions[role]),
    collaboratorTypePermissions: new Set(),
  });
  assert.deepEqual(
    [...effective],
    [...defaultRolePermissions[role]],
    `${role} permissions must remain independent of Collaborator Type.`,
  );
}

assert.equal(
  hasPermission(
    {
      id: "round-1-user",
      role: UserRole.USER,
      collaboratorType: "CLIENT_OF_GTI",
    },
    "dashboard.view",
  ),
  true,
);
assert.equal(
  hasPermission(
    {
      id: "round-1-user",
      role: UserRole.USER,
      collaboratorType: "GTI_INTERNAL_CLIENT",
    },
    "project.create",
  ),
  false,
);

const schema = read("prisma/schema.prisma");
assert.match(
  schema,
  /enum UserRole \{\s+SUPER_ADMIN\s+ADMIN\s+COLLABORATOR\s+USER\s+\}/,
);
assert.match(schema, /role\s+UserRole\s+@default\(COLLABORATOR\)/);
assert.match(schema, /enum CollaboratorType \{/);
assert.match(schema, /enum ProjectCollaboratorParticipantType \{/);
for (const collaboratorType of collaboratorTypeValues) {
  assert.equal(schema.includes(collaboratorType), true);
}

const migration = read(
  "prisma/migrations/20260815190000_add_user_role_foundation/migration.sql",
).trim();
assert.equal(migration, `ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'USER';`);

const permissionProfiles = read("src/lib/permissions/profiles.ts");
assert.match(
  permissionProfiles,
  /editablePermissionRoleValues\.flatMap/,
  "Permission sync must not create Round 1 USER RolePermission rows.",
);
assert.match(
  permissionProfiles,
  /isUserRole\(user\.role\)[\s\S]*?Promise\.resolve\(null\)[\s\S]*?getCachedCollaboratorTypeProfile/,
  "USER snapshots must bypass Collaborator Type profile loading.",
);

const usersWorkspace = read("src/components/users/users-workspace.tsx");
assert.match(usersWorkspace, /editablePermissionRoleValues\.map/);
assert.doesNotMatch(usersWorkspace, /permissionRoleValues\.map/);
const permissionPreview = read("src/lib/permissions/preview.ts");
assert.match(permissionPreview, /editablePermissionRoleValues\.map/);

const userActions = read("src/app/(dashboard)/users/actions.ts");
assert.match(userActions, /isEditableUserRole\(input\.role\)/);
assert.match(userActions, /Choose a currently editable role profile\./);

const projectCreation = read("src/lib/project-creation.ts");
assert.match(projectCreation, /UserRole\.COLLABORATOR/);
assert.doesNotMatch(projectCreation, /UserRole\.USER/);
const collaboration = read("src/lib/collaboration.ts");
assert.match(collaboration, /role: UserRole\.COLLABORATOR/);
assert.doesNotMatch(collaboration, /UserRole\.USER/);
const createUserScript = read("scripts/create-user.mjs");
assert.match(createUserScript, /UserRole\.COLLABORATOR/);
assert.doesNotMatch(createUserScript, /UserRole\.USER/);

const auth = read("src/lib/auth.ts");
assert.match(auth, /getPermissionProfileSnapshotForUser/);

console.log("Round 1 USER role foundation checks passed (31 transitional permissions).");
