import { denyLegacyAdministration } from "@/lib/authorization/deferred-administration";
import { Prisma, type User } from "@prisma/client";
import { unstable_cache } from "next/cache";
import { cache } from "react";

import { prisma, withPrismaRetry } from "../prisma";
import {
  allPermissionKeys,
  defaultRolePermissions,
  permissionDefinitionMap,
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

export async function getPermissionProfileSnapshotForUser(
  user: PermissionProfileUser,
): Promise<PermissionProfileSnapshot> {
  const roleProfile = await getCachedRoleProfile(user.role as PermissionRole);

  const rolePermissions = getEnabledPermissionSet(roleProfile.state);
  const effectivePermissions = resolveEffectivePermissionSet({
    user,
    rolePermissions,
  });

  return {
    effectivePermissions,
    rolePermissions,
    archiveAccessGranted: false,
    archiveAccessLevel: "NONE",
  };
}

export function getPermissionDefinition(
  permissionKey: PermissionKey,
): PermissionDefinitionRecord {
  return permissionDefinitionMap[permissionKey];
}

// Retained API contracts fail closed until the audited V2 editor is integrated.
export async function getPermissionProfile(profileType: PermissionProfileType, profileKey: string): Promise<PermissionProfile> {
  void profileType; void profileKey; return denyLegacyAdministration();
}
export async function syncPermissionDefinitions(): Promise<PermissionSyncResult> { return denyLegacyAdministration(); }
export async function savePermissionProfile(input: { profileType: PermissionProfileType; profileKey: string; state: Record<string, boolean> }): Promise<PermissionProfile> {
  void input; return denyLegacyAdministration();
}
export async function resetPermissionProfileToDefaults(profileType: PermissionProfileType, profileKey: string): Promise<PermissionProfile> {
  void profileType; void profileKey; return denyLegacyAdministration();
}
