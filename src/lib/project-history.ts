import { randomUUID } from "node:crypto";
import { unstable_cache } from "next/cache";
import {
  ActivityLogAction,
  AttachmentAssetType,
  AttachmentStatus,
  CollaboratorAccess,
  UserRole,
  type User,
} from "@prisma/client";

import type { ProjectAttachmentRecord, ProjectChatEntry } from "@/lib/projects";
import {
  canBypassCollaboratorVisibility,
  getProjectCollaboratorVisibilityState,
  isTimestampHiddenByPauseWindows,
  type ProjectCollaboratorVisibilityPauseRecord,
} from "@/lib/project-collaborator-visibility";
import { PROJECTS_CACHE_TAG } from "@/lib/projects";
import { prisma, withPrismaRetry } from "@/lib/prisma";
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
>;

export type ProjectHistoryAccessUser = AccessUser;

type StageHistoryQueryRecord = {
  id: string;
  projectId: string;
  stageId: string;
  revisionNumber: number;
  title: string;
  summary: string | null;
  createdAt: Date;
  createdBy: Pick<User, "id" | "name" | "email" | "role" | "collaboratorType">;
  attachments: Array<{
    id: string;
    assetType: AttachmentAssetType;
    originalFileName: string;
    mimeType: string;
    fileSize: number;
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
  author: Pick<User, "id" | "name" | "email" | "role" | "collaboratorType">;
  attachments: Array<{
    id: string;
    assetType: AttachmentAssetType;
    originalFileName: string;
    mimeType: string;
    fileSize: number;
    createdAt: Date;
    status: AttachmentStatus;
    uploadedBy: Pick<User, "name" | "email">;
  }>;
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

function getDisplayName(user: Pick<User, "name" | "email">) {
  return user.name?.trim() || user.email;
}

function getActorRole(user: Pick<User, "role" | "collaboratorType">) {
  if (user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN) {
    return "Internal Team";
  }

  return user.collaboratorType === "EXTERNAL" ? "External Collaborator" : "Collaborator";
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
    createdAt: Date | string;
    uploadedBy: Pick<User, "name" | "email">;
  },
  submissionNumber?: number,
): ProjectAttachmentRecord {
  const createdAt = toHistoryDate(attachment.createdAt);

  return {
    id: attachment.id,
    isSubmission: attachment.assetType === AttachmentAssetType.STAGE_SUBMISSION,
    submissionNumber,
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
        attachment.assetType === AttachmentAssetType.STAGE_SUBMISSION &&
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
): ProjectChatEntry {
  return {
    id: revision.id,
    revisionId: revision.id,
    kind: "revision",
    title: revision.title,
    author: getDisplayName(revision.createdBy),
    role: getActorRole(revision.createdBy),
    body: revision.summary?.trim() || "Revision uploaded.",
    createdAt: formatHistoryTimestamp(revision.createdAt),
    attachments: revision.attachments
      .filter((attachment) => attachment.status === AttachmentStatus.READY)
      .map((attachment) =>
        mapAttachmentRecord(attachment, submissionNumbers.get(attachment.id)),
      ),
  };
}

function mapCommentEntry(
  comment: StageCommentQueryRecord,
  submissionNumbers: ReadonlyMap<string, number>,
): ProjectChatEntry {
  return {
    id: comment.id,
    revisionId: comment.revisionId ?? undefined,
    kind: "comment",
    author: getDisplayName(comment.author),
    role: getActorRole(comment.author),
    body: comment.body,
    createdAt: formatHistoryTimestamp(comment.createdAt),
    attachments: comment.attachments
      .filter((attachment) => attachment.status === AttachmentStatus.READY)
      .map((attachment) =>
        mapAttachmentRecord(attachment, submissionNumbers.get(attachment.id)),
      ),
  };
}

async function getProjectAccessRecord(projectId: string) {
  return withPrismaRetry(() =>
    prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        createdById: true,
        currency: true,
        budget: true,
        endDate: true,
        stages: {
          orderBy: {
            order: "asc",
          },
          select: {
            id: true,
            name: true,
            budget: true,
            status: true,
            order: true,
            createdAt: true,
          },
        },
      },
    }),
  );
}

function ensureProjectAccessByOwnerId(user: AccessUser, createdById: string) {
  if (
    user.role === UserRole.SUPER_ADMIN ||
    user.role === UserRole.ADMIN ||
    createdById === user.id
  ) {
    return;
  }

  if (user.projectAccess === CollaboratorAccess.NONE) {
    throw new Error("You do not have access to this project.");
  }
}

