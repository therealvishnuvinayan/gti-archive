import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  ProjectWorkflowStageKey,
  ProjectWorkflowStageStatus,
  UserRole,
} from "@prisma/client";

import {
  allPermissionKeys,
  defaultCollaboratorTypePermissions,
  defaultRolePermissions,
  editablePermissionRoleValues,
  type PermissionKey,
} from "../src/lib/permissions/definitions";
import { resolveEffectivePermissionSet } from "../src/lib/permissions/effective";
import {
  canUseArchives,
  getAccessibleProjectsWhere,
  getArchiveAccessLevel,
  getSidebarVisibility,
  hasProjectPermission,
  isGlobalProjectAdministrator,
} from "../src/lib/permissions/resolver";
import {
  canCompleteProjectConceptStage,
  canManageProjectConcept,
  canReviewProjectConcept,
  canViewProjectConcept,
} from "../src/lib/project-concept-access";
import { getProjectResearchAccess } from "../src/lib/project-research-access";
import { canManageStageSix } from "../src/lib/stage-six";
import { canManageStageSeven } from "../src/lib/stage-seven";
import { getProjectWorkflowStageAccess } from "../src/lib/workflow-stage-access";
import {
  isBusinessAdministratorRole,
  isProtectedRootRole,
  isStandardUserRole,
} from "../src/lib/user-role-compatibility";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function assertIncludes(source: string, value: string, message: string) {
  assert.equal(source.includes(value), true, message);
}

const admin = {
  id: "unrelated-admin",
  role: UserRole.ADMIN,
  collaboratorType: "CLIENT_OF_GTI" as const,
};
const superAdmin = {
  id: "root",
  role: UserRole.SUPER_ADMIN,
  collaboratorType: "CLIENT_OF_GTI" as const,
};
const collaborator = {
  id: "legacy-collaborator",
  role: UserRole.COLLABORATOR,
  collaboratorType: "GTI_INTERNAL_CLIENT" as const,
};
const futureUser = {
  id: "future-user",
  role: UserRole.USER,
  collaboratorType: "CLIENT_OF_GTI" as const,
};
const unrelatedProject = {
  ownerId: "owner",
  coOwners: [] as Array<{ userId: string }>,
  executors: [] as Array<{ userId: string }>,
  collaborators: [] as Array<{ userId: string }>,
};

assert.equal(isBusinessAdministratorRole(UserRole.ADMIN), true);
assert.equal(isBusinessAdministratorRole(UserRole.SUPER_ADMIN), true);
assert.equal(isGlobalProjectAdministrator(admin), true);
assert.equal(isGlobalProjectAdministrator(superAdmin), true);
assert.equal(isGlobalProjectAdministrator(collaborator), false);
assert.equal(isProtectedRootRole(UserRole.SUPER_ADMIN), true);
assert.equal(isProtectedRootRole(UserRole.ADMIN), false);
assert.equal(isStandardUserRole(UserRole.COLLABORATOR), true);
assert.equal(isStandardUserRole(UserRole.USER), true);

assert.deepEqual(defaultRolePermissions.ADMIN, allPermissionKeys);
assert.deepEqual(defaultRolePermissions.SUPER_ADMIN, allPermissionKeys);
assert.equal(defaultRolePermissions.ADMIN.length, allPermissionKeys.length);
assert.equal(defaultRolePermissions.COLLABORATOR.length, 31);
assert.equal(defaultRolePermissions.USER.length, 31);
assert.deepEqual(
  defaultRolePermissions.USER,
  defaultRolePermissions.COLLABORATOR,
);
assert.deepEqual(editablePermissionRoleValues, ["ADMIN", "COLLABORATOR"]);

const adminEffectivePermissions = resolveEffectivePermissionSet({
  user: admin,
  rolePermissions: new Set(defaultRolePermissions.ADMIN),
  collaboratorTypePermissions: new Set(),
});
assert.deepEqual([...adminEffectivePermissions], [...allPermissionKeys]);

const superAdminEffectivePermissions = resolveEffectivePermissionSet({
  user: superAdmin,
  rolePermissions: new Set(defaultRolePermissions.SUPER_ADMIN),
  collaboratorTypePermissions: new Set(),
});
assert.deepEqual([...superAdminEffectivePermissions], [...allPermissionKeys]);

const collaboratorEffectivePermissions = resolveEffectivePermissionSet({
  user: collaborator,
  rolePermissions: new Set(defaultRolePermissions.COLLABORATOR),
  collaboratorTypePermissions: new Set(
    defaultCollaboratorTypePermissions.GTI_INTERNAL_CLIENT,
  ),
});
assert.deepEqual(
  [...collaboratorEffectivePermissions],
  [...defaultRolePermissions.COLLABORATOR],
);

const userEffectivePermissions = resolveEffectivePermissionSet({
  user: futureUser,
  rolePermissions: new Set(defaultRolePermissions.USER),
  collaboratorTypePermissions: new Set(),
});
assert.deepEqual([...userEffectivePermissions], [...defaultRolePermissions.USER]);

