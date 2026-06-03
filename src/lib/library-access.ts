import type { User } from "@prisma/client";

import { hasPermission, type PermissionUser } from "@/lib/permissions/resolver";

export type LibraryAccessUser = Pick<
  User,
  "role" | "libraryAccess" | "projectAccess"
> &
  PermissionUser;

export function canViewLibrary(user: LibraryAccessUser) {
  return hasPermission(user, "library.view");
}

export function canUploadLibraryAssets(user: LibraryAccessUser) {
  return hasPermission(user, "library.uploadAsset");
}
