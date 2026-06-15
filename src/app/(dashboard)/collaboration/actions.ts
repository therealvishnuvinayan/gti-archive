"use server";

import { revalidatePath, revalidateTag } from "next/cache";

import { getUserDisplayName, requireUser } from "@/lib/auth";
import {
  CALENDAR_COLLABORATORS_CACHE_TAG,
  COLLABORATORS_CACHE_TAG,
  deleteCollaborator,
  createCollaborator,
  updateCollaborator,
  type CollaboratorInput,
} from "@/lib/collaboration";
import { hasPermission } from "@/lib/permissions/resolver";
import { PROJECTS_CACHE_TAG } from "@/lib/projects";

type SaveCollaboratorInput = CollaboratorInput & {
  collaboratorId?: string | null;
  allowExistingUser?: boolean | null;
};

export async function saveCollaboratorAction(input: SaveCollaboratorInput) {
  const user = await requireUser();
  const permissionKey = input.collaboratorId
    ? "collaboration.updateUser"
    : "collaboration.createUser";

  if (!hasPermission(user, permissionKey)) {
    return {
      error: input.collaboratorId
        ? "You are not allowed to update collaborators."
        : "You are not allowed to create collaborators.",
    };
  }

  const result = input.collaboratorId
    ? await updateCollaborator(input.collaboratorId, input)
    : await createCollaborator(getUserDisplayName(user), input, {
        allowExistingUser: input.allowExistingUser ?? false,
      });

  if ("error" in result) {
    return result;
  }

  if (!result.reusedExistingUser) {
    revalidatePath("/collaboration");
    revalidateTag(COLLABORATORS_CACHE_TAG, "max");
  }

  return result;
}

export async function deleteCollaboratorAction(collaboratorId: string) {
  const user = await requireUser();

  if (!hasPermission(user, "collaboration.deleteGlobal")) {
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
