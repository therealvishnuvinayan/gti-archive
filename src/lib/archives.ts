import {
  AttachmentAssetType,
  AttachmentStatus,
  ProjectCompletionDocumentType,
  ProjectRevisionStatus,
  StageStatus,
  SubmissionReviewStatus,
  type User,
} from "@prisma/client";

import {
  getActiveArchiveCategoryOptions,
  type ArchiveCategoryOption,
  type ArchiveCategoryRecord,
  type ArchiveCategorySlug,
} from "@/lib/archive-categories";
import { getUserDisplayName } from "@/lib/auth";
import {
  getAccessibleProjectsWhere,
  hasPermission,
  hasProjectPermission,
  type PermissionUser,
} from "@/lib/permissions/resolver";
import {
  assertProjectTimestampVisibleForUser,
  canBypassCollaboratorVisibility,
  isTimestampHiddenByPauseWindows,
} from "@/lib/project-collaborator-visibility";
import {
  assertProjectAccess,
} from "@/lib/project-history";
import { prisma, withPrismaRetry } from "@/lib/prisma";
import {
  defaultProjectStatusGroupSlugs,
  isProjectStatusCompleted,
} from "@/lib/project-statuses";
import {
  createPresignedDownloadUrl,
  createPresignedPreviewUrl,
  createPresignedUploadUrl,
  buildManualArchiveFileKey,
  getFileExtension,
  getMaxAssetUploadBytes,
  getS3BucketName,
} from "@/lib/storage/s3";
import {
  PROJECT_ASSET_ALLOWED_EXTENSIONS,
  buildFileTypeNotAllowedPayload,
  isAllowedAssetFile,
} from "@/lib/upload-validation";
import {
  mapAssetTagAssignments,
  validateActiveAssetTagIds,
  type AssetTagAssignmentRecord,
  type AssetTagRecord,
} from "@/lib/asset-tags";

export type ArchiveAccessUser = Pick<
  User,
  "id" | "role" | "email" | "name" | "projectAccess" | "collaboratorType"
> &
  PermissionUser;

export type ArchiveCategorySummary = {
  id: string;
  slug: ArchiveCategorySlug;
  name: string;
  title: string;
  description: string;
  iconUrl: string;
  iconKey: string;
  color: string;
  parentId: string | null;
  parentName: string | null;
  childCount: number;
  fileCount: number;
  projectCount: number;
  latestArchivedAt: string | null;
};

