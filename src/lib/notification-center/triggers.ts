import {
  AttachmentAssetType,
} from "@prisma/client";
import { after } from "next/server";

import { prisma, withPrismaRetry } from "@/lib/prisma";

import {
  getCompletionWorkflowRecipientUserIds,
  dedupeRecipients,
  getProjectNotificationContext,
  getProjectParticipantUserIds,
  getVisibleStageEventRecipientUserIds,
} from "./recipients";
import { buildNotificationUrl, createNotificationsForUsers } from "./service";

type ActorInput = {
  actorId: string;
  actorName: string;
};

async function getProjectStageContext(projectId: string, stageId?: string | null) {
  return withPrismaRetry(() =>
    prisma.project.findUnique({
      where: {
        id: projectId,
      },
      select: {
        id: true,
        name: true,
        createdById: true,
        executorUserId: true,
        stages: stageId
          ? {
              where: {
                id: stageId,
              },
              select: {
                id: true,
                name: true,
              },
            }
          : false,
      },
    }),
  );
}

export async function runNotificationTask(
  label: string,
  task: () => Promise<void>,
) {
  try {
    await task();
  } catch (error) {
    console.error(`[notifications] ${label} failed`, error);
  }
}

export function runNotificationTaskAfterResponse(
  label: string,
  task: () => Promise<void>,
) {
  after(() => runNotificationTask(label, task));
}

export async function notifyProjectCreated(input: {
  projectId: string;
  actorId: string;
}) {
  const project = await getProjectNotificationContext(input.projectId);

  if (!project) {
    return;
  }

  if (project.executorUserId && project.executorUserId !== input.actorId) {
    await createNotificationsForUsers({
      recipientUserIds: [project.executorUserId],
      type: "PROJECT_ASSIGNED",
      title: "Project assigned to you",
      message: `You have been assigned as executor for ${project.name}.`,
      entityType: "PROJECT",
      entityId: project.id,
      projectId: project.id,
      url: buildNotificationUrl({
        kind: "project",
        projectId: project.id,
      }),
    });
  }

  const collaboratorIds = project.collaborators
    .map((collaborator) => collaborator.userId)
    .filter(
      (userId) => userId !== input.actorId && userId !== project.executorUserId,
    );

  await createNotificationsForUsers({
    recipientUserIds: collaboratorIds,
    type: "COLLABORATOR_ADDED",
    title: "Added to project",
    message: `You have been added to ${project.name}.`,
    entityType: "PROJECT",
    entityId: project.id,
    projectId: project.id,
    url: buildNotificationUrl({
      kind: "project",
      projectId: project.id,
    }),
  });
}

export async function notifyProjectAssignmentChanges(input: {
  projectId: string;
  actorId: string;
  previousExecutorUserId?: string | null;
  nextExecutorUserId?: string | null;
  addedCollaboratorIds?: string[];
  removedCollaboratorIds?: string[];
}) {
  const project = await getProjectNotificationContext(input.projectId);

  if (!project) {
    return;
  }

  if (
    input.nextExecutorUserId &&
    input.nextExecutorUserId !== input.previousExecutorUserId &&
    input.nextExecutorUserId !== input.actorId
  ) {
    await createNotificationsForUsers({
      recipientUserIds: [input.nextExecutorUserId],
      type: "PROJECT_ASSIGNED",
      title: "Project assigned to you",
      message: `You have been assigned as executor for ${project.name}.`,
      entityType: "PROJECT",
      entityId: project.id,
      projectId: project.id,
      url: buildNotificationUrl({
        kind: "project",
        projectId: project.id,
      }),
    });
  }

  const addedCollaboratorIds = (input.addedCollaboratorIds ?? []).filter(
    (userId) => userId !== input.actorId && userId !== input.nextExecutorUserId,
  );

  if (addedCollaboratorIds.length > 0) {
    await createNotificationsForUsers({
      recipientUserIds: addedCollaboratorIds,
      type: "COLLABORATOR_ADDED",
      title: "Added to project",
      message: `You have been added to ${project.name}.`,
      entityType: "PROJECT",
      entityId: project.id,
      projectId: project.id,
      url: buildNotificationUrl({
        kind: "project",
        projectId: project.id,
      }),
    });
  }

  if (
    (input.removedCollaboratorIds?.length ?? 0) > 0 &&
    project.createdById !== input.actorId
  ) {
    await createNotificationsForUsers({
      recipientUserIds: [project.createdById],
      type: "COLLABORATOR_REMOVED",
      title: "Collaborator removed",
      message: `A collaborator was removed from ${project.name}.`,
      entityType: "PROJECT",
      entityId: project.id,
      projectId: project.id,
      url: buildNotificationUrl({
        kind: "project",
        projectId: project.id,
      }),
    });
  }
}

