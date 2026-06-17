"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type * as Ably from "ably";

import {
  STAGE_CHAT_REALTIME_EVENTS,
  getStageChatChannelName,
  type StageChatRealtimeMessageCreatedPayload,
  type StageChatRealtimeMessageDeletedPayload,
  type StageChatRealtimeMessageFailedPayload,
  type StageChatRealtimeMessagePendingPayload,
  type StageChatRealtimePresenceData,
  type StageChatRealtimeTypingPayload,
} from "@/lib/realtime/events";
import {
  createStageChatRealtimeClient,
  isStageChatRealtimeClientEnabled,
  type StageChatRealtimeClient,
} from "@/lib/realtime/client";

const TYPING_STOP_DELAY_MS = 2_500;
const TYPING_STARTED_THROTTLE_MS = 2_000;
const FOCUS_RECONCILE_STALE_MS = 30_000;
const BACKGROUND_RECONCILE_INTERVAL_MS = 60_000;
const ABLY_INACTIVE_CONNECTION_STATES = new Set<Ably.ConnectionState>([
  "closed",
  "closing",
  "failed",
  "suspended",
]);

type StageChatRealtimeConnectionState =
  | "disabled"
  | "initialized"
  | "connecting"
  | "connected"
  | "disconnected"
  | "suspended"
  | "failed"
  | "closed";

export type StageChatRealtimeUser = {
  userId: string;
  displayName: string;
  displayCode: string;
};

type UseStageChatRealtimeInput = {
  projectId: string;
  stageId?: string | null;
  currentUserId: string;
  currentUserDisplayName: string;
  currentUserDisplayCode: string;
  onMessagePending: (payload: StageChatRealtimeMessagePendingPayload) => void;
  onMessageCreated: (payload: StageChatRealtimeMessageCreatedPayload) => void;
  onMessageFailed: (payload: StageChatRealtimeMessageFailedPayload) => void;
  onMessageDeleted: (payload: StageChatRealtimeMessageDeletedPayload) => void;
  onReconcile: () => Promise<void>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isMessageCreatedPayload(
  value: unknown,
): value is StageChatRealtimeMessageCreatedPayload {
  return (
    isRecord(value) &&
    typeof value.projectId === "string" &&
    typeof value.stageId === "string" &&
    typeof value.commentId === "string" &&
    isRecord(value.entry) &&
    typeof value.entry.id === "string"
  );
}

function isMessagePendingPayload(
  value: unknown,
): value is StageChatRealtimeMessagePendingPayload {
  return (
    isRecord(value) &&
    typeof value.projectId === "string" &&
    typeof value.stageId === "string" &&
    typeof value.clientTempId === "string" &&
    typeof value.senderId === "string" &&
    typeof value.senderDisplayName === "string" &&
    typeof value.senderDisplayCode === "string" &&
    typeof value.body === "string" &&
    typeof value.createdAt === "string" &&
    value.state === "pending"
  );
}

function isMessageFailedPayload(
  value: unknown,
): value is StageChatRealtimeMessageFailedPayload {
  return (
    isRecord(value) &&
    typeof value.projectId === "string" &&
    typeof value.stageId === "string" &&
    typeof value.clientTempId === "string" &&
    typeof value.senderId === "string" &&
    typeof value.failedAt === "string" &&
    value.state === "failed"
  );
}

function isMessageDeletedPayload(
  value: unknown,
): value is StageChatRealtimeMessageDeletedPayload {
  return (
    isRecord(value) &&
    typeof value.projectId === "string" &&
    typeof value.stageId === "string" &&
    typeof value.commentId === "string" &&
    typeof value.deletedAt === "string"
  );
}

function isTypingPayload(value: unknown): value is StageChatRealtimeTypingPayload {
  return (
    isRecord(value) &&
    typeof value.projectId === "string" &&
    typeof value.stageId === "string" &&
    typeof value.userId === "string" &&
    typeof value.displayName === "string" &&
    typeof value.displayCode === "string"
  );
}

function isPresenceData(value: unknown): value is StageChatRealtimePresenceData {
  return (
    isRecord(value) &&
    typeof value.projectId === "string" &&
    typeof value.stageId === "string" &&
    typeof value.userId === "string" &&
    typeof value.displayName === "string" &&
    typeof value.displayCode === "string"
  );
}

function dedupeRealtimeUsers(users: StageChatRealtimeUser[]) {
  const map = new Map<string, StageChatRealtimeUser>();

  users.forEach((user) => {
    if (!map.has(user.userId)) {
      map.set(user.userId, user);
    }
  });

  return Array.from(map.values()).sort((left, right) =>
    left.displayName.localeCompare(right.displayName),
  );
}

function toRealtimeUser(data: StageChatRealtimePresenceData): StageChatRealtimeUser {
  return {
    userId: data.userId,
    displayName: data.displayName,
    displayCode: data.displayCode,
  };
}

function logAblyClient(message: string, details?: Record<string, unknown>) {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  if (details) {
    console.info(`[ably:client] ${message}`, details);
    return;
  }

  console.info(`[ably:client] ${message}`);
}

function logAblyChat(message: string, details?: Record<string, unknown>) {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  if (details) {
    console.info(`[ably:chat] ${message}`, details);
    return;
  }

  console.info(`[ably:chat] ${message}`);
}

function toLoggableError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }

  if (isRecord(error)) {
    return {
      code: error.code,
      statusCode: error.statusCode,
      message: error.message,
    };
  }

  return error;
}

