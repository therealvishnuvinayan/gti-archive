"use server";

import { revalidatePath, revalidateTag, updateTag } from "next/cache";
import { AttachmentStatus } from "@prisma/client";

import { requireUser } from "@/lib/auth";
import { CALENDAR_CACHE_TAG } from "@/lib/calendar";
import {
  CALENDAR_COLLABORATORS_CACHE_TAG,
  COLLABORATORS_CACHE_TAG,
} from "@/lib/collaboration";
import {
  permissionProfileTypeValues,
  type PermissionKey,
  type PermissionProfileType,
  type PermissionRole,
} from "@/lib/permissions/definitions";
import {
  getPermissionProfileCacheTag,
  getPermissionProfile,
  PERMISSION_PROFILE_CACHE_TAG,
  resetPermissionProfileToDefaults,
  savePermissionProfile,
  syncPermissionDefinitions,
} from "@/lib/permissions/profiles";
import { hasPermission } from "@/lib/permissions/resolver";
import { prisma, withPrismaRetry } from "@/lib/prisma";
import { PROJECTS_CACHE_TAG } from "@/lib/projects";
import {
  buildUserAvatarPrefix,
  deleteObjectIfNeeded,
} from "@/lib/storage/s3";
import {
  getManagedUserPermissionRecord,
  updateManagedUserPermissions,
  type ManagedArchiveAccessLevel,
  type ManagedArchiveAssetAccessRecord,
} from "@/lib/user-permissions";
import {
  isBusinessAdministratorRole,
  isEditableUserRole,
  isProtectedRootRole,
} from "@/lib/user-role-compatibility";

type SaveUserAccessInput = {
  userId: string;
  avatarUrl?: string;
  role: PermissionRole;
  archiveAccessLevel: ManagedArchiveAccessLevel;
  archiveAssetIds?: string[];
};

type SearchArchiveAccessAssetsInput = {
  query?: string;
  categoryId?: string;
};

type ArchiveAccessAssetSearchRecord = ManagedArchiveAssetAccessRecord & {
  recordTypeLabel: string;
};

type PermissionProfileInput = {
  profileType: PermissionProfileType;
  profileKey: string;
};

function isCurrentlyEditablePermissionProfile(input: PermissionProfileInput) {
  return input.profileType !== "role" || isEditableUserRole(input.profileKey);
}

function getSessionCacheTag(token: string) {
  return `session:${token}`;
}

async function revalidateUserSessionCaches(userIds?: string[]) {
  const sessions = await withPrismaRetry(() =>
    prisma.session.findMany({
      where: {
        expiresAt: {
          gt: new Date(),
        },
        ...(userIds
          ? {
              userId: {
                in: userIds,
              },
            }
          : {}),
      },
      select: {
        token: true,
      },
    }),
  );

  for (const session of sessions) {
    revalidateTag(getSessionCacheTag(session.token), "max");
  }
}

async function revalidatePermissionSensitiveCaches(userIds?: string[]) {
  revalidateTag(PROJECTS_CACHE_TAG, "max");
  revalidateTag(COLLABORATORS_CACHE_TAG, "max");
  revalidateTag(CALENDAR_COLLABORATORS_CACHE_TAG, "max");
  revalidateTag(CALENDAR_CACHE_TAG, "max");

  revalidatePath("/users");
  revalidatePath("/settings");
  revalidatePath("/settings/permissions");
  revalidatePath("/");
  revalidatePath("/projects");
  revalidatePath("/calendar");
  revalidatePath("/collaboration");
  revalidatePath("/library");
  revalidatePath("/archives");
  revalidatePath("/notifications");

  await revalidateUserSessionCaches(userIds);
}

function updatePermissionProfileCache(
  profileType: PermissionProfileType,
  profileKey: string,
) {
  updateTag(PERMISSION_PROFILE_CACHE_TAG);
  updateTag(getPermissionProfileCacheTag(profileType, profileKey));
}

async function requireBusinessAdministratorPermission(permissionKey: PermissionKey) {
  const currentUser = await requireUser();

  if (
    !isBusinessAdministratorRole(currentUser.role) ||
    !hasPermission(currentUser, permissionKey)
  ) {
    return null;
  }

  return currentUser;
}

