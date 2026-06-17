import { NextResponse } from "next/server";

import { getCurrentUser, getUserDisplayName } from "@/lib/auth";
import {
  canBypassCollaboratorVisibility,
  getProjectCollaboratorVisibilityState,
} from "@/lib/project-collaborator-visibility";
import { hasProjectPermission } from "@/lib/permissions/resolver";
import { prisma, withPrismaRetry } from "@/lib/prisma";
import {
  createStageChatRealtimeTokenRequest,
  getStageChatChannelName,
  getRealtimeProvider,
  isStageChatRealtimeConfigured,
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
  const channelName =
    projectId && stageId ? getStageChatChannelName(projectId, stageId) : null;

  logAblyToken("endpoint called", {
    provider: getRealtimeProvider(),
    hasAblyApiKey: Boolean(process.env.ABLY_API_KEY?.trim()),
    projectId: projectId ?? null,
    stageId: stageId ?? null,
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

  if (!projectId || !stageId) {
    logAblyToken("token denied", {
      reason: "Project and stage are required.",
      userId: user.id,
      projectId: projectId ?? null,
      stageId: stageId ?? null,
      channelName,
    });
    return NextResponse.json(
      { error: "Project and stage are required." },
      { status: 400 },
    );
  }

  const stage = await withPrismaRetry(() =>
    prisma.projectStage.findUnique({
      where: {
        id: stageId,
      },
      select: {
        id: true,
        projectId: true,
        project: {
          select: {
            createdById: true,
            executors: {
              select: {
                userId: true,
                role: true,
              },
            },
            collaborators: {
              select: {
                userId: true,
              },
            },
          },
        },
      },
    }),
  );

  if (!stage || stage.projectId !== projectId) {
    logAblyToken("token denied", {
      reason: "Stage not found.",
      userId: user.id,
      projectId,
      stageId,
      channelName,
    });
    return NextResponse.json({ error: "Stage not found." }, { status: 404 });
  }

  if (
    !hasProjectPermission(user, stage.project, "project.view") ||
    !hasProjectPermission(user, stage.project, "chat.view")
  ) {
    logAblyToken("token denied", {
      reason: "Permission denied.",
      userId: user.id,
      projectId,
      stageId,
      channelName,
    });
    return NextResponse.json(
      { error: "You do not have permission to view this stage chat." },
      { status: 403 },
    );
  }

  if (!canBypassCollaboratorVisibility(user, stage.project.createdById)) {
    const visibilityState = await getProjectCollaboratorVisibilityState(
      projectId,
      user.id,
    );

    if (visibilityState?.chatVisibilityPaused) {
      logAblyToken("token denied", {
        reason: "Chat visibility paused.",
        userId: user.id,
        projectId,
        stageId,
        channelName,
      });
      return NextResponse.json(
        { error: "You do not have permission to view live chat updates." },
        { status: 403 },
      );
    }
  }

  const tokenRequest = await createStageChatRealtimeTokenRequest({
    projectId,
    stageId,
    clientId: buildRealtimeClientId(user.id),
  });

  if (!tokenRequest) {
    logAblyToken("token denied", {
      reason: "Token request was not created.",
      userId: user.id,
      projectId,
      stageId,
      channelName,
    });
    return NextResponse.json(
      { error: "Realtime is not configured." },
      { status: 503 },
    );
  }

  logAblyToken("token issued", {
    userId: user.id,
    clientId: tokenRequest.clientId,
    projectId,
    stageId,
    channelName,
  });

  return NextResponse.json(tokenRequest, {
    headers: {
      "Cache-Control": "no-store",
      "X-Realtime-User": getUserDisplayName(user),
    },
  });
}
