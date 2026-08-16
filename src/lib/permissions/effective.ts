import { UserRole } from "@prisma/client";

import {
  allPermissionKeys,
  criticalSuperAdminPermissionKeys,
  type PermissionKey,
} from "./definitions";
export function resolveEffectivePermissionSet(input: {
  user: {
    role: UserRole;
  };
  rolePermissions: ReadonlySet<PermissionKey>;
}) {
  const { user, rolePermissions } = input;
  const effectivePermissions = new Set<PermissionKey>(
    allPermissionKeys.filter((permissionKey) => rolePermissions.has(permissionKey)),
  );

  if (user.role === UserRole.SUPER_ADMIN) {
    for (const permissionKey of criticalSuperAdminPermissionKeys) {
      effectivePermissions.add(permissionKey);
    }
  }

  return effectivePermissions;
}
