import { Prisma } from "@prisma/client";

import type {
  NotificationListResponse,
  NotificationRecentResponse,
  NotificationStatusFilter,
  NotificationTypeFilter,
} from "@/lib/notifications";
import { prisma, withPrismaRetry } from "@/lib/prisma";

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

  return withPrismaRetry(() =>
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

  return {
    notifications: items.map(mapNotificationToView),
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

  return {
    notifications: items.map(mapNotificationToView),
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

  return {
    unreadCount: 0,
  };
}
