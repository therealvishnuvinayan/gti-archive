import {
  collaboratorTypeValues,
  permissionDefinitions,
  permissionGroupDefinitions,
  permissionProfileTypeValues,
  permissionRoleValues,
  type CollaboratorTypeValue,
  type PermissionDefinitionRecord,
  type PermissionGroup,
  type PermissionProfileType,
  type PermissionRole,
} from "@/lib/permissions/definitions";
import { getCollaboratorTypeLabel } from "@/lib/project-collaborator-participant-types";

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

export function getPermissionProfileOptions(
  profileType: PermissionProfileType,
): PermissionMatrixProfileOption[] {
  switch (profileType) {
    case "role":
      return permissionRoleValues.map((role) => ({
        value: role,
        label: role,
        description:
          role === "SUPER_ADMIN"
            ? "System administrators with protected user and permission management access."
            : role === "ADMIN"
              ? "Operational administrators with configurable management access."
              : "Scoped collaborators limited by collaborator type and hard business rules.",
      }));
    case "collaboratorType":
      return collaboratorTypeValues.map((type) => ({
        value: type,
        label: getCollaboratorTypeLabel(type as CollaboratorTypeValue),
        description: `Applies to users assigned the ${getCollaboratorTypeLabel(
          type as CollaboratorTypeValue,
        )} collaborator type.`,
      }));
  }
}

export function getDefaultPermissionProfileValue(profileType: PermissionProfileType) {
  return getPermissionProfileOptions(profileType)[0]?.value ?? "";
}

export function getPermissionProfileDescription(
  profileType: PermissionProfileType,
  profileValue: string,
) {
  return (
    getPermissionProfileOptions(profileType).find(
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
  return permissionRoleValues.includes(value as PermissionRole);
}
