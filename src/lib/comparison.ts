import { AttachmentAssetType, AttachmentStatus, UserRole, type User } from "@prisma/client";

import {
  type ComparisonCommentRecord,
  normalizeComparisonPairIds,
} from "@/lib/comparison-utils";
import { assertProjectAccess } from "@/lib/project-history";
import { prisma, withPrismaRetry } from "@/lib/prisma";
import { getCollaboratorRoleLabel } from "@/lib/project-collaborator-participant-types";

type AccessUser = Pick<
  User,
  "id" | "email" | "name" | "role" | "projectAccess" | "collaboratorType"
>;

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

async function assertComparableSubmissionPair(
  user: AccessUser,
  input: {
    projectId: string;
    stageId: string;
    baseAttachmentId: string;
    compareAttachmentId: string;
  },
) {
  await assertProjectAccess(user, input.projectId);

  const [normalizedBaseAttachmentId, normalizedCompareAttachmentId] =
    normalizeComparisonPairIds(input.baseAttachmentId, input.compareAttachmentId);

  if (normalizedBaseAttachmentId === normalizedCompareAttachmentId) {
    throw new Error("Select two different submissions to compare.");
  }

  const attachments = await withPrismaRetry(() =>
    prisma.projectAttachment.findMany({
      where: {
        id: {
          in: [normalizedBaseAttachmentId, normalizedCompareAttachmentId],
        },
        projectId: input.projectId,
        stageId: input.stageId,
        assetType: AttachmentAssetType.STAGE_SUBMISSION,
        status: AttachmentStatus.READY,
      },
      select: {
        id: true,
        originalFileName: true,
        mimeType: true,
      },
    }),
  );

  if (attachments.length !== 2) {
    throw new Error("Comparison submissions were not found for this stage.");
  }

  if (
    attachments.some((attachment) =>
      !isComparableImageAttachment(attachment.originalFileName, attachment.mimeType),
    )
  ) {
    throw new Error("Only PNG, JPG, JPEG, and WebP submissions can be compared right now.");
  }

  return {
    normalizedBaseAttachmentId,
    normalizedCompareAttachmentId,
  };
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
  const { normalizedBaseAttachmentId, normalizedCompareAttachmentId } =
    await assertComparableSubmissionPair(user, input);

  const comments = await withPrismaRetry(() =>
    prisma.comparisonComment.findMany({
      where: {
        projectId: input.projectId,
        stageId: input.stageId,
        baseAttachmentId: normalizedBaseAttachmentId,
        compareAttachmentId: normalizedCompareAttachmentId,
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

  return comments.map(mapComparisonCommentRecord);
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
    throw new Error("Enter a comment before saving.");
  }

  if (!Number.isFinite(input.xPercent) || !Number.isFinite(input.yPercent)) {
    throw new Error("Comment position is invalid.");
  }

  const project = await assertProjectAccess(user, input.projectId);

  if (project.status === "COMPLETED") {
    throw new Error("This project is already completed.");
  }

  const { normalizedBaseAttachmentId, normalizedCompareAttachmentId } =
    await assertComparableSubmissionPair(user, input);

  const comment = await withPrismaRetry(() =>
    prisma.comparisonComment.create({
      data: {
        projectId: input.projectId,
        stageId: input.stageId,
        baseAttachmentId: normalizedBaseAttachmentId,
        compareAttachmentId: normalizedCompareAttachmentId,
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
