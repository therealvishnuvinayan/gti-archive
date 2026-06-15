import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { getManualLibraryAssetDownloadUrlForUser } from "@/lib/library";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ assetId: string }> },
) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { assetId } = await params;

  try {
    const downloadUrl = await getManualLibraryAssetDownloadUrlForUser(user, assetId);
    return NextResponse.redirect(downloadUrl, { status: 302 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to create a download link.";

    return NextResponse.json(
      { error: message },
      {
        status: /permission|access/i.test(message) ? 403 : 404,
      },
    );
  }
}
