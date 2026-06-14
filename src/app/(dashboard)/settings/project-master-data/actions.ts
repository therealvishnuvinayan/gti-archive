"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { ProjectStatusGroup } from "@prisma/client";

import { requireUser } from "@/lib/auth";
import { normalizeArchiveCategorySlug } from "@/lib/archive-categories";
import { requirePermission } from "@/lib/permissions/require";
import { prisma, withPrismaRetry } from "@/lib/prisma";
import {
  PROJECT_MASTER_DATA_CACHE_TAG,
  PROJECT_MASTER_DATA_DESCRIPTION_MAX_LENGTH,
} from "@/lib/project-master-data";
import { normalizeProjectStatusSlug } from "@/lib/project-statuses";
import { buildArchiveCategoryIconPrefix } from "@/lib/storage/s3";

type SaveMasterDataInput = {
  id?: string;
  name: string;
  description?: string;
  color?: string;
  code?: string;
  slug?: string;
  iconUrl?: string;
  iconKey?: string;
  parentId?: string | null;
  group?: string;
  sortOrder?: number;
  isActive: boolean;
};

type ToggleMasterDataInput = {
  id: string;
  isActive: boolean;
};

async function requireAdminUser() {
  const user = await requireUser();
  requirePermission(
    user,
    "settings.manageMasterData",
    "You do not have permission to manage project master data.",
  );

  return user;
}

async function requireSuperAdminUser() {
  const user = await requireUser();
  requirePermission(
    user,
    "settings.deleteMasterData",
    "You do not have permission to delete project master data.",
  );

  return user;
}

function normalizeMasterDataInput(input: SaveMasterDataInput) {
  return {
    id: input.id?.trim() || undefined,
    name: input.name.trim(),
    description: input.description?.trim() || null,
    color: input.color?.trim() || null,
    code: input.code?.trim().toUpperCase() || "",
    slug: normalizeArchiveCategorySlug(input.slug || input.name),
    iconUrl: input.iconUrl?.trim() || null,
    iconKey: input.iconKey?.trim() || null,
    parentId: input.parentId?.trim() || null,
    group: input.group?.trim() || "",
    sortOrder: Number.isFinite(input.sortOrder) ? Math.trunc(input.sortOrder ?? 0) : 0,
    isActive: input.isActive,
  };
}

function normalizeProjectStatusInput(input: SaveMasterDataInput) {
  const parsed = normalizeMasterDataInput(input);

  return {
    ...parsed,
    slug: normalizeProjectStatusSlug(input.slug || input.name),
  };
}

function isProjectStatusGroup(value: string): value is ProjectStatusGroup {
  return Object.values(ProjectStatusGroup).includes(value as ProjectStatusGroup);
}

async function revalidateProjectMasterData() {
  revalidateTag(PROJECT_MASTER_DATA_CACHE_TAG, "max");
  revalidatePath("/settings");
  revalidatePath("/settings/project-master-data");
}

function validateMasterDataDescription(
  description: string | null,
  label: "Category" | "Tag" | "Asset tag" | "Archive category" | "Project status",
) {
  if (
    description &&
    description.length > PROJECT_MASTER_DATA_DESCRIPTION_MAX_LENGTH
  ) {
    return `${label} description must be ${PROJECT_MASTER_DATA_DESCRIPTION_MAX_LENGTH} characters or fewer.`;
  }

  return null;
}

function isAllowedArchiveCategoryIconReference(value: string | null) {
  if (!value) {
    return true;
  }

  return (
    value.startsWith(buildArchiveCategoryIconPrefix()) ||
    value.startsWith("https://") ||
    value.startsWith("http://") ||
    value.startsWith("/")
  );
}

async function validateArchiveCategoryParent(input: {
  id?: string;
  parentId: string | null;
}) {
  const parentId = input.parentId;

  if (!parentId) {
    return null;
  }

  if (input.id && parentId === input.id) {
    return "Parent category cannot be itself.";
  }

  const parent = await withPrismaRetry(() =>
    prisma.archiveCategory.findUnique({
      where: {
        id: parentId,
      },
      select: {
        id: true,
        parentId: true,
      },
    }),
  );

  if (!parent) {
    return "Choose a valid parent category.";
  }

  const visited = new Set<string>();
  let nextParentId: string | null = parent.parentId;

  while (nextParentId) {
    const ancestorId = nextParentId;

    if (visited.has(ancestorId)) {
      return "Archive category hierarchy is invalid.";
    }

    if (input.id && ancestorId === input.id) {
      return "Archive category parent cannot create a circular hierarchy.";
    }

    visited.add(ancestorId);

    const nextParent = await withPrismaRetry(() =>
      prisma.archiveCategory.findUnique({
        where: {
          id: ancestorId,
        },
        select: {
          parentId: true,
        },
      }),
    );

    nextParentId = nextParent?.parentId ?? null;
  }

  return null;
}

