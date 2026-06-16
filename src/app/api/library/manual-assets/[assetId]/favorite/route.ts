import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import {
  addManualLibraryAssetFavorite,
  removeManualLibraryAssetFavorite,
} from "@/lib/manual-library-asset-favorites";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ assetId: string }> },
) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { assetId } = await params;

  try {
    const result = await addManualLibraryAssetFavorite(user, assetId);
    revalidatePath("/library");

    return NextResponse.json(result);
  } catch (error) {
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
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { assetId } = await params;

  try {
    const result = await removeManualLibraryAssetFavorite(user, assetId);
    revalidatePath("/library");

    return NextResponse.json(result);
  } catch (error) {
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
