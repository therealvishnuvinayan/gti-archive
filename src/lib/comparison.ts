import { AttachmentAssetType, AttachmentStatus, UserRole, type User } from "@prisma/client";

import {
  type ComparisonCommentRecord,
  normalizeComparisonPairIds,
} from "@/lib/comparison-utils";
import {
  assertProjectAccess,
  assertProjectAttachmentVisibilityForUser,
} from "@/lib/project-history";
import { hasProjectPermission, type PermissionUser } from "@/lib/permissions/resolver";
import { getCollaboratorRoleLabel } from "@/lib/project-collaborator-participant-types";
import {
  canBypassCollaboratorVisibility,
  getProjectCollaboratorVisibilityState,
  isTimestampHiddenByPauseWindows,
} from "@/lib/project-collaborator-visibility";
import { prisma, withPrismaRetry } from "@/lib/prisma";

type AccessUser = Pick<
  User,
  "id" | "email" | "name" | "role" | "projectAccess" | "collaboratorType"
> &
  PermissionUser;

function getDisplayName(user: Pick<User, "name" | "email">) {
  return user.name?.trim() || user.email;
}

function getActorRole(user: Pick<User, "role" | "collaboratorType">) {
  if (user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN) {
    return "Internal Team";
  }

  return getCollaboratorRoleLabel(user.collaboratorType);
}

