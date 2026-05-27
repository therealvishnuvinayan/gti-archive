export type NotificationType =
  | "Project"
  | "Revision"
  | "Stage"
  | "Comment"
  | "File"
  | "Archive"
  | "Approval"
  | "Copyright"
  | "Invoice";

export type NotificationVisualKind =
  | "project-completed"
  | "revision-approved"
  | "revision-submitted"
  | "revision-rejected"
  | "invoice-uploaded"
  | "approval-received"
  | "approval-required"
  | "brief-accepted"
  | "comment"
  | "file-uploaded"
  | "project-assigned"
  | "project-updated"
  | "stage-completed"
  | "archive-created"
  | "copyright-transfer"
  | "submission-pending";

export type NotificationContextTone =
  | "project"
  | "revision"
  | "content"
  | "design"
  | "review"
  | "archive"
  | "approval"
  | "invoice"
  | "comment";

export type NotificationRecord = {
  id: string;
  title: string;
  description: string;
  timestampLabel: string;
  sortOrder: number;
  type: NotificationType;
  contextLabel: string;
  contextTone: NotificationContextTone;
  read: boolean;
  mention: boolean;
  system: boolean;
  visualKind: NotificationVisualKind;
  actorName?: string;
  actorInitials?: string;
  actorTone?: "sunset" | "mint" | "violet";
  targetHref: string;
};

export const notificationTypeOptions = [
  "All Types",
  "Project",
  "Revision",
  "Stage",
  "Comment",
  "File",
  "Archive",
  "Approval",
  "Copyright",
  "Invoice",
] as const;

export type NotificationTypeFilter = (typeof notificationTypeOptions)[number];

export const notificationTabs = [
  "All",
  "Unread",
  "Read",
  "Mentions",
  "System",
] as const;

export type NotificationTabFilter = (typeof notificationTabs)[number];

export type NotificationStatusFilter = "all" | "unread" | "read" | "mentions" | "system";

export type NotificationCountSummary = Record<NotificationTabFilter, number>;

export type NotificationRecentResponse = {
  notifications: NotificationRecord[];
  unreadCount: number;
};

export type NotificationListResponse = {
  notifications: NotificationRecord[];
  unreadCount: number;
  counts: NotificationCountSummary;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export const notificationPageSizeOptions = [8, 10, 12] as const;

export function parseNotificationStatusParam(
  value: string | null | undefined,
): NotificationStatusFilter {
  switch (value) {
    case "unread":
      return "unread";
    case "read":
      return "read";
    case "mentions":
      return "mentions";
    case "system":
      return "system";
    case "all":
    default:
      return "all";
  }
}

export function parseNotificationTypeFilter(
  value: string | null | undefined,
): NotificationTypeFilter {
  if (value && notificationTypeOptions.includes(value as NotificationTypeFilter)) {
    return value as NotificationTypeFilter;
  }

  return "All Types";
}

export function toNotificationStatusParam(
  value: NotificationTabFilter,
): NotificationStatusFilter {
  switch (value) {
    case "Unread":
      return "unread";
    case "Read":
      return "read";
    case "Mentions":
      return "mentions";
    case "System":
      return "system";
    case "All":
    default:
      return "all";
  }
}

export function toNotificationTabFilter(
  value: NotificationStatusFilter,
): NotificationTabFilter {
  switch (value) {
    case "unread":
      return "Unread";
    case "read":
      return "Read";
    case "mentions":
      return "Mentions";
    case "system":
      return "System";
    case "all":
    default:
      return "All";
  }
}
