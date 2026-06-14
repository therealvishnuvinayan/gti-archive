import { createElement } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Archive,
  BadgeCheck,
  Box,
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

export const archiveCategoryIconOptions = [
  { key: "archive", label: "Archive", icon: Archive },
  { key: "badge-check", label: "Badge", icon: BadgeCheck },
  { key: "box", label: "Box", icon: Box },
  { key: "file-stack", label: "File Stack", icon: FileStack },
  { key: "images", label: "Images", icon: Images },
  { key: "megaphone", label: "Megaphone", icon: Megaphone },
  { key: "newspaper", label: "Newspaper", icon: Newspaper },
  { key: "panel-top", label: "Website", icon: PanelTop },
  { key: "play", label: "Video", icon: Play },
  { key: "scroll-text", label: "Document", icon: ScrollText },
  { key: "shapes", label: "Shapes", icon: Shapes },
  { key: "shield-alert", label: "Alert", icon: ShieldAlert },
  { key: "sparkles", label: "Sparkles", icon: Sparkles },
] as const;

const archiveCategoryIconMap = new Map<string, LucideIcon>(
  archiveCategoryIconOptions.map((option) => [option.key, option.icon]),
);

export function getArchiveCategoryIcon(iconKey: string | null | undefined) {
  return archiveCategoryIconMap.get(iconKey?.trim() ?? "") ?? Archive;
}

export function getFileTypeIcon(type: string): LucideIcon {
  const normalized = type.toUpperCase();

  if (["PNG", "JPG", "JPEG", "WEBP", "GIF", "PSD", "FIG", "AI"].includes(normalized)) {
    return FileImage;
  }

  return ScrollText;
}

export function getArchiveCategoryIconImageSrc(iconUrl: string | null | undefined) {
  const trimmedUrl = iconUrl?.trim();

  if (!trimmedUrl) {
    return "";
  }

  if (
    trimmedUrl.startsWith("http://") ||
    trimmedUrl.startsWith("https://") ||
    trimmedUrl.startsWith("/")
  ) {
    return trimmedUrl;
  }

  return `/api/archive-category-icons/preview?key=${encodeURIComponent(trimmedUrl)}`;
}

export function ArchiveCategoryIconGlyph({
  iconKey,
  className,
}: {
  iconKey: string | null | undefined;
  className?: string;
}) {
  return createElement(getArchiveCategoryIcon(iconKey), { className });
}

export function ArchiveFileTypeIcon({
  type,
  className,
}: {
  type: string;
  className?: string;
}) {
  return createElement(getFileTypeIcon(type), { className });
}
