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
import type {
  ProjectCollaboratorPermissionKey,
  ProjectCollaboratorPermissions,
} from "@/lib/project-collaborator-permissions";
import type { PermissionProfileSnapshot } from "@/lib/permissions/profiles";

export type PermissionUser = Pick<User, "id" | "role"> & {
  collaboratorType?: User["collaboratorType"] | null;
  permissionProfileSnapshot?: PermissionProfileSnapshot | null;
};

export type ProjectPermissionContext = Pick<
  Project,
  "createdById"
> & {
  executors?: Array<Pick<ProjectExecutor, "userId" | "role">>;
  collaborators?: Array<
    Pick<ProjectCollaborator, "userId"> &
      Partial<Pick<ProjectCollaborator, ProjectCollaboratorPermissionKey>>
  >;
};

export type SidebarVisibility = {
  dashboard: boolean;
  fluxAi: boolean;
  projects: boolean;
  projectCounts: boolean;
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

function getProjectCollaboratorGrant(
  user: PermissionUser,
  project: ProjectPermissionContext,
) {
  return project.collaborators?.find((collaborator) => collaborator.userId === user.id) ?? null;
}

function hasProjectCollaboratorGrant(
  user: PermissionUser,
  project: ProjectPermissionContext,
  grantKey: keyof ProjectCollaboratorPermissions,
) {
  return getProjectCollaboratorGrant(user, project)?.[grantKey] === true;
}

function hasProjectArchiveAccessGrant(
  user: PermissionUser,
  project: ProjectPermissionContext,
) {
  return (
    !isClientOfGtiUser(user) &&
    hasProjectCollaboratorGrant(user, project, "canAccessProjectArchives")
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
  project: Pick<ProjectPermissionContext, "executors">,
) {
  return project.executors?.some((executor) => executor.userId === user.id) ?? false;
}

export function isMainProjectExecutor(
  user: Pick<PermissionUser, "id">,
  project: Pick<ProjectPermissionContext, "executors">,
) {
  return (
    project.executors?.some(
      (executor) =>
        executor.userId === user.id &&
        executor.role === ProjectExecutorRole.MAIN_EXECUTOR,
    ) ?? false
  );
}

export function hasPermission(user: PermissionUser, permissionKey: PermissionKey) {
  if (
    user.role === UserRole.COLLABORATOR &&
    permissionKey === "project.create" &&
    user.collaboratorType !== "GTI_INTERNAL_CLIENT"
  ) {
    return false;
  }

  return getBasePermissionSet(user).has(permissionKey);
}

export function isClientOfGtiUser(
  user: Pick<PermissionUser, "role"> & {
    collaboratorType?: PermissionUser["collaboratorType"];
  },
) {
  return (
    user.role === UserRole.COLLABORATOR &&
    user.collaboratorType === "CLIENT_OF_GTI"
  );
}

export function canUseArchives(user: PermissionUser) {
  return (
    !isClientOfGtiUser(user) &&
    hasPermission(user, "archive.view") &&
    (user.role === UserRole.SUPER_ADMIN ||
      Boolean(user.permissionProfileSnapshot?.archiveAccessGranted))
  );
}

export function assertCanUseArchives(
  user: PermissionUser,
  message = "You do not have permission to view archives.",
) {
  if (!canUseArchives(user)) {
    throw new Error(message);
  }
}

export function getUserPermissionSet(user: PermissionUser) {
  return getBasePermissionSet(user);
}

function isArchiveSensitivePermission(permissionKey: PermissionKey) {
  return (
    permissionKey === "archive.view" ||
    permissionKey === "archive.download" ||
    permissionKey === "archive.uploadFile" ||
    permissionKey === "project.completeArchive"
  );
}

function hasProjectPermissionGrant(
  user: PermissionUser,
  permissionKey: PermissionKey,
) {
  if (permissionKey === "collaborator.pauseVisibility") {
    return (
      hasPermission(user, permissionKey) ||
      hasPermission(user, "project.manageCollaborators")
    );
  }

  return hasPermission(user, permissionKey);
}

function isProjectOwnerManagePermission(permissionKey: PermissionKey) {
  return (
    permissionKey === "project.update" ||
    permissionKey === "project.delete" ||
    permissionKey === "project.viewBudget" ||
    permissionKey === "project.updateBudget" ||
    permissionKey === "project.manageCollaborators" ||
    permissionKey === "project.completeArchive" ||
    permissionKey === "collaborator.inviteToProject" ||
    permissionKey === "collaborator.removeFromProject" ||
    permissionKey === "collaborator.pauseVisibility" ||
    permissionKey === "collaborator.changeType" ||
    permissionKey === "collaborator.changeAccess" ||
    permissionKey === "stage.reviewSubmission" ||
    permissionKey === "stage.requestRevision" ||
    permissionKey === "stage.markSubmissionComplete" ||
    permissionKey === "stage.markStageComplete" ||
    permissionKey === "stage.manageDefinitions" ||
    permissionKey === "stage.updateTimeline" ||
    permissionKey === "stage.updateBudget" ||
    permissionKey === "completion.setApprovalRequired" ||
    permissionKey === "completion.prepareApproval" ||
    permissionKey === "completion.setCopyrightRequired" ||
    permissionKey === "completion.prepareCopyrightTransfer"
  );
}

export function getSidebarVisibility(user: PermissionUser): SidebarVisibility {
  return {
    dashboard: hasPermission(user, "dashboard.view"),
    fluxAi: hasPermission(user, "fluxAi.view"),
    projects: hasPermission(user, "project.list"),
    projectCounts: hasPermission(user, "dashboard.viewProjectCounts"),
    calendar: hasPermission(user, "calendar.view"),
    collaboration: hasPermission(user, "collaboration.viewDirectory"),
    users:
      user.role === UserRole.SUPER_ADMIN && hasPermission(user, "users.view"),
    notifications: hasPermission(user, "notification.view"),
    library: hasPermission(user, "library.view"),
    archives: canUseArchives(user),
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
  if (isArchiveSensitivePermission(permissionKey) && isClientOfGtiUser(user)) {
    return false;
  }

  if (isProjectOwner(user, project) && isProjectOwnerManagePermission(permissionKey)) {
    return true;
  }

  switch (permissionKey) {
    case "project.viewBudget":
      return (
        isProjectAdmin(user) ||
        isProjectOwner(user, project) ||
        hasProjectCollaboratorGrant(user, project, "canViewBudget")
      );
    case "project.viewParticipants":
      return (
        isProjectAdmin(user) ||
        isProjectOwner(user, project) ||
        hasProjectCollaboratorGrant(user, project, "canViewVendorInfo")
      );
    case "file.download":
      return (
        isProjectAdmin(user) ||
        isProjectOwner(user, project) ||
        hasProjectCollaboratorGrant(user, project, "canDownloadFiles")
      );
    case "chat.createComment":
    case "chat.uploadAttachment":
    case "chat.mentionUser":
    case "file.uploadAttachment":
      return (
        isProjectAdmin(user) ||
        isProjectOwner(user, project) ||
        isMainProjectExecutor(user, project) ||
        hasProjectCollaboratorGrant(user, project, "canInteract")
      );
    case "compare.createComment":
      return canAddProjectCaptions(user, project);
    case "archive.view":
      return (
        isProjectAdmin(user) ||
        isProjectOwner(user, project) ||
        hasProjectArchiveAccessGrant(user, project)
      );
    case "archive.download":
      return (
        isProjectAdmin(user) ||
        isProjectOwner(user, project) ||
        (hasProjectArchiveAccessGrant(user, project) &&
          hasProjectCollaboratorGrant(user, project, "canDownloadFiles"))
      );
    case "archive.uploadFile":
      return isProjectAdmin(user) || isProjectOwner(user, project);
    case "compare.view":
      return (
        isProjectAdmin(user) ||
        isProjectOwner(user, project) ||
        hasProjectArchiveAccessGrant(user, project)
      );
  }

  if (!hasProjectPermissionGrant(user, permissionKey)) {
    return false;
  }

  switch (permissionKey) {
    case "project.view":
    case "stage.view":
    case "chat.view":
    case "file.view":
    case "file.favorite":
      return isProjectAdmin(user) || isProjectMember(user, project);
    case "stage.updateBudget":
    case "project.updateBudget":
      return isProjectAdmin(user) || isProjectOwner(user, project);
    case "stage.manageDefinitions":
    case "stage.updateTimeline":
      return isProjectAdmin(user) || isProjectOwner(user, project);
    case "project.update":
      return isProjectAdmin(user) || isProjectOwner(user, project);
    case "file.delete":
    case "library.deleteFile":
      return isProjectAdmin(user) || isProjectOwner(user, project);
    case "project.delete":
      return isProjectAdmin(user) || isProjectOwner(user, project);
    case "project.manageCollaborators":
    case "collaborator.pauseVisibility":
      return isProjectAdmin(user) || isProjectOwner(user, project);
    case "collaborator.inviteToProject":
    case "collaborator.removeFromProject":
    case "collaborator.changeType":
    case "collaborator.changeAccess":
      return isProjectAdmin(user) || isProjectOwner(user, project);
    case "stage.acceptBrief":
      return isMainProjectExecutor(user, project);
    case "stage.submitWork":
    case "file.uploadSubmission":
      return isMainProjectExecutor(user, project);
    case "stage.reviewSubmission":
    case "stage.requestRevision":
    case "stage.markSubmissionComplete":
    case "stage.markStageComplete":
    case "completion.setApprovalRequired":
    case "completion.prepareApproval":
    case "completion.setCopyrightRequired":
    case "completion.prepareCopyrightTransfer":
      return isProjectAdmin(user) || isProjectOwner(user, project);
    case "completion.uploadApprovalProof":
    case "completion.uploadCopyrightDocument":
      return false;
    case "project.completeArchive":
      return isProjectAdmin(user) || isProjectOwner(user, project);
    case "completion.viewChecklist":
    case "completion.uploadInvoice":
      return isProjectOwner(user, project) || isProjectExecutor(user, project);
    case "library.uploadAsset":
      return isProjectAdmin(user) || isProjectMember(user, project);
    default:
      return isProjectAdmin(user) || isProjectMember(user, project);
  }
}

export function canAddProjectCaptions(
  user: PermissionUser,
  project: ProjectPermissionContext,
) {
  return (
    isProjectAdmin(user) ||
    isProjectOwner(user, project) ||
    hasProjectCollaboratorGrant(user, project, "canAddCaptions")
  );
}
