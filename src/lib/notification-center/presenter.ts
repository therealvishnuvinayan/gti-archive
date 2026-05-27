import type {
  Notification as PrismaNotificationRecord,
  NotificationType as PrismaNotificationType,
} from "@prisma/client";

import type {
  NotificationContextTone,
  NotificationCountSummary,
  NotificationRecord,
  NotificationType,
  NotificationTypeFilter,
  NotificationVisualKind,
} from "@/lib/notifications";

export const systemNotificationTypes = [
  "PROJECT_ASSIGNED",
  "PROJECT_CREATED",
  "PROJECT_UPDATED",
  "COLLABORATOR_ADDED",
  "COLLABORATOR_REMOVED",
  "STAGE_COMPLETED",
  "NEXT_STAGE_ACTIVATED",
  "PROJECT_ARCHIVED",
  "APPROVAL_REQUIRED",
  "COPYRIGHT_TRANSFER_REQUIRED",
 ] as const satisfies readonly PrismaNotificationType[];

const systemNotificationTypeSet = new Set<PrismaNotificationType>(systemNotificationTypes);

export function isSystemNotificationType(type: PrismaNotificationType) {
  return systemNotificationTypeSet.has(type);
}

export function mapTypeFilterToNotificationTypes(
  filter: NotificationTypeFilter,
): PrismaNotificationType[] | null {
  switch (filter) {
    case "Project":
      return [
        "PROJECT_ASSIGNED",
        "PROJECT_CREATED",
        "PROJECT_UPDATED",
        "COLLABORATOR_ADDED",
        "COLLABORATOR_REMOVED",
      ];
    case "Revision":
      return [
        "REVISION_SUBMITTED",
        "REVISION_APPROVED",
        "REVISION_REJECTED",
        "SUBMISSION_PENDING_REVIEW",
        "SUBMISSION_COMPLETED",
        "SUBMISSION_REVISION_REQUESTED",
      ];
    case "Stage":
      return ["BRIEF_ACCEPTED", "STAGE_COMPLETED", "NEXT_STAGE_ACTIVATED"];
    case "Comment":
      return ["COMMENT_ADDED", "MENTION"];
    case "File":
      return ["FILE_UPLOADED"];
    case "Archive":
      return ["PROJECT_ARCHIVED"];
    case "Approval":
      return ["APPROVAL_REQUIRED", "APPROVAL_PROOF_UPLOADED"];
    case "Copyright":
      return ["COPYRIGHT_TRANSFER_REQUIRED", "COPYRIGHT_DOCUMENT_UPLOADED"];
    case "Invoice":
      return ["INVOICE_UPLOADED"];
    case "All Types":
    default:
      return null;
  }
}

function mapNotificationType(type: PrismaNotificationType): NotificationType {
  switch (type) {
    case "REVISION_SUBMITTED":
    case "REVISION_APPROVED":
    case "REVISION_REJECTED":
    case "SUBMISSION_PENDING_REVIEW":
    case "SUBMISSION_COMPLETED":
    case "SUBMISSION_REVISION_REQUESTED":
      return "Revision";
    case "BRIEF_ACCEPTED":
    case "STAGE_COMPLETED":
    case "NEXT_STAGE_ACTIVATED":
      return "Stage";
    case "COMMENT_ADDED":
    case "MENTION":
      return "Comment";
    case "FILE_UPLOADED":
      return "File";
    case "PROJECT_ARCHIVED":
      return "Archive";
    case "APPROVAL_REQUIRED":
    case "APPROVAL_PROOF_UPLOADED":
      return "Approval";
    case "COPYRIGHT_TRANSFER_REQUIRED":
    case "COPYRIGHT_DOCUMENT_UPLOADED":
      return "Copyright";
    case "INVOICE_UPLOADED":
      return "Invoice";
    case "PROJECT_ASSIGNED":
    case "PROJECT_CREATED":
    case "PROJECT_UPDATED":
    case "COLLABORATOR_ADDED":
    case "COLLABORATOR_REMOVED":
    default:
      return "Project";
  }
}

function mapNotificationContextLabel(type: PrismaNotificationType) {
  switch (type) {
    case "REVISION_SUBMITTED":
    case "REVISION_APPROVED":
    case "REVISION_REJECTED":
    case "SUBMISSION_PENDING_REVIEW":
    case "SUBMISSION_COMPLETED":
    case "SUBMISSION_REVISION_REQUESTED":
      return "Revision";
    case "BRIEF_ACCEPTED":
    case "STAGE_COMPLETED":
    case "NEXT_STAGE_ACTIVATED":
      return "Stage";
    case "COMMENT_ADDED":
      return "Comment";
    case "MENTION":
      return "Mention";
    case "FILE_UPLOADED":
      return "File";
    case "PROJECT_ARCHIVED":
      return "Archive";
    case "APPROVAL_REQUIRED":
    case "APPROVAL_PROOF_UPLOADED":
      return "Approval";
    case "COPYRIGHT_TRANSFER_REQUIRED":
    case "COPYRIGHT_DOCUMENT_UPLOADED":
      return "Copyright";
    case "INVOICE_UPLOADED":
      return "Invoice";
    case "PROJECT_ASSIGNED":
    case "PROJECT_CREATED":
    case "PROJECT_UPDATED":
    case "COLLABORATOR_ADDED":
    case "COLLABORATOR_REMOVED":
    default:
      return "Project";
  }
}

