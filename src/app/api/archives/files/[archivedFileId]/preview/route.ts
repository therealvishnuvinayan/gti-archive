import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { getArchivedFilePreviewUrlForUser } from "@/lib/archives";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ archivedFileId: string }> },
) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { archivedFileId } = await params;

  try {
    const previewUrl = await getArchivedFilePreviewUrlForUser(user, archivedFileId);
    // Keep protected relative paths on the browser origin (including behind a proxy).
    return new Response(null, { status: 307, headers: { Location: previewUrl, "Cache-Control": "private, no-store" } });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to create an archive preview link.";

    return NextResponse.json(
      { error: message },
      {
        status: /permission|access/i.test(message) ? 403 : 404,
      },
    );
  }
}
