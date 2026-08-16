import {
  editablePermissionRoleValues,
  permissionDefinitions,
  permissionGroupDefinitions,
  permissionProfileTypeValues,
  type PermissionDefinitionRecord,
  type PermissionGroup,
  type PermissionProfileType,
  type PermissionRole,
} from "@/lib/permissions/definitions";
import { isEditableUserRole } from "@/lib/user-role-compatibility";

export type PermissionMatrixGroupId = PermissionGroup;

export type PermissionMatrixItem = PermissionDefinitionRecord;

export type PermissionMatrixGroup = {
  id: PermissionGroup;
  title: string;
  description: string;
  items: PermissionMatrixItem[];
};

export type PermissionMatrixProfileOption = {
  value: string;
  label: string;
  description: string;
};

const permissionGroupItems = permissionGroupDefinitions.map((group) => ({
  id: group.id,
  title: group.title,
  description: group.description,
  items: permissionDefinitions.filter((definition) => definition.group === group.id),
})) satisfies PermissionMatrixGroup[];

export const permissionMatrixGroups: PermissionMatrixGroup[] = permissionGroupItems;

export { permissionProfileTypeValues };
export type { PermissionProfileType };

export function getPermissionProfileOptions(): PermissionMatrixProfileOption[] {
  return editablePermissionRoleValues.map((role) => ({
    value: role,
    label: role,
    description:
      role === "ADMIN"
        ? "Business administrators with configurable access across the application."
        : "Internal users with relationship-scoped project access.",
  }));
}

export function getDefaultPermissionProfileValue() {
  return getPermissionProfileOptions()[0]?.value ?? "";
}

export function getPermissionProfileDescription(
  profileValue: string,
) {
  return (
    getPermissionProfileOptions().find(
      (option) => option.value === profileValue,
    )?.description ?? ""
  );
}

export function getPermissionGroup(groupId: PermissionGroup) {
  return (
    permissionMatrixGroups.find((group) => group.id === groupId) ??
    permissionMatrixGroups[0]
  );
}

export function isEditableProfileType(value: string): value is PermissionProfileType {
  return permissionProfileTypeValues.includes(value as PermissionProfileType);
}

export function isEditableRoleValue(value: string): value is PermissionRole {
  return isEditableUserRole(value);
}
