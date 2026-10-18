import { refreshProjectReader } from "@/lib/authorization/project-read";
import { runArchiveOperation } from "@/lib/authorization/archive";
import { archiveScopeForUser, archiveCategoryWhere, canArchive } from "@/lib/authorization/archive-rules";
import { prisma, withPrismaRetry } from "@/lib/prisma";
import {
  type PermissionUser,
} from "@/lib/permissions/resolver";

export type ArchiveCategorySlug = string;

export type ArchiveCategoryRecord = {
  id: string;
  name: string;
  slug: string;
  description: string;
  iconUrl: string;
  iconKey: string;
  color: string;
  parentId: string | null;
  parentName: string | null;
  childCount: number;
  sortOrder: number;
  isActive: boolean;
  isSystem: boolean;
  allowedUsers: Array<{
    userId: string;
  }>;
};

export type ArchiveCategoryOption = {
  id: string;
  name: string;
  slug: string;
  description: string;
  iconUrl: string;
  iconKey: string;
  color: string;
  parentId: string | null;
  parentName: string | null;
  sortOrder: number;
};

export function normalizeArchiveCategorySlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function mapArchiveCategory(category: {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  iconUrl: string | null;
  iconKey: string | null;
  color: string | null;
  parentId: string | null;
  parent?: { name: string } | null;
  children?: Array<{ id: string }>;
  allowedUsers?: Array<{ userId: string }>;
  sortOrder: number;
  isActive: boolean;
  isSystem: boolean;
}) {
  return {
    id: category.id,
    name: category.name,
    slug: category.slug,
    description: category.description?.trim() || "",
    iconUrl: category.iconUrl?.trim() || "",
    iconKey: category.iconKey?.trim() || "",
    color: category.color?.trim() || "",
    parentId: category.parentId,
    parentName: category.parent?.name ?? null,
    childCount: category.children?.length ?? 0,
    sortOrder: category.sortOrder,
    isActive: category.isActive,
    isSystem: category.isSystem,
    allowedUsers: category.allowedUsers ?? [],
  } satisfies ArchiveCategoryRecord;
}

export async function getActiveArchiveCategoryOptions(
  user?: ({ id: string } & PermissionUser) | null,
): Promise<ArchiveCategoryOption[]> {
  const fresh = await refreshProjectReader(user ?? undefined);
  if (!canArchive(fresh, "archive.view")) return [];
  return runArchiveOperation(fresh, "archive.view", "root", async user => {
  const categories = await withPrismaRetry(() =>
    prisma.archiveCategory.findMany({
      where: archiveCategoryWhere(archiveScopeForUser(user)),
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: {
        parent: {
          select: {
            name: true,
          },
        },
        allowedUsers: {
          select: {
            userId: true,
          },
        },
      },
    }),
  );

  return categories.map((category) => {
    const mapped = mapArchiveCategory(category);

    return {
      id: mapped.id,
      name: mapped.name,
      slug: mapped.slug,
      description: mapped.description,
      iconUrl: mapped.iconUrl,
      iconKey: mapped.iconKey,
      color: mapped.color,
      parentId: mapped.parentId,
      parentName: mapped.parentId && categories.some(row => row.id === mapped.parentId) ? mapped.parentName : null,
      sortOrder: mapped.sortOrder,
    };
  });
  });
}

export async function getArchiveCategoryBySlug(slug: string) {
  const normalizedSlug = normalizeArchiveCategorySlug(slug);

  if (!normalizedSlug) {
    return null;
  }

  const user = await refreshProjectReader();
  if (!canArchive(user, "archive.view")) return null;
  return runArchiveOperation(user, "archive.view", "root", async user => {
  const category = await withPrismaRetry(() =>
    prisma.archiveCategory.findFirst({
      where: {
        slug: normalizedSlug,
        ...archiveCategoryWhere(archiveScopeForUser(user)),
      },
      include: {
        parent: {
          select: {
            name: true,
          },
        },
        children: {
          select: {
            id: true,
          },
        },
        allowedUsers: {
          select: {
            userId: true,
          },
        },
      },
    }),
  );

  if (!category) return null;
  const visible = await prisma.archiveCategory.findMany({ where: archiveCategoryWhere(archiveScopeForUser(user)), select: { id: true } });
  const ids = new Set(visible.map(row => row.id));
  return mapArchiveCategory({ ...category, parent: category.parentId && ids.has(category.parentId) ? category.parent : null, children: category.children.filter(row => ids.has(row.id)), allowedUsers: canArchive(user, "archive.manageAccess") ? category.allowedUsers : [] });
  });
}
