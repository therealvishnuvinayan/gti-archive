import { randomUUID } from "node:crypto";
import { revalidateTag } from "next/cache";
import { after, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import {
  completeAttachmentUpload,
  getStageChatCommentEntryForUser,
} from "@/lib/project-history";
import type { LibraryUploadMetadata } from "@/lib/library-shared";
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
    attachmentId?: string;
    failed?: boolean;
    projectId?: string;
    metadata?: LibraryUploadMetadata;
  } = {};

  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ error: "Invalid completion request." }, { status: 400 });
  }

  if (!payload.attachmentId) {
    return NextResponse.json({ error: "Attachment id is required." }, { status: 400 });
  }

  try {
    const result = await completeAttachmentUpload(
      user,
      payload.attachmentId,
      Boolean(payload.failed),
      payload.metadata,
    );
    after(() => {
      revalidateTag(PROJECTS_CACHE_TAG, "max");
    });
    if (result?.invoiceCommentId && result.stageId && !payload.failed) {
      runStageChatRealtimeTaskAfterResponse("stage-chat.invoice-uploaded", async () => {
        const realtimeEntry = await getStageChatCommentEntryForUser(user, {
          projectId: result.projectId,
          stageId: result.stageId ?? "",
          commentId: result.invoiceCommentId ?? "",
        });

        if (!realtimeEntry) {
          return;
        }

        await publishStageChatMessageCreated({
          eventId: randomUUID(),
          projectId: result.projectId,
          stageId: result.stageId ?? "",
          id: realtimeEntry.entry.id,
          commentId: result.invoiceCommentId ?? "",
          senderId: realtimeEntry.authorId,
          entry: realtimeEntry.entry,
          createdAt: realtimeEntry.createdAt,
          deletedAt: null,
          clientTempId: null,
        });
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to complete the upload right now.",
      },
      { status: 400 },
    );
  }
}
