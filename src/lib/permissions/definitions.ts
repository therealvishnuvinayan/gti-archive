import { projectCollaboratorParticipantTypes } from "../project-collaborator-participant-types";

export const permissionRoleValues = [
  "SUPER_ADMIN",
  "ADMIN",
  "COLLABORATOR",
] as const;

export type PermissionRole = (typeof permissionRoleValues)[number];

export const collaboratorTypeValues = projectCollaboratorParticipantTypes;

export type CollaboratorTypeValue = (typeof collaboratorTypeValues)[number];

export const moduleAccessValues = ["FULL", "LIMITED", "NONE"] as const;

export type ModuleAccessValue = (typeof moduleAccessValues)[number];

export const permissionProfileTypeValues = [
  "role",
  "collaboratorType",
  "accessPreset",
] as const;

export type PermissionProfileType = (typeof permissionProfileTypeValues)[number];

export const permissionCatalog = {
  dashboard: [
    "dashboard.view",
    "dashboard.viewProjectCounts",
    "dashboard.viewRecentProjects",
  ],
  project: [
    "project.list",
    "project.view",
    "project.create",
    "project.update",
    "project.delete",
    "project.viewBudget",
    "project.updateBudget",
    "project.viewParticipants",
    "project.manageCollaborators",
    "project.completeArchive",
  ],
  stage: [
    "stage.view",
    "stage.acceptBrief",
    "stage.submitWork",
    "stage.reviewSubmission",
    "stage.requestRevision",
    "stage.markSubmissionComplete",
    "stage.markStageComplete",
    "stage.manageDefinitions",
    "stage.updateTimeline",
    "stage.updateBudget",
  ],
  chat: [
    "chat.view",
    "chat.createComment",
    "chat.uploadAttachment",
    "chat.mentionUser",
  ],
  file: [
    "file.view",
    "file.download",
    "file.delete",
    "file.favorite",
    "file.uploadAttachment",
    "file.uploadSubmission",
  ],
  library: [
    "library.view",
    "library.filter",
    "library.deleteFile",
    "library.uploadAsset",
  ],
  archive: [
    "archive.view",
    "archive.download",
    "archive.delete",
  ],
  completion: [
    "completion.viewChecklist",
    "completion.setApprovalRequired",
    "completion.prepareApproval",
    "completion.uploadApprovalProof",
    "completion.setCopyrightRequired",
    "completion.prepareCopyrightTransfer",
    "completion.uploadCopyrightDocument",
    "completion.uploadInvoice",
  ],
  collaboration: [
    "collaboration.viewDirectory",
    "collaboration.createUser",
    "collaboration.updateUser",
    "collaboration.deleteGlobal",
    "collaboration.manageModuleAccess",
    "collaborator.inviteToProject",
    "collaborator.removeFromProject",
    "collaborator.pauseVisibility",
    "collaborator.changeType",
    "collaborator.changeAccess",
  ],
  calendar: [
    "calendar.view",
    "calendar.create",
    "calendar.update",
    "calendar.delete",
    "calendar.assignParticipants",
  ],
  notification: [
    "notification.view",
    "notification.markRead",
    "notification.manageSettings",
  ],
  settings: [
    "settings.viewOwnProfile",
    "settings.updateOwnProfile",
    "settings.changeOwnPassword",
    "settings.viewMasterData",
    "settings.manageMasterData",
    "settings.deleteMasterData",
    "settings.managePermissions",
  ],
  users: [
    "users.view",
    "users.update",
    "users.managePermissions",
  ],
  compare: [
    "compare.view",
    "compare.createComment",
  ],
  help: [
    "help.view",
  ],
} as const;

export type PermissionGroup = keyof typeof permissionCatalog;

export type PermissionKey = (typeof permissionCatalog)[PermissionGroup][number];

export type ModuleName =
  | "dashboard"
  | "project"
  | "calendar"
  | "collaboration"
  | "library"
  | "archive"
  | "settings"
  | "notification"
  | "users"
  | "compare"
  | "help"
  | "file";

