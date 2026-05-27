export type ArchiveCategorySlug =
  | "artworks"
  | "promotions"
  | "advertisements"
  | "website-data"
  | "revisions"
  | "product-renders"
  | "3d-assets"
  | "videos"
  | "documents"
  | "health-warnings"
  | "catalogues-flyers"
  | "exhibition-materials";

export type ArchiveCategoryDefinition = {
  slug: ArchiveCategorySlug;
  title: string;
};

export const archiveCategoryDefinitions: ArchiveCategoryDefinition[] = [
  { slug: "artworks", title: "Artworks" },
  { slug: "promotions", title: "Promotions" },
  { slug: "advertisements", title: "Advertisements" },
  { slug: "website-data", title: "Website Data" },
  { slug: "revisions", title: "Revisions" },
  { slug: "product-renders", title: "Product Renders" },
  { slug: "3d-assets", title: "3D Assets" },
  { slug: "videos", title: "Videos" },
  { slug: "documents", title: "Documents" },
  { slug: "health-warnings", title: "Health Warnings" },
  { slug: "catalogues-flyers", title: "Catalogues/Flyers" },
  { slug: "exhibition-materials", title: "Exhibition Materials" },
];

const archiveCategoryMap = new Map(
  archiveCategoryDefinitions.map((category) => [category.slug, category] as const),
);

const archiveCategoryKeywords: Array<{
  slug: ArchiveCategorySlug;
  keywords: string[];
}> = [
  { slug: "website-data", keywords: ["website", "web", "landing"] },
  { slug: "advertisements", keywords: ["advert", "ads", "campaign"] },
  { slug: "promotions", keywords: ["promotion", "promo"] },
  { slug: "product-renders", keywords: ["render"] },
  { slug: "3d-assets", keywords: ["3d", "asset"] },
  { slug: "videos", keywords: ["video", "motion", "film"] },
  { slug: "revisions", keywords: ["revision"] },
  { slug: "health-warnings", keywords: ["health warning", "warning", "hw"] },
  { slug: "catalogues-flyers", keywords: ["catalogue", "catalog", "flyer", "brochure"] },
  { slug: "exhibition-materials", keywords: ["exhibition", "booth"] },
];

export function getArchiveCategoryBySlug(slug: string) {
  return archiveCategoryMap.get(slug as ArchiveCategorySlug) ?? null;
}

export function getArchiveCategoryLabel(slug: ArchiveCategorySlug) {
  return archiveCategoryMap.get(slug)?.title ?? "Artworks";
}

export function isArchiveCategorySlug(value: string): value is ArchiveCategorySlug {
  return archiveCategoryMap.has(value as ArchiveCategorySlug);
}

export function inferArchiveCategorySlug(input: {
  projectCategory?: string | null;
  projectTag?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
}): ArchiveCategorySlug {
  const normalizedSource = [
    input.projectCategory,
    input.projectTag,
    input.fileName,
  ]
    .filter(Boolean)
    .join(" ")
    .trim()
    .toLowerCase();

  if (input.mimeType?.startsWith("video/")) {
    return "videos";
  }

  if (normalizedSource) {
    const keywordMatch = archiveCategoryKeywords.find(({ keywords }) =>
      keywords.some((keyword) => normalizedSource.includes(keyword)),
    );

    if (keywordMatch) {
      return keywordMatch.slug;
    }
  }

  return "artworks";
}
