import {
  AttachmentAssetType,
  AttachmentStatus,
  ProjectRevisionStatus,
  SubmissionReviewStatus,
  UserRole,
  type User,
} from "@prisma/client";

import {
  archiveCategoryDefinitions,
  getArchiveCategoryLabel,
  inferArchiveCategorySlug,
  isArchiveCategorySlug,
  type ArchiveCategorySlug,
} from "@/lib/archive-categories";
import { getUserDisplayName } from "@/lib/auth";
import { assertProjectAccess } from "@/lib/project-history";
import { prisma, withPrismaRetry } from "@/lib/prisma";
import {
  createPresignedDownloadUrl,
  createPresignedPreviewUrl,
  getFileExtension,
} from "@/lib/storage/s3";

export type ArchiveAccessUser = Pick<
  User,
  "id" | "role" | "email" | "name" | "projectAccess" | "collaboratorType"
>;

export type ArchiveCategorySummary = {
  slug: ArchiveCategorySlug;
  title: string;
  fileCount: number;
  projectCount: number;
  latestArchivedAt: string | null;
};

export type ArchivedProjectFileRecord = {
  id: string;
  finalArchiveFileName: string;
  originalFileName: string;
  projectId: string;
  projectName: string;
  projectCategory: string;
  projectTag: string;
  archiveCategorySlug: ArchiveCategorySlug;
  archiveCategoryLabel: string;
  sourceLabel: string;
  fileTypeLabel: string;
  mimeType: string;
  fileSizeLabel: string;
  archivedAt: string;
  archivedBy: string;
  previewPath: string;
  downloadPath: string;
};

export type ProjectArchivePreparationFile = {
  sourceAttachmentId: string;
  sourceRevisionId: string | null;
  originalFileName: string;
  fileTypeLabel: string;
  mimeType: string;
  fileSize: number;
  fileSizeLabel: string;
  sourceLabel: string;
  previewPath: string;
  downloadPath: string;
  defaultArchiveFileName: string;
};

export type ProjectArchivePreparation = {
  projectId: string;
  projectName: string;
  finalStageId: string;
  finalStageName: string;
  selectedCategorySlug: ArchiveCategorySlug;
  categories: Array<{
    slug: ArchiveCategorySlug;
    title: string;
  }>;
  files: ProjectArchivePreparationFile[];
};

export type ProjectCompletionSummary = {
  isCompleted: boolean;
  completedAt: string | null;
  archivedAt: string | null;
  finalStageId: string | null;
  finalStageName: string | null;
  isSelectedStageFinal: boolean;
  canCompleteProject: boolean;
  approvedFileCount: number;
  archiveCategorySlug: ArchiveCategorySlug | null;
  archiveCategoryLabel: string | null;
  archivedFiles: ArchivedProjectFileRecord[];
};

type ArchivableAttachment = {
  sourceAttachmentId: string;
  sourceRevisionId: string | null;
  originalFileName: string;
  mimeType: string;
  fileSize: number;
  bucket: string;
  storageKey: string;
  sourceLabel: string;
};