export async function saveProjectCategoryAction(input: SaveMasterDataInput) {
  await requireAdminUser();

  const parsed = normalizeMasterDataInput(input);

  if (!parsed.name) {
    return { error: "Category name is required." };
  }

  const descriptionError = validateMasterDataDescription(
    parsed.description,
    "Category",
  );

  if (descriptionError) {
    return { error: descriptionError };
  }

  const duplicate = await withPrismaRetry(() =>
    prisma.projectCategory.findFirst({
      where: {
        name: {
          equals: parsed.name,
          mode: "insensitive",
        },
        ...(parsed.id
          ? {
              id: {
                not: parsed.id,
              },
            }
          : {}),
      },
      select: {
        id: true,
      },
    }),
  );

  if (duplicate) {
    return { error: "A category with this name already exists." };
  }

  const category = await withPrismaRetry(() =>
    parsed.id
      ? prisma.projectCategory.update({
          where: {
            id: parsed.id,
          },
          data: {
            name: parsed.name,
            description: parsed.description,
            color: parsed.color,
            isActive: parsed.isActive,
          },
        })
      : prisma.projectCategory.create({
          data: {
            name: parsed.name,
            description: parsed.description,
            color: parsed.color,
            isActive: parsed.isActive,
          },
        }),
  );

  await revalidateProjectMasterData();

  return {
    success: true,
    item: {
      id: category.id,
      name: category.name,
    },
  };
}

export async function saveProjectTagAction(input: SaveMasterDataInput) {
  await requireAdminUser();

  const parsed = normalizeMasterDataInput(input);

  if (!parsed.name) {
    return { error: "Tag name is required." };
  }

  const descriptionError = validateMasterDataDescription(parsed.description, "Tag");

  if (descriptionError) {
    return { error: descriptionError };
  }

  const duplicate = await withPrismaRetry(() =>
    prisma.projectTag.findFirst({
      where: {
        name: {
          equals: parsed.name,
          mode: "insensitive",
        },
        ...(parsed.id
          ? {
              id: {
                not: parsed.id,
              },
            }
          : {}),
      },
      select: {
        id: true,
      },
    }),
  );

  if (duplicate) {
    return { error: "A tag with this name already exists." };
  }

  const tag = await withPrismaRetry(() =>
    parsed.id
      ? prisma.projectTag.update({
          where: {
            id: parsed.id,
          },
          data: {
            name: parsed.name,
            description: parsed.description,
            color: parsed.color,
            isActive: parsed.isActive,
          },
        })
      : prisma.projectTag.create({
          data: {
            name: parsed.name,
            description: parsed.description,
            color: parsed.color,
            isActive: parsed.isActive,
          },
        }),
  );

  await revalidateProjectMasterData();

  return {
    success: true,
    item: {
      id: tag.id,
      name: tag.name,
    },
  };
}

export async function saveProjectStatusAction(input: SaveMasterDataInput) {
  await requireAdminUser();

  const parsed = normalizeProjectStatusInput(input);

  if (!parsed.name) {
    return { error: "Project status name is required." };
  }

  if (!parsed.slug) {
    return { error: "Project status slug is required." };
  }

  if (!isProjectStatusGroup(parsed.group)) {
    return { error: "Choose a valid project status group." };
  }

  const group = parsed.group;

  const descriptionError = validateMasterDataDescription(
    parsed.description,
    "Project status",
  );

  if (descriptionError) {
    return { error: descriptionError };
  }

  const duplicate = await withPrismaRetry(() =>
    prisma.projectStatusOption.findFirst({
      where: {
        slug: {
          equals: parsed.slug,
          mode: "insensitive",
        },
        ...(parsed.id
          ? {
              id: {
                not: parsed.id,
              },
            }
          : {}),
      },
      select: {
        id: true,
      },
    }),
  );

  if (duplicate) {
    return { error: "A project status with this slug already exists." };
  }

  const status = await withPrismaRetry(() =>
    parsed.id
      ? prisma.projectStatusOption.update({
          where: {
            id: parsed.id,
          },
          data: {
            name: parsed.name,
            slug: parsed.slug,
            description: parsed.description,
            color: parsed.color,
            group,
            sortOrder: parsed.sortOrder,
            isActive: parsed.isActive,
          },
        })
      : prisma.projectStatusOption.create({
          data: {
            name: parsed.name,
            slug: parsed.slug,
            description: parsed.description,
            color: parsed.color,
            group,
            sortOrder: parsed.sortOrder,
            isActive: parsed.isActive,
          },
        }),
  );

  await revalidateProjectMasterData();
  revalidateTag("projects", "max");
  revalidatePath("/projects");
  revalidatePath("/dashboard");

  return {
    success: true,
    item: {
      id: status.id,
      name: status.name,
    },
  };
}

