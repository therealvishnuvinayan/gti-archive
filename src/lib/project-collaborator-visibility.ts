import { UserRole, type User } from "@prisma/client";

import { prisma, withPrismaRetry } from "@/lib/prisma";

type VisibilityAccessUser = Pick<User, "id" | "role">;

export type ProjectCollaboratorVisibilityPauseRecord = {
  pausedAt: Date;
  resumedAt: Date | null;
};

function normalizeVisibilityDate(value: Date | string | number) {
  return value instanceof Date ? value : new Date(value);
}

export function isTimestampHiddenByPauseWindows(
  value: Date | string | number,
  pauseWindows: ProjectCollaboratorVisibilityPauseRecord[],
) {
  const timestamp = normalizeVisibilityDate(value).getTime();

  if (Number.isNaN(timestamp)) {
    return false;
  }

  return pauseWindows.some((pauseWindow) => {
    const pausedAt = normalizeVisibilityDate(pauseWindow.pausedAt).getTime();
    const resumedAt = pauseWindow.resumedAt
      ? normalizeVisibilityDate(pauseWindow.resumedAt).getTime()
      : Number.POSITIVE_INFINITY;

    return timestamp >= pausedAt && timestamp < resumedAt;
  });
}

export async function getProjectCollaboratorVisibilityState(
  projectId: string,
  userId: string,
) {
  return withPrismaRetry(() =>
    prisma.projectCollaborator.findUnique({
      where: {
        projectId_userId: {
          projectId,
          userId,
        },
      },
      select: {
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
    }),
  );
}

export async function assertProjectTimestampVisibleForUser(
  user: VisibilityAccessUser,
  input: {
    projectId: string;
    projectOwnerId: string;
    timestamp: Date | string | number;
    message?: string;
  },
) {
  if (canBypassCollaboratorVisibility(user, input.projectOwnerId)) {
    return;
  }

  const visibilityState = await getProjectCollaboratorVisibilityState(
    input.projectId,
    user.id,
  );

  if (!visibilityState) {
    return;
  }

  if (
    visibilityState.chatVisibilityPaused &&
    visibilityState.visibilityPauses.length === 0
  ) {
    throw new Error(input.message ?? "You do not have permission to access this item.");
  }

  if (
    isTimestampHiddenByPauseWindows(
      input.timestamp,
      visibilityState.visibilityPauses,
    )
  ) {
    throw new Error(input.message ?? "You do not have permission to access this item.");
  }
}

export function canBypassCollaboratorVisibility(
  user: VisibilityAccessUser,
  projectOwnerId: string,
) {
  return (
    user.role === UserRole.SUPER_ADMIN ||
    user.role === UserRole.ADMIN ||
    user.id === projectOwnerId
  );
}
