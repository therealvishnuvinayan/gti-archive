import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { completeAttachmentUpload } from "@/lib/project-history";
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

  let payload: { attachmentId?: string; failed?: boolean } = {};
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ error: "Invalid completion request." }, { status: 400 });
  }
  if (!payload.attachmentId) {
    return NextResponse.json({ error: "Attachment id is required." }, { status: 400 });
  }

  try {
    await completeAttachmentUpload(
      user,
      payload.attachmentId,
      Boolean(payload.failed),
      undefined,
      { checklistRequestId: context.requestId },
    );
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to complete this upload.",
      },
      { status: 400 },
    );
  }
}
