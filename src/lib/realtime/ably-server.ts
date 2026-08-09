import * as Ably from "ably";

import {
  NOTIFICATION_REALTIME_EVENTS,
  PROJECT_ACCESS_REALTIME_EVENTS,
  STAGE_CHAT_REALTIME_EVENTS,
  getNotificationChannelName,
  getProjectAccessChannelName,
  getStageChatChannelName,
  type NotificationRealtimeChangedPayload,
  type ProjectAccessRevokedPayload,
  type StageChatRealtimeMessageCreatedPayload,
  type StageChatRealtimeMessageDeletedPayload,
  type StageChatRealtimeTimelineUpdatedPayload,
} from "@/lib/realtime/events";

const STAGE_CHAT_TOKEN_TTL_MS = 10 * 60 * 1000;

let cachedRestClient: Ably.Rest | null = null;
let missingKeyWarningShown = false;

function logAblyServer(message: string, details?: Record<string, unknown>) {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  if (details) {
    console.info(`[ably:server] ${message}`, details);
    return;
  }

  console.info(`[ably:server] ${message}`);
}

function getAblyApiKey() {
  return process.env.ABLY_API_KEY?.trim() || null;
}

export function isAblyServerConfigured() {
  return Boolean(getAblyApiKey());
}

export function warnAblyNotConfigured() {
  if (process.env.NODE_ENV === "production" || missingKeyWarningShown) {
    return;
  }

  missingKeyWarningShown = true;
  console.warn("[realtime] ABLY_API_KEY is not configured. Stage Chat realtime is disabled.");
}

function getAblyRestClient() {
  const apiKey = getAblyApiKey();

  if (!apiKey) {
    warnAblyNotConfigured();
    return null;
  }

  if (!cachedRestClient) {
    cachedRestClient = new Ably.Rest({ key: apiKey });
  }

  return cachedRestClient;
}

export async function createAblyStageChatTokenRequest(input: {
  projectId: string;
  stageId: string;
  clientId: string;
}) {
  const client = getAblyRestClient();
  const channelName = getStageChatChannelName(input.projectId, input.stageId);

  logAblyServer("token request create start", {
    projectId: input.projectId,
    stageId: input.stageId,
    channelName,
    clientId: input.clientId,
    hasAblyApiKey: Boolean(getAblyApiKey()),
  });

  if (!client) {
    logAblyServer("token request create failure", {
      projectId: input.projectId,
      stageId: input.stageId,
      channelName,
      reason: "ABLY_API_KEY missing",
    });
    return null;
  }

  const tokenRequest = await client.auth.createTokenRequest({
    clientId: input.clientId,
    ttl: STAGE_CHAT_TOKEN_TTL_MS,
    capability: {
      [channelName]: ["subscribe", "publish", "presence"],
    },
  });

  logAblyServer("token request create success", {
    projectId: input.projectId,
    stageId: input.stageId,
    channelName,
    clientId: input.clientId,
  });

  return tokenRequest;
}

export async function createAblyProjectAccessTokenRequest(input: {
  projectId: string;
  clientId: string;
}) {
  const client = getAblyRestClient();
  const channelName = getProjectAccessChannelName(input.projectId);

  if (!client) {
    return null;
  }

  return client.auth.createTokenRequest({
    clientId: input.clientId,
    ttl: STAGE_CHAT_TOKEN_TTL_MS,
    capability: {
      [channelName]: ["subscribe"],
    },
  });
}

export async function createAblyNotificationTokenRequest(input: {
  userId: string;
  clientId: string;
}) {
  const client = getAblyRestClient();

  if (!client) {
    return null;
  }

  return client.auth.createTokenRequest({
    clientId: input.clientId,
    ttl: STAGE_CHAT_TOKEN_TTL_MS,
    capability: {
      [getNotificationChannelName(input.userId)]: ["subscribe"],
    },
  });
}

async function publishStageChatEvent(
  projectId: string,
  stageId: string,
  eventName: string,
  payload:
    | StageChatRealtimeMessageCreatedPayload
    | StageChatRealtimeMessageDeletedPayload
    | StageChatRealtimeTimelineUpdatedPayload,
) {
  const client = getAblyRestClient();
  const channelName = getStageChatChannelName(projectId, stageId);
  const commentId =
    "commentId" in payload ? payload.commentId : payload.changedEntityId ?? null;

  logAblyServer(`publish ${eventName} start`, {
    projectId,
    stageId,
    channelName,
    commentId,
    eventId: payload.eventId,
  });

  if (!client) {
    logAblyServer(`publish ${eventName} failure`, {
      projectId,
      stageId,
      channelName,
      commentId,
      eventId: payload.eventId,
      reason: "ABLY_API_KEY missing",
    });
    return false;
  }

  const channel = client.channels.get(channelName);

  try {
    await channel.publish(eventName, payload);
  } catch (error) {
    logAblyServer(`publish ${eventName} failure`, {
      projectId,
      stageId,
      channelName,
      commentId,
      eventId: payload.eventId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }

  logAblyServer(`publish ${eventName} success`, {
    projectId,
    stageId,
    channelName,
    commentId,
    eventId: payload.eventId,
  });

  return true;
}

export async function publishAblyStageChatMessageCreated(
  payload: StageChatRealtimeMessageCreatedPayload,
) {
  return publishStageChatEvent(
    payload.projectId,
    payload.stageId,
    STAGE_CHAT_REALTIME_EVENTS.messageCreated,
    payload,
  );
}

export async function publishAblyStageChatMessageDeleted(
  payload: StageChatRealtimeMessageDeletedPayload,
) {
  return publishStageChatEvent(
    payload.projectId,
    payload.stageId,
    STAGE_CHAT_REALTIME_EVENTS.messageDeleted,
    payload,
  );
}

export async function publishAblyStageChatTimelineUpdated(
  payload: StageChatRealtimeTimelineUpdatedPayload,
) {
  return publishStageChatEvent(
    payload.projectId,
    payload.stageId,
    STAGE_CHAT_REALTIME_EVENTS.timelineUpdated,
    payload,
  );
}

export async function publishAblyProjectAccessRevoked(
  payload: ProjectAccessRevokedPayload,
) {
  const client = getAblyRestClient();
  const channelName = getProjectAccessChannelName(payload.projectId);

  if (!client) {
    return false;
  }

  const channel = client.channels.get(channelName);
  await channel.publish(PROJECT_ACCESS_REALTIME_EVENTS.accessRevoked, payload);
  return true;
}

export async function publishAblyNotificationChanged(
  payload: NotificationRealtimeChangedPayload,
) {
  const client = getAblyRestClient();

  if (!client) {
    return false;
  }

  const channel = client.channels.get(
    getNotificationChannelName(payload.recipientUserId),
  );
  await channel.publish(NOTIFICATION_REALTIME_EVENTS.changed, payload);
  return true;
}
