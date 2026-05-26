import { unstable_cache } from "next/cache";

import { prisma, withPrismaRetry } from "@/lib/prisma";

export const PROJECT_MASTER_DATA_CACHE_TAG = "project-master-data";

export type ProjectMasterDataItemRecord = {
  id: string;
  name: string;
  description: string;
  color: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ProjectMasterDataSummary = {
  totalCategories: number;
  activeCategories: number;
  totalTags: number;
  activeTags: number;
};

export type ProjectMasterDataRecord = {
  categories: ProjectMasterDataItemRecord[];
  tags: ProjectMasterDataItemRecord[];
  summary: ProjectMasterDataSummary;
};

function formatMasterDataTimestamp(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function mapMasterDataItem(item: {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
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

export async function getProjectMasterData(): Promise<ProjectMasterDataRecord> {
  const fetchMasterData = unstable_cache(
    async () =>
      withPrismaRetry(() =>
        Promise.all([
          prisma.projectCategory.findMany({
            orderBy: [
              { isActive: "desc" },
              { name: "asc" },
            ],
          }),
          prisma.projectTag.findMany({
            orderBy: [
              { isActive: "desc" },
              { name: "asc" },
            ],
          }),
        ]),
      ),
    ["project-master-data"],
    { revalidate: 20, tags: [PROJECT_MASTER_DATA_CACHE_TAG] },
  );

  const [categories, tags] = await fetchMasterData();

  return {
    categories: categories.map(mapMasterDataItem),
    tags: tags.map(mapMasterDataItem),
    summary: {
      totalCategories: categories.length,
      activeCategories: categories.filter((item) => item.isActive).length,
      totalTags: tags.length,
      activeTags: tags.filter((item) => item.isActive).length,
    },
  };
}
