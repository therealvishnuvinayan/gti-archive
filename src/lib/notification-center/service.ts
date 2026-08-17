import {
  Prisma,
  ProductionHandoverDeliveryStatus,
  ProjectWorkflowStageKey,
  type NotificationType,
} from "@prisma/client";

import type {
  NotificationListResponse,
  NotificationRecentResponse,
  NotificationStatusFilter,
  NotificationTypeFilter,
} from "@/lib/notifications";
import { prisma, withPrismaRetry } from "@/lib/prisma";
import { publishNotificationChanges } from "@/lib/realtime/server";

import {
  buildNotificationCounts,
  mapNotificationToView,
  mapTypeFilterToNotificationTypes,
  workflowNotificationTypes,
} from "./presenter";
import type {
  CreateNotificationInput,
  CreateNotificationsForUsersInput,
  GetNotificationsForUserInput,
  NotificationUrlInput,
} from "./types";

const DEFAULT_RECENT_LIMIT = 5;

type NotificationDestinationRecord = {
  id: string;
  type: NotificationType;
  title: string;
  entityId: string | null;
  projectId: string | null;
  stageId: string | null;
  url: string | null;
};

function isProjectAssignmentNotification(item: NotificationDestinationRecord) {
  return (
    item.type === "PROJECT_ASSIGNED" ||
    item.type === "COLLABORATOR_ADDED" ||
    (item.type === "PROJECT_CREATED" && item.title === "Project assigned to you")
  );
}

async function resolveNotificationDestinations<
  T extends NotificationDestinationRecord,
>(items: T[]) {
  const assignmentResolvedItems = items.map((item) =>
    item.projectId && isProjectAssignmentNotification(item)
      ? {
          ...item,
          url: buildNotificationUrl({
            kind: "project-chat",
            projectId: item.projectId,
          }),
        }
      : item,
  );
  const taskerStageIds = Array.from(
    new Set(
      assignmentResolvedItems
        .map((item) => item.stageId)
        .filter((stageId): stageId is string => Boolean(stageId)),
    ),
  );
  const handoverProductionUnitIds = Array.from(
    new Set(
      assignmentResolvedItems
        .filter((item) => item.type === "PRODUCTION_HANDOVER_COMPLETED")
        .map((item) => item.entityId)
        .filter((entityId): entityId is string => Boolean(entityId)),
    ),
  );

  if (taskerStageIds.length === 0 && handoverProductionUnitIds.length === 0) {
    return assignmentResolvedItems;
  }

  const [conceptFolders, handovers] = await withPrismaRetry(() =>
    Promise.all([
      taskerStageIds.length
        ? prisma.projectConceptFolder.findMany({
            where: { taskerStageId: { in: taskerStageIds } },
            select: {
              id: true,
              projectId: true,
              taskerStageId: true,
              workflowStageKey: true,
            },
          })
        : Promise.resolve([]),
      handoverProductionUnitIds.length
        ? prisma.projectProductionHandover.findMany({
            where: {
              productionUnitId: { in: handoverProductionUnitIds },
              deliveryStatus: ProductionHandoverDeliveryStatus.SENT,
            },
            select: { id: true, productionUnitId: true },
          })
        : Promise.resolve([]),
    ]),
  );
  const conceptRouteByStageId = new Map(
    conceptFolders.map((folder) => {
      const stageNumber =
        folder.workflowStageKey === ProjectWorkflowStageKey.CONCEPT_CREATION ? 3 : 4;
      return [
        folder.taskerStageId,
        {
          projectId: folder.projectId,
          url: `/projects/${encodeURIComponent(folder.projectId)}/stages/${stageNumber}/concepts/${encodeURIComponent(folder.id)}`,
        },
      ];
    }),
  );
  const handoverRouteByProductionUnitId = new Map(
    handovers.map((handover) => [
      handover.productionUnitId,
      `/production-handovers/${encodeURIComponent(handover.id)}`,
    ]),
  );

  return assignmentResolvedItems.map((item) => {
    const handoverRoute =
      item.type === "PRODUCTION_HANDOVER_COMPLETED" && item.entityId
        ? handoverRouteByProductionUnitId.get(item.entityId)
        : undefined;
    if (handoverRoute) {
      return { ...item, url: handoverRoute };
    }
    const conceptRoute = item.stageId
      ? conceptRouteByStageId.get(item.stageId)
      : undefined;
    return conceptRoute && item.projectId === conceptRoute.projectId
      ? { ...item, url: conceptRoute.url }
      : item;
  });
}