function formatArchiveTimestamp(value: Date | string | number | null | undefined) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatArchiveFileSize(fileSize: number) {
  if (fileSize >= 1024 * 1024) {
    return `${(fileSize / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (fileSize >= 1024) {
    return `${(fileSize / 1024).toFixed(1)} KB`;
  }

  return `${fileSize} B`;
}

function getArchiveFileTypeLabel(fileName: string, mimeType: string) {
  const extension = getFileExtension(fileName).toUpperCase();

  if (extension) {
    return extension;
  }

  const subtype = mimeType.split("/")[1];
  return subtype ? subtype.toUpperCase() : "FILE";
}

function buildAccessibleProjectWhere(user: Pick<User, "id" | "role">) {
  if (user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN) {
    return {};
  }

  return {
    OR: [
      { createdById: user.id },
      { executorUserId: user.id },
      {
        collaborators: {
          some: {
            userId: user.id,
          },
        },
      },
    ],
  };
}

async function getProjectArchiveBase(projectId: string) {
  return withPrismaRetry(() =>
    prisma.project.findUnique({
      where: {
        id: projectId,
      },
      select: {
        id: true,
        name: true,
        category: true,
        tag: true,
        status: true,
        createdById: true,
        completedAt: true,
        archivedAt: true,
        stages: {
          orderBy: {
            order: "asc",
          },
          select: {
            id: true,
            name: true,
            order: true,
            status: true,
            completedAt: true,
          },
        },
        archive: {
          select: {
            id: true,
            archiveCategorySlug: true,
            archiveCategoryLabel: true,
            archivedAt: true,
            files: {
              orderBy: [
                {
                  archivedAt: "desc",
                },
                {
                  finalArchiveFileName: "asc",
                },
              ],
              select: {
                id: true,
                finalArchiveFileName: true,
                originalFileName: true,
                mimeType: true,
                fileSize: true,
                sourceRevisionId: true,
                archivedAt: true,
                archivedBy: {
                  select: {
                    name: true,
                    email: true,
                  },
                },
                sourceRevision: {
                  select: {
                    revisionNumber: true,
                  },
                },
                sourceAttachment: {
                  select: {
                    submissionReviewStatus: true,
                  },
                },
              },
            },
          },
        },
      },
    }),
  );
}

async function getFinalStageArchivableAttachments(projectId: string, finalStageId: string) {
  const latestApprovedRevision = await withPrismaRetry(() =>
    prisma.projectRevision.findFirst({
      where: {
        projectId,
        stageId: finalStageId,
        status: ProjectRevisionStatus.APPROVED,
      },
      orderBy: [
        {
          reviewedAt: "desc",
        },
        {
          revisionNumber: "desc",
        },
      ],
      select: {
        id: true,
        revisionNumber: true,
      },
    }),
  );

  const [revisionAttachments, stageSubmissions] = await withPrismaRetry(() =>
    Promise.all([
      latestApprovedRevision
        ? prisma.projectAttachment.findMany({
            where: {
              projectId,
              stageId: finalStageId,
              revisionId: latestApprovedRevision.id,
              assetType: AttachmentAssetType.REVISION_ORIGINAL,
              status: AttachmentStatus.READY,
            },
            orderBy: [
              {
                createdAt: "asc",
              },
              {
                id: "asc",
              },
            ],
            select: {
              id: true,
              revisionId: true,
              originalFileName: true,
              mimeType: true,
              fileSize: true,
              bucket: true,
              storageKey: true,
            },
          })
        : Promise.resolve([]),
      prisma.projectAttachment.findMany({
        where: {
          projectId,
          stageId: finalStageId,
          assetType: AttachmentAssetType.STAGE_SUBMISSION,
          status: AttachmentStatus.READY,
        },
        orderBy: [
          {
            createdAt: "asc",
          },
          {
            id: "asc",
          },
        ],
        select: {
          id: true,
          revisionId: true,
          originalFileName: true,
          mimeType: true,
          fileSize: true,
          bucket: true,
          storageKey: true,
          submissionReviewStatus: true,
        },
      }),
    ]),
  );

  const submissionNumberById = new Map(
    stageSubmissions.map((attachment, index) => [attachment.id, index + 1] as const),
  );

  const approvedStageSubmissions = stageSubmissions
    .filter(
      (attachment) =>
        attachment.submissionReviewStatus === SubmissionReviewStatus.APPROVED &&
        (!latestApprovedRevision ||
          attachment.revisionId === latestApprovedRevision.id ||
          attachment.revisionId === null),
    )
    .map<ArchivableAttachment>((attachment) => ({
      sourceAttachmentId: attachment.id,
      sourceRevisionId: attachment.revisionId,
      originalFileName: attachment.originalFileName,
      mimeType: attachment.mimeType,
      fileSize: attachment.fileSize,
      bucket: attachment.bucket,
      storageKey: attachment.storageKey,
      sourceLabel: `Submission ${submissionNumberById.get(attachment.id) ?? "—"}`,
    }));

  const approvedRevisionAttachments = revisionAttachments.map<ArchivableAttachment>((attachment) => ({
    sourceAttachmentId: attachment.id,
    sourceRevisionId: attachment.revisionId,
    originalFileName: attachment.originalFileName,
    mimeType: attachment.mimeType,
    fileSize: attachment.fileSize,
    bucket: attachment.bucket,
    storageKey: attachment.storageKey,
    sourceLabel: latestApprovedRevision
      ? `Revision ${latestApprovedRevision.revisionNumber}`
      : "Approved revision",
  }));

  return [...approvedRevisionAttachments, ...approvedStageSubmissions];
}

function normalizePreparedArchiveFiles(files: ArchivableAttachment[]) {
  return files.map<ProjectArchivePreparationFile>((file) => ({
    sourceAttachmentId: file.sourceAttachmentId,
    sourceRevisionId: file.sourceRevisionId,
    originalFileName: file.originalFileName,
    fileTypeLabel: getArchiveFileTypeLabel(file.originalFileName, file.mimeType),
    mimeType: file.mimeType,
    fileSize: file.fileSize,
    fileSizeLabel: formatArchiveFileSize(file.fileSize),
    sourceLabel: file.sourceLabel,
    previewPath: `/api/project-assets/${file.sourceAttachmentId}/preview`,
    downloadPath: `/api/project-assets/${file.sourceAttachmentId}/download`,
    defaultArchiveFileName: file.originalFileName,
  }));
}

function ensureProjectCanBeCompleted(
  user: ArchiveAccessUser,
  project: NonNullable<Awaited<ReturnType<typeof getProjectArchiveBase>>>,
  stageId: string,
) {
  if (project.createdById !== user.id) {
    throw new Error("Only the project owner can complete and archive this project.");
  }

  if (project.archive || project.archivedAt || project.completedAt || project.status === "COMPLETED") {
    throw new Error("Project is already completed.");
  }

  const finalStage = project.stages.at(-1);

  if (!finalStage) {
    throw new Error("Project does not have a final stage.");
  }

  if (finalStage.id !== stageId) {
    throw new Error("Project completion is only available in the final stage.");
  }

  return finalStage;
}

function validateArchiveFileName(
  originalFileName: string,
  proposedFileName: string,
  duplicateNames: Set<string>,
) {
  const nextName = proposedFileName.trim();

  if (!nextName) {
    throw new Error("Archive file name is required.");
  }

  const originalExtension = getFileExtension(originalFileName);
  const nextExtension = getFileExtension(nextName);

  if (originalExtension && nextExtension !== originalExtension) {
    throw new Error(
      `Archive file names must keep the .${originalExtension} extension.`,
    );
  }

  if (!originalExtension && nextExtension) {
    throw new Error("Archive file name must preserve the original extension format.");
  }

  const normalizedName = nextName.toLowerCase();

  if (duplicateNames.has(normalizedName)) {
    throw new Error("Archive file names must be unique within the project archive.");
  }

  duplicateNames.add(normalizedName);

  return nextName;
}

function mapArchivedFileRecord(input: {
  id: string;
  finalArchiveFileName: string;
  originalFileName: string;
  projectId: string;
  projectName: string;
  projectCategory: string;
  projectTag: string | null;
  archiveCategorySlug: string;
  archiveCategoryLabel: string;
  sourceRevisionId: string | null;
  sourceRevisionNumber?: number | null;
  submissionReviewStatus?: SubmissionReviewStatus | null;
  mimeType: string;
  fileSize: number;
  archivedAt: Date;
  archivedBy: Pick<User, "name" | "email">;
}) {
  const categorySlug = isArchiveCategorySlug(input.archiveCategorySlug)
    ? input.archiveCategorySlug
    : "artworks";

  const sourceLabel = input.sourceRevisionId
    ? `Revision ${input.sourceRevisionNumber ?? "—"}`
    : input.submissionReviewStatus === SubmissionReviewStatus.APPROVED
      ? "Approved submission"
      : "Final archive";

  return {
    id: input.id,
    finalArchiveFileName: input.finalArchiveFileName,
    originalFileName: input.originalFileName,
    projectId: input.projectId,
    projectName: input.projectName,
    projectCategory: input.projectCategory,
    projectTag: input.projectTag?.trim() || "—",
    archiveCategorySlug: categorySlug,
    archiveCategoryLabel: input.archiveCategoryLabel,
    sourceLabel,
    fileTypeLabel: getArchiveFileTypeLabel(input.finalArchiveFileName, input.mimeType),
    mimeType: input.mimeType,
    fileSizeLabel: formatArchiveFileSize(input.fileSize),
    archivedAt: formatArchiveTimestamp(input.archivedAt) ?? "—",
    archivedBy: getUserDisplayName(input.archivedBy),
    previewPath: `/api/archives/files/${input.id}/preview`,
    downloadPath: `/api/archives/files/${input.id}/download`,
  } satisfies ArchivedProjectFileRecord;
}

export async function listArchiveCategorySummaries(user: ArchiveAccessUser) {
  const archivedFiles = await withPrismaRetry(() =>
    prisma.archivedProjectFile.findMany({
      where: {
        project: {
          is: buildAccessibleProjectWhere(user),
        },
      },
      select: {
        archive: {
          select: {
            archiveCategorySlug: true,
          },
        },
        archivedAt: true,
        projectId: true,
      },
    }),
  );

  return archiveCategoryDefinitions.map<ArchiveCategorySummary>((category) => {
    const categoryFiles = archivedFiles.filter(
      (file) => file.archive.archiveCategorySlug === category.slug,
    );
    const uniqueProjectIds = new Set(categoryFiles.map((file) => file.projectId));
    const latestArchivedAt = categoryFiles
      .map((file) => file.archivedAt)
      .sort((left, right) => right.getTime() - left.getTime())[0];

    return {
      slug: category.slug,
      title: category.title,
      fileCount: categoryFiles.length,
      projectCount: uniqueProjectIds.size,
      latestArchivedAt: formatArchiveTimestamp(latestArchivedAt),
    };
  });
}

export async function listArchivedFilesByCategory(
  user: ArchiveAccessUser,
  categorySlug: ArchiveCategorySlug,
) {
  const files = await withPrismaRetry(() =>
    prisma.archivedProjectFile.findMany({
      where: {
        archive: {
          is: {
            archiveCategorySlug: categorySlug,
          },
        },
        project: {
          is: buildAccessibleProjectWhere(user),
        },
      },
      orderBy: [
        {
          archivedAt: "desc",
        },
        {
          finalArchiveFileName: "asc",
        },
      ],
      select: {
        id: true,
        finalArchiveFileName: true,
        originalFileName: true,
        sourceRevisionId: true,
        mimeType: true,
        fileSize: true,
        archivedAt: true,
        archivedBy: {
          select: {
            name: true,
            email: true,
          },
        },
        sourceAttachment: {
          select: {
            submissionReviewStatus: true,
          },
        },
        sourceRevision: {
          select: {
            revisionNumber: true,
          },
        },
        archive: {
          select: {
            archiveCategorySlug: true,
            archiveCategoryLabel: true,
            projectName: true,
            projectCategory: true,
            projectTag: true,
          },
        },
        projectId: true,
      },
    }),
  );

  return files.map((file) =>
    mapArchivedFileRecord({
      id: file.id,
      finalArchiveFileName: file.finalArchiveFileName,
      originalFileName: file.originalFileName,
      projectId: file.projectId,
      projectName: file.archive.projectName,
      projectCategory: file.archive.projectCategory,
      projectTag: file.archive.projectTag,
      archiveCategorySlug: file.archive.archiveCategorySlug,
      archiveCategoryLabel: file.archive.archiveCategoryLabel,
      sourceRevisionId: file.sourceRevisionId,
      sourceRevisionNumber: file.sourceRevision?.revisionNumber ?? null,
      submissionReviewStatus: file.sourceAttachment.submissionReviewStatus,
      mimeType: file.mimeType,
      fileSize: file.fileSize,
      archivedAt: file.archivedAt,
      archivedBy: file.archivedBy,
    }),
  );
}

export async function getProjectArchivePreparation(
  user: ArchiveAccessUser,
  input: {
    projectId: string;
    stageId: string;
  },
) {
  const project = await getProjectArchiveBase(input.projectId);

  if (!project) {
    throw new Error("Project not found.");
  }

  await assertProjectAccess(user, input.projectId);

  const finalStage = ensureProjectCanBeCompleted(user, project, input.stageId);
  const files = await getFinalStageArchivableAttachments(project.id, finalStage.id);

  if (files.length === 0) {
    throw new Error("No approved final files are available to archive.");
  }

  const inferredCategory = inferArchiveCategorySlug({
    projectCategory: project.category,
    projectTag: project.tag,
    fileName: files[0]?.originalFileName,
    mimeType: files[0]?.mimeType,
  });

  return {
    projectId: project.id,
    projectName: project.name,
    finalStageId: finalStage.id,
    finalStageName: finalStage.name,
    selectedCategorySlug: inferredCategory,
    categories: archiveCategoryDefinitions,
    files: normalizePreparedArchiveFiles(files),
  } satisfies ProjectArchivePreparation;
}

export async function getProjectCompletionSummary(
  user: ArchiveAccessUser,
  projectId: string,
  selectedStageId?: string | null,
) {
  await assertProjectAccess(user, projectId);

  const project = await getProjectArchiveBase(projectId);

  if (!project) {
    throw new Error("Project not found.");
  }

  const finalStage = project.stages.at(-1) ?? null;
  const stageIdToCheck = selectedStageId ?? finalStage?.id ?? null;
  const isSelectedStageFinal = Boolean(finalStage && stageIdToCheck === finalStage.id);
  const isCompleted = Boolean(
    project.archive || project.archivedAt || project.completedAt || project.status === "COMPLETED",
  );

  const approvedFiles =
    finalStage && !isCompleted
      ? await getFinalStageArchivableAttachments(project.id, finalStage.id)
      : [];

  return {
    isCompleted,
    completedAt: formatArchiveTimestamp(project.completedAt),
    archivedAt: formatArchiveTimestamp(project.archivedAt ?? project.archive?.archivedAt ?? null),
    finalStageId: finalStage?.id ?? null,
    finalStageName: finalStage?.name ?? null,
    isSelectedStageFinal,
    canCompleteProject:
      project.createdById === user.id &&
      Boolean(finalStage) &&
      isSelectedStageFinal &&
      !isCompleted &&
      approvedFiles.length > 0,
    approvedFileCount: approvedFiles.length,
    archiveCategorySlug:
      project.archive && isArchiveCategorySlug(project.archive.archiveCategorySlug)
        ? project.archive.archiveCategorySlug
        : null,
    archiveCategoryLabel: project.archive?.archiveCategoryLabel ?? null,
    archivedFiles:
      project.archive?.files.map((file) =>
        mapArchivedFileRecord({
          id: file.id,
          finalArchiveFileName: file.finalArchiveFileName,
          originalFileName: file.originalFileName,
          projectId: project.id,
          projectName: project.name,
          projectCategory: project.category,
          projectTag: project.tag,
          archiveCategorySlug: project.archive?.archiveCategorySlug ?? "artworks",
          archiveCategoryLabel: project.archive?.archiveCategoryLabel ?? "Artworks",
          sourceRevisionId: file.sourceRevisionId,
          sourceRevisionNumber: file.sourceRevision?.revisionNumber ?? null,
          submissionReviewStatus: file.sourceAttachment.submissionReviewStatus,
          mimeType: file.mimeType,
          fileSize: file.fileSize,
          archivedAt: file.archivedAt,
          archivedBy: file.archivedBy,
        }),
      ) ?? [],
  } satisfies ProjectCompletionSummary;
}

export async function completeProjectArchive(
  user: ArchiveAccessUser,
  input: {
    projectId: string;
    stageId: string;
    archiveCategorySlug?: string;
    files: Array<{
      sourceAttachmentId: string;
      finalArchiveFileName: string;
    }>;
  },
) {
  const project = await getProjectArchiveBase(input.projectId);

  if (!project) {
    throw new Error("Project not found.");
  }

  await assertProjectAccess(user, input.projectId);

  const finalStage = ensureProjectCanBeCompleted(user, project, input.stageId);
  const preparedFiles = await getFinalStageArchivableAttachments(project.id, finalStage.id);

  if (preparedFiles.length === 0) {
    throw new Error("No approved final files are available to archive.");
  }

  if (input.files.length !== preparedFiles.length) {
    throw new Error("Archive file list is out of date. Please review the final files again.");
  }

  const preparedFileMap = new Map(
    preparedFiles.map((file) => [file.sourceAttachmentId, file] as const),
  );
  const duplicateNames = new Set<string>();
  const archiveFiles = input.files.map((file) => {
    const preparedFile = preparedFileMap.get(file.sourceAttachmentId);

    if (!preparedFile) {
      throw new Error("Archive file list is invalid. Please reload and try again.");
    }

    return {
      ...preparedFile,
      finalArchiveFileName: validateArchiveFileName(
        preparedFile.originalFileName,
        file.finalArchiveFileName,
        duplicateNames,
      ),
    };
  });

  const archiveCategorySlug: ArchiveCategorySlug =
    input.archiveCategorySlug && isArchiveCategorySlug(input.archiveCategorySlug)
      ? input.archiveCategorySlug
      : inferArchiveCategorySlug({
          projectCategory: project.category,
          projectTag: project.tag,
          fileName: archiveFiles[0]?.originalFileName,
          mimeType: archiveFiles[0]?.mimeType,
        });
  const archiveCategoryLabel = getArchiveCategoryLabel(archiveCategorySlug);

  const archivedAt = new Date();

  return withPrismaRetry(() =>
    prisma.$transaction(async (tx) => {
      const latestProject = await tx.project.findUnique({
        where: {
          id: input.projectId,
        },
        select: {
          id: true,
          createdById: true,
          status: true,
          completedAt: true,
          archivedAt: true,
          archive: {
            select: {
              id: true,
            },
          },
        },
      });

      if (!latestProject) {
        throw new Error("Project not found.");
      }

      if (latestProject.createdById !== user.id) {
        throw new Error("Only the project owner can complete and archive this project.");
      }

      if (
        latestProject.archive ||
        latestProject.archivedAt ||
        latestProject.completedAt ||
        latestProject.status === "COMPLETED"
      ) {
        throw new Error("Project is already completed.");
      }

      const archive = await tx.projectArchive.create({
        data: {
          projectId: project.id,
          finalStageId: finalStage.id,
          archivedById: user.id,
          projectName: project.name,
          projectCategory: project.category,
          projectTag: project.tag?.trim() || null,
          archiveCategorySlug,
          archiveCategoryLabel,
          status: "ARCHIVED",
          archivedAt,
          files: {
            create: archiveFiles.map((file) => ({
              projectId: project.id,
              sourceAttachmentId: file.sourceAttachmentId,
              sourceRevisionId: file.sourceRevisionId,
              finalArchiveFileName: file.finalArchiveFileName,
              originalFileName: file.originalFileName,
              mimeType: file.mimeType,
              fileSize: file.fileSize,
              bucket: file.bucket,
              storageKey: file.storageKey,
              archivedById: user.id,
              archivedAt,
            })),
          },
        },
        select: {
          id: true,
        },
      });

      await tx.projectStage.update({
        where: {
          id: finalStage.id,
        },
        data: {
          status: "COMPLETED",
          completedAt: archivedAt,
        },
      });

      await tx.project.update({
        where: {
          id: project.id,
        },
        data: {
          status: "COMPLETED",
          currentStageName: finalStage.name,
          completedAt: archivedAt,
          archivedAt,
        },
      });

      await tx.projectActivityLog.create({
        data: {
          projectId: project.id,
          stageId: finalStage.id,
          actorId: user.id,
          action: "FINAL_ARCHIVED",
          metadata: {
            archiveId: archive.id,
            archiveCategorySlug,
            archiveCategoryLabel,
            archivedFileCount: archiveFiles.length,
          },
        },
      });

      return {
        archiveId: archive.id,
        archivedFileCount: archiveFiles.length,
        archiveCategorySlug,
        archiveCategoryLabel,
      };
    }),
  );
}

export async function getArchivedFileDownloadUrlForUser(
  user: ArchiveAccessUser,
  archivedFileId: string,
) {
  const archivedFile = await withPrismaRetry(() =>
    prisma.archivedProjectFile.findUnique({
      where: {
        id: archivedFileId,
      },
      select: {
        id: true,
        projectId: true,
        finalArchiveFileName: true,
        mimeType: true,
        bucket: true,
        storageKey: true,
      },
    }),
  );

  if (!archivedFile) {
    throw new Error("Archived file not found.");
  }

  await assertProjectAccess(user, archivedFile.projectId);

  return createPresignedDownloadUrl({
    bucket: archivedFile.bucket,
    storageKey: archivedFile.storageKey,
    fileName: archivedFile.finalArchiveFileName,
    mimeType: archivedFile.mimeType,
  });
}

export async function getArchivedFilePreviewUrlForUser(
  user: ArchiveAccessUser,
  archivedFileId: string,
) {
  const archivedFile = await withPrismaRetry(() =>
    prisma.archivedProjectFile.findUnique({
      where: {
        id: archivedFileId,
      },
      select: {
        id: true,
        projectId: true,
        finalArchiveFileName: true,
        mimeType: true,
        bucket: true,
        storageKey: true,
      },
    }),
  );

  if (!archivedFile) {
    throw new Error("Archived file not found.");
  }

  await assertProjectAccess(user, archivedFile.projectId);

  return createPresignedPreviewUrl({
    bucket: archivedFile.bucket,
    storageKey: archivedFile.storageKey,
    fileName: archivedFile.finalArchiveFileName,
    mimeType: archivedFile.mimeType,
  });
}
