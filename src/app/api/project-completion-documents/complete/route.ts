import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { ProjectCompletionDocumentType } from "@prisma/client";

import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  finalizeProjectCompletionDocumentUpload,
  getProjectCompletionWorkflowForUser,
} from "@/lib/project-completion";
import {
  publishStageChatTimelineUpdated,
  runStageChatRealtimeTaskAfterResponse,
} from "@/lib/realtime/server";
import { UploadFileTypeError } from "@/lib/upload-validation";

function isProjectCompletionDocumentType(
  value: unknown,
): value is ProjectCompletionDocumentType {
  return Object.values(ProjectCompletionDocumentType).includes(
    value as ProjectCompletionDocumentType,
  );
}

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let payload: {
    projectId?: string;
    documentType?: ProjectCompletionDocumentType;
    originalFileName?: string;
    mimeType?: string;
    fileSize?: number;
    storageKey?: string;
    failed?: boolean;
  } = {};

  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ error: "Invalid completion request." }, { status: 400 });
  }

  if (
    !payload.projectId ||
    !payload.originalFileName ||
    !payload.mimeType ||
    typeof payload.fileSize !== "number" ||
    !payload.storageKey ||
    !isProjectCompletionDocumentType(payload.documentType)
  ) {
    return NextResponse.json({ error: "Missing required completion fields." }, { status: 400 });
  }

  try {
    const projectId = payload.projectId;

    await finalizeProjectCompletionDocumentUpload(user, {
      projectId,
      documentType: payload.documentType,
      originalFileName: payload.originalFileName,
      mimeType: payload.mimeType,
      fileSize: payload.fileSize,
      storageKey: payload.storageKey,
      failed: payload.failed,
    });
    const workflow = payload.failed
      ? null
      : await getProjectCompletionWorkflowForUser(user, projectId);
    if (!payload.failed) {
      runStageChatRealtimeTaskAfterResponse(
        "stage-chat.completion-document-uploaded",
        async () => {
          const stages = await prisma.projectStage.findMany({
            where: {
              projectId,
            },
            select: {
              id: true,
            },
          });

          await Promise.all(
            stages.map((stage) =>
              publishStageChatTimelineUpdated({
                eventId: randomUUID(),
                projectId,
                stageId: stage.id,
                eventType: "completion_updated",
                changedEntityId: projectId,
                actorId: user.id,
                updatedAt: new Date().toISOString(),
              }),
            ),
          );
        },
      );
    }

    return NextResponse.json({ ok: true, workflow });
  } catch (error) {
    if (error instanceof UploadFileTypeError) {
      return NextResponse.json(error.payload, { status: 400 });
    }

    const message =
      error instanceof Error
        ? error.message
        : "Unable to finalise the completion document upload.";

    return NextResponse.json(
      { error: message },
      {
        status: /permission|access|owner|executor/i.test(message) ? 403 : 400,
      },
    );
  }
}
