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

  // Archive capabilities are projected from a trusted V2 principal by the resolver.
  for (const key of ["archive.view", "archive.uploadFile", "archive.download"] as const) effectivePermissions.delete(key);
  return effectivePermissions;
}
