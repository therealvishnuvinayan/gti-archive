import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { addFileFavorite, removeFileFavorite } from "@/lib/file-favorites";
import { PROJECTS_CACHE_TAG } from "@/lib/projects";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ attachmentId: string }> },
) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { attachmentId } = await params;

  try {
    const result = await addFileFavorite(user, attachmentId);
    revalidateTag(PROJECTS_CACHE_TAG, "max");

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
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { attachmentId } = await params;

  try {
    const result = await removeFileFavorite(user, attachmentId);
    revalidateTag(PROJECTS_CACHE_TAG, "max");

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
        status: error instanceof Error && /access|permission|unauthorized/i.test(error.message)
          ? 403
          : 400,
      },
    );
  }
}
