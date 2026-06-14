import { unstable_cache } from "next/cache";

import { prisma, withPrismaRetry } from "@/lib/prisma";

export const PROJECT_MASTER_DATA_CACHE_TAG = "project-master-data";
export const PROJECT_MASTER_DATA_DESCRIPTION_MAX_LENGTH = 300;

export type ProjectMasterDataItemRecord = {
  id: string;
  name: string;
  description: string;
  color: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ProjectMasterCurrencyRecord = {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ArchiveCategoryMasterDataRecord = {
  id: string;
  name: string;
  slug: string;
  description: string;
  iconUrl: string;
  iconKey: string;
  color: string;
  parentId: string | null;
  parentName: string | null;
  childCount: number;
  sortOrder: number;
  isActive: boolean;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ProjectStatusMasterDataRecord = {
  id: string;
  name: string;
  slug: string;
  description: string;
  color: string;
  groupId: string | null;
  groupName: string;
  groupSlug: string;
  groupColor: string;
  groupIsActive: boolean;
  sortOrder: number;
  isActive: boolean;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ProjectStatusGroupMasterDataRecord = {
  id: string;
  name: string;
  slug: string;
  description: string;
  color: string;
  sortOrder: number;
  isActive: boolean;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ProjectMasterDataSummary = {
  totalCategories: number;
  activeCategories: number;
  totalProjectStatusGroups: number;
  activeProjectStatusGroups: number;
  totalProjectStatuses: number;
  activeProjectStatuses: number;
  totalTags: number;
  activeTags: number;
  totalAssetTags: number;
  activeAssetTags: number;
  totalArchiveCategories: number;
  activeArchiveCategories: number;
  totalCurrencies: number;
  activeCurrencies: number;
};

export type ProjectMasterDataRecord = {
  categories: ProjectMasterDataItemRecord[];
  projectStatusGroups: ProjectStatusGroupMasterDataRecord[];
  projectStatuses: ProjectStatusMasterDataRecord[];
  tags: ProjectMasterDataItemRecord[];
  assetTags: ProjectMasterDataItemRecord[];
  archiveCategories: ArchiveCategoryMasterDataRecord[];
  currencies: ProjectMasterCurrencyRecord[];
  summary: ProjectMasterDataSummary;
};

export type ActiveProjectMasterDataOptions = {
  categories: string[];
  projectStatusGroups: Array<{
    id: string;
    name: string;
    slug: string;
    color: string;
    isActive: boolean;
  }>;
  projectStatuses: Array<{
    id: string;
    name: string;
    slug: string;
    color: string;
    groupId: string | null;
    groupName: string;
    groupSlug: string;
    groupColor: string;
    groupIsActive: boolean;
    isActive: boolean;
  }>;
  tags: string[];
  assetTags: Array<{
    id: string;
    name: string;
    color: string;
  }>;
  currencies: Array<{
    code: string;
    name: string;
  }>;
};

function toMasterDataDate(date: Date | string | number) {
  return date instanceof Date ? date : new Date(date);
}

function formatMasterDataTimestamp(date: Date | string | number) {
  const normalizedDate = toMasterDataDate(date);

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

function mapMasterDataItem(item: {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  isActive: boolean;
  createdAt: Date | string | number;
  updatedAt: Date | string | number;
}) {
  return {
    id: item.id,
    name: item.name,
    description: item.description?.trim() || "",
    color: item.color?.trim() || "",
    isActive: item.isActive,
    createdAt: formatMasterDataTimestamp(item.createdAt),
    updatedAt: formatMasterDataTimestamp(item.updatedAt),
  } satisfies ProjectMasterDataItemRecord;
}

function mapCurrencyItem(item: {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
  createdAt: Date | string | number;
  updatedAt: Date | string | number;
}) {
  return {
    id: item.id,
    name: item.name.trim(),
    code: item.code.trim().toUpperCase(),
    isActive: item.isActive,
    createdAt: formatMasterDataTimestamp(item.createdAt),
    updatedAt: formatMasterDataTimestamp(item.updatedAt),
  } satisfies ProjectMasterCurrencyRecord;
}

function mapArchiveCategoryItem(item: {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  iconUrl: string | null;
  iconKey: string | null;
  color: string | null;
  parentId: string | null;
  parent?: { name: string } | null;
  children?: Array<{ id: string }>;
  sortOrder: number;
  isActive: boolean;
  isSystem: boolean;
  createdAt: Date | string | number;
  updatedAt: Date | string | number;
}) {
  return {
    id: item.id,
    name: item.name.trim(),
    slug: item.slug.trim(),
    description: item.description?.trim() || "",
    iconUrl: item.iconUrl?.trim() || "",
    iconKey: item.iconKey?.trim() || "",
    color: item.color?.trim() || "",
    parentId: item.parentId,
    parentName: item.parent?.name ?? null,
    childCount: item.children?.length ?? 0,
    sortOrder: item.sortOrder,
    isActive: item.isActive,
    isSystem: item.isSystem,
    createdAt: formatMasterDataTimestamp(item.createdAt),
    updatedAt: formatMasterDataTimestamp(item.updatedAt),
  } satisfies ArchiveCategoryMasterDataRecord;
}

function mapProjectStatusItem(item: {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  color: string | null;
  groupId: string | null;
  group?: {
    name: string;
    slug: string;
    color: string | null;
    isActive: boolean;
  } | null;
  sortOrder: number;
  isActive: boolean;
  isSystem: boolean;
  createdAt: Date | string | number;
  updatedAt: Date | string | number;
}) {
  return {
    id: item.id,
    name: item.name.trim(),
    slug: item.slug.trim(),
    description: item.description?.trim() || "",
    color: item.color?.trim() || "",
    groupId: item.groupId,
    groupName: item.group?.name.trim() || "No group",
    groupSlug: item.group?.slug.trim() || "",
    groupColor: item.group?.color?.trim() || "",
    groupIsActive: item.group?.isActive ?? true,
    sortOrder: item.sortOrder,
    isActive: item.isActive,
    isSystem: item.isSystem,
    createdAt: formatMasterDataTimestamp(item.createdAt),
    updatedAt: formatMasterDataTimestamp(item.updatedAt),
  } satisfies ProjectStatusMasterDataRecord;
}

function mapProjectStatusGroupItem(item: {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  color: string | null;
  sortOrder: number;
  isActive: boolean;
  isSystem: boolean;
  createdAt: Date | string | number;
  updatedAt: Date | string | number;
}) {
  return {
    id: item.id,
    name: item.name.trim(),
    slug: item.slug.trim(),
    description: item.description?.trim() || "",
    color: item.color?.trim() || "",
    sortOrder: item.sortOrder,
    isActive: item.isActive,
    isSystem: item.isSystem,
    createdAt: formatMasterDataTimestamp(item.createdAt),
    updatedAt: formatMasterDataTimestamp(item.updatedAt),
  } satisfies ProjectStatusGroupMasterDataRecord;
}

export async function getProjectMasterData(): Promise<ProjectMasterDataRecord> {
  const fetchMasterData = unstable_cache(
    async () =>
      withPrismaRetry(() =>
        Promise.all([
          prisma.projectCategory.findMany({
            orderBy: [{ isActive: "desc" }, { name: "asc" }],
          }),
          prisma.projectStatusGroupOption.findMany({
            orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
          }),
          prisma.projectStatusOption.findMany({
            include: {
              group: true,
            },
            orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
          }),
          prisma.projectTag.findMany({
            orderBy: [{ isActive: "desc" }, { name: "asc" }],
          }),
          prisma.assetTag.findMany({
            orderBy: [{ isActive: "desc" }, { name: "asc" }],
          }),
          prisma.archiveCategory.findMany({
            orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
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
          prisma.projectCurrency.findMany({
            orderBy: [{ isActive: "desc" }, { code: "asc" }],
          }),
        ]),
      ),
    ["project-master-data"],
    { revalidate: 20, tags: [PROJECT_MASTER_DATA_CACHE_TAG] },
  );

  const [
    categories,
    projectStatusGroups,
    projectStatuses,
    tags,
    assetTags,
    archiveCategories,
    currencies,
  ] =
    await fetchMasterData();

  return {
    categories: categories.map(mapMasterDataItem),
    projectStatusGroups: projectStatusGroups.map(mapProjectStatusGroupItem),
    projectStatuses: projectStatuses.map(mapProjectStatusItem),
    tags: tags.map(mapMasterDataItem),
    assetTags: assetTags.map(mapMasterDataItem),
    archiveCategories: archiveCategories.map(mapArchiveCategoryItem),
    currencies: currencies.map(mapCurrencyItem),
    summary: {
      totalCategories: categories.length,
      activeCategories: categories.filter((item) => item.isActive).length,
      totalProjectStatusGroups: projectStatusGroups.length,
      activeProjectStatusGroups: projectStatusGroups.filter((item) => item.isActive).length,
      totalProjectStatuses: projectStatuses.length,
      activeProjectStatuses: projectStatuses.filter((item) => item.isActive).length,
      totalTags: tags.length,
      activeTags: tags.filter((item) => item.isActive).length,
      totalAssetTags: assetTags.length,
      activeAssetTags: assetTags.filter((item) => item.isActive).length,
      totalArchiveCategories: archiveCategories.length,
      activeArchiveCategories: archiveCategories.filter((item) => item.isActive).length,
      totalCurrencies: currencies.length,
      activeCurrencies: currencies.filter((item) => item.isActive).length,
    },
  };
}

export async function getActiveProjectMasterDataOptions(): Promise<ActiveProjectMasterDataOptions> {
  const masterData = await getProjectMasterData();

  return {
    categories: masterData.categories
      .filter((item) => item.isActive)
      .map((item) => item.name),
    projectStatusGroups: masterData.projectStatusGroups
      .filter((item) => item.isActive)
      .map((item) => ({
        id: item.id,
        name: item.name,
        slug: item.slug,
        color: item.color,
        isActive: item.isActive,
      })),
    projectStatuses: masterData.projectStatuses
      .filter((item) => item.isActive)
      .map((item) => ({
        id: item.id,
        name: item.name,
        slug: item.slug,
        color: item.color,
        groupId: item.groupId,
        groupName: item.groupName,
        groupSlug: item.groupSlug,
        groupColor: item.groupColor,
        groupIsActive: item.groupIsActive,
        isActive: item.isActive,
      })),
    tags: masterData.tags
      .filter((item) => item.isActive)
      .map((item) => item.name),
    assetTags: masterData.assetTags
      .filter((item) => item.isActive)
      .map((item) => ({
        id: item.id,
        name: item.name,
        color: item.color,
      })),
    currencies: masterData.currencies
      .filter((item) => item.isActive)
      .map((item) => ({
        code: item.code,
        name: item.name,
      })),
  };
}
