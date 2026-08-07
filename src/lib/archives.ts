import {
  AttachmentAssetType,
  AttachmentStatus,
  ProjectRevisionStatus,
  Prisma,
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
import { getFinalCompletionArchiveBlockers } from "@/lib/project-completion";
import {
  assertCanUseArchives,
  canUseArchives,
  getAccessibleProjectsWhere,
  getArchiveAccessLevel,
  hasPermission,
  hasProjectPermission,
  type PermissionUser,
} from "@/lib/permissions/resolver";
import { projectCollaboratorPermissionSelect } from "@/lib/project-collaborator-permissions";
import {
  assertProjectTimestampVisibleForUser,
  canBypassCollaboratorVisibility,
  isTimestampHiddenByPauseWindows,
} from "@/lib/project-collaborator-visibility";
import {
  assertProjectAccess,
} from "@/lib/project-history";
import { prisma, withPrismaRetry } from "@/lib/prisma";
import { defaultProjectStatusGroupSlugs } from "@/lib/project-statuses";
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
import {
  formatArchiveMetadataDate,
  getArchiveArtworkMetadataMissingGroups,
  type ArchiveArtworkMetadataDraft,
  type ArchiveArtworkMetadataMissingGroup,
} from "@/lib/archive-artwork-metadata";

export type {
  ArchiveArtworkMetadataDraft,
  ArchiveArtworkMetadataMissingGroup,
} from "@/lib/archive-artwork-metadata";

export type ArchiveAccessUser = Pick<
  User,
  "id" | "role" | "email" | "name" | "collaboratorType"
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
  artworkMetadata: ArchiveArtworkMetadataSummary | null;
  previewPath: string;
  downloadPath: string;
};

export type ArchiveArtworkMetadataSummary = {
  artworkId: string;
  titleWorkingName: string;
  versionRevision: string;
  languageMarket: string;
  artworkType: string;
  brandSubBrand: string;
  productSku: string | null;
  campaignProject: string | null;
  formatDimensions: string | null;
  colourSpace: string;
  resolution: string | null;
  fileFormats: string;
  printProcess: string | null;
  specialFinishes: string | null;
  creationDate: string;
  lastModifiedDate: string;
  goLiveOnShelfDate: string | null;
  expirySunsetDate: string | null;
  archiveStatus: string;
  createdByName: string;
  approvedByName: string;
  approvedAt: string | null;
  clientBrandOwner: string;
  regulatoryClearance: string | null;
  fontsUsed: string;
  imagesPhotography: string;
  illustrationsIcons: string;
  colourCodes: string;
  thirdPartyLogosIp: string | null;
  supplierPrinter: string | null;
  outputFilesList: string | null;
  printProofRef: string | null;
  packagingDielineRef: string | null;
  changeLog: string;
  relatedArtworks: string | null;
  briefSpecLink: string | null;
  generalNotes: string | null;
};

const archiveArtworkMetadataSummarySelect = {
  artworkId: true,
  titleWorkingName: true,
  versionRevision: true,
  languageMarket: true,
  artworkType: true,
  brandSubBrand: true,
  productSku: true,
  campaignProject: true,
  formatDimensions: true,
  colourSpace: true,
  resolution: true,
  fileFormats: true,
  printProcess: true,
  specialFinishes: true,
  creationDate: true,
  lastModifiedDate: true,
  goLiveOnShelfDate: true,
  expirySunsetDate: true,
  archiveStatus: true,
  createdByName: true,
  approvedByName: true,
  approvedAt: true,
  clientBrandOwner: true,
  regulatoryClearance: true,
  fontsUsed: true,
  imagesPhotography: true,
  illustrationsIcons: true,
  colourCodes: true,
  thirdPartyLogosIp: true,
  supplierPrinter: true,
  outputFilesList: true,
  printProofRef: true,
  packagingDielineRef: true,
  changeLog: true,
  relatedArtworks: true,
  briefSpecLink: true,
  generalNotes: true,
} satisfies Prisma.ArchiveArtworkMetadataSelect;

type ArchiveArtworkMetadataSummarySource = Prisma.ArchiveArtworkMetadataGetPayload<{
  select: typeof archiveArtworkMetadataSummarySelect;
}>;

function mapArchiveArtworkMetadataSummary(
  metadata: ArchiveArtworkMetadataSummarySource | null | undefined,
): ArchiveArtworkMetadataSummary | null {
  if (!metadata) {
    return null;
  }

  return {
    ...metadata,
    creationDate: formatArchiveMetadataDate(metadata.creationDate),
    lastModifiedDate: formatArchiveMetadataDate(metadata.lastModifiedDate),
    goLiveOnShelfDate: metadata.goLiveOnShelfDate
      ? formatArchiveMetadataDate(metadata.goLiveOnShelfDate)
      : null,
    expirySunsetDate: metadata.expirySunsetDate
      ? formatArchiveMetadataDate(metadata.expirySunsetDate)
      : null,
    approvedAt: metadata.approvedAt ? formatArchiveMetadataDate(metadata.approvedAt) : null,
  };
}

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
  metadataDraft: ArchiveArtworkMetadataDraft;
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
  finalCompletionBlockers: string[];
  isFinalCompletionPending: boolean;
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
  sourceRevisionNumber: number | null;
  originalFileName: string;
  mimeType: string;
  fileSize: number;
  bucket: string;
  storageKey: string;
  sourceLabel: string;
  uploadedById: string;
  uploadedByName: string;
  approvedById: string | null;
  approvedByName: string | null;
  approvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  changeLog: string | null;
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

type CompleteArchiveUploadInput = {
  failed?: boolean;
  finalArchiveFileName?: string | null;
  archiveCategoryId?: string | null;
  artworkMetadata?: ArchiveArtworkMetadataDraft;
};

type ArchiveCategoryDisplay = {
  id: string;
  name: string;
  slug: string;
  iconUrl?: string | null;
  iconKey?: string | null;
  color?: string | null;
  allowedUsers?: Array<{ userId: string }>;
} | null;

function canUploadArchiveFiles(user: ArchiveAccessUser) {
  return (
    getArchiveAccessLevel(user) === "FULL" &&
    canUseArchives(user) &&
    hasPermission(user, "archive.uploadFile")
  );
}

export function canManageArchiveCategoryAccess(user: ArchiveAccessUser) {
  return canUseArchives(user) && hasPermission(user, "settings.manageMasterData");
}

