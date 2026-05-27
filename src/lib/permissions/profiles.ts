import { Prisma, UserRole, type CollaboratorType as PrismaCollaboratorType, type User } from "@prisma/client";
import { cache } from "react";

import { prisma, withPrismaRetry } from "../prisma";
import { resolveCollaboratorType } from "../project-collaborator-participant-types";
import {
  allPermissionKeys,
  collaboratorTypeValues,
  criticalSuperAdminPermissionKeys,
  defaultAccessPresetPermissions,
  defaultCollaboratorTypePermissions,
  defaultRolePermissions,
  moduleAccessValues,
  permissionDefinitionMap,
  permissionDefinitions,
  permissionProfileTypeValues,
  permissionRoleValues,
  type CollaboratorTypeValue,
  type ModuleAccessValue,
  type PermissionDefinitionRecord,
  type PermissionKey,
  type PermissionProfileType,
  type PermissionRole,
} from "./definitions";

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
  collaboratorTypePermissions: ReadonlySet<PermissionKey>;
};

export type PermissionSyncResult = {
  definitionsSynced: number;
  rolePermissionsSeeded: number;
  collaboratorTypePermissionsSeeded: number;
  accessPresetPermissionsSeeded: number;
};

type PermissionProfileUser = Pick<User, "role" | "collaboratorType">;

type PermissionRow = {
  permissionKey: string;
  enabled: boolean;
};

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
  return new Set(
    allPermissionKeys.filter((permissionKey) => state[permissionKey]),
  );
}

function getDefaultPermissionSetForRole(role: PermissionRole) {
  return new Set(defaultRolePermissions[role]);
}

function getDefaultPermissionSetForCollaboratorType(
  collaboratorType: CollaboratorTypeValue,
) {
  return new Set(defaultCollaboratorTypePermissions[collaboratorType]);
}

function getDefaultPermissionSetForAccessPreset(accessPreset: ModuleAccessValue) {
  return new Set(defaultAccessPresetPermissions[accessPreset]);
}

