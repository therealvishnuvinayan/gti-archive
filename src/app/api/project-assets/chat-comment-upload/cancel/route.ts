import { revalidateTag } from "next/cache";
import { after, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { cancelPreparedStageCommentUploads } from "@/lib/project-history";
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
    return NextResponse.json({ error: "Invalid cancel request." }, { status: 400 });
  }

  if (!payload.projectId || !payload.commentId) {
    return NextResponse.json(
      { error: "Project and comment are required." },
      { status: 400 },
    );
  }

  try {
    await cancelPreparedStageCommentUploads(user, {
      projectId: payload.projectId,
      commentId: payload.commentId,
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
            : "Unable to cancel the upload right now.",
      },
      { status: 400 },
    );
  }
}
