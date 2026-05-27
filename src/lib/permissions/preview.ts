import {
  collaboratorTypeValues,
  moduleAccessValues,
  permissionDefinitions,
  permissionGroupDefinitions,
  permissionProfileTypeValues,
  permissionRoleValues,
  type ModuleAccessValue,
  type PermissionDefinitionRecord,
  type PermissionGroup,
  type PermissionProfileType,
  type PermissionRole,
} from "@/lib/permissions/definitions";
import {
  getProjectCollaboratorTypeMeta,
  type ProjectCollaboratorParticipantType,
} from "@/lib/project-collaborator-participant-types";

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

const accessPresetDescriptions: Record<ModuleAccessValue, string> = {
  FULL: "Legacy compatibility preset that stores a broad module profile.",
  LIMITED: "Legacy compatibility preset that stores a reduced module profile.",
  NONE: "Legacy compatibility preset retained for backward compatibility only.",
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
            ? "Emergency-capable system administrators with protected core access."
            : role === "ADMIN"
              ? "Operational administrators with configurable management permissions."
              : "Scoped collaborators whose access is limited by collaborator type and business rules.",
      }));
    case "collaboratorType":
      return collaboratorTypeValues.map((type) => ({
        value: type,
        label: getProjectCollaboratorTypeMeta(
          type as ProjectCollaboratorParticipantType,
        ).label,
        description: `Applies to collaborators assigned the ${getProjectCollaboratorTypeMeta(
          type as ProjectCollaboratorParticipantType,
        ).label} type.`,
      }));
    case "accessPreset":
      return moduleAccessValues.map((preset) => ({
        value: preset,
        label: preset,
        description: accessPresetDescriptions[preset],
      }));
  }
}

export function getDefaultPermissionProfileValue(profileType: PermissionProfileType) {
  return getPermissionProfileOptions(profileType)[0]?.value ?? "";
}

export function getPermissionProfileLabel(
  profileType: PermissionProfileType,
  profileValue: string,
) {
  return (
    getPermissionProfileOptions(profileType).find((option) => option.value === profileValue)
      ?.label ?? profileValue
  );
}

export function getPermissionProfileDescription(
  profileType: PermissionProfileType,
  profileValue: string,
) {
  return (
    getPermissionProfileOptions(profileType).find((option) => option.value === profileValue)
      ?.description ?? ""
  );
}

export function getPermissionGroup(
  groupId: PermissionGroup,
) {
  return permissionMatrixGroups.find((group) => group.id === groupId) ?? permissionMatrixGroups[0];
}

export function getPermissionGroupsForSearch(
  query: string,
) {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return permissionMatrixGroups;
  }

  return permissionMatrixGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) =>
        [item.label, item.key, item.description]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery),
      ),
    }))
    .filter((group) => group.items.length > 0);
}

export function isEditableProfileType(
  value: string,
): value is PermissionProfileType {
  return permissionProfileTypeValues.includes(value as PermissionProfileType);
}

export function isEditableRoleValue(value: string): value is PermissionRole {
  return permissionRoleValues.includes(value as PermissionRole);
}
