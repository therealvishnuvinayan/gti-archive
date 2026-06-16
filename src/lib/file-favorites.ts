import { AttachmentStatus, type User } from "@prisma/client";

import {
  canBypassCollaboratorVisibility,
  isTimestampHiddenByPauseWindows,
} from "@/lib/project-collaborator-visibility";
import {
  getDevTimingDurationMs,
  getDevTimingNow,
  logDevTiming,
  timeDevAsync,
} from "@/lib/dev-timing";
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
  const attachment = await timeDevAsync(
    "[library:favorite]",
    "permission/access check",
    () =>
      withPrismaRetry(() =>
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
                executors: {
                  where: {
                    userId: user.id,
                  },
                  select: {
                    userId: true,
                    role: true,
                  },
                },
                collaborators: {
                  where: {
                    userId: user.id,
                  },
                  select: {
                    userId: true,
                    chatVisibilityPaused: true,
                    visibilityPauses: {
                      orderBy: {
                        pausedAt: "asc",
                      },
                      select: {
                        pausedAt: true,
                        resumedAt: true,
                      },
                    },
                  },
                },
              },
            },
          },
        }),
      ),
    { attachmentId },
  );

  if (!attachment || attachment.status !== AttachmentStatus.READY) {
    throw new Error("Attachment not found.");
  }

  const projectPermissionContext = {
    createdById: attachment.project.createdById,
    executors: attachment.project.executors,
    collaborators: attachment.project.collaborators.map((collaborator) => ({
      userId: collaborator.userId,
    })),
  };

  if (!hasProjectPermission(user, projectPermissionContext, "file.favorite")) {
    throw new Error("You do not have permission to favorite this file.");
  }

  if (!canBypassCollaboratorVisibility(user, attachment.project.createdById)) {
    const collaborator = attachment.project.collaborators[0];

    if (
      collaborator?.chatVisibilityPaused &&
      collaborator.visibilityPauses.length === 0
    ) {
      throw new Error("You do not have permission to access this file.");
    }

    if (
      collaborator &&
      isTimestampHiddenByPauseWindows(attachment.createdAt, collaborator.visibilityPauses)
    ) {
      throw new Error("You do not have permission to access this file.");
    }
  }

  return attachment;
}

export { getFavoriteAttachmentIdSetForUser } from "@/lib/file-favorite-queries";

export async function addFileFavorite(
  user: FavoriteAccessUser,
  attachmentId: string,
) {
  const totalStartedAt = getDevTimingNow();
  await assertAttachmentFavoriteAccess(user, attachmentId);
  logDevTiming("[library:favorite]", "existing favorite lookup skipped", {
    reason: "POST uses idempotent upsert.",
  });

  await timeDevAsync(
    "[library:favorite]",
    "insert/delete favorite",
    () =>
      withPrismaRetry(() =>
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
      ),
    { action: "insert", attachmentId },
  );
  logDevTiming("[library:favorite]", "total helper", {
    durationMs: getDevTimingDurationMs(totalStartedAt),
    action: "insert",
  });

  return { attachmentId, isFavoritedByCurrentUser: true };
}

export async function removeFileFavorite(
  user: FavoriteAccessUser,
  attachmentId: string,
) {
  const totalStartedAt = getDevTimingNow();
  await assertAttachmentFavoriteAccess(user, attachmentId);
  logDevTiming("[library:favorite]", "existing favorite lookup skipped", {
    reason: "DELETE uses idempotent deleteMany.",
  });

  await timeDevAsync(
    "[library:favorite]",
    "insert/delete favorite",
    () =>
      withPrismaRetry(() =>
        prisma.fileFavorite.deleteMany({
          where: {
            userId: user.id,
            attachmentId,
          },
        }),
      ),
    { action: "delete", attachmentId },
  );
  logDevTiming("[library:favorite]", "total helper", {
    durationMs: getDevTimingDurationMs(totalStartedAt),
    action: "delete",
  });

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
