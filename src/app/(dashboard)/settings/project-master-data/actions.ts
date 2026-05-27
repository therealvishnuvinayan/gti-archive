"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { UserRole } from "@prisma/client";

import { requireUser } from "@/lib/auth";
import { prisma, withPrismaRetry } from "@/lib/prisma";
import { PROJECT_MASTER_DATA_CACHE_TAG } from "@/lib/project-master-data";

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

  if (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN) {
    throw new Error("Only administrators can manage project master data.");
  }

  return user;
}

async function requireSuperAdminUser() {
  const user = await requireUser();

  if (user.role !== UserRole.SUPER_ADMIN) {
    throw new Error("Only super admins can delete project master data.");
  }

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

export async function saveProjectCategoryAction(input: SaveMasterDataInput) {
  await requireAdminUser();

  const parsed = normalizeMasterDataInput(input);

  if (!parsed.name) {
    return { error: "Category name is required." };
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
        tag: {
          equals: tag.name,
          mode: "insensitive",
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
