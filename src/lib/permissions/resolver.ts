import {
  Prisma,
  type Project,
  type ProjectCoOwner,
  type ProjectCollaborator,
  type ProjectExecutor,
  type User,
} from "@prisma/client";

import { canReadFullProject, hasProjectBusinessIdentity, projectReadActor, structuredProjectReadWhere } from "@/lib/authorization/project-read-rules";
import {
  defaultRolePermissions,
  type PermissionKey,
} from "@/lib/permissions/definitions";
import type { PermissionProfileSnapshot } from "@/lib/permissions/profiles";
import type {
  ProjectCollaboratorPermissionKey,
  ProjectCollaboratorPermissions,
} from "@/lib/project-collaborator-permissions";
import { isBusinessAdministratorRole } from "@/lib/user-role-compatibility";

export type PermissionUser = Pick<User, "id" | "role"> &
  Partial<Pick<User, "projectCreationAccessGranted">> & {
  permissionProfileSnapshot?: PermissionProfileSnapshot | null;
};

export type ProjectPermissionContext = Pick<
  Project,
  "ownerId"
> & {
  coOwners?: Array<Pick<ProjectCoOwner, "userId">>;
  executors?: Array<Pick<ProjectExecutor, "userId">>;
  collaborators?: Array<
    Pick<ProjectCollaborator, "userId"> &
      Partial<Pick<ProjectCollaborator, ProjectCollaboratorPermissionKey>>
  >;
};