function hasPartialArchiveAccess(user: ArchiveAccessUser) {
  return getArchiveAccessLevel(user) === "PARTIAL";
}

function getArchivedProjectFileAccessWhere(
  user: ArchiveAccessUser,
): Prisma.ArchivedProjectFileWhereInput {
  if (hasPartialArchiveAccess(user)) {
    return {
      userArchiveAccesses: {
        some: {
          userId: user.id,
        },
      },
    };
  }

  return {
    project: {
      is: buildArchivedProjectFileProjectWhere(user),
    },
  };
}

function getManualArchiveFileAccessWhere(
  user: ArchiveAccessUser,
): Prisma.ManualArchiveFileWhereInput {
  if (hasPartialArchiveAccess(user)) {
    return {
      userArchiveAccesses: {
        some: {
          userId: user.id,
        },
      },
    };
  }

  return {};
}

function getArchiveCategoryAssetGrantWhere(
  user: ArchiveAccessUser,
): Prisma.ArchiveCategoryWhereInput {
  if (!hasPartialArchiveAccess(user)) {
    return {};
  }

  return {
    OR: [
      {
        projectArchives: {
          some: {
            files: {
              some: {
                userArchiveAccesses: {
                  some: {
                    userId: user.id,
                  },
                },
              },
            },
          },
        },
      },
      {
        manualArchiveFiles: {
          some: {
            status: AttachmentStatus.READY,
            userArchiveAccesses: {
              some: {
                userId: user.id,
              },
            },
          },
        },
      },
    ],
  };
}

export function getAccessibleArchiveCategoryWhere(
  user: ArchiveAccessUser,
  options: { activeOnly?: boolean } = {},
): Prisma.ArchiveCategoryWhereInput {
  const activeWhere = options.activeOnly === false ? {} : { isActive: true };

  if (canManageArchiveCategoryAccess(user)) {
    return activeWhere;
  }

  if (!canUseArchives(user)) {
    return {
      ...activeWhere,
      id: "__no_access__",
    };
  }

  return {
    ...activeWhere,
    OR: [
      {
        allowedUsers: {
          none: {},
        },
      },
      {
        allowedUsers: {
          some: {
            userId: user.id,
          },
        },
      },
    ],
  };
}

export function canAccessArchiveCategoryRecord(
  user: ArchiveAccessUser,
  category: { allowedUsers?: Array<{ userId: string }> },
) {
  if (!canUseArchives(user)) {
    return false;
  }

  if (canManageArchiveCategoryAccess(user)) {
    return true;
  }

  const allowedUsers = category.allowedUsers ?? [];

  return allowedUsers.length === 0 || allowedUsers.some((access) => access.userId === user.id);
}

function buildArchivedProjectFileProjectWhere(
  user: ArchiveAccessUser,
): Prisma.ProjectWhereInput {
  return buildAccessibleProjectWhere(user);
}

function getArchivedProjectCategoryWhere(
  user: ArchiveAccessUser,
): Prisma.ArchiveCategoryWhereInput {
  return {
    AND: [
      getAccessibleArchiveCategoryWhere(user),
      getArchiveCategoryAssetGrantWhere(user),
    ],
  };
}

export async function canAccessArchivesArea(user: ArchiveAccessUser) {
  return canUseArchives(user);
}

export async function canAccessArchiveCategoryForUser(
  user: ArchiveAccessUser,
  category: { id: string; allowedUsers?: Array<{ userId: string }> },
) {
  if (!canAccessArchiveCategoryRecord(user, category)) {
    return false;
  }

  if (!hasPartialArchiveAccess(user)) {
    return true;
  }

  const [projectFileCount, manualFileCount] = await withPrismaRetry(() =>
    Promise.all([
      prisma.archivedProjectFile.count({
        where: {
          archive: {
            is: {
              archiveCategoryId: category.id,
            },
          },
          ...getArchivedProjectFileAccessWhere(user),
        },
      }),
      prisma.manualArchiveFile.count({
        where: {
          archiveCategoryId: category.id,
          status: AttachmentStatus.READY,
          ...getManualArchiveFileAccessWhere(user),
        },
      }),
    ]),
  );

  return projectFileCount + manualFileCount > 0;
}

export async function assertCanAccessArchiveCategory(
  user: ArchiveAccessUser,
  archiveCategoryId: string,
) {
  assertCanUseArchives(
    user,
    "You do not have permission to view this archive category.",
  );

  const category = await withPrismaRetry(() =>
    prisma.archiveCategory.findFirst({
      where: {
        id: archiveCategoryId,
        ...getAccessibleArchiveCategoryWhere(user),
      },
      select: {
        id: true,
      },
    }),
  );

  if (!category) {
    throw new Error("You do not have permission to view this archive category.");
  }

  return category;
}

