import type { LucideIcon } from "lucide-react";
import {
  BadgeCheck,
  FileImage,
  FileStack,
  Images,
  Megaphone,
  Newspaper,
  PanelTop,
  Play,
  ScrollText,
  Shapes,
  ShieldAlert,
  Sparkles,
} from "lucide-react";

import {
  archiveCategoryDefinitions,
  getArchiveCategoryBySlug,
  type ArchiveCategorySlug,
} from "@/lib/archive-categories";

export type ArchiveCategory = {
  slug: ArchiveCategorySlug;
  title: string;
  icon: LucideIcon;
};

const archiveCategoryIconMap: Record<ArchiveCategorySlug, LucideIcon> = {
  artworks: Shapes,
  promotions: Sparkles,
  advertisements: Megaphone,
  "website-data": PanelTop,
  revisions: FileStack,
  "product-renders": Images,
  "3d-assets": Shapes,
  videos: Play,
  documents: ScrollText,
  "health-warnings": ShieldAlert,
  "catalogues-flyers": Newspaper,
  "exhibition-materials": BadgeCheck,
};

export const archiveCategories: ArchiveCategory[] = archiveCategoryDefinitions.map((category) => ({
  ...category,
  icon: archiveCategoryIconMap[category.slug],
}));

export function getArchiveCategory(slug: string) {
  const category = getArchiveCategoryBySlug(slug);

  if (!category) {
    return null;
  }

  return {
    ...category,
    icon: archiveCategoryIconMap[category.slug],
  } satisfies ArchiveCategory;
}

export function getFileTypeIcon(type: string): LucideIcon {
  const normalized = type.toUpperCase();

  if (["PNG", "JPG", "JPEG", "WEBP", "GIF", "PSD", "FIG", "AI"].includes(normalized)) {
    return FileImage;
  }

  return ScrollText;
}
