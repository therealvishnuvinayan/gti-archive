import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { completeProjectResearchFileUpload } from "@/lib/project-research-files";
import { PROJECTS_CACHE_TAG } from "@/lib/projects";
import { decodeRouteParam } from "@/lib/route-params";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string; folderId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { projectId, folderId: encodedFolderId } = await params;
  const folderId = decodeRouteParam(encodedFolderId);
  let payload: { attachmentId?: string; failed?: boolean } = {};

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid completion request." }, { status: 400 });
  }

  if (!payload.attachmentId) {
    return NextResponse.json({ error: "Attachment id is required." }, { status: 400 });
  }

  try {
    const file = await completeProjectResearchFileUpload(user, {
      projectId,
      folderId,
      attachmentId: payload.attachmentId,
      failed: payload.failed,
    });
    revalidatePath(`/projects/${projectId}/stages/2`);
    revalidatePath(`/projects/${projectId}/stages/2/folders/${folderId}`);
    revalidateTag(PROJECTS_CACHE_TAG, "max");
    return NextResponse.json({ success: true, file });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to complete upload.";
    return NextResponse.json(
      { error: message },
      { status: /permission|read-only|access/i.test(message) ? 403 : 400 },
    );
  }
}