function mapNotificationContextTone(type: PrismaNotificationType): NotificationContextTone {
  switch (type) {
    case "REVISION_SUBMITTED":
    case "REVISION_APPROVED":
    case "SUBMISSION_PENDING_REVIEW":
    case "SUBMISSION_COMPLETED":
      return "revision";
    case "REVISION_REJECTED":
    case "SUBMISSION_REVISION_REQUESTED":
      return "design";
    case "BRIEF_ACCEPTED":
    case "STAGE_COMPLETED":
    case "NEXT_STAGE_ACTIVATED":
      return "review";
    case "COMMENT_ADDED":
    case "MENTION":
      return "comment";
    case "FILE_UPLOADED":
      return "content";
    case "PROJECT_ARCHIVED":
      return "archive";
    case "APPROVAL_REQUIRED":
    case "APPROVAL_PROOF_UPLOADED":
      return "approval";
    case "COPYRIGHT_TRANSFER_REQUIRED":
    case "COPYRIGHT_DOCUMENT_UPLOADED":
      return "approval";
    case "INVOICE_UPLOADED":
      return "invoice";
    case "PROJECT_ASSIGNED":
    case "PROJECT_CREATED":
    case "PROJECT_UPDATED":
    case "COLLABORATOR_ADDED":
    case "COLLABORATOR_REMOVED":
    default:
      return "project";
  }
}

function mapNotificationVisualKind(type: PrismaNotificationType): NotificationVisualKind {
  switch (type) {
    case "REVISION_SUBMITTED":
      return "revision-submitted";
    case "REVISION_APPROVED":
    case "SUBMISSION_COMPLETED":
      return "revision-approved";
    case "REVISION_REJECTED":
    case "SUBMISSION_REVISION_REQUESTED":
      return "revision-rejected";
    case "SUBMISSION_PENDING_REVIEW":
      return "submission-pending";
    case "BRIEF_ACCEPTED":
      return "brief-accepted";
    case "STAGE_COMPLETED":
    case "NEXT_STAGE_ACTIVATED":
      return "stage-completed";
    case "COMMENT_ADDED":
    case "MENTION":
      return "comment";
    case "FILE_UPLOADED":
      return "file-uploaded";
    case "PROJECT_ARCHIVED":
      return "archive-created";
    case "APPROVAL_REQUIRED":
      return "approval-required";
    case "APPROVAL_PROOF_UPLOADED":
      return "approval-received";
    case "COPYRIGHT_TRANSFER_REQUIRED":
    case "COPYRIGHT_DOCUMENT_UPLOADED":
      return "copyright-transfer";
    case "INVOICE_UPLOADED":
      return "invoice-uploaded";
    case "PROJECT_UPDATED":
      return "project-updated";
    case "PROJECT_CREATED":
    case "PROJECT_ASSIGNED":
    case "COLLABORATOR_ADDED":
    case "COLLABORATOR_REMOVED":
    default:
      return "project-assigned";
  }
}

export function formatNotificationTimestamp(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  const now = new Date();
  const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / 60_000);

  if (diffInMinutes <= 0) {
    return "Just now";
  }

  if (diffInMinutes < 60) {
    return `${diffInMinutes} min ago`;
  }

  const sameDay = now.toDateString() === date.toDateString();

  if (sameDay) {
    return `Today, ${new Intl.DateTimeFormat("en-GB", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
      .format(date)
      .toLowerCase()}`;
  }

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  if (yesterday.toDateString() === date.toDateString()) {
    return `Yesterday, ${new Intl.DateTimeFormat("en-GB", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
      .format(date)
      .toLowerCase()}`;
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
    .format(date)
    .replace(",", ",")
    .toLowerCase();
}

export function mapNotificationToView(
  notification: Pick<
    PrismaNotificationRecord,
    "id" | "type" | "title" | "message" | "url" | "isRead" | "createdAt"
  >,
): NotificationRecord {
  const sortOrder =
    notification.createdAt instanceof Date
      ? notification.createdAt.getTime()
      : new Date(notification.createdAt).getTime();

  return {
    id: notification.id,
    title: notification.title,
    description: notification.message,
    timestampLabel: formatNotificationTimestamp(notification.createdAt),
    sortOrder: Number.isNaN(sortOrder) ? 0 : sortOrder,
    type: mapNotificationType(notification.type),
    contextLabel: mapNotificationContextLabel(notification.type),
    contextTone: mapNotificationContextTone(notification.type),
    read: notification.isRead,
    mention: notification.type === "MENTION",
    system: isSystemNotificationType(notification.type),
    visualKind: mapNotificationVisualKind(notification.type),
    targetHref: notification.url?.trim() || "/notifications",
  };
}

export function buildNotificationCounts(input: {
  all: number;
  unread: number;
  read: number;
  mentions: number;
  system: number;
}): NotificationCountSummary {
  return {
    All: input.all,
    Unread: input.unread,
    Read: input.read,
    Mentions: input.mentions,
    System: input.system,
  };
}
