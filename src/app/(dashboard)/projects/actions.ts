"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath, revalidateTag } from "next/cache";
import { after } from "next/server";

import { getUserDisplayName, requireUser } from "@/lib/auth";
import {
  completeProjectArchive,
  getProjectArchivePreparation,
  type ArchiveArtworkMetadataDraft,
} from "@/lib/archives";
import { createComparisonComment } from "@/lib/comparison";
import {
  getProjectCollaboratorUserIds,
  notifyApprovalRequired,
  notifyBriefAccepted,
  notifyCommentAdded,
  notifyCommentMentioned,
  notifyCopyrightTransferRequired,
  notifyFinalInvoiceRequested,
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
  requestProjectFinalInvoice,
} from "@/lib/project-completion";
import {
  cancelStageRevisionSubmission,
  cancelStagedConceptRevisionAttachments,
  createStageComment,
  createStageRevision,
  deleteStageComment,
  completeProjectStage,
  getStageChatCommentEntryForUser,
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
  publishProjectAccessRevoked,
  publishStageChatMessageCreated,
  publishStageChatMessageDeleted,
  publishStageChatTimelineUpdated,
  publishStageChatTimelineUpdatedAfterResponse,
  runStageChatRealtimeTaskAfterResponse,
} from "@/lib/realtime/server";
import type { StageChatRealtimeTimelineUpdatedPayload } from "@/lib/realtime/events";
import { logStageChatTiming } from "@/lib/stage-chat-timing";
import {
  ProjectWorkflowStageKey,
  ProjectWorkflowStageStatus,
  SubmissionReviewStatus,
} from "@prisma/client";
import type { ProjectCollaboratorParticipantType } from "@/lib/project-collaborator-participant-types";
import type { ProjectCollaboratorPermissions } from "@/lib/project-collaborator-permissions";
import { isProjectStatusCompleted } from "@/lib/project-statuses";

type StageRevisionInput = {
  projectId: string;
  stageId: string;
  summary?: string;
  attachmentIds?: string[];
};

type StageCommentInput = {
  projectId: string;
  stageId: string;
  revisionId?: string | null;
  body: string;
  allowEmptyBody?: boolean;
  mentionedUserIds?: string[];
};

function publishProjectAccessRevocation(input: {
  projectId: string;
  actorId: string;
  targetUserIds: string[];
  reason: "collaborator_removed" | "visibility_paused";
}) {
  const targetUserIds = [...new Set(input.targetUserIds.filter(Boolean))];

  if (targetUserIds.length === 0) {
    return;
  }

  runStageChatRealtimeTaskAfterResponse("project-access.revoked", () =>
    publishProjectAccessRevoked({
      eventId: randomUUID(),
      projectId: input.projectId,
      targetUserIds,
      actorId: input.actorId,
      revokedAt: new Date().toISOString(),
      reason: input.reason,
    }),
  );
}

function publishStageChatTimelineInvalidation(input: {
  projectId: string;
  stageId: string;
  actorId?: string | null;
  eventType: StageChatRealtimeTimelineUpdatedPayload["eventType"];
  changedEntityId?: string | null;
}) {
  publishStageChatTimelineUpdatedAfterResponse(input);
}

