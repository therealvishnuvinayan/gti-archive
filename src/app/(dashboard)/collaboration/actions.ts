"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { CollaboratorAccess, UserRole } from "@prisma/client";

import { getUserDisplayName, requireUser } from "@/lib/auth";
import {
  CALENDAR_COLLABORATORS_CACHE_TAG,
  COLLABORATORS_CACHE_TAG,
  deleteCollaborator,
  createCollaborator,
  updateCollaborator,
  type CollaboratorInput,
} from "@/lib/collaboration";
import { PermissionError, requirePermission } from "@/lib/permissions/require";
import { PROJECTS_CACHE_TAG } from "@/lib/projects";
import { prisma } from "@/lib/prisma";

type SaveCollaboratorInput = CollaboratorInput & {
  collaboratorId?: string | null;
};

const permissionLevelMap: Record<
  SaveCollaboratorInput["permissions"][keyof SaveCollaboratorInput["permissions"]],
  CollaboratorAccess
> = {
  full: CollaboratorAccess.FULL,
  limited: CollaboratorAccess.LIMITED,
  none: CollaboratorAccess.NONE,
};

function isModuleAccessChange(
  previousAccess: {
    projectAccess: CollaboratorAccess;
    calendarAccess: CollaboratorAccess;
    libraryAccess: CollaboratorAccess;
    archiveAccess: CollaboratorAccess;
  } | null,
  input: SaveCollaboratorInput,
) {
  if (!previousAccess) {
    return true;
  }

  return (
    previousAccess.projectAccess !== permissionLevelMap[input.permissions.project] ||
    previousAccess.calendarAccess !== permissionLevelMap[input.permissions.calendar] ||
    previousAccess.libraryAccess !== permissionLevelMap[input.permissions.library] ||
    previousAccess.archiveAccess !== permissionLevelMap[input.permissions.archive]
  );
}

export async function saveCollaboratorAction(input: SaveCollaboratorInput) {
  const user = await requireUser();
  const collaboratorId = input.collaboratorId?.trim() || null;

  try {
    if (collaboratorId) {
      requirePermission(
        user,
        "collaboration.updateUser",
        "You are not allowed to update collaborators.",
      );

      const existingCollaborator = await prisma.user.findUnique({
        where: {
          id: collaboratorId,
        },
        select: {
          role: true,
          projectAccess: true,
          calendarAccess: true,
          libraryAccess: true,
          archiveAccess: true,
        },
      });

      if (
        existingCollaborator?.role === UserRole.COLLABORATOR &&
        isModuleAccessChange(existingCollaborator, input)
      ) {
        requirePermission(
          user,
          "collaboration.manageModuleAccess",
          "You are not allowed to change collaborator module access.",
        );
      }
    } else {
      requirePermission(
        user,
        "collaboration.createUser",
        "You are not allowed to create collaborators.",
      );
      requirePermission(
        user,
        "collaboration.manageModuleAccess",
        "You are not allowed to assign collaborator module access.",
      );
    }
  } catch (error) {
    if (error instanceof PermissionError) {
      return { error: error.message };
    }

    throw error;
  }

  const result = collaboratorId
    ? await updateCollaborator(collaboratorId, input)
    : await createCollaborator(getUserDisplayName(user), input);

  if ("error" in result) {
    return result;
  }

  revalidatePath("/collaboration");
  revalidateTag(COLLABORATORS_CACHE_TAG, "max");

  return result;
}

export async function deleteCollaboratorAction(collaboratorId: string) {
  const user = await requireUser();

  try {
    requirePermission(
      user,
      "collaboration.deleteGlobal",
      "You are not allowed to delete collaborators.",
    );
  } catch (error) {
    if (error instanceof PermissionError) {
      return { error: error.message };
    }

    throw error;
  }

  if (user.role !== UserRole.SUPER_ADMIN) {
    return { error: "You are not allowed to delete collaborators." };
  }

  const result = await deleteCollaborator(collaboratorId);

  if ("error" in result) {
    return result;
  }

  revalidatePath("/collaboration");
  revalidatePath("/projects");
  revalidatePath("/calendar");
  revalidateTag(COLLABORATORS_CACHE_TAG, "max");
  revalidateTag(CALENDAR_COLLABORATORS_CACHE_TAG, "max");
  revalidateTag(PROJECTS_CACHE_TAG, "max");

  return { success: true };
}
