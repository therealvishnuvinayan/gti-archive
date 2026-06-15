import type { PermissionKey } from "@/lib/permissions/definitions";
import {
  hasPermission,
  hasProjectPermission,
  type PermissionUser,
  type ProjectPermissionContext,
} from "@/lib/permissions/resolver";

export class PermissionError extends Error {
  permissionKey: PermissionKey;

  constructor(permissionKey: PermissionKey, message?: string) {
    super(message ?? `Missing permission: ${permissionKey}`);
    this.name = "PermissionError";
    this.permissionKey = permissionKey;
  }
}

export function requirePermission(
  user: PermissionUser,
  permissionKey: PermissionKey,
  message?: string,
) {
  if (!hasPermission(user, permissionKey)) {
    throw new PermissionError(permissionKey, message);
  }
}

export function requireProjectPermission(
  user: PermissionUser,
  project: ProjectPermissionContext,
  permissionKey: PermissionKey,
  message?: string,
) {
  if (!hasProjectPermission(user, project, permissionKey)) {
    throw new PermissionError(permissionKey, message);
  }
}
