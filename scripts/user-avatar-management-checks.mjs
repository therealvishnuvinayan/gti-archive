import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [packageJson, workspace, actions, userPermissions, uploadRoute, previewRoute] =
  await Promise.all([
    readFile("package.json", "utf8"),
    readFile("src/components/users/users-workspace.tsx", "utf8"),
    readFile("src/app/(dashboard)/users/actions.ts", "utf8"),
    readFile("src/lib/user-permissions.ts", "utf8"),
    readFile("src/app/api/users/[userId]/avatar/upload-url/route.ts", "utf8"),
    readFile("src/app/api/users/[userId]/avatar/route.ts", "utf8"),
  ]);

assert(
  packageJson.includes('"users:avatar-check": "node scripts/user-avatar-management-checks.mjs"'),
  "The managed-user avatar regression check must remain registered.",
);

for (const snippet of [
  "Change Profile Photo",
  "uploadManagedUserPhoto",
  "validateProfilePhoto",
  "getManagedUserAvatarSrc",
  "selectedAvatarPreviewSrc",
  "avatarUrl,",
]) {
  assert(workspace.includes(snippet), `Managed-user avatar UI is missing: ${snippet}`);
}

for (const source of [uploadRoute, previewRoute]) {
  assert(
    source.includes("isBusinessAdministratorRole") && source.includes("hasPermission"),
    "Managed-user avatar routes must remain restricted to permitted administrators.",
  );
}

assert(
  uploadRoute.includes("isProtectedRootRole(targetUser.role)"),
  "Managed-user avatar uploads must not mutate protected root accounts.",
);

for (const snippet of [
  "buildUserAvatarKey(targetUser.id",
  "getMaxProfileAvatarBytes()",
  "isAllowedProfileImage",
]) {
  assert(uploadRoute.includes(snippet), `Avatar upload safety is missing: ${snippet}`);
}

assert(
  previewRoute.includes("createPresignedPreviewUrl") &&
    previewRoute.includes('"users.view"'),
  "Managed-user avatar previews must be permission checked and presigned.",
);

assert(
  actions.includes("buildUserAvatarPrefix(userId)") &&
    actions.includes("deleteObjectIfNeeded(existingUser.avatarUrl)"),
  "The save action must validate target-user ownership and clean up replaced photos.",
);

assert(
  userPermissions.includes("avatarUrl: user.avatarUrl") &&
    userPermissions.includes("{ avatarUrl: input.avatarUrl }") &&
    (userPermissions.match(/avatarUrl: true/g) ?? []).length >= 3,
  "Managed-user records and updates must persist avatar state.",
);

console.log("Administrator managed-user avatar checks passed.");
