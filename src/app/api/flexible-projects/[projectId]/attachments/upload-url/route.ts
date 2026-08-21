import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { requestFlexibleProjectAttachmentUpload } from "@/lib/flexible-project-attachments";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  let payload: { originalFileName?: string; mimeType?: string; fileSize?: number } = {};
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ error: "Invalid upload request." }, { status: 400 });
  }
  if (!payload.originalFileName || typeof payload.fileSize !== "number") {
    return NextResponse.json({ error: "Missing required upload fields." }, { status: 400 });
  }
  const { projectId } = await params;
  const result = await requestFlexibleProjectAttachmentUpload(user, {
    projectId,
    originalFileName: payload.originalFileName,
    mimeType: payload.mimeType || "application/octet-stream",
    fileSize: payload.fileSize,
  });
  return NextResponse.json(result, { status: "error" in result ? 400 : 200 });
}
