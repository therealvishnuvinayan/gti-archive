import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { getFlexibleAttachmentUrl } from "@/lib/flexible-project-attachments";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ attachmentId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try {
    const { attachmentId } = await params;
    return NextResponse.redirect(await getFlexibleAttachmentUrl(user, attachmentId, "preview"), { status: 302 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to preview this attachment.";
    return NextResponse.json({ error: message }, { status: /permission|access/i.test(message) ? 403 : 404 });
  }
}