function clampPage(value: number | undefined) {
  if (!Number.isFinite(value) || !value || value < 1) {
    return 1;
  }

  return Math.floor(value);
}

function clampPageSize(value: number | undefined) {
  if (!Number.isFinite(value) || !value || value < 1) {
    return 8;
  }

  return Math.min(50, Math.floor(value));
}

function buildNotificationWhere(input: {
  userId: string;
  status?: NotificationStatusFilter;
  type?: NotificationTypeFilter;
  query?: string;
}): Prisma.NotificationWhereInput {
  const clauses: Prisma.NotificationWhereInput[] = [{ userId: input.userId }];
  const typeFilter = mapTypeFilterToNotificationTypes(input.type ?? "All Types");
  const query = input.query?.trim();

  if (typeFilter) {
    clauses.push({
      type: {
        in: typeFilter,
      },
    });
  }

  switch (input.status) {
    case "unread":
      clauses.push({ isRead: false });
      break;
    case "read":
      clauses.push({ isRead: true });
      break;
    case "workflow":
      clauses.push({
        type: {
          in: [...workflowNotificationTypes],
        },
      });
      break;
    case "mentions":
      clauses.push({
        type: "MENTION",
      });
      break;
  }

  if (query) {
    clauses.push({
      OR: [
        {
          title: {
            contains: query,
            mode: "insensitive",
          },
        },
        {
          message: {
            contains: query,
            mode: "insensitive",
          },
        },
      ],
    });
  }

  return clauses.length === 1 ? clauses[0] : { AND: clauses };
}

export function buildNotificationUrl(input: NotificationUrlInput) {
  switch (input.kind) {
    case "project":
      return `/projects/${input.projectId}`;
    case "project-chat":
      return `/projects/${encodeURIComponent(input.projectId)}/chat`;
    case "project-stage":
      return `/projects/${input.projectId}/chat?stage=${input.stageId}`;
    case "archives":
      return input.categorySlug ? `/archives/${input.categorySlug}` : "/archives";
    case "notifications":
    default:
      return "/notifications";
  }
}

export async function createNotification(input: CreateNotificationInput) {
  const createdAt = new Date();

  const notification = await withPrismaRetry(() =>
    prisma.notification.create({
      data: {
        userId: input.recipientUserId,
        type: input.type,
        title: input.title,
        message: input.message,
        entityType: input.entityType,
        entityId: input.entityId,
        projectId: input.projectId,
        stageId: input.stageId,
        revisionId: input.revisionId,
        commentId: input.commentId,
        attachmentId: input.attachmentId,
        archiveId: input.archiveId,
        url: input.url?.trim() || null,
        createdAt,
        updatedAt: createdAt,
      },
    }),
  );

  await publishNotificationChanges({
    recipientUserIds: [input.recipientUserId],
    reason: "created",
  });

  return notification;
}

export async function createNotificationsForUsers(
  input: CreateNotificationsForUsersInput,
) {
  const recipientUserIds = Array.from(
    new Set(input.recipientUserIds.map((value) => value.trim()).filter(Boolean)),
  );

  if (recipientUserIds.length === 0) {
    return { count: 0 };
  }

  const createdAt = new Date();

  const result = await withPrismaRetry(() =>
    prisma.notification.createMany({
      data: recipientUserIds.map((recipientUserId) => ({
        userId: recipientUserId,
        type: input.type,
        title: input.title,
        message: input.message,
        entityType: input.entityType,
        entityId: input.entityId,
        projectId: input.projectId,
        stageId: input.stageId,
        revisionId: input.revisionId,
        commentId: input.commentId,
        attachmentId: input.attachmentId,
        archiveId: input.archiveId,
        url: input.url?.trim() || null,
        createdAt,
        updatedAt: createdAt,
      })),
    }),
  );

  await publishNotificationChanges({
    recipientUserIds,
    reason: "created",
  });

  return {
    count: result.count,
  };
}

