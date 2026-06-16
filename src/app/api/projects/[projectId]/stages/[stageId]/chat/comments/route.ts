import { NextResponse } from "next/server";

import { getCurrentUser, getUserDisplayName } from "@/lib/auth";
import {
  notifyCommentAdded,
  notifyCommentMentioned,
  runNotificationTaskAfterResponse,
} from "@/lib/notification-center";
import { createStageTextCommentFast } from "@/lib/project-history";
import { logStageChatTiming, shouldLogStageChatTimings } from "@/lib/stage-chat-timing";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type CreateCommentPayload = {
  revisionId?: string | null;
  body?: string;
  mentionedUserIds?: string[];
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
  const authStartedAt = performance.now();
  const user = await getCurrentUser();
  logStageChatTiming("send", "auth/session", authStartedAt);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const paramsStartedAt = performance.now();
  const { projectId, stageId } = await params;
  logStageChatTiming("send", "route params", paramsStartedAt, {
    projectId,
    stageId,
  });

  const parseStartedAt = performance.now();
  const payload = (await request.json().catch(() => ({}))) as CreateCommentPayload;
  logStageChatTiming("send", "request parsing", parseStartedAt);

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
    logStageChatTiming("send", "notification scheduling", notificationScheduleStartedAt, {
      mentionedUsers: comment.mentions.length,
    });

    if (shouldLogStageChatTimings()) {
      console.log("[stage-chat:send] message refetch", { ms: 0, skipped: true });
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
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
    logStageChatTiming("send", "response serialization", responseSerializationStartedAt, {
      commentId: comment.id,
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
