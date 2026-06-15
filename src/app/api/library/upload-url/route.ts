import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { requestManualLibraryAssetUpload } from "@/lib/library";

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
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
  } = {};

  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ error: "Invalid upload request." }, { status: 400 });
  }

  if (
    !payload.assetName ||
    !payload.originalFileName ||
    !payload.mimeType ||
    typeof payload.fileSize !== "number"
  ) {
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
  });

  if ("error" in result) {
    return NextResponse.json(result, { status: 400 });
  }

  return NextResponse.json(result);
}
