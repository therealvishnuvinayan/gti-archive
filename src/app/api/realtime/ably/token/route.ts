import { NextResponse } from "next/server";

import { getCurrentUser, getUserDisplayName } from "@/lib/auth";
import {
  canBypassCollaboratorVisibility,
  getProjectCollaboratorVisibilityState,
} from "@/lib/project-collaborator-visibility";
import { hasPermission, hasProjectPermission } from "@/lib/permissions/resolver";
import { prisma, withPrismaRetry } from "@/lib/prisma";
import {
  createNotificationRealtimeTokenRequest,
  createProjectAccessRealtimeTokenRequest,
  createStageChatRealtimeTokenRequest,
  getProjectAccessChannelName,
  getStageChatChannelName,
  getRealtimeProvider,
  isStageChatRealtimeConfigured,
} from "@/lib/realtime/server";
import { getLockedStageInfo } from "@/lib/stage-locking";
import { canOpenProjectStageChatContainer } from "@/lib/workflow-stage-access";
import { assertConceptTaskerAccessIfNeeded } from "@/lib/project-concept-access";

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

  if (isProjectAccessScope) {
    const project = await withPrismaRetry(() =>
      prisma.project.findUnique({
        where: {
          id: projectId,
        },
        select: {
          ownerId: true,
          coOwners: { select: { userId: true } },
          executors: {
            select: {
              userId: true,
            },
          },
          collaborators: {
            select: {
              userId: true,
            },
          },
        },
      }),
    );

    if (!project) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }

    if (!hasProjectPermission(user, project, "project.view")) {
      return NextResponse.json(
        { error: "You do not have permission to view this project." },
        { status: 403 },
      );
    }

    if (
      !canBypassCollaboratorVisibility(user, project.ownerId ?? "") &&
      !hasProjectPermission(user, project, "collaborator.pauseVisibility")
    ) {
      const visibilityState = await getProjectCollaboratorVisibilityState(
        projectId,
        user.id,
      );

      if (visibilityState?.chatVisibilityPaused) {
        return NextResponse.json(
          { error: "You do not have permission to view this project." },
          { status: 403 },
        );
      }
    }

    const tokenRequest = await createProjectAccessRealtimeTokenRequest({
      projectId,
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

  const activeStageId = stageId;

  if (!activeStageId) {
    return NextResponse.json(
      { error: "Project and stage are required." },
      { status: 400 },
    );
  }

  const stage = await withPrismaRetry(() =>
    prisma.projectStage.findUnique({
      where: {
        id: activeStageId,
      },
      select: {
        id: true,
        projectId: true,
        isTasker: true,
        conceptFolder: {
          select: {
            workflowStageKey: true,
          },
        },
        project: {
          select: {
            ownerId: true,
            coOwners: { select: { userId: true } },
            executors: {
              select: {
                userId: true,
              },
            },
            collaborators: {
              select: {
                userId: true,
              },
            },
            workflowStages: {
              select: {
                stageKey: true,
                status: true,
              },
            },
            stages: {
              orderBy: {
                order: "asc",
              },
              select: {
                id: true,
                name: true,
                order: true,
                status: true,
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
    !canOpenProjectStageChatContainer({
      user,
      isTasker: stage.isTasker,
      conceptFolder: stage.conceptFolder,
      workflowStages: stage.project.workflowStages,
    })
  ) {
    return NextResponse.json(
      { error: "This workflow stage is locked." },
      { status: 403 },
    );
  }

  try {
    await assertConceptTaskerAccessIfNeeded(user, {
      projectId,
      stageId: activeStageId,
      mode: "view",
    });
  } catch (error) {
    logAblyToken("token denied", {
      reason: "Concept participant access denied.",
      userId: user.id,
      projectId,
      stageId,
      channelName,
    });
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "You do not have permission to view this concept chat.",
      },
      { status: 403 },
    );
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
  const lockedStageInfo = stage.isTasker
    ? null
    : getLockedStageInfo(stage.project.stages, activeStageId);

  if (lockedStageInfo) {
    logAblyToken("token denied", {
      reason: lockedStageInfo.message,
      userId: user.id,
      projectId,
      stageId,
      channelName,
    });
    return NextResponse.json({ error: lockedStageInfo.message }, { status: 403 });
  }

  if (
    !canBypassCollaboratorVisibility(user, stage.project.ownerId ?? "") &&
    !hasProjectPermission(user, stage.project, "collaborator.pauseVisibility")
  ) {
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
    stageId: activeStageId,
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
