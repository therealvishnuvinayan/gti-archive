"use server";

import { revalidatePath, revalidateTag } from "next/cache";

import { requireUser } from "@/lib/auth";
import {
  completeProjectResearchStage,
  createProjectResearchFolder,
} from "@/lib/project-research";
import { deleteProjectResearchFolder } from "@/lib/project-research-files";
import { PROJECTS_CACHE_TAG } from "@/lib/projects";

export async function createProjectResearchFolderAction(input: {
  projectId: string;
  workspaceId: string;
  name: string;
}) {
  const user = await requireUser();
  try {
    const result = await createProjectResearchFolder(user, input);
    if (!("error" in result)) {
      revalidatePath(`/projects/${input.projectId}/stages/2`);
      revalidateTag(PROJECTS_CACHE_TAG, "max");
    }
    return result;
  } catch (error) {
    console.error("[project-research] folder creation failed", error);
    return { error: error instanceof Error ? error.message : "Unable to create folder." };
  }
}

export async function deleteProjectResearchFolderAction(input: {
  projectId: string;
  workspaceId: string;
  folderId: string;
}) {
  const user = await requireUser();
  try {
    const result = await deleteProjectResearchFolder(user, input);
    if (!("error" in result)) {
      revalidatePath(`/projects/${input.projectId}/stages/2`);
      revalidateTag(PROJECTS_CACHE_TAG, "max");
    }
    return result;
  } catch (error) {
    console.error("[project-research] folder deletion failed", error);
    return {
      error: error instanceof Error ? error.message : "Unable to delete folder.",
    };
  }
}

export async function completeProjectResearchStageAction(projectId: string) {
  const user = await requireUser();
  try {
    const result = await completeProjectResearchStage(user, projectId);
    if (!("error" in result)) {
      revalidatePath(`/projects/${projectId}`);
      revalidatePath(`/projects/${projectId}/stages/2`);
      revalidateTag(PROJECTS_CACHE_TAG, "max");
    }
    return result;
  } catch (error) {
    console.error("[project-research] completion failed", error);
    return { error: "Unable to complete Project Research and Planning right now." };
  }
}
