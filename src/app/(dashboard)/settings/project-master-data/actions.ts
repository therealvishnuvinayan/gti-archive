"use server";

import { revalidatePath, revalidateTag } from "next/cache";

import { requireUser } from "@/lib/auth";
import { requirePermission } from "@/lib/permissions/require";
import { prisma, withPrismaRetry } from "@/lib/prisma";
import {
  PROJECT_MASTER_DATA_CACHE_TAG,
  PROJECT_MASTER_DATA_DESCRIPTION_MAX_LENGTH,
} from "@/lib/project-master-data";

type SaveMasterDataInput = {
  id?: string;
  name: string;
  description?: string;
  color?: string;
  code?: string;
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
    isActive: input.isActive,
  };
}

async function revalidateProjectMasterData() {
  revalidateTag(PROJECT_MASTER_DATA_CACHE_TAG, "max");
  revalidatePath("/settings");
  revalidatePath("/settings/project-master-data");
}

function validateMasterDataDescription(
  description: string | null,
  label: "Category" | "Tag" | "Asset tag",
) {
  if (
    description &&
    description.length > PROJECT_MASTER_DATA_DESCRIPTION_MAX_LENGTH
  ) {
    return `${label} description must be ${PROJECT_MASTER_DATA_DESCRIPTION_MAX_LENGTH} characters or fewer.`;
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
