"use server";

import { revalidatePath, revalidateTag } from "next/cache";

import { requireUser } from "@/lib/auth";
import {
  notifyConceptBriefAssigned,
  notifyConceptFileApproved,
  notifyStageFiveActivated,
  notifyStageFourFinalFileApproved,
  notifyStageFourConceptsActivated,
  runNotificationTask,
} from "@/lib/notification-center";
import {
  completeStageFourConcepts,
  completeStageThreeConcepts,
  createProjectConceptFolder,
  deleteProjectConceptFolder,
  editProjectConceptFolder,
  importStageThreeConceptReference,
  markProjectConceptApprovedAttachment,
  markStageFourFinalApprovedAttachment,
  revokeProjectConceptApprovedAttachment,
  revokeStageFourFinalApprovedAttachment,
  renameProjectConceptFolder,
  type ConceptWorkflowStageKey,
} from "@/lib/project-concepts";
import { PROJECTS_CACHE_TAG } from "@/lib/projects";
import { publishProjectActivityUpdatedAfterResponse } from "@/lib/realtime/server";

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
  deadline: string;
  brief?: string | null;
  briefAttachmentIds?: string[];
}) {
  const user = await requireUser();

  try {
    const result = await createProjectConceptFolder(user, input);

    if ("folder" in result && result.folder) {
      const folder = result.folder;
      revalidateConceptStage(input.projectId, input.stageKey);
      publishProjectActivityUpdatedAfterResponse({
        projectId: input.projectId,
        stageId: folder.taskerStageId,
        eventType: "participant_access_changed",
        changedEntityId: folder.id,
        actorId: user.id,
      });
      await runNotificationTask("concept-brief-assigned", () =>
        notifyConceptBriefAssigned({
          projectId: input.projectId,
          folderId: folder.id,
          actorId: user.id,
        }),
      );
    }

    return result;
  } catch (error) {
    console.error("[project-concepts] create failed", error);
    return { error: "Unable to create the task right now." } as const;
  }
}

export async function deleteProjectConceptFolderAction(input: {
  projectId: string;
  stageKey: ConceptWorkflowStageKey;
  folderId: string;
}) {
  const user = await requireUser();

  try {
    const result = await deleteProjectConceptFolder(user, input);

    if ("folder" in result && result.folder) {
      const folder = result.folder;
      revalidateConceptStage(input.projectId, input.stageKey);
      publishProjectActivityUpdatedAfterResponse({
        projectId: input.projectId,
        stageId: folder.taskerStageId,
        eventType: "participant_access_changed",
        changedEntityId: folder.id,
        actorId: user.id,
      });
    }

    return result;
  } catch (error) {
    console.error("[project-concepts] delete failed", error);
    return { error: "Unable to delete the task right now." } as const;
  }
}

export async function editProjectConceptFolderAction(input: {
  projectId: string;
  stageKey: ConceptWorkflowStageKey;
  folderId: string;
  name: string;
  assignedExecutorId?: string;
  deadline: string;
  brief?: string | null;
}) {
  const user = await requireUser();

  try {
    const result = await editProjectConceptFolder(user, input);

    if ("folder" in result && result.folder) {
      const folder = result.folder;
      revalidateConceptStage(input.projectId, input.stageKey);
      publishProjectActivityUpdatedAfterResponse({
        projectId: input.projectId,
        stageId: folder.taskerStageId,
        eventType: "participant_access_changed",
        changedEntityId: folder.id,
        actorId: user.id,
      });
      if (folder.assignmentChanged) {
        await runNotificationTask("concept-brief-reassigned", () =>
          notifyConceptBriefAssigned({
            projectId: input.projectId,
            folderId: folder.id,
            actorId: user.id,
          }),
        );
      }
    }

    return result;
  } catch (error) {
    console.error("[project-concepts] edit failed", error);
    return { error: "Unable to edit the concept right now." } as const;
  }
}

