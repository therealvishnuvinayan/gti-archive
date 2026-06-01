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

export type ProjectMasterDataSummary = {
  totalCategories: number;
  activeCategories: number;
  totalTags: number;
  activeTags: number;
  totalCurrencies: number;
  activeCurrencies: number;
};

export type ProjectMasterDataRecord = {
  categories: ProjectMasterDataItemRecord[];
  tags: ProjectMasterDataItemRecord[];
  currencies: ProjectMasterCurrencyRecord[];
  summary: ProjectMasterDataSummary;
};

export type ActiveProjectMasterDataOptions = {
  categories: string[];
  tags: string[];
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

export async function getProjectMasterData(): Promise<ProjectMasterDataRecord> {
  const fetchMasterData = unstable_cache(
    async () =>
      withPrismaRetry(() =>
        Promise.all([
          prisma.projectCategory.findMany({
            orderBy: [{ isActive: "desc" }, { name: "asc" }],
          }),
          prisma.projectTag.findMany({
            orderBy: [{ isActive: "desc" }, { name: "asc" }],
          }),
          prisma.projectCurrency.findMany({
            orderBy: [{ isActive: "desc" }, { code: "asc" }],
          }),
        ]),
      ),
    ["project-master-data"],
    { revalidate: 20, tags: [PROJECT_MASTER_DATA_CACHE_TAG] },
  );

  const [categories, tags, currencies] = await fetchMasterData();

  return {
    categories: categories.map(mapMasterDataItem),
    tags: tags.map(mapMasterDataItem),
    currencies: currencies.map(mapCurrencyItem),
    summary: {
      totalCategories: categories.length,
      activeCategories: categories.filter((item) => item.isActive).length,
      totalTags: tags.length,
      activeTags: tags.filter((item) => item.isActive).length,
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
    tags: masterData.tags
      .filter((item) => item.isActive)
      .map((item) => item.name),
    currencies: masterData.currencies
      .filter((item) => item.isActive)
      .map((item) => ({
        code: item.code,
        name: item.name,
      })),
  };
}