export async function assertCanUploadToArchiveCategory(
  user: ArchiveAccessUser,
  archiveCategoryId: string,
) {
  if (canManageArchiveCategoryAccess(user)) {
    return assertCanAccessArchiveCategory(user, archiveCategoryId);
  }

  if (!canUploadArchiveFiles(user)) {
    throw new Error("You do not have permission to upload to this archive category.");
  }

  return assertCanAccessArchiveCategory(user, archiveCategoryId);
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
    slug: category?.slug ?? "",
    label: category?.name ?? "No archive category",
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
  return validateArchiveFileName(originalFileName, fileName, new Set<string>());
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

function getArtworkTypeFromProjectCategory(category: string) {
  const normalizedCategory = category.trim().toLowerCase();

  if (normalizedCategory.includes("pack")) {
    return "Packaging";
  }

  if (normalizedCategory.includes("promo")) {
    return "Promo Item";
  }

  if (normalizedCategory.includes("advert") || normalizedCategory.includes("print")) {
    return "Advertising & Print";
  }

  if (normalizedCategory.includes("digital") || normalizedCategory.includes("website")) {
    return "Digital & Website";
  }

  if (normalizedCategory.includes("video") || normalizedCategory.includes("motion")) {
    return "Video";
  }

  if (normalizedCategory.includes("pos") || normalizedCategory.includes("retail")) {
    return "POSMs & Retail";
  }

  if (normalizedCategory.includes("corporate")) {
    return "Corporate Identity";
  }

  if (normalizedCategory.includes("logo") || normalizedCategory.includes("icon")) {
    return "Logos & Icons";
  }

  return "";
}

function getArtworkIdPrefix(artworkType: string, category: string) {
  const value = `${artworkType} ${category}`.toLowerCase();

  if (value.includes("pack")) {
    return "PKG";
  }

  if (value.includes("promo")) {
    return "PRM";
  }

  if (value.includes("advert") || value.includes("print")) {
    return "ADV";
  }

  if (value.includes("digital") || value.includes("social") || value.includes("website")) {
    return "DIG";
  }

  if (value.includes("video") || value.includes("motion")) {
    return "VID";
  }

  if (value.includes("pos") || value.includes("retail")) {
    return "POS";
  }

  return "ART";
}

function getUserNameLabel(user: Pick<User, "name" | "email"> | null | undefined) {
  return user ? getUserDisplayName(user) : "";
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
        description: true,
        executionType: true,
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
        ownerId: true,
        owner: {
          select: {
            name: true,
            email: true,
          },
        },
        coOwners: { select: { userId: true } },
        createdBy: {
          select: {
            name: true,
            email: true,
          },
        },
        executors: {
          select: {
            userId: true,
          },
        },
        collaborators: {
          select: {
            ...projectCollaboratorPermissionSelect,
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
          where: { isTasker: false },
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
                allowedUsers: {
                  select: {
                    userId: true,
                  },
                },
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
                artworkMetadata: {
                  select: archiveArtworkMetadataSummarySelect,
                },
              },
            },
          },
        },
        completionWorkflow: {
          select: {
            approvalRequired: true,
            approvalStatus: true,
            copyrightRequired: true,
            copyrightStatus: true,
            invoiceRequired: true,
            invoiceStatus: true,
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
        title: true,
        summary: true,
        reviewedAt: true,
        reviewedById: true,
        reviewedBy: {
          select: {
            name: true,
            email: true,
          },
        },
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
              createdAt: true,
              updatedAt: true,
              uploadedById: true,
              uploadedBy: {
                select: {
                  name: true,
                  email: true,
                },
              },
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
          reviewNote: true,
          reviewedAt: true,
          reviewedById: true,
          reviewedBy: {
            select: {
              name: true,
              email: true,
            },
          },
          createdAt: true,
          updatedAt: true,
          uploadedById: true,
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
      sourceRevisionNumber: latestApprovedRevision?.revisionNumber ?? null,
      originalFileName: attachment.originalFileName,
      mimeType: attachment.mimeType,
      fileSize: attachment.fileSize,
      bucket: attachment.bucket,
      storageKey: attachment.storageKey,
      sourceLabel: `Submission ${submissionNumberById.get(attachment.id) ?? "—"}`,
      uploadedById: attachment.uploadedById,
      uploadedByName: getUserNameLabel(attachment.uploadedBy),
      approvedById: attachment.reviewedById,
      approvedByName: getUserNameLabel(attachment.reviewedBy),
      approvedAt: attachment.reviewedAt,
      createdAt: attachment.createdAt,
      updatedAt: attachment.updatedAt,
      changeLog:
        attachment.reviewNote ??
        (attachment.reviewedAt
          ? `Submission approved on ${formatArchiveMetadataDate(attachment.reviewedAt)}.`
          : "Approved stage submission."),
    }));

  const approvedRevisionAttachments = revisionAttachments.map<ArchivableAttachment>((attachment) => ({
    sourceAttachmentId: attachment.id,
    sourceRevisionId: attachment.revisionId,
    sourceRevisionNumber: latestApprovedRevision?.revisionNumber ?? null,
    originalFileName: attachment.originalFileName,
    mimeType: attachment.mimeType,
    fileSize: attachment.fileSize,
    bucket: attachment.bucket,
    storageKey: attachment.storageKey,
    sourceLabel: latestApprovedRevision
      ? `Revision ${latestApprovedRevision.revisionNumber}`
      : "Approved revision",
    uploadedById: attachment.uploadedById,
    uploadedByName: getUserNameLabel(attachment.uploadedBy),
    approvedById: latestApprovedRevision?.reviewedById ?? null,
    approvedByName: getUserNameLabel(latestApprovedRevision?.reviewedBy),
    approvedAt: latestApprovedRevision?.reviewedAt ?? null,
    createdAt: attachment.createdAt,
    updatedAt: attachment.updatedAt,
    changeLog:
      latestApprovedRevision?.summary ??
      latestApprovedRevision?.title ??
      (latestApprovedRevision
        ? `Revision ${latestApprovedRevision.revisionNumber} approved.`
        : null),
  }));

  return [...approvedRevisionAttachments, ...approvedStageSubmissions];
}

function buildArchiveArtworkMetadataDraft(input: {
  file: ArchivableAttachment;
  project: {
    name: string;
    category: string | null;
    description: string | null;
    owner: Pick<User, "name" | "email"> | null;
    createdBy: Pick<User, "name" | "email">;
  };
  index: number;
}) {
  const artworkType = getArtworkTypeFromProjectCategory(input.project.category ?? "");
  const prefix = getArtworkIdPrefix(artworkType, input.project.category ?? "");
  const year =
    input.file.approvedAt?.getFullYear() ??
    input.file.updatedAt.getFullYear() ??
    new Date().getFullYear();
  const fileFormat = getArchiveFileTypeLabel(
    input.file.originalFileName,
    input.file.mimeType,
  );
  const revisionLabel =
    input.file.sourceRevisionNumber !== null
      ? `Revision ${input.file.sourceRevisionNumber}`
      : input.file.sourceLabel;

  return {
    artworkId: `${prefix}-${year}-${String(input.index + 1).padStart(4, "0")}`,
    titleWorkingName: input.project.name || input.file.originalFileName,
    versionRevision: revisionLabel,
    languageMarket: "",
    artworkType,
    brandSubBrand: "",
    productSku: "",
    campaignProject: input.project.name,
    formatDimensions: "",
    colourSpace: "",
    resolution: "",
    fileFormats: fileFormat,
    printProcess: "",
    specialFinishes: "",
    creationDate: formatArchiveMetadataDate(input.file.createdAt),
    lastModifiedDate: formatArchiveMetadataDate(input.file.updatedAt),
    goLiveOnShelfDate: "",
    expirySunsetDate: "",
    archiveStatus: "Approved",
    createdByName: input.file.uploadedByName,
    approvedByName:
      input.file.approvedByName ??
      getUserNameLabel(input.project.owner ?? input.project.createdBy),
    approvedAt: formatArchiveMetadataDate(input.file.approvedAt),
    clientBrandOwner: getUserNameLabel(input.project.owner ?? input.project.createdBy),
    regulatoryClearance: "",
    fontsUsed: "",
    imagesPhotography: "",
    illustrationsIcons: "",
    colourCodes: "",
    thirdPartyLogosIp: "",
    supplierPrinter: "",
    outputFilesList: input.file.originalFileName,
    printProofRef: "",
    packagingDielineRef: "",
    changeLog: input.file.changeLog ?? "",
    relatedArtworks: "",
    briefSpecLink: "",
    generalNotes: input.project.description ?? "",
  } satisfies ArchiveArtworkMetadataDraft;
}

