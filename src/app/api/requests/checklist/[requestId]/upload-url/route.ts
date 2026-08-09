import { AttachmentAssetType } from "@prisma/client";
import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { requestAttachmentUpload } from "@/lib/project-history";
import { getStageFiveChecklistRequestUploadContext } from "@/lib/stage-five";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ requestId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { requestId } = await params;
  const context = await getStageFiveChecklistRequestUploadContext(user, requestId);
  if (!context) {
    return NextResponse.json({ error: "This information request cannot accept uploads." }, { status: 403 });
  }

  let payload: {
    originalFileName?: string;
    mimeType?: string;
    fileSize?: number;
  } = {};
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ error: "Invalid upload request." }, { status: 400 });
  }
  if (
    !payload.originalFileName ||
    !payload.mimeType ||
    typeof payload.fileSize !== "number"
  ) {
    return NextResponse.json({ error: "Missing required upload fields." }, { status: 400 });
  }

  const result = await requestAttachmentUpload(user, {
    projectId: context.projectId,
    originalFileName: payload.originalFileName,
    mimeType: payload.mimeType,
    fileSize: payload.fileSize,
    assetType: AttachmentAssetType.FILE_CHECKLIST_ATTACHMENT,
    checklistRequestId: context.requestId,
  });
  return NextResponse.json(result, { status: "error" in result ? 400 : 200 });
}