function runAblyCleanup(label: string, task: () => unknown) {
  try {
    const result = task();
    const maybePromise = result as { catch?: unknown };

    if (typeof maybePromise?.catch === "function") {
      void (maybePromise as Promise<unknown>).catch((error) => {
        logAblyChat(`cleanup ${label} ignored`, {
          error: toLoggableError(error),
        });
      });
    }
  } catch (error) {
    logAblyChat(`cleanup ${label} ignored`, {
      error: toLoggableError(error),
    });
  }
}

function canLeaveAblyPresence(client: StageChatRealtimeClient, channel: Ably.RealtimeChannel) {
  return (
    !ABLY_INACTIVE_CONNECTION_STATES.has(client.connection.state) &&
    (channel.state === "attached" || channel.state === "attaching")
  );
}

function closeAblyClient(client: StageChatRealtimeClient) {
  if (client.connection.state === "closed" || client.connection.state === "closing") {
    return;
  }

  window.setTimeout(() => {
    runAblyCleanup("client close", () => client.close());
  }, 0);
}

export function useStageChatRealtime(input: UseStageChatRealtimeInput) {
  const realtimeEnabled = isStageChatRealtimeClientEnabled() && Boolean(input.stageId);
  const [connectionState, setConnectionState] =
    useState<StageChatRealtimeConnectionState>(
      realtimeEnabled ? "initialized" : "disabled",
    );
  const [onlineUsers, setOnlineUsers] = useState<StageChatRealtimeUser[]>([]);
  const [typingUsers, setTypingUsers] = useState<StageChatRealtimeUser[]>([]);
  const clientRef = useRef<StageChatRealtimeClient | null>(null);
  const channelRef = useRef<Ably.RealtimeChannel | null>(null);
  const typingStoppedTimeoutRef = useRef<number | null>(null);
  const typingStartedAtRef = useRef(0);
  const isTypingRef = useRef(false);
  const lastReconcileAtRef = useRef(0);
  const onMessagePendingRef = useRef(input.onMessagePending);
  const onMessageCreatedRef = useRef(input.onMessageCreated);
  const onMessageFailedRef = useRef(input.onMessageFailed);
  const onMessageDeletedRef = useRef(input.onMessageDeleted);
  const onReconcileRef = useRef(input.onReconcile);

  useEffect(() => {
    onMessagePendingRef.current = input.onMessagePending;
    onMessageCreatedRef.current = input.onMessageCreated;
    onMessageFailedRef.current = input.onMessageFailed;
    onMessageDeletedRef.current = input.onMessageDeleted;
    onReconcileRef.current = input.onReconcile;
  }, [
    input.onMessageCreated,
    input.onMessageDeleted,
    input.onMessageFailed,
    input.onMessagePending,
    input.onReconcile,
  ]);

  useEffect(() => {
    logAblyClient(realtimeEnabled ? "hook mounted enabled" : "hook mounted disabled", {
      provider: process.env.NEXT_PUBLIC_REALTIME_PROVIDER ?? null,
      projectId: input.projectId,
      stageId: input.stageId ?? null,
      currentUserId: input.currentUserId,
      hasStageId: Boolean(input.stageId),
    });
  }, [input.currentUserId, input.projectId, input.stageId, realtimeEnabled]);

  const presenceData = useMemo<StageChatRealtimePresenceData | null>(() => {
    if (!input.stageId) {
      return null;
    }

    return {
      projectId: input.projectId,
      stageId: input.stageId,
      userId: input.currentUserId,
      displayName: input.currentUserDisplayName,
      displayCode: input.currentUserDisplayCode,
    };
  }, [
    input.currentUserDisplayCode,
    input.currentUserDisplayName,
    input.currentUserId,
    input.projectId,
    input.stageId,
  ]);

  const runReconcile = useCallback(() => {
    lastReconcileAtRef.current = Date.now();
    onReconcileRef.current().catch((error) => {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[realtime] Stage Chat reconciliation failed", error);
      }
    });
  }, []);

  useEffect(() => {
    if (!realtimeEnabled || !input.stageId || !presenceData) {
      logAblyClient("subscription skipped", {
        provider: process.env.NEXT_PUBLIC_REALTIME_PROVIDER ?? null,
        realtimeEnabled,
        projectId: input.projectId,
        stageId: input.stageId ?? null,
        hasPresenceData: Boolean(presenceData),
      });
      return;
    }

    const client = createStageChatRealtimeClient({
      projectId: input.projectId,
      stageId: input.stageId,
    });
    const channelName = getStageChatChannelName(input.projectId, input.stageId);
    const channel = client.channels.get(channelName);
    let cancelled = false;
    clientRef.current = client;
    channelRef.current = channel;
    logAblyChat("channel ready", {
      channelName,
      projectId: input.projectId,
      stageId: input.stageId,
      currentUserId: input.currentUserId,
    });

    const refreshPresence = () => {
      channel.presence
        .get()
        .then((members) => {
          if (cancelled) {
            return;
          }

          const users = members
            .map((member) => member.data)
            .filter(isPresenceData)
            .map(toRealtimeUser);
          setOnlineUsers(dedupeRealtimeUsers(users));
          logAblyChat("presence refresh success", {
            channelName,
            memberCount: users.length,
          });
        })
        .catch((error) => {
          logAblyChat("presence refresh failure", {
            channelName,
            error: toLoggableError(error),
          });
        });
    };

    const handleConnectionState = (stateChange: Ably.ConnectionStateChange) => {
      if (cancelled) {
        return;
      }

      setConnectionState(stateChange.current as StageChatRealtimeConnectionState);
      logAblyClient(`connection state ${stateChange.current}`, {
        previous: stateChange.previous,
        current: stateChange.current,
        reason: toLoggableError(stateChange.reason),
      });

      if (stateChange.current === "connected") {
        runReconcile();
      }
    };

    const handleCreated = (message: Ably.InboundMessage) => {
      if (message.clientId || !isMessageCreatedPayload(message.data)) {
        logAblyChat("received message.created ignored", {
          channelName,
          eventName: message.name,
          clientId: message.clientId ?? null,
          hasValidPayload: isMessageCreatedPayload(message.data),
        });
        return;
      }

      logAblyChat("received message.created", {
        channelName,
        commentId: message.data.commentId,
        senderId: message.data.senderId,
      });
      onMessageCreatedRef.current(message.data);
    };

    const handlePending = (message: Ably.InboundMessage) => {
      if (!isMessagePendingPayload(message.data)) {
        logAblyChat("received message.pending ignored", {
          channelName,
          eventName: message.name,
          clientId: message.clientId ?? null,
          hasValidPayload: isMessagePendingPayload(message.data),
        });
        return;
      }

      logAblyChat("received message.pending", {
        channelName,
        clientTempId: message.data.clientTempId,
        senderId: message.data.senderId,
        clientId: message.clientId ?? null,
      });
      onMessagePendingRef.current(message.data);
    };

    const handleFailed = (message: Ably.InboundMessage) => {
      if (!isMessageFailedPayload(message.data)) {
        logAblyChat("received message.failed ignored", {
          channelName,
          eventName: message.name,
          clientId: message.clientId ?? null,
          hasValidPayload: isMessageFailedPayload(message.data),
        });
        return;
      }

      logAblyChat("received message.failed", {
        channelName,
        clientTempId: message.data.clientTempId,
        senderId: message.data.senderId,
        clientId: message.clientId ?? null,
      });
      onMessageFailedRef.current(message.data);
    };

    const handleDeleted = (message: Ably.InboundMessage) => {
      if (message.clientId || !isMessageDeletedPayload(message.data)) {
        logAblyChat("received message.deleted ignored", {
          channelName,
          eventName: message.name,
          clientId: message.clientId ?? null,
          hasValidPayload: isMessageDeletedPayload(message.data),
        });
        return;
      }

      logAblyChat("received message.deleted", {
        channelName,
        commentId: message.data.commentId,
        deletedByUserId: message.data.deletedByUserId,
      });
      onMessageDeletedRef.current(message.data);
    };

    const handleTypingStarted = (message: Ably.InboundMessage) => {
      if (!isTypingPayload(message.data) || message.data.userId === input.currentUserId) {
        logAblyChat("received typing.started ignored", {
          channelName,
          eventName: message.name,
          hasValidPayload: isTypingPayload(message.data),
          isCurrentUser:
            isTypingPayload(message.data) &&
            message.data.userId === input.currentUserId,
        });
        return;
      }

      logAblyChat("received typing.started", {
        channelName,
        userId: message.data.userId,
        displayCode: message.data.displayCode,
      });
      const nextUser = toRealtimeUser(message.data);
      setTypingUsers((current) =>
        dedupeRealtimeUsers([
          ...current.filter((user) => user.userId !== nextUser.userId),
          nextUser,
        ]),
      );
    };

    const handleTypingStopped = (message: Ably.InboundMessage) => {
      if (!isTypingPayload(message.data) || message.data.userId === input.currentUserId) {
        logAblyChat("received typing.stopped ignored", {
          channelName,
          eventName: message.name,
          hasValidPayload: isTypingPayload(message.data),
          isCurrentUser:
            isTypingPayload(message.data) &&
            message.data.userId === input.currentUserId,
        });
        return;
      }

      logAblyChat("received typing.stopped", {
        channelName,
        userId: message.data.userId,
        displayCode: message.data.displayCode,
      });
      setTypingUsers((current) =>
        current.filter((user) => user.userId !== message.data.userId),
      );
    };

    const handlePresence = () => {
      refreshPresence();
    };

    const subscribeToEvent = (
      eventName: string,
      handler: (message: Ably.InboundMessage) => void,
    ) => {
      logAblyChat("subscribe start", {
        channelName,
        eventName,
      });
      channel
        .subscribe(eventName, handler)
        .then(() => {
          logAblyChat("subscribe success", {
            channelName,
            eventName,
          });
        })
        .catch((error) => {
          logAblyChat("subscribe failure", {
            channelName,
            eventName,
            error: toLoggableError(error),
          });
        });
    };

    client.connection.on(handleConnectionState);
    subscribeToEvent(STAGE_CHAT_REALTIME_EVENTS.messagePending, handlePending);
    subscribeToEvent(STAGE_CHAT_REALTIME_EVENTS.messageCreated, handleCreated);
    subscribeToEvent(STAGE_CHAT_REALTIME_EVENTS.messageFailed, handleFailed);
    subscribeToEvent(STAGE_CHAT_REALTIME_EVENTS.messageDeleted, handleDeleted);
    subscribeToEvent(STAGE_CHAT_REALTIME_EVENTS.typingStarted, handleTypingStarted);
    subscribeToEvent(STAGE_CHAT_REALTIME_EVENTS.typingStopped, handleTypingStopped);
    logAblyChat("presence subscribe start", {
      channelName,
    });
    channel.presence
      .subscribe(handlePresence)
      .then(() => {
        logAblyChat("presence subscribe success", {
          channelName,
        });
      })
      .catch((error) => {
        logAblyChat("presence subscribe failure", {
          channelName,
          error: toLoggableError(error),
        });
      });
    channel.presence
      .enter(presenceData)
      .then(() => {
        logAblyChat("presence enter success", {
          channelName,
          userId: presenceData.userId,
          displayCode: presenceData.displayCode,
        });
        refreshPresence();
      })
      .catch((error) => {
        logAblyChat("presence enter failure", {
          channelName,
          error: toLoggableError(error),
        });
      });

    return () => {
      cancelled = true;
      logAblyChat("cleanup", {
        channelName,
      });
      runAblyCleanup("unsubscribe message.pending", () =>
        channel.unsubscribe(STAGE_CHAT_REALTIME_EVENTS.messagePending, handlePending),
      );
      runAblyCleanup("unsubscribe message.created", () =>
        channel.unsubscribe(STAGE_CHAT_REALTIME_EVENTS.messageCreated, handleCreated),
      );
      runAblyCleanup("unsubscribe message.failed", () =>
        channel.unsubscribe(STAGE_CHAT_REALTIME_EVENTS.messageFailed, handleFailed),
      );
      runAblyCleanup("unsubscribe message.deleted", () =>
        channel.unsubscribe(STAGE_CHAT_REALTIME_EVENTS.messageDeleted, handleDeleted),
      );
      runAblyCleanup("unsubscribe typing.started", () =>
        channel.unsubscribe(STAGE_CHAT_REALTIME_EVENTS.typingStarted, handleTypingStarted),
      );
      runAblyCleanup("unsubscribe typing.stopped", () =>
        channel.unsubscribe(STAGE_CHAT_REALTIME_EVENTS.typingStopped, handleTypingStopped),
      );
      runAblyCleanup("presence unsubscribe", () =>
        channel.presence.unsubscribe(handlePresence),
      );
      if (canLeaveAblyPresence(client, channel)) {
        runAblyCleanup("presence leave", () => channel.presence.leave());
      }
      runAblyCleanup("connection off", () => client.connection.off(handleConnectionState));
      closeAblyClient(client);
      clientRef.current = null;
      channelRef.current = null;
      setOnlineUsers([]);
      setTypingUsers([]);
    };
  }, [
    input.currentUserId,
    input.projectId,
    input.stageId,
    presenceData,
    realtimeEnabled,
    runReconcile,
  ]);

  useEffect(() => {
    if (!realtimeEnabled) {
      return;
    }

    function handleFocus() {
      if (Date.now() - lastReconcileAtRef.current < FOCUS_RECONCILE_STALE_MS) {
        return;
      }

      runReconcile();
    }

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "hidden") {
        return;
      }

      if (connectionState !== "connected") {
        return;
      }

      runReconcile();
    }, BACKGROUND_RECONCILE_INTERVAL_MS);

    window.addEventListener("focus", handleFocus);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
    };
  }, [connectionState, realtimeEnabled, runReconcile]);

  const publishTypingStopped = useCallback(() => {
    const channel = channelRef.current;

    if (!channel || !presenceData || !isTypingRef.current) {
      return;
    }

    isTypingRef.current = false;
    channel
      .publish(STAGE_CHAT_REALTIME_EVENTS.typingStopped, {
        ...presenceData,
        startedAt: new Date().toISOString(),
      })
      .catch(() => undefined);
  }, [presenceData]);

  const notifyTypingActivity = useCallback(() => {
    const channel = channelRef.current;

    if (!channel || !presenceData) {
      return;
    }

    const now = Date.now();

    if (
      !isTypingRef.current ||
      now - typingStartedAtRef.current > TYPING_STARTED_THROTTLE_MS
    ) {
      isTypingRef.current = true;
      typingStartedAtRef.current = now;
      channel
        .publish(STAGE_CHAT_REALTIME_EVENTS.typingStarted, {
          ...presenceData,
          startedAt: new Date(now).toISOString(),
        })
        .catch(() => undefined);
    }

    if (typingStoppedTimeoutRef.current) {
      window.clearTimeout(typingStoppedTimeoutRef.current);
    }

    typingStoppedTimeoutRef.current = window.setTimeout(() => {
      publishTypingStopped();
    }, TYPING_STOP_DELAY_MS);
  }, [presenceData, publishTypingStopped]);

  const publishPendingMessage = useCallback(
    async (payload: StageChatRealtimeMessagePendingPayload) => {
      const channel = channelRef.current;
      const channelName = input.stageId
        ? getStageChatChannelName(input.projectId, input.stageId)
        : null;

      if (!channel || !realtimeEnabled) {
        logAblyChat("publish message.pending skipped", {
          channelName,
          realtimeEnabled,
          clientTempId: payload.clientTempId,
        });
        return false;
      }

      logAblyChat("publish message.pending start", {
        channelName,
        clientTempId: payload.clientTempId,
      });

      try {
        await channel.publish(STAGE_CHAT_REALTIME_EVENTS.messagePending, payload);
      } catch (error) {
        logAblyChat("publish message.pending failure", {
          channelName,
          clientTempId: payload.clientTempId,
          error: toLoggableError(error),
        });
        return false;
      }

      logAblyChat("publish message.pending success", {
        channelName,
        clientTempId: payload.clientTempId,
      });
      return true;
    },
    [input.projectId, input.stageId, realtimeEnabled],
  );

  const publishFailedMessage = useCallback(
    async (payload: StageChatRealtimeMessageFailedPayload) => {
      const channel = channelRef.current;
      const channelName = input.stageId
        ? getStageChatChannelName(input.projectId, input.stageId)
        : null;

      if (!channel || !realtimeEnabled) {
        logAblyChat("publish message.failed skipped", {
          channelName,
          realtimeEnabled,
          clientTempId: payload.clientTempId,
        });
        return false;
      }

      logAblyChat("publish message.failed start", {
        channelName,
        clientTempId: payload.clientTempId,
      });

      try {
        await channel.publish(STAGE_CHAT_REALTIME_EVENTS.messageFailed, payload);
      } catch (error) {
        logAblyChat("publish message.failed failure", {
          channelName,
          clientTempId: payload.clientTempId,
          error: toLoggableError(error),
        });
        return false;
      }

      logAblyChat("publish message.failed success", {
        channelName,
        clientTempId: payload.clientTempId,
      });
      return true;
    },
    [input.projectId, input.stageId, realtimeEnabled],
  );

  useEffect(
    () => () => {
      if (typingStoppedTimeoutRef.current) {
        window.clearTimeout(typingStoppedTimeoutRef.current);
      }

      publishTypingStopped();
    },
    [publishTypingStopped],
  );

  return {
    realtimeEnabled,
    connectionState: realtimeEnabled ? connectionState : "disabled",
    onlineUsers: realtimeEnabled ? onlineUsers : [],
    typingUsers: realtimeEnabled ? typingUsers : [],
    notifyTypingActivity,
    publishTypingStopped,
    publishPendingMessage,
    publishFailedMessage,
    reconcileNow: runReconcile,
  };
}
