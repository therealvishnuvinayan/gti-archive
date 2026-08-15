import {
  UserRole,
  type CollaboratorType as PrismaCollaboratorType,
} from "@prisma/client";

import {
  allPermissionKeys,
  criticalSuperAdminPermissionKeys,
  type PermissionKey,
} from "./definitions";
import { isLegacyCollaboratorRole } from "../user-role-compatibility";

const clientOfGtiDeniedEffectivePermissionKeys = [
  "archive.view",
  "archive.uploadFile",
  "archive.download",
  "project.completeArchive",
  "project.viewBudget",
  "project.updateBudget",
  "project.update",
  "project.delete",
  "project.manageCollaborators",
] as const satisfies PermissionKey[];

export function canCollaboratorTypeCreateProjects(
  collaboratorType: PrismaCollaboratorType | null | undefined,
) {
  return collaboratorType === "GTI_INTERNAL_CLIENT";
}

export function resolveEffectivePermissionSet(input: {
  user: {
    role: UserRole;
    collaboratorType: PrismaCollaboratorType | null | undefined;
  };
  rolePermissions: ReadonlySet<PermissionKey>;
  collaboratorTypePermissions: ReadonlySet<PermissionKey>;
}) {
  const { user, rolePermissions, collaboratorTypePermissions } = input;
  const effectivePermissions = new Set<PermissionKey>();

  for (const permissionKey of allPermissionKeys) {
    if (!rolePermissions.has(permissionKey)) {
      continue;
    }

    if (
      isLegacyCollaboratorRole(user.role) &&
      permissionKey === "project.create"
    ) {
      if (canCollaboratorTypeCreateProjects(user.collaboratorType)) {
        effectivePermissions.add(permissionKey);
      }

      continue;
    }

    if (
      isLegacyCollaboratorRole(user.role) &&
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

  if (
    isLegacyCollaboratorRole(user.role) &&
    user.collaboratorType === "CLIENT_OF_GTI"
  ) {
    for (const permissionKey of clientOfGtiDeniedEffectivePermissionKeys) {
      effectivePermissions.delete(permissionKey);
    }
  }

  return effectivePermissions;
}