function publishProjectStageTimelineInvalidation(input: {
  projectId: string;
  actorId?: string | null;
  eventType: StageChatRealtimeTimelineUpdatedPayload["eventType"];
  changedEntityId?: string | null;
}) {
  runStageChatRealtimeTaskAfterResponse(
    `stage-chat.timeline.updated:${input.eventType}`,
    async () => {
      const stages = await prisma.projectStage.findMany({
        where: {
          projectId: input.projectId,
        },
        select: {
          id: true,
        },
      });

      await Promise.all(
        stages.map((stage) =>
          publishStageChatTimelineUpdated({
            eventId: randomUUID(),
            projectId: input.projectId,
            stageId: stage.id,
            eventType: input.eventType,
            changedEntityId: input.changedEntityId ?? null,
            actorId: input.actorId ?? null,
            updatedAt: new Date().toISOString(),
          }),
        ),
      );
    },
  );
}

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
  opacity?: number | null;
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
      ownerId: true,
      coOwners: { select: { userId: true } },
      executors: {
        select: {
          userId: true,
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

export async function deleteProjectAction(projectId: string) {
  const user = await requireUser();
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      completedAt: true,
      closure: { select: { id: true } },
      workflowStages: {
        where: {
          stageKey: ProjectWorkflowStageKey.IMPLEMENTATION_AND_SUPERVISION,
          status: ProjectWorkflowStageStatus.COMPLETED,
        },
        select: { id: true },
      },
      status: {
        select: {
          id: true,
          name: true,
          slug: true,
          color: true,
          group: {
            select: {
              id: true,
              name: true,
              slug: true,
              color: true,
              isActive: true,
            },
          },
        },
      },
      ownerId: true,
      coOwners: { select: { userId: true } },
      executors: { select: { userId: true } },
      collaborators: { select: { userId: true } },
      stages: { select: { id: true } },
    },
  });

  if (!project) throw new Error("Project not found.");

  if (!hasProjectPermission(user, project, "project.delete")) {
    throw new Error("You are not allowed to delete projects.");
  }

  if (
    project.completedAt ||
    project.closure ||
    project.workflowStages.length > 0 ||
    isProjectStatusCompleted(project.status)
  ) {
    throw new Error("Completed projects cannot be deleted.");
  }

  const stageIds = project.stages.map((stage) => stage.id);

  await prisma.$transaction([
    prisma.notification.deleteMany({
      where: {
        OR: [
          { projectId },
          ...(stageIds.length > 0 ? [{ stageId: { in: stageIds } }] : []),
        ],
      },
    }),
    prisma.project.delete({ where: { id: projectId } }),
  ]);

  revalidatePath("/");
  revalidatePath("/notifications");
  revalidatePath("/projects");
  revalidatePath(`/projects/${projectId}`);
  revalidateTag(PROJECTS_CACHE_TAG, "max");
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
    publishStageChatTimelineInvalidation({
      projectId: input.projectId,
      stageId: input.stageId,
      actorId: user.id,
      eventType: "revision_created",
      changedEntityId: revision.id,
    });

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
    publishStageChatTimelineInvalidation({
      projectId: input.projectId,
      stageId: input.stageId,
      actorId: user.id,
      eventType: "timeline_updated",
      changedEntityId: input.revisionId,
    });

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