export type PermissionDefinitionRecord = {
  key: PermissionKey;
  label: string;
  description: string;
  group: PermissionGroup;
  isSystem: boolean;
  moduleGated: boolean;
  hardRule: boolean;
};

export type PermissionGroupDefinition = {
  id: PermissionGroup;
  title: string;
  description: string;
};

export const permissionGroupDefinitions: readonly PermissionGroupDefinition[] = [
  {
    id: "dashboard",
    title: "Dashboard",
    description: "Dashboard page visibility, project counts, and recent project summaries.",
  },
  {
    id: "project",
    title: "Projects",
    description: "Project list, detail, creation, updates, budget fields, participants, and archive completion.",
  },
  {
    id: "stage",
    title: "Stages",
    description: "Stage workflow actions, definitions, timelines, and budgets.",
  },
  {
    id: "chat",
    title: "Chat",
    description: "Project chat visibility, comments, attachment uploads, and mentions.",
  },
  {
    id: "file",
    title: "Files",
    description: "Project file previews, downloads, deletion, favorites, and uploads.",
  },
  {
    id: "library",
    title: "Library",
    description: "Library browsing, filtering, deleting, and asset upload access.",
  },
  {
    id: "archive",
    title: "Archives",
    description: "Archive browsing, downloads, and deletion coverage.",
  },
  {
    id: "completion",
    title: "Completion",
    description: "Post-archive checklist, approval, copyright, and invoice workflow actions.",
  },
  {
    id: "collaboration",
    title: "Collaboration",
    description: "User directory, global collaborator administration, and project collaborator management.",
  },
  {
    id: "calendar",
    title: "Calendar",
    description: "Calendar viewing, event management, and participant assignments.",
  },
  {
    id: "notification",
    title: "Notifications",
    description: "Notification center visibility and read-state actions.",
  },
  {
    id: "settings",
    title: "Settings",
    description: "Own profile, password, master data, and permission administration.",
  },
  {
    id: "users",
    title: "Users",
    description: "User directory and permission profile administration.",
  },
  {
    id: "compare",
    title: "Compare",
    description: "Artwork comparison and comparison comments.",
  },
  {
    id: "help",
    title: "Help",
    description: "Help Center visibility.",
  },
] as const;

const permissionMetadata: Record<
  PermissionKey,
  Omit<PermissionDefinitionRecord, "key" | "group" | "isSystem">
