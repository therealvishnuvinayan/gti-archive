import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions/resolver";
import {
  buildUserAvatarKey,
  createPresignedUploadUrl,
  getMaxProfileAvatarBytes,
  isAllowedProfileImage,
} from "@/lib/storage/s3";

type UploadAvatarPayload = {
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
};

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!hasPermission(user, "settings.updateOwnProfile")) {
    return NextResponse.json(
      { error: "You do not have permission to update your profile photo." },
      { status: 403 },
    );
  }

  let payload: UploadAvatarPayload = {};

  try {
    payload = (await request.json()) as UploadAvatarPayload;
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
      { error: "Profile photo must be JPG, PNG, GIF, or WebP." },
      { status: 400 },
    );
  }

  if (payload.fileSize > getMaxProfileAvatarBytes()) {
    return NextResponse.json(
      { error: "Profile photo must be smaller than 2MB." },
      { status: 400 },
    );
  }

  const storageKey = buildUserAvatarKey(user.id, payload.fileName);
  const uploadUrl = await createPresignedUploadUrl({
    storageKey,
    mimeType: payload.mimeType,
  });

  return NextResponse.json({
    uploadUrl,
    storageKey,
  });
}
