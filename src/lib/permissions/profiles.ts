import { Prisma, type User } from "@prisma/client";
import { revalidateTag, unstable_cache } from "next/cache";
import { cache } from "react";

import { prisma, withPrismaRetry } from "../prisma";
import { isBusinessAdministratorRole } from "../user-role-compatibility";
import {
  allPermissionKeys,
  criticalSuperAdminPermissionKeys,
  defaultRolePermissions,
  editablePermissionRoleValues,
  permissionDefinitionMap,
  permissionDefinitions,
  permissionProfileTypeValues,
  permissionRoleValues,
  type PermissionDefinitionRecord,
  type PermissionKey,
  type PermissionProfileType,
  type PermissionRole,
} from "./definitions";
import { resolveEffectivePermissionSet } from "./effective";

export type PermissionProfileState = Record<PermissionKey, boolean>;

export type PermissionProfile = {
  profileType: PermissionProfileType;
  profileKey: string;
  state: PermissionProfileState;
  source: "db" | "code-default";
};

export type PermissionProfileSnapshot = {
  effectivePermissions: ReadonlySet<PermissionKey>;
  rolePermissions: ReadonlySet<PermissionKey>;
  archiveAccessGranted: boolean;
  archiveAccessLevel: "NONE" | "FULL" | "PARTIAL";
};

export type PermissionSyncResult = {
  definitionsSynced: number;
  rolePermissionsSeeded: number;
};

type PermissionProfileUser = Pick<User, "id" | "role">;

type PermissionRow = {
  permissionKey: string;
  enabled: boolean;
};

export const PERMISSION_PROFILE_CACHE_TAG = "permission-profiles";
const PERMISSION_PROFILE_CACHE_VERSION = "final-account-roles-v1";

export function getPermissionProfileCacheTag(
  profileType: PermissionProfileType,
  profileKey: string,
) {
  return `permission-profile:${profileType}:${profileKey}`;
}

function isPermissionKey(value: string): value is PermissionKey {
  return allPermissionKeys.includes(value as PermissionKey);
}

function isPermissionProfileType(value: string): value is PermissionProfileType {
  return permissionProfileTypeValues.includes(value as PermissionProfileType);
}

function buildPermissionState(enabledKeys: Iterable<PermissionKey>) {
  const enabledKeySet = new Set(enabledKeys);
  const state = {} as PermissionProfileState;

  for (const permissionKey of allPermissionKeys) {
    state[permissionKey] = enabledKeySet.has(permissionKey);
  }

  return state;
}

function getEnabledPermissionSet(state: PermissionProfileState) {
  return new Set(allPermissionKeys.filter((permissionKey) => state[permissionKey]));
}

function getDefaultPermissionSetForRole(role: PermissionRole) {
  return new Set(defaultRolePermissions[role]);
}

function getDefaultProfileState(
  _profileType: PermissionProfileType,
  profileKey: string,
) {
  return buildPermissionState(
    getDefaultPermissionSetForRole(profileKey as PermissionRole),
  );
}

function mergeProfileRows(
  profileType: PermissionProfileType,
  profileKey: string,
  rows: PermissionRow[],
): PermissionProfile {
  const defaultState = getDefaultProfileState(profileType, profileKey);

  if (rows.length === 0) {
    return {
      profileType,
      profileKey,
      state: defaultState,
      source: "code-default",
    };
  }

  const rowMap = new Map(
    rows
      .filter((row) => isPermissionKey(row.permissionKey))
      .map((row) => [row.permissionKey as PermissionKey, row.enabled]),
  );
  const mergedState = { ...defaultState } as PermissionProfileState;

  for (const permissionKey of allPermissionKeys) {
    const nextValue = rowMap.get(permissionKey);

    if (typeof nextValue === "boolean") {
      mergedState[permissionKey] = nextValue;
    }
  }

  return {
    profileType,
    profileKey,
    state: mergedState,
    source: "db",
  };
}

function isPermissionStorageUnavailable(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2021" || error.code === "P2022")
  );
}

function getProfileDefaultRowData(
  profileType: PermissionProfileType,
  profileKey: string,
) {
  const defaultState = getDefaultProfileState(profileType, profileKey);

  return allPermissionKeys.map((permissionKey) => ({
    permissionKey,
    enabled: defaultState[permissionKey],
  }));
}

async function ensurePermissionDefinitionsExist() {
  await withPrismaRetry(() =>
    prisma.permissionDefinition.createMany({
      data: permissionDefinitions.map((definition) => ({
        key: definition.key,
        label: definition.label,
        description: definition.description,
        group: definition.group,
        isSystem: definition.isSystem,
      })),
      skipDuplicates: true,
    }),
  );
}

const getCachedRoleProfile = cache(async (role: PermissionRole) => {
  const getCachedRows = unstable_cache(
    async () =>
      withPrismaRetry(() =>
        prisma.rolePermission.findMany({
          where: {
            role,
            permissionKey: {
              in: allPermissionKeys,
            },
          },
          select: {
            permissionKey: true,
            enabled: true,
          },
        }),
      ),
    [PERMISSION_PROFILE_CACHE_VERSION, "permission-profile", "role", role],
    {
      tags: [
        PERMISSION_PROFILE_CACHE_TAG,
        getPermissionProfileCacheTag("role", role),
      ],
    },
  );

  try {
    const rows = await getCachedRows();
    return mergeProfileRows("role", role, rows);
  } catch (error) {
    if (isPermissionStorageUnavailable(error)) {
      return mergeProfileRows("role", role, []);
    }

    throw error;
  }
});

