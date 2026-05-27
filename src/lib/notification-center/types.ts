import type {
  NotificationEntityType,
  NotificationType,
} from "@prisma/client";

import type {
  NotificationStatusFilter,
  NotificationTypeFilter,
} from "@/lib/notifications";

export type CreateNotificationInput = {
  recipientUserId: string;
  type: NotificationType;
  title: string;
  message: string;
  entityType?: NotificationEntityType;
  entityId?: string;
  projectId?: string;
  stageId?: string;
  revisionId?: string;
  commentId?: string;
  attachmentId?: string;
  archiveId?: string;
  url?: string;
};

export type CreateNotificationsForUsersInput = Omit<
  CreateNotificationInput,
  "recipientUserId"
> & {
  recipientUserIds: string[];
};

export type GetNotificationsForUserInput = {
  userId: string;
  page?: number;
  pageSize?: number;
  status?: NotificationStatusFilter;
  type?: NotificationTypeFilter;
  query?: string;
};

export type NotificationUrlInput =
  | {
      kind: "project";
      projectId: string;
    }
  | {
      kind: "project-stage";
      projectId: string;
      stageId: string;
    }
  | {
      kind: "archives";
      categorySlug?: string;
    }
  | {
      kind: "notifications";
    };