function normalizePreparedArchiveFiles(
  project: {
    name: string;
    category: string | null;
    description: string | null;
    owner: Pick<User, "name" | "email"> | null;
    createdBy: Pick<User, "name" | "email">;
  },
  files: ArchivableAttachment[],
) {
  return files.map<ProjectArchivePreparationFile>((file, index) => ({
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
    metadataDraft: buildArchiveArtworkMetadataDraft({
      file,
      project,
      index,
    }),
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
    throw new Error("You do not have permission to complete and archive this project.");
  }

  if (project.archive || project.archivedAt || project.completedAt) {
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

  const finalCompletionBlockers = getFinalCompletionArchiveBlockers({
    executionType: project.executionType,
    workflow: project.completionWorkflow,
  });

  if (finalCompletionBlockers.length > 0) {
    throw new Error(
      [
        "Final completion requirements must be resolved before archive.",
        ...finalCompletionBlockers,
      ].join("\n"),
    );
  }

  return finalStage;
}

async function getProjectCompletionArchiveCategoryOptions() {
  return getActiveArchiveCategoryOptions();
}

async function assertActiveProjectCompletionArchiveCategory(archiveCategoryId: string) {
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

  return archiveCategory;
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

function normalizeArchiveMetadataValue(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed || null;
}

function parseArchiveMetadataDate(
  value: string | null | undefined,
  label: string,
  options: { required: boolean },
) {
  const trimmed = value?.trim() ?? "";

  if (!trimmed) {
    if (options.required) {
      throw new Error(`${label} is required.`);
    }

    return null;
  }

  const date = new Date(`${trimmed}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`${label} must be a valid date.`);
  }

  return date;
}

function formatArchiveMetadataMissingGroups(groups: ArchiveArtworkMetadataMissingGroup[]) {
  return groups.map((group) => `${group.section}: ${group.fields.join(", ")}`);
}

function validateArchiveArtworkMetadataInput(input: {
  metadata: ArchiveArtworkMetadataDraft | undefined;
  file: {
    uploadedById?: string | null;
    approvedById?: string | null;
    createdByUserId?: string | null;
    approvedByUserId?: string | null;
    approvedAt?: Date | null;
  };
}) {
  if (!input.metadata) {
    throw new Error("Archive metadata is required for every final file.");
  }

  const missingGroups = getArchiveArtworkMetadataMissingGroups(input.metadata);

  if (missingGroups.length > 0) {
    throw new Error(
      [
        "Missing archive metadata.",
        ...formatArchiveMetadataMissingGroups(missingGroups),
      ].join("\n"),
    );
  }

  return {
    artworkId: input.metadata.artworkId.trim(),
    titleWorkingName: input.metadata.titleWorkingName.trim(),
    versionRevision: input.metadata.versionRevision.trim(),
    languageMarket: input.metadata.languageMarket.trim(),
    artworkType: input.metadata.artworkType.trim(),
    brandSubBrand: input.metadata.brandSubBrand.trim(),
    productSku: normalizeArchiveMetadataValue(input.metadata.productSku),
    campaignProject: normalizeArchiveMetadataValue(input.metadata.campaignProject),
    formatDimensions: normalizeArchiveMetadataValue(input.metadata.formatDimensions),
    colourSpace: input.metadata.colourSpace.trim(),
    resolution: normalizeArchiveMetadataValue(input.metadata.resolution),
    fileFormats: input.metadata.fileFormats.trim(),
    printProcess: normalizeArchiveMetadataValue(input.metadata.printProcess),
    specialFinishes: normalizeArchiveMetadataValue(input.metadata.specialFinishes),
    creationDate: parseArchiveMetadataDate(input.metadata.creationDate, "Creation date", {
      required: true,
    }) as Date,
    lastModifiedDate: parseArchiveMetadataDate(input.metadata.lastModifiedDate, "Last modified", {
      required: true,
    }) as Date,
    goLiveOnShelfDate: parseArchiveMetadataDate(
      input.metadata.goLiveOnShelfDate,
      "Go-live / On-shelf date",
      { required: false },
    ),
    expirySunsetDate: parseArchiveMetadataDate(
      input.metadata.expirySunsetDate,
      "Expiry / Sunset date",
      { required: false },
    ),
    archiveStatus: input.metadata.archiveStatus.trim(),
    createdByName: input.metadata.createdByName.trim(),
    createdByUserId: input.file.createdByUserId ?? input.file.uploadedById ?? null,
    approvedByName: input.metadata.approvedByName.trim(),
    approvedByUserId: input.file.approvedByUserId ?? input.file.approvedById ?? null,
    approvedAt:
      parseArchiveMetadataDate(input.metadata.approvedAt, "Approved at", {
        required: false,
      }) ?? input.file.approvedAt,
    clientBrandOwner: input.metadata.clientBrandOwner.trim(),
    regulatoryClearance: normalizeArchiveMetadataValue(input.metadata.regulatoryClearance),
    fontsUsed: input.metadata.fontsUsed.trim(),
    imagesPhotography: input.metadata.imagesPhotography.trim(),
    illustrationsIcons: input.metadata.illustrationsIcons.trim(),
    colourCodes: input.metadata.colourCodes.trim(),
    thirdPartyLogosIp: normalizeArchiveMetadataValue(input.metadata.thirdPartyLogosIp),
    supplierPrinter: normalizeArchiveMetadataValue(input.metadata.supplierPrinter),
    outputFilesList: normalizeArchiveMetadataValue(input.metadata.outputFilesList),
    printProofRef: normalizeArchiveMetadataValue(input.metadata.printProofRef),
    packagingDielineRef: normalizeArchiveMetadataValue(input.metadata.packagingDielineRef),
    changeLog: input.metadata.changeLog.trim(),
    relatedArtworks: normalizeArchiveMetadataValue(input.metadata.relatedArtworks),
    briefSpecLink: normalizeArchiveMetadataValue(input.metadata.briefSpecLink),
    generalNotes: normalizeArchiveMetadataValue(input.metadata.generalNotes),
  };
}

function buildArchiveArtworkMetadataCreateData(input: {
  sourceType: "PROJECT_FINAL_FILE" | "DIRECT_UPLOAD";
  archiveFileId?: string | null;
  manualArchiveFileId?: string | null;
  projectId?: string | null;
  sourceAttachmentId?: string | null;
  artworkMetadata: ReturnType<typeof validateArchiveArtworkMetadataInput>;
  archivedById: string;
}) {
  return {
    sourceType: input.sourceType,
    archiveFileId: input.archiveFileId ?? null,
    manualArchiveFileId: input.manualArchiveFileId ?? null,
    projectId: input.projectId ?? null,
    sourceAttachmentId: input.sourceAttachmentId ?? null,
    artworkId: input.artworkMetadata.artworkId,
    titleWorkingName: input.artworkMetadata.titleWorkingName,
    versionRevision: input.artworkMetadata.versionRevision,
    languageMarket: input.artworkMetadata.languageMarket,
    artworkType: input.artworkMetadata.artworkType,
    brandSubBrand: input.artworkMetadata.brandSubBrand,
    productSku: input.artworkMetadata.productSku,
    campaignProject: input.artworkMetadata.campaignProject,
    formatDimensions: input.artworkMetadata.formatDimensions,
    colourSpace: input.artworkMetadata.colourSpace,
    resolution: input.artworkMetadata.resolution,
    fileFormats: input.artworkMetadata.fileFormats,
    printProcess: input.artworkMetadata.printProcess,
    specialFinishes: input.artworkMetadata.specialFinishes,
    creationDate: input.artworkMetadata.creationDate,
    lastModifiedDate: input.artworkMetadata.lastModifiedDate,
    goLiveOnShelfDate: input.artworkMetadata.goLiveOnShelfDate,
    expirySunsetDate: input.artworkMetadata.expirySunsetDate,
    archiveStatus: input.artworkMetadata.archiveStatus,
    createdByName: input.artworkMetadata.createdByName,
    createdByUserId: input.artworkMetadata.createdByUserId,
    approvedByName: input.artworkMetadata.approvedByName,
    approvedByUserId: input.artworkMetadata.approvedByUserId,
    approvedAt: input.artworkMetadata.approvedAt,
    clientBrandOwner: input.artworkMetadata.clientBrandOwner,
    regulatoryClearance: input.artworkMetadata.regulatoryClearance,
    fontsUsed: input.artworkMetadata.fontsUsed,
    imagesPhotography: input.artworkMetadata.imagesPhotography,
    illustrationsIcons: input.artworkMetadata.illustrationsIcons,
    colourCodes: input.artworkMetadata.colourCodes,
    thirdPartyLogosIp: input.artworkMetadata.thirdPartyLogosIp,
    supplierPrinter: input.artworkMetadata.supplierPrinter,
    outputFilesList: input.artworkMetadata.outputFilesList,
    printProofRef: input.artworkMetadata.printProofRef,
    packagingDielineRef: input.artworkMetadata.packagingDielineRef,
    changeLog: input.artworkMetadata.changeLog,
    relatedArtworks: input.artworkMetadata.relatedArtworks,
    briefSpecLink: input.artworkMetadata.briefSpecLink,
    generalNotes: input.artworkMetadata.generalNotes,
    archivedById: input.archivedById,
  };
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
  artworkMetadata?: ArchiveArtworkMetadataSummarySource | null;
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
    artworkMetadata: mapArchiveArtworkMetadataSummary(input.artworkMetadata),
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
  artworkMetadata?: ArchiveArtworkMetadataSummarySource | null;
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
    artworkMetadata: mapArchiveArtworkMetadataSummary(input.artworkMetadata),
    previewPath: `/api/archives/files/${input.id}/preview`,
    downloadPath: `/api/archives/files/${input.id}/download`,
  } satisfies ArchivedProjectFileRecord;
}

function isArchiveTimestampVisibleToUser(
  user: ArchiveAccessUser,
  project: {
    ownerId: string | null;
    coOwners?: Array<{ userId: string }>;
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
  if (
    canBypassCollaboratorVisibility(user, project.ownerId ?? "") ||
    project.coOwners?.some((coOwner) => coOwner.userId === user.id)
  ) {
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

export async function listArchiveCategorySummaries(user: ArchiveAccessUser) {
  if (!(await canAccessArchivesArea(user))) {
    throw new Error("You do not have permission to view archives.");
  }

  const canAccessManualArchiveFiles = canUseArchives(user);

  const [categories, archivedFiles, manualArchiveFiles] = await withPrismaRetry(() =>
    Promise.all([
      prisma.archiveCategory.findMany({
        where: getArchivedProjectCategoryWhere(user),
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
          ...getArchivedProjectFileAccessWhere(user),
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
              ownerId: true,
              coOwners: { select: { userId: true } },
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
      canAccessManualArchiveFiles
        ? prisma.manualArchiveFile.findMany({
            where: {
              status: AttachmentStatus.READY,
              ...getManualArchiveFileAccessWhere(user),
            },
            select: {
              archiveCategoryId: true,
              uploadedAt: true,
              projectName: true,
            },
          })
        : Promise.resolve([]),
    ]),
  );
  const visibleArchivedFiles = archivedFiles.filter((file) =>
    isArchiveTimestampVisibleToUser(user, file.project, file.archivedAt),
  );

  const summaries = categories.map<ArchiveCategorySummary>((category) => {
    const categoryFiles = visibleArchivedFiles.filter(
      (file) => file.archive.archiveCategoryId === category.id,
    );
    const categoryManualFiles = manualArchiveFiles.filter(
      (file) => file.archiveCategoryId === category.id,
    );
    const uniqueProjectIds = new Set([
      ...categoryFiles.map((file) => file.projectId),
      ...categoryManualFiles
        .map((file) => file.projectName?.trim())
        .filter((projectName): projectName is string => Boolean(projectName)),
    ]);
    const latestArchivedAt = [
      ...categoryFiles.map((file) => file.archivedAt),
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
        categoryFiles.length + categoryManualFiles.length,
      projectCount: uniqueProjectIds.size,
      latestArchivedAt: formatArchiveTimestamp(latestArchivedAt),
    };
  });

  return hasPartialArchiveAccess(user)
    ? summaries.filter((summary) => summary.fileCount > 0)
    : summaries;
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

  if (!archiveCategoryId) {
    const activeCategoryCount = await withPrismaRetry(() =>
      prisma.archiveCategory.count({
        where: {
          isActive: true,
        },
      }),
    );

    if (activeCategoryCount === 0) {
      return {
        error: "No archive categories available. Please create a category in Master Data first.",
      } as const;
    }

    return { error: "Choose an archive category before uploading." } as const;
  }

  try {
    await assertCanUploadToArchiveCategory(user, archiveCategoryId);
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Choose a valid archive category.",
    } as const;
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
  input: CompleteArchiveUploadInput = {},
) {
  if (!canUploadArchiveFiles(user)) {
    throw new Error("You do not have permission to upload to Archives.");
  }

  const archiveFile = await withPrismaRetry(() =>
    prisma.manualArchiveFile.findUnique({
      where: {
        id: archiveFileId,
      },
      select: {
        id: true,
        uploadedById: true,
        status: true,
        fileName: true,
        originalFileName: true,
        archiveCategoryId: true,
        archiveCategory: {
          select: {
            slug: true,
          },
        },
      },
    }),
  );

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

  if (input.failed) {
    await withPrismaRetry(() =>
      prisma.manualArchiveFile.update({
        where: {
          id: archiveFile.id,
        },
        data: {
          status: AttachmentStatus.FAILED,
        },
      }),
    );

    return {
      archiveCategorySlug: archiveFile.archiveCategory?.slug ?? null,
    };
  }

  const archiveCategoryId = input.archiveCategoryId?.trim() || archiveFile.archiveCategoryId;

  if (!archiveCategoryId) {
    throw new Error("Choose an archive category before uploading.");
  }

  await assertCanUploadToArchiveCategory(user, archiveCategoryId);

  const archiveCategory = await withPrismaRetry(() =>
    prisma.archiveCategory.findFirst({
      where: {
        id: archiveCategoryId,
        isActive: true,
      },
      select: {
        slug: true,
      },
    }),
  );

  if (!archiveCategory) {
    throw new Error("Choose a valid archive category.");
  }

  const finalArchiveFileName = validateArchiveFileName(
    archiveFile.originalFileName,
    input.finalArchiveFileName ?? archiveFile.fileName,
    new Set<string>(),
  );
  const artworkMetadata = validateArchiveArtworkMetadataInput({
    metadata: input.artworkMetadata,
    file: {
      createdByUserId: user.id,
      approvedByUserId: user.id,
      approvedAt: new Date(),
    },
  });
  const archivedAt = new Date();

  return withPrismaRetry(() =>
    prisma.$transaction(async (tx) => {
      await tx.manualArchiveFile.update({
        where: {
          id: archiveFile.id,
        },
        data: {
          fileName: finalArchiveFileName,
          archiveCategoryId,
          status: AttachmentStatus.READY,
          uploadedAt: archivedAt,
        },
      });

      await tx.archiveArtworkMetadata.upsert({
        where: {
          manualArchiveFileId: archiveFile.id,
        },
        update: buildArchiveArtworkMetadataCreateData({
          sourceType: "DIRECT_UPLOAD",
          manualArchiveFileId: archiveFile.id,
          artworkMetadata,
          archivedById: user.id,
        }),
        create: buildArchiveArtworkMetadataCreateData({
          sourceType: "DIRECT_UPLOAD",
          manualArchiveFileId: archiveFile.id,
          artworkMetadata,
          archivedById: user.id,
        }),
      });

      return {
        archiveCategorySlug: archiveCategory.slug,
      };
    }),
  );
}

export async function listArchivedFilesByCategory(
  user: ArchiveAccessUser,
  category: ArchiveCategoryRecord,
) {
  if (!(await canAccessArchivesArea(user))) {
    throw new Error("You do not have permission to view archives.");
  }

  if (!(await canAccessArchiveCategoryForUser(user, category))) {
    throw new Error("You do not have permission to view this archive category.");
  }

  const canAccessManualArchiveFiles = canUseArchives(user);

  const [files, manualArchiveFiles] = await withPrismaRetry(() =>
    Promise.all([
      prisma.archivedProjectFile.findMany({
        where: {
          ...getArchivedProjectFileAccessWhere(user),
          archive: {
            is: {
              archiveCategoryId: category.id,
            },
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
          artworkMetadata: {
            select: archiveArtworkMetadataSummarySelect,
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
              ownerId: true,
              coOwners: { select: { userId: true } },
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
      canAccessManualArchiveFiles
        ? prisma.manualArchiveFile.findMany({
            where: {
              archiveCategoryId: category.id,
              status: AttachmentStatus.READY,
              ...getManualArchiveFileAccessWhere(user),
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
              artworkMetadata: {
                select: archiveArtworkMetadataSummarySelect,
              },
            },
          })
        : Promise.resolve([]),
    ]),
  );
  const visibleFiles = files.filter((file) =>
    isArchiveTimestampVisibleToUser(user, file.project, file.archivedAt),
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
        artworkMetadata: file.artworkMetadata,
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
        artworkMetadata: file.artworkMetadata,
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

  const categories = await getProjectCompletionArchiveCategoryOptions();

  if (categories.length === 0) {
    throw new Error("Create an archive category before archiving final files.");
  }

  return {
    projectId: project.id,
    projectName: project.name,
    finalStageId: finalStage.id,
    finalStageName: finalStage.name,
    selectedCategoryId: categories[0]?.id ?? "",
    categories,
    files: normalizePreparedArchiveFiles(project, files),
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
  const isCompleted = Boolean(project.archive || project.archivedAt || project.completedAt);
  const canCompleteArchive = hasProjectPermission(user, project, "project.completeArchive");
  const isProjectOwner = hasProjectPermission(user, project, "project.completeArchive");
  const canViewArchivedFiles = hasProjectPermission(user, project, "archive.view");
  const visibleArchivedFiles =
    project.archive?.files.filter((file) =>
      isArchiveTimestampVisibleToUser(
        user,
        {
          ownerId: project.ownerId,
          coOwners: project.coOwners,
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
  const finalCompletionBlockers =
    allStagesCompleted && !isCompleted
      ? getFinalCompletionArchiveBlockers({
          executionType: project.executionType,
          workflow: project.completionWorkflow,
        })
      : [];
  const isFinalCompletionPending =
    allStagesCompleted && !isCompleted && finalCompletionBlockers.length > 0;

  return {
    isCompleted,
    completedAt: formatArchiveTimestamp(project.completedAt),
    archivedAt: formatArchiveTimestamp(project.archivedAt ?? project.archive?.archivedAt ?? null),
    finalStageId: finalStage?.id ?? null,
    finalStageName: finalStage?.name ?? null,
    isSelectedStageFinal,
    canCompleteProject:
      isProjectOwner &&
      canCompleteArchive &&
      Boolean(finalStage) &&
      allStagesCompleted &&
      !isCompleted &&
      approvedFiles.length > 0 &&
      finalCompletionBlockers.length === 0,
    approvedFileCount: approvedFiles.length,
    finalCompletionBlockers,
    isFinalCompletionPending,
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
            projectCategory: project.category ?? "Uncategorized",
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
            artworkMetadata: file.artworkMetadata,
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
      artworkMetadata: ArchiveArtworkMetadataDraft;
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
      artworkMetadata: validateArchiveArtworkMetadataInput({
        metadata: file.artworkMetadata,
        file: preparedFile,
      }),
    };
  });
  const projectTags = getArchiveProjectTagNames(archiveProject);
  const projectTagLabel = formatArchiveProjectTagsLabel(projectTags);
  const archiveCategoryId = input.archiveCategoryId?.trim();

  if (!archiveCategoryId) {
    const activeCategoryCount = await withPrismaRetry(() =>
      prisma.archiveCategory.count({
        where: {
          isActive: true,
        },
      }),
    );

    if (activeCategoryCount === 0) {
      throw new Error("Create an archive category before archiving final files.");
    }

    throw new Error("Choose an archive category.");
  }

  const archiveCategory = await assertActiveProjectCompletionArchiveCategory(archiveCategoryId);

  const archivedAt = new Date();

  const archive = await withPrismaRetry(() =>
    prisma.$transaction(async (tx) => {
      const latestProject = await tx.project.findUnique({
        where: {
          id: input.projectId,
        },
        select: {
          id: true,
          ownerId: true,
          coOwners: { select: { userId: true } },
          executionType: true,
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
          executors: {
            select: {
              userId: true,
            },
          },
          collaborators: {
            select: {
              userId: true,
            },
          },
          archive: {
            select: {
              id: true,
            },
          },
          completionWorkflow: {
            select: {
              approvalRequired: true,
              approvalStatus: true,
              copyrightRequired: true,
              copyrightStatus: true,
              invoiceRequired: true,
              invoiceStatus: true,
            },
          },
          stages: {
            where: { isTasker: false },
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

      if (!hasProjectPermission(user, latestProject, "project.completeArchive")) {
        throw new Error("You do not have permission to complete and archive this project.");
      }

      if (latestProject.archive || latestProject.archivedAt || latestProject.completedAt) {
        throw new Error("Project is already completed.");
      }

      const allStagesCompletionError = getAllStagesCompletionError(latestProject);

      if (allStagesCompletionError) {
        throw new Error(allStagesCompletionError);
      }

      const finalCompletionBlockers = getFinalCompletionArchiveBlockers({
        executionType: latestProject.executionType,
        workflow: latestProject.completionWorkflow,
      });

      if (finalCompletionBlockers.length > 0) {
        throw new Error(
          [
            "Final completion requirements must be resolved before archive.",
            ...finalCompletionBlockers,
          ].join("\n"),
        );
      }

      const createdArchive = await tx.projectArchive.create({
        data: {
          projectId: archiveProject.id,
          finalStageId: finalStage.id,
          archivedById: user.id,
          projectName: archiveProject.name,
          projectCategory: archiveProject.category ?? "Uncategorized",
          projectTag: projectTagLabel === "—" ? null : projectTagLabel,
          archiveCategoryId: archiveCategory.id,
          status: "ARCHIVED",
          archivedAt,
        },
        select: {
          id: true,
        },
      });

      for (const file of archiveFiles) {
        const createdFile = await tx.archivedProjectFile.create({
          data: {
            archiveId: createdArchive.id,
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
          },
          select: {
            id: true,
          },
        });

        await tx.archiveArtworkMetadata.create({
          data: {
            archiveFileId: createdFile.id,
            projectId: archiveProject.id,
            sourceAttachmentId: file.sourceAttachmentId,
            artworkId: file.artworkMetadata.artworkId,
            titleWorkingName: file.artworkMetadata.titleWorkingName,
            versionRevision: file.artworkMetadata.versionRevision,
            languageMarket: file.artworkMetadata.languageMarket,
            artworkType: file.artworkMetadata.artworkType,
            brandSubBrand: file.artworkMetadata.brandSubBrand,
            productSku: file.artworkMetadata.productSku,
            campaignProject: file.artworkMetadata.campaignProject,
            formatDimensions: file.artworkMetadata.formatDimensions,
            colourSpace: file.artworkMetadata.colourSpace,
            resolution: file.artworkMetadata.resolution,
            fileFormats: file.artworkMetadata.fileFormats,
            printProcess: file.artworkMetadata.printProcess,
            specialFinishes: file.artworkMetadata.specialFinishes,
            creationDate: file.artworkMetadata.creationDate,
            lastModifiedDate: file.artworkMetadata.lastModifiedDate,
            goLiveOnShelfDate: file.artworkMetadata.goLiveOnShelfDate,
            expirySunsetDate: file.artworkMetadata.expirySunsetDate,
            archiveStatus: file.artworkMetadata.archiveStatus,
            createdByName: file.artworkMetadata.createdByName,
            createdByUserId: file.artworkMetadata.createdByUserId,
            approvedByName: file.artworkMetadata.approvedByName,
            approvedByUserId: file.artworkMetadata.approvedByUserId,
            approvedAt: file.artworkMetadata.approvedAt,
            clientBrandOwner: file.artworkMetadata.clientBrandOwner,
            regulatoryClearance: file.artworkMetadata.regulatoryClearance,
            fontsUsed: file.artworkMetadata.fontsUsed,
            imagesPhotography: file.artworkMetadata.imagesPhotography,
            illustrationsIcons: file.artworkMetadata.illustrationsIcons,
            colourCodes: file.artworkMetadata.colourCodes,
            thirdPartyLogosIp: file.artworkMetadata.thirdPartyLogosIp,
            supplierPrinter: file.artworkMetadata.supplierPrinter,
            outputFilesList: file.artworkMetadata.outputFilesList,
            printProofRef: file.artworkMetadata.printProofRef,
            packagingDielineRef: file.artworkMetadata.packagingDielineRef,
            changeLog: file.artworkMetadata.changeLog,
            relatedArtworks: file.artworkMetadata.relatedArtworks,
            briefSpecLink: file.artworkMetadata.briefSpecLink,
            generalNotes: file.artworkMetadata.generalNotes,
            archivedById: user.id,
          },
        });
      }

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

async function assertCanAccessArchivedProjectFileAsset(
  user: ArchiveAccessUser,
  archivedFile: { id: string; archive: { archiveCategoryId: string | null } },
  message = "You do not have permission to access this archive file.",
) {
  assertCanUseArchives(user, message);

  if (!archivedFile.archive.archiveCategoryId) {
    throw new Error("Archived file not found.");
  }

  await assertCanAccessArchiveCategory(user, archivedFile.archive.archiveCategoryId);

  if (!hasPartialArchiveAccess(user)) {
    return;
  }

  const accessCount = await withPrismaRetry(() =>
    prisma.userArchiveAssetAccess.count({
      where: {
        userId: user.id,
        archivedProjectFileId: archivedFile.id,
      },
    }),
  );

  if (accessCount === 0) {
    throw new Error(message);
  }
}

async function assertCanAccessManualArchiveFileAsset(
  user: ArchiveAccessUser,
  manualArchiveFile: { id: string; archiveCategoryId: string | null },
  message = "You do not have permission to access this archive file.",
) {
  assertCanUseArchives(user, message);

  if (!manualArchiveFile.archiveCategoryId) {
    throw new Error("Archived file not found.");
  }

  await assertCanAccessArchiveCategory(user, manualArchiveFile.archiveCategoryId);

  if (!hasPartialArchiveAccess(user)) {
    return;
  }

  const accessCount = await withPrismaRetry(() =>
    prisma.userArchiveAssetAccess.count({
      where: {
        userId: user.id,
        manualArchiveFileId: manualArchiveFile.id,
      },
    }),
  );

  if (accessCount === 0) {
    throw new Error(message);
  }
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
            ownerId: true,
            coOwners: { select: { userId: true } },
          },
        },
        archive: {
          select: {
            archiveCategoryId: true,
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
          id: true,
          fileName: true,
          mimeType: true,
          bucket: true,
          storageKey: true,
          status: true,
          archiveCategoryId: true,
        },
      }),
    );

    if (!manualArchiveFile || manualArchiveFile.status !== AttachmentStatus.READY) {
      throw new Error("Archived file not found.");
    }

    if (!hasPermission(user, "archive.download")) {
      throw new Error("You do not have permission to download archive files.");
    }

    await assertCanAccessManualArchiveFileAsset(
      user,
      manualArchiveFile,
      "You do not have permission to download archive files.",
    );

    return createPresignedDownloadUrl({
      bucket: manualArchiveFile.bucket,
      storageKey: manualArchiveFile.storageKey,
      fileName: manualArchiveFile.fileName,
      mimeType: manualArchiveFile.mimeType,
    });
  }

  if (hasPartialArchiveAccess(user)) {
    if (!hasPermission(user, "archive.download")) {
      throw new Error("You do not have permission to download archive files.");
    }

    await assertCanAccessArchivedProjectFileAsset(
      user,
      archivedFile,
      "You do not have permission to download archive files.",
    );
  } else {
    const project = await assertProjectAccess(user, archivedFile.projectId);

    if (!hasProjectPermission(user, project, "archive.download")) {
      throw new Error("You do not have permission to download archive files.");
    }

    await assertCanAccessArchivedProjectFileAsset(
      user,
      archivedFile,
      "You do not have permission to download archive files.",
    );

    if (!hasProjectPermission(user, project, "collaborator.pauseVisibility")) {
      await assertProjectTimestampVisibleForUser(user, {
        projectId: archivedFile.projectId,
        projectOwnerId: archivedFile.project.ownerId ?? "",
        timestamp: archivedFile.archivedAt,
        message: "You do not have permission to access this archive file.",
      });
    }
  }

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
            ownerId: true,
            coOwners: { select: { userId: true } },
          },
        },
        archive: {
          select: {
            archiveCategoryId: true,
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
          id: true,
          fileName: true,
          mimeType: true,
          bucket: true,
          storageKey: true,
          status: true,
          archiveCategoryId: true,
        },
      }),
    );

    if (!manualArchiveFile || manualArchiveFile.status !== AttachmentStatus.READY) {
      throw new Error("Archived file not found.");
    }

    await assertCanAccessManualArchiveFileAsset(
      user,
      manualArchiveFile,
      "You do not have permission to preview archive files.",
    );

    return createPresignedPreviewUrl({
      bucket: manualArchiveFile.bucket,
      storageKey: manualArchiveFile.storageKey,
      fileName: manualArchiveFile.fileName,
      mimeType: manualArchiveFile.mimeType,
    });
  }

  if (hasPartialArchiveAccess(user)) {
    await assertCanAccessArchivedProjectFileAsset(
      user,
      archivedFile,
      "You do not have permission to preview archive files.",
    );
  } else {
    const project = await assertProjectAccess(user, archivedFile.projectId);

    if (!hasProjectPermission(user, project, "archive.view")) {
      throw new Error("You do not have permission to preview archive files.");
    }

    await assertCanAccessArchivedProjectFileAsset(
      user,
      archivedFile,
      "You do not have permission to preview archive files.",
    );

    if (!hasProjectPermission(user, project, "collaborator.pauseVisibility")) {
      await assertProjectTimestampVisibleForUser(user, {
        projectId: archivedFile.projectId,
        projectOwnerId: archivedFile.project.ownerId ?? "",
        timestamp: archivedFile.archivedAt,
        message: "You do not have permission to access this archive file.",
      });
    }
  }

  return createPresignedPreviewUrl({
    bucket: archivedFile.bucket,
    storageKey: archivedFile.storageKey,
    fileName: archivedFile.finalArchiveFileName,
    mimeType: archivedFile.mimeType,
  });
}
