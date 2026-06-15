import { revalidatePath } from "next/cache";
import { after, NextResponse } from "next/server";

import { completeArchiveFileUpload } from "@/lib/archives";
import { getCurrentUser } from "@/lib/auth";

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let payload: {
    archiveFileId?: string;
    failed?: boolean;
  } = {};

  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ error: "Invalid completion request." }, { status: 400 });
  }

  if (!payload.archiveFileId) {
    return NextResponse.json({ error: "Archive file id is required." }, { status: 400 });
  }

  try {
    const result = await completeArchiveFileUpload(
      user,
      payload.archiveFileId,
      Boolean(payload.failed),
    );
    after(() => {
      revalidatePath("/archives");
      if (result?.archiveCategorySlug) {
        revalidatePath(`/archives/${result.archiveCategorySlug}`);
      }
    });

    return NextResponse.json({
      success: true,
      archiveCategorySlug: result?.archiveCategorySlug,
    });
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
