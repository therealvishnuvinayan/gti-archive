import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { completeFlexibleProjectAttachmentUpload } from "@/lib/flexible-project-attachments";
import { FLEXIBLE_PROJECTS_CACHE_TAG } from "@/lib/flexible-projects";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  let payload: { attachmentId?: string; failed?: boolean } = {};
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ error: "Invalid completion request." }, { status: 400 });
  }
  if (!payload.attachmentId) return NextResponse.json({ error: "Attachment ID is required." }, { status: 400 });
  try {
    const { projectId } = await params;
    const slug = await completeFlexibleProjectAttachmentUpload(
      user,
      projectId,
      payload.attachmentId,
      Boolean(payload.failed),
    );
    revalidatePath("/projects");
    revalidatePath(`/projects/flexible/${slug}`);
    revalidateTag(FLEXIBLE_PROJECTS_CACHE_TAG, "max");
    return NextResponse.json({ success: true, projectId });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to complete the upload." },
      { status: 400 },
    );
  }
}
