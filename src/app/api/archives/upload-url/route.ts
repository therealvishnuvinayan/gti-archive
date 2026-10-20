import { AuthorizationDeniedError } from "@/lib/authorization/policy";
import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { requestArchiveFileUpload } from "@/lib/archives";

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let payload: {
    fileName?: string;
    originalFileName?: string;
    mimeType?: string;
    fileSize?: number;
    projectName?: string;
    projectCreatedBy?: string;
    archiveCategoryId?: string;
    assetTagIds?: string[];
    projectDate?: string;
  } = {};

  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ error: "Invalid upload request." }, { status: 400 });
  }

  if (
    !payload.fileName ||
    !payload.originalFileName ||
    !payload.mimeType ||
    typeof payload.fileSize !== "number"
  ) {
    return NextResponse.json({ error: "Missing required upload fields." }, { status: 400 });
  }

  try {
  const result = await requestArchiveFileUpload(user, {
    fileName: payload.fileName,
    originalFileName: payload.originalFileName,
    mimeType: payload.mimeType,
    fileSize: payload.fileSize,
    projectName: payload.projectName,
    projectCreatedBy: payload.projectCreatedBy,
    archiveCategoryId: payload.archiveCategoryId,
    assetTagIds: Array.isArray(payload.assetTagIds) ? payload.assetTagIds : [],
    projectDate: payload.projectDate,
  });

  if ("error" in result) {
    return NextResponse.json(result, { status: 400 });
  }

  return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: "Archive upload denied." }, { status: error instanceof AuthorizationDeniedError ? 403 : 400 });
  }
}
