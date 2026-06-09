import { randomUUID } from "node:crypto";
import { unstable_cache } from "next/cache";
import {
  ActivityLogAction,
  AttachmentAssetType,
  AttachmentStatus,
  ProjectStatus,
  ProjectRevisionStatus,
  SubmissionReviewStatus,
  UserRole,
  type ProjectExecutorRole,
  type User,
} from "@prisma/client";

import type { ProjectAttachmentRecord, ProjectChatEntry } from "@/lib/projects";
import { getCollaboratorRoleLabel } from "@/lib/project-collaborator-participant-types";
import type { PermissionKey } from "@/lib/permissions/definitions";
import {
  hasPermission,
  hasProjectPermission,
  isMainProjectExecutor,
  type PermissionUser,
  type ProjectPermissionContext,
} from "@/lib/permissions/resolver";
import {
  notifyFileUploaded,
  notifyInvoiceUploaded,
  runNotificationTaskAfterResponse,
} from "@/lib/notification-center";
import { getFavoriteAttachmentIdSetForUser } from "@/lib/file-favorite-queries";
import { getVisibleStageEventRecipientUserIds } from "@/lib/notification-center/recipients";
import {
  assertProjectTimestampVisibleForUser,
  canBypassCollaboratorVisibility,
  getProjectCollaboratorVisibilityState,
  isTimestampHiddenByPauseWindows,
  type ProjectCollaboratorVisibilityPauseRecord,
} from "@/lib/project-collaborator-visibility";
import { PROJECTS_CACHE_TAG } from "@/lib/projects";
import { prisma, withPrismaRetry } from "@/lib/prisma";
import type { LibraryUploadMetadata } from "@/lib/library-shared";
import {
  buildProjectAssetKey,
  createPresignedDownloadUrl,
  createPresignedPreviewUrl,
  createPresignedUploadUrl,
  deleteObjectIfNeeded,
  getFileExtension,
  getMaxAssetUploadBytes,
  getS3BucketName,
  isAllowedAssetFile,
  isAllowedSubmissionImage,
  sanitizeFileName,
} from "@/lib/storage/s3";

type AccessUser = Pick<
  User,
  "id" | "email" | "name" | "role" | "projectAccess" | "collaboratorType"
> &
  PermissionUser & {
  libraryAccess?: User["libraryAccess"];
};

export type ProjectHistoryAccessUser = AccessUser;

type StageHistoryQueryRecord = {
  id: string;
  projectId: string;
  stageId: string;
  revisionNumber: number;
  title: string;
  summary: string | null;
  status: ProjectRevisionStatus;
  rejectionReason: string | null;
  reviewedAt: Date | null;
  reviewedBy: Pick<User, "name" | "email"> | null;
  createdAt: Date;
  createdBy: Pick<
    User,
    "id" | "name" | "email" | "role" | "collaboratorType" | "avatarUrl"
  >;
  attachments: Array<{
    id: string;
    assetType: AttachmentAssetType;
    originalFileName: string;
    mimeType: string;
    fileSize: number;
    submissionReviewStatus: SubmissionReviewStatus | null;
    createdAt: Date;
    status: AttachmentStatus;
    uploadedBy: Pick<User, "name" | "email">;
  }>;
};

type StageCommentQueryRecord = {
  id: string;
  projectId: string;
  stageId: string;
  revisionId: string | null;
  body: string;
  createdAt: Date;
  author: Pick<
    User,
    "id" | "name" | "email" | "role" | "collaboratorType" | "avatarUrl"
  >;
  mentions: Array<{
    mentionedUserId: string;
    mentionedUser: Pick<User, "name" | "email">;
  }>;
  attachments: Array<{
    id: string;
    assetType: AttachmentAssetType;
    originalFileName: string;
    mimeType: string;
    fileSize: number;
    submissionReviewStatus: SubmissionReviewStatus | null;
    createdAt: Date;
    status: AttachmentStatus;
    uploadedBy: Pick<User, "name" | "email">;
  }>;
};

type StageComparisonQueryRecord = {
  id: string;
  projectId: string;
  stageId: string;
  baseAttachmentId: string;
  compareAttachmentId: string;
  xPercent: number;
  yPercent: number;
  body: string;
  createdAt: Date;
  createdBy: Pick<
    User,
    "id" | "name" | "email" | "role" | "collaboratorType" | "avatarUrl"
  >;
  baseAttachment: {
    id: string;
    assetType: AttachmentAssetType;
    originalFileName: string;
    mimeType: string;
    fileSize: number;
    submissionReviewStatus: SubmissionReviewStatus | null;
    createdAt: Date;
    status: AttachmentStatus;
    uploadedBy: Pick<User, "name" | "email">;
  };
  compareAttachment: {
    id: string;
    assetType: AttachmentAssetType;
    originalFileName: string;
    mimeType: string;
    fileSize: number;
    submissionReviewStatus: SubmissionReviewStatus | null;
    createdAt: Date;
    status: AttachmentStatus;
    uploadedBy: Pick<User, "name" | "email">;
  };
};

export type StageHistoryRecord = {
  activeStageId: string | null;
  latestRevisionId: string | null;
  entries: ProjectChatEntry[];
};

export type RequestUploadInput = {
  projectId: string;
  stageId?: string | null;
  revisionId?: string | null;
  commentId?: string | null;
  originalFileName: string;
  mimeType: string;
  fileSize: number;
  assetType: AttachmentAssetType;
};

export type RequestUploadResult =
  | { error: string }
  | {
      attachmentId: string;
      fileName: string;
      uploadUrl: string;
      storageKey: string;
    };

export type StageCommentUploadFileInput = {
  clientId?: string;
  originalFileName: string;
  mimeType: string;
  fileSize: number;
  assetType: "COMMENT_ATTACHMENT" | "STAGE_SUBMISSION";
};

export type PrepareStageCommentUploadsInput = {
  projectId: string;
  stageId: string;
  revisionId?: string | null;
  body: string;
  allowEmptyBody?: boolean;
  mentionedUserIds?: string[];
  files: StageCommentUploadFileInput[];
};

export type PrepareStageCommentUploadsResult =
  | { error: string }
  | {
      commentId: string;
      revisionId: string | null;
      mentionedUserIds: string[];
      uploads: Array<{
        clientId?: string;
        attachmentId: string;
        fileName: string;
        uploadUrl: string;
        storageKey: string;
      }>;
    };

export type FinalizePreparedStageCommentUploadsResult = {
  commentId: string;
  stageId: string;
  mentionedUserIds: string[];
};

function getDisplayName(user: Pick<User, "name" | "email">) {
  return user.name?.trim() || user.email;
}

function getActorRole(user: Pick<User, "role" | "collaboratorType">) {
  if (user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN) {
    return "Internal Team";
  }

  return getCollaboratorRoleLabel(user.collaboratorType);
}

function getProfileAvatarSrc(user: Pick<User, "avatarUrl">) {
  return user.avatarUrl
    ? `/api/profile/avatar?v=${encodeURIComponent(user.avatarUrl)}`
    : null;
}

