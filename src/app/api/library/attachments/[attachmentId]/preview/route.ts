import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getLibraryAttachmentUrlForUser } from "@/lib/library";
import { libraryErrorResponse } from "@/lib/library-http";

export async function GET(_request: Request, { params }: { params: Promise<{ attachmentId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try {
    const { attachmentId } = await params;
    return NextResponse.redirect(await getLibraryAttachmentUrlForUser(user, attachmentId, true));
  } catch (error) { return libraryErrorResponse(error); }
}
