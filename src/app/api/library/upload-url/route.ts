import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { createDevTimer } from "@/lib/dev-timing";
import { requestManualLibraryAssetUpload } from "@/lib/library";

export async function POST(request: Request) {
  const timer = createDevTimer("[library:upload-url]");
  const user = await getCurrentUser();
  timer.mark("auth/session");

  if (!user) {
    timer.end("total unauthorized");
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let payload: {
    assetName?: string;
    originalFileName?: string;
    mimeType?: string;
    fileSize?: number;
    createdByName?: string;
    description?: string;
    category?: string;
    assetTagIds?: string[];
    uploadEndpointMode?: string;
  } = {};

  try {
    payload = (await request.json()) as typeof payload;
    timer.mark("request parse");
  } catch {
    timer.end("total invalid request");
    return NextResponse.json({ error: "Invalid upload request." }, { status: 400 });
  }

  if (
    !payload.assetName ||
    !payload.originalFileName ||
    !payload.mimeType ||
    typeof payload.fileSize !== "number"
  ) {
    timer.end("total missing fields");
    return NextResponse.json({ error: "Missing required upload fields." }, { status: 400 });
  }

  const result = await requestManualLibraryAssetUpload(user, {
    assetName: payload.assetName,
    originalFileName: payload.originalFileName,
    mimeType: payload.mimeType,
    fileSize: payload.fileSize,
    createdByName: payload.createdByName,
    description: payload.description,
    category: payload.category,
    assetTagIds: Array.isArray(payload.assetTagIds) ? payload.assetTagIds : [],
    uploadEndpointMode:
      payload.uploadEndpointMode === "regional" ||
      payload.uploadEndpointMode === "accelerate"
        ? payload.uploadEndpointMode
        : undefined,
  });

  if ("error" in result) {
    timer.end("total failed", {
      fileSize: payload.fileSize,
      error: result.error,
    });
    return NextResponse.json(result, { status: 400 });
  }

  timer.end("total", {
    fileSize: payload.fileSize,
    assetTagCount: Array.isArray(payload.assetTagIds) ? payload.assetTagIds.length : 0,
  });
  return NextResponse.json(result);
}
