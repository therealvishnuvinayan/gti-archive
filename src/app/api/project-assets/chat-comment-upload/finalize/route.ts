import { revalidateTag } from "next/cache";
import { after, NextResponse } from "next/server";

import { getCurrentUser, getUserDisplayName } from "@/lib/auth";
import {
  notifyCommentAdded,
  notifyCommentMentioned,
  runNotificationTaskAfterResponse,
} from "@/lib/notification-center";
import { finalizePreparedStageCommentUploads } from "@/lib/project-history";
import { PROJECTS_CACHE_TAG } from "@/lib/projects";

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
