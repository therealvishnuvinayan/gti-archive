"use server";

import { revalidatePath } from "next/cache";
import { UserRole } from "@prisma/client";

import { requireUser } from "@/lib/auth";
import {
  collaboratorTypeValues,
  permissionProfileTypeValues,
  permissionRoleValues,
  type CollaboratorTypeValue,
  type PermissionProfileType,
  type PermissionRole,
} from "@/lib/permissions/definitions";
import {
  getPermissionProfile,
  resetPermissionProfileToDefaults,
  savePermissionProfile,
  syncPermissionDefinitions,
} from "@/lib/permissions/profiles";
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

function revalidatePermissionSensitivePaths() {
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
}

async function requireSuperAdminUser() {
  const currentUser = await requireUser();

  if (currentUser.role !== UserRole.SUPER_ADMIN) {
    return null;
  }

  return currentUser;
}

export async function saveUserAccessAction(input: SaveUserAccessInput) {
  const currentUser = await requireSuperAdminUser();

  if (!currentUser) {
    return { error: "Only super admins can update users." };
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

  revalidatePermissionSensitivePaths();

  return {
    success: true,
    user,
  };
}

export async function getPermissionProfileAction(input: PermissionProfileInput) {
  const currentUser = await requireSuperAdminUser();

  if (!currentUser) {
    return { error: "Only super admins can manage permission profiles." };
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

export async function savePermissionProfileAction(input: PermissionProfileInput & {
  state: Record<string, boolean>;
}) {
  const currentUser = await requireSuperAdminUser();

  if (!currentUser) {
    return { error: "Only super admins can manage permission profiles." };
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

    revalidatePermissionSensitivePaths();

    return {
      success: true,
      profile,
      message: "Permission profile updated. Users may need to refresh for changes to apply.",
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
  const currentUser = await requireSuperAdminUser();

  if (!currentUser) {
    return { error: "Only super admins can manage permission profiles." };
  }

  if (!permissionProfileTypeValues.includes(input.profileType)) {
    return { error: "Choose a valid permission profile type." };
  }

  try {
    const profile = await resetPermissionProfileToDefaults(
      input.profileType,
      input.profileKey,
    );

    revalidatePermissionSensitivePaths();

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
  const currentUser = await requireSuperAdminUser();

  if (!currentUser) {
    return { error: "Only super admins can sync permission definitions." };
  }

  try {
    const result = await syncPermissionDefinitions();
    revalidatePermissionSensitivePaths();

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
