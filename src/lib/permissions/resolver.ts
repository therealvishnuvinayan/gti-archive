import {
  Prisma,
  ProjectExecutorRole,
  UserRole,
  type Project,
  type ProjectCollaborator,
  type ProjectExecutor,
  type User,
} from "@prisma/client";

import {
  defaultRolePermissions,
  type PermissionKey,
} from "@/lib/permissions/definitions";
import type { PermissionProfileSnapshot } from "@/lib/permissions/profiles";

export type PermissionUser = Pick<User, "id" | "role"> & {
  permissionProfileSnapshot?: PermissionProfileSnapshot | null;
};

export type ProjectPermissionContext = Pick<
  Project,
  "createdById" | "executorUserId"
> & {
  executors?: Array<Pick<ProjectExecutor, "userId" | "role">>;
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
  if (project.createdById === user.id || isProjectExecutor(user, project)) {
    return true;
  }

  return (
    project.collaborators?.some((collaborator) => collaborator.userId === user.id) ??
    false
  );
}

export function isProjectAdmin(user: Pick<PermissionUser, "role">) {
  return user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN;
}

export function isProjectOwner(
  user: Pick<PermissionUser, "id">,
  project: Pick<ProjectPermissionContext, "createdById">,
) {
  return project.createdById === user.id;
}

export function isProjectExecutor(
  user: Pick<PermissionUser, "id">,
  project: Pick<ProjectPermissionContext, "executorUserId" | "executors">,
) {
  if (project.executors && project.executors.length > 0) {
    return project.executors.some((executor) => executor.userId === user.id);
  }

  return Boolean(project.executorUserId && project.executorUserId === user.id);
}

export function isMainProjectExecutor(
  user: Pick<PermissionUser, "id">,
  project: Pick<ProjectPermissionContext, "executorUserId" | "executors">,
) {
  if (project.executors && project.executors.length > 0) {
    return project.executors.some(
      (executor) =>
        executor.userId === user.id &&
        executor.role === ProjectExecutorRole.MAIN_EXECUTOR,
    );
  }

  return Boolean(project.executorUserId && project.executorUserId === user.id);
}

export function hasPermission(user: PermissionUser, permissionKey: PermissionKey) {
  return getBasePermissionSet(user).has(permissionKey);
}

export function getUserPermissionSet(user: PermissionUser) {
  return getBasePermissionSet(user);
}

export function getSidebarVisibility(user: PermissionUser): SidebarVisibility {
  return {
    dashboard: hasPermission(user, "dashboard.view"),
    projects:
      hasPermission(user, "project.list") || hasPermission(user, "project.view"),
    calendar: hasPermission(user, "calendar.view"),
    collaboration: hasPermission(user, "collaboration.viewDirectory"),
    users:
      user.role === UserRole.SUPER_ADMIN && hasPermission(user, "users.view"),
    notifications: hasPermission(user, "notification.view"),
    library: hasPermission(user, "library.view"),
    archives: hasPermission(user, "archive.view"),
    settings: hasPermission(user, "settings.viewOwnProfile"),
    help: hasPermission(user, "help.view"),
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
        executors: {
          some: {
            userId: user.id,
          },
        },
      },
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
  if (!hasPermission(user, permissionKey)) {
    return false;
  }

  switch (permissionKey) {
    case "project.view":
    case "project.viewParticipants":
    case "stage.view":
    case "chat.view":
    case "file.view":
    case "file.download":
    case "file.favorite":
    case "compare.view":
      return isProjectAdmin(user) || isProjectMember(user, project);
    case "project.viewBudget":
    case "project.updateBudget":
    case "stage.updateBudget":
      return isProjectOwner(user, project);
    case "project.update":
    case "stage.manageDefinitions":
    case "stage.updateTimeline":
      return isProjectAdmin(user) || isProjectOwner(user, project);
    case "project.delete":
    case "file.delete":
    case "library.deleteFile":
      return isProjectAdmin(user) || isProjectOwner(user, project);
    case "project.manageCollaborators":
    case "collaborator.inviteToProject":
    case "collaborator.removeFromProject":
    case "collaborator.pauseVisibility":
    case "collaborator.changeType":
    case "collaborator.changeAccess":
      return isProjectAdmin(user) || isProjectOwner(user, project);
    case "stage.acceptBrief":
      return isMainProjectExecutor(user, project);
    case "stage.submitWork":
    case "file.uploadSubmission":
      return !isProjectOwner(user, project) && isMainProjectExecutor(user, project);
    case "stage.reviewSubmission":
    case "stage.requestRevision":
    case "stage.markSubmissionComplete":
    case "stage.markStageComplete":
    case "project.completeArchive":
    case "completion.setApprovalRequired":
    case "completion.prepareApproval":
    case "completion.uploadApprovalProof":
    case "completion.setCopyrightRequired":
    case "completion.prepareCopyrightTransfer":
    case "completion.uploadCopyrightDocument":
      return isProjectAdmin(user) || isProjectOwner(user, project);
    case "completion.viewChecklist":
    case "completion.uploadInvoice":
      return (
        isProjectAdmin(user) || isProjectOwner(user, project) || isProjectExecutor(user, project)
      );
    case "chat.createComment":
    case "chat.uploadAttachment":
    case "chat.mentionUser":
    case "file.uploadAttachment":
    case "compare.createComment":
      return isProjectAdmin(user) || isProjectMember(user, project);
    case "library.uploadAsset":
      return isProjectAdmin(user) || isProjectMember(user, project);
    default:
      return isProjectAdmin(user) || isProjectMember(user, project);
  }
}
