import type { UserRole } from "@prisma/client";

export const userRoleValues = [
  "SUPER_ADMIN",
  "ADMIN",
  "COLLABORATOR",
  "USER",
] as const satisfies readonly UserRole[];

export type UserRoleValue = (typeof userRoleValues)[number];

// Round 2 keeps the root role and future USER role out of product assignment.
export const editableUserRoleValues = [
  "ADMIN",
  "COLLABORATOR",
] as const satisfies readonly UserRoleValue[];

export type EditableUserRoleValue = (typeof editableUserRoleValues)[number];

type RoleLike = string | null | undefined;

export function isKnownUserRole(role: RoleLike): role is UserRoleValue {
  return userRoleValues.includes(role as UserRoleValue);
}

export function isEditableUserRole(
  role: RoleLike,
): role is EditableUserRoleValue {
  return editableUserRoleValues.includes(role as EditableUserRoleValue);
}

export function isSuperAdminRole(role: RoleLike) {
  return role === "SUPER_ADMIN";
}

export function isProtectedRootRole(role: RoleLike) {
  return isSuperAdminRole(role);
}

export function isAdminRole(role: RoleLike) {
  return role === "ADMIN";
}

export function isBusinessAdministratorRole(role: RoleLike) {
  return isSuperAdminRole(role) || isAdminRole(role);
}

export function isLegacyCollaboratorRole(role: RoleLike) {
  return role === "COLLABORATOR";
}

export function isUserRole(role: RoleLike) {
  return role === "USER";
}

export function isStandardUserRole(role: RoleLike) {
  return isLegacyCollaboratorRole(role) || isUserRole(role);
}

export function getUserRoleLabel(role: UserRoleValue) {
  switch (role) {
    case "SUPER_ADMIN":
      return "Super Admin";
    case "ADMIN":
      return "Admin";
    case "COLLABORATOR":
      return "Collaborator";
    case "USER":
      return "User";
  }
}