export async function importStageThreeConceptReferenceAction(input: {
  projectId: string;
  folderId: string;
  sourceConceptId: string;
}) {
  const user = await requireUser();

  try {
    const result = await importStageThreeConceptReference(user, input);

    if (!("error" in result)) {
      revalidateConceptStage(input.projectId, "PROJECT_DEVELOPMENT");
      revalidatePath(
        `/projects/${input.projectId}/stages/4/concepts/${input.folderId}`,
      );
    }

    return result;
  } catch (error) {
    console.error("[project-concepts] Stage 3 reference import failed", error);
    return {
      error: "Unable to import the approved Stage 3 concept right now.",
    } as const;
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
    return { error: "Unable to rename the task right now." } as const;
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

      if (result.transitioned) {
        await runNotificationTask("stage-four-concepts-activated", () =>
          notifyStageFourConceptsActivated({
            projectId: input.projectId,
            folderIds: [],
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

export async function markStageFourFinalApprovedAttachmentAction(input: {
  projectId: string;
  folderId: string;
  attachmentId: string;
}) {
  const user = await requireUser();

  try {
    const result = await markStageFourFinalApprovedAttachment(user, input);

    if (!("error" in result)) {
      revalidateConceptStage(input.projectId, "PROJECT_DEVELOPMENT");
      revalidatePath(
        `/projects/${input.projectId}/stages/4/concepts/${input.folderId}`,
      );
      if (result.changed) {
        await runNotificationTask("stage-four-final-file-approved", () =>
          notifyStageFourFinalFileApproved({
            ...input,
            actorId: user.id,
          }),
        );
      }

    }

    return result;
  } catch (error) {
    console.error("[project-concepts] Stage 4 final approval failed", error);
    return {
      error: "Unable to approve this final Stage 4 file right now.",
    } as const;
  }
}

export async function revokeProjectConceptApprovedAttachmentAction(input: {
  projectId: string;
  folderId: string;
}) {
  const user = await requireUser();

  try {
    const result = await revokeProjectConceptApprovedAttachment(user, input);

    if (!("error" in result)) {
      revalidateConceptStage(input.projectId, "CONCEPT_CREATION");
      revalidateConceptStage(input.projectId, "PROJECT_DEVELOPMENT");
      revalidatePath(`/projects/${input.projectId}/stages/5`);
      revalidatePath(`/projects/${input.projectId}/stages/6`);
      revalidatePath(`/projects/${input.projectId}`);
      revalidatePath(
        `/projects/${input.projectId}/stages/3/concepts/${input.folderId}`,
      );
    }

    return result;
  } catch (error) {
    console.error("[project-concepts] approval revocation failed", error);
    return { error: "Unable to revoke this concept approval right now." } as const;
  }
}

export async function revokeStageFourFinalApprovedAttachmentAction(input: {
  projectId: string;
  folderId: string;
}) {
  const user = await requireUser();

  try {
    const result = await revokeStageFourFinalApprovedAttachment(user, input);

    if (!("error" in result)) {
      revalidateConceptStage(input.projectId, "PROJECT_DEVELOPMENT");
      revalidatePath(`/projects/${input.projectId}/stages/5`);
      revalidatePath(
        `/projects/${input.projectId}/stages/4/concepts/${input.folderId}`,
      );
    }

    return result;
  } catch (error) {
    console.error("[project-concepts] Stage 4 approval revocation failed", error);
    return { error: "Unable to revoke this final approval right now." } as const;
  }
}

export async function completeStageFourConceptsAction(input: {
  projectId: string;
}) {
  const user = await requireUser();

  try {
    const result = await completeStageFourConcepts(user, input);

    if (!("error" in result)) {
      revalidateConceptStage(input.projectId, "PROJECT_DEVELOPMENT");
      revalidatePath(`/projects/${input.projectId}/stages/5`);
      revalidatePath(`/projects/${input.projectId}`);

      if (result.transitioned) {
        await runNotificationTask("stage-five-activated", () =>
          notifyStageFiveActivated({
            projectId: input.projectId,
            finalFileCount: result.finalApprovedCount,
            actorId: user.id,
          }),
        );
      }
    }

    return result;
  } catch (error) {
    console.error("[project-concepts] Stage 4 completion failed", error);
    return { error: "Unable to complete Stage 4 right now." } as const;
  }
}