> = {
  "dashboard.view": {
    label: "View dashboard",
    description: "Open the main dashboard page.",
    moduleGated: false,
    hardRule: false,
  },
  "dashboard.viewProjectCounts": {
    label: "View project counts",
    description: "See dashboard project summary counts for accessible projects.",
    moduleGated: true,
    hardRule: false,
  },
  "dashboard.viewRecentProjects": {
    label: "View recent projects",
    description: "See recent project cards for accessible projects.",
    moduleGated: true,
    hardRule: false,
  },
  "project.list": {
    label: "List projects",
    description: "Open project listing surfaces.",
    moduleGated: true,
    hardRule: false,
  },
  "project.view": {
    label: "View projects",
    description: "Open accessible project detail pages.",
    moduleGated: true,
    hardRule: true,
  },
  "project.create": {
    label: "Create projects",
    description: "Create new projects.",
    moduleGated: true,
    hardRule: false,
  },
  "project.update": {
    label: "Update projects",
    description: "Edit existing projects when project rules allow it.",
    moduleGated: true,
    hardRule: true,
  },
  "project.delete": {
    label: "Delete projects",
    description: "Delete projects when administrative rules allow it.",
    moduleGated: true,
    hardRule: true,
  },
  "project.viewBudget": {
    label: "View project budget",
    description: "View project budget fields when owner-only rules allow it.",
    moduleGated: true,
    hardRule: true,
  },
  "project.updateBudget": {
    label: "Update project budget",
    description: "Edit project and stage budget fields when owner-only rules allow it.",
    moduleGated: true,
    hardRule: true,
  },
  "project.viewParticipants": {
    label: "View project participants",
    description: "See project collaborators and assignees for accessible projects.",
    moduleGated: true,
    hardRule: true,
  },
  "project.manageCollaborators": {
    label: "Manage project collaborators",
    description: "Update project collaborator assignments and visibility.",
    moduleGated: true,
    hardRule: true,
  },
  "project.completeArchive": {
    label: "Complete and archive projects",
    description: "Complete the final stage and move final files into Archives.",
    moduleGated: true,
    hardRule: true,
  },
  "stage.view": {
    label: "View stages",
    description: "See project stage records.",
    moduleGated: true,
    hardRule: true,
  },
  "stage.acceptBrief": {
    label: "Accept briefs",
    description: "Accept and start stage work when Main Executor rules allow it.",
    moduleGated: true,
    hardRule: true,
  },
  "stage.submitWork": {
    label: "Submit work",
    description: "Submit stage work when Main Executor rules allow it.",
    moduleGated: true,
    hardRule: true,
  },
  "stage.reviewSubmission": {
    label: "Review submissions",
    description: "Approve or reject stage submissions when owner rules allow it.",
    moduleGated: true,
    hardRule: true,
  },
  "stage.requestRevision": {
    label: "Request revisions",
    description: "Request submission revisions when owner rules allow it.",
    moduleGated: true,
    hardRule: true,
  },
  "stage.markSubmissionComplete": {
    label: "Mark submissions complete",
    description: "Mark submitted work complete when owner rules allow it.",
    moduleGated: true,
    hardRule: true,
  },
  "stage.markStageComplete": {
    label: "Mark stages complete",
    description: "Advance a stage when owner rules allow it.",
    moduleGated: true,
    hardRule: true,
  },
  "stage.manageDefinitions": {
    label: "Manage stage definitions",
    description: "Create, remove, or reorder project stage definitions in project forms.",
    moduleGated: true,
    hardRule: true,
  },
  "stage.updateTimeline": {
    label: "Update stage timelines",
    description: "Change planned stage start and due dates.",
    moduleGated: true,
    hardRule: true,
  },
  "stage.updateBudget": {
    label: "Update stage budgets",
    description: "Change stage budgets when budget rules allow it.",
    moduleGated: true,
    hardRule: true,
  },
  "chat.view": {
    label: "View project chat",
    description: "Open project chat and history surfaces.",
    moduleGated: true,
    hardRule: true,
  },
  "chat.createComment": {
    label: "Create chat comments",
    description: "Add project chat comments.",
    moduleGated: true,
    hardRule: true,
  },
  "chat.uploadAttachment": {
    label: "Upload chat attachments",
    description: "Upload attachments from project chat.",
    moduleGated: true,
    hardRule: true,
  },
  "chat.mentionUser": {
    label: "Mention users",
    description: "Mention visible project participants in chat.",
    moduleGated: true,
    hardRule: true,
  },
  "file.view": {
    label: "View files",
    description: "Preview project files the user can access.",
    moduleGated: true,
    hardRule: true,
  },
  "file.download": {
    label: "Download files",
    description: "Download project files the user can access.",
    moduleGated: true,
    hardRule: true,
  },
  "file.delete": {
    label: "Delete files",
    description: "Delete project files when ownership rules allow it.",
    moduleGated: true,
    hardRule: true,
  },
  "file.favorite": {
    label: "Favorite files",
    description: "Add or remove personal file favorites.",
    moduleGated: true,
    hardRule: true,
  },
  "file.uploadAttachment": {
    label: "Upload project attachments",
    description: "Upload general project attachments.",
    moduleGated: true,
    hardRule: true,
  },
  "file.uploadSubmission": {
    label: "Upload submissions",
    description: "Upload stage submissions when Main Executor rules allow it.",
    moduleGated: true,
    hardRule: true,
  },
  "library.view": {
    label: "View library",
    description: "Open the Library module.",
    moduleGated: true,
    hardRule: false,
  },
  "library.filter": {
    label: "Filter library",
    description: "Use Library filters and quick menus.",
    moduleGated: true,
    hardRule: false,
  },
  "library.deleteFile": {
    label: "Delete library files",
    description: "Delete library files when ownership rules allow it.",
    moduleGated: true,
    hardRule: true,
  },
  "library.uploadAsset": {
    label: "Upload library assets",
    description: "Upload project assets from the Library or dashboard upload flow.",
    moduleGated: true,
    hardRule: true,
  },
  "archive.view": {
    label: "View archives",
    description: "Open the Archives module.",
    moduleGated: true,
    hardRule: false,
  },
  "archive.download": {
    label: "Download archive files",
    description: "Download archive files the user can access.",
    moduleGated: true,
    hardRule: true,
  },
  "archive.delete": {
    label: "Delete archive files",
    description: "Reserved permission coverage for archive deletion workflows.",
    moduleGated: true,
    hardRule: true,
  },
  "completion.viewChecklist": {
    label: "View completion checklist",
    description: "Open the post-archive completion workflow.",
    moduleGated: true,
    hardRule: true,
  },
  "completion.setApprovalRequired": {
    label: "Set approval required",
    description: "Update authority approval requirement settings.",
    moduleGated: true,
    hardRule: true,
  },
  "completion.prepareApproval": {
    label: "Prepare approval request",
    description: "Prepare an authority approval request.",
    moduleGated: true,
    hardRule: true,
  },
  "completion.uploadApprovalProof": {
    label: "Upload approval proof",
    description: "Upload authority approval proof documents.",
    moduleGated: true,
    hardRule: true,
  },
  "completion.setCopyrightRequired": {
    label: "Set copyright required",
    description: "Update copyright transfer requirement settings.",
    moduleGated: true,
    hardRule: true,
  },
  "completion.prepareCopyrightTransfer": {
    label: "Prepare copyright transfer",
    description: "Prepare a copyright transfer request.",
    moduleGated: true,
    hardRule: true,
  },
  "completion.uploadCopyrightDocument": {
    label: "Upload copyright document",
    description: "Upload signed copyright transfer documents.",
    moduleGated: true,
    hardRule: true,
  },
  "completion.uploadInvoice": {
    label: "Upload invoice",
    description: "Upload invoice documents when project rules allow it.",
    moduleGated: true,
    hardRule: true,
  },
  "collaboration.viewDirectory": {
    label: "View collaborator directory",
    description: "Open the Collaboration module.",
    moduleGated: false,
    hardRule: false,
  },
  "collaboration.createUser": {
    label: "Create users",
    description: "Create collaborator accounts and invitations.",
    moduleGated: false,
    hardRule: false,
  },
  "collaboration.updateUser": {
    label: "Update users",
    description: "Update collaborator account details and legacy module access.",
    moduleGated: false,
    hardRule: false,
  },
  "collaboration.deleteGlobal": {
    label: "Delete global collaborators",
    description: "Delete collaborator accounts when no history references block deletion.",
    moduleGated: false,
    hardRule: true,
  },
  "collaboration.manageModuleAccess": {
    label: "Manage module access",
    description: "Change collaborator type and legacy module access assignments.",
    moduleGated: false,
    hardRule: false,
  },
  "collaborator.inviteToProject": {
    label: "Invite project collaborators",
    description: "Add collaborators to a project.",
    moduleGated: true,
    hardRule: true,
  },
  "collaborator.removeFromProject": {
    label: "Remove project collaborators",
    description: "Remove collaborators from a project.",
    moduleGated: true,
    hardRule: true,
  },
  "collaborator.pauseVisibility": {
    label: "Pause collaborator visibility",
    description: "Pause or resume project collaborator chat visibility.",
    moduleGated: true,
    hardRule: true,
  },
  "collaborator.changeType": {
    label: "Change collaborator type",
    description: "Change project collaborator participant types.",
    moduleGated: true,
    hardRule: true,
  },
  "collaborator.changeAccess": {
    label: "Change collaborator access",
    description: "Change collaborator project access assignments.",
    moduleGated: true,
    hardRule: true,
  },
  "calendar.view": {
    label: "View calendar",
    description: "Open the Calendar module.",
    moduleGated: true,
    hardRule: false,
  },
  "calendar.create": {
    label: "Create calendar events",
    description: "Create calendar events.",
    moduleGated: true,
    hardRule: false,
  },
  "calendar.update": {
    label: "Update calendar events",
    description: "Update calendar events.",
    moduleGated: true,
    hardRule: true,
  },
  "calendar.delete": {
    label: "Delete calendar events",
    description: "Delete calendar events.",
    moduleGated: true,
    hardRule: true,
  },
  "calendar.assignParticipants": {
    label: "Assign calendar participants",
    description: "Assign collaborators to the shared calendar.",
    moduleGated: true,
    hardRule: false,
  },
  "notification.view": {
    label: "View notifications",
    description: "Open the Notifications module and notification dropdown.",
    moduleGated: false,
    hardRule: true,
  },
  "notification.markRead": {
    label: "Mark notifications read",
    description: "Mark the user's own notifications as read or unread.",
    moduleGated: false,
    hardRule: true,
  },
  "notification.manageSettings": {
    label: "Manage notification settings",
    description: "Reserved permission coverage for future notification settings.",
    moduleGated: false,
    hardRule: true,
  },
  "settings.viewOwnProfile": {
    label: "View own settings",
    description: "Open the user's own Settings page.",
    moduleGated: false,
    hardRule: false,
  },
  "settings.updateOwnProfile": {
    label: "Update own profile",
    description: "Update the user's own profile information.",
    moduleGated: false,
    hardRule: false,
  },
  "settings.changeOwnPassword": {
    label: "Change own password",
    description: "Change the user's own password.",
    moduleGated: false,
    hardRule: false,
  },
  "settings.viewMasterData": {
    label: "View master data",
    description: "Open project master data settings.",
    moduleGated: false,
    hardRule: false,
  },
  "settings.manageMasterData": {
    label: "Manage master data",
    description: "Create and update project categories, tags, and currencies.",
    moduleGated: false,
    hardRule: false,
  },
  "settings.deleteMasterData": {
    label: "Delete master data",
    description: "Delete project master data values.",
    moduleGated: false,
    hardRule: true,
  },
  "settings.managePermissions": {
    label: "Manage settings permissions",
    description: "Administrative permission coverage for permission management entry points.",
    moduleGated: false,
    hardRule: true,
  },
  "users.view": {
    label: "View users",
    description: "Open the Users directory.",
    moduleGated: false,
    hardRule: true,
  },
  "users.update": {
    label: "Update users",
    description: "Change a user's role or collaborator type assignment.",
    moduleGated: false,
    hardRule: true,
  },
  "users.managePermissions": {
    label: "Manage permission profiles",
    description: "Change saved role and collaborator type permission profiles.",
    moduleGated: false,
    hardRule: true,
  },
  "compare.view": {
    label: "View compare",
    description: "Open project comparison screens.",
    moduleGated: true,
    hardRule: true,
  },
  "compare.createComment": {
    label: "Create compare comments",
    description: "Create comments in the compare workflow.",
    moduleGated: true,
    hardRule: true,
  },
  "help.view": {
    label: "View Help Center",
    description: "Open the Help Center.",
    moduleGated: false,
    hardRule: false,
  },
};

