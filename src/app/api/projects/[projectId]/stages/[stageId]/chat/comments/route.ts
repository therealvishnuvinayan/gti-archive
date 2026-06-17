import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { getCurrentUser, getUserDisplayName } from "@/lib/auth";
import {
  notifyCommentAdded,
  notifyCommentMentioned,
  runNotificationTaskAfterResponse,
} from "@/lib/notification-center";
import { createStageTextCommentFast } from "@/lib/project-history";
import {
  publishStageChatMessageCreated,
  runStageChatRealtimeTaskAfterResponse,
} from "@/lib/realtime/server";
import {
  logChatSendFastTiming,
  logStageChatTiming,
  shouldLogStageChatTimings,
} from "@/lib/stage-chat-timing";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type CreateCommentPayload = {
  revisionId?: string | null;
  body?: string;
  mentionedUserIds?: string[];
  clientTempId?: string | null;
};

export async function POST(
  request: Request,
  {
    params,
  }: {
    params: Promise<{
      projectId: string;
      stageId: string;
    }>;
  },
) {
  const totalStartedAt = performance.now();
  logChatSendFastTiming("request start", totalStartedAt);

  const paramsStartedAt = performance.now();
  const { projectId, stageId } = await params;
  logChatSendFastTiming("route params", paramsStartedAt, {
    projectId,
    stageId,
  });
  logStageChatTiming("send", "route params", paramsStartedAt, {
    projectId,
    stageId,
  });

  const parseStartedAt = performance.now();
  const payload = (await request.json().catch(() => ({}))) as CreateCommentPayload;
  logChatSendFastTiming("parse body", parseStartedAt, {
    hasRevisionId: Boolean(payload.revisionId),
    mentionedUsers: payload.mentionedUserIds?.length ?? 0,
  });
  logStageChatTiming("send", "request parsing", parseStartedAt);

  const authStartedAt = performance.now();
  const user = await getCurrentUser();
  logChatSendFastTiming("auth", authStartedAt, {
    authenticated: Boolean(user),
  });
  logStageChatTiming("send", "auth/session", authStartedAt);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  logChatSendFastTiming("permission snapshot", performance.now(), {
    hasPermissionProfileSnapshot: Boolean(user.permissionProfileSnapshot),
    permissionCount: user.permissionProfileSnapshot?.effectivePermissions.size ?? null,
  });

  try {
    const comment = await createStageTextCommentFast(user, {
      projectId,
      stageId,
      revisionId: payload.revisionId ?? null,
      body: payload.body ?? "",
      mentionedUserIds: payload.mentionedUserIds ?? [],
    });

    const notificationScheduleStartedAt = performance.now();
    runNotificationTaskAfterResponse("comment-added", async () => {
      const notificationStartedAt = performance.now();
      await notifyCommentAdded({
        actorId: user.id,
        actorName: getUserDisplayName(user),
        projectId,
        stageId,
        commentId: comment.id,
        excludedRecipientUserIds: comment.mentions.map(
          (mention) => mention.mentionedUserId,
        ),
      });
      logStageChatTiming("send", "notification creation comment-added", notificationStartedAt);
    });
    runNotificationTaskAfterResponse("comment-mentioned", async () => {
      const notificationStartedAt = performance.now();
      await notifyCommentMentioned({
        actorId: user.id,
        actorName: getUserDisplayName(user),
        projectId,
        stageId,
        commentId: comment.id,
        mentionedUserIds: comment.mentions.map((mention) => mention.mentionedUserId),
      });
      logStageChatTiming(
        "send",
        "notification creation comment-mentioned",
        notificationStartedAt,
      );
    });
    logChatSendFastTiming("notification scheduling", notificationScheduleStartedAt, {
      mentionedUsers: comment.mentions.length,
      afterResponse: true,
    });
    logStageChatTiming("send", "notification scheduling", notificationScheduleStartedAt, {
      mentionedUsers: comment.mentions.length,
    });
    runStageChatRealtimeTaskAfterResponse("stage-chat.message.created", async () => {
      const eventId = randomUUID();
      const ablyPublishStartedAt = performance.now();
      logChatSendFastTiming("ably publish start", ablyPublishStartedAt, {
        commentId: comment.id,
        eventId,
      });

      try {
        await publishStageChatMessageCreated({
          eventId,
          projectId,
          stageId,
          id: comment.entry.id,
          commentId: comment.id,
          senderId: comment.authorId,
          entry: comment.entry,
          createdAt: comment.createdAt.toISOString(),
          deletedAt: null,
          clientTempId: payload.clientTempId ?? null,
        });
        logChatSendFastTiming("ably publish", ablyPublishStartedAt, {
          commentId: comment.id,
          eventId,
          ok: true,
        });
      } catch (error) {
        logChatSendFastTiming("ably publish", ablyPublishStartedAt, {
          commentId: comment.id,
          eventId,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    });

    if (shouldLogStageChatTimings()) {
      console.log("[stage-chat:send] message refetch", { ms: 0, skipped: true });
      console.log("[chat-send-fast] message refetch", {
        ms: 0,
        skipped: true,
        reason: "publish DTO returned by insert path",
      });
      console.log("[stage-chat:send] revalidate/router refresh", {
        ms: 0,
        skipped: true,
      });
    }

    const responseSerializationStartedAt = performance.now();
    const response = NextResponse.json(
      {
        commentId: comment.id,
        revisionId: comment.revisionId,
        createdAt: comment.createdAt.toISOString(),
        mentionedUserIds: comment.mentions.map((mention) => mention.mentionedUserId),
        clientTempId: payload.clientTempId ?? null,
        entry: comment.entry,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
    logChatSendFastTiming("response serialization", responseSerializationStartedAt, {
      commentId: comment.id,
    });
    logStageChatTiming("send", "response serialization", responseSerializationStartedAt, {
      commentId: comment.id,
    });
    logChatSendFastTiming("total", totalStartedAt, {
      commentId: comment.id,
      transport: "fetch",
    });
    logStageChatTiming("send", "total send action response", totalStartedAt, {
      commentId: comment.id,
      transport: "fetch",
    });

    return response;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to add the comment right now.";
    const status = message.toLowerCase().includes("permission") ? 403 : 400;

    return NextResponse.json({ error: message }, { status });
  }
}
