import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { getProjectCompletionDocumentDownloadUrlForUser } from "@/lib/project-completion";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ documentId: string }> },
) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { documentId } = await params;

  try {
    const downloadUrl = await getProjectCompletionDocumentDownloadUrlForUser(
      user,
      documentId,
    );
    return NextResponse.redirect(downloadUrl);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to create a completion document download link.";

    return NextResponse.json(
      { error: message },
      {
        status: /permission|access/i.test(message) ? 403 : 404,
      },
    );
  }
}