export type SidebarVisibility = {
  dashboard: boolean;
  fluxAi: boolean;
  projects: boolean;
  projectTracker: boolean;
  tasks: boolean;
  projectCounts: boolean;
  calendar: boolean;
  collaboration: boolean;
  clients: boolean;
  finalBeneficiaries: boolean;
  users: boolean;
  notifications: boolean;
  library: boolean;
  archives: boolean;
  settings: boolean;
  help: boolean;
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
  if (
    isProjectOwner(user, project) ||
    isProjectCoOwner(user, project) ||
    isProjectExecutor(user, project)
  ) {
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
  return hasProjectCollaboratorGrant(user, project, "canAccessProjectArchives");
}

export function isProjectAdmin(user: Pick<PermissionUser, "role">) {
  return isGlobalProjectAdministrator(user);
}

export function isGlobalProjectAdministrator(
  user: Pick<PermissionUser, "role">,
) {
  return isBusinessAdministratorRole(user.role);
}

export function isProjectOwner(
  user: Pick<PermissionUser, "id">,
  project: Pick<ProjectPermissionContext, "ownerId">,
) {
  return project.ownerId === user.id;
}

export function isProjectCoOwner(
  user: Pick<PermissionUser, "id">,
  project: Pick<ProjectPermissionContext, "coOwners">,
) {
  return project.coOwners?.some((coOwner) => coOwner.userId === user.id) ?? false;
}

function isProjectOwnerOrCoOwner(
  user: Pick<PermissionUser, "id" | "role">,
  project: ProjectPermissionContext,
) {
  return (
    isGlobalProjectAdministrator(user) ||
    isProjectOwner(user, project) ||
    isProjectCoOwner(user, project)
  );
}

export function isProjectExecutor(
  user: Pick<PermissionUser, "id">,
  project: Pick<ProjectPermissionContext, "executors">,
) {
  return project.executors?.some((executor) => executor.userId === user.id) ?? false;
}

export function hasPermission(user: PermissionUser, permissionKey: PermissionKey) {
  if (["project.list", "project.view", "stage.view", "project.viewBudget", "project.viewParticipants"].includes(permissionKey)) {
    return hasProjectBusinessIdentity(user);
  }
  if (permissionKey === "project.create") return false;
  if (/^(project|stage)\./.test(permissionKey)) {
    const role = projectReadActor(user)?.businessRole;
    return role === "DIRECTOR" || role === "SENIOR_PROJECT_MANAGER" || role === "JUNIOR_PROJECT_MANAGER";
  }
  // Archives are shared by every authenticated account, independent of role profiles.
  if (permissionKey.startsWith("archive.")) return Boolean(user.id);
  return getBasePermissionSet(user).has(permissionKey);
}

export function canCreateProjects(user: PermissionUser) { void user; return false; // No approved template / creation approval record exists yet.
}

export function getArchiveAccessLevel(user: PermissionUser): "NONE" | "FULL" | "PARTIAL" {
  return user.id ? "FULL" as const : "NONE" as const;
}

export function canUseArchives(user: PermissionUser) {
  return hasPermission(user, "archive.view");
}

export function canUseFluxAi(user: PermissionUser) {
  return hasPermission(user, "fluxAi.view");
}

export function canUseProjects(user: PermissionUser) {
  return (
    hasPermission(user, "project.list") &&
    hasPermission(user, "project.view")
  );
}

export function canUseTasks(user: PermissionUser) {
  return canUseProjects(user);
}

export type ProjectTypeSwitcherAuthority = {
  isProjectOwner: boolean;
  isProjectCoOwner: boolean;
};

export function canViewProjectTypeSwitcher(
  user: Pick<PermissionUser, "role">,
  authority: ProjectTypeSwitcherAuthority,
) {
  return (
    isGlobalProjectAdministrator(user) ||
    authority.isProjectOwner ||
    authority.isProjectCoOwner
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

export function canManageContactDirectories(user: PermissionUser) {
  return isBusinessAdministratorRole(user.role) && hasPermission(user, "project.update");
}

export function getSidebarVisibility(user: PermissionUser): SidebarVisibility {
  const projects = canUseProjects(user);

  return {
    dashboard: hasPermission(user, "dashboard.view"),
    fluxAi: canUseFluxAi(user),
    projects,
    projectTracker: projects && hasPermission(user, "project.update"),
    tasks: canUseTasks(user),
    projectCounts:
      projects && hasPermission(user, "dashboard.viewProjectCounts"),
    calendar: hasPermission(user, "calendar.view"),
    collaboration: hasPermission(user, "collaboration.viewDirectory"),
    clients: canManageContactDirectories(user),
    finalBeneficiaries: canManageContactDirectories(user),
    users: isBusinessAdministratorRole(user.role) && hasPermission(user, "users.view"),
    notifications: hasPermission(user, "notification.view"),
    library: hasPermission(user, "library.view"),
    archives: canUseArchives(user),
    settings: hasPermission(user, "settings.viewOwnProfile"),
    help: hasPermission(user, "help.view"),
  };
}

export function getAccessibleProjectsWhere(user: PermissionUser): Prisma.ProjectWhereInput {
  return structuredProjectReadWhere(projectReadActor(user));
}

export function hasProjectPermission(
  user: PermissionUser,
  project: ProjectPermissionContext,
  permissionKey: PermissionKey,
) {
  // Compatibility flags never constitute a mutation grant. Domain services
  // resolve current identity/resource authority inside their V2 transaction.
  if (["project.view", "stage.view", "project.viewBudget", "project.viewParticipants", "chat.view", "compare.view", "file.view", "file.download"].includes(permissionKey)) {
    return canReadFullProject(user, project);
  }
  if (/^(project|stage|chat|file|compare|collaborator|completion)\./.test(permissionKey)) {
    const actor = projectReadActor(user);
    if (!actor?.businessRole) return false;
    if (["project.create", "project.delete", "project.completeArchive"].includes(permissionKey) || permissionKey.startsWith("completion.") || permissionKey.startsWith("collaborator.")) return false;
    const manager = canReadFullProject(user, project);
    if (["stage.acceptBrief", "stage.submitWork", "file.uploadSubmission", "file.uploadAttachment", "chat.createComment", "chat.uploadAttachment", "chat.mentionUser", "compare.createComment"].includes(permissionKey)) {
      return manager || isProjectExecutor(user, project);
    }
    return manager;
  }
  if (!hasProjectPermissionGrant(user, permissionKey)) {
    return false;
  }

  if (
    isProjectOwnerOrCoOwner(user, project) &&
    isProjectOwnerManagePermission(permissionKey)
  ) {
    return true;
  }

  switch (permissionKey) {
    case "project.viewBudget":
      return (
        isProjectAdmin(user) ||
        isProjectOwnerOrCoOwner(user, project) ||
        hasProjectCollaboratorGrant(user, project, "canViewBudget")
      );
    case "project.viewParticipants":
      return (
        isProjectAdmin(user) ||
        isProjectOwnerOrCoOwner(user, project) ||
        hasProjectCollaboratorGrant(user, project, "canViewVendorInfo")
      );
    case "file.download":
      return (
        isProjectAdmin(user) ||
        isProjectOwnerOrCoOwner(user, project) ||
        hasProjectCollaboratorGrant(user, project, "canDownloadFiles")
      );
    case "chat.createComment":
    case "chat.uploadAttachment":
    case "chat.mentionUser":
    case "file.uploadAttachment":
      return (
        isProjectAdmin(user) ||
        isProjectOwnerOrCoOwner(user, project) ||
        isProjectExecutor(user, project) ||
        hasProjectCollaboratorGrant(user, project, "canInteract")
      );
    case "compare.createComment":
      return canAddProjectCaptions(user, project);
    case "archive.view":
      return (
        isProjectAdmin(user) ||
        isProjectOwnerOrCoOwner(user, project) ||
        hasProjectArchiveAccessGrant(user, project)
      );
    case "archive.download":
      return (
        isProjectAdmin(user) ||
        isProjectOwnerOrCoOwner(user, project) ||
        (hasProjectArchiveAccessGrant(user, project) &&
          hasProjectCollaboratorGrant(user, project, "canDownloadFiles"))
      );
    case "archive.uploadFile":
      return isProjectAdmin(user) || isProjectOwnerOrCoOwner(user, project);
    case "compare.view":
      return (
        isProjectAdmin(user) ||
        isProjectOwnerOrCoOwner(user, project) ||
        hasProjectArchiveAccessGrant(user, project)
      );
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
      return isProjectAdmin(user) || isProjectOwnerOrCoOwner(user, project);
    case "stage.manageDefinitions":
    case "stage.updateTimeline":
      return isProjectAdmin(user) || isProjectOwnerOrCoOwner(user, project);
    case "project.update":
      return isProjectAdmin(user) || isProjectOwnerOrCoOwner(user, project);
    case "file.delete":
    case "library.deleteFile":
      return isProjectAdmin(user) || isProjectOwnerOrCoOwner(user, project);
    case "project.delete":
      return isProjectAdmin(user) || isProjectOwnerOrCoOwner(user, project);
    case "project.manageCollaborators":
    case "collaborator.pauseVisibility":
      return isProjectAdmin(user) || isProjectOwnerOrCoOwner(user, project);
    case "collaborator.inviteToProject":
    case "collaborator.removeFromProject":
    case "collaborator.changeAccess":
      return isProjectAdmin(user) || isProjectOwnerOrCoOwner(user, project);
    case "stage.acceptBrief":
      return isProjectExecutor(user, project);
    case "stage.submitWork":
    case "file.uploadSubmission":
      return isProjectExecutor(user, project);
    case "stage.reviewSubmission":
    case "stage.requestRevision":
    case "stage.markSubmissionComplete":
    case "stage.markStageComplete":
    case "completion.setApprovalRequired":
    case "completion.prepareApproval":
    case "completion.setCopyrightRequired":
    case "completion.prepareCopyrightTransfer":
      return isProjectAdmin(user) || isProjectOwnerOrCoOwner(user, project);
    case "completion.uploadApprovalProof":
    case "completion.uploadCopyrightDocument":
      return false;
    case "project.completeArchive":
      return isProjectAdmin(user) || isProjectOwnerOrCoOwner(user, project);
    case "completion.viewChecklist":
    case "completion.uploadInvoice":
      return isProjectOwnerOrCoOwner(user, project) || isProjectExecutor(user, project);
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
    hasProjectPermissionGrant(user, "compare.createComment") &&
    (isProjectAdmin(user) ||
      isProjectOwnerOrCoOwner(user, project) ||
      hasProjectCollaboratorGrant(user, project, "canAddCaptions"))
  );
}
