import {
  AttachmentAssetType,
  AttachmentStatus,
  UserRole,
  type User,
} from "@prisma/client";

import {
  canBypassCollaboratorVisibility,
  isTimestampHiddenByPauseWindows,
} from "@/lib/project-collaborator-visibility";
import { getFavoriteAttachmentIdSetForUser } from "@/lib/file-favorite-queries";
import { getFavoriteManualLibraryAssetIdSetForUser } from "@/lib/manual-library-asset-favorites";
import {
  getDevTimingDurationMs,
  getDevTimingNow,
  logDevTiming,
  timeDevAsync,
} from "@/lib/dev-timing";
import {
  hasPermission,
  type PermissionUser,
} from "@/lib/permissions/resolver";
import { prisma, withPrismaRetry } from "@/lib/prisma";
import {
  buildManualLibraryAssetKey,
  createPresignedDownloadUrl,
  createPresignedPreviewUrl,
  createPresignedUploadTarget,
  deleteObjectIfNeeded,
  getFileExtension,
  getMaxAssetUploadBytes,
  getDefaultS3UploadEndpointMode,
  getObjectMetadata,
  getS3BucketName,
  getS3Region,
  type S3UploadEndpointMode,
} from "@/lib/storage/s3";
import { canUploadLibraryAssets, canViewLibrary } from "@/lib/library-access";
import {
  type LibraryDateFilter,
  type LibraryItemRecord,
  type LibraryPageData,
  type LibraryUploadCategory,
  type LibraryQueryInput,
  type LibraryQuickMenuCounts,
  libraryUploadCategoryOptions,
} from "@/lib/library-shared";
import {
  PROJECT_ASSET_ALLOWED_EXTENSIONS,
  buildFileTypeNotAllowedPayload,
  isAllowedAssetFile,
} from "@/lib/upload-validation";
import {
  mapAssetTagAssignments,
  validateActiveAssetTagIds,
  type AssetTagAssignmentRecord,
} from "@/lib/asset-tags";

const libraryAssetTypes = [
  AttachmentAssetType.GENERAL_PROJECT_ASSET,
  AttachmentAssetType.COMMENT_ATTACHMENT,
  AttachmentAssetType.STAGE_SUBMISSION,
  AttachmentAssetType.REVISION_ORIGINAL,
  AttachmentAssetType.STAGE_INVOICE,
] as const;

const financeFilePattern = /\b(invoice|quotation|quote|inv)\b/i;
const spreadsheetExtensions = new Set(["csv", "xls", "xlsx", "numbers"]);
const archiveExtensions = new Set(["zip", "rar", "7z", "tar", "gz"]);
const designExtensions = new Set([
  "ai",
  "psd",
  "fig",
  "sketch",
  "xd",
  "eps",
  "indd",
  "cdr",
]);
const documentExtensions = new Set([
  "doc",
  "docx",
  "ppt",
  "pptx",
  "txt",
  "rtf",
  "pages",
]);

type LibraryUser = Pick<
  User,
  "id" | "role" | "name" | "email"
> &
  PermissionUser;

type RawLibraryAttachment = {
  id: string;
  projectId: string;
  originalFileName: string;
  mimeType: string;
  createdAt: Date;
  uploadedById: string;
  assetType: AttachmentAssetType;
  assetTags: AssetTagAssignmentRecord[];
  project: {
    id: string;
    name: string;
    tags?: Array<{
      tag: {
        name: string;
      };
    }>;
    createdById: string;
    executors: Array<{
      userId: string;
    }>;
    collaborators: Array<{
      userId: string;
      chatVisibilityPaused: boolean;
      visibilityPauses: Array<{
        pausedAt: Date;
        resumedAt: Date | null;
      }>;
    }>;
  };
  uploadedBy: {
    id: string;
    name: string | null;
    email: string;
  };
};

type RawManualLibraryAsset = {
  id: string;
  assetName: string;
  originalFileName: string;
  createdByName: string | null;
  category: string | null;
  assetTags: AssetTagAssignmentRecord[];
  mimeType: string;
  uploadedAt: Date;
  uploadedById: string;
  uploadedBy: {
    id: string;
    name: string | null;
    email: string;
  };
};

const manualLibraryAssetLibraryItemSelect = {
  id: true,
  assetName: true,
  originalFileName: true,
  createdByName: true,
  category: true,
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
  mimeType: true,
  uploadedAt: true,
  uploadedById: true,
  uploadedBy: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
} as const;

type RequestManualLibraryAssetUploadInput = {
  assetName: string;
  originalFileName: string;
  mimeType: string;
  fileSize: number;
  createdByName?: string | null;
  description?: string | null;
  category?: string | null;
  assetTagIds?: string[];
  uploadEndpointMode?: S3UploadEndpointMode;
};

