import { withPrismaRetry, prisma } from "@/lib/prisma";
import { isTimestampHiddenByPauseWindows } from "@/lib/project-collaborator-visibility";

type ProjectNotificationContext = {
  id: string;
  name: string;
  createdById: string;
  executorUserId: string | null;
  collaborators: Array<{
    userId: string;
    chatVisibilityPaused: boolean;
    visibilityPauses: Array<{
      pausedAt: Date;
      resumedAt: Date | null;
    }>;
  }>;
};

export async function getProjectNotificationContext(projectId: string) {
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
        collaborators: {
          select: {
            userId: true,
            chatVisibilityPaused: true,
            visibilityPauses: {
              orderBy: {
                pausedAt: "asc",
              },
              select: {
                pausedAt: true,
                resumedAt: true,
              },
            },
          },
        },
      },
    }),
  ) as Promise<ProjectNotificationContext | null>;
}

export function excludeActor(recipientUserIds: string[], actorId?: string | null) {
  return recipientUserIds.filter((recipientUserId) => recipientUserId !== actorId);
}

export function dedupeRecipients(recipientUserIds: Array<string | null | undefined>) {
  return Array.from(
    new Set(recipientUserIds.map((value) => value?.trim()).filter(Boolean) as string[]),
  );
}

export async function getProjectOwnerId(projectId: string) {
  const project = await withPrismaRetry(() =>
    prisma.project.findUnique({
      where: {
        id: projectId,
      },
      select: {
        createdById: true,
      },
    }),
  );

  return project?.createdById ?? null;
}

export async function getProjectExecutorId(projectId: string) {
  const project = await withPrismaRetry(() =>
    prisma.project.findUnique({
      where: {
        id: projectId,
      },
      select: {
        executorUserId: true,
      },
    }),
  );

  return project?.executorUserId ?? null;
}

export async function getProjectCollaboratorUserIds(projectId: string) {
  const project = await getProjectNotificationContext(projectId);

  return project?.collaborators.map((collaborator) => collaborator.userId) ?? [];
}

export async function getProjectParticipantUserIds(
  projectId: string,
  options: {
    excludeUserId?: string | null;
    includeOwner?: boolean;
    includeExecutor?: boolean;
    includeCollaborators?: boolean;
  } = {},
) {
  const project = await getProjectNotificationContext(projectId);

  if (!project) {
    return [];
  }

  const recipients = dedupeRecipients([
    options.includeOwner === false ? null : project.createdById,
    options.includeExecutor === false ? null : project.executorUserId,
    ...(options.includeCollaborators === false
      ? []
      : project.collaborators.map((collaborator) => collaborator.userId)),
  ]);

  return excludeActor(recipients, options.excludeUserId);
}

export async function filterRecipientsVisibleForStageEvent(
  projectId: string,
  recipientUserIds: string[],
  eventCreatedAt: Date,
) {
  const project = await getProjectNotificationContext(projectId);

  if (!project) {
    return [];
  }

  const collaboratorMap = new Map(
    project.collaborators.map((collaborator) => [collaborator.userId, collaborator] as const),
  );

  return recipientUserIds.filter((recipientUserId) => {
    if (recipientUserId === project.createdById || recipientUserId === project.executorUserId) {
      return true;
    }

    const collaborator = collaboratorMap.get(recipientUserId);

    if (!collaborator) {
      return false;
    }

    if (collaborator.chatVisibilityPaused && collaborator.visibilityPauses.length === 0) {
      return false;
    }

    return !isTimestampHiddenByPauseWindows(eventCreatedAt, collaborator.visibilityPauses);
  });
}

export async function getVisibleStageEventRecipientUserIds(
  projectId: string,
  eventCreatedAt: Date,
  options: {
    excludeUserId?: string | null;
    includeOwner?: boolean;
    includeExecutor?: boolean;
    includeCollaborators?: boolean;
  } = {},
) {
  const recipientUserIds = await getProjectParticipantUserIds(projectId, options);
  return filterRecipientsVisibleForStageEvent(projectId, recipientUserIds, eventCreatedAt);
}

export async function getCompletionWorkflowRecipientUserIds(
  projectId: string,
  options: {
    excludeUserId?: string | null;
    includeOwner?: boolean;
    includeExecutor?: boolean;
  } = {},
) {
  return getProjectParticipantUserIds(projectId, {
    excludeUserId: options.excludeUserId,
    includeOwner: options.includeOwner,
    includeExecutor: options.includeExecutor,
    includeCollaborators: false,
  });
}
