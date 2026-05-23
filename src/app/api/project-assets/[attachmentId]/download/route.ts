import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { getAttachmentDownloadUrlForUser } from "@/lib/project-history";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ attachmentId: string }> },
) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { attachmentId } = await params;

  try {
    const downloadUrl = await getAttachmentDownloadUrlForUser(user, attachmentId);
    return NextResponse.redirect(downloadUrl, { status: 302 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to create a download link.",
      },
      { status: 404 },
    );
  }
}