export async function getUnreadNotificationCount(userId: string) {
  return withPrismaRetry(() =>
    prisma.notification.count({
      where: {
        userId,
        isRead: false,
      },
    }),
  );
}

export async function getRecentNotificationsForUser(
  userId: string,
  limit = DEFAULT_RECENT_LIMIT,
): Promise<NotificationRecentResponse> {
  const [items, unreadCount] = await withPrismaRetry(() =>
    prisma.$transaction([
      prisma.notification.findMany({
        where: {
          userId,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: Math.max(1, Math.min(limit, 20)),
        select: {
          id: true,
          type: true,
          title: true,
          message: true,
          url: true,
          entityId: true,
          projectId: true,
          stageId: true,
          isRead: true,
          createdAt: true,
        },
      }),
      prisma.notification.count({
        where: {
          userId,
          isRead: false,
        },
      }),
    ]),
  );
  const resolvedItems = await resolveNotificationDestinations(items);

  return {
    notifications: resolvedItems.map(mapNotificationToView),
    unreadCount,
  };
}

export async function getNotificationsForUser(
  input: GetNotificationsForUserInput,
): Promise<NotificationListResponse> {
  const page = clampPage(input.page);
  const pageSize = clampPageSize(input.pageSize);
  const where = buildNotificationWhere({
    userId: input.userId,
    status: input.status ?? "all",
    type: input.type ?? "All Types",
    query: input.query,
  });

  const [
    items,
    total,
    allCount,
    unreadCount,
    readCount,
    mentionCount,
    workflowCount,
  ] = await withPrismaRetry(() =>
    prisma.$transaction([
      prisma.notification.findMany({
        where,
        orderBy: {
          createdAt: "desc",
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({
        where: {
          userId: input.userId,
        },
      }),
      prisma.notification.count({
        where: {
          userId: input.userId,
          isRead: false,
        },
      }),
      prisma.notification.count({
        where: {
          userId: input.userId,
          isRead: true,
        },
      }),
      prisma.notification.count({
        where: {
          userId: input.userId,
          type: "MENTION",
        },
      }),
      prisma.notification.count({
        where: {
          userId: input.userId,
          type: {
            in: [...workflowNotificationTypes],
          },
        },
      }),
    ]),
  );

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const resolvedItems = await resolveNotificationDestinations(items);

  return {
    notifications: resolvedItems.map(mapNotificationToView),
    unreadCount,
    counts: buildNotificationCounts({
      all: allCount,
      unread: unreadCount,
      read: readCount,
      mentions: mentionCount,
      workflow: workflowCount,
    }),
    page,
    pageSize,
    total,
    totalPages,
  };
}

async function updateNotificationReadState(
  notificationId: string,
  userId: string,
  isRead: boolean,
) {
  const result = await withPrismaRetry(() =>
    prisma.notification.updateMany({
      where: {
        id: notificationId,
        userId,
      },
      data: {
        isRead,
        readAt: isRead ? new Date() : null,
      },
    }),
  );

  if (result.count === 0) {
    throw new Error("Notification not found.");
  }

  await publishNotificationChanges({
    recipientUserIds: [userId],
    reason: "read-state-updated",
  });

  return {
    unreadCount: await getUnreadNotificationCount(userId),
  };
}

export async function markNotificationAsRead(notificationId: string, userId: string) {
  return updateNotificationReadState(notificationId, userId, true);
}

export async function markNotificationAsUnread(notificationId: string, userId: string) {
  return updateNotificationReadState(notificationId, userId, false);
}

export async function markAllNotificationsAsRead(userId: string) {
  await withPrismaRetry(() =>
    prisma.notification.updateMany({
      where: {
        userId,
        isRead: false,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    }),
  );

  await publishNotificationChanges({
    recipientUserIds: [userId],
    reason: "read-state-updated",
  });

  return {
    unreadCount: 0,
  };
}