export type ArchivedProjectFileRecord = {
  id: string;
  recordType:
    | "FINAL_ARCHIVE_FILE"
    | "MANUAL_ARCHIVE_FILE"
    | "AUTHORITY_APPROVAL_PROOF"
    | "COPYRIGHT_TRANSFER"
    | "INVOICE";
  recordTypeLabel: string;
  finalArchiveFileName: string;
  originalFileName: string;
  projectId: string;
  projectName: string;
  projectCategory: string;
  projectTag: string;
  projectTags: string[];
  assetTags: AssetTagRecord[];
  archiveCategoryId: string | null;
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
  selectedCategoryId: string;
  categories: ArchiveCategoryOption[];
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
  allStagesCompleted: boolean;
  incompleteStages: Array<{
    id: string;
    name: string;
    status: string;
  }>;
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

type RequestArchiveUploadInput = {
  fileName: string;
  originalFileName: string;
  mimeType: string;
  fileSize: number;
  projectName?: string | null;
  projectCreatedBy?: string | null;
  archiveCategoryId?: string | null;
  assetTagIds?: string[];
  projectDate?: string | null;
};

type ArchiveCategoryDisplay = {
  id: string;
  name: string;
  slug: string;
  iconUrl?: string | null;
  iconKey?: string | null;
  color?: string | null;
} | null;

function canUploadArchiveFiles(user: ArchiveAccessUser) {
  return hasPermission(user, "archive.view") && hasPermission(user, "archive.uploadFile");
}

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

function normalizeArchiveProjectTags(values: Array<string | null | undefined>) {
  const normalized = new Map<string, string>();

  values.forEach((value) => {
    const trimmedValue = value?.trim();

    if (!trimmedValue || trimmedValue === "—") {
      return;
    }

    const key = trimmedValue.toLowerCase();
    if (!normalized.has(key)) {
      normalized.set(key, trimmedValue);
    }
  });

  return [...normalized.values()];
}

function splitProjectTagSnapshot(value: string | null | undefined) {
  return normalizeArchiveProjectTags((value ?? "").split(","));
}

function formatArchiveProjectTagsLabel(tags: string[]) {
  return tags.length > 0 ? tags.join(", ") : "—";
}

function getArchiveCategoryDisplay(category: ArchiveCategoryDisplay) {
  return {
    id: category?.id ?? null,
    slug: category?.slug ?? "uncategorized",
    label: category?.name ?? "Uncategorized",
  };
}

function getArchiveProjectTagNames(project: {
  tags?: Array<{
    tag: {
      name: string;
    };
  }>;
}) {
  const relationTags =
    project.tags
      ?.map((assignment) => assignment.tag.name)
      .filter((tagName) => tagName.trim())
      .sort((left, right) =>
        left.localeCompare(right, undefined, { sensitivity: "base" }),
      ) ?? [];

  return normalizeArchiveProjectTags(relationTags);
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

function normalizeOptionalArchiveText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function resolveUploadedFileName(fileName: string, originalFileName: string) {
  const trimmedFileName = fileName.trim();

  if (!trimmedFileName) {
    throw new Error("File name is required.");
  }

  const displayExtension = getFileExtension(trimmedFileName);
  const originalExtension = getFileExtension(originalFileName);

  if (!displayExtension && originalExtension) {
    return `${trimmedFileName}.${originalExtension}`;
  }

  return trimmedFileName;
}

function parseOptionalArchiveDate(value: string | null | undefined) {
  const trimmed = value?.trim();

  if (!trimmed) {
    return null;
  }

  const date = new Date(trimmed);

  if (Number.isNaN(date.getTime())) {
    throw new Error("Date of project is invalid.");
  }

  return date;
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
  return getAccessibleProjectsWhere(user as ArchiveAccessUser);
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
        tags: {
          include: {
            tag: true,
          },
        },
        status: {
          select: {
            id: true,
            name: true,
            slug: true,
            color: true,
            group: {
              select: {
                id: true,
                name: true,
                slug: true,
                color: true,
                isActive: true,
              },
            },
          },
        },
        createdById: true,
        executors: {
          select: {
            userId: true,
            role: true,
          },
        },
        collaborators: {
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
            archiveCategory: {
              select: {
                id: true,
                name: true,
                slug: true,
                iconUrl: true,
                iconKey: true,
                color: true,
              },
            },
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
                    assetTags: {
                      include: {
                        tag: {
                          select: {
                            id: true,
                            name: true,
                            color: true,
                          },
                        },
                      },
                    },
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

function formatProjectStageStatus(status: StageStatus) {
  switch (status) {
    case StageStatus.COMPLETED:
      return "Completed";
    case StageStatus.ONGOING:
      return "In Progress";
    case StageStatus.PENDING:
      return "Pending";
    case StageStatus.ON_HOLD:
      return "On Hold";
    default:
      return String(status)
        .toLowerCase()
        .split("_")
        .map((part: string) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
  }
}

function getIncompleteProjectStages(
  project: { stages: Array<{ id: string; name: string; status: StageStatus }> },
) {
  return project.stages
    .filter((stage) => stage.status !== StageStatus.COMPLETED)
    .map((stage) => ({
      id: stage.id,
      name: stage.name,
      status: formatProjectStageStatus(stage.status),
    }));
}

function getAllStagesCompletionError(
  project: { stages: Array<{ id: string; name: string; status: StageStatus }> },
) {
  const incompleteStages = getIncompleteProjectStages(project);

  if (incompleteStages.length === 0) {
    return null;
  }

  return [
    "All stages must be completed before the project can be completed.",
    ...incompleteStages.map((stage) => `${stage.name} — ${stage.status}`),
  ].join("\n");
}

function ensureProjectCanBeCompleted(
  user: ArchiveAccessUser,
  project: NonNullable<Awaited<ReturnType<typeof getProjectArchiveBase>>>,
  stageId: string,
) {
  if (!hasProjectPermission(user, project, "project.completeArchive")) {
    throw new Error("Only the project owner can complete and archive this project.");
  }

  if (project.createdById !== user.id) {
    throw new Error("Only the project owner can complete and archive this project.");
  }

  if (
    project.archive ||
    project.archivedAt ||
    project.completedAt ||
    isProjectStatusCompleted(project.status)
  ) {
    throw new Error("Project is already completed.");
  }

  const finalStage = project.stages.at(-1);

  if (!finalStage) {
    throw new Error("Project does not have a final stage.");
  }

  if (finalStage.id !== stageId) {
    throw new Error("Project completion is only available in the final stage.");
  }

  const allStagesCompletionError = getAllStagesCompletionError(project);

  if (allStagesCompletionError) {
    throw new Error(allStagesCompletionError);
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
  projectTags?: string[];
  assetTags?: AssetTagAssignmentRecord[];
  archiveCategory: ArchiveCategoryDisplay;
  sourceRevisionId: string | null;
  sourceRevisionNumber?: number | null;
  submissionReviewStatus?: SubmissionReviewStatus | null;
  mimeType: string;
  fileSize: number;
  archivedAt: Date;
  archivedBy: Pick<User, "name" | "email">;
}) {
  const sourceLabel = input.sourceRevisionId
    ? `Revision ${input.sourceRevisionNumber ?? "—"}`
    : input.submissionReviewStatus === SubmissionReviewStatus.APPROVED
      ? "Approved submission"
      : "Final archive";
  const projectTags = input.projectTags ?? splitProjectTagSnapshot(input.projectTag);
  const assetTags = input.assetTags
    ? mapAssetTagAssignments(input.assetTags)
    : [];
  const category = getArchiveCategoryDisplay(input.archiveCategory);

  return {
    id: input.id,
    recordType: "FINAL_ARCHIVE_FILE",
    recordTypeLabel: "Final Archived File",
    finalArchiveFileName: input.finalArchiveFileName,
    originalFileName: input.originalFileName,
    projectId: input.projectId,
    projectName: input.projectName,
    projectCategory: input.projectCategory,
    projectTag: formatArchiveProjectTagsLabel(projectTags),
    projectTags,
    assetTags,
    archiveCategoryId: category.id,
    archiveCategorySlug: category.slug,
    archiveCategoryLabel: category.label,
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

function mapManualArchiveFileRecord(input: {
  id: string;
  fileName: string;
  originalFileName: string;
  projectName: string | null;
  projectCreatedBy: string | null;
  assetTags: AssetTagAssignmentRecord[];
  archiveCategory: ArchiveCategoryDisplay;
  mimeType: string;
  fileSize: number;
  uploadedAt: Date;
  uploadedBy: Pick<User, "name" | "email">;
}) {
  const assetTags = mapAssetTagAssignments(input.assetTags);
  const category = getArchiveCategoryDisplay(input.archiveCategory);

  return {
    id: input.id,
    recordType: "MANUAL_ARCHIVE_FILE",
    recordTypeLabel: "Manual Archive File",
    finalArchiveFileName: input.fileName,
    originalFileName: input.originalFileName,
    projectId: "",
    projectName: input.projectName?.trim() || "Manual Archive",
    projectCategory: category.label,
    projectTag: "—",
    projectTags: [],
    assetTags,
    archiveCategoryId: category.id,
    archiveCategorySlug: category.slug,
    archiveCategoryLabel: category.label,
    sourceLabel: input.projectCreatedBy?.trim()
      ? `Created by ${input.projectCreatedBy.trim()}`
      : "Manual upload",
    fileTypeLabel: getArchiveFileTypeLabel(input.fileName, input.mimeType),
    mimeType: input.mimeType,
    fileSizeLabel: formatArchiveFileSize(input.fileSize),
    archivedAt: formatArchiveTimestamp(input.uploadedAt) ?? "—",
    archivedBy: getUserDisplayName(input.uploadedBy),
    previewPath: `/api/archives/files/${input.id}/preview`,
    downloadPath: `/api/archives/files/${input.id}/download`,
  } satisfies ArchivedProjectFileRecord;
}

function getCompletionDocumentArchiveTypeLabel(type: ProjectCompletionDocumentType) {
  switch (type) {
    case ProjectCompletionDocumentType.AUTHORITY_APPROVAL_PROOF:
      return "Approval Proof";
    case ProjectCompletionDocumentType.COPYRIGHT_TRANSFER:
      return "Copyright Transfer";
    case ProjectCompletionDocumentType.INVOICE:
    default:
      return "Final Invoice";
  }
}

function buildCompletionDocumentAccessibleProjectWhere(user: ArchiveAccessUser) {
  return buildAccessibleProjectWhere(user);
}

function isArchiveTimestampVisibleToUser(
  user: ArchiveAccessUser,
  project: {
    createdById: string;
    collaborators?: Array<{
      chatVisibilityPaused: boolean;
      visibilityPauses: Array<{
        pausedAt: Date;
        resumedAt: Date | null;
      }>;
    }>;
  },
  timestamp: Date,
) {
  if (canBypassCollaboratorVisibility(user, project.createdById)) {
    return true;
  }

  const collaborator = project.collaborators?.[0];

  if (!collaborator) {
    return true;
  }

  if (collaborator.chatVisibilityPaused && collaborator.visibilityPauses.length === 0) {
    return false;
  }

  return !isTimestampHiddenByPauseWindows(timestamp, collaborator.visibilityPauses);
}

function mapCompletionDocumentArchiveRecord(input: {
  id: string;
  type: ProjectCompletionDocumentType;
  archiveFileName: string;
  originalFileName: string;
  mimeType: string;
  fileSize: number;
  uploadedAt: Date;
  uploadedBy: Pick<User, "name" | "email">;
  projectId: string;
  projectName: string;
  projectCategory: string;
  projectTag: string | null;
  projectTags?: string[];
  archiveCategory: ArchiveCategoryDisplay;
}) {
  const projectTags = input.projectTags ?? splitProjectTagSnapshot(input.projectTag);

  return {
    id: input.id,
    recordType: input.type,
    recordTypeLabel: getCompletionDocumentArchiveTypeLabel(input.type),
    finalArchiveFileName: input.archiveFileName,
    originalFileName: input.originalFileName,
    projectId: input.projectId,
    projectName: input.projectName,
    projectCategory: input.projectCategory,
    projectTag: formatArchiveProjectTagsLabel(projectTags),
    projectTags,
    assetTags: [],
    archiveCategoryId: getArchiveCategoryDisplay(input.archiveCategory).id,
    archiveCategorySlug: getArchiveCategoryDisplay(input.archiveCategory).slug,
    archiveCategoryLabel: getArchiveCategoryDisplay(input.archiveCategory).label,
    sourceLabel: "Completion document",
    fileTypeLabel: getArchiveFileTypeLabel(input.archiveFileName, input.mimeType),
    mimeType: input.mimeType,
    fileSizeLabel: formatArchiveFileSize(input.fileSize),
    archivedAt: formatArchiveTimestamp(input.uploadedAt) ?? "—",
    archivedBy: getUserDisplayName(input.uploadedBy),
    previewPath: `/api/project-completion-documents/${input.id}/preview`,
    downloadPath: `/api/project-completion-documents/${input.id}/download`,
  } satisfies ArchivedProjectFileRecord;
}

export async function listArchiveCategorySummaries(user: ArchiveAccessUser) {
  if (!hasPermission(user, "archive.view")) {
    throw new Error("You do not have permission to view archives.");
  }

  const [categories, archivedFiles, completionDocuments, manualArchiveFiles] = await withPrismaRetry(() =>
    Promise.all([
      prisma.archiveCategory.findMany({
        where: {
          isActive: true,
        },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        include: {
          parent: {
            select: {
              name: true,
            },
          },
          children: {
            select: {
              id: true,
            },
          },
        },
      }),
      prisma.archivedProjectFile.findMany({
        where: {
          project: {
            is: buildAccessibleProjectWhere(user),
          },
        },
        select: {
          archive: {
            select: {
              archiveCategoryId: true,
            },
          },
          archivedAt: true,
          projectId: true,
          project: {
            select: {
              createdById: true,
              collaborators: {
                where: {
                  userId: user.id,
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
              },
            },
          },
        },
      }),
      prisma.projectCompletionDocument.findMany({
        where: {
          project: {
            is: buildCompletionDocumentAccessibleProjectWhere(user),
          },
        },
        select: {
          uploadedAt: true,
          projectId: true,
          project: {
            select: {
              createdById: true,
              collaborators: {
                where: {
                  userId: user.id,
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
              },
            },
          },
        },
      }),
      prisma.manualArchiveFile.findMany({
        where: {
          status: AttachmentStatus.READY,
        },
        select: {
          archiveCategoryId: true,
          uploadedAt: true,
          projectName: true,
        },
      }),
    ]),
  );
  const visibleArchivedFiles = archivedFiles.filter((file) =>
    isArchiveTimestampVisibleToUser(user, file.project, file.archivedAt),
  );
  const visibleCompletionDocuments = completionDocuments.filter((document) =>
    isArchiveTimestampVisibleToUser(user, document.project, document.uploadedAt),
  );
  const completionDocumentCategory = categories.find(
    (category) => category.slug === "documents",
  );

  return categories.map<ArchiveCategorySummary>((category) => {
    const categoryFiles = visibleArchivedFiles.filter(
      (file) => file.archive.archiveCategoryId === category.id,
    );
    const categoryCompletionDocuments =
      completionDocumentCategory?.id === category.id ? visibleCompletionDocuments : [];
    const categoryManualFiles = manualArchiveFiles.filter(
      (file) => file.archiveCategoryId === category.id,
    );
    const uniqueProjectIds = new Set([
      ...categoryFiles.map((file) => file.projectId),
      ...categoryCompletionDocuments.map((file) => file.projectId),
      ...categoryManualFiles
        .map((file) => file.projectName?.trim())
        .filter((projectName): projectName is string => Boolean(projectName)),
    ]);
    const latestArchivedAt = [
      ...categoryFiles.map((file) => file.archivedAt),
      ...categoryCompletionDocuments.map((file) => file.uploadedAt),
      ...categoryManualFiles.map((file) => file.uploadedAt),
    ].sort((left, right) => right.getTime() - left.getTime())[0];

    return {
      id: category.id,
      slug: category.slug,
      name: category.name,
      title: category.name,
      description: category.description?.trim() || "",
      iconUrl: category.iconUrl?.trim() || "",
      iconKey: category.iconKey?.trim() || "",
      color: category.color?.trim() || "",
      parentId: category.parentId,
      parentName: category.parent?.name ?? null,
      childCount: category.children.length,
      fileCount:
        categoryFiles.length + categoryCompletionDocuments.length + categoryManualFiles.length,
      projectCount: uniqueProjectIds.size,
      latestArchivedAt: formatArchiveTimestamp(latestArchivedAt),
    };
  });
}

export function getDashboardArchiveUploadAccessState(user: ArchiveAccessUser) {
  return {
    canUploadAssets: canUploadArchiveFiles(user),
  };
}

export async function requestArchiveFileUpload(
  user: ArchiveAccessUser,
  input: RequestArchiveUploadInput,
) {
  if (!canUploadArchiveFiles(user)) {
    return { error: "You do not have permission to upload to Archives." } as const;
  }

  if (!input.originalFileName.trim()) {
    return { error: "Choose a file to upload." } as const;
  }

  if (!input.fileName.trim()) {
    return { error: "File name is required." } as const;
  }

  if (!isAllowedAssetFile(input.originalFileName)) {
    return buildFileTypeNotAllowedPayload({
      fileName: input.originalFileName,
      mimeType: input.mimeType,
      allowedExtensions: PROJECT_ASSET_ALLOWED_EXTENSIONS,
    });
  }

  if (!Number.isFinite(input.fileSize) || input.fileSize <= 0) {
    return { error: "File size is invalid." } as const;
  }

  if (input.fileSize > getMaxAssetUploadBytes()) {
    return { error: "This file exceeds the allowed size limit." } as const;
  }

  let fileName: string;
  let projectDate: Date | null;

  try {
    fileName = resolveUploadedFileName(input.fileName, input.originalFileName);
    projectDate = parseOptionalArchiveDate(input.projectDate);
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Archive upload metadata is invalid.",
    } as const;
  }

  const tagSelection = await validateActiveAssetTagIds(input.assetTagIds ?? []);

  if (tagSelection.error) {
    return { error: tagSelection.error } as const;
  }

  const archiveCategoryId = input.archiveCategoryId?.trim() || null;

  if (archiveCategoryId) {
    const category = await withPrismaRetry(() =>
      prisma.archiveCategory.findFirst({
        where: {
          id: archiveCategoryId,
          isActive: true,
        },
        select: {
          id: true,
        },
      }),
    );

    if (!category) {
      return { error: "Choose a valid archive category." } as const;
    }
  }

  const bucket = getS3BucketName();
  const storageKey = buildManualArchiveFileKey(user.id, input.originalFileName);
  const uploadUrl = await createPresignedUploadUrl({
    bucket,
    storageKey,
    mimeType: input.mimeType,
  });

  const archiveFile = await withPrismaRetry(() =>
    prisma.manualArchiveFile.create({
      data: {
        fileName,
        originalFileName: input.originalFileName.trim(),
        projectName: normalizeOptionalArchiveText(input.projectName),
        projectCreatedBy: normalizeOptionalArchiveText(input.projectCreatedBy),
        archiveCategoryId,
        assetTags:
          tagSelection.tagIds.length > 0
            ? {
                create: tagSelection.tagIds.map((tagId) => ({
                  tag: {
                    connect: {
                      id: tagId,
                    },
                  },
                })),
              }
            : undefined,
        projectDate,
        mimeType: input.mimeType,
        fileSize: input.fileSize,
        bucket,
        storageKey,
        uploadedById: user.id,
      },
      select: {
        id: true,
      },
    }),
  );

  return {
    archiveFileId: archiveFile.id,
    uploadUrl,
  };
}

export async function completeArchiveFileUpload(
  user: ArchiveAccessUser,
  archiveFileId: string,
  failed = false,
) {
  if (!canUploadArchiveFiles(user)) {
    throw new Error("You do not have permission to upload to Archives.");
  }

  return withPrismaRetry(() =>
    prisma.$transaction(async (tx) => {
      const archiveFile = await tx.manualArchiveFile.findUnique({
        where: {
          id: archiveFileId,
        },
        select: {
          id: true,
          uploadedById: true,
          status: true,
          archiveCategory: {
            select: {
              slug: true,
            },
          },
        },
      });

      if (!archiveFile) {
        throw new Error("Archive upload not found.");
      }

      if (archiveFile.uploadedById !== user.id) {
        throw new Error("Only the uploader can complete this archive upload.");
      }

      if (archiveFile.status === AttachmentStatus.READY) {
        return {
          archiveCategorySlug: archiveFile.archiveCategory?.slug ?? null,
        };
      }

      if (archiveFile.status !== AttachmentStatus.UPLOADING) {
        throw new Error("Archive upload is not active.");
      }

      const nextStatus = failed ? AttachmentStatus.FAILED : AttachmentStatus.READY;

      await tx.manualArchiveFile.update({
        where: {
          id: archiveFile.id,
        },
        data: {
          status: nextStatus,
          uploadedAt: failed ? undefined : new Date(),
        },
      });

      return {
        archiveCategorySlug: archiveFile.archiveCategory?.slug ?? null,
      };
    }),
  );
}

export async function listArchivedFilesByCategory(
  user: ArchiveAccessUser,
  category: ArchiveCategoryRecord,
) {
  if (!hasPermission(user, "archive.view")) {
    throw new Error("You do not have permission to view archives.");
  }

  const [files, completionDocuments, manualArchiveFiles] = await withPrismaRetry(() =>
    Promise.all([
      prisma.archivedProjectFile.findMany({
        where: {
          archive: {
            is: {
              archiveCategoryId: category.id,
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
              assetTags: {
                include: {
                  tag: {
                    select: {
                      id: true,
                      name: true,
                      color: true,
                    },
                  },
                },
              },
            },
          },
          sourceRevision: {
            select: {
              revisionNumber: true,
            },
          },
          archive: {
            select: {
              archiveCategory: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                  iconUrl: true,
                  iconKey: true,
                  color: true,
                },
              },
              projectName: true,
              projectCategory: true,
              projectTag: true,
            },
          },
          projectId: true,
          project: {
            select: {
              createdById: true,
              collaborators: {
                where: {
                  userId: user.id,
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
              },
            },
          },
        },
      }),
      category.slug === "documents"
        ? prisma.projectCompletionDocument.findMany({
            where: {
              project: {
                is: buildCompletionDocumentAccessibleProjectWhere(user),
              },
            },
            orderBy: [
              {
                uploadedAt: "desc",
              },
              {
                archiveFileName: "asc",
              },
            ],
            select: {
              id: true,
              type: true,
              archiveFileName: true,
              originalFileName: true,
              mimeType: true,
              fileSize: true,
              uploadedAt: true,
              uploadedBy: {
                select: {
                  name: true,
                  email: true,
                },
              },
              projectId: true,
              project: {
                select: {
                  name: true,
                  category: true,
                  tags: {
                    include: {
                      tag: true,
                    },
                  },
                  createdById: true,
                  collaborators: {
                    where: {
                      userId: user.id,
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
                  },
                },
              },
            },
          })
        : Promise.resolve([]),
      prisma.manualArchiveFile.findMany({
        where: {
          archiveCategoryId: category.id,
          status: AttachmentStatus.READY,
        },
        orderBy: [
          {
            uploadedAt: "desc",
          },
          {
            fileName: "asc",
          },
        ],
        select: {
          id: true,
          fileName: true,
          originalFileName: true,
          projectName: true,
          projectCreatedBy: true,
          assetTags: {
            include: {
              tag: {
                select: {
                  id: true,
                  name: true,
                  color: true,
                },
              },
            },
          },
          archiveCategory: {
            select: {
              id: true,
              name: true,
              slug: true,
              iconUrl: true,
              iconKey: true,
              color: true,
            },
          },
          mimeType: true,
          fileSize: true,
          uploadedAt: true,
          uploadedBy: {
            select: {
              name: true,
              email: true,
            },
          },
        },
      }),
    ]),
  );
  const visibleFiles = files.filter((file) =>
    isArchiveTimestampVisibleToUser(user, file.project, file.archivedAt),
  );
  const visibleCompletionDocuments = completionDocuments.filter((document) =>
    isArchiveTimestampVisibleToUser(user, document.project, document.uploadedAt),
  );

  return [
    ...visibleFiles.map((file) => ({
      sortDate: file.archivedAt,
      record: mapArchivedFileRecord({
        id: file.id,
        finalArchiveFileName: file.finalArchiveFileName,
        originalFileName: file.originalFileName,
        projectId: file.projectId,
        projectName: file.archive.projectName,
        projectCategory: file.archive.projectCategory,
        projectTag: file.archive.projectTag,
        assetTags: file.sourceAttachment.assetTags,
        archiveCategory: file.archive.archiveCategory,
        sourceRevisionId: file.sourceRevisionId,
        sourceRevisionNumber: file.sourceRevision?.revisionNumber ?? null,
        submissionReviewStatus: file.sourceAttachment.submissionReviewStatus,
        mimeType: file.mimeType,
        fileSize: file.fileSize,
        archivedAt: file.archivedAt,
        archivedBy: file.archivedBy,
      }),
    })),
    ...visibleCompletionDocuments.map((document) => ({
      sortDate: document.uploadedAt,
      record: mapCompletionDocumentArchiveRecord({
        id: document.id,
        type: document.type,
        archiveFileName: document.archiveFileName,
        originalFileName: document.originalFileName,
        mimeType: document.mimeType,
        fileSize: document.fileSize,
        uploadedAt: document.uploadedAt,
        uploadedBy: document.uploadedBy,
        projectId: document.projectId,
        projectName: document.project.name,
        projectCategory: document.project.category,
        projectTag: null,
        projectTags: getArchiveProjectTagNames(document.project),
        archiveCategory: category,
      }),
    })),
    ...manualArchiveFiles.map((file) => ({
      sortDate: file.uploadedAt,
      record: mapManualArchiveFileRecord({
        id: file.id,
        fileName: file.fileName,
        originalFileName: file.originalFileName,
        projectName: file.projectName,
        projectCreatedBy: file.projectCreatedBy,
        assetTags: file.assetTags,
        archiveCategory: file.archiveCategory,
        mimeType: file.mimeType,
        fileSize: file.fileSize,
        uploadedAt: file.uploadedAt,
        uploadedBy: file.uploadedBy,
      }),
    })),
  ]
    .sort((left, right) => {
      const timeDifference = right.sortDate.getTime() - left.sortDate.getTime();

      return timeDifference !== 0
        ? timeDifference
        : left.record.finalArchiveFileName.localeCompare(right.record.finalArchiveFileName);
    })
    .map((item) => item.record);
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

  const categories = await getActiveArchiveCategoryOptions();

  return {
    projectId: project.id,
    projectName: project.name,
    finalStageId: finalStage.id,
    finalStageName: finalStage.name,
    selectedCategoryId: categories[0]?.id ?? "",
    categories,
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
  const incompleteStages = getIncompleteProjectStages(project);
  const allStagesCompleted = incompleteStages.length === 0 && project.stages.length > 0;
  const isCompleted = Boolean(
    project.archive ||
      project.archivedAt ||
      project.completedAt ||
      isProjectStatusCompleted(project.status),
  );
  const canCompleteArchive = hasProjectPermission(user, project, "project.completeArchive");
  const canViewArchivedFiles = hasPermission(user, "archive.view");
  const visibleArchivedFiles =
    project.archive?.files.filter((file) =>
      isArchiveTimestampVisibleToUser(
        user,
        {
          createdById: project.createdById,
          collaborators: project.collaborators.filter(
            (collaborator) => collaborator.userId === user.id,
          ),
        },
        file.archivedAt,
      ),
    ) ?? [];

  const approvedFiles =
    finalStage && canCompleteArchive && !isCompleted
      ? await getFinalStageArchivableAttachments(project.id, finalStage.id)
      : [];
  const projectTags = getArchiveProjectTagNames(project);

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
      allStagesCompleted &&
      !isCompleted &&
      approvedFiles.length > 0,
    approvedFileCount: approvedFiles.length,
    allStagesCompleted,
    incompleteStages,
    archiveCategorySlug: project.archive?.archiveCategory?.slug ?? null,
    archiveCategoryLabel: project.archive?.archiveCategory?.name ?? null,
    archivedFiles: canViewArchivedFiles
      ? (visibleArchivedFiles.map((file) =>
          mapArchivedFileRecord({
            id: file.id,
            finalArchiveFileName: file.finalArchiveFileName,
            originalFileName: file.originalFileName,
            projectId: project.id,
            projectName: project.name,
            projectCategory: project.category,
            projectTag: formatArchiveProjectTagsLabel(projectTags),
            projectTags,
            assetTags: file.sourceAttachment.assetTags,
            archiveCategory: project.archive?.archiveCategory ?? null,
            sourceRevisionId: file.sourceRevisionId,
            sourceRevisionNumber: file.sourceRevision?.revisionNumber ?? null,
            submissionReviewStatus: file.sourceAttachment.submissionReviewStatus,
            mimeType: file.mimeType,
            fileSize: file.fileSize,
            archivedAt: file.archivedAt,
            archivedBy: file.archivedBy,
          }),
        ) ?? [])
      : [],
  } satisfies ProjectCompletionSummary;
}

export async function completeProjectArchive(
  user: ArchiveAccessUser,
  input: {
    projectId: string;
    stageId: string;
    archiveCategoryId?: string;
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

  const archiveProject = project;

  await assertProjectAccess(user, input.projectId);

  const finalStage = ensureProjectCanBeCompleted(user, archiveProject, input.stageId);
  const preparedFiles = await getFinalStageArchivableAttachments(
    archiveProject.id,
    finalStage.id,
  );

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
  const projectTags = getArchiveProjectTagNames(archiveProject);
  const projectTagLabel = formatArchiveProjectTagsLabel(projectTags);
  const archiveCategoryId = input.archiveCategoryId?.trim();

  if (!archiveCategoryId) {
    throw new Error("Choose an archive category.");
  }

  const archiveCategory = await withPrismaRetry(() =>
    prisma.archiveCategory.findFirst({
      where: {
        id: archiveCategoryId,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        slug: true,
      },
    }),
  );

  if (!archiveCategory) {
    throw new Error("Choose a valid archive category.");
  }

  const archivedAt = new Date();

  const archive = await withPrismaRetry(() =>
    prisma.$transaction(async (tx) => {
      const latestProject = await tx.project.findUnique({
        where: {
          id: input.projectId,
        },
        select: {
          id: true,
          createdById: true,
          statusId: true,
          status: {
            select: {
              id: true,
              name: true,
              slug: true,
              color: true,
              group: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                  color: true,
                  isActive: true,
                },
              },
            },
          },
          completedAt: true,
          archivedAt: true,
          archive: {
            select: {
              id: true,
            },
          },
          stages: {
            orderBy: {
              order: "asc",
            },
            select: {
              id: true,
              name: true,
              status: true,
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
        isProjectStatusCompleted(latestProject.status)
      ) {
        throw new Error("Project is already completed.");
      }

      const allStagesCompletionError = getAllStagesCompletionError(latestProject);

      if (allStagesCompletionError) {
        throw new Error(allStagesCompletionError);
      }

      const createdArchive = await tx.projectArchive.create({
        data: {
          projectId: archiveProject.id,
          finalStageId: finalStage.id,
          archivedById: user.id,
          projectName: archiveProject.name,
          projectCategory: archiveProject.category,
          projectTag: projectTagLabel === "—" ? null : projectTagLabel,
          archiveCategoryId: archiveCategory.id,
          status: "ARCHIVED",
          archivedAt,
          files: {
            create: archiveFiles.map((file) => ({
              projectId: archiveProject.id,
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

      const completedStatus = await tx.projectStatusOption.findFirst({
        where: {
          group: {
            is: {
              slug: defaultProjectStatusGroupSlugs.completed,
              isActive: true,
            },
          },
          isActive: true,
        },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: {
          id: true,
        },
      });

      await tx.project.update({
        where: {
          id: archiveProject.id,
        },
        data: {
          statusId: completedStatus?.id ?? latestProject.statusId,
          currentStageName: finalStage.name,
          completedAt: archivedAt,
          archivedAt,
        },
      });

      return {
        archiveId: createdArchive.id,
        archivedFileCount: archiveFiles.length,
        archiveCategoryId: archiveCategory.id,
        archiveCategorySlug: archiveCategory.slug,
        archiveCategoryLabel: archiveCategory.name,
      };
    }),
  );

  await withPrismaRetry(() =>
    prisma.projectCompletionWorkflow.upsert({
      where: {
        projectId: archiveProject.id,
      },
      update: {},
      create: {
        projectId: archiveProject.id,
      },
    }),
  );

  await withPrismaRetry(() =>
    prisma.projectActivityLog.create({
      data: {
        projectId: archiveProject.id,
        stageId: finalStage.id,
        actorId: user.id,
        action: "FINAL_ARCHIVED",
        metadata: {
          archiveId: archive.archiveId,
          archiveCategoryId: archive.archiveCategoryId,
          archiveCategorySlug: archive.archiveCategorySlug,
          archiveCategoryLabel: archive.archiveCategoryLabel,
          archivedFileCount: archiveFiles.length,
        },
      },
    }),
  );

  return archive;
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
        archivedAt: true,
        project: {
          select: {
            createdById: true,
          },
        },
      },
    }),
  );

  if (!archivedFile) {
    const manualArchiveFile = await withPrismaRetry(() =>
      prisma.manualArchiveFile.findUnique({
        where: {
          id: archivedFileId,
        },
        select: {
          fileName: true,
          mimeType: true,
          bucket: true,
          storageKey: true,
          status: true,
        },
      }),
    );

    if (!manualArchiveFile || manualArchiveFile.status !== AttachmentStatus.READY) {
      throw new Error("Archived file not found.");
    }

    if (!hasPermission(user, "archive.download")) {
      throw new Error("You do not have permission to download archive files.");
    }

    return createPresignedDownloadUrl({
      bucket: manualArchiveFile.bucket,
      storageKey: manualArchiveFile.storageKey,
      fileName: manualArchiveFile.fileName,
      mimeType: manualArchiveFile.mimeType,
    });
  }

  const project = await assertProjectAccess(user, archivedFile.projectId);

  if (!hasProjectPermission(user, project, "archive.download")) {
    throw new Error("You do not have permission to download archive files.");
  }

  await assertProjectTimestampVisibleForUser(user, {
    projectId: archivedFile.projectId,
    projectOwnerId: archivedFile.project.createdById,
    timestamp: archivedFile.archivedAt,
    message: "You do not have permission to access this archive file.",
  });

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
        archivedAt: true,
        project: {
          select: {
            createdById: true,
          },
        },
      },
    }),
  );

  if (!archivedFile) {
    const manualArchiveFile = await withPrismaRetry(() =>
      prisma.manualArchiveFile.findUnique({
        where: {
          id: archivedFileId,
        },
        select: {
          fileName: true,
          mimeType: true,
          bucket: true,
          storageKey: true,
          status: true,
        },
      }),
    );

    if (!manualArchiveFile || manualArchiveFile.status !== AttachmentStatus.READY) {
      throw new Error("Archived file not found.");
    }

    if (!hasPermission(user, "archive.view")) {
      throw new Error("You do not have permission to preview archive files.");
    }

    return createPresignedPreviewUrl({
      bucket: manualArchiveFile.bucket,
      storageKey: manualArchiveFile.storageKey,
      fileName: manualArchiveFile.fileName,
      mimeType: manualArchiveFile.mimeType,
    });
  }

  const project = await assertProjectAccess(user, archivedFile.projectId);

  if (!hasProjectPermission(user, project, "archive.view")) {
    throw new Error("You do not have permission to preview archive files.");
  }

  await assertProjectTimestampVisibleForUser(user, {
    projectId: archivedFile.projectId,
    projectOwnerId: archivedFile.project.createdById,
    timestamp: archivedFile.archivedAt,
    message: "You do not have permission to access this archive file.",
  });

  return createPresignedPreviewUrl({
    bucket: archivedFile.bucket,
    storageKey: archivedFile.storageKey,
    fileName: archivedFile.finalArchiveFileName,
    mimeType: archivedFile.mimeType,
  });
}
