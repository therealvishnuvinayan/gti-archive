import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { revalidatePath, revalidateTag } from "next/cache";
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
  publishStageChatTimelineUpdatedAfterResponse,
  runStageChatRealtimeTaskAfterResponse,
} from "@/lib/realtime/server";

const UPLOAD_COMPLETION_ERROR =
  "Unable to complete the upload right now. Please try again.";

function getUploadCompletionError(error: unknown) {
  const isPrismaError =
    error instanceof Prisma.PrismaClientKnownRequestError ||
    error instanceof Prisma.PrismaClientUnknownRequestError ||
    error instanceof Prisma.PrismaClientRustPanicError ||
    error instanceof Prisma.PrismaClientInitializationError ||
    error instanceof Prisma.PrismaClientValidationError ||
    (error instanceof Error && error.name.startsWith("PrismaClient"));

  if (isPrismaError || !(error instanceof Error)) {
    return { message: UPLOAD_COMPLETION_ERROR, status: 500 };
  }

  return { message: error.message, status: 400 };
}

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let payload: {
    attachmentId?: string;
    failed?: boolean;
    projectId?: string;
    stageFiveDirectSource?: boolean;
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
      payload.stageFiveDirectSource === true
        ? { stageFiveDirectSource: true }
        : undefined,
    );
    after(() => {
      revalidateTag(PROJECTS_CACHE_TAG, "max");
      if (result && "stageFiveSource" in result && result.stageFiveSource) {
        revalidatePath(`/projects/${result.projectId}/stages/5`);
      }
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
      publishStageChatTimelineUpdatedAfterResponse({
        projectId: result.projectId,
        stageId: result.stageId,
        actorId: user.id,
        eventType: "invoice_uploaded",
        changedEntityId: result.invoiceCommentId,
      });
    }
    if (result?.stageId && !payload.failed && !result.invoiceCommentId) {
      publishStageChatTimelineUpdatedAfterResponse({
        projectId: result.projectId,
        stageId: result.stageId,
        actorId: user.id,
        eventType: "attachment_uploaded",
        changedEntityId: payload.attachmentId,
      });
    }

    return NextResponse.json({
      success: true,
      invoiceCommentId: result?.invoiceCommentId ?? null,
      stageFiveSource:
        result && "stageFiveSource" in result
          ? result.stageFiveSource
          : null,
    });
  } catch (error) {
    console.error("Unable to complete project asset upload.", error);
    const response = getUploadCompletionError(error);

    return NextResponse.json(
      { error: response.message },
      { status: response.status },
    );
  }
}
