import {
  AttachmentAssetType,
  AttachmentStatus,
  StageStatus,
  UserRole,
  type User,
} from "@prisma/client";

import {
  type ComparisonCommentRecord,
  type SubmissionCaptionRecord,
  normalizeComparisonPairIds,
} from "@/lib/comparison-utils";
import {
  assertProjectAccess,
  assertStageChatWriteAccess,
  assertProjectAttachmentVisibilityForUser,
} from "@/lib/project-history";
import {
  canAddProjectCaptions,
  hasProjectPermission,
  type PermissionUser,
} from "@/lib/permissions/resolver";
import { getCollaboratorRoleLabel } from "@/lib/project-collaborator-participant-types";
import {
  canBypassCollaboratorVisibility,
  getProjectCollaboratorVisibilityState,
  isTimestampHiddenByPauseWindows,
} from "@/lib/project-collaborator-visibility";
import { isProjectStatusCompleted } from "@/lib/project-statuses";
import { prisma, withPrismaRetry } from "@/lib/prisma";
import { isAllowedStageSubmissionFile } from "@/lib/upload-validation";

type AccessUser = Pick<
  User,
  "id" | "email" | "name" | "role" | "collaboratorType"
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

function isComparableSubmissionAttachment(input: {
  fileName: string;
  mimeType: string;
  projectCategory?: string | null;
}) {
  return isAllowedStageSubmissionFile({
    fileName: input.fileName,
    mimeType: input.mimeType,
    projectCategory: input.projectCategory,
  });
}

function isFormalSubmissionAttachment(assetType: AttachmentAssetType) {
  return (
    assetType === AttachmentAssetType.STAGE_SUBMISSION ||
    assetType === AttachmentAssetType.REVISION_ORIGINAL
  );
}

function isCaptionableSubmissionAttachment(input: {
  assetType: AttachmentAssetType;
  status: AttachmentStatus;
  fileName: string;
  mimeType: string;
  projectCategory?: string | null;
}) {
  return (
    isFormalSubmissionAttachment(input.assetType) &&
    input.status === AttachmentStatus.READY &&
    input.mimeType.toLowerCase() === "image/png" &&
    isComparableSubmissionAttachment(input)
  );
}

function getUnsupportedComparisonSubmissionMessage() {
  return "Only valid PNG stage submissions can be compared. Please upload a PNG submission.";
}

function getUnsupportedCaptionSubmissionMessage() {
  return "Only valid PNG stage submissions can be captioned. Please upload a PNG submission.";
}

function clampPercent(value: number) {
  return Math.min(100, Math.max(0, value));
}

function normalizeComparisonOpacity(value: number | null | undefined) {
  if (!Number.isFinite(value ?? Number.NaN)) {
    return null;
  }

  return Math.min(100, Math.max(0, Number(value)));
}

function assertCaptionBodyAndPosition(input: {
  body: string;
  xPercent: number;
  yPercent: number;
}) {
  const body = input.body.trim();

  if (!body) {
    throw new Error("Enter a caption before sending.");
  }

  if (!Number.isFinite(input.xPercent) || !Number.isFinite(input.yPercent)) {
    throw new Error("Caption position is invalid.");
  }

  return body;
}

function mapComparisonCommentRecord(comment: {
  id: string;
  isCaption: boolean;
  captionAttachmentId: string | null;
  comparisonOpacity: number | null;
  xPercent: number;
  yPercent: number;
  body: string;
  createdAt: Date;
  createdBy: Pick<User, "name" | "email" | "role" | "collaboratorType">;
}): ComparisonCommentRecord {
  return {
    id: comment.id,
    isCaption: comment.isCaption,
    captionAttachmentId: comment.captionAttachmentId,
    comparisonOpacity: comment.comparisonOpacity,
    xPercent: comment.xPercent,
    yPercent: comment.yPercent,
    body: comment.body,
    author: getDisplayName(comment.createdBy),
    role: getActorRole(comment.createdBy),
    createdAt: formatComparisonTimestamp(comment.createdAt),
  };
}

