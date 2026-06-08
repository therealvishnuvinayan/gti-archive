import { revalidatePath } from "next/cache";
import { after, NextResponse } from "next/server";

import { completeArchiveFileUpload } from "@/lib/archives";
import { getCurrentUser } from "@/lib/auth";
import type { LibraryUploadMetadata } from "@/lib/library-shared";

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
    const result = await completeArchiveFileUpload(
      user,
      payload.attachmentId,
      Boolean(payload.failed),
      payload.metadata,
    );
    after(() => {
      revalidatePath("/archives");
      if (result?.archiveCategorySlug) {
        revalidatePath(`/archives/${result.archiveCategorySlug}`);
      }
      if (payload.projectId) {
        revalidatePath(`/projects/${payload.projectId}`);
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to complete the archive upload right now.",
      },
      { status: 400 },
    );
  }
}
