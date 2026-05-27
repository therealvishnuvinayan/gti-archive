"use client";

import type { LucideIcon } from "lucide-react";
import {
  Archive,
  BellDot,
  CheckCheck,
  CircleAlert,
  FileBadge2,
  FileCheck2,
  FileStack,
  MessageCircleMore,
  ReceiptText,
  Send,
  ShieldCheck,
} from "lucide-react";

import type {
  NotificationContextTone,
  NotificationRecord,
  NotificationVisualKind,
} from "@/lib/notifications";

const notificationIconMap: Record<NotificationVisualKind, LucideIcon> = {
  "project-completed": CheckCheck,
  "revision-approved": FileCheck2,
  "revision-submitted": FileStack,
  "revision-rejected": CircleAlert,
  "invoice-uploaded": ReceiptText,
  "approval-received": ShieldCheck,
  comment: MessageCircleMore,
  "project-assigned": Send,
  "stage-completed": CheckCheck,
  "archive-created": Archive,
  "copyright-transfer": FileBadge2,
  "submission-pending": BellDot,
};

const contextToneStyles: Record<NotificationContextTone, string> = {
  project: "bg-[#edf7ef] text-[#2b8b56]",
  revision: "bg-[#eaf2ff] text-[#3a73e4]",
  content: "bg-[#f2eefe] text-[#7a58d6]",
  design: "bg-[#fff0ef] text-[#d64e5f]",
  review: "bg-[#eef8ef] text-[#4a9454]",
  archive: "bg-[#fff4e7] text-[#c58a25]",
  approval: "bg-[#e9f8fb] text-[#1694ad]",
  invoice: "bg-[#fff0f1] text-[#db4c5b]",
  comment: "bg-[#efeaff] text-[#8769ef]",
};

const iconToneStyles: Record<NotificationVisualKind, string> = {
  "project-completed": "bg-[#edf7ef] text-[#2b8b56]",
  "revision-approved": "bg-[#edf7ef] text-[#2b8b56]",
  "revision-submitted": "bg-[#eaf2ff] text-[#3a73e4]",
  "revision-rejected": "bg-[#fff0ef] text-[#d64e5f]",
  "invoice-uploaded": "bg-[#eaf2ff] text-[#3a73e4]",
  "approval-received": "bg-[#fff6e7] text-[#f0a311]",
  comment: "bg-[#efeaff] text-[#8769ef]",
  "project-assigned": "bg-[#f5efe8] text-[#a96b3f]",
  "stage-completed": "bg-[#edf7ef] text-[#2b8b56]",
  "archive-created": "bg-[#fff4e7] text-[#c58a25]",
  "copyright-transfer": "bg-[#e8f8fb] text-[#1593a8]",
  "submission-pending": "bg-[#fff7ea] text-[#b77420]",
};

const actorToneStyles = {
  sunset:
    "bg-[radial-gradient(circle_at_top,#ffd7c5,#d88f6c_55%,#7c4a34)] text-white",
  mint: "bg-[radial-gradient(circle_at_top,#dff6e7,#74b592_58%,#2f6d4c)] text-white",
  violet:
    "bg-[radial-gradient(circle_at_top,#efe5ff,#b194fa_58%,#6a50c8)] text-white",
} as const;

export function NotificationUnreadDot({ unread }: { unread: boolean }) {
  return (
    <span
      className={`inline-flex h-2.5 w-2.5 rounded-full ${
        unread ? "bg-brand" : "bg-[#cfd6d0]"
      }`}
    />
  );
}

export function NotificationVisual({
  notification,
  size = "md",
}: {
  notification: NotificationRecord;
  size?: "sm" | "md";
}) {
  const dimension = size === "sm" ? "h-11 w-11" : "h-12 w-12";

  if (notification.actorInitials) {
    return (
      <div
        className={`grid ${dimension} place-items-center rounded-full text-sm font-[700] ${actorToneStyles[notification.actorTone ?? "sunset"]}`}
      >
        {notification.actorInitials}
      </div>
    );
  }

  const Icon = notificationIconMap[notification.visualKind];

  return (
    <div
      className={`grid ${dimension} place-items-center rounded-[16px] ${iconToneStyles[notification.visualKind]}`}
    >
      <Icon className="h-5 w-5" />
    </div>
  );
}

export function NotificationContextBadge({
  tone,
  label,
}: {
  tone: NotificationContextTone;
  label: string;
}) {
  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-[12px] font-[600] ${contextToneStyles[tone]}`}
    >
      {label}
    </span>
  );
}