function mapSubmissionCaptionRecord(
  comment: {
    id: string;
    captionAttachmentId: string | null;
    xPercent: number;
    yPercent: number;
    body: string;
    createdAt: Date;
    createdBy: Pick<User, "name" | "email" | "role" | "collaboratorType">;
  },
  attachment: {
    id: string;
    originalFileName: string;
  },
  options: {
    isReadOnly: boolean;
  },
): SubmissionCaptionRecord {
  return {
    id: comment.id,
    attachmentId: comment.captionAttachmentId ?? attachment.id,
    attachmentFileName: attachment.originalFileName,
    isReadOnly: options.isReadOnly,
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
      !isComparableSubmissionAttachment({
        fileName: attachment.originalFileName,
        mimeType: attachment.mimeType,
        projectCategory: project.category,
      }),
    )
  ) {
    if (options.throwOnInvalidPair) {
      throw new Error(getUnsupportedComparisonSubmissionMessage());
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
        ownerId: project.ownerId,
        coOwners: project.coOwners,
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

async function getVisibleSubmissionCaptionContext(
  user: AccessUser,
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
        stageId: true,
        assetType: true,
        status: true,
        originalFileName: true,
        mimeType: true,
        createdAt: true,
      },
    }),
  );

  if (!attachment || !attachment.stageId) {
    throw new Error("Submission not found.");
  }

  const project = await assertProjectAccess(
    user,
    attachment.projectId,
    attachment.stageId,
  );

  if (!hasProjectPermission(user, project, "file.view")) {
    throw new Error("You do not have permission to view this submission.");
  }

  const stage = project.stages.find((item) => item.id === attachment.stageId);

  if (!stage) {
    throw new Error("Stage not found.");
  }

  await assertProjectAttachmentVisibilityForUser(user, {
    projectId: attachment.projectId,
    createdAt: attachment.createdAt,
    project: {
      ownerId: project.ownerId,
      coOwners: project.coOwners,
    },
  });

  return {
    attachment,
    project,
    stage,
  };
}

