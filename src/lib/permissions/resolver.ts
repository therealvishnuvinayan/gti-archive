import {
  Prisma,
  UserRole,
  type Project,
  type ProjectCollaborator,
  type User,
} from "@prisma/client";

import {
  defaultRolePermissions,
  type PermissionKey,
} from "@/lib/permissions/definitions";
import type { PermissionProfileSnapshot } from "@/lib/permissions/profiles";

export type PermissionUser = Pick<
  User,
  "id" | "role"
> & {
  permissionProfileSnapshot?: PermissionProfileSnapshot | null;
};

export type ProjectPermissionContext = Pick<Project, "createdById" | "executorUserId"> & {
  collaborators?: Array<Pick<ProjectCollaborator, "userId">>;
};

export type SidebarVisibility = {
  dashboard: boolean;
  projects: boolean;
  calendar: boolean;
  collaboration: boolean;
  users: boolean;
  notifications: boolean;
  library: boolean;
  archives: boolean;
  settings: boolean;
  help: boolean;
};

const deniedProjectScope: Prisma.ProjectWhereInput = {
  id: "__permission_denied__",
};

function getBasePermissionSet(user: PermissionUser) {
  if (user.permissionProfileSnapshot) {
    return new Set(user.permissionProfileSnapshot.effectivePermissions);
  }

  return new Set(defaultRolePermissions[user.role]);
}

function isProjectMember(
  user: PermissionUser,
  project: ProjectPermissionContext,
) {
  if (project.createdById === user.id || project.executorUserId === user.id) {
    return true;
  }

  return (
    project.collaborators?.some((collaborator) => collaborator.userId === user.id) ?? false
  );
}

function isProjectAdmin(user: PermissionUser) {
  return user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN;
}

export function hasPermission(
  user: PermissionUser,
  permissionKey: PermissionKey,
) {
  return getBasePermissionSet(user).has(permissionKey);
}

export function getUserPermissionSet(user: PermissionUser) {
  if (user.permissionProfileSnapshot) {
    return new Set(user.permissionProfileSnapshot.effectivePermissions);
  }

  return new Set(
    defaultRolePermissions[user.role].filter((permission) => hasPermission(user, permission)),
  );
}

// Sidebar visibility stays aligned with the same stable permission keys that protect
// routes and actions. The nav is intentionally just a reflection of the resolver.
// Per-user module access columns are retained only as compatibility data and do not
// participate in runtime sidebar gating.
export function getSidebarVisibility(user: PermissionUser): SidebarVisibility {
  return {
    dashboard: hasPermission(user, "dashboard.view"),
    projects:
      hasPermission(user, "project.list") || hasPermission(user, "project.view"),
    calendar: hasPermission(user, "calendar.view"),
    collaboration: hasPermission(user, "collaboration.viewDirectory"),
    users: user.role === UserRole.SUPER_ADMIN,
    notifications: hasPermission(user, "notification.view"),
    library: hasPermission(user, "library.view"),
    archives: hasPermission(user, "archive.view"),
    settings: true,
    help: true,
  };
}

export function getAccessibleProjectsWhere(user: PermissionUser): Prisma.ProjectWhereInput {
  const canListProjects =
    hasPermission(user, "project.list") || hasPermission(user, "project.view");

  if (!canListProjects) {
    return deniedProjectScope;
  }

  if (isProjectAdmin(user)) {
    return {};
  }

  return {
    OR: [
      { createdById: user.id },
      { executorUserId: user.id },
      {
        collaborators: {
          some: {
            userId: user.id,
          },
        },
      },
    ],
  };
}

export function hasProjectPermission(
  user: PermissionUser,
  project: ProjectPermissionContext,
  permissionKey: PermissionKey,
) {
  switch (permissionKey) {
    case "project.view":
    case "project.viewParticipants":
      return isProjectAdmin(user) ? hasPermission(user, permissionKey) : isProjectMember(user, project);
    case "project.viewBudget":
    case "project.updateBudget":
      return project.createdById === user.id;
    case "project.manageCollaborators":
      return project.createdById === user.id || (isProjectAdmin(user) && hasPermission(user, permissionKey));
    default:
      if (!hasPermission(user, permissionKey)) {
        return false;
      }

      return isProjectAdmin(user) || isProjectMember(user, project);
  }
}
