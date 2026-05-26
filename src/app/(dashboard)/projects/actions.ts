"use server";

import { revalidatePath, revalidateTag } from "next/cache";

import { requireUser } from "@/lib/auth";
import { createComparisonComment } from "@/lib/comparison";
import {
  createStageComment,
  createStageRevision,
  completeProjectStage,
  reviewProjectRevision,
  reviewStageSubmission,
  startProjectStageWork,
} from "@/lib/project-history";
import {
  PROJECTS_CACHE_TAG,
  removeProjectCollaborator,
  setProjectCollaboratorChatVisibility,
  updateProjectCollaborators,
} from "@/lib/projects";
import { SubmissionReviewStatus, UserRole } from "@prisma/client";
import type { ProjectCollaboratorParticipantType } from "@/lib/project-collaborator-participant-types";

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

export async function acceptStageBriefAction(input: {
  projectId: string;
  stageId: string;
}) {
  const user = await requireUser();

  try {
    const result = await startProjectStageWork(user, input);
    revalidateProjectFlow();

    return { result };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to accept the brief right now.",
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

export async function approveSubmissionAction(attachmentId: string) {
  const user = await requireUser();

  try {
    const submission = await reviewStageSubmission(user, {
      attachmentId,
      status: SubmissionReviewStatus.APPROVED,
    });
    revalidateProjectFlow();

    return { submission };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to approve the submission right now.",
    };
  }
}

export async function rejectSubmissionAction(attachmentId: string, note?: string) {
  const user = await requireUser();

  try {
    const submission = await reviewStageSubmission(user, {
      attachmentId,
      status: SubmissionReviewStatus.REJECTED,
      note,
    });
    revalidateProjectFlow();

    return { submission };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to reject the submission right now.",
    };
  }
}

export async function markSubmissionCompleteAction(input: {
  projectId: string;
  stageId: string;
  revisionId: string;
}) {
  const user = await requireUser();

  try {
    const revision = await reviewProjectRevision(user, {
      ...input,
      status: "APPROVED",
    });
    revalidateProjectFlow();

    return { revision };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to mark the stage as complete right now.",
    };
  }
}

export async function requestSubmissionRevisionAction(input: {
  projectId: string;
  stageId: string;
  revisionId: string;
  reason: string;
}) {
  const user = await requireUser();

  try {
    const revision = await reviewProjectRevision(user, {
      ...input,
      status: "REJECTED",
      reason: input.reason,
    });
    revalidateProjectFlow();

    return { revision };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to request a revision right now.",
    };
  }
}

export const approveStageSubmissionAction = markSubmissionCompleteAction;
export const rejectStageSubmissionAction = requestSubmissionRevisionAction;

export async function saveProjectCollaboratorsAction(
  projectId: string,
  collaborators: Array<{
    id: string;
    participantType: ProjectCollaboratorParticipantType | null;
  }>,
) {
  const user = await requireUser();

  if (user.role === UserRole.COLLABORATOR) {
    return { error: "You are not allowed to update project collaborators." };
  }

  try {
    const updatedCollaborators = await updateProjectCollaborators(
      projectId,
      collaborators,
      user.id,
    );

    revalidateProjectFlow();
    revalidatePath(`/projects/${projectId}/edit`);

    return { collaborators: updatedCollaborators };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to update project collaborators right now.",
    };
  }
}

export async function removeProjectCollaboratorAction(
  projectId: string,
  collaboratorId: string,
) {
  const user = await requireUser();

  try {
    const updatedCollaborators = await removeProjectCollaborator(
      user,
      projectId,
      collaboratorId,
    );

    revalidateProjectFlow();
    revalidatePath(`/projects/${projectId}/edit`);

    return { collaborators: updatedCollaborators };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to remove the collaborator right now.",
    };
  }
}

export async function setProjectCollaboratorChatVisibilityAction(input: {
  projectId: string;
  collaboratorId: string;
  paused: boolean;
}) {
  const user = await requireUser();

  try {
    const updatedCollaborators = await setProjectCollaboratorChatVisibility(user, input);

    revalidateProjectFlow();
    revalidatePath(`/projects/${input.projectId}/edit`);

    return { collaborators: updatedCollaborators };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to update collaborator chat visibility right now.",
    };
  }
}
