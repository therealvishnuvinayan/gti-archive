import { libraryErrorResponse } from "@/lib/library-http";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { deleteManualLibraryAssetForUser } from "@/lib/library";

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
    await deleteManualLibraryAssetForUser(user, assetId);
    revalidatePath("/library");

    return NextResponse.json({ success: true });
  } catch (error) {
    return libraryErrorResponse(error);
  }
}