export const permissionDefinitions = Object.entries(permissionCatalog).flatMap(
  ([group, keys]) =>
    keys.map((key) => {
      const permissionKey = key as PermissionKey;

      return {
        key: permissionKey,
        group: group as PermissionGroup,
        isSystem: true,
        ...permissionMetadata[permissionKey],
      };
    }),
) as readonly PermissionDefinitionRecord[];

export const permissionDefinitionMap = Object.fromEntries(
  permissionDefinitions.map((definition) => [definition.key, definition]),
) as Record<PermissionKey, PermissionDefinitionRecord>;

export const allPermissionKeys = Object.values(permissionCatalog).flat() as PermissionKey[];

export const hardRulePermissionKeys = permissionDefinitions
  .filter((definition) => definition.hardRule)
  .map((definition) => definition.key) as PermissionKey[];

export const permissionModuleMap: Record<PermissionKey, ModuleName> = {
  "dashboard.view": "dashboard",
  "dashboard.viewProjectCounts": "project",
  "dashboard.viewRecentProjects": "project",
  "project.list": "project",
  "project.view": "project",
  "project.create": "project",
  "project.update": "project",
  "project.delete": "project",
  "project.viewBudget": "project",
  "project.updateBudget": "project",
  "project.viewParticipants": "project",
  "project.manageCollaborators": "project",
  "project.completeArchive": "project",
  "stage.view": "project",
  "stage.acceptBrief": "project",
  "stage.submitWork": "project",
  "stage.reviewSubmission": "project",
  "stage.requestRevision": "project",
  "stage.markSubmissionComplete": "project",
  "stage.markStageComplete": "project",
  "stage.manageDefinitions": "project",
  "stage.updateTimeline": "project",
  "stage.updateBudget": "project",
  "chat.view": "project",
  "chat.createComment": "project",
  "chat.uploadAttachment": "project",
  "chat.mentionUser": "project",
  "file.view": "file",
  "file.download": "file",
  "file.delete": "file",
  "file.favorite": "file",
  "file.uploadAttachment": "file",
  "file.uploadSubmission": "file",
  "library.view": "library",
  "library.filter": "library",
  "library.deleteFile": "library",
  "library.uploadAsset": "library",
  "archive.view": "archive",
  "archive.download": "archive",
  "archive.delete": "archive",
  "completion.viewChecklist": "project",
  "completion.setApprovalRequired": "project",
  "completion.prepareApproval": "project",
  "completion.uploadApprovalProof": "project",
  "completion.setCopyrightRequired": "project",
  "completion.prepareCopyrightTransfer": "project",
  "completion.uploadCopyrightDocument": "project",
  "completion.uploadInvoice": "project",
  "collaboration.viewDirectory": "collaboration",
  "collaboration.createUser": "collaboration",
  "collaboration.updateUser": "collaboration",
  "collaboration.deleteGlobal": "collaboration",
  "collaboration.manageModuleAccess": "collaboration",
  "collaborator.inviteToProject": "collaboration",
  "collaborator.removeFromProject": "collaboration",
  "collaborator.pauseVisibility": "collaboration",
  "collaborator.changeType": "collaboration",
  "collaborator.changeAccess": "collaboration",
  "calendar.view": "calendar",
  "calendar.create": "calendar",
  "calendar.update": "calendar",
  "calendar.delete": "calendar",
  "calendar.assignParticipants": "calendar",
  "notification.view": "notification",
  "notification.markRead": "notification",
  "notification.manageSettings": "notification",
  "settings.viewOwnProfile": "settings",
  "settings.updateOwnProfile": "settings",
  "settings.changeOwnPassword": "settings",
  "settings.viewMasterData": "settings",
  "settings.manageMasterData": "settings",
  "settings.deleteMasterData": "settings",
  "settings.managePermissions": "settings",
  "users.view": "users",
  "users.update": "users",
  "users.managePermissions": "users",
  "compare.view": "compare",
  "compare.createComment": "compare",
  "help.view": "help",
};