type CompleteManualLibraryAssetUploadInput = {
  storageKey: string;
  assetName: string;
  originalFileName: string;
  mimeType: string;
  fileSize: number;
  createdByName?: string | null;
  description?: string | null;
  category?: string | null;
  assetTagIds?: string[];
};

function getLibraryUserDisplayName(user: { name: string | null; email: string }) {
  return user.name?.trim() || user.email;
}

function clampPage(value: number | undefined) {
  if (!Number.isFinite(value) || !value || value < 1) {
    return 1;
  }

  return Math.floor(value);
}

function clampPageSize(value: number | undefined) {
  if (!Number.isFinite(value) || !value || value < 1) {
    return 20;
  }

  return Math.min(50, Math.floor(value));
}

function formatLibraryDate(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function normalizeOptionalLibraryText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeLibraryProjectTags(values: Array<string | null | undefined>) {
  const normalized = new Map<string, string>();

  values.forEach((value) => {
    const trimmedValue = value?.trim();

    if (!trimmedValue) {
      return;
    }

    const key = trimmedValue.toLowerCase();
    if (!normalized.has(key)) {
      normalized.set(key, trimmedValue);
    }
  });

  return [...normalized.values()];
}

function getLibraryProjectTagNames(project: RawLibraryAttachment["project"]) {
  const relationTags =
    project.tags
      ?.map((assignment) => assignment.tag.name)
      .filter((tagName) => tagName.trim())
      .sort((left, right) =>
        left.localeCompare(right, undefined, { sensitivity: "base" }),
      ) ?? [];

  return normalizeLibraryProjectTags(relationTags);
}

function formatLibraryProjectTagsLabel(tags: string[]) {
  return tags.length > 0 ? tags.join(", ") : null;
}

function resolveManualLibraryAssetName(assetName: string, originalFileName: string) {
  const trimmedAssetName = assetName.trim();

  if (!trimmedAssetName) {
    throw new Error("Asset name is required.");
  }

  const assetExtension = getFileExtension(trimmedAssetName);
  const originalExtension = getFileExtension(originalFileName);

  if (!assetExtension && originalExtension) {
    return `${trimmedAssetName}.${originalExtension}`;
  }

  return trimmedAssetName;
}

function parseManualLibraryCategory(value: string | null | undefined): LibraryUploadCategory | null {
  if (
    value &&
    libraryUploadCategoryOptions.some((option) => option.value === value)
  ) {
    return value as LibraryUploadCategory;
  }

  return null;
}

function getManualLibraryCategoryLabel(value: string | null | undefined) {
  return (
    libraryUploadCategoryOptions.find((option) => option.value === value)?.label ??
    "Manual Upload"
  );
}

function getLibraryTypeLabel(fileName: string, mimeType: string) {
  const extension = getFileExtension(fileName).toLowerCase();

  if (financeFilePattern.test(fileName)) {
    return "Invoice/Quotation";
  }

  if (mimeType.startsWith("image/")) {
    return "Image";
  }

  if (mimeType === "application/pdf" || extension === "pdf") {
    return "PDF";
  }

  if (
    mimeType.includes("spreadsheet") ||
    mimeType.includes("excel") ||
    spreadsheetExtensions.has(extension)
  ) {
    return "Spreadsheet";
  }

  if (
    mimeType.includes("zip") ||
    mimeType.includes("compressed") ||
    archiveExtensions.has(extension)
  ) {
    return "Archive/ZIP";
  }

  if (
    mimeType.includes("illustrator") ||
    mimeType.includes("photoshop") ||
    designExtensions.has(extension)
  ) {
    return "Design file";
  }

  if (
    mimeType.includes("word") ||
    mimeType.includes("presentation") ||
    mimeType.startsWith("text/") ||
    documentExtensions.has(extension)
  ) {
    return "Document";
  }

  return "Other";
}

function isFinanceLibraryFile(fileName: string) {
  return financeFilePattern.test(fileName);
}

function canDeleteLibraryAttachment(user: LibraryUser, ownerId: string) {
  return (
    hasPermission(user, "library.deleteFile") &&
    (user.role === UserRole.SUPER_ADMIN ||
      user.role === UserRole.ADMIN ||
      ownerId === user.id)
  );
}

function canDeleteManualLibraryAsset(user: LibraryUser, uploadedById: string) {
  return (
    hasPermission(user, "library.deleteFile") &&
    (user.role === UserRole.SUPER_ADMIN ||
      user.role === UserRole.ADMIN ||
      uploadedById === user.id)
  );
}

function isAttachmentVisibleToUser(
  user: LibraryUser,
  attachment: RawLibraryAttachment,
) {
  if (canBypassCollaboratorVisibility(user, attachment.project.createdById)) {
    return true;
  }

  const isExecutor = attachment.project.executors.some(
    (executor) => executor.userId === user.id,
  );
  const collaborator = attachment.project.collaborators.find(
    (item) => item.userId === user.id,
  );

  if (!collaborator) {
    return isExecutor;
  }

  if (collaborator.chatVisibilityPaused && collaborator.visibilityPauses.length === 0) {
    return false;
  }

  return !isTimestampHiddenByPauseWindows(
    attachment.createdAt,
    collaborator.visibilityPauses,
  );
}

function mapAttachmentToLibraryItem(
  user: LibraryUser,
  attachment: RawLibraryAttachment,
  favoritedAttachmentIds?: ReadonlySet<string>,
): LibraryItemRecord {
  const isStageInvoice = attachment.assetType === AttachmentAssetType.STAGE_INVOICE;
  const type = isStageInvoice
    ? "Invoice/Quotation"
    : getLibraryTypeLabel(attachment.originalFileName, attachment.mimeType);
  const isFinance = isStageInvoice || isFinanceLibraryFile(attachment.originalFileName);
  const projectTags = getLibraryProjectTagNames(attachment.project);
  const assetTags = mapAssetTagAssignments(attachment.assetTags);

  return {
    id: attachment.id,
    source: "PROJECT_ATTACHMENT",
    fileName: attachment.originalFileName,
    projectId: attachment.projectId,
    projectName: attachment.project.name,
    projectTag: formatLibraryProjectTagsLabel(projectTags),
    projectTags,
    assetTags,
    uploadedAt: formatLibraryDate(attachment.createdAt),
    uploadedAtValue: attachment.createdAt.toISOString(),
    createdBy: getLibraryUserDisplayName(attachment.uploadedBy),
    createdById: attachment.uploadedById,
    createdByEmail: attachment.uploadedBy.email,
    type,
    quickCategory: isFinance ? "Quotations/Invoices" : "Project Assets",
    mimeType: attachment.mimeType,
    previewPath: `/api/project-assets/${attachment.id}/preview`,
    downloadPath: `/api/project-assets/${attachment.id}/download`,
    canDelete: canDeleteLibraryAttachment(user, attachment.project.createdById),
    isFavoritedByCurrentUser: favoritedAttachmentIds?.has(attachment.id) ?? false,
  };
}

function mapManualAssetToLibraryItem(
  user: LibraryUser,
  asset: RawManualLibraryAsset,
  favoritedAssetIds?: ReadonlySet<string>,
): LibraryItemRecord {
  const categoryLabel = getManualLibraryCategoryLabel(asset.category);
  const isFinance = asset.category === "QUOTATION_INVOICE" || isFinanceLibraryFile(asset.assetName);
  const createdByName =
    asset.createdByName?.trim() || getLibraryUserDisplayName(asset.uploadedBy);
  const assetTags = mapAssetTagAssignments(asset.assetTags);

  return {
    id: asset.id,
    source: "MANUAL_LIBRARY_ASSET",
    fileName: asset.assetName,
    projectId: asset.category ? `manual-library-${asset.category}` : "manual-library",
    projectName: categoryLabel,
    projectTag: null,
    projectTags: [],
    assetTags,
    uploadedAt: formatLibraryDate(asset.uploadedAt),
    uploadedAtValue: asset.uploadedAt.toISOString(),
    createdBy: createdByName,
    createdById: asset.uploadedById,
    createdByEmail: asset.uploadedBy.email,
    type: getLibraryTypeLabel(asset.assetName, asset.mimeType),
    quickCategory: isFinance ? "Quotations/Invoices" : "Project Assets",
    mimeType: asset.mimeType,
    previewPath: `/api/library/manual-assets/${asset.id}/preview`,
    downloadPath: `/api/library/manual-assets/${asset.id}/download`,
    canDelete: canDeleteManualLibraryAsset(user, asset.uploadedById),
    isFavoritedByCurrentUser: favoritedAssetIds?.has(asset.id) ?? false,
  };
}

function applyDateFilter(
  items: LibraryItemRecord[],
  dateFilter: LibraryDateFilter,
) {
  if (dateFilter === "all") {
    return items;
  }

  const now = new Date();
  const start = new Date(now);

  switch (dateFilter) {
    case "today":
      start.setHours(0, 0, 0, 0);
      break;
    case "last7":
      start.setDate(now.getDate() - 7);
      break;
    case "last30":
      start.setDate(now.getDate() - 30);
      break;
  }

  return items.filter((item) => new Date(item.uploadedAtValue) >= start);
}

function applyLibraryFilters(
  items: LibraryItemRecord[],
  input: Required<
    Pick<
      LibraryQueryInput,
      | "search"
      | "projectId"
      | "createdById"
      | "assetTagId"
      | "date"
      | "type"
      | "quickMenu"
    >
  >,
) {
  const search = input.search.trim().toLowerCase();
  let filteredItems = [...items];

  if (input.quickMenu === "assets") {
    filteredItems = filteredItems.filter(
      (item) => item.quickCategory === "Project Assets",
    );
  }

  if (input.quickMenu === "finance") {
    filteredItems = filteredItems.filter(
      (item) => item.quickCategory === "Quotations/Invoices",
    );
  }

  if (input.quickMenu === "favourites") {
    filteredItems = filteredItems.filter((item) => item.isFavoritedByCurrentUser);
  }

  filteredItems = applyDateFilter(filteredItems, input.date);

  if (input.projectId) {
    filteredItems = filteredItems.filter((item) => item.projectId === input.projectId);
  }

  if (input.createdById) {
    filteredItems = filteredItems.filter((item) => item.createdById === input.createdById);
  }

  if (input.type !== "All Types") {
    filteredItems = filteredItems.filter((item) => item.type === input.type);
  }

  if (search) {
    filteredItems = filteredItems.filter((item) =>
      [
        item.fileName,
        item.projectName,
        item.projectTag ?? "",
        ...item.projectTags,
        ...item.assetTags.map((tag) => tag.name),
        item.createdBy,
        item.createdByEmail,
        item.type,
        item.quickCategory,
      ]
        .join(" ")
        .toLowerCase()
        .includes(search),
    );
  }

  if (input.assetTagId) {
    filteredItems = filteredItems.filter((item) =>
      item.assetTags.some((tag) => tag.id === input.assetTagId),
    );
  }

  return filteredItems;
}

async function getAccessibleLibraryAttachments(user: LibraryUser) {
  const isAdminUser =
    user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN;

  const attachments = await withPrismaRetry(() =>
    prisma.projectAttachment.findMany({
      where: {
        status: AttachmentStatus.READY,
        assetType: {
          in: [...libraryAssetTypes],
        },
        archivedFiles: {
          none: {},
        },
        ...(isAdminUser
          ? {}
          : {
              OR: [
                {
                  project: {
                    createdById: user.id,
                  },
                },
                {
                  project: {
                    executors: {
                      some: {
                        userId: user.id,
                      },
                    },
                  },
                },
                {
                  project: {
                    collaborators: {
                      some: {
                        userId: user.id,
                      },
                    },
                  },
                },
              ],
            }),
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        projectId: true,
        originalFileName: true,
        mimeType: true,
        createdAt: true,
        uploadedById: true,
        assetType: true,
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
        uploadedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        project: {
          select: {
            id: true,
            name: true,
            tags: {
              include: {
                tag: {
                  select: {
                    name: true,
                  },
                },
              },
            },
            createdById: true,
            executors: {
              select: {
                userId: true,
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
  );

  return attachments.filter((attachment) => isAttachmentVisibleToUser(user, attachment));
}

async function getAccessibleManualLibraryAssets() {
  return withPrismaRetry(() =>
    prisma.manualLibraryAsset.findMany({
      where: {
        status: AttachmentStatus.READY,
      },
      orderBy: {
        uploadedAt: "desc",
      },
      select: manualLibraryAssetLibraryItemSelect,
    }),
  );
}

export async function getLibraryPageDataForUser(
  user: LibraryUser,
  input: LibraryQueryInput = {},
): Promise<LibraryPageData> {
  const totalStartedAt = getDevTimingNow();

  if (!hasPermission(user, "library.view")) {
    throw new Error("You do not have permission to view the library.");
  }

  if (
    (input.search ||
      input.projectId ||
      input.createdById ||
      input.date ||
      input.type ||
      input.quickMenu) &&
    !hasPermission(user, "library.filter")
  ) {
    throw new Error("You do not have permission to filter library files.");
  }

  const pageSize = clampPageSize(input.pageSize);
  const [rawAttachments, manualAssets] = await Promise.all([
    timeDevAsync("[library:list]", "project attachment query", () =>
      getAccessibleLibraryAttachments(user),
    ),
    timeDevAsync("[library:list]", "manual library asset query", () =>
      getAccessibleManualLibraryAssets(),
    ),
  ]);
  logDevTiming("[library:list]", "library list candidates", {
    projectAttachments: rawAttachments.length,
    manualAssets: manualAssets.length,
  });

  const [favoritedAttachmentIds, favoritedManualAssetIds] = await Promise.all([
    timeDevAsync(
      "[library:list]",
      "attachment favorites query",
      () =>
        getFavoriteAttachmentIdSetForUser(
          user.id,
          rawAttachments.map((attachment) => attachment.id),
        ),
      { candidateCount: rawAttachments.length },
    ),
    timeDevAsync(
      "[library:list]",
      "manual favorites query",
      () =>
        getFavoriteManualLibraryAssetIdSetForUser(
          user.id,
          manualAssets.map((asset) => asset.id),
        ),
      { candidateCount: manualAssets.length },
    ),
  ]);
  const mapStartedAt = getDevTimingNow();
  const visibleItems = [
    ...rawAttachments.map((attachment) =>
      mapAttachmentToLibraryItem(user, attachment, favoritedAttachmentIds),
    ),
    ...manualAssets.map((asset) =>
      mapManualAssetToLibraryItem(user, asset, favoritedManualAssetIds),
    ),
  ].sort(
    (left, right) =>
      new Date(right.uploadedAtValue).getTime() -
      new Date(left.uploadedAtValue).getTime(),
  );
  logDevTiming("[library:list]", "library map/sort", {
    durationMs: getDevTimingDurationMs(mapStartedAt),
    visibleItems: visibleItems.length,
  });

  const countsStartedAt = getDevTimingNow();
  const counts: LibraryQuickMenuCounts = {
    projectAssets: visibleItems.filter(
      (item) => item.quickCategory === "Project Assets",
    ).length,
    quotationsAndInvoices: visibleItems.filter(
      (item) => item.quickCategory === "Quotations/Invoices",
    ).length,
    fromUsers: new Set(visibleItems.map((item) => item.createdById)).size,
    favourites: visibleItems.filter((item) => item.isFavoritedByCurrentUser).length,
  };
  logDevTiming("[library:list]", "library counts", {
    durationMs: getDevTimingDurationMs(countsStartedAt),
  });

  const filtersStartedAt = getDevTimingNow();
  const filters = {
    projects: Array.from(
      new Map(
        visibleItems
          .map((item) => [item.projectId, { id: item.projectId, label: item.projectName }] as const)
          .sort((left, right) => left[1].label.localeCompare(right[1].label)),
      ).values(),
    ),
    createdBy: Array.from(
      new Map(
        visibleItems
          .map((item) => [
            item.createdById,
            {
              id: item.createdById,
              label: item.createdByEmail
                ? `${item.createdBy} (${item.createdByEmail})`
                : item.createdBy,
            },
          ] as const)
          .sort((left, right) => left[1].label.localeCompare(right[1].label)),
      ).values(),
    ),
    assetTags: Array.from(
      new Map(
        visibleItems
          .flatMap((item) =>
            item.assetTags.map((tag) => [tag.id, { id: tag.id, label: tag.name }] as const),
          )
          .sort((left, right) => left[1].label.localeCompare(right[1].label)),
      ).values(),
    ),
  };
  logDevTiming("[library:list]", "library filters", {
    durationMs: getDevTimingDurationMs(filtersStartedAt),
    projects: filters.projects.length,
    createdBy: filters.createdBy.length,
    assetTags: filters.assetTags.length,
  });

  const filterStartedAt = getDevTimingNow();
  const filteredItems = applyLibraryFilters(visibleItems, {
    search: input.search?.trim() ?? "",
    projectId: input.projectId?.trim() ?? "",
    createdById: input.createdById?.trim() ?? "",
    assetTagId: input.assetTagId?.trim() ?? "",
    date: input.date ?? "all",
    type: input.type ?? "All Types",
    quickMenu: input.quickMenu ?? "assets",
  });
  logDevTiming("[library:list]", "library filter apply", {
    durationMs: getDevTimingDurationMs(filterStartedAt),
    filteredItems: filteredItems.length,
  });

  const total = filteredItems.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(clampPage(input.page), totalPages);
  const startIndex = (page - 1) * pageSize;
  const pageItems = filteredItems.slice(startIndex, startIndex + pageSize);
  logDevTiming("[library:list]", "recent files query", {
    durationMs: 0,
    page,
    pageSize,
    returnedItems: pageItems.length,
  });
  logDevTiming("[library:list]", "library data total", {
    durationMs: getDevTimingDurationMs(totalStartedAt),
    total,
    page,
    pageSize,
  });

  return {
    items: pageItems,
    counts,
    filters,
    page,
    pageSize,
    total,
    totalPages,
  };
}

export async function requestManualLibraryAssetUpload(
  user: LibraryUser,
  input: RequestManualLibraryAssetUploadInput,
) {
  const totalStartedAt = getDevTimingNow();

  if (!canUploadLibraryAssets(user)) {
    return { error: "You do not have permission to upload library assets." } as const;
  }

  if (!input.originalFileName.trim()) {
    return { error: "Choose a file to upload." } as const;
  }

  if (!input.assetName.trim()) {
    return { error: "Asset name is required." } as const;
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

  let assetName: string;

  try {
    assetName = resolveManualLibraryAssetName(input.assetName, input.originalFileName);
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Library asset metadata is invalid.",
    } as const;
  }

  const tagSelection = await timeDevAsync(
    "[library:upload-url]",
    "tag validation query",
    () => validateActiveAssetTagIds(input.assetTagIds ?? []),
    { requestedTagCount: input.assetTagIds?.length ?? 0 },
  );

  if (tagSelection.error) {
    return { error: tagSelection.error } as const;
  }

  const category = parseManualLibraryCategory(input.category);
  const bucket = getS3BucketName();
  const storageKey = buildManualLibraryAssetKey(user.id, input.originalFileName);
  const endpointMode =
    input.uploadEndpointMode ?? getDefaultS3UploadEndpointMode();
  const uploadTarget = await timeDevAsync(
    "[library:upload-url]",
    "signed URL time",
    () =>
      createPresignedUploadTarget({
        bucket,
        storageKey,
        mimeType: input.mimeType,
        endpointMode,
      }),
    {
      region: getS3Region(),
      endpointMode,
      transferAcceleration: endpointMode === "accelerate",
      expiresInSeconds: 60 * 10,
    },
  );
  logDevTiming("[library:upload-url]", "upload target", {
    fileSize: input.fileSize,
    contentType: input.mimeType,
    uploadHost: uploadTarget.uploadHost,
    region: uploadTarget.region,
    endpointMode: uploadTarget.endpointMode,
    transferAcceleration: uploadTarget.endpointMode === "accelerate",
    expiresInSeconds: uploadTarget.expiresInSeconds,
    expectedHeaders: uploadTarget.expectedHeaders,
  });

  logDevTiming("[library:upload-url]", "total", {
    durationMs: getDevTimingDurationMs(totalStartedAt),
    fileSize: input.fileSize,
    assetTagCount: tagSelection.tagIds.length,
    region: getS3Region(),
    endpointMode: uploadTarget.endpointMode,
    transferAcceleration: uploadTarget.endpointMode === "accelerate",
    uploadHost: uploadTarget.uploadHost,
  });

  return {
    storageKey,
    assetName,
    originalFileName: input.originalFileName.trim(),
    mimeType: input.mimeType,
    fileSize: input.fileSize,
    category,
    uploadUrl: uploadTarget.uploadUrl,
    uploadHost: uploadTarget.uploadHost,
    uploadEndpointMode: uploadTarget.endpointMode,
    uploadRegion: uploadTarget.region,
    uploadExpiresInSeconds: uploadTarget.expiresInSeconds,
    uploadExpectedHeaders: uploadTarget.expectedHeaders,
  };
}

export async function createCompletedManualLibraryAssetFromUpload(
  user: LibraryUser,
  input: CompleteManualLibraryAssetUploadInput,
): Promise<LibraryItemRecord> {
  const totalStartedAt = getDevTimingNow();

  if (!canUploadLibraryAssets(user)) {
    throw new Error("You do not have permission to upload library assets.");
  }

  if (!input.storageKey.startsWith(`library/manual/${user.id}/`)) {
    throw new Error("Library upload storage key is invalid.");
  }

  if (!input.originalFileName.trim()) {
    throw new Error("Choose a file to upload.");
  }

  if (!input.assetName.trim()) {
    throw new Error("Asset name is required.");
  }

  if (!isAllowedAssetFile(input.originalFileName)) {
    throw new Error("This file type is not allowed for Library uploads.");
  }

  if (!Number.isFinite(input.fileSize) || input.fileSize <= 0) {
    throw new Error("File size is invalid.");
  }

  if (input.fileSize > getMaxAssetUploadBytes()) {
    throw new Error("This file exceeds the allowed size limit.");
  }

  const assetName = resolveManualLibraryAssetName(
    input.assetName,
    input.originalFileName,
  );
  const tagSelection = await timeDevAsync(
    "[library:upload-complete]",
    "tag validation query",
    () => validateActiveAssetTagIds(input.assetTagIds ?? []),
    { requestedTagCount: input.assetTagIds?.length ?? 0 },
  );

  if (tagSelection.error) {
    throw new Error(tagSelection.error);
  }

  const bucket = getS3BucketName();
  const headStartedAt = getDevTimingNow();
  const objectMetadata = await getObjectMetadata(input.storageKey, bucket);
  logDevTiming("[library:upload-complete]", "S3 head object time", {
    durationMs: getDevTimingDurationMs(headStartedAt),
    contentLength: objectMetadata.ContentLength,
    contentType: objectMetadata.ContentType,
  });

  if (
    typeof objectMetadata.ContentLength === "number" &&
    objectMetadata.ContentLength !== input.fileSize
  ) {
    throw new Error("Uploaded file size does not match the requested upload.");
  }

  const category = parseManualLibraryCategory(input.category);

  try {
    return await withPrismaRetry(() =>
      prisma.$transaction(async (tx) => {
        const existingStartedAt = getDevTimingNow();
        const existingAsset = await tx.manualLibraryAsset.findUnique({
          where: {
            storageKey: input.storageKey,
          },
          select: manualLibraryAssetLibraryItemSelect,
        });
        logDevTiming("[library:upload-complete]", "existing asset lookup time", {
          durationMs: getDevTimingDurationMs(existingStartedAt),
        });

        if (existingAsset) {
          if (existingAsset.uploadedById !== user.id) {
            throw new Error("Library upload storage key is already in use.");
          }

          return mapManualAssetToLibraryItem(user, existingAsset, new Set());
        }

        const assetInsertStartedAt = getDevTimingNow();
        const createdAsset = await tx.manualLibraryAsset.create({
          data: {
            assetName,
            originalFileName: input.originalFileName.trim(),
            createdByName: normalizeOptionalLibraryText(input.createdByName),
            description: normalizeOptionalLibraryText(input.description),
            category,
            mimeType: input.mimeType,
            fileSize: input.fileSize,
            bucket,
            storageKey: input.storageKey,
            status: AttachmentStatus.READY,
            uploadedById: user.id,
            uploadedAt: new Date(),
          },
          select: manualLibraryAssetLibraryItemSelect,
        });
        logDevTiming("[library:upload-complete]", "DB insert time", {
          durationMs: getDevTimingDurationMs(assetInsertStartedAt),
        });

        const tagInsertStartedAt = getDevTimingNow();
        if (tagSelection.tagIds.length > 0) {
          await tx.manualLibraryAssetTagAssignment.createMany({
            data: tagSelection.tagIds.map((tagId) => ({
              assetId: createdAsset.id,
              tagId,
            })),
          });
        }
        logDevTiming("[library:upload-complete]", "tag relation insert time", {
          durationMs: getDevTimingDurationMs(tagInsertStartedAt),
          tagCount: tagSelection.tagIds.length,
        });

        const createdAssetWithTags = await tx.manualLibraryAsset.findUniqueOrThrow({
          where: {
            id: createdAsset.id,
          },
          select: manualLibraryAssetLibraryItemSelect,
        });

        return mapManualAssetToLibraryItem(user, createdAssetWithTags, new Set());
      }),
    );
  } finally {
    logDevTiming("[library:upload-complete]", "create completed asset total", {
      durationMs: getDevTimingDurationMs(totalStartedAt),
      fileSize: input.fileSize,
      assetTagCount: tagSelection.tagIds.length,
    });
  }
}

export async function completeManualLibraryAssetUpload(
  user: LibraryUser,
  assetId: string,
  failed = false,
): Promise<LibraryItemRecord | null> {
  const totalStartedAt = getDevTimingNow();

  if (!canUploadLibraryAssets(user)) {
    throw new Error("You do not have permission to upload library assets.");
  }

  try {
    return await withPrismaRetry(() =>
      prisma.$transaction(async (tx) => {
        const lookupStartedAt = getDevTimingNow();
        const asset = await tx.manualLibraryAsset.findUnique({
          where: {
            id: assetId,
          },
          select: {
            id: true,
            uploadedById: true,
            status: true,
          },
        });
        logDevTiming("[library:upload-complete]", "DB lookup time", {
          durationMs: getDevTimingDurationMs(lookupStartedAt),
        });

        if (!asset) {
          throw new Error("Library asset upload not found.");
        }

        if (asset.uploadedById !== user.id) {
          throw new Error("Only the uploader can complete this library upload.");
        }

        if (asset.status === AttachmentStatus.READY) {
          logDevTiming("[library:upload-complete]", "DB update skipped", {
            reason: "Asset is already ready.",
          });
          if (failed) {
            return null;
          }

          const readyAsset = await tx.manualLibraryAsset.findUnique({
            where: {
              id: asset.id,
            },
            select: manualLibraryAssetLibraryItemSelect,
          });

          return readyAsset
            ? mapManualAssetToLibraryItem(user, readyAsset, new Set())
            : null;
        }

        if (asset.status !== AttachmentStatus.UPLOADING) {
          throw new Error("Library asset upload is not active.");
        }

        const updateStartedAt = getDevTimingNow();
        if (failed) {
          await tx.manualLibraryAsset.update({
            where: {
              id: asset.id,
            },
            data: {
              status: AttachmentStatus.FAILED,
            },
            select: {
              id: true,
            },
          });
          logDevTiming("[library:upload-complete]", "DB update time", {
            durationMs: getDevTimingDurationMs(updateStartedAt),
            failed,
          });
          return null;
        }

        const updatedAsset = await tx.manualLibraryAsset.update({
          where: {
            id: asset.id,
          },
          data: {
            status: AttachmentStatus.READY,
            uploadedAt: new Date(),
          },
          select: manualLibraryAssetLibraryItemSelect,
        });
        logDevTiming("[library:upload-complete]", "DB update time", {
          durationMs: getDevTimingDurationMs(updateStartedAt),
          failed,
        });

        return mapManualAssetToLibraryItem(user, updatedAsset, new Set());
      }),
    );
  } finally {
    logDevTiming("[library:upload-complete]", "DB complete total", {
      durationMs: getDevTimingDurationMs(totalStartedAt),
      failed,
    });
  }
}

export async function deleteLibraryAttachmentForUser(
  user: LibraryUser,
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
        archivedFiles: {
          select: {
            id: true,
          },
          take: 1,
        },
        project: {
          select: {
            createdById: true,
          },
        },
      },
    }),
  );

  if (!attachment || attachment.status === AttachmentStatus.DELETED) {
    throw new Error("File not found.");
  }

  if (attachment.archivedFiles.length > 0) {
    throw new Error("Archived files cannot be deleted from the library.");
  }

  if (!canDeleteLibraryAttachment(user, attachment.project.createdById)) {
    throw new Error("You do not have permission to delete this file.");
  }

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

  return {
    projectId: attachment.projectId,
  };
}

export async function getManualLibraryAssetDownloadUrlForUser(
  user: LibraryUser,
  assetId: string,
) {
  if (!canViewLibrary(user)) {
    throw new Error("You do not have permission to download library files.");
  }

  const asset = await withPrismaRetry(() =>
    prisma.manualLibraryAsset.findUnique({
      where: {
        id: assetId,
      },
      select: {
        assetName: true,
        mimeType: true,
        bucket: true,
        storageKey: true,
        status: true,
      },
    }),
  );

  if (!asset || asset.status !== AttachmentStatus.READY) {
    throw new Error("Library asset not found.");
  }

  return createPresignedDownloadUrl({
    bucket: asset.bucket,
    storageKey: asset.storageKey,
    fileName: asset.assetName,
    mimeType: asset.mimeType,
  });
}

export async function getManualLibraryAssetPreviewUrlForUser(
  user: LibraryUser,
  assetId: string,
) {
  if (!canViewLibrary(user)) {
    throw new Error("You do not have permission to preview library files.");
  }

  const asset = await withPrismaRetry(() =>
    prisma.manualLibraryAsset.findUnique({
      where: {
        id: assetId,
      },
      select: {
        assetName: true,
        mimeType: true,
        bucket: true,
        storageKey: true,
        status: true,
      },
    }),
  );

  if (!asset || asset.status !== AttachmentStatus.READY) {
    throw new Error("Library asset not found.");
  }

  return createPresignedPreviewUrl({
    bucket: asset.bucket,
    storageKey: asset.storageKey,
    fileName: asset.assetName,
    mimeType: asset.mimeType,
  });
}

export async function deleteManualLibraryAssetForUser(
  user: LibraryUser,
  assetId: string,
) {
  const asset = await withPrismaRetry(() =>
    prisma.manualLibraryAsset.findUnique({
      where: {
        id: assetId,
      },
      select: {
        id: true,
        bucket: true,
        storageKey: true,
        status: true,
        uploadedById: true,
      },
    }),
  );

  if (!asset || asset.status === AttachmentStatus.DELETED) {
    throw new Error("Library asset not found.");
  }

  if (!canDeleteManualLibraryAsset(user, asset.uploadedById)) {
    throw new Error("You do not have permission to delete this file.");
  }

  await deleteObjectIfNeeded(asset.storageKey, asset.bucket).catch(() => undefined);

  await withPrismaRetry(() =>
    prisma.manualLibraryAsset.update({
      where: {
        id: asset.id,
      },
      data: {
        status: AttachmentStatus.DELETED,
      },
    }),
  );
}
