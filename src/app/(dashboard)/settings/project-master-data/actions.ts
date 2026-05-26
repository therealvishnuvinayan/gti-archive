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

function normalizeMasterDataInput(input: SaveMasterDataInput) {
  return {
    id: input.id?.trim() || undefined,
    name: input.name.trim(),
    description: input.description?.trim() || null,
    color: input.color?.trim() || null,
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

  await withPrismaRetry(() =>
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

  return { success: true };
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

  await withPrismaRetry(() =>
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