export async function saveAssetTagAction(input: SaveMasterDataInput) {
  await requireAdminUser();

  const parsed = normalizeMasterDataInput(input);

  if (!parsed.name) {
    return { error: "Asset tag name is required." };
  }

  const descriptionError = validateMasterDataDescription(
    parsed.description,
    "Asset tag",
  );

  if (descriptionError) {
    return { error: descriptionError };
  }

  const duplicate = await withPrismaRetry(() =>
    prisma.assetTag.findFirst({
      where: {
        name: {
          equals: parsed.name,
          mode: "insensitive",
        },
        ...(parsed.id
          ? {
              id: {
                not: parsed.id,
              },
            }
          : {}),
      },
      select: {
        id: true,
      },
    }),
  );

  if (duplicate) {
    return { error: "An asset tag with this name already exists." };
  }

  const tag = await withPrismaRetry(() =>
    parsed.id
      ? prisma.assetTag.update({
          where: {
            id: parsed.id,
          },
          data: {
            name: parsed.name,
            description: parsed.description,
            color: parsed.color,
            isActive: parsed.isActive,
          },
        })
      : prisma.assetTag.create({
          data: {
            name: parsed.name,
            description: parsed.description,
            color: parsed.color,
            isActive: parsed.isActive,
          },
        }),
  );

  await revalidateProjectMasterData();

  return {
    success: true,
    item: {
      id: tag.id,
      name: tag.name,
    },
  };
}

export async function saveArchiveCategoryAction(input: SaveMasterDataInput) {
  await requireAdminUser();

  const parsed = normalizeMasterDataInput(input);

  if (!parsed.name) {
    return { error: "Archive category name is required." };
  }

  if (!parsed.slug) {
    return { error: "Archive category slug is required." };
  }

  const descriptionError = validateMasterDataDescription(
    parsed.description,
    "Archive category",
  );

  if (descriptionError) {
    return { error: descriptionError };
  }

  if (!isAllowedArchiveCategoryIconReference(parsed.iconUrl)) {
    return { error: "Upload a valid archive category icon." };
  }

  const parentError = await validateArchiveCategoryParent({
    id: parsed.id,
    parentId: parsed.parentId,
  });

  if (parentError) {
    return { error: parentError };
  }

  const duplicate = await withPrismaRetry(() =>
    prisma.archiveCategory.findFirst({
      where: {
        slug: {
          equals: parsed.slug,
          mode: "insensitive",
        },
        ...(parsed.id
          ? {
              id: {
                not: parsed.id,
              },
            }
          : {}),
      },
      select: {
        id: true,
      },
    }),
  );

  if (duplicate) {
    return { error: "An archive category with this slug already exists." };
  }

  const category = await withPrismaRetry(() =>
    parsed.id
      ? prisma.archiveCategory.update({
          where: {
            id: parsed.id,
          },
          data: {
            name: parsed.name,
            slug: parsed.slug,
            description: parsed.description,
            iconUrl: parsed.iconUrl,
            iconKey: parsed.iconKey,
            color: parsed.color,
            parentId: parsed.parentId,
            sortOrder: parsed.sortOrder,
            isActive: parsed.isActive,
          },
        })
      : prisma.archiveCategory.create({
          data: {
            name: parsed.name,
            slug: parsed.slug,
            description: parsed.description,
            iconUrl: parsed.iconUrl,
            iconKey: parsed.iconKey,
            color: parsed.color,
            parentId: parsed.parentId,
            sortOrder: parsed.sortOrder,
            isActive: parsed.isActive,
          },
        }),
  );

  await revalidateProjectMasterData();
  revalidatePath("/archives");
  revalidatePath(`/archives/${category.slug}`);

  return {
    success: true,
    item: {
      id: category.id,
      name: category.name,
    },
  };
}

