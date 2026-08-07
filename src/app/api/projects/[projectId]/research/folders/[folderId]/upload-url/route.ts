import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { requestProjectResearchFileUpload } from "@/lib/project-research-files";
import { decodeRouteParam } from "@/lib/route-params";

function isUploadEndpointMode(value: unknown): value is "regional" | "accelerate" {
  return value === "regional" || value === "accelerate";
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string; folderId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { projectId, folderId: encodedFolderId } = await params;
  const folderId = decodeRouteParam(encodedFolderId);
  let payload: {
    originalFileName?: string;
    mimeType?: string;
    fileSize?: number;
    uploadEndpointMode?: unknown;
  } = {};

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid upload request." }, { status: 400 });
  }

  if (!payload.originalFileName || typeof payload.fileSize !== "number") {
    return NextResponse.json({ error: "Missing required upload fields." }, { status: 400 });
  }

  try {
    const result = await requestProjectResearchFileUpload(user, {
      projectId,
      folderId,
      originalFileName: payload.originalFileName,
      mimeType: payload.mimeType ?? "application/octet-stream",
      fileSize: payload.fileSize,
      uploadEndpointMode: isUploadEndpointMode(payload.uploadEndpointMode)
        ? payload.uploadEndpointMode
        : undefined,
    });

    return NextResponse.json(result, { status: "error" in result ? 400 : 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to prepare upload.";
    return NextResponse.json(
      { error: message },
      { status: /permission|read-only|access/i.test(message) ? 403 : 400 },
    );
  }
}
