import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions/resolver";
import { prisma, withPrismaRetry } from "@/lib/prisma";
import { decodeRouteParam } from "@/lib/route-params";
import {
  buildUserAvatarKey,
  createPresignedUploadUrl,
  getMaxProfileAvatarBytes,
  isAllowedProfileImage,
} from "@/lib/storage/s3";
import {
  PROFILE_IMAGE_ALLOWED_EXTENSIONS,
  buildFileTypeNotAllowedPayload,
} from "@/lib/upload-validation";
import {
  isBusinessAdministratorRole,
  isProtectedRootRole,
} from "@/lib/user-role-compatibility";

type UploadAvatarPayload = {
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
};

type RouteContext = {
  params: Promise<{ userId: string }>;
};

export async function POST(request: Request, { params }: RouteContext) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (
    !isBusinessAdministratorRole(currentUser.role) ||
    !hasPermission(currentUser, "users.update")
  ) {
    return NextResponse.json(
      { error: "Only administrators with user update access can change user photos." },
      { status: 403 },
    );
  }

  const { userId: encodedUserId } = await params;
  const userId = decodeRouteParam(encodedUserId).trim();

  if (!userId) {
    return NextResponse.json({ error: "User id is missing." }, { status: 400 });
  }

  const targetUser = await withPrismaRetry(() =>
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    }),
  );

  if (!targetUser) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  if (isProtectedRootRole(targetUser.role)) {
    return NextResponse.json(
      { error: "Protected Super Admin accounts cannot be changed here." },
      { status: 403 },
    );
  }

  const payload = (await request.json().catch(() => null)) as UploadAvatarPayload | null;

  if (
    !payload?.fileName ||
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
        error: "Profile photo file type is not allowed.",
      }),
      { status: 400 },
    );
  }

  if (payload.fileSize > getMaxProfileAvatarBytes()) {
    return NextResponse.json(
      { error: "Profile photo must be smaller than 2MB." },
      { status: 400 },
    );
  }

  const storageKey = buildUserAvatarKey(targetUser.id, payload.fileName);
  const uploadUrl = await createPresignedUploadUrl({
    storageKey,
    mimeType: payload.mimeType,
  });

  return NextResponse.json({ uploadUrl, storageKey });
}
