import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { createDevTimer } from "@/lib/dev-timing";
import { addFileFavorite, removeFileFavorite } from "@/lib/file-favorites";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ attachmentId: string }> },
) {
  const timer = createDevTimer("[library:favorite]");
  const user = await getCurrentUser();
  timer.mark("auth/session");

  if (!user) {
    timer.end("total unauthorized");
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { attachmentId } = await params;
  timer.mark("params parse");

  try {
    const result = await addFileFavorite(user, attachmentId);
    timer.mark("response serialization");
    timer.end("total", {
      action: "insert",
      attachmentId,
    });

    return NextResponse.json(result);
  } catch (error) {
    timer.end("total failed", {
      action: "insert",
      attachmentId,
      error:
        error instanceof Error
          ? error.message
          : "Unable to update favourites right now.",
    });
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to update favourites right now.",
      },
      {
        status: error instanceof Error && /access|permission|unauthorized/i.test(error.message)
          ? 403
          : 400,
      },
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ attachmentId: string }> },
) {
  const timer = createDevTimer("[library:favorite]");
  const user = await getCurrentUser();
  timer.mark("auth/session");

  if (!user) {
    timer.end("total unauthorized");
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { attachmentId } = await params;
  timer.mark("params parse");

  try {
    const result = await removeFileFavorite(user, attachmentId);
    timer.mark("response serialization");
    timer.end("total", {
      action: "delete",
      attachmentId,
    });

    return NextResponse.json(result);
  } catch (error) {
    timer.end("total failed", {
      action: "delete",
      attachmentId,
      error:
        error instanceof Error
          ? error.message
          : "Unable to update favourites right now.",
    });
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to update favourites right now.",
      },
      {
        status: error instanceof Error && /access|permission|unauthorized/i.test(error.message)
          ? 403
          : 400,
      },
    );
  }
}