export async function assertProjectAccess(user: AccessUser, projectId: string) {
  const project = await getProjectAccessRecord(projectId);

  if (!project) {
    throw new Error("Project not found.");
  }

  if (
    user.role === UserRole.SUPER_ADMIN ||
    user.role === UserRole.ADMIN ||
    project.createdById === user.id
  ) {
    return project;
  }

  if (user.projectAccess === CollaboratorAccess.NONE) {
    throw new Error("You do not have access to this project.");
  }

  return project;
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

async function assertProjectAttachmentVisibility(
  user: AccessUser,
  attachment: {
    projectId: string;
    createdAt: Date;
    project: {
      createdById: string;
    };
  },
) {
  if (canBypassCollaboratorVisibility(user, attachment.project.createdById)) {
    return;
  }

  const visibilityState = await getProjectCollaboratorVisibilityState(
    attachment.projectId,
    user.id,
  );
  const pauseWindows = visibilityState?.visibilityPauses ?? [];

  if (
    pauseWindows.length > 0 &&
    isTimestampHiddenByPauseWindows(attachment.createdAt, pauseWindows)
  ) {
    throw new Error("You do not have permission to access this file.");
  }
}

export async function getProjectStageHistory(
  user: AccessUser,
  projectId: string,
  preferredStageId?: string | null,
): Promise<StageHistoryRecord> {
  const project = await assertProjectAccess(user, projectId);
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

  const [allRevisions, allComments] = await getCachedHistory();
  const submissionNumbers = buildStageSubmissionNumberMap(allRevisions, allComments);
  const pauseWindows = await getProjectVisibilityPauseWindows(user, project);
  const revisions = filterHistoryEntriesOutsidePauseWindows(allRevisions, pauseWindows);
  const comments = filterHistoryEntriesOutsidePauseWindows(allComments, pauseWindows);
  const entries = [
    ...revisions.map((revision) => ({
      createdAt: toHistoryDate(revision.createdAt).getTime(),
      entry: mapRevisionEntry(revision, submissionNumbers),
    })),
    ...comments.map((comment) => ({
      createdAt: toHistoryDate(comment.createdAt).getTime(),
      entry: mapCommentEntry(comment, submissionNumbers),
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

  const revision = await withPrismaRetry(async () => {
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
      },
      select: {
        id: true,
        title: true,
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
    body: string;
    allowEmptyBody?: boolean;
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
          },
        },
      },
    }),
  );

  if (!stage) {
    throw new Error("Stage not found.");
  }

  ensureProjectAccessByOwnerId(user, stage.project.createdById);

  const latestRevision = await withPrismaRetry(() =>
    prisma.projectRevision.findFirst({
      where: {
        stageId: stage.id,
      },
      orderBy: {
        revisionNumber: "desc",
      },
      select: {
        id: true,
      },
    }),
  );

  const body = input.body.trim();

  if (!body && !input.allowEmptyBody) {
    throw new Error("Enter a comment before sending.");
  }

  return withPrismaRetry(() =>
    prisma.projectComment.create({
      data: {
        projectId: input.projectId,
        stageId: stage.id,
        revisionId: latestRevision?.id ?? null,
        authorId: user.id,
        body: body || "Attachment uploaded.",
      },
      select: {
        id: true,
        revisionId: true,
      },
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

  if (project.createdById !== user.id) {
    throw new Error("Only the project owner can mark this stage as complete.");
  }

  const stage = project.stages.find((item) => item.id === input.stageId);

  if (!stage) {
    throw new Error("Stage not found.");
  }

  if (stage.status === "COMPLETED") {
    return { id: stage.id, status: stage.status };
  }

  const orderedStages = [...project.stages].sort((left, right) => left.order - right.order);
  const stageIndex = orderedStages.findIndex((item) => item.id === stage.id);
  const nextStage = stageIndex >= 0 ? orderedStages[stageIndex + 1] ?? null : null;

  const updatedStage = await withPrismaRetry(() =>
    prisma.$transaction(async (tx) => {
      const completedStage = await tx.projectStage.update({
        where: {
          id: stage.id,
        },
        data: {
          status: "COMPLETED",
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
            status: "COMPLETED",
          },
        });
      }

      return completedStage;
    }),
  );

  return updatedStage;
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
          project: {
            select: {
              createdById: true,
            },
          },
        },
      }),
    );

    if (!revision) {
      return { error: "Revision not found." };
    }
    ensureProjectAccessByOwnerId(user, revision.project.createdById);
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
          project: {
            select: {
              createdById: true,
            },
          },
        },
      }),
    );

    if (!comment) {
      return { error: "Comment not found." };
    }

    ensureProjectAccessByOwnerId(user, comment.project.createdById);

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
        },
      }),
    );

    if (!project) {
      return { error: "Project not found." };
    }

    ensureProjectAccessByOwnerId(user, project.createdById);
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
        assetType: true,
        bucket: true,
        storageKey: true,
        originalFileName: true,
        mimeType: true,
        fileSize: true,
        project: {
          select: {
            createdById: true,
          },
        },
      },
    }),
  );

  if (!attachment) {
    throw new Error("Attachment not found.");
  }

  ensureProjectAccessByOwnerId(user, attachment.project.createdById);

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

  await withPrismaRetry(() =>
    prisma.projectAttachment.update({
      where: {
        id: attachment.id,
      },
      data: {
        status: AttachmentStatus.READY,
        fileSize: attachment.fileSize,
        mimeType: attachment.mimeType,
      },
    }),
  );

  await withPrismaRetry(() =>
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

  await assertProjectAccess(user, attachment.projectId);
  await assertProjectAttachmentVisibility(user, attachment);

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

  await assertProjectAccess(user, attachment.projectId);
  await assertProjectAttachmentVisibility(user, attachment);

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

  await assertProjectAccess(user, attachment.projectId);
  await assertProjectAttachmentVisibility(user, attachment);

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
