"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath, revalidateTag } from "next/cache";
import { after } from "next/server";

import { getUserDisplayName, requireUser } from "@/lib/auth";
import {
  completeProjectArchive,
  getProjectArchivePreparation,
} from "@/lib/archives";
import { createComparisonComment } from "@/lib/comparison";
import {
  getProjectCollaboratorUserIds,
  notifyApprovalRequired,
  notifyBriefAccepted,
  notifyCommentAdded,
  notifyCommentMentioned,
  notifyCopyrightTransferRequired,
  notifyProjectArchived,
  notifyProjectAssignmentChanges,
  notifyRevisionSubmitted,
  notifyStageInvoiceRequested,
  notifyStageSubmissionReviewDecision,
  notifyStageTransition,
  notifySubmissionWorkflowDecision,
  runNotificationTask,
  runNotificationTaskAfterResponse,
} from "@/lib/notification-center";
import {
  configureProjectCompletionWorkflow,
  markProjectInvoiceNotRequired,
  prepareAuthorityApprovalRequest,
  prepareCopyrightTransferRequest,
} from "@/lib/project-completion";
import {
  cancelStageRevisionSubmission,
  createStageComment,
  createStageRevision,
  deleteStageComment,
  completeProjectStage,
  reviewProjectRevision,
  reviewStageSubmission,
  requestStageInvoice,
  startProjectStageWork,
} from "@/lib/project-history";
import {
  PROJECTS_CACHE_TAG,
  removeProjectCollaborator,
  setProjectCollaboratorChatVisibility,
  updateProjectCollaborators,
} from "@/lib/projects";
import { hasProjectPermission } from "@/lib/permissions/resolver";
import { prisma } from "@/lib/prisma";
import {
  publishStageChatMessageDeleted,
  runStageChatRealtimeTaskAfterResponse,
} from "@/lib/realtime/server";
import { logStageChatTiming } from "@/lib/stage-chat-timing";
import { SubmissionReviewStatus } from "@prisma/client";
import type { ProjectCollaboratorParticipantType } from "@/lib/project-collaborator-participant-types";

type StageRevisionInput = {
  projectId: string;
  stageId: string;
  summary?: string;
};

type StageCommentInput = {
  projectId: string;
  stageId: string;
  revisionId?: string | null;
  body: string;
  allowEmptyBody?: boolean;
  mentionedUserIds?: string[];
};

type DeleteStageCommentInput = {
  projectId: string;
  stageId: string;
  commentId: string;
};

type StageInvoiceRequestInput = {
  projectId: string;
  stageId: string;
  requestedFromId: string;
  note?: string;
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

function revalidateProjectFlowAfterResponse() {
  after(revalidateProjectFlow);
}

export async function toggleProjectPinAction(projectId: string) {
  const user = await requireUser();
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      createdById: true,
      executors: {
        select: {
          userId: true,
          role: true,
        },
      },
      isPinned: true,
      collaborators: {
        select: {
          userId: true,
        },
      },
    },
  });

  if (!project) {
    throw new Error("Project not found.");
  }

  if (!hasProjectPermission(user, project, "project.update")) {
    throw new Error("You are not allowed to pin projects.");
  }

  const updatedProject = await prisma.project.update({
    where: { id: projectId },
    data: {
      isPinned: !project.isPinned,
    },
    select: {
      isPinned: true,
    },
  });

  revalidatePath("/projects");
  revalidateProjectFlow();

  return updatedProject;
}

