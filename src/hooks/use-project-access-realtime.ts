"use client";

import { useEffect, useRef } from "react";
import type * as Ably from "ably";

import {
  PROJECT_ACCESS_REALTIME_EVENTS,
  getProjectAccessChannelName,
  type ProjectActivityUpdatedPayload,
  type ProjectAccessRevokedPayload,
} from "@/lib/realtime/events";
import {
  createProjectAccessRealtimeClient,
  isStageChatRealtimeClientEnabled,
} from "@/lib/realtime/client";

type UseProjectAccessRealtimeInput = {
  projectId: string;
  currentUserId: string;
  onAccessRevoked: (payload: ProjectAccessRevokedPayload) => void;
  onActivityUpdated: (payload: ProjectActivityUpdatedPayload) => void;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isProjectActivityUpdatedPayload(
  value: unknown,
): value is ProjectActivityUpdatedPayload {
  return (
    isRecord(value) &&
    typeof value.eventId === "string" &&
    typeof value.projectId === "string" &&
    (typeof value.stageId === "string" || value.stageId === null) &&
    typeof value.eventType === "string" &&
    typeof value.updatedAt === "string"
  );
}

function isProjectAccessRevokedPayload(
  value: unknown,
): value is ProjectAccessRevokedPayload {
  return (
    isRecord(value) &&
    typeof value.projectId === "string" &&
    Array.isArray(value.targetUserIds) &&
    value.targetUserIds.every((userId) => typeof userId === "string") &&
    typeof value.actorId === "string" &&
    typeof value.revokedAt === "string" &&
    (value.reason === "collaborator_removed" ||
      value.reason === "visibility_paused")
  );
}

function ignoreCleanupError(label: string, error: unknown) {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  console.info(`[ably:project-access] cleanup ${label} ignored`, {
    error: error instanceof Error ? error.message : String(error),
  });
}

function runProjectAccessCleanup(label: string, task: () => unknown) {
  try {
    const result = task();
    const maybePromise = result as { catch?: unknown };

    if (typeof maybePromise?.catch === "function") {
      void (maybePromise as Promise<unknown>).catch((error) => {
        ignoreCleanupError(label, error);
      });
    }
  } catch (error) {
    ignoreCleanupError(label, error);
  }
}

export function useProjectAccessRealtime(input: UseProjectAccessRealtimeInput) {
  const onAccessRevokedRef = useRef(input.onAccessRevoked);
  const onActivityUpdatedRef = useRef(input.onActivityUpdated);

  useEffect(() => {
    onAccessRevokedRef.current = input.onAccessRevoked;
    onActivityUpdatedRef.current = input.onActivityUpdated;
  }, [input.onAccessRevoked, input.onActivityUpdated]);

  useEffect(() => {
    if (!isStageChatRealtimeClientEnabled() || !input.projectId) {
      return;
    }

    const client = createProjectAccessRealtimeClient({
      projectId: input.projectId,
    });
    const channel = client.channels.get(getProjectAccessChannelName(input.projectId));
    let cancelled = false;

    const handleAccessRevoked = (message: Ably.InboundMessage) => {
      if (
        cancelled ||
        !isProjectAccessRevokedPayload(message.data) ||
        message.data.projectId !== input.projectId ||
        !message.data.targetUserIds.includes(input.currentUserId)
      ) {
        return;
      }

      onAccessRevokedRef.current(message.data);
    };

    const handleActivityUpdated = (message: Ably.InboundMessage) => {
      if (
        cancelled ||
        !isProjectActivityUpdatedPayload(message.data) ||
        message.data.projectId !== input.projectId
      ) {
        return;
      }

      onActivityUpdatedRef.current(message.data);
    };

    void channel.subscribe(
      PROJECT_ACCESS_REALTIME_EVENTS.accessRevoked,
      handleAccessRevoked,
    );
    void channel.subscribe(
      PROJECT_ACCESS_REALTIME_EVENTS.activityUpdated,
      handleActivityUpdated,
    );

    return () => {
      cancelled = true;
      runProjectAccessCleanup("unsubscribe access.revoked", () =>
        channel.unsubscribe(
          PROJECT_ACCESS_REALTIME_EVENTS.accessRevoked,
          handleAccessRevoked,
        ),
      );
      runProjectAccessCleanup("unsubscribe activity.updated", () =>
        channel.unsubscribe(
          PROJECT_ACCESS_REALTIME_EVENTS.activityUpdated,
          handleActivityUpdated,
        ),
      );
    };
  }, [input.currentUserId, input.projectId]);
}