export async function cancelStagedConceptRevisionAttachmentsAction(input: {
  projectId: string;
  stageId: string;
  attachmentIds: string[];
}) {
  const user = await requireUser();

  try {
    const result = await cancelStagedConceptRevisionAttachments(user, input);
    revalidateProjectFlow();
    return { success: true, count: result.count };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to clean up the staged concept files right now.",
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
    publishStageChatTimelineInvalidation({
      projectId: input.projectId,
      stageId: input.stageId,
      actorId: user.id,
      eventType: "message_created",
      changedEntityId: comment.id,
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
    publishStageChatTimelineInvalidation({
      projectId: result.projectId,
      stageId: result.stageId,
      actorId: user.id,
      eventType: "message_deleted",
      changedEntityId: result.id,
    });

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
    publishStageChatTimelineInvalidation({
      projectId: input.projectId,
      stageId: input.stageId,
      actorId: user.id,
      eventType: "stage_status_changed",
      changedEntityId: stage.id,
    });
    if (stage.nextStage?.id) {
      publishStageChatTimelineInvalidation({
        projectId: input.projectId,
        stageId: stage.nextStage.id,
        actorId: user.id,
        eventType: "stage_status_changed",
        changedEntityId: stage.nextStage.id,
      });
    }
    if (stage.allStagesCompleted) {
      publishProjectStageTimelineInvalidation({
        projectId: input.projectId,
        actorId: user.id,
        eventType: "completion_updated",
        changedEntityId: input.projectId,
      });
    }

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
    runStageChatRealtimeTaskAfterResponse("stage-chat.brief-accepted", async () => {
      const realtimeEntry = await getStageChatCommentEntryForUser(user, {
        projectId: input.projectId,
        stageId: input.stageId,
        commentId: result.activityComment.id,
      });

      if (!realtimeEntry) {
        return;
      }

      await publishStageChatMessageCreated({
        eventId: randomUUID(),
        projectId: input.projectId,
        stageId: input.stageId,
        id: realtimeEntry.entry.id,
        commentId: result.activityComment.id,
        senderId: realtimeEntry.authorId,
        entry: realtimeEntry.entry,
        createdAt: realtimeEntry.createdAt,
        deletedAt: null,
        clientTempId: null,
      });
    });
    publishStageChatTimelineInvalidation({
      projectId: input.projectId,
      stageId: input.stageId,
      actorId: user.id,
      eventType: "brief_accepted",
      changedEntityId: result.activityComment.id,
    });

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
    runStageChatRealtimeTaskAfterResponse("stage-chat.invoice-requested", async () => {
      const realtimeEntry = await getStageChatCommentEntryForUser(user, {
        projectId: input.projectId,
        stageId: input.stageId,
        commentId: request.commentId,
      });

      if (!realtimeEntry) {
        return;
      }

      await publishStageChatMessageCreated({
        eventId: randomUUID(),
        projectId: input.projectId,
        stageId: input.stageId,
        id: realtimeEntry.entry.id,
        commentId: request.commentId,
        senderId: realtimeEntry.authorId,
        entry: realtimeEntry.entry,
        createdAt: realtimeEntry.createdAt,
        deletedAt: null,
        clientTempId: null,
      });
    });
    publishStageChatTimelineInvalidation({
      projectId: input.projectId,
      stageId: input.stageId,
      actorId: user.id,
      eventType: "invoice_requested",
      changedEntityId: request.commentId,
    });

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
    publishStageChatTimelineInvalidation({
      projectId: input.projectId,
      stageId: input.stageId,
      actorId: user.id,
      eventType: "comparison_created",
      changedEntityId: comment.id,
    });

    return { comment };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to save the caption right now.",
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
    const reviewedAttachment = await prisma.projectAttachment.findUnique({
      where: {
        id: attachmentId,
      },
      select: {
        projectId: true,
        stageId: true,
      },
    });
    if (reviewedAttachment?.stageId) {
      publishStageChatTimelineInvalidation({
        projectId: reviewedAttachment.projectId,
        stageId: reviewedAttachment.stageId,
        actorId: user.id,
        eventType: "revision_reviewed",
        changedEntityId: attachmentId,
      });
    }

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
    const reviewedAttachment = await prisma.projectAttachment.findUnique({
      where: {
        id: attachmentId,
      },
      select: {
        projectId: true,
        stageId: true,
      },
    });
    if (reviewedAttachment?.stageId) {
      publishStageChatTimelineInvalidation({
        projectId: reviewedAttachment.projectId,
        stageId: reviewedAttachment.stageId,
        actorId: user.id,
        eventType: "revision_reviewed",
        changedEntityId: attachmentId,
      });
    }

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
    publishStageChatTimelineInvalidation({
      projectId: input.projectId,
      stageId: input.stageId,
      actorId: user.id,
      eventType: "revision_reviewed",
      changedEntityId: input.revisionId,
    });
    if (revision.stageCompletion) {
      publishStageChatTimelineInvalidation({
        projectId: input.projectId,
        stageId: input.stageId,
        actorId: user.id,
        eventType: "stage_status_changed",
        changedEntityId: revision.stageCompletion.id,
      });
      if (revision.stageCompletion.nextStage?.id) {
        publishStageChatTimelineInvalidation({
          projectId: input.projectId,
          stageId: revision.stageCompletion.nextStage.id,
          actorId: user.id,
          eventType: "stage_status_changed",
          changedEntityId: revision.stageCompletion.nextStage.id,
        });
      }
      if (revision.stageCompletion.allStagesCompleted) {
        publishProjectStageTimelineInvalidation({
          projectId: input.projectId,
          actorId: user.id,
          eventType: "completion_updated",
          changedEntityId: input.projectId,
        });
      }
    }

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
    artworkMetadata: ArchiveArtworkMetadataDraft;
  }>;
}) {
  const user = await requireUser();

  try {
    const archive = await completeProjectArchive(user, input);
    revalidateProjectFlow();
    revalidateArchiveFlow(input.projectId, archive.archiveCategorySlug);
    publishStageChatTimelineInvalidation({
      projectId: input.projectId,
      stageId: input.stageId,
      actorId: user.id,
      eventType: "completion_updated",
      changedEntityId: archive.archiveId,
    });

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
  invoiceRequired: boolean;
}) {
  const user = await requireUser();

  try {
    const workflow = await configureProjectCompletionWorkflow(user, input);
    revalidateProjectFlow();
    revalidateArchiveFlow(input.projectId);
    publishProjectStageTimelineInvalidation({
      projectId: input.projectId,
      actorId: user.id,
      eventType: "completion_updated",
      changedEntityId: input.projectId,
    });

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
  selectedProjectFileIds: string[];
  note?: string;
}) {
  const user = await requireUser();

  try {
    const workflow = await prepareAuthorityApprovalRequest(user, input);
    revalidateProjectFlow();
    revalidateArchiveFlow(input.projectId);
    publishProjectStageTimelineInvalidation({
      projectId: input.projectId,
      actorId: user.id,
      eventType: "completion_updated",
      changedEntityId: input.projectId,
    });

    await runNotificationTask("approval-required", () =>
      notifyApprovalRequired({
        projectId: input.projectId,
        actorId: user.id,
        recipientUserId: input.contactUserId,
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
    publishProjectStageTimelineInvalidation({
      projectId: input.projectId,
      actorId: user.id,
      eventType: "completion_updated",
      changedEntityId: input.projectId,
    });

    await runNotificationTask("copyright-required", () =>
      notifyCopyrightTransferRequired({
        projectId: input.projectId,
        actorId: user.id,
        recipientUserId: input.contactUserId,
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

export async function requestProjectFinalInvoiceAction(input: {
  projectId: string;
  contactUserId: string;
  note?: string;
}) {
  const user = await requireUser();

  try {
    const workflow = await requestProjectFinalInvoice(user, input);
    revalidateProjectFlow();
    revalidateArchiveFlow(input.projectId);
    publishProjectStageTimelineInvalidation({
      projectId: input.projectId,
      actorId: user.id,
      eventType: "completion_updated",
      changedEntityId: input.projectId,
    });

    await runNotificationTask("final-invoice-requested", () =>
      notifyFinalInvoiceRequested({
        projectId: input.projectId,
        recipientUserId: input.contactUserId,
      }),
    );

    return { workflow };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to request the final invoice right now.",
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
    publishProjectStageTimelineInvalidation({
      projectId: input.projectId,
      actorId: user.id,
      eventType: "completion_updated",
      changedEntityId: input.projectId,
    });

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
    publishStageChatTimelineInvalidation({
      projectId: input.projectId,
      stageId: input.stageId,
      actorId: user.id,
      eventType: "revision_reviewed",
      changedEntityId: input.revisionId,
    });

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
  } & Partial<ProjectCollaboratorPermissions>>,
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

    const nextCollaboratorIds = updatedCollaborators.map((collaborator) => collaborator.id);
    const removedCollaboratorIds = previousCollaboratorIds.filter(
      (collaboratorId) => !nextCollaboratorIds.includes(collaboratorId),
    );

    await runNotificationTask("project-collaborators-updated", () =>
      notifyProjectAssignmentChanges({
        projectId,
        actorId: user.id,
        addedCollaboratorIds: nextCollaboratorIds.filter(
          (collaboratorId) => !previousCollaboratorIds.includes(collaboratorId),
        ),
        removedCollaboratorIds,
      }),
    );
    publishProjectAccessRevocation({
      projectId,
      actorId: user.id,
      targetUserIds: removedCollaboratorIds,
      reason: "collaborator_removed",
    });
    publishProjectStageTimelineInvalidation({
      projectId,
      actorId: user.id,
      eventType: "participant_access_changed",
      changedEntityId: projectId,
    });

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

    const nextCollaboratorIds = updatedCollaborators.map((collaborator) => collaborator.id);
    const removedCollaboratorIds = previousCollaboratorIds.filter(
      (candidateId) => !nextCollaboratorIds.includes(candidateId),
    );

    await runNotificationTask("project-collaborator-removed", () =>
      notifyProjectAssignmentChanges({
        projectId,
        actorId: user.id,
        addedCollaboratorIds: nextCollaboratorIds.filter(
          (candidateId) => !previousCollaboratorIds.includes(candidateId),
        ),
        removedCollaboratorIds,
      }),
    );
    publishProjectAccessRevocation({
      projectId,
      actorId: user.id,
      targetUserIds: removedCollaboratorIds.length > 0 ? removedCollaboratorIds : [collaboratorId],
      reason: "collaborator_removed",
    });
    publishProjectStageTimelineInvalidation({
      projectId,
      actorId: user.id,
      eventType: "participant_access_changed",
      changedEntityId: collaboratorId,
    });

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

    if (input.paused) {
      publishProjectAccessRevocation({
        projectId: input.projectId,
        actorId: user.id,
        targetUserIds: [input.collaboratorId],
        reason: "visibility_paused",
      });
    }
    publishProjectStageTimelineInvalidation({
      projectId: input.projectId,
      actorId: user.id,
      eventType: "participant_access_changed",
      changedEntityId: input.collaboratorId,
    });

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
