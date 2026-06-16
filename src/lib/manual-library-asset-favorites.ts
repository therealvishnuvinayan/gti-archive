import { AttachmentStatus, type User } from "@prisma/client";

import { canViewLibrary } from "@/lib/library-access";
import { hasPermission, type PermissionUser } from "@/lib/permissions/resolver";
import { prisma, withPrismaRetry } from "@/lib/prisma";

type ManualLibraryAssetFavoriteUser = Pick<
  User,
  "id" | "email" | "name" | "role" | "collaboratorType"
> &
  PermissionUser;

async function assertManualLibraryAssetFavoriteAccess(
  user: ManualLibraryAssetFavoriteUser,
  assetId: string,
) {
  const asset = await withPrismaRetry(() =>
    prisma.manualLibraryAsset.findUnique({
      where: {
        id: assetId,
      },
      select: {
        id: true,
        status: true,
      },
    }),
  );

  if (!asset || asset.status !== AttachmentStatus.READY) {
    throw new Error("Library asset not found.");
  }

  if (!canViewLibrary(user) || !hasPermission(user, "file.favorite")) {
    throw new Error("You do not have permission to favorite this file.");
  }

  return asset;
}

export async function getFavoriteManualLibraryAssetIdSetForUser(
  userId: string,
  assetIds: string[],
) {
  if (assetIds.length === 0) {
    return new Set<string>();
  }

  const records = await withPrismaRetry(() =>
    prisma.manualLibraryAssetFavorite.findMany({
      where: {
        userId,
        manualLibraryAssetId: {
          in: assetIds,
        },
      },
      select: {
        manualLibraryAssetId: true,
      },
    }),
  );

  return new Set(records.map((record) => record.manualLibraryAssetId));
}

export async function addManualLibraryAssetFavorite(
  user: ManualLibraryAssetFavoriteUser,
  assetId: string,
) {
  await assertManualLibraryAssetFavoriteAccess(user, assetId);

  await withPrismaRetry(() =>
    prisma.manualLibraryAssetFavorite.upsert({
      where: {
        userId_manualLibraryAssetId: {
          userId: user.id,
          manualLibraryAssetId: assetId,
        },
      },
      update: {},
      create: {
        userId: user.id,
        manualLibraryAssetId: assetId,
      },
    }),
  );

  return { attachmentId: assetId, isFavoritedByCurrentUser: true };
}

export async function removeManualLibraryAssetFavorite(
  user: ManualLibraryAssetFavoriteUser,
  assetId: string,
) {
  await assertManualLibraryAssetFavoriteAccess(user, assetId);

  await withPrismaRetry(() =>
    prisma.manualLibraryAssetFavorite.deleteMany({
      where: {
        userId: user.id,
        manualLibraryAssetId: assetId,
      },
    }),
  );

  return { attachmentId: assetId, isFavoritedByCurrentUser: false };
}

export async function toggleManualLibraryAssetFavorite(
  user: ManualLibraryAssetFavoriteUser,
  assetId: string,
) {
  await assertManualLibraryAssetFavoriteAccess(user, assetId);

  const existing = await withPrismaRetry(() =>
    prisma.manualLibraryAssetFavorite.findUnique({
      where: {
        userId_manualLibraryAssetId: {
          userId: user.id,
          manualLibraryAssetId: assetId,
        },
      },
      select: {
        id: true,
      },
    }),
  );

  if (existing) {
    await withPrismaRetry(() =>
      prisma.manualLibraryAssetFavorite.delete({
        where: {
          userId_manualLibraryAssetId: {
            userId: user.id,
            manualLibraryAssetId: assetId,
          },
        },
      }),
    );

    return { attachmentId: assetId, isFavoritedByCurrentUser: false };
  }

  await withPrismaRetry(() =>
    prisma.manualLibraryAssetFavorite.create({
      data: {
        userId: user.id,
        manualLibraryAssetId: assetId,
      },
    }),
  );

  return { attachmentId: assetId, isFavoritedByCurrentUser: true };
}