async function getLatestFormalSubmissionAttachmentId(input: {
  projectId: string;
  stageId: string;
}) {
  const latestAttachment = await withPrismaRetry(() =>
    prisma.projectAttachment.findFirst({
      where: {
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
      orderBy: [
        {
          createdAt: "desc",
        },
        {
          id: "desc",
        },
      ],
      select: {
        id: true,
      },
    }),
  );

  return latestAttachment?.id ?? null;
}

async function getSubmissionCaptionReadOnlyReason(
  user: AccessUser,
  context: Awaited<ReturnType<typeof getVisibleSubmissionCaptionContext>>,
) {
  const { attachment, project, stage } = context;

  if (!canAddProjectCaptions(user, project)) {
    return "You do not have permission to add captions.";
  }

  if (isProjectStatusCompleted(project.status)) {
    return "This project is already completed.";
  }

  if (project.archivedAt) {
    return "This project has already been archived.";
  }

  if (stage.status === StageStatus.COMPLETED) {
    return "This stage is already completed. Captions are read-only.";
  }

  if (!stage.actualStartedAt) {
    return "Please accept the brief before adding captions.";
  }

  if (
    !isCaptionableSubmissionAttachment({
      assetType: attachment.assetType,
      status: attachment.status,
      fileName: attachment.originalFileName,
      mimeType: attachment.mimeType,
      projectCategory: project.category,
    })
  ) {
    return getUnsupportedCaptionSubmissionMessage();
  }

  const latestAttachmentId = await getLatestFormalSubmissionAttachmentId({
    projectId: attachment.projectId,
    stageId: stage.id,
  });

  if (latestAttachmentId && latestAttachmentId !== attachment.id) {
    return "This submission has been superseded. Existing captions are read-only.";
  }

  if (
    !canBypassCollaboratorVisibility(user, project.ownerId ?? "") &&
    !hasProjectPermission(user, project, "collaborator.pauseVisibility")
  ) {
    const visibilityState = await getProjectCollaboratorVisibilityState(
      project.id,
      user.id,
    );

    if (visibilityState?.chatVisibilityPaused) {
      return "Your chat access is currently paused for this project.";
    }
  }

  return null;
}

async function assertCanCreateSubmissionCaption(
  user: AccessUser,
  context: Awaited<ReturnType<typeof getVisibleSubmissionCaptionContext>>,
) {
  const { attachment, project, stage } = context;

  await assertStageChatWriteAccess(user, {
    projectId: attachment.projectId,
    stage: {
      id: stage.id,
      isTasker: stage.isTasker,
      conceptFolder: stage.conceptFolder,
      actualStartedAt: stage.actualStartedAt,
      status: stage.status,
      project,
    },
    permissionKey: "compare.createComment",
    permissionMessage: "You do not have permission to add captions.",
  });

  const readOnlyReason = await getSubmissionCaptionReadOnlyReason(user, context);

  if (readOnlyReason) {
    throw new Error(readOnlyReason);
  }
}

async function getComparisonCommentVisibilityPauseWindows(
  user: AccessUser,
  project: { id: string; ownerId: string | null; coOwners?: Array<{ userId: string }> },
) {
  if (
    canBypassCollaboratorVisibility(user, project.ownerId ?? "") ||
    hasProjectPermission(user, project, "collaborator.pauseVisibility")
  ) {
    return [];
  }

  const visibilityState = await getProjectCollaboratorVisibilityState(
    project.id,
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
    pair.project,
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

export async function getSubmissionCaptionsForAttachment(
  user: AccessUser,
  attachmentId: string,
) {
  const context = await getVisibleSubmissionCaptionContext(user, attachmentId);
  const readOnlyReason = await getSubmissionCaptionReadOnlyReason(user, context);
  const comments = await withPrismaRetry(() =>
    prisma.comparisonComment.findMany({
      where: {
        projectId: context.attachment.projectId,
        stageId: context.stage.id,
        isCaption: true,
        OR: [
          {
            captionAttachmentId: context.attachment.id,
          },
          {
            baseAttachmentId: context.attachment.id,
            compareAttachmentId: context.attachment.id,
          },
        ],
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
    context.project,
  );
  const visibleComments =
    pauseWindows.length > 0
      ? comments.filter(
          (comment) =>
            !isTimestampHiddenByPauseWindows(comment.createdAt, pauseWindows),
        )
      : comments;
  const isReadOnly = Boolean(readOnlyReason);

  return {
    attachment: {
      id: context.attachment.id,
      projectId: context.attachment.projectId,
      stageId: context.stage.id,
      originalFileName: context.attachment.originalFileName,
      mimeType: context.attachment.mimeType,
      previewPath: `/api/project-assets/${context.attachment.id}/preview`,
    },
    canAddCaption: !readOnlyReason,
    readOnlyReason,
    captions: visibleComments.map((comment) =>
      mapSubmissionCaptionRecord(comment, context.attachment, { isReadOnly }),
    ),
  };
}

export async function createSubmissionCaption(
  user: AccessUser,
  input: {
    attachmentId: string;
    xPercent: number;
    yPercent: number;
    body: string;
  },
) {
  const body = assertCaptionBodyAndPosition(input);
  const context = await getVisibleSubmissionCaptionContext(user, input.attachmentId);

  await assertCanCreateSubmissionCaption(user, context);

  const comment = await withPrismaRetry(() =>
    prisma.comparisonComment.create({
      data: {
        projectId: context.attachment.projectId,
        stageId: context.stage.id,
        baseAttachmentId: context.attachment.id,
        compareAttachmentId: context.attachment.id,
        captionAttachmentId: context.attachment.id,
        isCaption: true,
        comparisonOpacity: null,
        xPercent: clampPercent(input.xPercent),
        yPercent: clampPercent(input.yPercent),
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

  return {
    ...mapSubmissionCaptionRecord(comment, context.attachment, {
      isReadOnly: false,
    }),
    projectId: context.attachment.projectId,
    stageId: context.stage.id,
  };
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
    opacity?: number | null;
  },
) {
  const body = assertCaptionBodyAndPosition(input);

  const project = await assertProjectAccess(
    user,
    input.projectId,
    input.stageId,
  );
  const stage = project.stages.find((item) => item.id === input.stageId);

  if (!stage) {
    throw new Error("Stage not found.");
  }

  await assertStageChatWriteAccess(user, {
    projectId: input.projectId,
    stage: {
      id: stage.id,
      isTasker: stage.isTasker,
      conceptFolder: stage.conceptFolder,
      actualStartedAt: stage.actualStartedAt,
      status: stage.status,
      project,
    },
    permissionKey: "compare.createComment",
    permissionMessage: "You do not have permission to add captions.",
  });

  if (!canAddProjectCaptions(user, project)) {
    throw new Error("You do not have permission to add captions.");
  }

  const pair = await resolveComparableSubmissionPair(user, input, {
    throwOnInvalidPair: true,
  });

  if (pair.status !== "ready") {
    throw new Error("Comparison submissions were not found for this stage.");
  }

  const captionTarget = await getVisibleSubmissionCaptionContext(
    user,
    input.compareAttachmentId,
  );

  if (
    captionTarget.attachment.projectId !== input.projectId ||
    captionTarget.attachment.stageId !== input.stageId
  ) {
    throw new Error("Caption target does not belong to this comparison stage.");
  }

  await assertCanCreateSubmissionCaption(user, captionTarget);

  const comment = await withPrismaRetry(() =>
    prisma.comparisonComment.create({
      data: {
        projectId: input.projectId,
        stageId: input.stageId,
        baseAttachmentId: pair.normalizedBaseAttachmentId,
        compareAttachmentId: pair.normalizedCompareAttachmentId,
        captionAttachmentId: captionTarget.attachment.id,
        isCaption: true,
        comparisonOpacity: normalizeComparisonOpacity(input.opacity),
        xPercent: clampPercent(input.xPercent),
        yPercent: clampPercent(input.yPercent),
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
