import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions/resolver";
import {
  buildArchiveCategoryIconPrefix,
  createPresignedPreviewUrl,
} from "@/lib/storage/s3";

export async function GET(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (
    !hasPermission(user, "archive.view") &&
    !hasPermission(user, "settings.viewMasterData")
  ) {
    return NextResponse.json(
      { error: "You do not have permission to view archive category icons." },
      { status: 403 },
    );
  }

  const { searchParams } = new URL(request.url);
  const storageKey = searchParams.get("key")?.trim() ?? "";

  if (!storageKey || !storageKey.startsWith(buildArchiveCategoryIconPrefix())) {
    return NextResponse.json({ error: "Archive category icon not found." }, { status: 404 });
  }

  const fileName = storageKey.split("/").pop() || "archive-category-icon";
  const previewUrl = await createPresignedPreviewUrl({
    storageKey,
    fileName,
  });

  return NextResponse.redirect(previewUrl);
}