assert.deepEqual(getAccessibleProjectsWhere(admin), {});
assert.deepEqual(getAccessibleProjectsWhere(superAdmin), {});
assert.equal("OR" in getAccessibleProjectsWhere(collaborator), true);
assert.equal("OR" in getAccessibleProjectsWhere(futureUser), true);

const globalManagerPermissions: PermissionKey[] = [
  "project.view",
  "project.update",
  "project.delete",
  "project.viewBudget",
  "project.updateBudget",
  "project.viewParticipants",
  "project.manageCollaborators",
  "project.completeArchive",
  "stage.view",
  "stage.reviewSubmission",
  "stage.requestRevision",
  "stage.markSubmissionComplete",
  "stage.markStageComplete",
  "stage.manageDefinitions",
  "stage.updateTimeline",
  "stage.updateBudget",
  "completion.viewChecklist",
  "archive.view",
  "archive.uploadFile",
  "archive.download",
];
for (const permissionKey of globalManagerPermissions) {
  assert.equal(
    hasProjectPermission(admin, unrelatedProject, permissionKey),
    true,
    `ADMIN must receive global ${permissionKey}.`,
  );
}
assert.equal(
  hasProjectPermission(collaborator, unrelatedProject, "project.view"),
  false,
);
assert.equal(
  hasProjectPermission(futureUser, unrelatedProject, "project.view"),
  false,
);

assert.equal(getArchiveAccessLevel(admin), "FULL");
assert.equal(getArchiveAccessLevel(superAdmin), "FULL");
assert.equal(canUseArchives(admin), true);
assert.equal(canUseArchives(superAdmin), true);
assert.equal(getArchiveAccessLevel(futureUser), "NONE");
assert.equal(canUseArchives(futureUser), false);
assert.equal(
  getArchiveAccessLevel({
    ...collaborator,
    collaboratorType: "CLIENT_OF_GTI",
  }),
  "NONE",
);

const adminSidebar = getSidebarVisibility(admin);
assert.equal(adminSidebar.users, true);
assert.equal(adminSidebar.fluxAi, true);
assert.equal(adminSidebar.archives, true);
assert.equal(adminSidebar.calendar, true);
assert.equal(adminSidebar.library, true);

const conceptContext = {
  folderId: "folder",
  projectId: "project",
  taskerStageId: "tasker",
  workflowStageKey: ProjectWorkflowStageKey.CONCEPT_CREATION,
  assignedExecutorId: "executor",
  ownerId: "owner",
  coOwnerIds: [] as string[],
  workflowStageStatus: ProjectWorkflowStageStatus.AVAILABLE,
};
assert.equal(canManageProjectConcept(admin, conceptContext), true);
assert.equal(canViewProjectConcept(admin, conceptContext), true);
assert.equal(canReviewProjectConcept(admin, conceptContext), true);
assert.equal(canCompleteProjectConceptStage(admin, conceptContext), true);
assert.equal(
  canReviewProjectConcept(
    { ...admin, id: conceptContext.assignedExecutorId },
    conceptContext,
  ),
  false,
  "ADMIN must not review their own historical executor submission.",
);

const researchProject = {
  ownerId: "owner",
  coOwners: [] as Array<{ userId: string }>,
  executors: [{ userId: "executor" }],
  collaborators: [] as Array<{ userId: string }>,
  workflowStages: [
    {
      stageKey: ProjectWorkflowStageKey.PROJECT_RESEARCH_AND_PLANNING,
      status: ProjectWorkflowStageStatus.AVAILABLE,
    },
  ],
};
const adminResearchAccess = getProjectResearchAccess(admin, {
  projectId: "project",
  workspaceId: "workspace",
  workspaceOwnerUserId: "executor",
  project: researchProject,
});
assert.equal(adminResearchAccess.canRead, true);
assert.equal(adminResearchAccess.canWrite, true);
const collaboratorResearchAccess = getProjectResearchAccess(collaborator, {
  projectId: "project",
  workspaceId: "workspace",
  workspaceOwnerUserId: "executor",
  project: researchProject,
});
assert.equal(collaboratorResearchAccess.canRead, false);
assert.equal(collaboratorResearchAccess.canWrite, false);

const laterStageProject = {
  ownerId: "owner",
  coOwners: [] as Array<{ userId: string }>,
} as Parameters<typeof canManageStageSix>[1] &
  Parameters<typeof canManageStageSeven>[1];
assert.equal(canManageStageSix(admin, laterStageProject), true);
assert.equal(canManageStageSeven(admin, laterStageProject), true);
assert.equal(canManageStageSix(collaborator, laterStageProject), false);
assert.equal(canManageStageSeven(collaborator, laterStageProject), false);

