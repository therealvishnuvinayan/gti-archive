import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { canArchive, archiveCategoryWhere, archiveScopeForUser } from "@/lib/authorization/archive-rules";
import { runArchiveOperation } from "@/lib/authorization/archive";
import { prisma } from "@/lib/prisma";
import {
  buildArchiveCategoryIconPrefix,
  createPresignedPreviewUrl,
} from "@/lib/storage/s3";

export async function GET(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!canArchive(user, "archive.view")) {
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

  return runArchiveOperation(user, "archive.view", "root", async user => {
  const stored = await prisma.archiveCategory.findFirst({ where: { AND: [{ iconUrl: storageKey }, archiveCategoryWhere(archiveScopeForUser(user), false)] }, select: { id: true } });
  const ownDraft = canArchive(user, "archive.category.create") && storageKey.startsWith(`${buildArchiveCategoryIconPrefix()}${user.id}/`);
  if (!stored && !ownDraft) return NextResponse.json({ error: "Archive category icon not found." }, { status: 404 });
  const fileName = storageKey.split("/").pop() || "archive-category-icon";
  const previewUrl = await createPresignedPreviewUrl({
    storageKey,
    fileName,
  });

  return NextResponse.redirect(previewUrl);
  });
}
