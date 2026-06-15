import { revalidateTag } from "next/cache";
import { after, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { completePreparedChatAttachmentUpload } from "@/lib/project-history";
import { PROJECTS_CACHE_TAG } from "@/lib/projects";

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let payload: {
    attachmentId?: string;
    projectId?: string;
    failed?: boolean;
  } = {};

  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ error: "Invalid completion request." }, { status: 400 });
  }

  if (!payload.attachmentId || !payload.projectId) {
    return NextResponse.json(
      { error: "Attachment and project are required." },
      { status: 400 },
    );
  }

  try {
    await completePreparedChatAttachmentUpload(user, {
      attachmentId: payload.attachmentId,
      projectId: payload.projectId,
      failed: Boolean(payload.failed),
    });
    after(() => {
      revalidateTag(PROJECTS_CACHE_TAG, "max");
    });

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