export const defaultRolePermissions: Record<PermissionRole, readonly PermissionKey[]> = {
  SUPER_ADMIN: allPermissionKeys,
  ADMIN: [
    "dashboard.view",
    "dashboard.viewProjectCounts",
    "dashboard.viewRecentProjects",
    "project.list",
    "project.view",
    "project.create",
    "project.update",
    "project.delete",
    "project.viewBudget",
    "project.updateBudget",
    "project.viewParticipants",
    "project.manageCollaborators",
    "project.completeArchive",
    "stage.view",
    "stage.acceptBrief",
    "stage.submitWork",
    "stage.reviewSubmission",
    "stage.requestRevision",
    "stage.markSubmissionComplete",
    "stage.markStageComplete",
    "stage.manageDefinitions",
    "stage.updateTimeline",
    "stage.updateBudget",
    "chat.view",
    "chat.createComment",
    "chat.uploadAttachment",
    "chat.mentionUser",
    "file.view",
    "file.download",
    "file.delete",
    "file.favorite",
    "file.uploadAttachment",
    "file.uploadSubmission",
    "library.view",
    "library.filter",
    "library.deleteFile",
    "library.uploadAsset",
    "archive.view",
    "archive.download",
    "completion.viewChecklist",
    "completion.setApprovalRequired",
    "completion.prepareApproval",
    "completion.uploadApprovalProof",
    "completion.setCopyrightRequired",
    "completion.prepareCopyrightTransfer",
    "completion.uploadCopyrightDocument",
    "completion.uploadInvoice",
    "collaboration.viewDirectory",
    "collaboration.createUser",
    "collaboration.updateUser",
    "collaboration.manageModuleAccess",
    "collaborator.inviteToProject",
    "collaborator.removeFromProject",
    "collaborator.pauseVisibility",
    "collaborator.changeType",
    "collaborator.changeAccess",
    "calendar.view",
    "calendar.create",
    "calendar.update",
    "calendar.delete",
    "calendar.assignParticipants",
    "notification.view",
    "notification.markRead",
    "settings.viewOwnProfile",
    "settings.updateOwnProfile",
    "settings.changeOwnPassword",
    "settings.viewMasterData",
    "settings.manageMasterData",
    "compare.view",
    "compare.createComment",
    "help.view",
  ],
  COLLABORATOR: [
    "dashboard.view",
    "dashboard.viewProjectCounts",
    "dashboard.viewRecentProjects",
    "project.list",
    "project.view",
    "project.viewParticipants",
    "stage.view",
    "stage.acceptBrief",
    "stage.submitWork",
    "chat.view",
    "chat.createComment",
    "chat.uploadAttachment",
    "chat.mentionUser",
    "file.view",
    "file.download",
    "file.favorite",
    "file.uploadAttachment",
    "file.uploadSubmission",
    "library.view",
    "library.filter",
    "archive.view",
    "archive.download",
    "completion.viewChecklist",
    "completion.uploadInvoice",
    "calendar.view",
    "notification.view",
    "notification.markRead",
    "settings.viewOwnProfile",
    "settings.updateOwnProfile",
    "settings.changeOwnPassword",
    "compare.view",
    "compare.createComment",
    "help.view",
  ],
};

