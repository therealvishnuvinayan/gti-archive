"use client";

import * as Ably from "ably";

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

function isAblyTokenRequest(value: unknown): value is Ably.TokenRequest {
  return (
    typeof value === "object" &&
    value !== null &&
    "capability" in value &&
    "keyName" in value &&
    "mac" in value &&
    "nonce" in value &&
    "timestamp" in value
  );
}

export function isStageChatRealtimeClientEnabled() {
  const enabled = process.env.NEXT_PUBLIC_REALTIME_PROVIDER === "ably";

  logAblyClient(enabled ? "enabled" : "disabled", {
    provider: process.env.NEXT_PUBLIC_REALTIME_PROVIDER ?? null,
  });

  return enabled;
}

export function createStageChatRealtimeClient(input: {
  projectId: string;
  stageId: string;
}) {
  const authParams = new URLSearchParams({
    projectId: input.projectId,
    stageId: input.stageId,
  });
  const authUrl = `/api/realtime/ably/token?${authParams.toString()}`;

  logAblyClient("create realtime client", {
    projectId: input.projectId,
    stageId: input.stageId,
    authUrl,
  });

  return new Ably.Realtime({
    authCallback: (_tokenParams, callback) => {
      logAblyClient("token request start", {
        projectId: input.projectId,
        stageId: input.stageId,
        authUrl,
      });

      fetch(authUrl, {
        cache: "no-store",
      })
        .then(async (response) => {
          const payload = (await response.json().catch(() => null)) as
            | Ably.TokenRequest
            | { error?: string }
            | null;

          if (!response.ok || !isAblyTokenRequest(payload)) {
            const message =
              payload && "error" in payload && payload.error
                ? payload.error
                : "Unable to obtain Ably token.";
            logAblyClient("token request failure", {
              projectId: input.projectId,
              stageId: input.stageId,
              status: response.status,
              error: message,
            });
            callback(message, null);
            return;
          }

          logAblyClient("token request success", {
            projectId: input.projectId,
            stageId: input.stageId,
            status: response.status,
          });
          callback(null, payload);
        })
        .catch((error) => {
          const message =
            error instanceof Error ? error.message : "Unable to obtain Ably token.";
          logAblyClient("token request failure", {
            projectId: input.projectId,
            stageId: input.stageId,
            error: message,
          });
          callback(message, null);
        });
    },
    useTokenAuth: true,
    autoConnect: true,
  });
}

export function createProjectAccessRealtimeClient(input: {
  projectId: string;
}) {
  const authParams = new URLSearchParams({
    projectId: input.projectId,
    scope: "project-access",
  });
  const authUrl = `/api/realtime/ably/token?${authParams.toString()}`;

  logAblyClient("create project access realtime client", {
    projectId: input.projectId,
    authUrl,
  });

  return new Ably.Realtime({
    authCallback: (_tokenParams, callback) => {
      fetch(authUrl, {
        cache: "no-store",
      })
        .then(async (response) => {
          const payload = (await response.json().catch(() => null)) as
            | Ably.TokenRequest
            | { error?: string }
            | null;

          if (!response.ok || !isAblyTokenRequest(payload)) {
            const message =
              payload && "error" in payload && payload.error
                ? payload.error
                : "Unable to obtain Ably token.";
            callback(message, null);
            return;
          }

          callback(null, payload);
        })
        .catch((error) => {
          const message =
            error instanceof Error ? error.message : "Unable to obtain Ably token.";
          callback(message, null);
        });
    },
    useTokenAuth: true,
    autoConnect: true,
  });
}

export function createNotificationRealtimeClient() {
  const authUrl = "/api/realtime/ably/token?scope=notifications";

  return new Ably.Realtime({
    authCallback: (_tokenParams, callback) => {
      fetch(authUrl, { cache: "no-store" })
        .then(async (response) => {
          const payload = (await response.json().catch(() => null)) as
            | Ably.TokenRequest
            | { error?: string }
            | null;

          if (!response.ok || !isAblyTokenRequest(payload)) {
            const message =
              payload && "error" in payload && payload.error
                ? payload.error
                : "Unable to obtain notification realtime access.";
            callback(message, null);
            return;
          }

          callback(null, payload);
        })
        .catch((error) => {
          callback(
            error instanceof Error
              ? error.message
              : "Unable to obtain notification realtime access.",
            null,
          );
        });
    },
    useTokenAuth: true,
    autoConnect: true,
  });
}

export type StageChatRealtimeClient = ReturnType<
  typeof createStageChatRealtimeClient
>;

export type ProjectAccessRealtimeClient = ReturnType<
  typeof createProjectAccessRealtimeClient
>;

export type NotificationRealtimeClient = ReturnType<
  typeof createNotificationRealtimeClient
>;
