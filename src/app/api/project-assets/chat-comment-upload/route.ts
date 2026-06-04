import { revalidateTag } from "next/cache";
import { after, NextResponse } from "next/server";
import { AttachmentAssetType } from "@prisma/client";

import { getCurrentUser } from "@/lib/auth";
import {
  prepareStageCommentUploads,
  type PrepareStageCommentUploadsInput,
} from "@/lib/project-history";
import { PROJECTS_CACHE_TAG } from "@/lib/projects";

function isChatUploadAssetType(
  value: unknown,
): value is "COMMENT_ATTACHMENT" | "STAGE_SUBMISSION" {
  return (
    value === AttachmentAssetType.COMMENT_ATTACHMENT ||
    value === AttachmentAssetType.STAGE_SUBMISSION
  );
}

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let payload: Partial<PrepareStageCommentUploadsInput> = {};

  try {
    payload = (await request.json()) as Partial<PrepareStageCommentUploadsInput>;
  } catch {
    return NextResponse.json({ error: "Invalid upload request." }, { status: 400 });
  }

  if (
    !payload.projectId ||
    !payload.stageId ||
    typeof payload.body !== "string" ||
    !Array.isArray(payload.files) ||
    payload.files.length === 0 ||
    payload.files.some(
      (file) =>
        !file ||
        !file.originalFileName ||
        !file.mimeType ||
        typeof file.fileSize !== "number" ||
        !isChatUploadAssetType(file.assetType),
    )
  ) {
    return NextResponse.json({ error: "Missing required upload fields." }, { status: 400 });
  }

  const result = await prepareStageCommentUploads(user, {
    projectId: payload.projectId,
    stageId: payload.stageId,
    body: payload.body,
    allowEmptyBody: Boolean(payload.allowEmptyBody),
    mentionedUserIds: payload.mentionedUserIds ?? [],
    files: payload.files.map((file) => ({
      clientId: file.clientId,
      originalFileName: file.originalFileName,
      mimeType: file.mimeType,
      fileSize: file.fileSize,
      assetType: file.assetType,
    })),
  });

  if ("error" in result) {
    return NextResponse.json(result, { status: 400 });
  }

  after(() => {
    revalidateTag(PROJECTS_CACHE_TAG, "max");
  });

  return NextResponse.json(result);
}
