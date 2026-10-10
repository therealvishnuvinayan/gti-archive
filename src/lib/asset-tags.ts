import { prisma, withPrismaRetry } from "@/lib/prisma";
import { normalizeAssetTagIds, type AssetTagRecord } from "@/lib/asset-tags-shared";

export {
  MAX_ASSET_TAGS,
  ASSET_TAG_LIMIT_ERROR,
  normalizeAssetTagIds,
  mapAssetTagAssignments,
  type AssetTagRecord,
  type AssetTagAssignmentRecord,
} from "@/lib/asset-tags-shared";

export async function validateActiveAssetTagIds(
  values: Array<string | null | undefined>,
) {
  const normalized = normalizeAssetTagIds(values);

  if (normalized.error) {
    return normalized;
  }

  if (normalized.tagIds.length === 0) {
    return normalized;
  }

  const tags = await withPrismaRetry(() =>
    prisma.assetTag.findMany({
      where: {
        id: {
          in: normalized.tagIds,
        },
        isActive: true,
      },
      select: {
        id: true,
      },
    }),
  );
  const activeTagIds = new Set(tags.map((tag) => tag.id));

  if (normalized.tagIds.some((tagId) => !activeTagIds.has(tagId))) {
    return {
      tagIds: [],
      error: "Choose valid asset tags.",
    } as const;
  }

  return normalized;
}

export async function getActiveAssetTagOptions(): Promise<AssetTagRecord[]> {
  const tags = await withPrismaRetry(() =>
    prisma.assetTag.findMany({
      where: {
        isActive: true,
      },
      orderBy: {
        name: "asc",
      },
      select: {
        id: true,
        name: true,
        description: true,
        color: true,
      },
    }),
  );

  return tags.map((tag) => ({
    id: tag.id,
    name: tag.name,
    description: tag.description?.trim() || "",
    color: tag.color?.trim() || "",
  }));
}
