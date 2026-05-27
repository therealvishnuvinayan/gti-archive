import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { deleteLibraryAttachmentForUser } from "@/lib/library";
import { PROJECTS_CACHE_TAG } from "@/lib/projects";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ attachmentId: string }> },
) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { attachmentId } = await params;

  try {
    const result = await deleteLibraryAttachmentForUser(user, attachmentId);
    revalidateTag(PROJECTS_CACHE_TAG, "max");
    revalidatePath("/library");
    revalidatePath(`/projects/${result.projectId}`);
    revalidatePath(`/projects/${result.projectId}/chat`);
    revalidatePath(`/projects/${result.projectId}/edit`);

    return NextResponse.json({ success: true });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to delete the file right now.";

    return NextResponse.json(
      { error: message },
      {
        status: /permission|access/i.test(message) ? 403 : 400,
      },
    );
  }
}