export const defaultCollaboratorTypePermissions: Record<
  CollaboratorTypeValue,
  readonly PermissionKey[]
> = collaboratorTypeValues.reduce(
  (profiles, collaboratorType) => ({
    ...profiles,
    [collaboratorType]: allPermissionKeys,
  }),
  {} as Record<CollaboratorTypeValue, readonly PermissionKey[]>,
);

const readOnlyPermissionKeys = allPermissionKeys.filter((permissionKey) => {
  return (
    permissionKey.endsWith(".view") ||
    permissionKey.endsWith(".list") ||
    permissionKey === "dashboard.viewProjectCounts" ||
    permissionKey === "dashboard.viewRecentProjects" ||
    permissionKey === "library.filter" ||
    permissionKey === "project.viewParticipants" ||
    permissionKey === "completion.viewChecklist" ||
    permissionKey === "notification.view" ||
    permissionKey === "help.view"
  );
});

export const defaultAccessPresetPermissions: Record<
  ModuleAccessValue,
  readonly PermissionKey[]
> = {
  FULL: allPermissionKeys,
  LIMITED: readOnlyPermissionKeys,
  NONE: [],
};

export const criticalSuperAdminPermissionKeys = [
  "dashboard.view",
  "settings.viewOwnProfile",
  "settings.updateOwnProfile",
  "settings.changeOwnPassword",
  "settings.managePermissions",
  "users.view",
  "users.update",
  "users.managePermissions",
  "notification.view",
] as const satisfies PermissionKey[];
