"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { UserRole } from "@prisma/client";

import { requireUser } from "@/lib/auth";
import { CALENDAR_CACHE_TAG } from "@/lib/calendar";
import {
  CALENDAR_COLLABORATORS_CACHE_TAG,
  COLLABORATORS_CACHE_TAG,
} from "@/lib/collaboration";
import {
  collaboratorTypeValues,
  permissionProfileTypeValues,
  permissionRoleValues,
  type CollaboratorTypeValue,
  type PermissionKey,
  type PermissionProfileType,
  type PermissionRole,
} from "@/lib/permissions/definitions";
import {
  getPermissionProfile,
  resetPermissionProfileToDefaults,
  savePermissionProfile,
  syncPermissionDefinitions,
} from "@/lib/permissions/profiles";
import { hasPermission } from "@/lib/permissions/resolver";
import { prisma, withPrismaRetry } from "@/lib/prisma";
import { PROJECTS_CACHE_TAG } from "@/lib/projects";
import {
  countSuperAdmins,
  getManagedUserPermissionRecord,
  updateManagedUserPermissions,
} from "@/lib/user-permissions";

type SaveUserAccessInput = {
  userId: string;
  role: PermissionRole;
  collaboratorType: CollaboratorTypeValue;
};

type PermissionProfileInput = {
  profileType: PermissionProfileType;
  profileKey: string;
};

function getSessionCacheTag(token: string) {
  return `session:${token}`;
}

async function revalidateUserSessionCaches(userIds?: string[]) {
  const sessions = await withPrismaRetry(() =>
    prisma.session.findMany({
      where: {
        expiresAt: {
          gt: new Date(),
        },
        ...(userIds
          ? {
              userId: {
                in: userIds,
              },
            }
          : {}),
      },
      select: {
        token: true,
      },
    }),
  );

  for (const session of sessions) {
    revalidateTag(getSessionCacheTag(session.token), "max");
  }
}

async function revalidatePermissionSensitiveCaches(userIds?: string[]) {
  revalidateTag(PROJECTS_CACHE_TAG, "max");
  revalidateTag(COLLABORATORS_CACHE_TAG, "max");
  revalidateTag(CALENDAR_COLLABORATORS_CACHE_TAG, "max");
  revalidateTag(CALENDAR_CACHE_TAG, "max");

  revalidatePath("/users");
  revalidatePath("/settings");
  revalidatePath("/settings/permissions");
  revalidatePath("/");
  revalidatePath("/projects");
  revalidatePath("/calendar");
  revalidatePath("/collaboration");
  revalidatePath("/library");
  revalidatePath("/archives");
  revalidatePath("/notifications");

  await revalidateUserSessionCaches(userIds);
}

async function requireSuperAdminPermission(permissionKey: PermissionKey) {
  const currentUser = await requireUser();

  if (currentUser.role !== UserRole.SUPER_ADMIN || !hasPermission(currentUser, permissionKey)) {
    return null;
  }

  return currentUser;
}

export async function saveUserAccessAction(input: SaveUserAccessInput) {
  const currentUser = await requireSuperAdminPermission("users.update");

  if (!currentUser) {
    return { error: "Only super admins with user update access can update users." };
  }

  const userId = input.userId.trim();

  if (!userId) {
    return { error: "User id is missing." };
  }

  if (!permissionRoleValues.includes(input.role)) {
    return { error: "Choose a valid role." };
  }

  if (!collaboratorTypeValues.includes(input.collaboratorType)) {
    return { error: "Choose a valid collaborator type." };
  }

  const existingUser = await getManagedUserPermissionRecord(userId);

  if (!existingUser) {
    return { error: "User not found." };
  }

  if (existingUser.role === "SUPER_ADMIN" && input.role !== "SUPER_ADMIN") {
    const superAdminCount = await countSuperAdmins();

    if (superAdminCount <= 1) {
      return { error: "At least one SUPER_ADMIN must remain in the system." };
    }
  }

  const user = await updateManagedUserPermissions({
    userId,
    role: input.role,
    collaboratorType: input.collaboratorType,
  });

  await revalidatePermissionSensitiveCaches([userId, currentUser.id]);

  return {
    success: true,
    user,
  };
}

export async function getPermissionProfileAction(input: PermissionProfileInput) {
  const currentUser = await requireSuperAdminPermission("users.managePermissions");

  if (!currentUser || !hasPermission(currentUser, "settings.managePermissions")) {
    return { error: "Only super admins with permission management access can manage profiles." };
  }

  if (!permissionProfileTypeValues.includes(input.profileType)) {
    return { error: "Choose a valid permission profile type." };
  }

  try {
    const profile = await getPermissionProfile(input.profileType, input.profileKey);

    return {
      success: true,
      profile,
    };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to load this permission profile right now.",
    };
  }
}

export async function savePermissionProfileAction(
  input: PermissionProfileInput & {
    state: Record<string, boolean>;
  },
) {
  const currentUser = await requireSuperAdminPermission("users.managePermissions");

  if (!currentUser || !hasPermission(currentUser, "settings.managePermissions")) {
    return { error: "Only super admins with permission management access can manage profiles." };
  }

  if (!permissionProfileTypeValues.includes(input.profileType)) {
    return { error: "Choose a valid permission profile type." };
  }

  try {
    const profile = await savePermissionProfile({
      profileType: input.profileType,
      profileKey: input.profileKey,
      state: input.state,
    });

    await revalidatePermissionSensitiveCaches();

    return {
      success: true,
      profile,
      message: "Permission profile updated. Active sessions were refreshed.",
    };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to save this permission profile right now.",
    };
  }
}

export async function resetPermissionProfileToDefaultsAction(
  input: PermissionProfileInput,
) {
  const currentUser = await requireSuperAdminPermission("users.managePermissions");

  if (!currentUser || !hasPermission(currentUser, "settings.managePermissions")) {
    return { error: "Only super admins with permission management access can manage profiles." };
  }

  if (!permissionProfileTypeValues.includes(input.profileType)) {
    return { error: "Choose a valid permission profile type." };
  }

  try {
    const profile = await resetPermissionProfileToDefaults(
      input.profileType,
      input.profileKey,
    );

    await revalidatePermissionSensitiveCaches();

    return {
      success: true,
      profile,
      message: "Permission profile reset to code defaults.",
    };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to reset this permission profile right now.",
    };
  }
}

export async function syncPermissionDefinitionsAction() {
  const currentUser = await requireSuperAdminPermission("users.managePermissions");

  if (!currentUser || !hasPermission(currentUser, "settings.managePermissions")) {
    return { error: "Only super admins with permission management access can sync definitions." };
  }

  try {
    const result = await syncPermissionDefinitions();
    await revalidatePermissionSensitiveCaches();

    return {
      success: true,
      result,
    };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to sync permission definitions right now.",
    };
  }
}
