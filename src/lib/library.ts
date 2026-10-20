import { runLibraryOperation } from "@/lib/authorization/library";
import { canLibrary, manualLibraryWhere, libraryAssetTypes } from "@/lib/authorization/library-rules";
import { deletableLibraryAttachmentWhere, readableLibraryAttachment } from "@/lib/authorization/library-policies";
import { refreshProjectReader } from "@/lib/authorization/project-read";
import { canReadFullProject, projectReadActor, structuredProjectReadWhere } from "@/lib/authorization/project-read-rules";
import {
  AttachmentAssetType,
  AttachmentStatus,
  type ProjectWorkflowStageKey,
  type User,
} from "@prisma/client";

import {
  mapAssetTagAssignments,
  validateActiveAssetTagIds,
  type AssetTagAssignmentRecord,
} from "@/lib/asset-tags";
import {
  getDevTimingDurationMs,
  getDevTimingNow,
  logDevTiming,
  timeDevAsync,
} from "@/lib/dev-timing";
import { getFavoriteAttachmentIdSetForUser } from "@/lib/file-favorite-queries";
import { canUploadLibraryAssets } from "@/lib/library-access";
import {
  type LibraryDateFilter,
  type LibraryItemRecord,
  type LibraryPageData,
  type LibraryUploadCategory,
  type LibraryQueryInput,
  type LibraryQuickMenuCounts,
  libraryUploadCategoryOptions,
} from "@/lib/library-shared";
import { getFavoriteManualLibraryAssetIdSetForUser } from "@/lib/manual-library-asset-favorites";
import {
  hasPermission,
  type PermissionUser,
} from "@/lib/permissions/resolver";
import { prisma, withPrismaRetry } from "@/lib/prisma";
import { sanitizeRichText } from "@/lib/rich-text";
import {
  buildManualLibraryAssetKey,
  createPresignedDownloadUrl,
  createPresignedPreviewUrl,
  createPresignedUploadTarget,
  copyStoredObject,
  getFileExtension,
  getMaxAssetUploadBytes,
  getDefaultS3UploadEndpointMode,
  getObjectMetadata,
  getS3BucketName,
  getS3Region,
  type S3UploadEndpointMode,
} from "@/lib/storage/s3";
import {
  PROJECT_ASSET_ALLOWED_EXTENSIONS,
  buildFileTypeNotAllowedPayload,
  isAllowedAssetFile,
} from "@/lib/upload-validation";

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
  stageId: string | null;
  originalFileName: string;
  mimeType: string;
  createdAt: Date;
  uploadedById: string;
  assetType: AttachmentAssetType;
  stage: {
    conceptFolder: {
      id: string;
      projectId: string;
      taskerStageId: string;
      workflowStageKey: ProjectWorkflowStageKey;
      assignedExecutorId: string | null;
    } | null;
  } | null;
  assetTags: AssetTagAssignmentRecord[];
  project: {
    id: string;
    name: string;
    tags?: Array<{
      tag: {
        name: string;
      };
    }>;
    ownerId: string | null;
    coOwners: Array<{ userId: string }>;
    executors: Array<{
      userId: string;
    }>;
    collaborators: Array<{
      userId: string;
      canDownloadFiles: boolean;
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

function mapAttachmentToLibraryItem(
  user: LibraryUser,
  attachment: RawLibraryAttachment & { deletable?: boolean },
  favoritedAttachmentIds?: ReadonlySet<string>,
): LibraryItemRecord {
  const isStageInvoice = attachment.assetType === AttachmentAssetType.STAGE_INVOICE;
  const type = isStageInvoice
    ? "Invoice/Quotation"
    : getLibraryTypeLabel(attachment.originalFileName, attachment.mimeType);
  const isFinance = isStageInvoice || isFinanceLibraryFile(attachment.originalFileName);
  const projectTags = canReadFullProject(user, attachment.project) ? getLibraryProjectTagNames(attachment.project) : [];
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
    previewPath: `/api/library/attachments/${attachment.id}/preview`,
    downloadPath: `/api/library/attachments/${attachment.id}/download`,
    canDownload: canLibrary(user, "library.download"),
    canFavorite: canLibrary(user, "library.favorite"),
    canDelete: canLibrary(user, "library.delete") && attachment.deletable === true,
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
    canDownload: canLibrary(user, "library.download"),
    canFavorite: canLibrary(user, "library.favorite"),
    canDelete: canLibrary(user, "library.delete"),
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
  user = await refreshProjectReader(user);


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
        project: { is: structuredProjectReadWhere(projectReadActor(user)) },
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        projectId: true,
        stageId: true,
        originalFileName: true,
        mimeType: true,
        createdAt: true,
        uploadedById: true,
        assetType: true,
        stage: {
          select: {
            conceptFolder: {
              select: {
                id: true,
                projectId: true,
                taskerStageId: true,
                workflowStageKey: true,
                assignedExecutorId: true,
              },
            },
          },
        },
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
            ownerId: true,
            coOwners: { select: { userId: true } },
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
                canDownloadFiles: true,
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

  const actor = projectReadActor(user);
  if (!actor) return [];
  const deletable = canLibrary(user, "library.delete") ? await prisma.projectAttachment.findMany({
    where: { AND: [{ id: { in: attachments.map(row => row.id) } }, deletableLibraryAttachmentWhere] }, select: { id: true },
  }) : [];
  const deletableIds = new Set(deletable.map(row => row.id));
  return (await Promise.all(attachments.map(async attachment => await readableLibraryAttachment(prisma, actor, attachment.id)
    ? { ...attachment, deletable: deletableIds.has(attachment.id) } : null))).filter(attachment => attachment !== null);
}

async function getAccessibleManualLibraryAssets(user: LibraryUser) {
  return withPrismaRetry(() =>
    prisma.manualLibraryAsset.findMany({
      where: manualLibraryWhere(projectReadActor(user)),
      orderBy: {
        uploadedAt: "desc",
      },
      select: manualLibraryAssetLibraryItemSelect,
    }),
  );
}

async function getLibraryPageDataForUserImplementation(
  user: LibraryUser,
  input: LibraryQueryInput = {},
): Promise<LibraryPageData> {
  user = await refreshProjectReader(user);

  const totalStartedAt = getDevTimingNow();

  if (!hasPermission(user, "library.view")) {
    throw new Error("You do not have permission to view the library.");
  }

  if (
    (input.search ||
      input.projectId ||
      input.createdById ||
      input.assetTagId ||
      (input.date && input.date !== "all") ||
      (input.type && input.type !== "All Types") ||
      (input.quickMenu && input.quickMenu !== "assets")) &&
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
      getAccessibleManualLibraryAssets(user),
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

async function requestManualLibraryAssetUploadImplementation(
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
  await runLibraryOperation(user, "library.editMetadata", "root", async () => undefined);
  await runLibraryOperation(user, "library.manageTags", "root", async () => undefined);
  const intent = await prisma.manualLibraryAsset.create({ data: {
    assetName, originalFileName: input.originalFileName.trim(),
    createdByName: normalizeOptionalLibraryText(input.createdByName),
    description: sanitizeRichText(input.description) || null, category,
    mimeType: input.mimeType, fileSize: input.fileSize, bucket, storageKey,
    status: AttachmentStatus.UPLOADING, uploadedById: user.id,
    assetTags: { create: tagSelection.tagIds.map(tagId => ({ tagId })) },
  }, select: { id: true } });
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
    assetId: intent.id,
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
  user: LibraryUser, input: CompleteManualLibraryAssetUploadInput,
): Promise<LibraryItemRecord> {
  return runLibraryOperation(user, "library.upload", "root", async trusted => {
    const intent = await prisma.manualLibraryAsset.findFirst({ where: { uploadedById: trusted.id,
      storageKey: { in: [input.storageKey, `${input.storageKey}.sealed`] } }, include: { assetTags: true } });
    if (!intent || intent.assetName !== resolveManualLibraryAssetName(input.assetName, input.originalFileName) ||
      intent.originalFileName !== input.originalFileName.trim() || intent.fileSize !== input.fileSize || intent.mimeType !== input.mimeType ||
      intent.category !== parseManualLibraryCategory(input.category) ||
      intent.createdByName !== normalizeOptionalLibraryText(input.createdByName) ||
      intent.description !== (sanitizeRichText(input.description) || null) ||
      JSON.stringify(intent.assetTags.map(row => row.tagId).sort()) !== JSON.stringify([...new Set(input.assetTagIds ?? [])].sort())) {
      throw new Error("Library upload intent or metadata does not match.");
    }
    const asset = await completeManualLibraryAssetUpload(trusted, intent.id);
    if (!asset) throw new Error("Library upload did not complete.");
    return asset;
  });
}

export async function completeManualLibraryAssetUpload(
  user: LibraryUser, assetId: string, failed = false,
): Promise<LibraryItemRecord | null> {
  return runLibraryOperation(user, "library.upload", `upload:${assetId}`, async trusted => {
    const intent = await prisma.manualLibraryAsset.findUniqueOrThrow({ where: { id: assetId } });
    if (intent.status === AttachmentStatus.READY) {
      const asset = await prisma.manualLibraryAsset.findUniqueOrThrow({ where: { id: assetId }, select: manualLibraryAssetLibraryItemSelect });
      return mapManualAssetToLibraryItem(trusted, asset, new Set());
    }
    if (failed) {
      await prisma.manualLibraryAsset.update({ where: { id: assetId }, data: { status: AttachmentStatus.FAILED } });
      return null;
    }
    if (Date.now() - intent.createdAt.getTime() > 30 * 60_000 ||
      !intent.storageKey.startsWith(`library/manual/${trusted.id}/`) || intent.storageKey.endsWith(".sealed")) {
      throw new Error("Library upload intent has expired or is invalid.");
    }
    const metadata = await getObjectMetadata(intent.storageKey, intent.bucket);
    if (metadata.ContentLength !== intent.fileSize || metadata.ContentType !== intent.mimeType || !metadata.ETag) {
      throw new Error("Uploaded object does not match the issued upload intent.");
    }
    // A still-valid PUT URL must never be able to overwrite a finalized asset.
    const sealedKey = `${intent.storageKey}.sealed`;
    await copyStoredObject({ sourceBucket: intent.bucket, sourceKey: intent.storageKey,
      bucket: intent.bucket, storageKey: sealedKey, sourceETag: metadata.ETag });
    const asset = await prisma.manualLibraryAsset.update({ where: { id: assetId },
      data: { storageKey: sealedKey, status: AttachmentStatus.READY, uploadedAt: new Date() }, select: manualLibraryAssetLibraryItemSelect });
    return mapManualAssetToLibraryItem(trusted, asset, new Set());
  });
}

export async function deleteLibraryAttachmentForUser(user: LibraryUser, attachmentId: string) {
  return runLibraryOperation(user, "library.delete", `attachment:${attachmentId}`, async () => {
    const file = await prisma.projectAttachment.update({ where: { id: attachmentId }, data: { status: AttachmentStatus.DELETED }, select: { projectId: true } });
    // Retain the object and reference/history rows. Library removal is a soft delete.
    return file;
  });
}

export async function getManualLibraryAssetDownloadUrlForUser(user: LibraryUser, assetId: string) {
  return runLibraryOperation(user, "library.download", `manual:${assetId}`, async () => {
    const asset = await prisma.manualLibraryAsset.findUniqueOrThrow({ where: { id: assetId } });
    return createPresignedDownloadUrl({ bucket: asset.bucket, storageKey: asset.storageKey, fileName: asset.assetName, mimeType: asset.mimeType });
  });
}

export async function getManualLibraryAssetPreviewUrlForUser(user: LibraryUser, assetId: string) {
  return runLibraryOperation(user, "library.view", `manual:${assetId}`, async () => {
    const asset = await prisma.manualLibraryAsset.findUniqueOrThrow({ where: { id: assetId } });
    return createPresignedPreviewUrl({ bucket: asset.bucket, storageKey: asset.storageKey, fileName: asset.assetName, mimeType: asset.mimeType });
  });
}

export async function deleteManualLibraryAssetForUser(user: LibraryUser, assetId: string) {
  return runLibraryOperation(user, "library.delete", `manual:${assetId}`, async () => {
    await prisma.manualLibraryAsset.update({ where: { id: assetId }, data: { status: AttachmentStatus.DELETED } });
  });
}

export async function getLibraryAttachmentUrlForUser(user: LibraryUser, attachmentId: string, preview = false) {
  return runLibraryOperation(user, preview ? "library.view" : "library.download", `attachment:${attachmentId}`, async trusted =>
    runLibraryOperation(trusted, "library.accessProjectFile", `attachment:${attachmentId}`, async () => {
      const file = await prisma.projectAttachment.findUniqueOrThrow({ where: { id: attachmentId } });
      return (preview ? createPresignedPreviewUrl : createPresignedDownloadUrl)({ bucket: file.bucket,
        storageKey: file.storageKey, fileName: file.originalFileName, mimeType: file.mimeType });
    }));
}

export async function setLibraryAttachmentFavorite(user: LibraryUser, attachmentId: string, favorite: boolean) {
  return runLibraryOperation(user, "library.favorite", `attachment:${attachmentId}`, async trusted => {
    if (favorite) await prisma.fileFavorite.upsert({ where: { userId_attachmentId: { userId: trusted.id, attachmentId } },
      create: { userId: trusted.id, attachmentId }, update: {} });
    else await prisma.fileFavorite.deleteMany({ where: { userId: trusted.id, attachmentId } });
    return { attachmentId, isFavoritedByCurrentUser: favorite };
  });
}

export async function getLibraryPageDataForUser(user: LibraryUser, input: LibraryQueryInput = {}) {
  return runLibraryOperation(user, "library.view", "root", trusted => getLibraryPageDataForUserImplementation(trusted, input));
}

export async function requestManualLibraryAssetUpload(user: LibraryUser, input: RequestManualLibraryAssetUploadInput) {
  return runLibraryOperation(user, "library.upload", "root", trusted => requestManualLibraryAssetUploadImplementation(trusted, input));
}
