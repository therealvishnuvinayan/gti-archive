"use server";

import { revalidatePath, revalidateTag } from "next/cache";

import { requireUser } from "@/lib/auth";
import {
  completeProjectResearchStage,
  createProjectResearchFolder,
} from "@/lib/project-research";
import { deleteProjectResearchFolder } from "@/lib/project-research-files";
import { getProjectResearchImportOptions, importProjectInquiryContent } from "@/lib/project-research-import";
import { PROJECTS_CACHE_TAG } from "@/lib/projects";

function importErrorMessage(error: unknown, fallback: string) {
  const userMessages = new Set([
    "Research folder not found.",
    "This folder set is read-only for your account.",
    "Select between 1 and 100 Stage 1 items to import.",
    "Some selected Stage 1 content has changed or is unavailable. Reopen Import and select it again.",
  ]);
  return error instanceof Error && userMessages.has(error.message) ? error.message : fallback;
}

export async function getProjectResearchImportOptionsAction(input: { projectId: string; folderId: string }) {
  const user = await requireUser();
  try {
    return { items: await getProjectResearchImportOptions(user, input) };
  } catch (error) {
    console.error("[research-import] loading content failed", error);
    return { error: importErrorMessage(error, "Unable to load Stage 1 content. Please try again.") };
  }
}

export async function importProjectInquiryContentAction(input: {
  projectId: string;
  folderId: string;
  itemIds: string[];
}) {
  const user = await requireUser();
  try {
    const result = await importProjectInquiryContent(user, input);
    revalidatePath(`/projects/${input.projectId}/stages/2`);
    revalidatePath(`/projects/${input.projectId}/stages/2/folders/${input.folderId}`);
    revalidateTag(PROJECTS_CACHE_TAG, "max");
    return result;
  } catch (error) {
    console.error("[research-import] import failed", error);
    return { error: importErrorMessage(error, "Unable to import Stage 1 content. Please try again.") };
  }
}

export async function createProjectResearchFolderAction(input: {
  projectId: string;
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
      revalidatePath(`/projects/${projectId}/stages/3`);
      revalidatePath(`/projects/${projectId}/stages/4`);
      revalidatePath(`/projects/${projectId}/stages/5`);
      revalidateTag(PROJECTS_CACHE_TAG, "max");
    }
    return result;
  } catch (error) {
    console.error("[project-research] completion failed", error);
    return { error: "Unable to complete Project Research and Planning right now." };
  }
}