function getDefaultProfileState(
  profileType: PermissionProfileType,
  profileKey: string,
) {
  switch (profileType) {
    case "role":
      return buildPermissionState(
        getDefaultPermissionSetForRole(profileKey as PermissionRole),
      );
    case "collaboratorType":
      return buildPermissionState(
        getDefaultPermissionSetForCollaboratorType(
          profileKey as CollaboratorTypeValue,
        ),
      );
    case "accessPreset":
      return buildPermissionState(
        getDefaultPermissionSetForAccessPreset(profileKey as ModuleAccessValue),
      );
  }
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
    rows.filter((row) => isPermissionKey(row.permissionKey)).map((row) => [
      row.permissionKey as PermissionKey,
      row.enabled,
    ]),
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

const getCachedRoleProfile = cache(async (role: PermissionRole) => {
  try {
    const rows = await withPrismaRetry(() =>
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
    );

    return mergeProfileRows("role", role, rows);
  } catch (error) {
    if (isPermissionStorageUnavailable(error)) {
      return mergeProfileRows("role", role, []);
    }

    throw error;
  }
});

const getCachedCollaboratorTypeProfile = cache(
  async (collaboratorType: CollaboratorTypeValue) => {
    try {
      const rows = await withPrismaRetry(() =>
        prisma.collaboratorTypePermission.findMany({
          where: {
            collaboratorType: collaboratorType as PrismaCollaboratorType,
            permissionKey: {
              in: allPermissionKeys,
            },
          },
          select: {
            permissionKey: true,
            enabled: true,
          },
        }),
      );

      return mergeProfileRows("collaboratorType", collaboratorType, rows);
    } catch (error) {
      if (isPermissionStorageUnavailable(error)) {
        return mergeProfileRows("collaboratorType", collaboratorType, []);
      }

      throw error;
    }
  },
);

const getCachedAccessPresetProfile = cache(async (accessPreset: ModuleAccessValue) => {
  try {
    const rows = await withPrismaRetry(() =>
      prisma.accessPresetPermission.findMany({
        where: {
          accessPreset,
          permissionKey: {
            in: allPermissionKeys,
          },
        },
        select: {
          permissionKey: true,
          enabled: true,
        },
      }),
    );

    return mergeProfileRows("accessPreset", accessPreset, rows);
  } catch (error) {
    if (isPermissionStorageUnavailable(error)) {
      return mergeProfileRows("accessPreset", accessPreset, []);
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

  switch (profileType) {
    case "role":
      if (!permissionRoleValues.includes(profileKey as PermissionRole)) {
        throw new Error("Invalid role profile.");
      }

      return getCachedRoleProfile(profileKey as PermissionRole);
    case "collaboratorType":
      if (!collaboratorTypeValues.includes(profileKey as CollaboratorTypeValue)) {
        throw new Error("Invalid collaborator type profile.");
      }

      return getCachedCollaboratorTypeProfile(
        profileKey as CollaboratorTypeValue,
      );
    case "accessPreset":
      if (!moduleAccessValues.includes(profileKey as ModuleAccessValue)) {
        throw new Error("Invalid access preset profile.");
      }

      return getCachedAccessPresetProfile(profileKey as ModuleAccessValue);
  }
}

export async function syncPermissionDefinitions(): Promise<PermissionSyncResult> {
  try {
    return withPrismaRetry(async () => {
      return prisma.$transaction(
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

          const rolePermissionRows = permissionRoleValues.flatMap((role) =>
            getProfileDefaultRowData("role", role).map((row) => ({
              role,
              permissionKey: row.permissionKey,
              enabled: row.enabled,
            })),
          );
          const collaboratorTypeRows = collaboratorTypeValues.flatMap(
            (collaboratorType) =>
              getProfileDefaultRowData("collaboratorType", collaboratorType).map(
                (row) => ({
                  collaboratorType: collaboratorType as PrismaCollaboratorType,
                  permissionKey: row.permissionKey,
                  enabled: row.enabled,
                }),
              ),
          );
          const accessPresetRows = moduleAccessValues.flatMap((accessPreset) =>
            getProfileDefaultRowData("accessPreset", accessPreset).map((row) => ({
              accessPreset,
              permissionKey: row.permissionKey,
              enabled: row.enabled,
            })),
          );

          const [
            rolePermissionsResult,
            collaboratorTypePermissionsResult,
            accessPresetPermissionsResult,
          ] = await Promise.all([
            tx.rolePermission.createMany({
              data: rolePermissionRows,
              skipDuplicates: true,
            }),
            tx.collaboratorTypePermission.createMany({
              data: collaboratorTypeRows,
              skipDuplicates: true,
            }),
            tx.accessPresetPermission.createMany({
              data: accessPresetRows,
              skipDuplicates: true,
            }),
          ]);

          return {
            definitionsSynced: permissionDefinitions.length,
            rolePermissionsSeeded: rolePermissionsResult.count,
            collaboratorTypePermissionsSeeded:
              collaboratorTypePermissionsResult.count,
            accessPresetPermissionsSeeded: accessPresetPermissionsResult.count,
          };
        },
        {
          maxWait: 10_000,
          timeout: 20_000,
        },
      );
    });
  } catch (error) {
    if (isPermissionStorageUnavailable(error)) {
      throw new Error(
        "Permission profile tables are not available yet. Run `pnpm prisma db push` first.",
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

  await syncPermissionDefinitions();

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
        "SUPER_ADMIN must retain critical permission management and collaborator management access.",
      );
    }
  }

  const rows = allPermissionKeys.map((permissionKey) => ({
    permissionKey,
    enabled: nextState[permissionKey],
  }));

  await withPrismaRetry(async () => {
    return prisma.$transaction(
      rows.map((row) => {
        const sharedData = {
          permissionKey: row.permissionKey,
          enabled: row.enabled,
        };

        switch (profileType) {
          case "role":
            return prisma.rolePermission.upsert({
              where: {
                role_permissionKey: {
                  role: profileKey as PermissionRole,
                  permissionKey: row.permissionKey,
                },
              },
              create: {
                role: profileKey as PermissionRole,
                ...sharedData,
              },
              update: {
                enabled: row.enabled,
              },
            });
          case "collaboratorType":
            return prisma.collaboratorTypePermission.upsert({
              where: {
                collaboratorType_permissionKey: {
                  collaboratorType: profileKey as PrismaCollaboratorType,
                  permissionKey: row.permissionKey,
                },
              },
              create: {
                collaboratorType: profileKey as PrismaCollaboratorType,
                ...sharedData,
              },
              update: {
                enabled: row.enabled,
              },
            });
          case "accessPreset":
            return prisma.accessPresetPermission.upsert({
              where: {
                accessPreset_permissionKey: {
                  accessPreset: profileKey as ModuleAccessValue,
                  permissionKey: row.permissionKey,
                },
              },
              create: {
                accessPreset: profileKey as ModuleAccessValue,
                ...sharedData,
              },
              update: {
                enabled: row.enabled,
              },
            });
        }
      }),
    );
  });

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
  const resolvedCollaboratorType = resolveCollaboratorType(user.collaboratorType);
  const [roleProfile, collaboratorTypeProfile] = await Promise.all([
    getCachedRoleProfile(user.role as PermissionRole),
    getCachedCollaboratorTypeProfile(resolvedCollaboratorType),
  ]);

  const rolePermissions = getEnabledPermissionSet(roleProfile.state);
  const collaboratorTypePermissions = getEnabledPermissionSet(
    collaboratorTypeProfile.state,
  );
  const effectivePermissions = new Set<PermissionKey>();

  for (const permissionKey of allPermissionKeys) {
    if (!rolePermissions.has(permissionKey)) {
      continue;
    }

    if (
      user.role === UserRole.COLLABORATOR &&
      !collaboratorTypePermissions.has(permissionKey)
    ) {
      continue;
    }

    effectivePermissions.add(permissionKey);
  }

  if (user.role === UserRole.SUPER_ADMIN) {
    for (const permissionKey of criticalSuperAdminPermissionKeys) {
      effectivePermissions.add(permissionKey);
    }
  }

  return {
    effectivePermissions,
    rolePermissions,
    collaboratorTypePermissions,
  };
}

export function getPermissionDefinition(
  permissionKey: PermissionKey,
): PermissionDefinitionRecord {
  return permissionDefinitionMap[permissionKey];
}
