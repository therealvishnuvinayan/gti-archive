import { UserRole } from "@prisma/client";
import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions/resolver";
import { prisma, withPrismaRetry } from "@/lib/prisma";
import { decodeRouteParam } from "@/lib/route-params";
import { createPresignedPreviewUrl } from "@/lib/storage/s3";

type RouteContext = {
  params: Promise<{ userId: string }>;
};

export async function GET(_request: Request, { params }: RouteContext) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (
    currentUser.role !== UserRole.SUPER_ADMIN ||
    !hasPermission(currentUser, "users.view")
  ) {
    return NextResponse.json(
      { error: "Only super admins with user access can view managed user photos." },
      { status: 403 },
    );
  }

  const { userId: encodedUserId } = await params;
  const userId = decodeRouteParam(encodedUserId).trim();
  const targetUser = userId
    ? await withPrismaRetry(() =>
        prisma.user.findUnique({
          where: { id: userId },
          select: { avatarUrl: true },
        }),
      )
    : null;

  if (!targetUser?.avatarUrl) {
    return NextResponse.json({ error: "Profile photo not found." }, { status: 404 });
  }

  const fileName = targetUser.avatarUrl.split("/").pop() || "avatar";
  const previewUrl = await createPresignedPreviewUrl({
    storageKey: targetUser.avatarUrl,
    fileName,
  });

  return NextResponse.redirect(previewUrl, {
    status: 302,
    headers: { "Cache-Control": "private, no-store" },
  });
}