function formatArchiveAccessDate(date: Date | null | undefined) {
  if (!date) {
    return "Not dated";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function normalizeArchiveAssetSearchTerm(query: string | undefined) {
  return query?.trim().slice(0, 120) ?? "";
}

function getArchiveAssetSearchRecord(input: {
  id: string;
  recordType: "FINAL_ARCHIVE_FILE" | "MANUAL_ARCHIVE_FILE";
  fileName: string;
  categoryId: string | null;
  categoryLabel: string;
  sourceLabel: string;
  archivedAt: Date | null;
}): ArchiveAccessAssetSearchRecord {
  return {
    id: `${input.recordType === "FINAL_ARCHIVE_FILE" ? "project" : "manual"}:${input.id}`,
    recordType: input.recordType,
    recordTypeLabel:
      input.recordType === "FINAL_ARCHIVE_FILE" ? "Final Archive File" : "Manual Archive File",
    fileName: input.fileName,
    categoryId: input.categoryId,
    categoryLabel: input.categoryLabel,
    sourceLabel: input.sourceLabel,
    archivedAtLabel: formatArchiveAccessDate(input.archivedAt),
  };
}

export async function saveUserAccessAction(input: SaveUserAccessInput) {
  const currentUser = await requireBusinessAdministratorPermission("users.update");

  if (!currentUser) {
    return { error: "Only administrators with user update access can update users." };
  }

  const userId = input.userId.trim();

  if (!userId) {
    return { error: "User id is missing." };
  }

  if (!isEditableUserRole(input.role)) {
    return { error: "Choose a valid role." };
  }

  const existingUser = await getManagedUserPermissionRecord(userId);

  if (!existingUser) {
    return { error: "User not found." };
  }

  if (isProtectedRootRole(existingUser.role)) {
    return { error: "Protected Super Admin accounts cannot be changed here." };
  }

  const avatarUrl = input.avatarUrl?.trim() || undefined;

  if (avatarUrl && avatarUrl !== existingUser.avatarUrl) {
    const allowedAvatarPrefix = buildUserAvatarPrefix(userId);

    if (
      !avatarUrl.startsWith(allowedAvatarPrefix) ||
      avatarUrl.length <= allowedAvatarPrefix.length
    ) {
      return { error: "Invalid profile photo. Please upload the photo again." };
    }
  }

  const user = await updateManagedUserPermissions({
    userId,
    avatarUrl,
    role: input.role,
    archiveAccessLevel: input.archiveAccessLevel,
    archiveAssetIds: input.archiveAssetIds ?? [],
    updatedById: currentUser.id,
  });

  if (avatarUrl && existingUser.avatarUrl && avatarUrl !== existingUser.avatarUrl) {
    await deleteObjectIfNeeded(existingUser.avatarUrl).catch(() => undefined);
  }

  await revalidatePermissionSensitiveCaches([userId, currentUser.id]);

  return {
    success: true,
    user,
  };
}

export async function searchArchiveAssetsForAccessAction(
  input: SearchArchiveAccessAssetsInput,
) {
  const currentUser = await requireBusinessAdministratorPermission("users.update");

  if (!currentUser) {
    return { error: "Only administrators with user update access can search archive assets." };
  }

  const query = normalizeArchiveAssetSearchTerm(input.query);
  const categoryId = input.categoryId?.trim() || "";
  const queryWhere = query
    ? {
        OR: [
          {
            finalArchiveFileName: {
              contains: query,
              mode: "insensitive" as const,
            },
          },
          {
            originalFileName: {
              contains: query,
              mode: "insensitive" as const,
            },
          },
          {
            archive: {
              is: {
                projectName: {
                  contains: query,
                  mode: "insensitive" as const,
                },
              },
            },
          },
          {
            archive: {
              is: {
                projectCategory: {
                  contains: query,
                  mode: "insensitive" as const,
                },
              },
            },
          },
          {
            archive: {
              is: {
                projectTag: {
                  contains: query,
                  mode: "insensitive" as const,
                },
              },
            },
          },
          {
            artworkMetadata: {
              is: {
                artworkId: {
                  contains: query,
                  mode: "insensitive" as const,
                },
              },
            },
          },
          {
            artworkMetadata: {
              is: {
                titleWorkingName: {
                  contains: query,
                  mode: "insensitive" as const,
                },
              },
            },
          },
        ],
      }
    : {};
  const manualQueryWhere = query
    ? {
        OR: [
          {
            fileName: {
              contains: query,
              mode: "insensitive" as const,
            },
          },
          {
            originalFileName: {
              contains: query,
              mode: "insensitive" as const,
            },
          },
          {
            projectName: {
              contains: query,
              mode: "insensitive" as const,
            },
          },
          {
            projectCreatedBy: {
              contains: query,
              mode: "insensitive" as const,
            },
          },
          {
            artworkMetadata: {
              is: {
                artworkId: {
                  contains: query,
                  mode: "insensitive" as const,
                },
              },
            },
          },
          {
            artworkMetadata: {
              is: {
                titleWorkingName: {
                  contains: query,
                  mode: "insensitive" as const,
                },
              },
            },
          },
        ],
      }
    : {};

  const [categories, projectFiles, manualFiles] = await withPrismaRetry(() =>
    Promise.all([
      prisma.archiveCategory.findMany({
        where: {
          isActive: true,
        },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
        },
      }),
      prisma.archivedProjectFile.findMany({
        where: {
          ...queryWhere,
          ...(categoryId
            ? {
                archive: {
                  is: {
                    archiveCategoryId: categoryId,
                  },
                },
              }
            : {}),
        },
        orderBy: [
          {
            archivedAt: "desc",
          },
          {
            finalArchiveFileName: "asc",
          },
        ],
        take: 50,
        select: {
          id: true,
          finalArchiveFileName: true,
          archivedAt: true,
          archive: {
            select: {
              projectName: true,
              archiveCategory: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      }),
      prisma.manualArchiveFile.findMany({
        where: {
          ...manualQueryWhere,
          status: AttachmentStatus.READY,
          ...(categoryId ? { archiveCategoryId: categoryId } : {}),
        },
        orderBy: [
          {
            uploadedAt: "desc",
          },
          {
            fileName: "asc",
          },
        ],
        take: 50,
        select: {
          id: true,
          fileName: true,
          uploadedAt: true,
          projectName: true,
          archiveCategory: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
    ]),
  );

  const assets = [
    ...projectFiles.map((file) =>
      getArchiveAssetSearchRecord({
        id: file.id,
        recordType: "FINAL_ARCHIVE_FILE",
        fileName: file.finalArchiveFileName,
        categoryId: file.archive.archiveCategory?.id ?? null,
        categoryLabel: file.archive.archiveCategory?.name ?? "Uncategorized",
        sourceLabel: file.archive.projectName,
        archivedAt: file.archivedAt,
      }),
    ),
    ...manualFiles.map((file) =>
      getArchiveAssetSearchRecord({
        id: file.id,
        recordType: "MANUAL_ARCHIVE_FILE",
        fileName: file.fileName,
        categoryId: file.archiveCategory?.id ?? null,
        categoryLabel: file.archiveCategory?.name ?? "Uncategorized",
        sourceLabel: file.projectName?.trim() || "Manual Archive",
        archivedAt: file.uploadedAt,
      }),
    ),
  ]
    .sort((left, right) =>
      right.archivedAtLabel.localeCompare(left.archivedAtLabel) ||
      left.fileName.localeCompare(right.fileName),
    )
    .slice(0, 75);

  return {
    success: true,
    assets,
    categories,
  };
}

export async function getPermissionProfileAction(input: PermissionProfileInput) {
  const currentUser = await requireBusinessAdministratorPermission(
    "users.managePermissions",
  );

  if (!currentUser || !hasPermission(currentUser, "settings.managePermissions")) {
    return { error: "Only administrators with permission management access can manage profiles." };
  }

  if (!permissionProfileTypeValues.includes(input.profileType)) {
    return { error: "Choose a valid permission profile type." };
  }

  if (!isCurrentlyEditablePermissionProfile(input)) {
    return { error: "Choose a currently editable role profile." };
  }

  try {
    const profile = await getPermissionProfile(input.profileType, input.profileKey);

    return {
      success: true,
      profile,
    };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to load this permission profile right now.",
    };
  }
}

export async function savePermissionProfileAction(
  input: PermissionProfileInput & {
    state: Record<string, boolean>;
  },
) {
  const currentUser = await requireBusinessAdministratorPermission(
    "users.managePermissions",
  );

  if (!currentUser || !hasPermission(currentUser, "settings.managePermissions")) {
    return { error: "Only administrators with permission management access can manage profiles." };
  }

  if (!permissionProfileTypeValues.includes(input.profileType)) {
    return { error: "Choose a valid permission profile type." };
  }

  if (!isCurrentlyEditablePermissionProfile(input)) {
    return { error: "Choose a currently editable role profile." };
  }

  try {
    const profile = await savePermissionProfile({
      profileType: input.profileType,
      profileKey: input.profileKey,
      state: input.state,
    });

    updatePermissionProfileCache(input.profileType, input.profileKey);
    await revalidatePermissionSensitiveCaches();

    return {
      success: true,
      profile,
      message: "Permission profile updated. Active sessions were refreshed.",
    };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to save this permission profile right now.",
    };
  }
}

export async function resetPermissionProfileToDefaultsAction(
  input: PermissionProfileInput,
) {
  const currentUser = await requireBusinessAdministratorPermission(
    "users.managePermissions",
  );

  if (!currentUser || !hasPermission(currentUser, "settings.managePermissions")) {
    return { error: "Only administrators with permission management access can manage profiles." };
  }

  if (!permissionProfileTypeValues.includes(input.profileType)) {
    return { error: "Choose a valid permission profile type." };
  }

  if (!isCurrentlyEditablePermissionProfile(input)) {
    return { error: "Choose a currently editable role profile." };
  }

  try {
    const profile = await resetPermissionProfileToDefaults(
      input.profileType,
      input.profileKey,
    );

    updatePermissionProfileCache(input.profileType, input.profileKey);
    await revalidatePermissionSensitiveCaches();

    return {
      success: true,
      profile,
      message: "Permission profile reset to code defaults.",
    };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to reset this permission profile right now.",
    };
  }
}

export async function syncPermissionDefinitionsAction() {
  const currentUser = await requireBusinessAdministratorPermission(
    "users.managePermissions",
  );

  if (!currentUser || !hasPermission(currentUser, "settings.managePermissions")) {
    return { error: "Only administrators with permission management access can sync definitions." };
  }

  try {
    const result = await syncPermissionDefinitions();
    await revalidatePermissionSensitiveCaches();

    return {
      success: true,
      result,
    };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to sync permission definitions right now.",
    };
  }
}
