import { randomUUID } from "node:crypto";
import { after } from "next/server";

import {
  getProjectAccessChannelName,
  getStageChatChannelName,
  type ProjectAccessRevokedPayload,
  type StageChatRealtimeMessageCreatedPayload,
  type StageChatRealtimeMessageDeletedPayload,
  type StageChatRealtimeTimelineUpdatedPayload,
} from "@/lib/realtime/events";

import {
  createAblyStageChatTokenRequest,
  createAblyProjectAccessTokenRequest,
  isAblyServerConfigured,
  publishAblyProjectAccessRevoked,
  publishAblyStageChatMessageCreated,
  publishAblyStageChatMessageDeleted,
  publishAblyStageChatTimelineUpdated,
  warnAblyNotConfigured,
} from "./ably-server";

export { getProjectAccessChannelName, getStageChatChannelName };

export function getRealtimeProvider() {
  return process.env.NEXT_PUBLIC_REALTIME_PROVIDER === "ably" ? "ably" : "none";
}

export function isStageChatRealtimeConfigured() {
  return getRealtimeProvider() === "ably" && isAblyServerConfigured();
}

function logStageChatRealtimeServer(message: string, details?: Record<string, unknown>) {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  if (details) {
    console.info(`[ably:server] ${message}`, details);
    return;
  }

  console.info(`[ably:server] ${message}`);
}

export async function createStageChatRealtimeTokenRequest(input: {
  projectId: string;
  stageId: string;
  clientId: string;
}) {
  if (getRealtimeProvider() !== "ably") {
    return null;
  }

  return createAblyStageChatTokenRequest(input);
}

export async function createProjectAccessRealtimeTokenRequest(input: {
  projectId: string;
  clientId: string;
}) {
  if (getRealtimeProvider() !== "ably") {
    return null;
  }

  return createAblyProjectAccessTokenRequest(input);
}

async function runStageChatRealtimeTask(
  label: string,
  task: () => Promise<unknown>,
) {
  if (getRealtimeProvider() !== "ably") {
    logStageChatRealtimeServer("task skipped", {
      label,
      reason: "NEXT_PUBLIC_REALTIME_PROVIDER is not ably",
      provider: getRealtimeProvider(),
    });
    return;
  }

  if (!isAblyServerConfigured()) {
    warnAblyNotConfigured();
    logStageChatRealtimeServer("task skipped", {
      label,
      reason: "ABLY_API_KEY missing",
    });
    return;
  }

  try {
    await task();
  } catch (error) {
    console.error(`[realtime] ${label} failed`, error);
  }
}

export function runStageChatRealtimeTaskAfterResponse(
  label: string,
  task: () => Promise<unknown>,
) {
  after(() => runStageChatRealtimeTask(label, task));
}

export async function publishStageChatMessageCreated(
  payload: StageChatRealtimeMessageCreatedPayload,
) {
  return publishAblyStageChatMessageCreated(payload);
}

export async function publishStageChatMessageDeleted(
  payload: StageChatRealtimeMessageDeletedPayload,
) {
  return publishAblyStageChatMessageDeleted(payload);
}

export async function publishStageChatTimelineUpdated(
  payload: StageChatRealtimeTimelineUpdatedPayload,
) {
  return publishAblyStageChatTimelineUpdated(payload);
}

export function publishStageChatTimelineUpdatedAfterResponse(input: {
  projectId: string;
  stageId: string;
  eventType: StageChatRealtimeTimelineUpdatedPayload["eventType"];
  changedEntityId?: string | null;
  actorId?: string | null;
  label?: string;
}) {
  runStageChatRealtimeTaskAfterResponse(
    input.label ?? `stage-chat.timeline.updated:${input.eventType}`,
    () =>
      publishStageChatTimelineUpdated({
        eventId: randomUUID(),
        projectId: input.projectId,
        stageId: input.stageId,
        eventType: input.eventType,
        changedEntityId: input.changedEntityId ?? null,
        actorId: input.actorId ?? null,
        updatedAt: new Date().toISOString(),
      }),
  );
}

export async function publishProjectAccessRevoked(
  payload: ProjectAccessRevokedPayload,
) {
  return publishAblyProjectAccessRevoked(payload);
}
