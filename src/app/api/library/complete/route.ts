import { revalidatePath } from "next/cache";
import { after, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { createDevTimer } from "@/lib/dev-timing";
import {
  completeManualLibraryAssetUpload,
  createCompletedManualLibraryAssetFromUpload,
} from "@/lib/library";

export async function POST(request: Request) {
  const timer = createDevTimer("[library:upload-complete]");
  const user = await getCurrentUser();
  timer.mark("auth/session");

  if (!user) {
    timer.end("total unauthorized");
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let payload: {
    assetId?: string;
    failed?: boolean;
    storageKey?: string;
    assetName?: string;
    originalFileName?: string;
    mimeType?: string;
    fileSize?: number;
    createdByName?: string;
    description?: string;
    category?: string;
    assetTagIds?: string[];
  } = {};

  try {
    payload = (await request.json()) as typeof payload;
    timer.mark("request parse");
  } catch {
    timer.end("total invalid request");
    return NextResponse.json({ error: "Invalid completion request." }, { status: 400 });
  }

  try {
    let asset = null;

    if (payload.assetId) {
      asset = await completeManualLibraryAssetUpload(
        user,
        payload.assetId,
        Boolean(payload.failed),
      );
    } else {
      if (
        !payload.storageKey ||
        !payload.assetName ||
        !payload.originalFileName ||
        !payload.mimeType ||
        typeof payload.fileSize !== "number"
      ) {
        timer.end("total missing completed upload fields");
        return NextResponse.json(
          { error: "Missing completed upload fields." },
          { status: 400 },
        );
      }

      asset = await createCompletedManualLibraryAssetFromUpload(user, {
        storageKey: payload.storageKey,
        assetName: payload.assetName,
        originalFileName: payload.originalFileName,
        mimeType: payload.mimeType,
        fileSize: payload.fileSize,
        createdByName: payload.createdByName,
        description: payload.description,
        category: payload.category,
        assetTagIds: Array.isArray(payload.assetTagIds) ? payload.assetTagIds : [],
      });
    }

    after(() => {
      revalidatePath("/library");
    });

    timer.end("total", {
      failed: Boolean(payload.failed),
    });
    return NextResponse.json({ success: true, asset });
  } catch (error) {
    timer.end("total failed", {
      failed: Boolean(payload.failed),
      error:
        error instanceof Error
          ? error.message
          : "Unable to complete the library upload right now.",
    });
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