function revalidateArchiveFlow(projectId: string, categorySlug?: string) {
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/chat`);
  revalidatePath("/archives");

  if (categorySlug) {
    revalidatePath(`/archives/${categorySlug}`);
  }
}

export async function createStageRevisionAction(input: StageRevisionInput) {
  const user = await requireUser();

  try {
    const revision = await createStageRevision(user, input);
    revalidateProjectFlow();

    await runNotificationTask("revision-submitted", () =>
      notifyRevisionSubmitted({
        actorId: user.id,
        actorName: getUserDisplayName(user),
        projectId: input.projectId,
        stageId: input.stageId,
        revisionId: revision.id,
      }),
    );

    return {
      revisionId: revision.id,
      title: revision.title,
      revisionNumber: revision.revisionNumber,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Unable to create a revision right now.",
    };
  }
}

export async function cancelStageRevisionSubmissionAction(input: {
  projectId: string;
  stageId: string;
  revisionId: string;
}) {
  const user = await requireUser();

  try {
    await cancelStageRevisionSubmission(user, input);
    revalidateProjectFlow();

    return { success: true };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to cancel the revision right now.",
    };
  }
}

async function createStageCommentActionResult(
  input: StageCommentInput,
  options: {
    revalidateProjectFlow: boolean;
  },
) {
  const totalStartedAt = performance.now();
  const authStartedAt = performance.now();
  const user = await requireUser();
  logStageChatTiming("send", "auth/session", authStartedAt);

  try {
    const comment = await createStageComment(user, input);
    if (options.revalidateProjectFlow) {
      const revalidateStartedAt = performance.now();
      revalidateProjectFlowAfterResponse();
      logStageChatTiming("send", "revalidate schedule", revalidateStartedAt);
    }

    const notificationScheduleStartedAt = performance.now();
    runNotificationTaskAfterResponse("comment-added", async () => {
      const notificationStartedAt = performance.now();
      await notifyCommentAdded({
        actorId: user.id,
        actorName: getUserDisplayName(user),
        projectId: input.projectId,
        stageId: input.stageId,
        commentId: comment.id,
        excludedRecipientUserIds: comment.mentions.map(
          (mention) => mention.mentionedUserId,
        ),
      });
      logStageChatTiming("send", "notification creation comment-added", notificationStartedAt);
    });
    runNotificationTaskAfterResponse("comment-mentioned", async () => {
      const notificationStartedAt = performance.now();
      await notifyCommentMentioned({
        actorId: user.id,
        actorName: getUserDisplayName(user),
        projectId: input.projectId,
        stageId: input.stageId,
        commentId: comment.id,
        mentionedUserIds: comment.mentions.map((mention) => mention.mentionedUserId),
      });
      logStageChatTiming(
        "send",
        "notification creation comment-mentioned",
        notificationStartedAt,
      );
    });
    logStageChatTiming("send", "notification scheduling", notificationScheduleStartedAt, {
      mentionedUsers: comment.mentions.length,
    });
    logStageChatTiming("send", "total send action response", totalStartedAt, {
      commentId: comment.id,
      revalidated: options.revalidateProjectFlow,
    });

    return {
      commentId: comment.id,
      revisionId: comment.revisionId,
      createdAt: comment.createdAt.toISOString(),
      mentionedUserIds: comment.mentions.map((mention) => mention.mentionedUserId),
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Unable to add the comment right now.",
    };
  }
}

export async function createStageCommentAction(input: StageCommentInput) {
  return createStageCommentActionResult(input, {
    revalidateProjectFlow: true,
  });
}

export async function createStageTextCommentAction(input: StageCommentInput) {
  return createStageCommentActionResult(input, {
    revalidateProjectFlow: false,
  });
}

export async function deleteStageCommentAction(input: DeleteStageCommentInput) {
  const user = await requireUser();

  try {
    const result = await deleteStageComment(user, input);
    revalidateProjectFlowAfterResponse();
    runStageChatRealtimeTaskAfterResponse("stage-chat.message.deleted", () =>
      publishStageChatMessageDeleted({
        eventId: randomUUID(),
        projectId: result.projectId,
        stageId: result.stageId,
        id: result.id,
        commentId: result.id,
        deletedAt: result.deletedAt.toISOString(),
        deletedByUserId: result.deletedByUserId,
        body: "This message was deleted",
        attachments: [],
        mentions: [],
      }),
    );

    return {
      id: result.id,
      deletedAt: result.deletedAt.toISOString(),
      deletedByUserId: result.deletedByUserId,
      displayText: result.displayText,
    };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Unable to delete the message right now.",
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

    await runNotificationTask("stage-transition", () =>
      notifyStageTransition({
        projectId: input.projectId,
        completedStageId: input.stageId,
        nextStageId: stage.nextStage?.id ?? null,
        actorId: user.id,
      }),
    );

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

    await runNotificationTask("brief-accepted", () =>
      notifyBriefAccepted({
        actorId: user.id,
        actorName: getUserDisplayName(user),
        projectId: input.projectId,
        stageId: input.stageId,
      }),
    );

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

export async function requestStageInvoiceAction(input: StageInvoiceRequestInput) {
  const user = await requireUser();

  try {
    const request = await requestStageInvoice(user, input);
    revalidateProjectFlow();

    await runNotificationTask("stage-invoice-requested", () =>
      notifyStageInvoiceRequested({
        projectId: input.projectId,
        stageId: input.stageId,
        recipientUserId: request.requestedFromId,
      }),
    );

    return { request };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to request the invoice right now.",
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
          : "Unable to send the comparison message right now.",
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

    await runNotificationTask("submission-approved", () =>
      notifyStageSubmissionReviewDecision({
        attachmentId,
        status: SubmissionReviewStatus.APPROVED,
      }),
    );

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

    await runNotificationTask("submission-rejected", () =>
      notifyStageSubmissionReviewDecision({
        attachmentId,
        status: SubmissionReviewStatus.REJECTED,
      }),
    );

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

    await runNotificationTask("submission-completed", async () => {
      await notifySubmissionWorkflowDecision({
        projectId: input.projectId,
        stageId: input.stageId,
        status: "COMPLETED",
        actorId: user.id,
      });

      if (revision.stageCompletion) {
        await notifyStageTransition({
          projectId: input.projectId,
          completedStageId: input.stageId,
          nextStageId: revision.stageCompletion.nextStage?.id ?? null,
          actorId: user.id,
        });
      }
    });

    return { revision };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to approve the submission right now.",
    };
  }
}

export async function prepareProjectCompletionAction(input: {
  projectId: string;
  stageId: string;
}) {
  const user = await requireUser();

  try {
    const preparation = await getProjectArchivePreparation(user, input);
    return { preparation };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to prepare the archive files right now.",
    };
  }
}

export async function completeProjectArchiveAction(input: {
  projectId: string;
  stageId: string;
  archiveCategoryId?: string;
  files: Array<{
    sourceAttachmentId: string;
    finalArchiveFileName: string;
  }>;
}) {
  const user = await requireUser();

  try {
    const archive = await completeProjectArchive(user, input);
    revalidateProjectFlow();
    revalidateArchiveFlow(input.projectId, archive.archiveCategorySlug);

    await runNotificationTask("project-archived", () =>
      notifyProjectArchived({
        projectId: input.projectId,
        archiveId: archive.archiveId,
        actorId: user.id,
      }),
    );

    return { archive };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to complete and archive the project right now.",
    };
  }
}

export async function configureProjectCompletionWorkflowAction(input: {
  projectId: string;
  approvalRequired: boolean;
  copyrightRequired: boolean;
}) {
  const user = await requireUser();

  try {
    const workflow = await configureProjectCompletionWorkflow(user, input);
    revalidateProjectFlow();
    revalidateArchiveFlow(input.projectId);

    return { workflow };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to update the project completion checklist right now.",
    };
  }
}

export async function prepareAuthorityApprovalRequestAction(input: {
  projectId: string;
  contactUserId: string;
  selectedArchivedFileIds: string[];
  note?: string;
}) {
  const user = await requireUser();

  try {
    const workflow = await prepareAuthorityApprovalRequest(user, input);
    revalidateProjectFlow();
    revalidateArchiveFlow(input.projectId);

    await runNotificationTask("approval-required", () =>
      notifyApprovalRequired({
        projectId: input.projectId,
        actorId: user.id,
      }),
    );

    return { workflow };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to prepare the authority approval request right now.",
    };
  }
}

export async function prepareCopyrightTransferRequestAction(input: {
  projectId: string;
  contactUserId: string;
  note?: string;
}) {
  const user = await requireUser();

  try {
    const workflow = await prepareCopyrightTransferRequest(user, input);
    revalidateProjectFlow();
    revalidateArchiveFlow(input.projectId);

    await runNotificationTask("copyright-required", () =>
      notifyCopyrightTransferRequired({
        projectId: input.projectId,
        actorId: user.id,
      }),
    );

    return { workflow };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to prepare the copyright transfer request right now.",
    };
  }
}

export async function markProjectInvoiceNotRequiredAction(input: {
  projectId: string;
}) {
  const user = await requireUser();

  try {
    const workflow = await markProjectInvoiceNotRequired(user, input);
    revalidateProjectFlow();
    revalidateArchiveFlow(input.projectId);

    return { workflow };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to mark final invoice as not required right now.",
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

    await runNotificationTask("revision-requested", () =>
      notifySubmissionWorkflowDecision({
        projectId: input.projectId,
        stageId: input.stageId,
        status: "REVISION_REQUESTED",
        actorId: user.id,
      }),
    );

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
    id?: string;
    userId?: string;
    participantType?: ProjectCollaboratorParticipantType | null;
  }>,
) {
  const user = await requireUser();

  try {
    const previousCollaboratorIds = await getProjectCollaboratorUserIds(projectId);
    const updatedCollaborators = await updateProjectCollaborators(
      projectId,
      collaborators,
      user,
    );

    revalidateProjectFlow();
    revalidatePath(`/projects/${projectId}/edit`);

    const nextCollaboratorIds = updatedCollaborators.map((collaborator) => collaborator.id);

    await runNotificationTask("project-collaborators-updated", () =>
      notifyProjectAssignmentChanges({
        projectId,
        actorId: user.id,
        addedCollaboratorIds: nextCollaboratorIds.filter(
          (collaboratorId) => !previousCollaboratorIds.includes(collaboratorId),
        ),
        removedCollaboratorIds: previousCollaboratorIds.filter(
          (collaboratorId) => !nextCollaboratorIds.includes(collaboratorId),
        ),
      }),
    );

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
    const previousCollaboratorIds = await getProjectCollaboratorUserIds(projectId);
    const updatedCollaborators = await removeProjectCollaborator(
      user,
      projectId,
      collaboratorId,
    );

    revalidateProjectFlow();
    revalidatePath(`/projects/${projectId}/edit`);

    const nextCollaboratorIds = updatedCollaborators.map((collaborator) => collaborator.id);

    await runNotificationTask("project-collaborator-removed", () =>
      notifyProjectAssignmentChanges({
        projectId,
        actorId: user.id,
        addedCollaboratorIds: nextCollaboratorIds.filter(
          (candidateId) => !previousCollaboratorIds.includes(candidateId),
        ),
        removedCollaboratorIds: previousCollaboratorIds.filter(
          (candidateId) => !nextCollaboratorIds.includes(candidateId),
        ),
      }),
    );

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