export async function saveProjectCurrencyAction(input: SaveMasterDataInput) {
  await requireAdminUser();

  const parsed = normalizeMasterDataInput(input);

  if (!parsed.name) {
    return { error: "Currency name is required." };
  }

  if (!parsed.code) {
    return { error: "Currency code is required." };
  }

  if (!/^[A-Z]{3}$/.test(parsed.code)) {
    return { error: "Currency code must be 3 uppercase letters." };
  }

  const duplicate = await withPrismaRetry(() =>
    prisma.projectCurrency.findFirst({
      where: {
        OR: [
          {
            code: {
              equals: parsed.code,
              mode: "insensitive",
            },
          },
          {
            name: {
              equals: parsed.name,
              mode: "insensitive",
            },
          },
        ],
        ...(parsed.id
          ? {
              id: {
                not: parsed.id,
              },
            }
          : {}),
      },
      select: {
        id: true,
        code: true,
        name: true,
      },
    }),
  );

  if (duplicate) {
    if (duplicate.code.toLowerCase() === parsed.code.toLowerCase()) {
      return { error: "A currency with this code already exists." };
    }

    return { error: "A currency with this name already exists." };
  }

  await withPrismaRetry(() =>
    parsed.id
      ? prisma.projectCurrency.update({
          where: {
            id: parsed.id,
          },
          data: {
            name: parsed.name,
            code: parsed.code,
            isActive: parsed.isActive,
          },
        })
      : prisma.projectCurrency.create({
          data: {
            name: parsed.name,
            code: parsed.code,
            isActive: parsed.isActive,
          },
        }),
  );

  await revalidateProjectMasterData();

  return { success: true };
}

export async function setProjectCategoryStatusAction(input: ToggleMasterDataInput) {
  await requireAdminUser();

  await withPrismaRetry(() =>
    prisma.projectCategory.update({
      where: {
        id: input.id,
      },
      data: {
        isActive: input.isActive,
      },
    }),
  );

  await revalidateProjectMasterData();

  return { success: true };
}

export async function setProjectTagStatusAction(input: ToggleMasterDataInput) {
  await requireAdminUser();

  await withPrismaRetry(() =>
    prisma.projectTag.update({
      where: {
        id: input.id,
      },
      data: {
        isActive: input.isActive,
      },
    }),
  );

  await revalidateProjectMasterData();

  return { success: true };
}

export async function setProjectStatusAction(input: ToggleMasterDataInput) {
  await requireAdminUser();

  await withPrismaRetry(() =>
    prisma.projectStatusOption.update({
      where: {
        id: input.id,
      },
      data: {
        isActive: input.isActive,
      },
    }),
  );

  await revalidateProjectMasterData();
  revalidateTag("projects", "max");
  revalidatePath("/projects");
  revalidatePath("/dashboard");

  return { success: true };
}

export async function setAssetTagStatusAction(input: ToggleMasterDataInput) {
  await requireAdminUser();

  await withPrismaRetry(() =>
    prisma.assetTag.update({
      where: {
        id: input.id,
      },
      data: {
        isActive: input.isActive,
      },
    }),
  );

  await revalidateProjectMasterData();

  return { success: true };
}

export async function setArchiveCategoryStatusAction(input: ToggleMasterDataInput) {
  await requireAdminUser();

  const category = await withPrismaRetry(() =>
    prisma.archiveCategory.update({
      where: {
        id: input.id,
      },
      data: {
        isActive: input.isActive,
      },
      select: {
        slug: true,
      },
    }),
  );

  await revalidateProjectMasterData();
  revalidatePath("/archives");
  revalidatePath(`/archives/${category.slug}`);

  return { success: true };
}

export async function setProjectCurrencyStatusAction(input: ToggleMasterDataInput) {
  await requireAdminUser();

  await withPrismaRetry(() =>
    prisma.projectCurrency.update({
      where: {
        id: input.id,
      },
      data: {
        isActive: input.isActive,
      },
    }),
  );

  await revalidateProjectMasterData();

  return { success: true };
}

export async function deleteProjectCategoryAction(id: string) {
  await requireSuperAdminUser();

  const category = await withPrismaRetry(() =>
    prisma.projectCategory.findUnique({
      where: { id },
      select: { id: true, name: true },
    }),
  );

  if (!category) {
    return { error: "Category not found." };
  }

  const usageCount = await withPrismaRetry(() =>
    prisma.project.count({
      where: {
        category: {
          equals: category.name,
          mode: "insensitive",
        },
      },
    }),
  );

  if (usageCount > 0) {
    return { error: "This category is already used by existing projects. Deactivate it instead." };
  }

  await withPrismaRetry(() =>
    prisma.projectCategory.delete({
      where: { id },
    }),
  );

  await revalidateProjectMasterData();

  return { success: true };
}

