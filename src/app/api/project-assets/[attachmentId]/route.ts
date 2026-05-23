import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { deleteAttachmentForUser } from "@/lib/project-history";
import { PROJECTS_CACHE_TAG } from "@/lib/projects";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ attachmentId: string }> },
) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { attachmentId } = await params;
  const projectId = new URL(request.url).searchParams.get("projectId");

  try {
    await deleteAttachmentForUser(user, attachmentId);
    revalidateTag(PROJECTS_CACHE_TAG, "max");

    if (projectId) {
      revalidatePath(`/projects/${projectId}`);
      revalidatePath(`/projects/${projectId}/edit`);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to delete the attachment right now.",
      },
      { status: 400 },
    );
  }
}
