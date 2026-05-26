import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { completeAttachmentUpload } from "@/lib/project-history";
import { PROJECTS_CACHE_TAG } from "@/lib/projects";

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let payload: { attachmentId?: string; failed?: boolean; projectId?: string } = {};

  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ error: "Invalid completion request." }, { status: 400 });
  }

  if (!payload.attachmentId) {
    return NextResponse.json({ error: "Attachment id is required." }, { status: 400 });
  }

  try {
    await completeAttachmentUpload(user, payload.attachmentId, Boolean(payload.failed));
    revalidateTag(PROJECTS_CACHE_TAG, "max");

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
