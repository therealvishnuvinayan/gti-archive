"use server";

import { revalidatePath, revalidateTag } from "next/cache";

import { requireUser } from "@/lib/auth";
import {
  createProjectConceptFolder,
  renameProjectConceptFolder,
  type ConceptWorkflowStageKey,
} from "@/lib/project-concepts";
import { PROJECTS_CACHE_TAG } from "@/lib/projects";

function getConceptStageNumber(stageKey: ConceptWorkflowStageKey) {
  return stageKey === "CONCEPT_CREATION" ? 3 : 4;
}

function revalidateConceptStage(
  projectId: string,
  stageKey: ConceptWorkflowStageKey,
) {
  revalidatePath(
    `/projects/${projectId}/stages/${getConceptStageNumber(stageKey)}`,
  );
  revalidateTag(PROJECTS_CACHE_TAG, "max");
}

export async function createProjectConceptFolderAction(input: {
  projectId: string;
  stageKey: ConceptWorkflowStageKey;
  name: string;
}) {
  const user = await requireUser();

  try {
    const result = await createProjectConceptFolder(user, input);

    if ("folder" in result) {
      revalidateConceptStage(input.projectId, input.stageKey);
    }

    return result;
  } catch (error) {
    console.error("[project-concepts] create failed", error);
    return { error: "Unable to create the concept folder right now." } as const;
  }
}

export async function renameProjectConceptFolderAction(input: {
  projectId: string;
  stageKey: ConceptWorkflowStageKey;
  folderId: string;
  name: string;
}) {
  const user = await requireUser();

  try {
    const result = await renameProjectConceptFolder(user, input);

    if ("folder" in result) {
      revalidateConceptStage(input.projectId, input.stageKey);
    }

    return result;
  } catch (error) {
    console.error("[project-concepts] rename failed", error);
    return { error: "Unable to rename the concept folder right now." } as const;
  }
}