export async function notifyBriefAccepted(
  input: ActorInput & {
    projectId: string;
    stageId: string;
  },
) {
  const project = await getProjectStageContext(input.projectId, input.stageId);
  const stage = project?.stages?.[0];

  if (!project || !stage || project.createdById === input.actorId) {
    return;
  }

  await createNotificationsForUsers({
    recipientUserIds: [project.createdById],
    type: "BRIEF_ACCEPTED",
    title: "Brief accepted",
    message: `${input.actorName} accepted the brief and started work on ${stage.name}.`,
    entityType: "STAGE",
    entityId: stage.id,
    projectId: project.id,
    stageId: stage.id,
    url: buildNotificationUrl({
      kind: "project-stage",
      projectId: project.id,
      stageId: stage.id,
    }),
  });
}

export async function notifyRevisionSubmitted(
  input: ActorInput & {
    projectId: string;
    stageId: string;
    revisionId: string;
  },
) {
  const revision = await withPrismaRetry(() =>
    prisma.projectRevision.findUnique({
      where: {
        id: input.revisionId,
      },
      select: {
        id: true,
        revisionNumber: true,
        stage: {
          select: {
            id: true,
            name: true,
          },
        },
        project: {
          select: {
            id: true,
            createdById: true,
          },
        },
      },
    }),
  );

  if (!revision || revision.project.createdById === input.actorId) {
    return;
  }

  await createNotificationsForUsers({
    recipientUserIds: [revision.project.createdById],
    type: "REVISION_SUBMITTED",
    title: "Work submitted for review",
    message: `${input.actorName} submitted Revision ${revision.revisionNumber} for ${revision.stage.name}.`,
    entityType: "REVISION",
    entityId: revision.id,
    projectId: revision.project.id,
    stageId: revision.stage.id,
    revisionId: revision.id,
    url: buildNotificationUrl({
      kind: "project-stage",
      projectId: revision.project.id,
      stageId: revision.stage.id,
    }),
  });
}

export async function notifyStageSubmissionReviewDecision(
  input: {
    attachmentId: string;
    status: "APPROVED" | "REJECTED";
  },
) {
  const attachment = await withPrismaRetry(() =>
    prisma.projectAttachment.findUnique({
      where: {
        id: input.attachmentId,
      },
      select: {
        id: true,
        stageId: true,
        project: {
          select: {
            id: true,
            executorUserId: true,
          },
        },
        stage: {
          select: {
            name: true,
          },
        },
      },
    }),
  );

  if (!attachment?.project.executorUserId || !attachment.stageId) {
    return;
  }

  await createNotificationsForUsers({
    recipientUserIds: [attachment.project.executorUserId],
    type:
      input.status === "APPROVED" ? "REVISION_APPROVED" : "REVISION_REJECTED",
    title:
      input.status === "APPROVED" ? "Revision approved" : "Revision rejected",
    message:
      input.status === "APPROVED"
        ? `Your latest submission for ${attachment.stage?.name ?? "this stage"} was approved.`
        : `Your latest submission for ${attachment.stage?.name ?? "this stage"} was rejected. Please review the feedback.`,
    entityType: "ATTACHMENT",
    entityId: attachment.id,
    projectId: attachment.project.id,
    stageId: attachment.stageId,
    attachmentId: attachment.id,
    url: buildNotificationUrl({
      kind: "project-stage",
      projectId: attachment.project.id,
      stageId: attachment.stageId,
    }),
  });
}

export async function notifySubmissionWorkflowDecision(input: {
  projectId: string;
  stageId: string;
  status: "COMPLETED" | "REVISION_REQUESTED";
  actorId: string;
}) {
  const project = await getProjectStageContext(input.projectId, input.stageId);
  const stage = project?.stages?.[0];

  if (!project || !stage || !project.executorUserId || project.executorUserId === input.actorId) {
    return;
  }

  await createNotificationsForUsers({
    recipientUserIds: [project.executorUserId],
    type:
      input.status === "COMPLETED"
        ? "SUBMISSION_COMPLETED"
        : "SUBMISSION_REVISION_REQUESTED",
    title:
      input.status === "COMPLETED"
        ? "Submission completed"
        : "Revision requested",
    message:
      input.status === "COMPLETED"
        ? `Your submission for ${stage.name} was marked complete.`
        : `Changes were requested for ${stage.name}.`,
    entityType: "STAGE",
    entityId: stage.id,
    projectId: project.id,
    stageId: stage.id,
    url: buildNotificationUrl({
      kind: "project-stage",
      projectId: project.id,
      stageId: stage.id,
    }),
  });
}

