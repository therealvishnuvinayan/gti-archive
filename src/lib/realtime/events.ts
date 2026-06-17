import type { ProjectChatEntry } from "@/lib/projects";

export const STAGE_CHAT_REALTIME_EVENTS = {
  messagePending: "stage-chat.message.pending",
  messageCreated: "stage-chat.message.created",
  messageFailed: "stage-chat.message.failed",
  messageDeleted: "stage-chat.message.deleted",
  typingStarted: "stage-chat.typing.started",
  typingStopped: "stage-chat.typing.stopped",
  presenceEnter: "stage-chat.presence.enter",
  presenceLeave: "stage-chat.presence.leave",
} as const;

export type StageChatRealtimeEventName =
  (typeof STAGE_CHAT_REALTIME_EVENTS)[keyof typeof STAGE_CHAT_REALTIME_EVENTS];

export function getStageChatChannelName(projectId: string, stageId: string) {
  return `private:project:${projectId}:stage:${stageId}:chat`;
}

export type StageChatRealtimeMessagePendingPayload = {
  projectId: string;
  stageId: string;
  clientTempId: string;
  senderId: string;
  senderDisplayName: string;
  senderDisplayCode: string;
  body: string;
  createdAt: string;
  state: "pending";
};

export type StageChatRealtimeMessageCreatedPayload = {
  eventId: string;
  projectId: string;
  stageId: string;
  id: string;
  commentId: string;
  senderId: string | null;
  entry: ProjectChatEntry;
  createdAt: string;
  deletedAt: null;
  clientTempId?: string | null;
};

export type StageChatRealtimeMessageFailedPayload = {
  projectId: string;
  stageId: string;
  clientTempId: string;
  senderId: string;
  failedAt: string;
  state: "failed";
  reason?: "save_failed" | "network_failed";
};

export type StageChatRealtimeMessageDeletedPayload = {
  eventId: string;
  projectId: string;
  stageId: string;
  id: string;
  commentId: string;
  deletedAt: string;
  deletedByUserId: string | null;
  body: "This message was deleted";
  attachments: [];
  mentions: [];
};

export type StageChatRealtimeTypingPayload = {
  projectId: string;
  stageId: string;
  userId: string;
  displayName: string;
  displayCode: string;
  startedAt: string;
};

export type StageChatRealtimePresenceData = {
  projectId: string;
  stageId: string;
  userId: string;
  displayName: string;
  displayCode: string;
};

export type StageChatRealtimeUpdatesResponse = {
  projectId: string;
  stageId: string;
  entries: ProjectChatEntry[];
  watermark: string;
  hasMore: boolean;
};
