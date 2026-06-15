import { prisma, withPrismaRetry } from "@/lib/prisma";

export const MAX_ASSET_TAGS = 5;
export const ASSET_TAG_LIMIT_ERROR = "You can add up to 5 tags only.";

export type AssetTagRecord = {
  id: string;
  name: string;
  description?: string;
  color: string;
};

export type AssetTagAssignmentRecord = {
  tag: {
    id: string;
    name: string;
    color: string | null;
  };
};

export function normalizeAssetTagIds(values: Array<string | null | undefined>) {
  const tagIds: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const tagId = value?.trim();

    if (!tagId) {
      continue;
    }

    if (seen.has(tagId)) {
      return {
        tagIds: [],
        error: "Duplicate asset tags are not allowed.",
      } as const;
    }

    seen.add(tagId);
    tagIds.push(tagId);
  }

  if (tagIds.length > MAX_ASSET_TAGS) {
    return {
      tagIds: [],
      error: ASSET_TAG_LIMIT_ERROR,
    } as const;
  }

  return { tagIds, error: null } as const;
}

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

export function mapAssetTagAssignments(assignments: AssetTagAssignmentRecord[]) {
  return assignments
    .map((assignment) => ({
      id: assignment.tag.id,
      name: assignment.tag.name,
      color: assignment.tag.color?.trim() || "",
    }))
    .filter((tag) => tag.name.trim())
    .sort((left, right) =>
      left.name.localeCompare(right.name, undefined, { sensitivity: "base" }),
    );
}