export async function notifyStageTransition(input: {
  projectId: string;
  completedStageId: string;
  nextStageId?: string | null;
  actorId: string;
}) {
  const project = await withPrismaRetry(() =>
    prisma.project.findUnique({
      where: {
        id: input.projectId,
      },
      select: {
        id: true,
        executorUserId: true,
        stages: {
          where: {
            id: {
              in: [input.completedStageId, input.nextStageId ?? ""].filter(Boolean),
            },
          },
          select: {
            id: true,
            name: true,
          },
        },
      },
    }),
  );

  if (!project) {
    return;
  }

  const completedStage = project.stages.find(
    (stage) => stage.id === input.completedStageId,
  );

  if (!completedStage) {
    return;
  }

  const stageRecipients = await getVisibleStageEventRecipientUserIds(
    project.id,
    new Date(),
    {
      excludeUserId: input.actorId,
    },
  );

  await createNotificationsForUsers({
    recipientUserIds: stageRecipients,
    type: "STAGE_COMPLETED",
    title: "Stage completed",
    message: `${completedStage.name} has been completed.`,
    entityType: "STAGE",
    entityId: completedStage.id,
    projectId: project.id,
    stageId: completedStage.id,
    url: buildNotificationUrl({
      kind: "project",
      projectId: project.id,
    }),
  });

  if (!input.nextStageId || !project.executorUserId || project.executorUserId === input.actorId) {
    return;
  }

  const nextStage = project.stages.find((stage) => stage.id === input.nextStageId);

  if (!nextStage) {
    return;
  }

  await createNotificationsForUsers({
    recipientUserIds: [project.executorUserId],
    type: "NEXT_STAGE_ACTIVATED",
    title: "Next stage activated",
    message: `${nextStage.name} is now ready to start.`,
    entityType: "STAGE",
    entityId: nextStage.id,
    projectId: project.id,
    stageId: nextStage.id,
    url: buildNotificationUrl({
      kind: "project-stage",
      projectId: project.id,
      stageId: nextStage.id,
    }),
  });
}

export async function notifyCommentAdded(
  input: ActorInput & {
    projectId: string;
    stageId: string;
    commentId: string;
    excludedRecipientUserIds?: string[];
  },
) {
  const project = await getProjectStageContext(input.projectId, input.stageId);
  const stage = project?.stages?.[0];

  if (!project || !stage) {
    return;
  }

  const recipients = await getVisibleStageEventRecipientUserIds(
    project.id,
    new Date(),
    {
      excludeUserId: input.actorId,
    },
  );
  const excludedRecipientUserIds = new Set(
    dedupeRecipients(input.excludedRecipientUserIds ?? []),
  );

  await createNotificationsForUsers({
    recipientUserIds: recipients.filter(
      (recipientUserId) => !excludedRecipientUserIds.has(recipientUserId),
    ),
    type: "COMMENT_ADDED",
    title: "New comment",
    message: `${input.actorName} commented on ${stage.name}.`,
    entityType: "COMMENT",
    entityId: input.commentId,
    projectId: project.id,
    stageId: stage.id,
    commentId: input.commentId,
    url: buildNotificationUrl({
      kind: "project-stage",
      projectId: project.id,
      stageId: stage.id,
    }),
  });
}

export async function notifyCommentMentioned(
  input: ActorInput & {
    projectId: string;
    stageId: string;
    commentId: string;
    mentionedUserIds: string[];
  },
) {
  const project = await getProjectStageContext(input.projectId, input.stageId);
  const stage = project?.stages?.[0];

  if (!project || !stage) {
    return;
  }

  const recipients = dedupeRecipients(input.mentionedUserIds).filter(
    (recipientUserId) => recipientUserId !== input.actorId,
  );

  await createNotificationsForUsers({
    recipientUserIds: recipients,
    type: "MENTION",
    title: "You were mentioned",
    message: `${input.actorName} mentioned you in ${project.name}.`,
    entityType: "COMMENT",
    entityId: input.commentId,
    projectId: project.id,
    stageId: stage.id,
    commentId: input.commentId,
    url: buildNotificationUrl({
      kind: "project-stage",
      projectId: project.id,
      stageId: stage.id,
    }),
  });
}

export async function notifyFileUploaded(
  input: ActorInput & {
    projectId: string;
    stageId?: string | null;
    attachmentId: string;
    assetType: AttachmentAssetType;
  },
) {
  if (
    input.assetType !== "COMMENT_ATTACHMENT" &&
    input.assetType !== "GENERAL_PROJECT_ASSET"
  ) {
    return;
  }

  const project = await getProjectStageContext(input.projectId, input.stageId ?? null);
  const stage = project?.stages?.[0] ?? null;

  if (!project) {
    return;
  }

  const recipients = input.stageId
    ? await getVisibleStageEventRecipientUserIds(project.id, new Date(), {
        excludeUserId: input.actorId,
      })
    : await getProjectParticipantUserIds(project.id, {
        excludeUserId: input.actorId,
      });

  await createNotificationsForUsers({
    recipientUserIds: recipients,
    type: "FILE_UPLOADED",
    title: "File uploaded",
    message: input.stageId && stage
      ? `${input.actorName} uploaded a file in ${stage.name}.`
      : `${input.actorName} uploaded a project file.`,
    entityType: "ATTACHMENT",
    entityId: input.attachmentId,
    projectId: project.id,
    stageId: input.stageId ?? undefined,
    attachmentId: input.attachmentId,
    url: input.stageId
      ? buildNotificationUrl({
          kind: "project-stage",
          projectId: project.id,
          stageId: input.stageId,
        })
      : buildNotificationUrl({
          kind: "project",
          projectId: project.id,
        }),
  });
}

