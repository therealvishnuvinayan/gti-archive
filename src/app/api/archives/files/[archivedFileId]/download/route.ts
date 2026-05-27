import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { getArchivedFileDownloadUrlForUser } from "@/lib/archives";

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
    const downloadUrl = await getArchivedFileDownloadUrlForUser(user, archivedFileId);
    return NextResponse.redirect(downloadUrl);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to create an archive download link.";

    return NextResponse.json(
      { error: message },
      {
        status: /permission|access/i.test(message) ? 403 : 404,
      },
    );
  }
}
