export const MAX_PROJECT_TAGS = 4;

export type ProjectTagsValidation =
  | { tags: string[]; error?: undefined }
  | { tags?: undefined; error: string };

export function validateProjectTags(value: unknown): ProjectTagsValidation {
  if (!Array.isArray(value) || value.length === 0) {
    return { error: "Add at least one project tag." };
  }
  if (value.length > MAX_PROJECT_TAGS) {
    return { error: "A project can have a maximum of four tags." };
  }
  if (value.some((tag) => typeof tag !== "string" || !tag.trim())) {
    return { error: "Every project tag must contain a name." };
  }
  const tags = (value as string[]).map((tag) => tag.trim());
  if (new Set(tags.map((tag) => tag.toLowerCase())).size !== tags.length) {
    return { error: "Each project tag must be different." };
  }
  return { tags };
}

const tagColors = [
  "border-blue-200 bg-blue-50 text-blue-800",
  "border-purple-200 bg-purple-50 text-purple-800",
  "border-amber-200 bg-amber-50 text-amber-800",
  "border-rose-200 bg-rose-50 text-rose-800",
  "border-teal-200 bg-teal-50 text-teal-800",
  "border-indigo-200 bg-indigo-50 text-indigo-800",
  "border-orange-200 bg-orange-50 text-orange-800",
  "border-emerald-200 bg-emerald-50 text-emerald-800",
] as const;

// Stable colors avoid changes on refresh and server/client hydration differences.
// Resolve collisions so the tags on a project have distinct colors.
export function getProjectTagColors(tags: readonly string[]) {
  const used = new Set<number>();
  return tags.map((tag) => {
    let hash = 0;
    for (const character of tag.toLowerCase()) {
      hash = (Math.imul(hash, 31) + character.charCodeAt(0)) >>> 0;
    }
    let index = hash % tagColors.length;
    while (used.size < tagColors.length && used.has(index)) {
      index = (index + 1) % tagColors.length;
    }
    used.add(index);
    return tagColors[index];
  });
}
