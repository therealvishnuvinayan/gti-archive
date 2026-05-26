import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { createPresignedPreviewUrl } from "@/lib/storage/s3";

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!user.avatarUrl) {
    return NextResponse.json({ error: "Profile photo not found." }, { status: 404 });
  }

  const fileName = user.avatarUrl.split("/").pop() || "avatar";
  const previewUrl = await createPresignedPreviewUrl({
    storageKey: user.avatarUrl,
    fileName,
  });

  return NextResponse.redirect(previewUrl);
}
