import { NextResponse } from "next/server";

import { createArchiveFileShareLink } from "@/lib/archives";
import { getCurrentUser } from "@/lib/auth";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ archivedFileId: string }> },
) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let payload: { expiryDays?: number } = {};

  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ error: "Invalid share-link request." }, { status: 400 });
  }

  const { archivedFileId } = await params;

  try {
    const result = await createArchiveFileShareLink(user, {
      archivedFileId,
      expiryDays: Number(payload.expiryDays),
    });

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to create the share link.";

    return NextResponse.json(
      { error: message },
      {
        status: /permission|access/i.test(message)
          ? 403
          : /not found/i.test(message)
            ? 404
            : 400,
      },
    );
  }
}
