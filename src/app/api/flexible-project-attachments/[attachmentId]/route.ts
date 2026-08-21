import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { deleteFlexibleProjectAttachment } from "@/lib/flexible-project-attachments";
import { FLEXIBLE_PROJECTS_CACHE_TAG } from "@/lib/flexible-projects";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ attachmentId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try {
    const { attachmentId } = await params;
    await deleteFlexibleProjectAttachment(user, attachmentId);
    revalidatePath("/projects");
    revalidateTag(FLEXIBLE_PROJECTS_CACHE_TAG, "max");
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to delete this attachment.";
    return NextResponse.json({ error: message }, { status: /permission|access/i.test(message) ? 403 : 400 });
  }
}
