import { NextResponse } from "next/server";

import { getCurrentUser, getUserDisplayName } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions/resolver";
import {
  createNotificationRealtimeTokenRequest,
  getProjectAccessChannelName,
  getRealtimeProvider,
  getStageChatChannelName,
  isStageChatRealtimeConfigured
} from "@/lib/realtime/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function buildRealtimeClientId(userId: string) {
  const prefix = process.env.NEXT_PUBLIC_ABLY_CLIENT_ID_PREFIX?.trim() || "gti";
  const safePrefix = prefix.replace(/[^a-zA-Z0-9:_-]/g, "-").slice(0, 24) || "gti";

  return `${safePrefix}:user:${userId}`;
}

function logAblyToken(message: string, details?: Record<string, unknown>) {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  if (details) {
    console.info(`[ably:token] ${message}`, details);
    return;
  }

  console.info(`[ably:token] ${message}`);
}

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const projectId = searchParams.get("projectId")?.trim();
  const stageId = searchParams.get("stageId")?.trim();
  const scope = searchParams.get("scope")?.trim();
  const isProjectAccessScope = scope === "project-access";
  const isNotificationScope = scope === "notifications";
  const channelName =
    projectId && isProjectAccessScope
      ? getProjectAccessChannelName(projectId)
      : projectId && stageId
        ? getStageChatChannelName(projectId, stageId)
        : null;

  logAblyToken("endpoint called", {
    provider: getRealtimeProvider(),
    hasAblyApiKey: Boolean(process.env.ABLY_API_KEY?.trim()),
    projectId: projectId ?? null,
    stageId: stageId ?? null,
    scope: scope ?? null,
    channelName,
  });

  if (getRealtimeProvider() !== "ably" || !isStageChatRealtimeConfigured()) {
    logAblyToken("token denied", {
      reason: "Realtime is not configured.",
      provider: getRealtimeProvider(),
      hasAblyApiKey: Boolean(process.env.ABLY_API_KEY?.trim()),
      projectId: projectId ?? null,
      stageId: stageId ?? null,
      channelName,
    });
    return NextResponse.json(
      { error: "Realtime is not configured." },
      { status: 503 },
    );
  }

  const user = await getCurrentUser();

  if (!user) {
    logAblyToken("token denied", {
      reason: "Unauthorized.",
      projectId: projectId ?? null,
      stageId: stageId ?? null,
      channelName,
    });
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (isNotificationScope) {
    if (!hasPermission(user, "notification.view")) {
      return NextResponse.json(
        { error: "You do not have permission to view notifications." },
        { status: 403 },
      );
    }

    const tokenRequest = await createNotificationRealtimeTokenRequest({
      userId: user.id,
      clientId: buildRealtimeClientId(user.id),
    });

    if (!tokenRequest) {
      return NextResponse.json(
        { error: "Realtime is not configured." },
        { status: 503 },
      );
    }

    return NextResponse.json(tokenRequest, {
      headers: {
        "Cache-Control": "no-store",
        "X-Realtime-User": getUserDisplayName(user),
      },
    });
  }

  if (!projectId || (!isProjectAccessScope && !stageId)) {
    logAblyToken("token denied", {
      reason: isProjectAccessScope
        ? "Project is required."
        : "Project and stage are required.",
      userId: user.id,
      projectId: projectId ?? null,
      stageId: stageId ?? null,
      channelName,
    });
    return NextResponse.json(
      {
        error: isProjectAccessScope
          ? "Project is required."
          : "Project and stage are required.",
      },
      { status: 400 },
    );
  }

  // Persistent subscriptions cannot revalidate the V2 session on each event.
  return NextResponse.json({error: "Project live updates are unavailable."}, {status: 403});

}
