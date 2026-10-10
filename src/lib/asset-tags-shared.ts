// Browser-safe asset tag values and helpers. Database queries live in asset-tags.ts.
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
