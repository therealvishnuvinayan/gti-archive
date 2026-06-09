import { revalidatePath } from "next/cache";
import { after, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { completeManualLibraryAssetUpload } from "@/lib/library";

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let payload: {
    assetId?: string;
    failed?: boolean;
  } = {};

  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ error: "Invalid completion request." }, { status: 400 });
  }

  if (!payload.assetId) {
    return NextResponse.json({ error: "Library asset id is required." }, { status: 400 });
  }

  try {
    await completeManualLibraryAssetUpload(user, payload.assetId, Boolean(payload.failed));
    after(() => {
      revalidatePath("/library");
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to complete the library upload right now.",
      },
      { status: 400 },
    );
  }
}
