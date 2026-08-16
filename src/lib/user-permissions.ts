import {
  ArchiveAccessLevel,
  AttachmentStatus,
  Prisma,
  UserRole,
} from "@prisma/client";

import type { PermissionRole } from "@/lib/permissions/definitions";
import { prisma, withPrismaRetry } from "@/lib/prisma";
import {
  isBusinessAdministratorRole,
  isProtectedRootRole,
} from "@/lib/user-role-compatibility";

export type ManagedUserStatus = "ACTIVE" | "INVITED" | "INVITE_EXPIRED";
export type ManagedArchiveAccessLevel = "NONE" | "FULL" | "PARTIAL";

export type ManagedArchiveAssetAccessRecord = {
  id: string;
  recordType: "FINAL_ARCHIVE_FILE" | "MANUAL_ARCHIVE_FILE";
  fileName: string;
  categoryId: string | null;
  categoryLabel: string;
  sourceLabel: string;
  archivedAtLabel: string;
};

export type ManagedUserRecord = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: PermissionRole;
  projectCreationAccessGranted: boolean;
  canAccessArchives: boolean;
  archiveAccessLevel: ManagedArchiveAccessLevel;
  archiveAssetAccesses: ManagedArchiveAssetAccessRecord[];
  status: ManagedUserStatus;
};

export type ManagedUserUpdateInput = {
  userId: string;
  avatarUrl?: string;
  role: PermissionRole;
  projectCreationAccessGranted: boolean;
  archiveAccessLevel: ManagedArchiveAccessLevel;
  archiveAssetIds?: string[];
  updatedById?: string | null;
};

const archiveAccessLevelValues = ["NONE", "FULL", "PARTIAL"] as const;

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

