import { after } from "next/server";

import {
  getStageChatChannelName,
  type StageChatRealtimeMessageCreatedPayload,
  type StageChatRealtimeMessageDeletedPayload,
} from "@/lib/realtime/events";

import {
  createAblyStageChatTokenRequest,
  isAblyServerConfigured,
  publishAblyStageChatMessageCreated,
  publishAblyStageChatMessageDeleted,
  warnAblyNotConfigured,
} from "./ably-server";

export { getStageChatChannelName };

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