export async function deleteProjectTagAction(id: string) {
  await requireSuperAdminUser();

  const tag = await withPrismaRetry(() =>
    prisma.projectTag.findUnique({
      where: { id },
      select: { id: true, name: true },
    }),
  );

  if (!tag) {
    return { error: "Tag not found." };
  }

  const usageCount = await withPrismaRetry(() =>
    prisma.project.count({
      where: {
        tags: {
          some: {
            tagId: tag.id,
          },
        },
      },
    }),
  );

  if (usageCount > 0) {
    return { error: "This tag is already used by existing projects. Deactivate it instead." };
  }

  await withPrismaRetry(() =>
    prisma.projectTag.delete({
      where: { id },
    }),
  );

  await revalidateProjectMasterData();

  return { success: true };
}

export async function deleteProjectStatusAction(id: string) {
  await requireSuperAdminUser();

  const status = await withPrismaRetry(() =>
    prisma.projectStatusOption.findUnique({
      where: { id },
      select: { id: true, name: true },
    }),
  );

  if (!status) {
    return { error: "Project status not found." };
  }

  const usageCount = await withPrismaRetry(() =>
    prisma.project.count({
      where: {
        statusId: status.id,
      },
    }),
  );

  if (usageCount > 0) {
    return { error: "This project status is already used by existing projects. Deactivate it instead." };
  }

  await withPrismaRetry(() =>
    prisma.projectStatusOption.delete({
      where: { id },
    }),
  );

  await revalidateProjectMasterData();
  revalidateTag("projects", "max");
  revalidatePath("/projects");
  revalidatePath("/dashboard");

  return { success: true };
}

export async function deleteAssetTagAction(id: string) {
  await requireSuperAdminUser();

  const tag = await withPrismaRetry(() =>
    prisma.assetTag.findUnique({
      where: { id },
      select: { id: true, name: true },
    }),
  );

  if (!tag) {
    return { error: "Asset tag not found." };
  }

  const usageCount = await withPrismaRetry(() =>
    Promise.all([
      prisma.projectAttachmentAssetTagAssignment.count({
        where: {
          tagId: tag.id,
        },
      }),
      prisma.manualArchiveFileAssetTagAssignment.count({
        where: {
          tagId: tag.id,
        },
      }),
      prisma.manualLibraryAssetTagAssignment.count({
        where: {
          tagId: tag.id,
        },
      }),
    ]).then((counts) => counts.reduce((total, count) => total + count, 0)),
  );

  if (usageCount > 0) {
    return { error: "This asset tag is already used by existing assets. Deactivate it instead." };
  }

  await withPrismaRetry(() =>
    prisma.assetTag.delete({
      where: { id },
    }),
  );

  await revalidateProjectMasterData();

  return { success: true };
}

export async function deleteArchiveCategoryAction(id: string) {
  await requireSuperAdminUser();

  const category = await withPrismaRetry(() =>
    prisma.archiveCategory.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        slug: true,
        children: {
          select: {
            id: true,
          },
          take: 1,
        },
      },
    }),
  );

  if (!category) {
    return { error: "Archive category not found." };
  }

  if (category.children.length > 0) {
    return { error: "This archive category has child categories. Move or delete them first." };
  }

  const usageCount = await withPrismaRetry(() =>
    Promise.all([
      prisma.projectArchive.count({
        where: {
          archiveCategoryId: category.id,
        },
      }),
      prisma.manualArchiveFile.count({
        where: {
          archiveCategoryId: category.id,
        },
      }),
    ]).then((counts) => counts.reduce((total, count) => total + count, 0)),
  );

  if (usageCount > 0) {
    return { error: "This archive category is already used by archive records. Deactivate it instead." };
  }

  await withPrismaRetry(() =>
    prisma.archiveCategory.delete({
      where: { id },
    }),
  );

  await revalidateProjectMasterData();
  revalidatePath("/archives");
  revalidatePath(`/archives/${category.slug}`);

  return { success: true };
}

export async function deleteProjectCurrencyAction(id: string) {
  await requireSuperAdminUser();

  const currency = await withPrismaRetry(() =>
    prisma.projectCurrency.findUnique({
      where: { id },
      select: { id: true, code: true },
    }),
  );

  if (!currency) {
    return { error: "Currency not found." };
  }

  const usageCount = await withPrismaRetry(() =>
    prisma.project.count({
      where: {
        currency: {
          equals: currency.code,
          mode: "insensitive",
        },
      },
    }),
  );

  if (usageCount > 0) {
    return { error: "This currency is already used by existing projects. Deactivate it instead." };
  }

  await withPrismaRetry(() =>
    prisma.projectCurrency.delete({
      where: { id },
    }),
  );

  await revalidateProjectMasterData();

  return { success: true };
}