function formatComparisonTimestamp(date: Date | string | number) {
  const normalizedDate = date instanceof Date ? date : new Date(date);

  if (Number.isNaN(normalizedDate.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(normalizedDate);
}

function isComparableImageAttachment(fileName: string, mimeType: string) {
  const extension = fileName.split(".").at(-1)?.toLowerCase() ?? "";

  return (
    ["image/png", "image/jpeg", "image/webp"].includes(mimeType.toLowerCase()) ||
    ["png", "jpg", "jpeg", "webp"].includes(extension)
  );
}

function mapComparisonCommentRecord(comment: {
  id: string;
  xPercent: number;
  yPercent: number;
  body: string;
  createdAt: Date;
  createdBy: Pick<User, "name" | "email" | "role" | "collaboratorType">;
}): ComparisonCommentRecord {
  return {
    id: comment.id,
    xPercent: comment.xPercent,
    yPercent: comment.yPercent,
    body: comment.body,
    author: getDisplayName(comment.createdBy),
    role: getActorRole(comment.createdBy),
    createdAt: formatComparisonTimestamp(comment.createdAt),
  };
}

async function resolveComparableSubmissionPair(
  user: AccessUser,
  input: {
    projectId: string;
    stageId: string;
    baseAttachmentId: string;
    compareAttachmentId: string;
  },
  options: {
    throwOnInvalidPair?: boolean;
  } = {},
) {
  const project = await assertProjectAccess(user, input.projectId);

  if (!hasProjectPermission(user, project, "compare.view")) {
    throw new Error("You do not have permission to compare project submissions.");
  }

  const [normalizedBaseAttachmentId, normalizedCompareAttachmentId] =
    normalizeComparisonPairIds(input.baseAttachmentId, input.compareAttachmentId);

  if (normalizedBaseAttachmentId === normalizedCompareAttachmentId) {
    if (options.throwOnInvalidPair) {
      throw new Error("Select two different submissions to compare.");
    }

    return {
      status: "invalid_pair" as const,
      project,
    };
  }

  const attachments = await withPrismaRetry(() =>
    prisma.projectAttachment.findMany({
      where: {
        id: {
          in: [normalizedBaseAttachmentId, normalizedCompareAttachmentId],
        },
        projectId: input.projectId,
        stageId: input.stageId,
        assetType: {
          in: [
            AttachmentAssetType.STAGE_SUBMISSION,
            AttachmentAssetType.REVISION_ORIGINAL,
          ],
        },
        status: AttachmentStatus.READY,
      },
      select: {
        id: true,
        originalFileName: true,
        mimeType: true,
        projectId: true,
        createdAt: true,
      },
    }),
  );

  if (attachments.length !== 2) {
    if (options.throwOnInvalidPair) {
      throw new Error("Comparison submissions were not found for this stage.");
    }

    return {
      status: "missing_submissions" as const,
      project,
    };
  }

  if (
    attachments.some((attachment) =>
      !isComparableImageAttachment(attachment.originalFileName, attachment.mimeType),
    )
  ) {
    if (options.throwOnInvalidPair) {
      throw new Error("Only PNG, JPG, JPEG, and WebP submissions can be compared right now.");
    }

    return {
      status: "unsupported_submissions" as const,
      project,
    };
  }

  for (const attachment of attachments) {
    await assertProjectAttachmentVisibilityForUser(user, {
      projectId: attachment.projectId,
      createdAt: attachment.createdAt,
      project: {
        createdById: project.createdById,
      },
    });
  }

  return {
    status: "ready" as const,
    normalizedBaseAttachmentId,
    normalizedCompareAttachmentId,
    project,
  };
}

async function getComparisonCommentVisibilityPauseWindows(
  user: AccessUser,
  projectId: string,
  projectOwnerId: string,
) {
  if (canBypassCollaboratorVisibility(user, projectOwnerId)) {
    return [];
  }

  const visibilityState = await getProjectCollaboratorVisibilityState(
    projectId,
    user.id,
  );

  if (!visibilityState) {
    return [];
  }

  return visibilityState.visibilityPauses;
}

export async function getComparisonCommentsForPair(
  user: AccessUser,
  input: {
    projectId: string;
    stageId: string;
    baseAttachmentId: string;
    compareAttachmentId: string;
  },
) {
  const pair = await resolveComparableSubmissionPair(user, input);

  if (pair.status !== "ready") {
    return [];
  }

  const comments = await withPrismaRetry(() =>
    prisma.comparisonComment.findMany({
      where: {
        projectId: input.projectId,
        stageId: input.stageId,
        baseAttachmentId: pair.normalizedBaseAttachmentId,
        compareAttachmentId: pair.normalizedCompareAttachmentId,
      },
      orderBy: {
        createdAt: "asc",
      },
      include: {
        createdBy: {
          select: {
            name: true,
            email: true,
            role: true,
            collaboratorType: true,
          },
        },
      },
    }),
  );

  const pauseWindows = await getComparisonCommentVisibilityPauseWindows(
    user,
    input.projectId,
    pair.project.createdById,
  );
  const visibleComments =
    pauseWindows.length > 0
      ? comments.filter(
          (comment) =>
            !isTimestampHiddenByPauseWindows(comment.createdAt, pauseWindows),
        )
      : comments;

  return visibleComments.map(mapComparisonCommentRecord);
}

export async function createComparisonComment(
  user: AccessUser,
  input: {
    projectId: string;
    stageId: string;
    baseAttachmentId: string;
    compareAttachmentId: string;
    xPercent: number;
    yPercent: number;
    body: string;
  },
) {
  const body = input.body.trim();

  if (!body) {
    throw new Error("Enter a message before sending.");
  }

  if (!Number.isFinite(input.xPercent) || !Number.isFinite(input.yPercent)) {
    throw new Error("Comment position is invalid.");
  }

  const project = await assertProjectAccess(user, input.projectId);

  if (!hasProjectPermission(user, project, "compare.createComment")) {
    throw new Error("You do not have permission to comment in compare.");
  }

  if (project.status === "COMPLETED") {
    throw new Error("This project is already completed.");
  }

  const pair = await resolveComparableSubmissionPair(user, input, {
    throwOnInvalidPair: true,
  });

  if (pair.status !== "ready") {
    throw new Error("Comparison submissions were not found for this stage.");
  }

  const comment = await withPrismaRetry(() =>
    prisma.comparisonComment.create({
      data: {
        projectId: input.projectId,
        stageId: input.stageId,
        baseAttachmentId: pair.normalizedBaseAttachmentId,
        compareAttachmentId: pair.normalizedCompareAttachmentId,
        xPercent: Math.min(100, Math.max(0, input.xPercent)),
        yPercent: Math.min(100, Math.max(0, input.yPercent)),
        body,
        createdById: user.id,
      },
      include: {
        createdBy: {
          select: {
            name: true,
            email: true,
            role: true,
            collaboratorType: true,
          },
        },
      },
    }),
  );

  return mapComparisonCommentRecord(comment);
}
