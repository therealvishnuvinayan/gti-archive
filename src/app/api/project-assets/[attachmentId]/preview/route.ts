import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { getAttachmentPreviewUrlForUser } from "@/lib/project-history";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ attachmentId: string }> },
) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { attachmentId } = await params;

  try {
    const previewUrl = await getAttachmentPreviewUrlForUser(user, attachmentId);
    return NextResponse.redirect(previewUrl, { status: 302 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to create a preview link.";

    return NextResponse.json(
      { error: message },
      {
        status: /permission|access/i.test(message) ? 403 : 404,
      },
    );
  }
}
