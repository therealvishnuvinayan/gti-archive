import { randomUUID } from "node:crypto";
import { revalidateTag } from "next/cache";
import { after, NextResponse } from "next/server";

import { getCurrentUser, getUserDisplayName } from "@/lib/auth";
import {
  notifyCommentAdded,
  notifyCommentMentioned,
  runNotificationTaskAfterResponse,
} from "@/lib/notification-center";
import {
  finalizePreparedStageCommentUploads,
  getStageChatCommentEntryForUser,
} from "@/lib/project-history";
import { PROJECTS_CACHE_TAG } from "@/lib/projects";
import {
  publishStageChatMessageCreated,
  runStageChatRealtimeTaskAfterResponse,
} from "@/lib/realtime/server";

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let payload: {
    projectId?: string;
    commentId?: string;
  } = {};

  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ error: "Invalid finalize request." }, { status: 400 });
  }

  if (!payload.projectId || !payload.commentId) {
    return NextResponse.json(
      { error: "Project and comment are required." },
      { status: 400 },
    );
  }

  try {
    const result = await finalizePreparedStageCommentUploads(user, {
      projectId: payload.projectId,
      commentId: payload.commentId,
    });
    after(() => {
      revalidateTag(PROJECTS_CACHE_TAG, "max");
    });

    runNotificationTaskAfterResponse("comment-added", () =>
      notifyCommentAdded({
        actorId: user.id,
        actorName: getUserDisplayName(user),
        projectId: payload.projectId!,
        stageId: result.stageId,
        commentId: result.commentId,
        excludedRecipientUserIds: result.mentionedUserIds,
      }),
    );
    runNotificationTaskAfterResponse("comment-mentioned", () =>
      notifyCommentMentioned({
        actorId: user.id,
        actorName: getUserDisplayName(user),
        projectId: payload.projectId!,
        stageId: result.stageId,
        commentId: result.commentId,
        mentionedUserIds: result.mentionedUserIds,
      }),
    );
    runStageChatRealtimeTaskAfterResponse("stage-chat.message.created", async () => {
      const realtimeEntry = await getStageChatCommentEntryForUser(user, {
        projectId: payload.projectId!,
        stageId: result.stageId,
        commentId: result.commentId,
      });

      if (!realtimeEntry) {
        return;
      }

      await publishStageChatMessageCreated({
        eventId: randomUUID(),
        projectId: payload.projectId!,
        stageId: result.stageId,
        id: realtimeEntry.entry.id,
        commentId: result.commentId,
        senderId: realtimeEntry.authorId,
        entry: realtimeEntry.entry,
        createdAt: realtimeEntry.createdAt,
        deletedAt: null,
        clientTempId: null,
      });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to finalize the upload right now.",
      },
      { status: 400 },
    );
  }
}