export async function getPermissionProfile(
  profileType: PermissionProfileType,
  profileKey: string,
) {
  if (!isPermissionProfileType(profileType)) {
    throw new Error("Invalid permission profile type.");
  }

  if (!permissionRoleValues.includes(profileKey as PermissionRole)) {
    throw new Error("Invalid role profile.");
  }

  return getCachedRoleProfile(profileKey as PermissionRole);
}

export async function syncPermissionDefinitions(): Promise<PermissionSyncResult> {
  try {
    return withPrismaRetry(async () =>
      prisma.$transaction(
        async (tx) => {
          for (const definition of permissionDefinitions) {
            await tx.permissionDefinition.upsert({
              where: {
                key: definition.key,
              },
              create: {
                key: definition.key,
                label: definition.label,
                description: definition.description,
                group: definition.group,
                isSystem: definition.isSystem,
              },
              update: {
                label: definition.label,
                description: definition.description,
                group: definition.group,
                isSystem: definition.isSystem,
              },
            });
          }

          const rolePermissionRows = editablePermissionRoleValues.flatMap((role) =>
            getProfileDefaultRowData("role", role).map((row) => ({
              role,
              permissionKey: row.permissionKey,
              enabled: row.enabled,
            })),
          );
          const rolePermissionsResult = await tx.rolePermission.createMany({
            data: rolePermissionRows,
            skipDuplicates: true,
          });

          return {
            definitionsSynced: permissionDefinitions.length,
            rolePermissionsSeeded: rolePermissionsResult.count,
          };
        },
        {
          maxWait: 10_000,
          timeout: 20_000,
        },
      ),
    );
  } catch (error) {
    if (isPermissionStorageUnavailable(error)) {
      throw new Error(
        "Permission profile tables are not available yet. Run `pnpm prisma migrate deploy` first.",
      );
    }

    throw error;
  }
}

export async function savePermissionProfile(input: {
  profileType: PermissionProfileType;
  profileKey: string;
  state: Record<string, boolean>;
}) {
  const { profileType, profileKey } = input;
  const profile = await getPermissionProfile(profileType, profileKey);

  await ensurePermissionDefinitionsExist();

  const unknownKeys = Object.keys(input.state).filter((key) => !isPermissionKey(key));

  if (unknownKeys.length > 0) {
    throw new Error("Unknown permission keys were provided.");
  }

  const nextState = { ...profile.state } as PermissionProfileState;

  for (const permissionKey of allPermissionKeys) {
    const nextValue = input.state[permissionKey];

    if (typeof nextValue === "boolean") {
      nextState[permissionKey] = nextValue;
    }
  }

  if (profileType === "role" && profileKey === "SUPER_ADMIN") {
    const missingCriticalPermissions = criticalSuperAdminPermissionKeys.filter(
      (permissionKey) => !nextState[permissionKey],
    );

    if (missingCriticalPermissions.length > 0) {
      throw new Error(
        "SUPER_ADMIN must retain critical user and permission management access.",
      );
    }
  }

  const rows = allPermissionKeys.map((permissionKey) => ({
    permissionKey,
    enabled: nextState[permissionKey],
  }));
  const enabledPermissionKeys = rows
    .filter((row) => row.enabled)
    .map((row) => row.permissionKey);
  const disabledPermissionKeys = rows
    .filter((row) => !row.enabled)
    .map((row) => row.permissionKey);

  await withPrismaRetry(() =>
    prisma.$transaction(async (tx) => {
      const role = profileKey as PermissionRole;

      await tx.rolePermission.createMany({
        data: rows.map((row) => ({
          role,
          permissionKey: row.permissionKey,
          enabled: row.enabled,
        })),
        skipDuplicates: true,
      });

      if (enabledPermissionKeys.length > 0) {
        await tx.rolePermission.updateMany({
          where: { role, permissionKey: { in: enabledPermissionKeys } },
          data: { enabled: true },
        });
      }

      if (disabledPermissionKeys.length > 0) {
        await tx.rolePermission.updateMany({
          where: { role, permissionKey: { in: disabledPermissionKeys } },
          data: { enabled: false },
        });
      }
    }),
  );
  revalidateTag(PERMISSION_PROFILE_CACHE_TAG, "max");
  revalidateTag(getPermissionProfileCacheTag(profileType, profileKey), "max");

  return {
    profileType,
    profileKey,
    state: nextState,
    source: "db" as const,
  };
}

export async function resetPermissionProfileToDefaults(
  profileType: PermissionProfileType,
  profileKey: string,
) {
  const defaultState = getDefaultProfileState(profileType, profileKey);

  return savePermissionProfile({
    profileType,
    profileKey,
    state: defaultState,
  });
}

export async function getPermissionProfileSnapshotForUser(
  user: PermissionProfileUser,
): Promise<PermissionProfileSnapshot> {
  const [roleProfile, archiveAccess] = await Promise.all([
    getCachedRoleProfile(user.role as PermissionRole),
    prisma.userArchiveAccess.findUnique({
      where: {
        userId: user.id,
      },
      select: {
        id: true,
        level: true,
      },
    }),
  ]);

  const rolePermissions = getEnabledPermissionSet(roleProfile.state);
  const effectivePermissions = resolveEffectivePermissionSet({
    user,
    rolePermissions,
  });

  return {
    effectivePermissions,
    rolePermissions,
    archiveAccessGranted: Boolean(archiveAccess && archiveAccess.level !== "NONE"),
    archiveAccessLevel:
      isBusinessAdministratorRole(user.role)
        ? "FULL"
        : archiveAccess?.level ?? "NONE",
  };
}

export function getPermissionDefinition(
  permissionKey: PermissionKey,
): PermissionDefinitionRecord {
  return permissionDefinitionMap[permissionKey];
}
