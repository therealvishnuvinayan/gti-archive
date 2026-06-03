import { CollaboratorAccess, UserRole, type User } from "@prisma/client";

export type LibraryAccessUser = Pick<
  User,
  "role" | "libraryAccess" | "projectAccess"
>;

export function canViewLibrary(user: LibraryAccessUser) {
  if (user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN) {
    return true;
  }

  return user.libraryAccess !== CollaboratorAccess.NONE;
}

export function canUploadLibraryAssets(user: LibraryAccessUser) {
  if (user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN) {
    return true;
  }

  return (
    user.libraryAccess !== CollaboratorAccess.NONE &&
    user.projectAccess !== CollaboratorAccess.NONE
  );
}
