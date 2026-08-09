"use server";

import { revalidatePath, revalidateTag } from "next/cache";

import { requireUser } from "@/lib/auth";
import {
  notifyConceptFileApproved,
  notifyStageFourConceptsActivated,
  runNotificationTask,
} from "@/lib/notification-center";
import {
  completeStageThreeConcepts,
  createProjectConceptFolder,
  editProjectConceptFolder,
  markProjectConceptApprovedAttachment,
  renameProjectConceptFolder,
  type ConceptWorkflowStageKey,
} from "@/lib/project-concepts";
import { handoffStageFourFiles } from "@/lib/stage-five";
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
  assignedExecutorId: string;
  brief?: string | null;
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

export async function editProjectConceptFolderAction(input: {
  projectId: string;
  stageKey: ConceptWorkflowStageKey;
  folderId: string;
  name: string;
  assignedExecutorId?: string;
  brief?: string | null;
}) {
  const user = await requireUser();

  try {
    const result = await editProjectConceptFolder(user, input);

    if ("folder" in result) {
      revalidateConceptStage(input.projectId, input.stageKey);
    }

    return result;
  } catch (error) {
    console.error("[project-concepts] edit failed", error);
    return { error: "Unable to edit the concept right now." } as const;
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

export async function markProjectConceptApprovedAttachmentAction(input: {
  projectId: string;
  folderId: string;
  attachmentId: string;
}) {
  const user = await requireUser();

  try {
    const result = await markProjectConceptApprovedAttachment(user, input);

    if (!("error" in result)) {
      revalidateConceptStage(
        input.projectId,
        "CONCEPT_CREATION",
      );
      revalidatePath(
        `/projects/${input.projectId}/stages/3/concepts/${input.folderId}`,
      );

      if (result.changed) {
        await runNotificationTask("concept-file-approved", () =>
          notifyConceptFileApproved({
            ...input,
            actorId: user.id,
          }),
        );
      }
    }

    return result;
  } catch (error) {
    console.error("[project-concepts] approval failed", error);
    return { error: "Unable to approve this concept file right now." } as const;
  }
}

export async function completeStageThreeConceptsAction(input: {
  projectId: string;
}) {
  const user = await requireUser();

  try {
    const result = await completeStageThreeConcepts(user, input);

    if (!("error" in result)) {
      revalidateConceptStage(
        input.projectId,
        "CONCEPT_CREATION",
      );
      revalidateConceptStage(
        input.projectId,
        "PROJECT_DEVELOPMENT",
      );

      for (const folderId of result.promotedFolderIds) {
        revalidatePath(
          `/projects/${input.projectId}/stages/4/concepts/${folderId}`,
        );
      }

      if (result.transitioned || result.createdFolderIds.length > 0) {
        await runNotificationTask("stage-four-concepts-activated", () =>
          notifyStageFourConceptsActivated({
            projectId: input.projectId,
            folderIds: result.promotedFolderIds,
            actorId: user.id,
          }),
        );
      }
    }

    return result;
  } catch (error) {
    console.error("[project-concepts] Stage 3 completion failed", error);
    return { error: "Unable to complete Stage 3 right now." } as const;
  }
}

export async function handoffStageFourFilesAction(input: {
  projectId: string;
  attachmentIds: string[];
}) {
  const user = await requireUser();
  const result = await handoffStageFourFiles(user, input);

  if (!("error" in result)) {
    revalidatePath(`/projects/${input.projectId}/stages/4`);
    revalidatePath(`/projects/${input.projectId}/stages/5`);
  }

  return result;
}
