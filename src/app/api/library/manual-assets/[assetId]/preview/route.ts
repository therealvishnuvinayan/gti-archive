import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { getManualLibraryAssetPreviewUrlForUser } from "@/lib/library";

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
    const previewUrl = await getManualLibraryAssetPreviewUrlForUser(user, assetId);
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