export async function notifyProjectArchived(input: {
  projectId: string;
  archiveId: string;
  actorId: string;
}) {
  const project = await getProjectNotificationContext(input.projectId);

  if (!project) {
    return;
  }

  const recipients = await getProjectParticipantUserIds(project.id, {
    excludeUserId: input.actorId,
  });

  await createNotificationsForUsers({
    recipientUserIds: recipients,
    type: "PROJECT_ARCHIVED",
    title: "Project archived",
    message: `${project.name} has been completed and archived.`,
    entityType: "ARCHIVE",
    entityId: input.archiveId,
    projectId: project.id,
    archiveId: input.archiveId,
    url: buildNotificationUrl({
      kind: "project",
      projectId: project.id,
    }),
  });
}

export async function notifyApprovalRequired(input: {
  projectId: string;
  actorId: string;
}) {
  const project = await getProjectNotificationContext(input.projectId);

  if (!project || !project.executorUserId || project.executorUserId === input.actorId) {
    return;
  }

  await createNotificationsForUsers({
    recipientUserIds: [project.executorUserId],
    type: "APPROVAL_REQUIRED",
    title: "Approval required",
    message: `Authority approval is required for ${project.name}.`,
    entityType: "COMPLETION_WORKFLOW",
    projectId: project.id,
    url: buildNotificationUrl({
      kind: "project",
      projectId: project.id,
    }),
  });
}

export async function notifyApprovalProofUploaded(input: {
  projectId: string;
  actorId: string;
}) {
  const project = await getProjectNotificationContext(input.projectId);

  if (!project) {
    return;
  }

  const recipients = await getCompletionWorkflowRecipientUserIds(project.id, {
    excludeUserId: input.actorId,
  });

  await createNotificationsForUsers({
    recipientUserIds: recipients,
    type: "APPROVAL_PROOF_UPLOADED",
    title: "Approval proof uploaded",
    message: `Approval proof has been uploaded for ${project.name}.`,
    entityType: "COMPLETION_DOCUMENT",
    projectId: project.id,
    url: buildNotificationUrl({
      kind: "project",
      projectId: project.id,
    }),
  });
}

export async function notifyCopyrightTransferRequired(input: {
  projectId: string;
  actorId: string;
}) {
  const project = await getProjectNotificationContext(input.projectId);

  if (!project || !project.executorUserId || project.executorUserId === input.actorId) {
    return;
  }

  await createNotificationsForUsers({
    recipientUserIds: [project.executorUserId],
    type: "COPYRIGHT_TRANSFER_REQUIRED",
    title: "Copyright transfer required",
    message: `Copyright transfer is required for ${project.name}.`,
    entityType: "COMPLETION_WORKFLOW",
    projectId: project.id,
    url: buildNotificationUrl({
      kind: "project",
      projectId: project.id,
    }),
  });
}

export async function notifyCopyrightDocumentUploaded(input: {
  projectId: string;
  actorId: string;
}) {
  const project = await getProjectNotificationContext(input.projectId);

  if (!project) {
    return;
  }

  const recipients = await getCompletionWorkflowRecipientUserIds(project.id, {
    excludeUserId: input.actorId,
  });

  await createNotificationsForUsers({
    recipientUserIds: recipients,
    type: "COPYRIGHT_DOCUMENT_UPLOADED",
    title: "Copyright document uploaded",
    message: "Copyright transfer document has been uploaded.",
    entityType: "COMPLETION_DOCUMENT",
    projectId: project.id,
    url: buildNotificationUrl({
      kind: "project",
      projectId: project.id,
    }),
  });
}

export async function notifyInvoiceUploaded(input: {
  projectId: string;
  actorId: string;
}) {
  const project = await getProjectNotificationContext(input.projectId);

  if (!project || !project.createdById || project.createdById === input.actorId) {
    return;
  }

  await createNotificationsForUsers({
    recipientUserIds: [project.createdById],
    type: "INVOICE_UPLOADED",
    title: "Invoice uploaded",
    message: `Invoice has been uploaded for ${project.name}.`,
    entityType: "COMPLETION_DOCUMENT",
    projectId: project.id,
    url: buildNotificationUrl({
      kind: "project",
      projectId: project.id,
    }),
  });
}
