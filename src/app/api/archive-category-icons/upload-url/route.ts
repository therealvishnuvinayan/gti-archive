import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions/resolver";
import {
  buildArchiveCategoryIconKey,
  createPresignedUploadUrl,
  getMaxProfileAvatarBytes,
  isAllowedProfileImage,
} from "@/lib/storage/s3";
import {
  PROFILE_IMAGE_ALLOWED_EXTENSIONS,
  buildFileTypeNotAllowedPayload,
} from "@/lib/upload-validation";

type UploadArchiveCategoryIconPayload = {
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
};

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!hasPermission(user, "settings.manageMasterData")) {
    return NextResponse.json(
      { error: "You do not have permission to manage archive category icons." },
      { status: 403 },
    );
  }

  let payload: UploadArchiveCategoryIconPayload = {};

  try {
    payload = (await request.json()) as UploadArchiveCategoryIconPayload;
  } catch {
    return NextResponse.json({ error: "Invalid upload request." }, { status: 400 });
  }

  if (
    !payload.fileName ||
    !payload.mimeType ||
    typeof payload.fileSize !== "number" ||
    !Number.isFinite(payload.fileSize)
  ) {
    return NextResponse.json({ error: "Missing required upload fields." }, { status: 400 });
  }

  if (payload.fileSize <= 0) {
    return NextResponse.json({ error: "Choose a file to upload." }, { status: 400 });
  }

  if (!isAllowedProfileImage(payload.fileName, payload.mimeType)) {
    return NextResponse.json(
      buildFileTypeNotAllowedPayload({
        fileName: payload.fileName,
        mimeType: payload.mimeType,
        allowedExtensions: PROFILE_IMAGE_ALLOWED_EXTENSIONS,
        error: "Archive category icon file type is not allowed.",
      }),
      { status: 400 },
    );
  }

  if (payload.fileSize > getMaxProfileAvatarBytes()) {
    return NextResponse.json(
      { error: "Archive category icon must be smaller than 2MB." },
      { status: 400 },
    );
  }

  const storageKey = buildArchiveCategoryIconKey(user.id, payload.fileName);
  const uploadUrl = await createPresignedUploadUrl({
    storageKey,
    mimeType: payload.mimeType,
  });

  return NextResponse.json({
    uploadUrl,
    storageKey,
  });
}
