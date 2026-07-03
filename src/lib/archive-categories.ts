import { prisma, withPrismaRetry } from "@/lib/prisma";
import {
  hasPermission,
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

function getAccessibleActiveCategoryWhere(
  user?: ({ id: string } & PermissionUser) | null,
) {
  if (!user || hasPermission(user, "settings.manageMasterData")) {
    return {
      isActive: true,
    };
  }

  if (!hasPermission(user, "archive.view")) {
    return {
      id: "__no_access__",
      isActive: true,
    };
  }

  return {
    isActive: true,
    OR: [
      {
        allowedUsers: {
          none: {},
        },
      },
      {
        allowedUsers: {
          some: {
            userId: user.id,
          },
        },
      },
    ],
  };
}

export async function getActiveArchiveCategoryOptions(
  user?: ({ id: string } & PermissionUser) | null,
): Promise<ArchiveCategoryOption[]> {
  const categories = await withPrismaRetry(() =>
    prisma.archiveCategory.findMany({
      where: getAccessibleActiveCategoryWhere(user),
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
      parentName: mapped.parentName,
      sortOrder: mapped.sortOrder,
    };
  });
}

export async function getArchiveCategoryBySlug(slug: string) {
  const normalizedSlug = normalizeArchiveCategorySlug(slug);

  if (!normalizedSlug) {
    return null;
  }

  const category = await withPrismaRetry(() =>
    prisma.archiveCategory.findUnique({
      where: {
        slug: normalizedSlug,
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

  return category ? mapArchiveCategory(category) : null;
}
