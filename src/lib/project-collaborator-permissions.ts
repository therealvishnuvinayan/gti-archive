export const projectCollaboratorPermissionKeys = [
  "canInteract",
  "canAddCaptions",
  "canDownloadFiles",
  "canViewBudget",
  "canViewVendorInfo",
  "canAccessProjectArchives",
] as const;

export const projectCollaboratorPermissionSelect = {
  userId: true,
  canInteract: true,
  canAddCaptions: true,
  canDownloadFiles: true,
  canViewBudget: true,
  canViewVendorInfo: true,
  canAccessProjectArchives: true,
} as const;

export type ProjectCollaboratorPermissionKey =
  (typeof projectCollaboratorPermissionKeys)[number];

export type ProjectCollaboratorPermissions = Record<
  ProjectCollaboratorPermissionKey,
  boolean
>;

export const projectCollaboratorPermissionLabels: Record<
  ProjectCollaboratorPermissionKey,
  string
> = {
  canInteract: "Can interact",
  canAddCaptions: "Can add captions",
  canDownloadFiles: "Can download files",
  canViewBudget: "Can see budget",
  canViewVendorInfo: "Can see vendor information",
  canAccessProjectArchives: "Can access this project's archives",
};

const emptyProjectCollaboratorPermissions: ProjectCollaboratorPermissions = {
  canInteract: false,
  canAddCaptions: false,
  canDownloadFiles: false,
  canViewBudget: false,
  canViewVendorInfo: false,
  canAccessProjectArchives: false,
};

export function getDefaultProjectCollaboratorPermissions(): ProjectCollaboratorPermissions {
  return {
    ...emptyProjectCollaboratorPermissions,
    canInteract: true,
  };
}

export function normalizeProjectCollaboratorPermissions(
  input:
    | Partial<Record<ProjectCollaboratorPermissionKey, boolean | null | undefined>>
    | null
    | undefined,
  options: { isExecutor?: boolean } = {},
): ProjectCollaboratorPermissions {
  const defaults = getDefaultProjectCollaboratorPermissions();
  const permissions = {
    ...defaults,
    ...Object.fromEntries(
      projectCollaboratorPermissionKeys.map((key) => [
        key,
        typeof input?.[key] === "boolean" ? input[key] : defaults[key],
      ]),
    ),
  } as ProjectCollaboratorPermissions;

  if (options.isExecutor) {
    permissions.canInteract = true;
  }

  return permissions;
}

export function pickProjectCollaboratorPermissions(
  input: Partial<Record<ProjectCollaboratorPermissionKey, boolean>>,
): ProjectCollaboratorPermissions {
  return {
    canInteract: Boolean(input.canInteract),
    canAddCaptions: Boolean(input.canAddCaptions),
    canDownloadFiles: Boolean(input.canDownloadFiles),
    canViewBudget: Boolean(input.canViewBudget),
    canViewVendorInfo: Boolean(input.canViewVendorInfo),
    canAccessProjectArchives: Boolean(input.canAccessProjectArchives),
  };
}