function getFallbackName(email: string) {
  const [localPart] = email.split("@");

  return localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function getManagedUserStatus(user: {
  inviteToken: string | null;
  inviteExpiresAt: Date | null;
  inviteAcceptedAt: Date | null;
}) {
  if (user.inviteAcceptedAt || !user.inviteToken) {
    return "ACTIVE" satisfies ManagedUserStatus;
  }

  if (user.inviteExpiresAt && user.inviteExpiresAt.getTime() < Date.now()) {
    return "INVITE_EXPIRED" satisfies ManagedUserStatus;
  }

  return "INVITED" satisfies ManagedUserStatus;
}

function getArchiveAssetAccessId(input: {
  archivedProjectFileId?: string | null;
  manualArchiveFileId?: string | null;
}) {
  if (input.archivedProjectFileId) {
    return `project:${input.archivedProjectFileId}`;
  }

  if (input.manualArchiveFileId) {
    return `manual:${input.manualArchiveFileId}`;
  }

  return null;
}

function mapArchiveAssetAccess(
  access: {
    archivedProjectFileId: string | null;
    manualArchiveFileId: string | null;
    archivedProjectFile?: {
      finalArchiveFileName: string;
      archivedAt: Date;
      archive: {
        projectName: string;
        archiveCategory: { id: string; name: string } | null;
      };
    } | null;
    manualArchiveFile?: {
      fileName: string;
      uploadedAt: Date;
      projectName: string | null;
      archiveCategory: { id: string; name: string } | null;
    } | null;
  },
): ManagedArchiveAssetAccessRecord | null {
  const id = getArchiveAssetAccessId(access);

  if (!id) {
    return null;
  }

  if (access.archivedProjectFile) {
    const category = access.archivedProjectFile.archive.archiveCategory;

    return {
      id,
      recordType: "FINAL_ARCHIVE_FILE",
      fileName: access.archivedProjectFile.finalArchiveFileName,
      categoryId: category?.id ?? null,
      categoryLabel: category?.name ?? "Uncategorized",
      sourceLabel: access.archivedProjectFile.archive.projectName,
      archivedAtLabel: formatArchiveAccessDate(access.archivedProjectFile.archivedAt),
    };
  }

  if (access.manualArchiveFile) {
    const category = access.manualArchiveFile.archiveCategory;

    return {
      id,
      recordType: "MANUAL_ARCHIVE_FILE",
      fileName: access.manualArchiveFile.fileName,
      categoryId: category?.id ?? null,
      categoryLabel: category?.name ?? "Uncategorized",
      sourceLabel: access.manualArchiveFile.projectName?.trim() || "Manual Archive",
      archivedAtLabel: formatArchiveAccessDate(access.manualArchiveFile.uploadedAt),
    };
  }

  return null;
}

function getEffectiveManagedArchiveAccessLevel(user: {
  role: UserRole;
  archiveAccess?: { level: ArchiveAccessLevel } | null;
}): ManagedArchiveAccessLevel {
  if (isBusinessAdministratorRole(user.role)) {
    return "FULL";
  }

  return user.archiveAccess?.level ?? "NONE";
}

function mapManagedUser(user: {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  role: UserRole;
  projectCreationAccessGranted: boolean;
  inviteToken: string | null;
  inviteExpiresAt: Date | null;
  inviteAcceptedAt: Date | null;
  archiveAccess?: { id: string; level: ArchiveAccessLevel } | null;
  archiveAssetAccesses?: Array<{
    archivedProjectFileId: string | null;
    manualArchiveFileId: string | null;
    archivedProjectFile?: {
      finalArchiveFileName: string;
      archivedAt: Date;
      archive: {
        projectName: string;
        archiveCategory: { id: string; name: string } | null;
      };
    } | null;
    manualArchiveFile?: {
      fileName: string;
      uploadedAt: Date;
      projectName: string | null;
      archiveCategory: { id: string; name: string } | null;
    } | null;
  }>;
}): ManagedUserRecord {
  const archiveAccessLevel = getEffectiveManagedArchiveAccessLevel(user);
  const archiveAssetAccesses = (user.archiveAssetAccesses ?? [])
    .map(mapArchiveAssetAccess)
    .filter((asset): asset is ManagedArchiveAssetAccessRecord => Boolean(asset));

  return {
    id: user.id,
    name: user.name?.trim() || getFallbackName(user.email),
    email: user.email,
    avatarUrl: user.avatarUrl,
    role: user.role,
    projectCreationAccessGranted: user.projectCreationAccessGranted,
    canAccessArchives: archiveAccessLevel !== "NONE",
    archiveAccessLevel,
    archiveAssetAccesses,
    status: getManagedUserStatus(user),
  };
}

export async function listUsersForPermissionManagement() {
  const users = await withPrismaRetry(() =>
    prisma.user.findMany({
      orderBy: [
        { role: "asc" },
        { name: "asc" },
        { email: "asc" },
      ],
      select: {
        id: true,
        name: true,
        email: true,
        avatarUrl: true,
        role: true,
        projectCreationAccessGranted: true,
        inviteToken: true,
        inviteExpiresAt: true,
        inviteAcceptedAt: true,
        archiveAccess: {
          select: {
            id: true,
            level: true,
          },
        },
        archiveAssetAccesses: {
          orderBy: {
            createdAt: "asc",
          },
          select: {
            archivedProjectFileId: true,
            manualArchiveFileId: true,
            archivedProjectFile: {
              select: {
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
            },
            manualArchiveFile: {
              select: {
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
            },
          },
        },
      },
    }),
  );

  return users.map(mapManagedUser);
}

export async function getManagedUserPermissionRecord(userId: string) {
  const user = await withPrismaRetry(() =>
    prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        id: true,
        name: true,
        email: true,
        avatarUrl: true,
        role: true,
        projectCreationAccessGranted: true,
        inviteToken: true,
        inviteExpiresAt: true,
        inviteAcceptedAt: true,
        archiveAccess: {
          select: {
            id: true,
            level: true,
          },
        },
        archiveAssetAccesses: {
          orderBy: {
            createdAt: "asc",
          },
          select: {
            archivedProjectFileId: true,
            manualArchiveFileId: true,
            archivedProjectFile: {
              select: {
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
            },
            manualArchiveFile: {
              select: {
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
            },
          },
        },
      },
    }),
  );

  return user ? mapManagedUser(user) : null;
}

function normalizeArchiveAssetIds(assetIds: string[] | undefined) {
  const projectFileIds = new Set<string>();
  const manualFileIds = new Set<string>();

  for (const assetId of assetIds ?? []) {
    const trimmedId = assetId.trim();

    if (!trimmedId) {
      continue;
    }

    const separatorIndex = trimmedId.indexOf(":");

    if (separatorIndex <= 0) {
      throw new Error("Choose valid archive assets for partial access.");
    }

    const type = trimmedId.slice(0, separatorIndex);
    const id = trimmedId.slice(separatorIndex + 1).trim();

    if (!id) {
      throw new Error("Choose valid archive assets for partial access.");
    }

    if (type === "project") {
      projectFileIds.add(id);
      continue;
    }

    if (type === "manual") {
      manualFileIds.add(id);
      continue;
    }

    throw new Error("Choose valid archive assets for partial access.");
  }

  return {
    projectFileIds: [...projectFileIds],
    manualFileIds: [...manualFileIds],
  };
}

async function validateArchiveAssetSelection(
  tx: Prisma.TransactionClient,
  input: ReturnType<typeof normalizeArchiveAssetIds>,
) {
  const [projectFileCount, manualFileCount] = await Promise.all([
    input.projectFileIds.length > 0
      ? tx.archivedProjectFile.count({
          where: {
            id: {
              in: input.projectFileIds,
            },
          },
        })
      : Promise.resolve(0),
    input.manualFileIds.length > 0
      ? tx.manualArchiveFile.count({
          where: {
            id: {
              in: input.manualFileIds,
            },
            status: AttachmentStatus.READY,
          },
        })
      : Promise.resolve(0),
  ]);

  if (
    projectFileCount !== input.projectFileIds.length ||
    manualFileCount !== input.manualFileIds.length
  ) {
    throw new Error("One or more selected archive assets are no longer available.");
  }
}

function getRequestedArchiveAccessLevel(
  input: Pick<ManagedUserUpdateInput, "role" | "archiveAccessLevel">,
) {
  if (!archiveAccessLevelValues.includes(input.archiveAccessLevel)) {
    throw new Error("Choose a valid archive access level.");
  }

  if (isBusinessAdministratorRole(input.role)) {
    return ArchiveAccessLevel.FULL;
  }

  return input.archiveAccessLevel as ArchiveAccessLevel;
}

export async function updateManagedUserPermissions(
  input: ManagedUserUpdateInput,
) {
  if (isProtectedRootRole(input.role)) {
    throw new Error("SUPER_ADMIN cannot be assigned through user management.");
  }

  if (typeof input.projectCreationAccessGranted !== "boolean") {
    throw new Error("Choose whether this user may create projects.");
  }

  const updatedUser = await withPrismaRetry(() =>
    prisma.$transaction(async (tx) => {
      const existingUser = await tx.user.findUnique({
        where: { id: input.userId },
        select: { role: true },
      });

      if (!existingUser) {
        throw new Error("User not found.");
      }

      if (isProtectedRootRole(existingUser.role)) {
        throw new Error("Protected Super Admin accounts cannot be changed here.");
      }

      const archiveAccessLevel = getRequestedArchiveAccessLevel(input);
      const archiveAssetSelection = normalizeArchiveAssetIds(input.archiveAssetIds);

      if (archiveAccessLevel === ArchiveAccessLevel.PARTIAL) {
        if (
          archiveAssetSelection.projectFileIds.length +
            archiveAssetSelection.manualFileIds.length ===
          0
        ) {
          throw new Error("Select at least one archive asset for partial access.");
        }

        await validateArchiveAssetSelection(tx, archiveAssetSelection);
      }

      await tx.user.update({
        where: {
          id: input.userId,
        },
        data: {
          role: input.role,
          projectCreationAccessGranted:
            input.role === UserRole.USER
              ? input.projectCreationAccessGranted
              : false,
          ...(input.avatarUrl === undefined ? {} : { avatarUrl: input.avatarUrl }),
        },
        select: {
          id: true,
        },
      });

      if (archiveAccessLevel !== ArchiveAccessLevel.NONE) {
        await tx.userArchiveAccess.upsert({
          where: {
            userId: input.userId,
          },
          update: {
            level: archiveAccessLevel,
            grantedById: input.updatedById ?? undefined,
          },
          create: {
            userId: input.userId,
            level: archiveAccessLevel,
            grantedById: input.updatedById ?? undefined,
          },
        });

        await tx.userArchiveAssetAccess.deleteMany({
          where: {
            userId: input.userId,
          },
        });

        if (archiveAccessLevel === ArchiveAccessLevel.PARTIAL) {
          await tx.userArchiveAssetAccess.createMany({
            data: [
              ...archiveAssetSelection.projectFileIds.map((archivedProjectFileId) => ({
                userId: input.userId,
                archivedProjectFileId,
                grantedById: input.updatedById ?? null,
              })),
              ...archiveAssetSelection.manualFileIds.map((manualArchiveFileId) => ({
                userId: input.userId,
                manualArchiveFileId,
                grantedById: input.updatedById ?? null,
              })),
            ],
            skipDuplicates: true,
          });
        }
      } else {
        await tx.userArchiveAssetAccess.deleteMany({
          where: {
            userId: input.userId,
          },
        });
        await tx.userArchiveAccess.deleteMany({
          where: {
            userId: input.userId,
          },
        });
      }

      return tx.user.findUniqueOrThrow({
        where: {
          id: input.userId,
        },
        select: {
          id: true,
          name: true,
          email: true,
          avatarUrl: true,
          role: true,
          projectCreationAccessGranted: true,
          inviteToken: true,
          inviteExpiresAt: true,
          inviteAcceptedAt: true,
          archiveAccess: {
            select: {
              id: true,
              level: true,
            },
          },
          archiveAssetAccesses: {
            orderBy: {
              createdAt: "asc",
            },
            select: {
              archivedProjectFileId: true,
              manualArchiveFileId: true,
              archivedProjectFile: {
                select: {
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
              },
              manualArchiveFile: {
                select: {
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
              },
            },
          },
        },
      });
    }),
  );

  return mapManagedUser(updatedUser);
}
