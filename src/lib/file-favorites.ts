import { AttachmentStatus, type User } from "@prisma/client";

import {
  assertProjectAccess,
  assertProjectAttachmentVisibilityForUser,
  type ProjectHistoryAccessUser,
} from "@/lib/project-history";
import {
  hasProjectPermission,
  type PermissionUser,
} from "@/lib/permissions/resolver";
import { prisma, withPrismaRetry } from "@/lib/prisma";

type FavoriteAccessUser = Pick<
  User,
  "id" | "email" | "name" | "role" | "collaboratorType"
> &
  PermissionUser;

async function assertAttachmentFavoriteAccess(
  user: FavoriteAccessUser,
  attachmentId: string,
) {
  const attachment = await withPrismaRetry(() =>
    prisma.projectAttachment.findUnique({
      where: {
        id: attachmentId,
      },
      select: {
        id: true,
        projectId: true,
        status: true,
        createdAt: true,
        project: {
          select: {
            createdById: true,
          },
        },
      },
    }),
  );

  if (!attachment || attachment.status !== AttachmentStatus.READY) {
    throw new Error("Attachment not found.");
  }

  const project = await assertProjectAccess(
    user as ProjectHistoryAccessUser,
    attachment.projectId,
  );

  if (!hasProjectPermission(user, project, "file.favorite")) {
    throw new Error("You do not have permission to favorite this file.");
  }

  await assertProjectAttachmentVisibilityForUser(
    user as ProjectHistoryAccessUser,
    attachment,
  );

  return attachment;
}

export { getFavoriteAttachmentIdSetForUser } from "@/lib/file-favorite-queries";

export async function addFileFavorite(
  user: FavoriteAccessUser,
  attachmentId: string,
) {
  await assertAttachmentFavoriteAccess(user, attachmentId);

  await withPrismaRetry(() =>
    prisma.fileFavorite.upsert({
      where: {
        userId_attachmentId: {
          userId: user.id,
          attachmentId,
        },
      },
      update: {},
      create: {
        userId: user.id,
        attachmentId,
      },
    }),
  );

  return { attachmentId, isFavoritedByCurrentUser: true };
}

export async function removeFileFavorite(
  user: FavoriteAccessUser,
  attachmentId: string,
) {
  await assertAttachmentFavoriteAccess(user, attachmentId);

  await withPrismaRetry(() =>
    prisma.fileFavorite.deleteMany({
      where: {
        userId: user.id,
        attachmentId,
      },
    }),
  );

  return { attachmentId, isFavoritedByCurrentUser: false };
}

export async function toggleFileFavorite(
  user: FavoriteAccessUser,
  attachmentId: string,
) {
  await assertAttachmentFavoriteAccess(user, attachmentId);

  const existing = await withPrismaRetry(() =>
    prisma.fileFavorite.findUnique({
      where: {
        userId_attachmentId: {
          userId: user.id,
          attachmentId,
        },
      },
      select: {
        id: true,
      },
    }),
  );

  if (existing) {
    await withPrismaRetry(() =>
      prisma.fileFavorite.delete({
        where: {
          userId_attachmentId: {
            userId: user.id,
            attachmentId,
          },
        },
      }),
    );

    return { attachmentId, isFavoritedByCurrentUser: false };
  }

  await withPrismaRetry(() =>
    prisma.fileFavorite.create({
      data: {
        userId: user.id,
        attachmentId,
      },
    }),
  );

  return { attachmentId, isFavoritedByCurrentUser: true };
}
