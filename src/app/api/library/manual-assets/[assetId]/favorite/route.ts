import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { createDevTimer } from "@/lib/dev-timing";
import {
  addManualLibraryAssetFavorite,
  removeManualLibraryAssetFavorite,
} from "@/lib/manual-library-asset-favorites";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ assetId: string }> },
) {
  const timer = createDevTimer("[library:favorite]");
  const user = await getCurrentUser();
  timer.mark("auth/session");

  if (!user) {
    timer.end("total unauthorized");
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { assetId } = await params;
  timer.mark("params parse");

  try {
    const result = await addManualLibraryAssetFavorite(user, assetId);
    timer.mark("response serialization");
    timer.end("total", {
      action: "insert",
      assetId,
    });

    return NextResponse.json(result);
  } catch (error) {
    timer.end("total failed", {
      action: "insert",
      assetId,
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
        status:
          error instanceof Error &&
          /access|permission|unauthorized/i.test(error.message)
            ? 403
            : 400,
      },
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ assetId: string }> },
) {
  const timer = createDevTimer("[library:favorite]");
  const user = await getCurrentUser();
  timer.mark("auth/session");

  if (!user) {
    timer.end("total unauthorized");
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { assetId } = await params;
  timer.mark("params parse");

  try {
    const result = await removeManualLibraryAssetFavorite(user, assetId);
    timer.mark("response serialization");
    timer.end("total", {
      action: "delete",
      assetId,
    });

    return NextResponse.json(result);
  } catch (error) {
    timer.end("total failed", {
      action: "delete",
      assetId,
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
        status:
          error instanceof Error &&
          /access|permission|unauthorized/i.test(error.message)
            ? 403
            : 400,
      },
    );
  }
}
