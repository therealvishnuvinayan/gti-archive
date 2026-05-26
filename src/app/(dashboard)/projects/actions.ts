"use server";

import { revalidatePath, revalidateTag } from "next/cache";

import { requireUser } from "@/lib/auth";
import { createComparisonComment } from "@/lib/comparison";
import {
  createStageComment,
  createStageRevision,
  completeProjectStage,
} from "@/lib/project-history";
import { PROJECTS_CACHE_TAG, updateProjectCollaborators } from "@/lib/projects";
import { UserRole } from "@prisma/client";

type StageRevisionInput = {
  projectId: string;
  stageId: string;
  summary?: string;
};

type StageCommentInput = {
  projectId: string;
  stageId: string;
  body: string;
  allowEmptyBody?: boolean;
};

type ComparisonCommentInput = {
  projectId: string;
  stageId: string;
  baseAttachmentId: string;
  compareAttachmentId: string;
  xPercent: number;
  yPercent: number;
  body: string;
};

function revalidateProjectFlow() {
  revalidateTag(PROJECTS_CACHE_TAG, "max");
}

export async function createStageRevisionAction(input: StageRevisionInput) {
  const user = await requireUser();

  try {
    const revision = await createStageRevision(user, input);
    revalidateProjectFlow();

    return {
      revisionId: revision.id,
      title: revision.title,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Unable to create a revision right now.",
    };
  }
}

export async function createStageCommentAction(input: StageCommentInput) {
  const user = await requireUser();

  try {
    const comment = await createStageComment(user, input);
    revalidateProjectFlow();

    return {
      commentId: comment.id,
      revisionId: comment.revisionId,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Unable to add the comment right now.",
    };
  }
}

export async function markStageCompleteAction(input: {
  projectId: string;
  stageId: string;
}) {
  const user = await requireUser();

  try {
    const stage = await completeProjectStage(user, input);
    revalidateProjectFlow();

    return { stage };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to mark the stage as complete right now.",
    };
  }
}

export async function createComparisonCommentAction(input: ComparisonCommentInput) {
  const user = await requireUser();

  try {
    const comment = await createComparisonComment(user, input);
    revalidateProjectFlow();

    return { comment };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to save the comparison comment right now.",
    };
  }
}

export async function saveProjectCollaboratorsAction(
  projectId: string,
  collaboratorIds: string[],
) {
  const user = await requireUser();

  if (user.role === UserRole.COLLABORATOR) {
    return { error: "You are not allowed to update project collaborators." };
  }

  try {
    const collaborators = await updateProjectCollaborators(
      projectId,
      collaboratorIds,
      user.id,
    );

    revalidateProjectFlow();
    revalidatePath(`/projects/${projectId}/edit`);

    return { collaborators };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to update project collaborators right now.",
    };
  }
}