function formatHistoryTimestamp(date: Date | string | number) {
  const normalizedDate = toHistoryDate(date);

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

function toHistoryDate(value: Date | string | number) {
  return value instanceof Date ? value : new Date(value);
}

function formatFileSize(fileSize: number) {
  if (fileSize >= 1024 * 1024) {
    return `${(fileSize / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (fileSize >= 1024) {
    return `${(fileSize / 1024).toFixed(1)} KB`;
  }

  return `${fileSize} B`;
}

function getFileTypeLabel(fileName: string, mimeType: string) {
  const extension = getFileExtension(fileName).toUpperCase();

  if (extension) {
    return extension;
  }

  const subtype = mimeType.split("/")[1];
  return subtype ? subtype.toUpperCase() : "FILE";
}

function mapAttachmentRecord(
  attachment: {
    id: string;
    assetType: AttachmentAssetType;
    originalFileName: string;
    mimeType: string;
    fileSize: number;
    submissionReviewStatus?: SubmissionReviewStatus | null;
    createdAt: Date | string;
    uploadedBy: Pick<User, "name" | "email">;
  },
  submissionNumber?: number,
  favoritedAttachmentIds?: ReadonlySet<string>,
): ProjectAttachmentRecord {
  const createdAt = toHistoryDate(attachment.createdAt);

  return {
    id: attachment.id,
    isSubmission: attachment.assetType === AttachmentAssetType.STAGE_SUBMISSION,
    submissionNumber,
    submissionReviewStatus: attachment.submissionReviewStatus ?? null,
    originalFileName: attachment.originalFileName,
    fileTypeLabel: getFileTypeLabel(attachment.originalFileName, attachment.mimeType),
    mimeType: attachment.mimeType,
    fileSizeLabel: formatFileSize(attachment.fileSize),
    uploadedBy: getDisplayName(attachment.uploadedBy),
    uploadedAt: Number.isNaN(createdAt.getTime())
      ? "—"
      : formatHistoryTimestamp(createdAt),
    previewPath: `/api/project-assets/${attachment.id}/preview`,
    downloadPath: `/api/project-assets/${attachment.id}/download`,
    isFavoritedByCurrentUser: favoritedAttachmentIds?.has(attachment.id) ?? false,
  };
}

function buildStageSubmissionNumberMap(
  revisions: StageHistoryQueryRecord[],
  comments: StageCommentQueryRecord[],
) {
  const submissions = [...revisions, ...comments]
    .flatMap((entry) => entry.attachments)
    .filter(
      (attachment) =>
        (attachment.assetType === AttachmentAssetType.STAGE_SUBMISSION ||
          (attachment.assetType === AttachmentAssetType.REVISION_ORIGINAL &&
            isAllowedSubmissionImage(attachment.originalFileName, attachment.mimeType))) &&
        attachment.status === AttachmentStatus.READY,
    )
    .filter(
      (attachment, index, allAttachments) =>
        allAttachments.findIndex((candidate) => candidate.id === attachment.id) === index,
    )
    .sort((left, right) => {
      const timeDifference =
        toHistoryDate(left.createdAt).getTime() - toHistoryDate(right.createdAt).getTime();

      return timeDifference !== 0 ? timeDifference : left.id.localeCompare(right.id);
    });

  return new Map(submissions.map((attachment, index) => [attachment.id, index + 1]));
}

function mapRevisionEntry(
  revision: StageHistoryQueryRecord,
  submissionNumbers: ReadonlyMap<string, number>,
  favoritedAttachmentIds?: ReadonlySet<string>,
): ProjectChatEntry {
  return {
    id: revision.id,
    revisionId: revision.id,
    revisionNumber: revision.revisionNumber,
    kind: "revision",
    title: revision.title,
    revisionStatus: revision.status,
    rejectionReason: revision.rejectionReason,
    reviewedBy: revision.reviewedBy ? getDisplayName(revision.reviewedBy) : null,
    reviewedAt: revision.reviewedAt
      ? formatHistoryTimestamp(revision.reviewedAt)
      : null,
    authorId: revision.createdBy.id,
    author: getDisplayName(revision.createdBy),
    authorAvatarSrc: getProfileAvatarSrc(revision.createdBy),
    role: getActorRole(revision.createdBy),
    body: revision.summary?.trim() || "Revision uploaded.",
    createdAt: formatHistoryTimestamp(revision.createdAt),
    attachments: revision.attachments
      .filter((attachment) => attachment.status === AttachmentStatus.READY)
      .map((attachment) =>
        mapAttachmentRecord(
          attachment,
          submissionNumbers.get(attachment.id),
          favoritedAttachmentIds,
        ),
      ),
  };
}

function isBriefAcceptedSystemBody(body: string) {
  const normalizedBody = body.trim().toLowerCase();
  return (
    (normalizedBody.includes("accepted the brief") ||
      normalizedBody.includes("accepted the project and stage brief")) &&
    normalizedBody.includes("started work on this stage")
  );
}

function getRevisionRequestSystemDetails(body: string) {
  const match = body.trim().match(/^Revision brief for Revision (\d+):\s*(.*)$/i);

  if (!match) {
    return null;
  }

  return {
    revisionLabel: `Revision ${match[1]}`,
  };
}

function isInvoiceUploadedSystemBody(body: string) {
  return body.trim().toLowerCase().includes("uploaded invoice for");
}

function mapCommentEntry(
  comment: StageCommentQueryRecord,
  submissionNumbers: ReadonlyMap<string, number>,
  favoritedAttachmentIds?: ReadonlySet<string>,
): ProjectChatEntry {
  if (isBriefAcceptedSystemBody(comment.body)) {
    const actorName = getDisplayName(comment.author);

    return {
      id: comment.id,
      revisionId: comment.revisionId ?? undefined,
      kind: "system",
      title: "Brief accepted",
      authorId: comment.author.id,
      author: actorName,
      role: getActorRole(comment.author),
      body: `${actorName} accepted the project and stage brief and started work on this stage.`,
      createdAt: formatHistoryTimestamp(comment.createdAt),
      mentions: [],
      attachments: [],
    };
  }

  const revisionRequestSystemDetails = getRevisionRequestSystemDetails(comment.body);

  if (revisionRequestSystemDetails) {
    const actorName = getDisplayName(comment.author);

    return {
      id: comment.id,
      revisionId: comment.revisionId ?? undefined,
      kind: "system",
      title: "Revision requested",
      authorId: comment.author.id,
      author: actorName,
      role: getActorRole(comment.author),
      body: `${actorName} requested a revision for ${revisionRequestSystemDetails.revisionLabel}.`,
      createdAt: formatHistoryTimestamp(comment.createdAt),
      mentions: [],
      attachments: [],
    };
  }

  if (isInvoiceUploadedSystemBody(comment.body)) {
    const actorName = getDisplayName(comment.author);

    return {
      id: comment.id,
      revisionId: comment.revisionId ?? undefined,
      kind: "system",
      title: "Invoice uploaded",
      authorId: comment.author.id,
      author: actorName,
      role: getActorRole(comment.author),
      body: comment.body,
      createdAt: formatHistoryTimestamp(comment.createdAt),
      mentions: [],
      attachments: [],
    };
  }

  return {
    id: comment.id,
    revisionId: comment.revisionId ?? undefined,
    kind: "comment",
    authorId: comment.author.id,
    author: getDisplayName(comment.author),
    authorAvatarSrc: getProfileAvatarSrc(comment.author),
    role: getActorRole(comment.author),
    body: comment.body,
    createdAt: formatHistoryTimestamp(comment.createdAt),
    mentions: comment.mentions.map((mention) => ({
      userId: mention.mentionedUserId,
      name: getDisplayName(mention.mentionedUser),
    })),
    attachments: comment.attachments
      .filter((attachment) => attachment.status === AttachmentStatus.READY)
      .map((attachment) =>
        mapAttachmentRecord(
          attachment,
          submissionNumbers.get(attachment.id),
          favoritedAttachmentIds,
        ),
    ),
  };
}

function getComparisonSubmissionLabel(
  attachment: Pick<StageComparisonQueryRecord["baseAttachment"], "id" | "status">,
  submissionNumbers: ReadonlyMap<string, number>,
) {
  if (attachment.status !== AttachmentStatus.READY) {
    return "File unavailable";
  }

  const submissionNumber = submissionNumbers.get(attachment.id);
  return submissionNumber ? `Submission ${submissionNumber}` : "Submission";
}

function getComparisonFileName(
  attachment: Pick<StageComparisonQueryRecord["baseAttachment"], "originalFileName" | "status">,
) {
  return attachment.status === AttachmentStatus.READY
    ? attachment.originalFileName
    : "File unavailable";
}

function mapComparisonEntry(
  comparison: StageComparisonQueryRecord,
  submissionNumbers: ReadonlyMap<string, number>,
): ProjectChatEntry {
  return {
    id: `comparison-${comparison.id}`,
    kind: "comparison",
    title: "Comparison submitted",
    authorId: comparison.createdBy.id,
    author: getDisplayName(comparison.createdBy),
    authorAvatarSrc: getProfileAvatarSrc(comparison.createdBy),
    role: getActorRole(comparison.createdBy),
    body: comparison.body,
    createdAt: formatHistoryTimestamp(comparison.createdAt),
    attachments: [],
    comparison: {
      baseAttachmentId: comparison.baseAttachmentId,
      compareAttachmentId: comparison.compareAttachmentId,
      baseFileName: getComparisonFileName(comparison.baseAttachment),
      compareFileName: getComparisonFileName(comparison.compareAttachment),
      baseSubmissionLabel: getComparisonSubmissionLabel(
        comparison.baseAttachment,
        submissionNumbers,
      ),
      compareSubmissionLabel: getComparisonSubmissionLabel(
        comparison.compareAttachment,
        submissionNumbers,
      ),
      xPercent: comparison.xPercent,
      yPercent: comparison.yPercent,
    },
  };
}

async function getProjectAccessRecord(projectId: string, userId?: string) {
  return withPrismaRetry(() =>
    prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        createdById: true,
        executorUserId: true,
        executors: {
          select: {
            userId: true,
            role: true,
          },
        },
        status: true,
        archivedAt: true,
        currency: true,
        budget: true,
        endDate: true,
        collaborators: userId
          ? {
              where: {
                userId,
              },
              select: {
                userId: true,
              },
            }
          : false,
        stages: {
          orderBy: {
            order: "asc",
          },
          select: {
            id: true,
            name: true,
            budget: true,
            invoiceRequired: true,
            actualStartedAt: true,
            status: true,
            order: true,
            createdAt: true,
          },
        },
      },
    }),
  );
}

function isMainProjectExecutorUser(
  project: {
    createdById?: string | null;
    executorUserId?: string | null;
    executors?: Array<{ userId: string; role: ProjectExecutorRole }>;
  },
  userId: string,
) {
  return isMainProjectExecutor(
    { id: userId },
    {
      executorUserId: project.executorUserId ?? null,
      executors: project.executors,
    },
  );
}

function canUserUploadLibraryAssets(user: AccessUser) {
  return hasPermission(user, "library.uploadAsset");
}

export async function assertProjectAccess(user: AccessUser, projectId: string) {
  const project = await getProjectAccessRecord(projectId, user.id);

  if (!project) {
    throw new Error("Project not found.");
  }

  if (hasProjectPermission(user, project, "project.view")) {
    return project;
  }

  throw new Error("You do not have access to this project.");
}

function assertProjectAccessFromContext(
  user: AccessUser,
  project: ProjectPermissionContext,
) {
  if (hasProjectPermission(user, project, "project.view")) {
    return project;
  }

  throw new Error("You do not have access to this project.");
}

function assertProjectWorkflowPermission(
  user: AccessUser,
  project: ProjectPermissionContext,
  permissionKey: PermissionKey,
  message: string,
) {
  if (!hasProjectPermission(user, project, permissionKey)) {
    throw new Error(message);
  }
}

function getUploadPermissionKey(assetType: AttachmentAssetType): PermissionKey {
  switch (assetType) {
    case AttachmentAssetType.STAGE_SUBMISSION:
    case AttachmentAssetType.REVISION_ORIGINAL:
    case AttachmentAssetType.STAGE_INVOICE:
      return "file.uploadSubmission";
    case AttachmentAssetType.COMMENT_ATTACHMENT:
      return "chat.uploadAttachment";
    case AttachmentAssetType.GENERAL_PROJECT_ASSET:
    default:
      return "library.uploadAsset";
  }
}

function resolveStageId(
  project: Awaited<ReturnType<typeof getProjectAccessRecord>>,
  preferredStageId?: string | null,
) {
  if (!project) {
    return null;
  }

  if (preferredStageId && project.stages.some((stage) => stage.id === preferredStageId)) {
    return preferredStageId;
  }

  return project.stages[0]?.id ?? null;
}

function filterAttachmentsOutsidePauseWindows<
  T extends {
    createdAt: Date | string;
  },
>(attachments: T[], pauseWindows: ProjectCollaboratorVisibilityPauseRecord[]) {
  if (pauseWindows.length === 0) {
    return attachments;
  }

  return attachments.filter(
    (attachment) => !isTimestampHiddenByPauseWindows(attachment.createdAt, pauseWindows),
  );
}

function filterHistoryEntriesOutsidePauseWindows<
  T extends {
    createdAt: Date;
    attachments: Array<{
      createdAt: Date;
    }>;
  },
>(entries: T[], pauseWindows: ProjectCollaboratorVisibilityPauseRecord[]) {
  if (pauseWindows.length === 0) {
    return entries;
  }

  return entries
    .filter((entry) => !isTimestampHiddenByPauseWindows(entry.createdAt, pauseWindows))
    .map((entry) => ({
      ...entry,
      attachments: filterAttachmentsOutsidePauseWindows(entry.attachments, pauseWindows),
    }));
}

async function getProjectVisibilityPauseWindows(
  user: AccessUser,
  project: NonNullable<Awaited<ReturnType<typeof getProjectAccessRecord>>>,
) {
  if (canBypassCollaboratorVisibility(user, project.createdById)) {
    return [];
  }

  const visibilityState = await getProjectCollaboratorVisibilityState(project.id, user.id);
  return visibilityState?.visibilityPauses ?? [];
}

async function hasReadyStageInvoice(projectId: string, stageId: string) {
  const invoice = await withPrismaRetry(() =>
    prisma.projectAttachment.findFirst({
      where: {
        projectId,
        stageId,
        assetType: AttachmentAssetType.STAGE_INVOICE,
        status: AttachmentStatus.READY,
      },
      select: {
        id: true,
      },
    }),
  );

  return Boolean(invoice);
}

export async function assertProjectAttachmentVisibilityForUser(
  user: AccessUser,
  attachment: {
    projectId: string;
    createdAt: Date;
    project: {
      createdById: string;
    };
  },
) {
  await assertProjectTimestampVisibleForUser(user, {
    projectId: attachment.projectId,
    projectOwnerId: attachment.project.createdById,
    timestamp: attachment.createdAt,
    message: "You do not have permission to access this file.",
  });
}

export async function getProjectStageHistory(
  user: AccessUser,
  projectId: string,
  preferredStageId?: string | null,
  requiredPermissionKey: PermissionKey = "chat.view",
): Promise<StageHistoryRecord> {
  const project = await assertProjectAccess(user, projectId);
  assertProjectWorkflowPermission(
    user,
    project,
    requiredPermissionKey,
    requiredPermissionKey === "compare.view"
      ? "You do not have permission to compare project submissions."
      : "You do not have permission to view project chat.",
  );
  const activeStageId = resolveStageId(project, preferredStageId);

  if (!activeStageId) {
    return {
      activeStageId: null,
      latestRevisionId: null,
      entries: [],
    };
  }

  const getCachedHistory = unstable_cache(
    async () =>
      withPrismaRetry(() =>
        Promise.all([
          prisma.projectRevision.findMany({
            where: {
              projectId,
              stageId: activeStageId,
            },
            orderBy: {
              createdAt: "asc",
            },
            include: {
              createdBy: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  role: true,
                  collaboratorType: true,
                  avatarUrl: true,
                },
              },
              reviewedBy: {
                select: {
                  name: true,
                  email: true,
                },
              },
              attachments: {
                orderBy: {
                  createdAt: "asc",
                },
                select: {
                  id: true,
                  assetType: true,
                  originalFileName: true,
                  mimeType: true,
                  fileSize: true,
                  submissionReviewStatus: true,
                  createdAt: true,
                  status: true,
                  uploadedBy: {
                    select: {
                      name: true,
                      email: true,
                    },
                  },
                },
              },
            },
          }),
          prisma.projectComment.findMany({
            where: {
              projectId,
              stageId: activeStageId,
            },
            orderBy: {
              createdAt: "asc",
            },
            include: {
              author: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  role: true,
                  collaboratorType: true,
                  avatarUrl: true,
                },
              },
              mentions: {
                select: {
                  mentionedUserId: true,
                  mentionedUser: {
                    select: {
                      name: true,
                      email: true,
                    },
                  },
                },
              },
              attachments: {
                orderBy: {
                  createdAt: "asc",
                },
                select: {
                  id: true,
                  assetType: true,
                  originalFileName: true,
                  mimeType: true,
                  fileSize: true,
                  submissionReviewStatus: true,
                  createdAt: true,
                  status: true,
                  uploadedBy: {
                    select: {
                      name: true,
                      email: true,
                    },
                  },
                },
              },
            },
          }),
          prisma.comparisonComment.findMany({
            where: {
              projectId,
              stageId: activeStageId,
            },
            orderBy: {
              createdAt: "asc",
            },
            include: {
              createdBy: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  role: true,
                  collaboratorType: true,
                  avatarUrl: true,
                },
              },
              baseAttachment: {
                select: {
                  id: true,
                  assetType: true,
                  originalFileName: true,
                  mimeType: true,
                  fileSize: true,
                  submissionReviewStatus: true,
                  createdAt: true,
                  status: true,
                  uploadedBy: {
                    select: {
                      name: true,
                      email: true,
                    },
                  },
                },
              },
              compareAttachment: {
                select: {
                  id: true,
                  assetType: true,
                  originalFileName: true,
                  mimeType: true,
                  fileSize: true,
                  submissionReviewStatus: true,
                  createdAt: true,
                  status: true,
                  uploadedBy: {
                    select: {
                      name: true,
                      email: true,
                    },
                  },
                },
              },
            },
          }),
        ]),
      ),
    ["project-stage-history", projectId, activeStageId],
    { revalidate: 20, tags: [PROJECTS_CACHE_TAG] },
  );

  const [allRevisions, allComments, allComparisons] = await getCachedHistory();
  const submissionNumbers = buildStageSubmissionNumberMap(allRevisions, allComments);
  const pauseWindows = await getProjectVisibilityPauseWindows(user, project);
  const revisions = filterHistoryEntriesOutsidePauseWindows(allRevisions, pauseWindows);
  const comments = filterHistoryEntriesOutsidePauseWindows(allComments, pauseWindows);
  const comparisons =
    pauseWindows.length > 0
      ? allComparisons.filter(
          (comparison) =>
            !isTimestampHiddenByPauseWindows(comparison.createdAt, pauseWindows),
        )
      : allComparisons;
  const favoritedAttachmentIds = await getFavoriteAttachmentIdSetForUser(
    user.id,
    [...revisions, ...comments]
      .flatMap((entry) => entry.attachments)
      .filter((attachment) => attachment.status === AttachmentStatus.READY)
      .map((attachment) => attachment.id),
  );
  const entries = [
    ...revisions.map((revision) => ({
      createdAt: toHistoryDate(revision.createdAt).getTime(),
      entry: mapRevisionEntry(revision, submissionNumbers, favoritedAttachmentIds),
    })),
    ...comments.map((comment) => ({
      createdAt: toHistoryDate(comment.createdAt).getTime(),
      entry: mapCommentEntry(comment, submissionNumbers, favoritedAttachmentIds),
    })),
    ...comparisons.map((comparison) => ({
      createdAt: toHistoryDate(comparison.createdAt).getTime(),
      entry: mapComparisonEntry(comparison, submissionNumbers),
    })),
  ]
    .sort((left, right) => right.createdAt - left.createdAt)
    .map((item) => item.entry);

  return {
    activeStageId,
    latestRevisionId: revisions.at(-1)?.id ?? null,
    entries,
  };
}

export async function createStageRevision(
  user: AccessUser,
  input: {
    projectId: string;
    stageId: string;
    summary?: string;
  },
) {
  const project = await assertProjectAccess(user, input.projectId);
  const stage = project.stages.find((item) => item.id === input.stageId);

  if (!stage) {
    throw new Error("Stage not found.");
  }

  assertProjectWorkflowPermission(
    user,
    project,
    "stage.submitWork",
    "Only a Main Executor can submit work for review.",
  );

  if (!isMainProjectExecutorUser(project, user.id)) {
    throw new Error("Only a Main Executor can submit work for review.");
  }

  if (project.status === "COMPLETED") {
    throw new Error("This project is already completed.");
  }

  if (project.archivedAt) {
    throw new Error("This project has already been archived.");
  }

  if (stage.status === "COMPLETED") {
    throw new Error("This stage is already completed.");
  }

  if (!stage.actualStartedAt) {
    throw new Error("Please accept the brief before submitting work.");
  }

  const revision = await withPrismaRetry(async () => {
    const pendingRevision = await prisma.projectRevision.findFirst({
      where: {
        projectId: input.projectId,
        stageId: stage.id,
        status: ProjectRevisionStatus.PENDING_REVIEW,
      },
      select: {
        id: true,
      },
    });

    if (pendingRevision) {
      throw new Error(
        "A revision is already pending review. Please wait for the project owner to review it.",
      );
    }

    const latestRevision = await prisma.projectRevision.findFirst({
      where: {
        stageId: stage.id,
      },
      orderBy: {
        revisionNumber: "desc",
      },
      select: {
        revisionNumber: true,
      },
    });

    const revisionNumber = (latestRevision?.revisionNumber ?? 0) + 1;

    return prisma.projectRevision.create({
      data: {
        projectId: input.projectId,
        stageId: stage.id,
        createdById: user.id,
        revisionNumber,
        title: `Revision ${revisionNumber}`,
        summary: input.summary?.trim() || null,
        status: ProjectRevisionStatus.PENDING_REVIEW,
        reviewedById: null,
        reviewedAt: null,
        rejectionReason: null,
      },
      select: {
        id: true,
        title: true,
        revisionNumber: true,
        status: true,
      },
    });
  });

  await withPrismaRetry(() =>
    prisma.projectActivityLog.create({
      data: {
        projectId: input.projectId,
        stageId: stage.id,
        revisionId: revision.id,
        actorId: user.id,
        action: ActivityLogAction.REVISION_CREATED,
        metadata: {
          title: revision.title,
          stageName: stage.name,
        },
      },
    }),
  );

  return revision;
}

export async function createStageComment(
  user: AccessUser,
  input: {
    projectId: string;
    stageId: string;
    revisionId?: string | null;
    body: string;
    allowEmptyBody?: boolean;
    mentionedUserIds?: string[];
  },
) {
  const stage = await withPrismaRetry(() =>
    prisma.projectStage.findFirst({
      where: {
        id: input.stageId,
        projectId: input.projectId,
      },
      select: {
        id: true,
        project: {
          select: {
            createdById: true,
            executorUserId: true,
            executors: {
              select: {
                userId: true,
                role: true,
              },
            },
            status: true,
            archivedAt: true,
            collaborators: {
              where: {
                userId: user.id,
              },
              select: {
                userId: true,
              },
            },
          },
        },
        revisions: {
          orderBy: {
            revisionNumber: "desc",
          },
          take: 1,
          select: {
            id: true,
          },
        },
      },
    }),
  );

  if (!stage) {
    throw new Error("Stage not found.");
  }

  const project = assertProjectAccessFromContext(user, stage.project);

  assertProjectWorkflowPermission(
    user,
    project,
    "chat.createComment",
    "You do not have permission to add project comments.",
  );

  if (stage.project.status === "COMPLETED") {
    throw new Error("This project is already completed.");
  }

  const body = input.body.trim();
  const requestedRevisionId = input.revisionId?.trim() || null;

  if (requestedRevisionId) {
    const revision = await withPrismaRetry(() =>
      prisma.projectRevision.findFirst({
        where: {
          id: requestedRevisionId,
          projectId: input.projectId,
          stageId: stage.id,
        },
        select: {
          id: true,
        },
      }),
    );

    if (!revision) {
      throw new Error("Revision not found.");
    }
  }

  if (!body && !input.allowEmptyBody) {
    throw new Error("Enter a comment before sending.");
  }

  const requestedMentionUserIds = Array.from(
    new Set(
      (input.mentionedUserIds ?? [])
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );

  if (requestedMentionUserIds.length > 0) {
    assertProjectWorkflowPermission(
      user,
      project,
      "chat.mentionUser",
      "You do not have permission to mention users.",
    );
  }
  const validMentionUserIds =
    requestedMentionUserIds.length > 0
      ? (
          await getVisibleStageEventRecipientUserIds(input.projectId, new Date(), {
            includeOwner: true,
            includeExecutor: true,
            includeCollaborators: true,
          })
        ).filter(
          (recipientUserId) =>
            recipientUserId !== user.id &&
            requestedMentionUserIds.includes(recipientUserId),
        )
      : [];

  return withPrismaRetry(() =>
    prisma.projectComment.create({
      data: {
        projectId: input.projectId,
        stageId: stage.id,
        revisionId: requestedRevisionId,
        authorId: user.id,
        body: body || "Attachment uploaded.",
        mentions:
          validMentionUserIds.length > 0
            ? {
                createMany: {
                  data: validMentionUserIds.map((mentionedUserId) => ({
                    mentionedUserId,
                  })),
                },
              }
            : undefined,
      },
      select: {
        id: true,
        revisionId: true,
        mentions: {
          select: {
            mentionedUserId: true,
          },
        },
      },
    }),
  );
}

export async function prepareStageCommentUploads(
  user: AccessUser,
  input: PrepareStageCommentUploadsInput,
): Promise<PrepareStageCommentUploadsResult> {
  const body = input.body.trim();
  const uploadFiles = input.files;

  if (!body && !input.allowEmptyBody) {
    return { error: "Enter a comment before sending." };
  }

  if (uploadFiles.length === 0) {
    return { error: "Choose a file to upload." };
  }

  for (const file of uploadFiles) {
    if (!file.originalFileName.trim()) {
      return { error: "Choose a file to upload." };
    }

    if (!isAllowedAssetFile(file.originalFileName)) {
      return { error: "This file type is not allowed." };
    }

    if (!Number.isFinite(file.fileSize) || file.fileSize <= 0) {
      return { error: "File size is invalid." };
    }

    if (file.fileSize > getMaxAssetUploadBytes()) {
      return { error: "This file exceeds the allowed size limit." };
    }

    if (
      file.assetType !== AttachmentAssetType.COMMENT_ATTACHMENT &&
      file.assetType !== AttachmentAssetType.STAGE_SUBMISSION
    ) {
      return { error: "Unsupported chat upload type." };
    }

    if (
      file.assetType === AttachmentAssetType.STAGE_SUBMISSION &&
      !isAllowedSubmissionImage(file.originalFileName, file.mimeType)
    ) {
      return {
        error: "Submissions must be image files because they are used for comparison.",
      };
    }
  }

  const stage = await withPrismaRetry(() =>
    prisma.projectStage.findFirst({
      where: {
        id: input.stageId,
        projectId: input.projectId,
      },
      select: {
        id: true,
        actualStartedAt: true,
        status: true,
        project: {
          select: {
            createdById: true,
            executorUserId: true,
            executors: {
              select: {
                userId: true,
                role: true,
              },
            },
            status: true,
            archivedAt: true,
            collaborators: {
              where: {
                userId: user.id,
              },
              select: {
                userId: true,
              },
            },
          },
        },
        revisions: {
          orderBy: {
            revisionNumber: "desc",
          },
          take: 1,
          select: {
            id: true,
          },
        },
      },
    }),
  );

  if (!stage) {
    return { error: "Stage not found." };
  }

  const project = assertProjectAccessFromContext(user, stage.project);

  assertProjectWorkflowPermission(
    user,
    project,
    "chat.createComment",
    "You do not have permission to add project comments.",
  );

  if (stage.project.status === "COMPLETED") {
    return { error: "This project is already completed." };
  }

  if (stage.project.archivedAt) {
    return { error: "This project has already been archived." };
  }

  const hasSubmissionUpload = uploadFiles.some(
    (file) => file.assetType === AttachmentAssetType.STAGE_SUBMISSION,
  );

  if (hasSubmissionUpload) {
    if (!hasProjectPermission(user, project, "file.uploadSubmission")) {
      return { error: "Only a Main Executor can upload submissions for review." };
    }

    if (!isMainProjectExecutorUser(stage.project, user.id)) {
      return { error: "Only a Main Executor can upload submissions for review." };
    }

    if (!stage.actualStartedAt) {
      return { error: "Please accept the brief before submitting work." };
    }

    if (stage.status === "COMPLETED") {
      return { error: "This stage is already completed." };
    }

    const pendingRevision = await withPrismaRetry(() =>
      prisma.projectRevision.findFirst({
        where: {
          projectId: input.projectId,
          stageId: stage.id,
          status: ProjectRevisionStatus.PENDING_REVIEW,
        },
        select: {
          id: true,
        },
      }),
    );

    if (pendingRevision) {
      return {
        error:
          "A revision is already pending review. Please wait for the project owner to review it.",
      };
    }
  }

  if (
    uploadFiles.some((file) => file.assetType === AttachmentAssetType.COMMENT_ATTACHMENT) &&
    !hasProjectPermission(user, project, "chat.uploadAttachment")
  ) {
    return { error: "You do not have permission to upload chat attachments." };
  }

  const requestedMentionUserIds = Array.from(
    new Set(
      (input.mentionedUserIds ?? [])
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );

  if (requestedMentionUserIds.length > 0) {
    assertProjectWorkflowPermission(
      user,
      project,
      "chat.mentionUser",
      "You do not have permission to mention users.",
    );
  }

  const validMentionUserIds =
    requestedMentionUserIds.length > 0
      ? (
          await getVisibleStageEventRecipientUserIds(input.projectId, new Date(), {
            includeOwner: true,
            includeExecutor: true,
            includeCollaborators: true,
          })
        ).filter(
          (recipientUserId) =>
            recipientUserId !== user.id &&
            requestedMentionUserIds.includes(recipientUserId),
        )
      : [];
  const requestedRevisionId = input.revisionId?.trim() || null;

  if (requestedRevisionId) {
    const revision = await withPrismaRetry(() =>
      prisma.projectRevision.findFirst({
        where: {
          id: requestedRevisionId,
          projectId: input.projectId,
          stageId: stage.id,
        },
        select: {
          id: true,
        },
      }),
    );

    if (!revision) {
      return { error: "Revision not found." };
    }
  }

  const commentId = randomUUID();
  const preparedFiles = uploadFiles.map((file) => {
    const attachmentId = randomUUID();
    const uniqueFileName = `${Date.now()}-${randomUUID().slice(0, 8)}-${sanitizeFileName(
      file.originalFileName,
    )}`;

    return {
      ...file,
      attachmentId,
      uniqueFileName,
      storageKey: buildProjectAssetKey({
        projectId: input.projectId,
        stageId: stage.id,
        revisionId: requestedRevisionId,
        commentId,
        assetType: file.assetType,
        safeFileName: uniqueFileName,
      }),
    };
  });

  await withPrismaRetry(() =>
    prisma.$transaction([
      prisma.projectComment.create({
        data: {
          id: commentId,
          projectId: input.projectId,
          stageId: stage.id,
          revisionId: requestedRevisionId,
          authorId: user.id,
          body: body || "Attachment uploaded.",
          mentions:
            validMentionUserIds.length > 0
              ? {
                  createMany: {
                    data: validMentionUserIds.map((mentionedUserId) => ({
                      mentionedUserId,
                    })),
                  },
                }
              : undefined,
        },
        select: {
          id: true,
        },
      }),
      prisma.projectAttachment.createMany({
        data: preparedFiles.map((file) => ({
          id: file.attachmentId,
          projectId: input.projectId,
          stageId: stage.id,
          revisionId: requestedRevisionId,
          commentId,
          uploadedById: user.id,
          fileName: file.uniqueFileName,
          originalFileName: file.originalFileName,
          mimeType: file.mimeType,
          fileSize: file.fileSize,
          bucket: getS3BucketName(),
          storageKey: file.storageKey,
          assetType: file.assetType,
          status: AttachmentStatus.UPLOADING,
          submissionReviewStatus:
            file.assetType === AttachmentAssetType.STAGE_SUBMISSION
              ? SubmissionReviewStatus.PENDING_REVIEW
              : null,
          reviewedById: null,
          reviewedAt: null,
          reviewNote: null,
        })),
      }),
    ]),
  );

  const uploads = await Promise.all(
    preparedFiles.map(async (file) => ({
      clientId: file.clientId,
      attachmentId: file.attachmentId,
      fileName: file.uniqueFileName,
      storageKey: file.storageKey,
      uploadUrl: await createPresignedUploadUrl({
        storageKey: file.storageKey,
        mimeType: file.mimeType,
      }),
    })),
  );

  return {
    commentId,
    revisionId: requestedRevisionId,
    mentionedUserIds: validMentionUserIds,
    uploads,
  };
}

export async function cancelPreparedStageCommentUploads(
  user: AccessUser,
  input: {
    projectId: string;
    commentId: string;
  },
) {
  const comment = await withPrismaRetry(() =>
    prisma.projectComment.findFirst({
      where: {
        id: input.commentId,
        projectId: input.projectId,
        authorId: user.id,
      },
      select: {
        id: true,
      },
    }),
  );

  if (!comment) {
    return;
  }

  await withPrismaRetry(() =>
    prisma.$transaction([
      prisma.projectAttachment.deleteMany({
        where: {
          projectId: input.projectId,
          commentId: comment.id,
          uploadedById: user.id,
          assetType: {
            in: [
              AttachmentAssetType.COMMENT_ATTACHMENT,
              AttachmentAssetType.STAGE_SUBMISSION,
            ],
          },
        },
      }),
      prisma.projectComment.delete({
        where: {
          id: comment.id,
        },
      }),
    ]),
  );
}

export async function finalizePreparedStageCommentUploads(
  user: AccessUser,
  input: {
    projectId: string;
    commentId: string;
  },
): Promise<FinalizePreparedStageCommentUploadsResult> {
  const comment = await withPrismaRetry(() =>
    prisma.projectComment.findFirst({
      where: {
        id: input.commentId,
        projectId: input.projectId,
        authorId: user.id,
      },
      select: {
        id: true,
        stageId: true,
        attachments: {
          where: {
            assetType: {
              in: [
                AttachmentAssetType.COMMENT_ATTACHMENT,
                AttachmentAssetType.STAGE_SUBMISSION,
              ],
            },
          },
          select: {
            id: true,
            status: true,
          },
        },
        mentions: {
          select: {
            mentionedUserId: true,
          },
        },
      },
    }),
  );

  if (!comment) {
    throw new Error("Comment not found.");
  }

  if (
    comment.attachments.length === 0 ||
    comment.attachments.some((attachment) => attachment.status !== AttachmentStatus.READY)
  ) {
    throw new Error("All attachment uploads must finish before sending the comment.");
  }

  return {
    commentId: comment.id,
    stageId: comment.stageId,
    mentionedUserIds: comment.mentions.map((mention) => mention.mentionedUserId),
  };
}

export async function cancelStageRevisionSubmission(
  user: AccessUser,
  input: {
    projectId: string;
    stageId: string;
    revisionId: string;
  },
) {
  const revision = await withPrismaRetry(() =>
    prisma.projectRevision.findFirst({
      where: {
        id: input.revisionId,
        projectId: input.projectId,
        stageId: input.stageId,
        createdById: user.id,
        status: ProjectRevisionStatus.PENDING_REVIEW,
        reviewedById: null,
        reviewedAt: null,
      },
      select: {
        id: true,
        project: {
          select: {
            createdById: true,
            executorUserId: true,
            executors: {
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
              },
            },
          },
        },
      },
    }),
  );

  if (!revision) {
    return;
  }

  const project = assertProjectAccessFromContext(user, revision.project);

  assertProjectWorkflowPermission(
    user,
    project,
    "stage.submitWork",
    "Only a Main Executor can submit work for review.",
  );

  if (!isMainProjectExecutorUser(revision.project, user.id)) {
    throw new Error("Only a Main Executor can cancel this revision.");
  }

  await withPrismaRetry(() =>
    prisma.$transaction([
      prisma.projectAttachment.deleteMany({
        where: {
          projectId: input.projectId,
          stageId: input.stageId,
          revisionId: revision.id,
          uploadedById: user.id,
          assetType: AttachmentAssetType.REVISION_ORIGINAL,
        },
      }),
      prisma.projectActivityLog.deleteMany({
        where: {
          projectId: input.projectId,
          stageId: input.stageId,
          revisionId: revision.id,
        },
      }),
      prisma.projectRevision.delete({
        where: {
          id: revision.id,
        },
      }),
    ]),
  );
}

export async function startProjectStageWork(
  user: AccessUser,
  input: {
    projectId: string;
    stageId: string;
  },
) {
  const project = await assertProjectAccess(user, input.projectId);
  const stage = project.stages.find((item) => item.id === input.stageId);

  if (!stage) {
    throw new Error("Stage not found.");
  }

  assertProjectWorkflowPermission(
    user,
    project,
    "stage.acceptBrief",
    "Only a Main Executor can accept the brief for this stage.",
  );

  if (!isMainProjectExecutorUser(project, user.id)) {
    throw new Error("Only a Main Executor can accept the brief for this stage.");
  }

  if (project.status === "COMPLETED") {
    throw new Error("This project is already completed.");
  }

  if (project.archivedAt) {
    throw new Error("This project has already been archived.");
  }

  if (stage.actualStartedAt) {
    throw new Error("This stage has already been started.");
  }

  if (stage.status === ProjectStatus.COMPLETED) {
    throw new Error("This stage is already completed.");
  }

  return withPrismaRetry(() =>
    prisma.$transaction(async (tx) => {
      const startedAt = new Date();

      const startedStage = await tx.projectStage.update({
        where: {
          id: stage.id,
        },
        data: {
          actualStartedAt: startedAt,
          startedById: user.id,
          status: ProjectStatus.ONGOING,
        },
        select: {
          id: true,
          actualStartedAt: true,
          status: true,
        },
      });

      const activityComment = await tx.projectComment.create({
        data: {
          projectId: input.projectId,
          stageId: stage.id,
          authorId: user.id,
          body: `${getDisplayName(user)} accepted the project and stage brief and started work on this stage.`,
        },
        select: {
          id: true,
          body: true,
          createdAt: true,
        },
      });

      return {
        stage: startedStage,
        activityComment,
      };
    }),
  );
}

export async function completeProjectStage(
  user: AccessUser,
  input: {
    projectId: string;
    stageId: string;
  },
) {
  const project = await getProjectAccessRecord(input.projectId);

  if (!project) {
    throw new Error("Project not found.");
  }

  assertProjectWorkflowPermission(
    user,
    project,
    "stage.markStageComplete",
    "Only the project owner can mark this stage as complete.",
  );

  if (project.createdById !== user.id) {
    throw new Error("Only the project owner can mark this stage as complete.");
  }

  if (project.status === "COMPLETED") {
    throw new Error("This project is already completed.");
  }

  const stage = project.stages.find((item) => item.id === input.stageId);

  if (!stage) {
    throw new Error("Stage not found.");
  }

  const orderedStages = [...project.stages].sort((left, right) => left.order - right.order);
  const stageIndex = orderedStages.findIndex((item) => item.id === stage.id);
  const nextStage = stageIndex >= 0 ? orderedStages[stageIndex + 1] ?? null : null;

  if (stage.status === "COMPLETED") {
    return {
      id: stage.id,
      status: stage.status,
      nextStage: nextStage
        ? {
            id: nextStage.id,
            name: nextStage.name,
            status: nextStage.status,
          }
        : null,
      allStagesCompleted: !nextStage,
    };
  }

  if (stage.invoiceRequired && !(await hasReadyStageInvoice(input.projectId, stage.id))) {
    throw new Error("Invoice is required before completing this stage.");
  }

  const updatedStage = await withPrismaRetry(() =>
    prisma.$transaction(async (tx) => {
      const completedStage = await tx.projectStage.update({
        where: {
          id: stage.id,
        },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
        },
        select: {
          id: true,
          status: true,
        },
      });

      if (nextStage) {
        const nextStageStatus =
          nextStage.status === "PENDING" ? "ONGOING" : nextStage.status;

        if (nextStageStatus !== nextStage.status) {
          await tx.projectStage.update({
            where: {
              id: nextStage.id,
            },
            data: {
              status: nextStageStatus,
            },
          });
        }

        await tx.project.update({
          where: {
            id: input.projectId,
          },
          data: {
            currentStageName: nextStage.name,
            status: nextStageStatus,
          },
        });
      } else {
        await tx.project.update({
          where: {
            id: input.projectId,
          },
          data: {
            currentStageName: stage.name,
          },
        });
      }

      return completedStage;
    }),
  );

  return {
    ...updatedStage,
    nextStage: nextStage
      ? {
          id: nextStage.id,
          name: nextStage.name,
          status: nextStage.status === "PENDING" ? "ONGOING" : nextStage.status,
        }
      : null,
    allStagesCompleted: !nextStage,
  };
}

export async function reviewStageSubmission(
  user: AccessUser,
  input: {
    attachmentId: string;
    status: "APPROVED" | "REJECTED";
    note?: string;
  },
) {
  const attachment = await withPrismaRetry(() =>
    prisma.projectAttachment.findUnique({
      where: {
        id: input.attachmentId,
      },
      select: {
        id: true,
        assetType: true,
        status: true,
        projectId: true,
        stageId: true,
        commentId: true,
        submissionReviewStatus: true,
        project: {
          select: {
            createdById: true,
            status: true,
          },
        },
      },
    }),
  );

  if (
    !attachment ||
    attachment.assetType !== AttachmentAssetType.STAGE_SUBMISSION ||
    attachment.status !== AttachmentStatus.READY
  ) {
    throw new Error("Submission not found.");
  }

  if (
    !hasProjectPermission(
      user,
      {
        createdById: attachment.project.createdById,
        executorUserId: null,
      },
      "stage.reviewSubmission",
    )
  ) {
    throw new Error("Only the project owner can review submissions.");
  }

  if (attachment.project.createdById !== user.id) {
    throw new Error("Only the project owner can review submissions.");
  }

  if (attachment.project.status === "COMPLETED") {
    throw new Error("This project is already completed.");
  }

  if (
    attachment.submissionReviewStatus &&
    attachment.submissionReviewStatus !== SubmissionReviewStatus.PENDING_REVIEW
  ) {
    throw new Error("This submission has already been reviewed.");
  }

  return withPrismaRetry(() =>
    prisma.projectAttachment.update({
      where: {
        id: attachment.id,
      },
      data: {
        submissionReviewStatus: input.status,
        reviewedById: user.id,
        reviewedAt: new Date(),
        reviewNote: input.note?.trim() || null,
      },
      select: {
        id: true,
        submissionReviewStatus: true,
      },
    }),
  );
}

export async function reviewProjectRevision(
  user: AccessUser,
  input: {
    projectId: string;
    stageId: string;
    revisionId: string;
    status: "APPROVED" | "REJECTED";
    reason?: string;
  },
) {
  const revision = await withPrismaRetry(() =>
    prisma.projectRevision.findFirst({
      where: {
        id: input.revisionId,
        projectId: input.projectId,
        stageId: input.stageId,
      },
      select: {
        id: true,
        projectId: true,
        stageId: true,
        revisionNumber: true,
        status: true,
        title: true,
        stage: {
          select: {
            id: true,
            name: true,
            order: true,
            status: true,
            invoiceRequired: true,
          },
        },
        project: {
          select: {
            createdById: true,
            status: true,
          },
        },
      },
    }),
  );

  if (!revision) {
    throw new Error("Submission not found.");
  }

  assertProjectWorkflowPermission(
    user,
    {
      createdById: revision.project.createdById,
      executorUserId: null,
    },
    input.status === "APPROVED"
      ? "stage.markSubmissionComplete"
      : "stage.requestRevision",
    input.status === "APPROVED"
      ? "Only the project owner can review this submission."
      : "Only the project owner can request revisions.",
  );

  if (revision.project.createdById !== user.id) {
    throw new Error("Only the project owner can review this submission.");
  }

  if (revision.project.status === "COMPLETED") {
    throw new Error("This project is already completed.");
  }

  if (revision.status !== ProjectRevisionStatus.PENDING_REVIEW) {
    throw new Error("This submission is no longer pending review.");
  }

  const rejectionReason = input.reason?.trim() || "";

  if (input.status === "REJECTED" && !rejectionReason) {
    throw new Error("Revision reason is required.");
  }

  if (
    input.status === "APPROVED" &&
    revision.stage.status !== "COMPLETED" &&
    revision.stage.invoiceRequired &&
    !(await hasReadyStageInvoice(input.projectId, revision.stageId))
  ) {
    throw new Error("Invoice is required before completing this stage.");
  }

  return withPrismaRetry(() =>
    prisma.$transaction(async (tx) => {
      const updatedRevision = await tx.projectRevision.update({
        where: {
          id: revision.id,
        },
        data: {
          status: input.status,
          reviewedById: user.id,
          reviewedAt: new Date(),
          rejectionReason: input.status === "REJECTED" ? rejectionReason : null,
        },
        select: {
          id: true,
          status: true,
          rejectionReason: true,
          reviewedAt: true,
          reviewedBy: {
            select: {
              name: true,
              email: true,
            },
          },
        },
      });

      let rejectionComment:
        | {
            id: string;
            body: string;
          }
        | null = null;
      let stageCompletion:
        | {
            id: string;
            status: "COMPLETED";
            nextStage: {
              id: string;
              name: string;
              status: string;
            } | null;
            allStagesCompleted: boolean;
          }
        | null = null;

      if (input.status === "APPROVED" && revision.stage.status !== "COMPLETED") {
        const orderedStages = await tx.projectStage.findMany({
          where: {
            projectId: revision.projectId,
          },
          orderBy: {
            order: "asc",
          },
          select: {
            id: true,
            name: true,
            status: true,
            order: true,
          },
        });

        const stageIndex = orderedStages.findIndex((item) => item.id === revision.stageId);
        const nextStage = stageIndex >= 0 ? orderedStages[stageIndex + 1] ?? null : null;

        const completedAt = new Date();

        await tx.projectStage.update({
          where: {
            id: revision.stageId,
          },
          data: {
            status: "COMPLETED",
            completedAt,
          },
        });

        if (nextStage) {
          const nextStageStatus =
            nextStage.status === "PENDING" ? "ONGOING" : nextStage.status;

          if (nextStageStatus !== nextStage.status) {
            await tx.projectStage.update({
              where: {
                id: nextStage.id,
              },
              data: {
                status: nextStageStatus,
              },
            });
          }

          await tx.project.update({
            where: {
              id: revision.projectId,
            },
            data: {
              currentStageName: nextStage.name,
              status: nextStageStatus,
            },
          });

          stageCompletion = {
            id: revision.stageId,
            status: "COMPLETED",
            nextStage: {
              id: nextStage.id,
              name: nextStage.name,
              status: nextStage.status === "PENDING" ? "ONGOING" : nextStage.status,
            },
            allStagesCompleted: false,
          };
        } else {
          await tx.project.update({
            where: {
              id: revision.projectId,
            },
            data: {
              currentStageName: revision.stage.name,
            },
          });

          stageCompletion = {
            id: revision.stageId,
            status: "COMPLETED",
            nextStage: null,
            allStagesCompleted: true,
          };
        }
      }

      if (input.status === "REJECTED") {
        rejectionComment = await tx.projectComment.create({
          data: {
            projectId: revision.projectId,
            stageId: revision.stageId,
            revisionId: revision.id,
            authorId: user.id,
            body: `Revision brief for Revision ${revision.revisionNumber}: ${rejectionReason}`,
          },
          select: {
            id: true,
            body: true,
          },
        });
      }

      return {
        ...updatedRevision,
        reviewedBy: updatedRevision.reviewedBy
          ? getDisplayName(updatedRevision.reviewedBy)
          : null,
        rejectionComment,
        stageCompletion,
      };
    }),
  );
}

function getUploadAction(assetType: AttachmentAssetType) {
  return assetType === AttachmentAssetType.COMMENT_ATTACHMENT
    ? ActivityLogAction.COMMENT_ATTACHMENT_UPLOADED
    : ActivityLogAction.ASSET_UPLOADED;
}

export async function requestAttachmentUpload(
  user: AccessUser,
  input: RequestUploadInput,
): Promise<RequestUploadResult> {
  if (!input.originalFileName.trim()) {
    return { error: "Choose a file to upload." };
  }

  if (!isAllowedAssetFile(input.originalFileName)) {
    return { error: "This file type is not allowed." };
  }

  if (!Number.isFinite(input.fileSize) || input.fileSize <= 0) {
    return { error: "File size is invalid." };
  }

  if (input.fileSize > getMaxAssetUploadBytes()) {
    return { error: "This file exceeds the allowed size limit." };
  }

  if (input.assetType === AttachmentAssetType.REVISION_ORIGINAL) {
    if (!input.revisionId || !input.stageId) {
      return { error: "Stage uploads require a valid stage and revision." };
    }

    const revisionId = input.revisionId;
    const stageId = input.stageId;

    const revision = await withPrismaRetry(() =>
      prisma.projectRevision.findFirst({
        where: {
          id: revisionId,
          projectId: input.projectId,
          stageId,
        },
        select: {
          id: true,
          stage: {
            select: {
              actualStartedAt: true,
              status: true,
            },
          },
          project: {
            select: {
              createdById: true,
              executorUserId: true,
              executors: {
                select: {
                  userId: true,
                  role: true,
                },
              },
              status: true,
              collaborators: {
                where: {
                  userId: user.id,
                },
                select: {
                  userId: true,
                },
              },
            },
          },
        },
      }),
    );

    if (!revision) {
      return { error: "Revision not found." };
    }
    const project = assertProjectAccessFromContext(user, revision.project);

    if (!hasProjectPermission(user, project, getUploadPermissionKey(input.assetType))) {
      return { error: "Only a Main Executor can submit work for review." };
    }

    if (!isMainProjectExecutorUser(revision.project, user.id)) {
      return { error: "Only a Main Executor can submit work for review." };
    }

    if (revision.project.status === "COMPLETED") {
      return { error: "This project is already completed." };
    }

    if (!revision.stage.actualStartedAt) {
      return { error: "Please accept the brief before submitting work." };
    }

    if (revision.stage.status === "COMPLETED") {
      return { error: "This stage is already completed." };
    }
  } else if (input.assetType === AttachmentAssetType.STAGE_INVOICE) {
    if (!input.stageId) {
      return { error: "Stage uploads require a valid stage." };
    }

    const stageId = input.stageId;

    const stage = await withPrismaRetry(() =>
      prisma.projectStage.findFirst({
        where: {
          id: stageId,
          projectId: input.projectId,
        },
        select: {
          id: true,
          name: true,
          status: true,
          invoiceRequired: true,
          attachments: {
            where: {
              assetType: AttachmentAssetType.STAGE_INVOICE,
              status: AttachmentStatus.READY,
            },
            select: {
              id: true,
            },
            take: 1,
          },
          project: {
            select: {
              createdById: true,
              executorUserId: true,
              executors: {
                select: {
                  userId: true,
                  role: true,
                },
              },
              status: true,
              archivedAt: true,
              collaborators: {
                where: {
                  userId: user.id,
                },
                select: {
                  userId: true,
                },
              },
            },
          },
        },
      }),
    );

    if (!stage) {
      return { error: "Stage not found." };
    }

    const project = assertProjectAccessFromContext(user, stage.project);

    if (!hasProjectPermission(user, project, getUploadPermissionKey(input.assetType))) {
      return { error: "Only a Main Executor can upload the invoice for this stage." };
    }

    if (stage.project.createdById === user.id) {
      return { error: "Only a Main Executor can upload the invoice for this stage." };
    }

    if (!isMainProjectExecutorUser(stage.project, user.id)) {
      return { error: "Only a Main Executor can upload the invoice for this stage." };
    }

    if (stage.project.status === "COMPLETED") {
      return { error: "This project is already completed." };
    }

    if (stage.project.archivedAt) {
      return { error: "This project has already been archived." };
    }

    if (stage.status === "COMPLETED") {
      return { error: "This stage is already completed." };
    }

    if (!stage.invoiceRequired) {
      return { error: "Invoice is not required for this stage." };
    }

    if (stage.attachments.length > 0) {
      return { error: "An invoice has already been uploaded for this stage." };
    }
  } else if (
    input.assetType === AttachmentAssetType.COMMENT_ATTACHMENT ||
    input.assetType === AttachmentAssetType.STAGE_SUBMISSION
  ) {
    if (!input.commentId || !input.stageId) {
      return { error: "Chat uploads require a valid comment and stage." };
    }

    const commentId = input.commentId;
    const stageId = input.stageId;

    const comment = await withPrismaRetry(() =>
      prisma.projectComment.findFirst({
        where: {
          id: commentId,
          projectId: input.projectId,
          stageId,
        },
        select: {
          id: true,
          revisionId: true,
          stage: {
            select: {
              actualStartedAt: true,
              status: true,
            },
          },
          project: {
            select: {
              createdById: true,
              executorUserId: true,
              executors: {
                select: {
                  userId: true,
                  role: true,
                },
              },
              status: true,
              collaborators: {
                where: {
                  userId: user.id,
                },
                select: {
                  userId: true,
                },
              },
            },
          },
        },
      }),
    );

    if (!comment) {
      return { error: "Comment not found." };
    }

    const project = assertProjectAccessFromContext(user, comment.project);
    const uploadPermissionError =
      input.assetType === AttachmentAssetType.STAGE_SUBMISSION
        ? "Only a Main Executor can upload submissions for review."
        : "You do not have permission to upload chat attachments.";

    if (!hasProjectPermission(user, project, getUploadPermissionKey(input.assetType))) {
      return { error: uploadPermissionError };
    }

    if (
      input.assetType === AttachmentAssetType.STAGE_SUBMISSION &&
      !isMainProjectExecutorUser(comment.project, user.id)
    ) {
      return { error: "Only a Main Executor can upload submissions for review." };
    }

    if (
      input.assetType === AttachmentAssetType.STAGE_SUBMISSION &&
      !comment.stage.actualStartedAt
    ) {
      return { error: "Please accept the brief before submitting work." };
    }

    if (
      input.assetType === AttachmentAssetType.STAGE_SUBMISSION &&
      comment.stage.status === "COMPLETED"
    ) {
      return { error: "This stage is already completed." };
    }

    if (comment.project.status === "COMPLETED") {
      return { error: "This project is already completed." };
    }

    if ((comment.revisionId ?? null) !== (input.revisionId ?? null)) {
      return { error: "Comment upload context is invalid." };
    }
  } else {
    const project = await withPrismaRetry(() =>
      prisma.project.findUnique({
        where: {
          id: input.projectId,
        },
        select: {
          id: true,
          createdById: true,
          status: true,
        },
      }),
    );

    if (!project) {
      return { error: "Project not found." };
    }

    const accessProject = await assertProjectAccess(user, input.projectId);

    if (!hasProjectPermission(user, accessProject, getUploadPermissionKey(input.assetType))) {
      return { error: "You do not have permission to upload assets to the library." };
    }

    if (
      input.assetType === AttachmentAssetType.GENERAL_PROJECT_ASSET &&
      !canUserUploadLibraryAssets(user)
    ) {
      return { error: "You do not have permission to upload assets to the library." };
    }

    if (
      input.assetType !== AttachmentAssetType.FINAL_ARCHIVE &&
      project.status === "COMPLETED"
    ) {
      return { error: "This project is already completed." };
    }
  }

  if (
    input.assetType === AttachmentAssetType.STAGE_SUBMISSION &&
    !isAllowedSubmissionImage(input.originalFileName, input.mimeType)
  ) {
    return {
      error: "Submissions must be image files because they are used for comparison.",
    };
  }

  const uniqueFileName = `${Date.now()}-${randomUUID().slice(0, 8)}-${sanitizeFileName(
    input.originalFileName,
  )}`;
  const storageKey = buildProjectAssetKey({
    projectId: input.projectId,
    stageId: input.stageId,
    revisionId: input.revisionId,
    commentId: input.commentId,
    assetType: input.assetType,
    safeFileName: uniqueFileName,
  });

  const attachment = await withPrismaRetry(() =>
    prisma.projectAttachment.create({
      data: {
        projectId: input.projectId,
        stageId: input.stageId ?? null,
        revisionId: input.revisionId ?? null,
        commentId: input.commentId ?? null,
        uploadedById: user.id,
        fileName: uniqueFileName,
        originalFileName: input.originalFileName,
        mimeType: input.mimeType,
        fileSize: input.fileSize,
        bucket: getS3BucketName(),
        storageKey,
        assetType: input.assetType,
        status: AttachmentStatus.UPLOADING,
        submissionReviewStatus:
          input.assetType === AttachmentAssetType.STAGE_SUBMISSION
            ? SubmissionReviewStatus.PENDING_REVIEW
            : null,
        reviewedById: null,
        reviewedAt: null,
        reviewNote: null,
      },
      select: {
        id: true,
        fileName: true,
        storageKey: true,
      },
    }),
  );

  const uploadUrl = await createPresignedUploadUrl({
    storageKey: attachment.storageKey,
    mimeType: input.mimeType,
  });

  return {
    attachmentId: attachment.id,
    fileName: attachment.fileName,
    uploadUrl,
    storageKey: attachment.storageKey,
  };
}

export async function completeAttachmentUpload(
  user: AccessUser,
  attachmentId: string,
  failed = false,
  uploadMetadata?: LibraryUploadMetadata,
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
        revisionId: true,
        commentId: true,
        uploadedById: true,
        assetType: true,
        status: true,
        submissionReviewStatus: true,
        bucket: true,
        storageKey: true,
        originalFileName: true,
        mimeType: true,
        fileSize: true,
        project: {
          select: {
            createdById: true,
            executorUserId: true,
            executors: {
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
              },
            },
            status: true,
            archivedAt: true,
          },
        },
        stage: {
          select: {
            id: true,
            name: true,
            status: true,
            invoiceRequired: true,
          },
        },
      },
    }),
  );

  if (!attachment) {
    throw new Error("Attachment not found.");
  }

  const project = assertProjectAccessFromContext(user, attachment.project);

  if (!hasProjectPermission(user, project, getUploadPermissionKey(attachment.assetType))) {
    throw new Error("You do not have permission to complete this upload.");
  }

  if (attachment.assetType === AttachmentAssetType.STAGE_INVOICE) {
    if (!hasProjectPermission(user, project, "file.uploadSubmission")) {
      throw new Error("Only a Main Executor can upload the invoice for this stage.");
    }

    if (attachment.project.createdById === user.id) {
      throw new Error("Only a Main Executor can upload the invoice for this stage.");
    }

    if (!isMainProjectExecutorUser(attachment.project, user.id)) {
      throw new Error("Only a Main Executor can upload the invoice for this stage.");
    }

    if (attachment.uploadedById !== user.id) {
      throw new Error("Only the invoice uploader can complete this upload.");
    }

    if (!attachment.stageId || !attachment.stage) {
      throw new Error("Stage not found.");
    }

    if (attachment.project.status === "COMPLETED") {
      throw new Error("This project is already completed.");
    }

    if (attachment.project.archivedAt) {
      throw new Error("This project has already been archived.");
    }

    if (attachment.stage.status === "COMPLETED") {
      throw new Error("This stage is already completed.");
    }

    if (!attachment.stage.invoiceRequired) {
      throw new Error("Invoice is not required for this stage.");
    }

    const existingReadyInvoice = await withPrismaRetry(() =>
      prisma.projectAttachment.findFirst({
        where: {
          id: {
            not: attachment.id,
          },
          projectId: attachment.projectId,
          stageId: attachment.stageId,
          assetType: AttachmentAssetType.STAGE_INVOICE,
          status: AttachmentStatus.READY,
        },
        select: {
          id: true,
        },
      }),
    );

    if (existingReadyInvoice) {
      throw new Error("An invoice has already been uploaded for this stage.");
    }
  }

  if (failed) {
    await withPrismaRetry(() =>
      prisma.projectAttachment.update({
        where: {
          id: attachment.id,
        },
        data: {
          status: AttachmentStatus.FAILED,
        },
      }),
    );

    return;
  }

  if (
    attachment.assetType === AttachmentAssetType.GENERAL_PROJECT_ASSET &&
    !canUserUploadLibraryAssets(user)
  ) {
    throw new Error("You do not have permission to upload assets to the library.");
  }

  await withPrismaRetry(() =>
    prisma.$transaction([
      prisma.projectAttachment.update({
        where: {
          id: attachment.id,
        },
        data: {
          status: AttachmentStatus.READY,
          fileSize: attachment.fileSize,
          mimeType: attachment.mimeType,
          submissionReviewStatus:
            attachment.assetType === AttachmentAssetType.STAGE_SUBMISSION
              ? attachment.submissionReviewStatus ?? SubmissionReviewStatus.PENDING_REVIEW
              : undefined,
        },
      }),
      prisma.projectActivityLog.create({
        data: {
          projectId: attachment.projectId,
          stageId: attachment.stageId,
          revisionId: attachment.revisionId,
          actorId: user.id,
          action: getUploadAction(attachment.assetType),
          metadata: {
            attachmentId: attachment.id,
            commentId: attachment.commentId,
            fileName: attachment.originalFileName,
            storageKey: attachment.storageKey,
            ...(uploadMetadata?.source
              ? {
                  source: uploadMetadata.source,
                }
              : {}),
            ...(uploadMetadata?.category
              ? {
                  category: uploadMetadata.category,
                }
              : {}),
            ...(uploadMetadata?.note
              ? {
                  note: uploadMetadata.note,
                }
              : {}),
          },
        },
      }),
      ...(attachment.assetType === AttachmentAssetType.STAGE_INVOICE && attachment.stage
        ? [
            prisma.projectComment.create({
              data: {
                projectId: attachment.projectId,
                stageId: attachment.stageId ?? attachment.stage.id,
                authorId: user.id,
                body: `${getDisplayName(user)} uploaded invoice for ${attachment.stage.name}.`,
              },
            }),
          ]
        : []),
    ]),
  );

  runNotificationTaskAfterResponse("file-uploaded", () =>
    notifyFileUploaded({
      actorId: user.id,
      actorName: getDisplayName(user),
      projectId: attachment.projectId,
      stageId: attachment.stageId,
      attachmentId: attachment.id,
      assetType: attachment.assetType,
    }),
  );

  if (attachment.assetType === AttachmentAssetType.STAGE_INVOICE) {
    runNotificationTaskAfterResponse("invoice-uploaded", () =>
      notifyInvoiceUploaded({
        actorId: user.id,
        actorName: getDisplayName(user),
        projectId: attachment.projectId,
        stageId: attachment.stageId,
        attachmentId: attachment.id,
      }),
    );
  }
}

export async function completePreparedChatAttachmentUpload(
  user: AccessUser,
  input: {
    attachmentId: string;
    projectId: string;
    failed?: boolean;
  },
) {
  const attachment = await withPrismaRetry(() =>
    prisma.projectAttachment.findFirst({
      where: {
        id: input.attachmentId,
        projectId: input.projectId,
        uploadedById: user.id,
        assetType: {
          in: [
            AttachmentAssetType.COMMENT_ATTACHMENT,
            AttachmentAssetType.STAGE_SUBMISSION,
          ],
        },
      },
      select: {
        id: true,
        projectId: true,
        stageId: true,
        revisionId: true,
        commentId: true,
        assetType: true,
        status: true,
        submissionReviewStatus: true,
        originalFileName: true,
        storageKey: true,
      },
    }),
  );

  if (!attachment) {
    throw new Error("Attachment not found.");
  }

  if (attachment.status === AttachmentStatus.READY) {
    return;
  }

  if (attachment.status !== AttachmentStatus.UPLOADING) {
    throw new Error("Attachment cannot be completed.");
  }

  if (input.failed) {
    await withPrismaRetry(() =>
      prisma.projectAttachment.update({
        where: {
          id: attachment.id,
        },
        data: {
          status: AttachmentStatus.FAILED,
        },
      }),
    );

    return;
  }

  await withPrismaRetry(() =>
    prisma.$transaction([
      prisma.projectAttachment.update({
        where: {
          id: attachment.id,
        },
        data: {
          status: AttachmentStatus.READY,
          submissionReviewStatus:
            attachment.assetType === AttachmentAssetType.STAGE_SUBMISSION
              ? attachment.submissionReviewStatus ?? SubmissionReviewStatus.PENDING_REVIEW
              : undefined,
        },
      }),
      prisma.projectActivityLog.create({
        data: {
          projectId: attachment.projectId,
          stageId: attachment.stageId,
          revisionId: attachment.revisionId,
          actorId: user.id,
          action: getUploadAction(attachment.assetType),
          metadata: {
            attachmentId: attachment.id,
            commentId: attachment.commentId,
            fileName: attachment.originalFileName,
            storageKey: attachment.storageKey,
          },
        },
      }),
    ]),
  );

  runNotificationTaskAfterResponse("file-uploaded", () =>
    notifyFileUploaded({
      actorId: user.id,
      actorName: getDisplayName(user),
      projectId: attachment.projectId,
      stageId: attachment.stageId,
      attachmentId: attachment.id,
      assetType: attachment.assetType,
    }),
  );
}

export async function getAttachmentDownloadUrlForUser(
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
        bucket: true,
        storageKey: true,
        originalFileName: true,
        mimeType: true,
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

  const project = await assertProjectAccess(user, attachment.projectId);
  assertProjectWorkflowPermission(
    user,
    project,
    "file.download",
    "You do not have permission to download this file.",
  );
  await assertProjectAttachmentVisibilityForUser(user, attachment);

  return createPresignedDownloadUrl({
    bucket: attachment.bucket,
    storageKey: attachment.storageKey,
    fileName: attachment.originalFileName,
    mimeType: attachment.mimeType,
  });
}

export async function getAttachmentPreviewUrlForUser(
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
        bucket: true,
        storageKey: true,
        originalFileName: true,
        mimeType: true,
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

  const project = await assertProjectAccess(user, attachment.projectId);
  assertProjectWorkflowPermission(
    user,
    project,
    "file.view",
    "You do not have permission to preview this file.",
  );
  await assertProjectAttachmentVisibilityForUser(user, attachment);

  return createPresignedPreviewUrl({
    bucket: attachment.bucket,
    storageKey: attachment.storageKey,
    fileName: attachment.originalFileName,
    mimeType: attachment.mimeType,
  });
}

export async function deleteAttachmentForUser(
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
        bucket: true,
        storageKey: true,
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

  if (!attachment || attachment.status === AttachmentStatus.DELETED) {
    throw new Error("Attachment not found.");
  }

  const project = await assertProjectAccess(user, attachment.projectId);
  assertProjectWorkflowPermission(
    user,
    project,
    "file.delete",
    "You do not have permission to delete this file.",
  );
  await assertProjectAttachmentVisibilityForUser(user, attachment);

  await deleteObjectIfNeeded(attachment.storageKey, attachment.bucket).catch(() => undefined);

  await withPrismaRetry(() =>
    prisma.projectAttachment.update({
      where: {
        id: attachment.id,
      },
      data: {
        status: AttachmentStatus.DELETED,
      },
    }),
  );
}
