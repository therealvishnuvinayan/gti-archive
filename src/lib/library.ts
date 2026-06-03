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
import { buildAccessibleProjectsWhere, type ProjectAccessUser } from "@/lib/projects";
import { getFavoriteAttachmentIdSetForUser } from "@/lib/file-favorite-queries";
import {
  hasPermission,
  type PermissionUser,
} from "@/lib/permissions/resolver";
import { prisma, withPrismaRetry } from "@/lib/prisma";
import { deleteObjectIfNeeded, getFileExtension } from "@/lib/storage/s3";
import { canUploadLibraryAssets, canViewLibrary } from "@/lib/library-access";
import {
  type LibraryDateFilter,
  type LibraryItemRecord,
  type LibraryPageData,
  type LibraryUploadProjectOption,
  type LibraryQueryInput,
  type LibraryQuickMenuCounts,
} from "@/lib/library-shared";

const libraryAssetTypes = [
  AttachmentAssetType.GENERAL_PROJECT_ASSET,
  AttachmentAssetType.COMMENT_ATTACHMENT,
  AttachmentAssetType.STAGE_SUBMISSION,
  AttachmentAssetType.REVISION_ORIGINAL,
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
  "id" | "role" | "name" | "email" | "libraryAccess" | "projectAccess"
> &
  PermissionUser;
type LibraryUploadUser = Pick<
  User,
  "id" | "role" | "name" | "email" | "libraryAccess" | "projectAccess"
>;

type RawLibraryAttachment = {
  id: string;
  projectId: string;
  originalFileName: string;
  mimeType: string;
  createdAt: Date;
  uploadedById: string;
  assetType: AttachmentAssetType;
  project: {
    id: string;
    name: string;
    tag: string | null;
    createdById: string;
    executorUserId: string | null;
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
    return 10;
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

function isAttachmentVisibleToUser(
  user: LibraryUser,
  attachment: RawLibraryAttachment,
) {
  if (
    canBypassCollaboratorVisibility(user, attachment.project.createdById) ||
    attachment.project.createdById === user.id ||
    attachment.project.executorUserId === user.id
  ) {
    return true;
  }

  const collaborator = attachment.project.collaborators.find(
    (item) => item.userId === user.id,
  );

  if (!collaborator) {
    return false;
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
  const type = getLibraryTypeLabel(attachment.originalFileName, attachment.mimeType);
  const isFinance = isFinanceLibraryFile(attachment.originalFileName);

  return {
    id: attachment.id,
    fileName: attachment.originalFileName,
    projectId: attachment.projectId,
    projectName: attachment.project.name,
    projectTag: attachment.project.tag?.trim() || null,
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
      "search" | "projectId" | "createdById" | "date" | "type" | "quickMenu"
    >
  >,
) {
  const search = input.search.trim().toLowerCase();
  let filteredItems = [...items];

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
                    executorUserId: user.id,
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
            tag: true,
            createdById: true,
            executorUserId: true,
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

export async function getLibraryPageDataForUser(
  user: LibraryUser,
  input: LibraryQueryInput = {},
): Promise<LibraryPageData> {
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
  const rawAttachments = await getAccessibleLibraryAttachments(user);
  const favoritedAttachmentIds = await getFavoriteAttachmentIdSetForUser(
    user.id,
    rawAttachments.map((attachment) => attachment.id),
  );
  const visibleItems = rawAttachments.map((attachment) =>
    mapAttachmentToLibraryItem(user, attachment, favoritedAttachmentIds),
  );

  const counts: LibraryQuickMenuCounts = {
    projectAssets: visibleItems.length,
    quotationsAndInvoices: visibleItems.filter(
      (item) => item.quickCategory === "Quotations/Invoices",
    ).length,
    fromUsers: new Set(visibleItems.map((item) => item.createdById)).size,
    favourites: visibleItems.filter((item) => item.isFavoritedByCurrentUser).length,
  };

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
  };

  const filteredItems = applyLibraryFilters(visibleItems, {
    search: input.search?.trim() ?? "",
    projectId: input.projectId?.trim() ?? "",
    createdById: input.createdById?.trim() ?? "",
    date: input.date ?? "all",
    type: input.type ?? "All Types",
    quickMenu: input.quickMenu ?? "assets",
  });

  const total = filteredItems.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(clampPage(input.page), totalPages);
  const startIndex = (page - 1) * pageSize;

  return {
    items: filteredItems.slice(startIndex, startIndex + pageSize),
    counts,
    filters,
    page,
    pageSize,
    total,
    totalPages,
  };
}

export async function getLibraryUploadProjectsForUser(
  user: ProjectAccessUser & LibraryUploadUser,
): Promise<LibraryUploadProjectOption[]> {
  if (!canUploadLibraryAssets(user)) {
    return [];
  }

  const projects = await withPrismaRetry(() =>
    prisma.project.findMany({
      where: {
        ...buildAccessibleProjectsWhere(user),
        status: {
          not: "COMPLETED",
        },
      },
      orderBy: {
        name: "asc",
      },
      select: {
        id: true,
        name: true,
        tag: true,
      },
    }),
  );

  return projects.map((project) => ({
    id: project.id,
    label: project.name,
    tag: project.tag?.trim() || null,
  }));
}

export function getDashboardLibraryUploadAccessState(user: LibraryUploadUser) {
  return {
    canViewLibrary: canViewLibrary(user),
    canUploadAssets: canUploadLibraryAssets(user),
  };
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
