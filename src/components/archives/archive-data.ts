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

export type ArchiveCategory = {
  slug: ArchiveCategorySlug;
  title: string;
  icon: LucideIcon;
};

export type ArchiveItem = {
  id: string;
  fileName: string;
  projectName: string;
  projectLabel: string;
  date: string;
  listedBy: string;
  createdBy: string;
  fileTypes: string[];
  tag: string;
  country: string;
};

export const archiveCategories: ArchiveCategory[] = [
  { slug: "artworks", title: "Artworks", icon: Shapes },
  { slug: "promotions", title: "Promotions", icon: Sparkles },
  { slug: "advertisements", title: "Advertisements", icon: Megaphone },
  { slug: "website-data", title: "Website Data", icon: PanelTop },
  { slug: "revisions", title: "Revisions", icon: FileStack },
  { slug: "product-renders", title: "Product Renders", icon: Images },
  { slug: "3d-assets", title: "3D Assets", icon: Shapes },
  { slug: "videos", title: "Videos", icon: Play },
  { slug: "documents", title: "Documents", icon: ScrollText },
  { slug: "health-warnings", title: "Health Warnings", icon: ShieldAlert },
  { slug: "catalogues-flyers", title: "Catalogues/Flyers", icon: Newspaper },
  { slug: "exhibition-materials", title: "Exhibition Materials", icon: BadgeCheck },
];

const sharedItems: ArchiveItem[] = [
  {
    id: "archive-1",
    fileName: "Milano Superslim Mango + Applemint With Russian HW",
    projectName: "Milano Superslim Mango Applemint Russia",
    projectLabel: "Milano Superslim Mango Applemint Russia",
    date: "18/09/2022",
    listedBy: "A",
    createdBy: "Philippe Andrew",
    fileTypes: ["AI", "PSD", "PDF", "FIG", "ZIP"],
    tag: "HW",
    country: "Russia",
  },
  {
    id: "archive-2",
    fileName: "Mond Kings Blue Regular Art works",
    projectName: "Mond Kings Blue Regular",
    projectLabel: "Mond Kings Blue Regular",
    date: "24/05/2023",
    listedBy: "S",
    createdBy: "Dennis Micheal",
    fileTypes: ["AI", "PSD", "PDF", "ZIP"],
    tag: "Launch",
    country: "Canada",
  },
  {
    id: "archive-3",
    fileName: "Milano FP Ice Mango Artwork Final",
    projectName: "Milano FanPack Ice Mango Inner + Outer",
    projectLabel: "Milano FanPack Ice Mango Inner + Outer",
    date: "18/09/2022",
    listedBy: "A",
    createdBy: "Philippe Andrew",
    fileTypes: ["AI", "PDF", "FIG", "ZIP"],
    tag: "Priority",
    country: "UAE",
  },
  {
    id: "archive-4",
    fileName: "Mond Kings Blue Regular Art works",
    projectName: "Mond Kings Blue Regular",
    projectLabel: "Mond Kings Blue Regular",
    date: "24/05/2023",
    listedBy: "SI",
    createdBy: "Dennis Micheal",
    fileTypes: ["AI", "ZIP"],
    tag: "Revision",
    country: "Germany",
  },
];

export const archiveItemsByCategory: Record<ArchiveCategorySlug, ArchiveItem[]> = {
  artworks: sharedItems,
  promotions: sharedItems.map((item, index) => ({
    ...item,
    id: `${item.id}-promo`,
    tag: "Promo",
    fileName: `${item.fileName} Promo ${index + 1}`,
  })),
  advertisements: sharedItems.map((item) => ({
    ...item,
    id: `${item.id}-advert`,
    tag: "Advert",
  })),
  "website-data": sharedItems.map((item) => ({
    ...item,
    id: `${item.id}-web`,
    tag: "Web",
  })),
  revisions: sharedItems.map((item) => ({
    ...item,
    id: `${item.id}-rev`,
    tag: "Revision",
  })),
  "product-renders": sharedItems.map((item) => ({
    ...item,
    id: `${item.id}-render`,
    fileTypes: ["PNG", "JPG", "ZIP"],
  })),
  "3d-assets": sharedItems.map((item) => ({
    ...item,
    id: `${item.id}-3d`,
    fileTypes: ["OBJ", "FBX", "ZIP"],
  })),
  videos: sharedItems.map((item) => ({
    ...item,
    id: `${item.id}-video`,
    fileTypes: ["MP4", "MOV", "ZIP"],
  })),
  documents: sharedItems.map((item) => ({
    ...item,
    id: `${item.id}-doc`,
    fileTypes: ["DOC", "PDF", "ZIP"],
  })),
  "health-warnings": sharedItems.map((item) => ({
    ...item,
    id: `${item.id}-hw`,
    tag: "HW",
  })),
  "catalogues-flyers": sharedItems.map((item) => ({
    ...item,
    id: `${item.id}-cat`,
    fileTypes: ["PDF", "INDD", "ZIP"],
  })),
  "exhibition-materials": sharedItems.map((item) => ({
    ...item,
    id: `${item.id}-exhibit`,
    tag: "Exhibition",
  })),
};

export function getArchiveCategory(slug: string) {
  return archiveCategories.find((category) => category.slug === slug);
}

export function getFileTypeIcon(type: string): LucideIcon {
  const normalized = type.toUpperCase();

  if (["PNG", "JPG", "PSD", "FIG"].includes(normalized)) {
    return FileImage;
  }

  return ScrollText;
}