assert.equal(
  getProjectWorkflowStageAccess(ProjectWorkflowStageStatus.AVAILABLE).allowed,
  true,
);
assert.deepEqual(
  getProjectWorkflowStageAccess(ProjectWorkflowStageStatus.LOCKED),
  {
    allowed: false,
    code: "STAGE_LOCKED",
    status: ProjectWorkflowStageStatus.LOCKED,
  },
);

const userActions = read("src/app/(dashboard)/users/actions.ts");
assertIncludes(
  userActions,
  "requireBusinessAdministratorPermission",
  "Users actions must use the business-administrator gate.",
);
assertIncludes(
  userActions,
  "isProtectedRootRole(existingUser.role)",
  "Users actions must reject protected root targets.",
);
assertIncludes(
  userActions,
  "isEditableUserRole(input.role)",
  "Users actions must reject forged root-role assignment.",
);
assertIncludes(
  userActions,
  "revalidateUserSessionCaches",
  "Permission changes must refresh active session caches.",
);
for (const snippet of [
  '"users.managePermissions"',
  '"settings.managePermissions"',
  "savePermissionProfile({",
  "updatePermissionProfileCache(input.profileType, input.profileKey)",
  "await revalidatePermissionSensitiveCaches()",
]) {
  assertIncludes(
    userActions,
    snippet,
    `ADMIN permission-profile save wiring is missing ${snippet}.`,
  );
}

const userService = read("src/lib/user-permissions.ts");
assertIncludes(
  userService,
  "isProtectedRootRole(input.role)",
  "The user service must reject assigning SUPER_ADMIN.",
);
assertIncludes(
  userService,
  "isProtectedRootRole(existingUser.role)",
  "The user service must reject mutating an existing root account.",
);

const collaborationService = read("src/lib/collaboration.ts");
assert.match(
  collaborationService,
  /const collaborator = await prisma\.user\.findUnique\([\s\S]*?role: true,[\s\S]*?collaborator\.role !== UserRole\.COLLABORATOR/,
  "Forged collaboration updates must not demote a protected root or another non-collaborator account.",
);
assert.equal(
  (collaborationService.match(/collaborator\.role !== UserRole\.COLLABORATOR/g) ?? [])
    .length,
  2,
  "Collaborator update and deletion must both reject non-collaborator targets, including roots.",
);

const avatarUpload = read("src/app/api/users/[userId]/avatar/upload-url/route.ts");
assertIncludes(
  avatarUpload,
  "isProtectedRootRole(targetUser.role)",
  "Managed avatar upload must reject protected root targets.",
);

const usersWorkspace = read("src/components/users/users-workspace.tsx");
assertIncludes(
  usersWorkspace,
  "editablePermissionRoleValues.map",
  "The role dropdown must use the protected editable-role list.",
);
assertIncludes(
  usersWorkspace,
  "!isProtectedRootRole(user.role)",
  "Protected root rows must be read-only.",
);

for (const path of [
  "src/app/(dashboard)/users/page.tsx",
  "src/app/(dashboard)/settings/permissions/page.tsx",
  "src/app/(dashboard)/settings/page.tsx",
  "src/app/(dashboard)/collaboration/page.tsx",
]) {
  assertIncludes(
    read(path),
    "isBusinessAdministratorRole",
    `${path} must recognize ADMIN business authority.`,
  );
}

for (const path of [
  "src/lib/project-concept-access.ts",
  "src/lib/project-research-access.ts",
  "src/lib/project-research.ts",
  "src/lib/stage-five.ts",
  "src/lib/stage-six.ts",
  "src/lib/stage-seven.ts",
]) {
  assertIncludes(
    read(path),
    "isGlobalProjectAdministrator",
    `${path} must use global ADMIN project authority.`,
  );
}

const workflowAccess = read("src/lib/workflow-stage-access.ts");
assert.equal(workflowAccess.includes("UserRole"), false);
assertIncludes(
  workflowAccess,
  "no account, including SUPER_ADMIN",
  "Workflow locks must remain role-independent.",
);

const profiles = read("src/lib/permissions/profiles.ts");
assertIncludes(
  profiles,
  "isLegacyCollaboratorRole(user.role)",
  "Only legacy COLLABORATOR snapshots should load type profiles.",
);
assertIncludes(
  profiles,
  'PERMISSION_PROFILE_CACHE_VERSION = "round2-admin-authority-v1"',
  "Round 2 must version permission-profile caches so existing ADMIN sessions reload defaults.",
);
const projectCreation = read("src/lib/project-creation.ts");
assertIncludes(
  projectCreation,
  "UserRole.SUPER_ADMIN",
  "Project creation must continue excluding root assignment.",
);
assert.equal(projectCreation.includes("UserRole.USER"), false);

const schema = read("prisma/schema.prisma");
assert.match(schema, /role\s+UserRole\s+@default\(COLLABORATOR\)/);

console.log(
  `Round 2 ADMIN authority checks passed (${allPermissionKeys.length} catalog permissions).`,
);
