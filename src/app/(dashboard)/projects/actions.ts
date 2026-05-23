"use server";

import { revalidatePath, revalidateTag } from "next/cache";

import { requireUser } from "@/lib/auth";
import {
  createStageComment,
  createStageRevision,
} from "@/lib/project-history";
import { PROJECTS_CACHE_TAG } from "@/lib/projects";

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

function revalidateProjectFlow(projectId: string) {
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/chat`);
  revalidatePath(`/projects/${projectId}/compare`);
  revalidateTag(PROJECTS_CACHE_TAG, "max");
}

export async function createStageRevisionAction(input: StageRevisionInput) {
  const user = await requireUser();

  try {
    const revision = await createStageRevision(user, input);
    revalidateProjectFlow(input.projectId);

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
    revalidateProjectFlow(input.projectId);

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
