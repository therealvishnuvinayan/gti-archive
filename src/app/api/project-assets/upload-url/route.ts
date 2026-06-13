import { NextResponse } from "next/server";
import { AttachmentAssetType } from "@prisma/client";

import { getCurrentUser } from "@/lib/auth";
import {
  requestAttachmentUpload,
  type RequestUploadInput,
} from "@/lib/project-history";

function isAttachmentAssetType(value: unknown): value is AttachmentAssetType {
  return Object.values(AttachmentAssetType).includes(value as AttachmentAssetType);
}

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let payload: Partial<RequestUploadInput> = {};

  try {
    payload = (await request.json()) as Partial<RequestUploadInput>;
  } catch {
    return NextResponse.json({ error: "Invalid upload request." }, { status: 400 });
  }

  if (
    !payload.projectId ||
    !payload.originalFileName ||
    !payload.mimeType ||
    typeof payload.fileSize !== "number" ||
    !isAttachmentAssetType(payload.assetType)
  ) {
    return NextResponse.json({ error: "Missing required upload fields." }, { status: 400 });
  }

  const result = await requestAttachmentUpload(user, {
    projectId: payload.projectId,
    stageId: payload.stageId ?? null,
    revisionId: payload.revisionId ?? null,
    commentId: payload.commentId ?? null,
    originalFileName: payload.originalFileName,
    mimeType: payload.mimeType,
    fileSize: payload.fileSize,
    assetType: payload.assetType,
    assetTagIds: Array.isArray(payload.assetTagIds) ? payload.assetTagIds : [],
  });

  if ("error" in result) {
    return NextResponse.json(result, { status: 400 });
  }

  return NextResponse.json(result);
}
