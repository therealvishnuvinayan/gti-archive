import { unstable_cache } from "next/cache";
import {
  AttachmentStatus,
  AttachmentAssetType,
  Prisma,
  ProjectExecutorRole,
  ProjectRevisionStatus,
  SubmissionReviewStatus,
  UserRole,
} from "@prisma/client";
import type {
  CollaboratorType,
  Project,
  ProjectCollaborator,
  ProjectExecutor,
  ProjectStage,
  ProjectStatus,
  User,
} from "@prisma/client";

import {
  getCollaboratorRoleLabel,
  getCollaboratorTypeGroup,
  getDefaultProjectCollaboratorParticipantType,
  getProjectCollaboratorTypeMeta,
  isProjectCollaboratorParticipantType,
  type ProjectCollaboratorParticipantType,
} from "@/lib/project-collaborator-participant-types";
import {
  DEFAULT_PROJECT_PRIORITY,
  formatProjectPriority,
  type ProjectPriorityValue,
} from "@/lib/project-priority";
import { getFavoriteAttachmentIdSetForUser } from "@/lib/file-favorite-queries";
import {
  getAccessibleProjectsWhere,
  hasPermission,
  hasProjectPermission,
  isProjectAdmin,
  isProjectExecutor,
  isMainProjectExecutor,
  isProjectOwner,
  type PermissionUser,
} from "@/lib/permissions/resolver";
import type { PermissionKey } from "@/lib/permissions/definitions";
import { prisma, withPrismaRetry } from "@/lib/prisma";

export const PROJECTS_CACHE_TAG = "projects";

type BudgetAccessUser = Pick<User, "id">;
export type ProjectAccessUser = PermissionUser;
type ProjectStageWithStarter = ProjectStage & {
  startedBy?: Pick<User, "name" | "email"> | null;
};

type ProjectWithCreator = Project & {
  createdBy: Pick<User, "name" | "email">;
  executorUser?: Pick<User, "id" | "name" | "email" | "collaboratorType"> | null;
  executors?: Array<
    ProjectExecutor & {
      user: Pick<
        User,
        | "id"
        | "name"
        | "email"
        | "collaboratorType"
      >;
    }
  >;
  stages: ProjectStageWithStarter[];
  collaborators?: Array<
    ProjectCollaborator & {
      user: Pick<
        User,
        | "id"
        | "name"
        | "email"
        | "collaboratorType"
      >;
    }
  >;
  attachments: Array<{
    id: string;
    stageId: string | null;
    revisionId: string | null;
    commentId: string | null;
    assetType: AttachmentAssetType;
    originalFileName: string;
    mimeType: string;
    fileSize: number;
    submissionReviewStatus?: SubmissionReviewStatus | null;
    createdAt: Date;
    uploadedBy: Pick<User, "name" | "email">;
  }>;
};

export type ProjectCardRecord = {
  id: string;
  stage: string;
  category: string;
  title: string;
  createdOn: string;
  createdBy: string;
  isPinned: boolean;
  canPin: boolean;
  canEdit: boolean;
  canDelete: boolean;
};

export type ProjectEditorRecord = {
  id: string;
  ownerId: string;
  name: string;
  category: string;
  executorName: string;
  executorUserId?: string | null;
  executors: ProjectExecutorRecord[];
  tag: string;
  priority: ProjectPriorityValue;
  description: string;
  budget: string;
  currency: string | null;
  canViewBudget: boolean;
  status: ProjectStatus;
  startDate: string;
  endDate: string;
  stages: Array<{
    id: string;
    name: string;
    budget: string;
    description: string;
    plannedStartAt: string;
    plannedDueAt: string;
    attachments: ProjectAttachmentRecord[];
  }>;
  collaborators: ProjectCollaboratorRecord[];
  attachments: ProjectAttachmentRecord[];
};

export type ProjectStageVisualStatus =
  | "completed"
  | "in-progress"
  | "pending"
  | "on-hold";

export type ProjectStageRecord = {
  id: string;
  label: string;
  subtitle: string;
  description: string;
  title: string;
  createdOn: string;
  budget: string;
  actualStartedAt: string;
  actualStartedAtValue: string | null;
  startedByName: string | null;
  plannedStartAt: string;
  plannedStartAtValue: string | null;
  plannedDueAt: string;
  plannedDueAtValue: string | null;
  status: ProjectStageVisualStatus;
  briefAttachments: ProjectAttachmentRecord[];
};

function toProjectIsoString(
  date: Date | string | number | null | undefined,
) {
  if (!date) {
    return null;
  }

  const normalizedDate = toProjectDate(date);

  return Number.isNaN(normalizedDate.getTime()) ? null : normalizedDate.toISOString();
}

export type ProjectCollaboratorRecord = {
  id: string;
  name: string;
  email?: string;
  role: string;
  group: "internal" | "external";
  participantType: ProjectCollaboratorParticipantType | null;
  chatVisibilityPaused: boolean;
  access: "owner" | "view";
  removable?: boolean;
};

export type ProjectExecutorRecord = {
  id: string;
  name: string;
  email?: string;
  role: ProjectExecutorRole;
  roleLabel: string;
  group: "internal" | "external";
};

export type ProjectMentionParticipantRecord = {
  id: string;
  name: string;
  email?: string;
  role: string;
  group: "internal" | "external";
  chatVisibilityPaused: boolean;
};

export type ProjectAttachmentRecord = {
  id: string;
  isSubmission: boolean;
  submissionNumber?: number;
  submissionReviewStatus?: SubmissionReviewStatus | null;
  originalFileName: string;
  fileTypeLabel: string;
  mimeType: string;
  fileSizeLabel: string;
  uploadedBy: string;
  uploadedAt: string;
  previewPath: string;
  downloadPath: string;
  isFavoritedByCurrentUser: boolean;
};

export type ProjectChatEntry = {
  id: string;
  kind: "revision" | "comment" | "system";
  revisionId?: string;
  title?: string;
  revisionStatus?: ProjectRevisionStatus | null;
  rejectionReason?: string | null;
  author: string;
  authorAvatarSrc?: string | null;
  role: string;
  body: string;
  createdAt: string;
  mentions?: Array<{
    userId: string;
    name: string;
  }>;
  attachments?: ProjectAttachmentRecord[];
};

export type ProjectCompareNote = {
  id: string;
  author: string;
  role: string;
  date: string;
  body: string;
  x: string;
  y: string;
  attachments?: string[];
};

export type ProjectFlowRecord = {
  id: string;
  ownerId: string;
  executorUserId?: string | null;
  executors: ProjectExecutorRecord[];
  canViewBudget: boolean;
  title: string;
  category: string;
  executorName: string;
  description: string;
  budget: string;
  currency: string | null;
  statusLabel: string;
  currentStageName: string;
  currentStageId: string | null;
  stageCount: number;
  startDate: string;
  endDate: string;
  createdOn: string;
  createdBy: string;
  tag: string;
  priority: string;
  stageCards: ProjectStageRecord[];
  collaborators: ProjectCollaboratorRecord[];
  mentionParticipants: ProjectMentionParticipantRecord[];
  attachments: ProjectAttachmentRecord[];
  chatEntries: ProjectChatEntry[];
  compareNotes: ProjectCompareNote[];
};

export type DashboardProjectCounts = {
  total: number;
  ongoing: number;
  onHold: number;
  pending: number;
  completed: number;
};

export type ProjectsListFilter = {
  status?: "ALL" | "ONGOING" | "PENDING" | "ON_HOLD" | "COMPLETED";
  query?: string;
  category?: string;
  tag?: string;
  sort?: "newest" | "oldest" | "name";
};

export type ProjectListFilterOptions = {
  categories: string[];
  tags: string[];
};

export const projectStatusMeta: Record<
  ProjectStatus,
  {
    label: string;
    dashboardLabel: string;
  }
> = {
  ONGOING: {
    label: "In Progress",
    dashboardLabel: "Ongoing",
  },
  ON_HOLD: {
    label: "On Hold",
    dashboardLabel: "On Hold",
  },
  PENDING: {
    label: "Pending",
    dashboardLabel: "Pending",
  },
  COMPLETED: {
    label: "Completed",
    dashboardLabel: "Completed",
  },
};

function toProjectDate(date: Date | string | number) {
  return date instanceof Date ? date : new Date(date);
}

export function formatProjectDate(date: Date | string | number) {
  const normalizedDate = toProjectDate(date);

  if (Number.isNaN(normalizedDate.getTime())) {
    return "—";
  }

  const day = `${normalizedDate.getDate()}`.padStart(2, "0");
  const month = `${normalizedDate.getMonth() + 1}`.padStart(2, "0");
  const year = normalizedDate.getFullYear();

  return `${day}/${month}/${year}`;
}

export function formatProjectBudget(
  budget: number | null | undefined,
  currency = "USD",
) {
  if (!budget || budget <= 0) {
    return "—";
  }

  return `${budget.toLocaleString("en-US")} ${currency}`;
}

export function canViewProjectBudget(
  project: Pick<Project, "createdById"> | { ownerId: string },
  currentUser: BudgetAccessUser,
) {
  const ownerId = "ownerId" in project ? project.ownerId : project.createdById;
  return ownerId === currentUser.id;
}

function getCreatorName(creator: Pick<User, "name" | "email">) {
  if (creator.name?.trim()) {
    return creator.name.trim();
  }

  return creator.email;
}

function formatAttachmentTimestamp(date: Date | string | number) {
  const normalizedDate = toProjectDate(date);

  if (Number.isNaN(normalizedDate.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(normalizedDate);
}

export function formatProjectDateTime(date: Date | string | number | null | undefined) {
  if (!date) {
    return "—";
  }

  const normalizedDate = toProjectDate(date);

  if (Number.isNaN(normalizedDate.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(normalizedDate);
}

function getAttachmentFileTypeLabel(fileName: string, mimeType: string) {
  const extension = fileName.split(".").at(-1)?.toUpperCase();

  if (extension && extension !== fileName.toUpperCase()) {
    return extension;
  }

  const subtype = mimeType.split("/")[1];
  return subtype ? subtype.toUpperCase() : "FILE";
}

function formatAttachmentFileSize(fileSize: number) {
  if (fileSize >= 1024 * 1024) {
    return `${(fileSize / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (fileSize >= 1024) {
    return `${(fileSize / 1024).toFixed(1)} KB`;
  }

  return `${fileSize} B`;
}

function mapCollaboratorTypeToGroup(type: CollaboratorType): "internal" | "external" {
  return getCollaboratorTypeGroup(type);
}

function mapProjectCollaboratorAssignmentToRecord(
  assignment: ProjectCollaborator & {
    user: Pick<User, "id" | "name" | "email" | "collaboratorType">;
  },
): ProjectCollaboratorRecord {
  const fallbackGroup = mapCollaboratorTypeToGroup(assignment.user.collaboratorType);
  const participantType =
    (assignment.participantType as ProjectCollaboratorParticipantType | null) ??
    getDefaultProjectCollaboratorParticipantType(fallbackGroup);

  return {
    id: assignment.user.id,
    name: assignment.user.name?.trim() || assignment.user.email,
    email: assignment.user.email,
    role: getCollaboratorRoleLabel(assignment.user.collaboratorType),
    group: getProjectCollaboratorTypeMeta(participantType).group,
    participantType,
    chatVisibilityPaused: assignment.chatVisibilityPaused,
    access: "view",
    removable: true,
  };
}

export function formatProjectExecutorRole(role: ProjectExecutorRole) {
  return role === ProjectExecutorRole.MAIN_EXECUTOR ? "Main Executor" : "Executor";
}

function compareProjectExecutorRecords(
  left: ProjectExecutorRecord,
  right: ProjectExecutorRecord,
) {
  if (left.role !== right.role) {
    return left.role === ProjectExecutorRole.MAIN_EXECUTOR ? -1 : 1;
  }

  return left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
}

function mapProjectExecutorAssignmentToRecord(
  assignment: ProjectExecutor & {
    user: Pick<User, "id" | "name" | "email" | "collaboratorType">;
  },
): ProjectExecutorRecord {
  return {
    id: assignment.user.id,
    name: assignment.user.name?.trim() || assignment.user.email,
    email: assignment.user.email,
    role: assignment.role,
    roleLabel: formatProjectExecutorRole(assignment.role),
    group: mapCollaboratorTypeToGroup(assignment.user.collaboratorType),
  };
}

function getProjectExecutorRecords(project: Pick<ProjectWithCreator, "executorName" | "executorUserId" | "executorUser" | "executors">) {
  const mappedExecutors = (project.executors ?? [])
    .map(mapProjectExecutorAssignmentToRecord)
    .filter((executor, index, current) =>
      current.findIndex((item) => item.id === executor.id) === index,
    )
    .sort(compareProjectExecutorRecords);

  if (mappedExecutors.length > 0) {
    return mappedExecutors;
  }

  if (!project.executorUserId) {
    return [];
  }

  return [
    {
      id: project.executorUserId,
      name:
        project.executorUser?.name?.trim() ||
        project.executorUser?.email ||
        project.executorName?.trim() ||
        "Main Executor",
      email: project.executorUser?.email,
      role: ProjectExecutorRole.MAIN_EXECUTOR,
      roleLabel: formatProjectExecutorRole(ProjectExecutorRole.MAIN_EXECUTOR),
      group: project.executorUser
        ? mapCollaboratorTypeToGroup(project.executorUser.collaboratorType)
        : "internal",
    },
  ];
}

function getProjectExecutorDisplayName(executors: ProjectExecutorRecord[]) {
  if (executors.length === 0) {
    return "—";
  }

  const mainExecutors = executors.filter(
    (executor) => executor.role === ProjectExecutorRole.MAIN_EXECUTOR,
  );
  const primaryExecutors = mainExecutors.length > 0 ? mainExecutors : executors;
  const firstExecutor = primaryExecutors[0];

  if (!firstExecutor) {
    return "—";
  }

  const remainingCount = executors.length - 1;
  return remainingCount > 0
    ? `${firstExecutor.name} +${remainingCount}`
    : firstExecutor.name;
}

function canAccessProjectRecord(
  project: Pick<Project, "createdById" | "executorUserId"> & {
    executors?: Array<Pick<ProjectExecutor, "userId" | "role">>;
    collaborators?: Array<Pick<ProjectCollaborator, "userId">>;
  },
  currentUser: ProjectAccessUser,
) {
  return hasProjectPermission(currentUser, project, "project.view");
}

function canViewBriefContent(
  project: Pick<Project, "createdById" | "executorUserId"> & {
    executors?: Array<Pick<ProjectExecutor, "userId" | "role">>;
  },
  currentUser: ProjectAccessUser,
) {
  return (
    isProjectAdmin(currentUser) ||
    isProjectOwner(currentUser, project) ||
    isProjectExecutor(currentUser, project)
  );
}

function isStageBriefAttachment(
  attachment: Pick<
    ProjectWithCreator["attachments"][number],
    "assetType" | "stageId" | "revisionId" | "commentId"
  >,
) {
  return (
    attachment.assetType === AttachmentAssetType.GENERAL_PROJECT_ASSET &&
    Boolean(attachment.stageId) &&
    !attachment.revisionId &&
    !attachment.commentId
  );
}

function isProjectBriefAttachment(
  attachment: Pick<
    ProjectWithCreator["attachments"][number],
    "assetType" | "stageId" | "revisionId" | "commentId"
  >,
) {
  return (
    attachment.assetType === AttachmentAssetType.GENERAL_PROJECT_ASSET &&
    !isStageBriefAttachment(attachment)
  );
}

export function buildAccessibleProjectsWhere(
  currentUser?: ProjectAccessUser,
): Prisma.ProjectWhereInput {
  if (!currentUser) {
    return {
      id: "__permission_denied__",
    };
  }

  return getAccessibleProjectsWhere(currentUser);
}

function mapAttachmentToRecord(
  attachment: {
    id: string;
    assetType: AttachmentAssetType;
    originalFileName: string;
    mimeType: string;
    fileSize: number;
    submissionReviewStatus?: SubmissionReviewStatus | null;
    createdAt: Date | string | number;
    uploadedBy: Pick<User, "name" | "email">;
  },
  favoritedAttachmentIds?: ReadonlySet<string>,
): ProjectAttachmentRecord {
  return {
    id: attachment.id,
    isSubmission: attachment.assetType === AttachmentAssetType.STAGE_SUBMISSION,
    submissionReviewStatus: attachment.submissionReviewStatus ?? null,
    originalFileName: attachment.originalFileName,
    fileTypeLabel: getAttachmentFileTypeLabel(
      attachment.originalFileName,
      attachment.mimeType,
    ),
    mimeType: attachment.mimeType,
    fileSizeLabel: formatAttachmentFileSize(attachment.fileSize),
    uploadedBy: getCreatorName(attachment.uploadedBy),
    uploadedAt: formatAttachmentTimestamp(attachment.createdAt),
    previewPath: `/api/project-assets/${attachment.id}/preview`,
    downloadPath: `/api/project-assets/${attachment.id}/download`,
    isFavoritedByCurrentUser: favoritedAttachmentIds?.has(attachment.id) ?? false,
  };
}

function mapStageStatusToVisual(status: ProjectStatus): ProjectStageVisualStatus {
  switch (status) {
    case "COMPLETED":
      return "completed";
    case "ON_HOLD":
      return "on-hold";
    case "PENDING":
      return "pending";
    default:
      return "in-progress";
  }
}

function buildSyntheticStages(project: Project): ProjectStageWithStarter[] {
  return Array.from({ length: Math.max(project.stageCount, 1) }, (_, index) => ({
    id: `${project.id}-stage-${index + 1}`,
    projectId: project.id,
    name:
      index === 0
        ? project.currentStageName?.trim() || `Stage ${index + 1}`
        : `Stage ${index + 1}`,
    description: null,
    budget: index === 0 ? project.budget : null,
    actualStartedAt: null,
    startedById: null,
    completedAt: null,
    plannedStartAt: project.startDate,
    plannedDueAt: project.endDate,
    status: index === 0 ? project.status : "PENDING",
    order: index + 1,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  }));
}

function getProjectStages(project: ProjectWithCreator) {
  if (project.stages.length > 0) {
    return [...project.stages].sort((left, right) => left.order - right.order);
  }

  return buildSyntheticStages(project);
}

export function formatProjectStageLabel(project: Pick<Project, "currentStageName" | "status">) {
  const stageName = project.currentStageName?.trim() || "Stage 1";
  const statusLabel = projectStatusMeta[project.status].label;

  return `${stageName} : ${statusLabel}`;
}

function mapProjectToCard(
  project: ProjectWithCreator,
  currentUser: ProjectAccessUser,
): ProjectCardRecord {
  return {
    id: project.id,
    stage: formatProjectStageLabel(project),
    category: project.category,
    title: project.name,
    createdOn: formatProjectDate(project.createdAt),
    createdBy: getCreatorName(project.createdBy),
    isPinned: project.isPinned,
    canPin: hasProjectPermission(currentUser, project, "project.update"),
    canEdit:
      project.status !== "COMPLETED" &&
      hasProjectPermission(currentUser, project, "project.update"),
    canDelete:
      project.status !== "COMPLETED" &&
      hasProjectPermission(currentUser, project, "project.delete"),
  };
}

const projectNameCollator = new Intl.Collator("en", {
  numeric: true,
  sensitivity: "base",
});

function compareProjectsByName(
  left: Pick<Project, "id" | "name" | "createdAt" | "isPinned">,
  right: Pick<Project, "id" | "name" | "createdAt" | "isPinned">,
) {
  if (left.isPinned !== right.isPinned) {
    return left.isPinned ? -1 : 1;
  }

  const nameDifference = projectNameCollator.compare(left.name.trim(), right.name.trim());
  if (nameDifference !== 0) {
    return nameDifference;
  }

  const createdAtDifference = left.createdAt.getTime() - right.createdAt.getTime();
  if (createdAtDifference !== 0) {
    return createdAtDifference;
  }

  return left.id.localeCompare(right.id);
}

function mapStageToCard(
  project: ProjectWithCreator,
  stage: ProjectStageWithStarter,
  allowBudgetView: boolean,
  canViewBrief: boolean,
  briefAttachments: ProjectAttachmentRecord[] = [],
): ProjectStageRecord {
  return {
    id: stage.id,
    label: `${stage.name} : ${projectStatusMeta[stage.status].label}`,
    subtitle: project.category,
    description: canViewBrief ? stage.description?.trim() || "" : "",
    title: project.name,
    createdOn: formatProjectDate(stage.createdAt),
    budget: allowBudgetView
      ? formatProjectBudget(stage.budget, project.currency)
      : "Restricted",
    actualStartedAt: formatProjectDateTime(stage.actualStartedAt),
    actualStartedAtValue: toProjectIsoString(stage.actualStartedAt),
    startedByName: stage.startedBy ? getCreatorName(stage.startedBy) : null,
    plannedStartAt: formatProjectDateTime(stage.plannedStartAt),
    plannedStartAtValue: toProjectIsoString(stage.plannedStartAt),
    plannedDueAt: formatProjectDateTime(stage.plannedDueAt),
    plannedDueAtValue: toProjectIsoString(stage.plannedDueAt),
    status: mapStageStatusToVisual(stage.status),
    briefAttachments: canViewBrief ? briefAttachments : [],
  };
}

function mapProjectToFlow(
  project: ProjectWithCreator,
  currentUser: BudgetAccessUser & ProjectAccessUser,
  favoritedAttachmentIds?: ReadonlySet<string>,
): ProjectFlowRecord {
  const creatorName = getCreatorName(project.createdBy);
  const executorRecords = getProjectExecutorRecords(project);
  const executorDisplayName = getProjectExecutorDisplayName(executorRecords);
  const allowBudgetView = canViewProjectBudget(project, currentUser);
  const allowBriefView = canViewBriefContent(project, currentUser);
  const stages = getProjectStages(project);
  const currentStage =
    stages.find((stage) => stage.name === project.currentStageName) ?? stages[0] ?? null;
  const projectBriefAttachments = project.attachments
    .filter(isProjectBriefAttachment)
    .map((attachment) => mapAttachmentToRecord(attachment, favoritedAttachmentIds));
  const stageBriefAttachmentMap = new Map<string, ProjectAttachmentRecord[]>();

  project.attachments
    .filter(isStageBriefAttachment)
    .forEach((attachment) => {
      if (!attachment.stageId) {
        return;
      }

      const existingAttachments = stageBriefAttachmentMap.get(attachment.stageId) ?? [];
      stageBriefAttachmentMap.set(attachment.stageId, [
        ...existingAttachments,
        mapAttachmentToRecord(attachment, favoritedAttachmentIds),
      ]);
    });

  const collaboratorRecords = (project.collaborators ?? [])
    .map(mapProjectCollaboratorAssignmentToRecord)
    .filter((collaborator, index, current) =>
      current.findIndex((item) => item.id === collaborator.id) === index,
    );
  const mentionParticipants = [
    {
      id: project.createdById,
      name: creatorName,
      email: project.createdBy.email,
      role: "Project Owner",
      group: "internal" as const,
      chatVisibilityPaused: false,
    },
    ...executorRecords.map((executor) => ({
      id: executor.id,
      name: executor.name,
      email: executor.email,
      role: executor.roleLabel,
      group: executor.group,
      chatVisibilityPaused: false,
    })),
    ...collaboratorRecords.map((collaborator) => ({
      id: collaborator.id,
      name: collaborator.name,
      email: collaborator.email,
      role: collaborator.role,
      group: collaborator.group,
      chatVisibilityPaused: collaborator.chatVisibilityPaused,
    })),
  ].filter(
    (participant, index, current) =>
      current.findIndex((item) => item.id === participant.id) === index,
  );

  return {
    id: project.id,
    ownerId: project.createdById,
    executorUserId: project.executorUserId ?? null,
    executors: executorRecords,
    canViewBudget: allowBudgetView,
    title: project.name,
    category: project.category,
    executorName: executorDisplayName,
    description: allowBriefView ? project.description : "",
    budget: allowBudgetView ? formatProjectBudget(project.budget, project.currency) : "Restricted",
    currency: allowBudgetView ? project.currency : null,
    statusLabel: projectStatusMeta[project.status].label,
    currentStageName: currentStage?.name ?? project.currentStageName?.trim() ?? "Stage 1",
    currentStageId: currentStage?.id ?? null,
    stageCount: stages.length,
    startDate: formatProjectDate(project.startDate),
    endDate: formatProjectDate(project.endDate),
    createdOn: formatProjectDate(project.createdAt),
    createdBy: creatorName,
    tag: project.tag?.trim() || "—",
    priority: formatProjectPriority(project.priority ?? DEFAULT_PROJECT_PRIORITY),
    stageCards: stages.map((stage) =>
      mapStageToCard(
        project,
        stage,
        allowBudgetView,
        allowBriefView,
        stageBriefAttachmentMap.get(stage.id) ?? [],
      ),
    ),
    collaborators: [
      {
        id: project.createdById,
        name: creatorName,
        email: project.createdBy.email,
        role: "Project Owner",
        group: "internal",
        participantType: "GTI_INTERNAL_CLIENT",
        chatVisibilityPaused: false,
        access: "owner",
      },
      ...collaboratorRecords,
    ],
    mentionParticipants,
    attachments: allowBriefView ? projectBriefAttachments : [],
    chatEntries: [],
    compareNotes: [],
  };
}

function formatProjectInputDate(date: Date | string | number) {
  const normalizedDate = toProjectDate(date);

  if (Number.isNaN(normalizedDate.getTime())) {
    return "";
  }

  const year = normalizedDate.getFullYear();
  const month = `${normalizedDate.getMonth() + 1}`.padStart(2, "0");
  const day = `${normalizedDate.getDate()}`.padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatProjectInputDateTime(date: Date | string | number | null | undefined) {
  if (!date) {
    return "";
  }

  const normalizedDate = toProjectDate(date);

  if (Number.isNaN(normalizedDate.getTime())) {
    return "";
  }

  const year = normalizedDate.getFullYear();
  const month = `${normalizedDate.getMonth() + 1}`.padStart(2, "0");
  const day = `${normalizedDate.getDate()}`.padStart(2, "0");
  const hours = `${normalizedDate.getHours()}`.padStart(2, "0");
  const minutes = `${normalizedDate.getMinutes()}`.padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function mapProjectToEditor(
  project: ProjectWithCreator,
  currentUser: BudgetAccessUser & ProjectAccessUser,
  favoritedAttachmentIds?: ReadonlySet<string>,
): ProjectEditorRecord {
  const stages = getProjectStages(project);
  const executorRecords = getProjectExecutorRecords(project);
  const executorDisplayName = getProjectExecutorDisplayName(executorRecords);
  const allowBudgetView = canViewProjectBudget(project, currentUser);
  const allowBriefView = canViewBriefContent(project, currentUser);
  const projectBriefAttachments = project.attachments
    .filter(isProjectBriefAttachment)
    .map((attachment) => mapAttachmentToRecord(attachment, favoritedAttachmentIds));
  const stageBriefAttachmentMap = new Map<string, ProjectAttachmentRecord[]>();

  project.attachments
    .filter(isStageBriefAttachment)
    .forEach((attachment) => {
      if (!attachment.stageId) {
        return;
      }

      const existingAttachments = stageBriefAttachmentMap.get(attachment.stageId) ?? [];
      stageBriefAttachmentMap.set(attachment.stageId, [
        ...existingAttachments,
        mapAttachmentToRecord(attachment, favoritedAttachmentIds),
      ]);
    });

  return {
    id: project.id,
    ownerId: project.createdById,
    name: project.name,
    category: project.category,
    executorName: executorDisplayName,
    executorUserId: project.executorUserId ?? null,
    executors: executorRecords,
    tag: project.tag?.trim() || "",
    priority: project.priority ?? DEFAULT_PROJECT_PRIORITY,
    description: allowBriefView ? project.description : "",
    budget: allowBudgetView ? String(project.budget) : "",
    currency: allowBudgetView ? project.currency : null,
    canViewBudget: allowBudgetView,
    status: project.status,
    startDate: formatProjectInputDate(project.startDate),
    endDate: formatProjectInputDate(project.endDate),
    stages: stages.map((stage, index) => ({
      id: stage.id,
      name: stage.name,
      budget:
        allowBudgetView
          ? stage.budget && stage.budget > 0
            ? String(stage.budget)
            : index === 0
              ? String(project.budget)
              : ""
          : "",
      description: allowBriefView ? stage.description?.trim() || "" : "",
      plannedStartAt: formatProjectInputDateTime(stage.plannedStartAt ?? project.startDate),
      plannedDueAt: formatProjectInputDateTime(stage.plannedDueAt ?? project.endDate),
      attachments: allowBriefView ? stageBriefAttachmentMap.get(stage.id) ?? [] : [],
    })),
    collaborators: (project.collaborators ?? []).map((assignment) => ({
      ...mapProjectCollaboratorAssignmentToRecord(assignment),
    })),
    attachments: allowBriefView ? projectBriefAttachments : [],
  };
}

export async function updateProjectCollaborators(
  projectId: string,
  collaborators: Array<{
    id?: string;
    userId?: string;
    participantType?: ProjectCollaboratorParticipantType | null;
  }>,
  actor: ProjectAccessUser,
) {
  await assertProjectCollaboratorManagementAccess(
    actor,
    projectId,
    "project.manageCollaborators",
  );

  if (!Array.isArray(collaborators)) {
    throw new Error("Collaborator selection is required.");
  }

  const normalizedCollaborators = collaborators.reduce<
    Array<{ id: string; participantType: ProjectCollaboratorParticipantType | null }>
  >((current, collaborator) => {
    const id = (collaborator.userId ?? collaborator.id ?? "").trim();

    if (!id || current.some((item) => item.id === id)) {
      return current;
    }

    const participantType =
      collaborator.participantType &&
      isProjectCollaboratorParticipantType(collaborator.participantType)
        ? collaborator.participantType
        : null;

    current.push({
      id,
      participantType,
    });
    return current;
  }, []);
  const normalizedIds = normalizedCollaborators.map((collaborator) => collaborator.id);

  const validCollaborators = normalizedIds.length
    ? await withPrismaRetry(() =>
        prisma.user.findMany({
          where: {
            id: {
              in: normalizedIds,
            },
            role: UserRole.COLLABORATOR,
          },
          select: {
            id: true,
            collaboratorType: true,
          },
        }),
      )
    : [];

  const validIds = validCollaborators.map((collaborator) => collaborator.id);

  if (validIds.length !== normalizedIds.length) {
    throw new Error("One or more selected collaborators could not be found.");
  }

  const validCollaboratorTypeMap = new Map(
    validCollaborators.map((collaborator) => [
      collaborator.id,
      mapCollaboratorTypeToGroup(collaborator.collaboratorType),
    ]),
  );
  const validCollaboratorMap = new Map(
    normalizedCollaborators
      .filter((collaborator) => validIds.includes(collaborator.id))
      .map((collaborator) => [collaborator.id, collaborator.participantType] as const),
  );

  const existingAssignments = await withPrismaRetry(() =>
    prisma.projectCollaborator.findMany({
      where: {
        projectId,
      },
      select: {
        userId: true,
        participantType: true,
      },
    }),
  );
  const existingIds = new Set(existingAssignments.map((assignment) => assignment.userId));
  const existingParticipantTypeMap = new Map(
    existingAssignments.map((assignment) => [
      assignment.userId,
      assignment.participantType as ProjectCollaboratorParticipantType | null,
    ]),
  );
  const nextIds = new Set(validIds);
  const idsToDelete = existingAssignments
    .map((assignment) => assignment.userId)
    .filter((userId) => !nextIds.has(userId));
  const idsToCreate = validIds.filter((userId) => !existingIds.has(userId));
  const idsToUpdate = validIds.filter((userId) => existingIds.has(userId));
  const resolveParticipantType = (userId: string) =>
    validCollaboratorMap.get(userId) ??
    existingParticipantTypeMap.get(userId) ??
    getDefaultProjectCollaboratorParticipantType(
      validCollaboratorTypeMap.get(userId) ?? "external",
    );

  await withPrismaRetry(() =>
    prisma.$transaction([
      ...(idsToDelete.length > 0
        ? [
            prisma.projectCollaborator.deleteMany({
              where: {
                projectId,
                userId: {
                  in: idsToDelete,
                },
              },
            }),
          ]
        : []),
      ...idsToUpdate.map((userId) =>
        prisma.projectCollaborator.update({
          where: {
            projectId_userId: {
              projectId,
              userId,
            },
          },
          data: {
            participantType: resolveParticipantType(userId),
          },
        }),
      ),
      ...(idsToCreate.length > 0
        ? [
            prisma.projectCollaborator.createMany({
              data: idsToCreate.map((userId) => ({
                projectId,
                userId,
                addedById: actor.id,
                participantType: resolveParticipantType(userId),
              })),
              skipDuplicates: true,
            }),
          ]
        : []),
    ]),
  );

  const assignments = await withPrismaRetry(() =>
    prisma.projectCollaborator.findMany({
      where: {
        projectId,
      },
      orderBy: {
        createdAt: "asc",
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            collaboratorType: true,
          },
        },
      },
    }),
  );

  return assignments.map(mapProjectCollaboratorAssignmentToRecord);
}

async function assertProjectCollaboratorManagementAccess(
  actor: ProjectAccessUser,
  projectId: string,
  permissionKey: PermissionKey,
) {
  const project = await withPrismaRetry(() =>
    prisma.project.findUnique({
      where: {
        id: projectId,
      },
      select: {
        id: true,
        createdById: true,
        executorUserId: true,
        executors: {
          select: {
            userId: true,
            role: true,
          },
        },
      },
    }),
  );

  if (!project) {
    throw new Error("Project not found.");
  }

  if (
    !hasProjectPermission(actor, project, permissionKey) ||
    (permissionKey === "project.manageCollaborators" &&
      !hasPermission(actor, "project.manageCollaborators"))
  ) {
    throw new Error("You are not allowed to update project collaborators.");
  }

  return project;
}

async function getProjectCollaboratorAssignments(projectId: string) {
  const assignments = await withPrismaRetry(() =>
    prisma.projectCollaborator.findMany({
      where: {
        projectId,
      },
      orderBy: {
        createdAt: "asc",
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            collaboratorType: true,
          },
        },
      },
    }),
  );

  return assignments.map(mapProjectCollaboratorAssignmentToRecord);
}

export async function getProjectExecutors(projectId: string) {
  const project = await withPrismaRetry(() =>
    prisma.project.findUnique({
      where: {
        id: projectId,
      },
      select: {
        executorName: true,
        executorUserId: true,
        executorUser: {
          select: {
            id: true,
            name: true,
            email: true,
            collaboratorType: true,
          },
        },
        executors: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                collaboratorType: true,
              },
            },
          },
        },
      },
    }),
  );

  return project ? getProjectExecutorRecords(project) : [];
}

export async function requireMainExecutor(projectId: string, userId: string) {
  const project = await withPrismaRetry(() =>
    prisma.project.findUnique({
      where: {
        id: projectId,
      },
      select: {
        executorUserId: true,
        executors: {
          select: {
            userId: true,
            role: true,
          },
        },
      },
    }),
  );

  if (!project) {
    throw new Error("Project not found.");
  }

  if (!isMainProjectExecutor({ id: userId }, project)) {
    throw new Error("Only a Main Executor can perform this action.");
  }

  return project;
}

export async function removeProjectCollaborator(
  actor: ProjectAccessUser,
  projectId: string,
  collaboratorId: string,
) {
  await assertProjectCollaboratorManagementAccess(
    actor,
    projectId,
    "collaborator.removeFromProject",
  );

  const assignment = await withPrismaRetry(() =>
    prisma.projectCollaborator.findUnique({
      where: {
        projectId_userId: {
          projectId,
          userId: collaboratorId,
        },
      },
      select: {
        userId: true,
      },
    }),
  );

  if (!assignment) {
    throw new Error("Collaborator not found.");
  }

  await withPrismaRetry(() =>
    prisma.projectCollaborator.delete({
      where: {
        projectId_userId: {
          projectId,
          userId: collaboratorId,
        },
      },
    }),
  );

  return getProjectCollaboratorAssignments(projectId);
}

export async function setProjectCollaboratorChatVisibility(
  actor: ProjectAccessUser,
  input: {
    projectId: string;
    collaboratorId: string;
    paused: boolean;
  },
) {
  await assertProjectCollaboratorManagementAccess(
    actor,
    input.projectId,
    "collaborator.pauseVisibility",
  );

  const assignment = await withPrismaRetry(() =>
    prisma.projectCollaborator.findUnique({
      where: {
        projectId_userId: {
          projectId: input.projectId,
          userId: input.collaboratorId,
        },
      },
      select: {
        projectId: true,
        userId: true,
        chatVisibilityPaused: true,
      },
    }),
  );

  if (!assignment) {
    throw new Error("Collaborator not found.");
  }

  if (assignment.chatVisibilityPaused === input.paused) {
    return getProjectCollaboratorAssignments(input.projectId);
  }

  await withPrismaRetry(async () =>
    prisma.$transaction(async (tx) => {
      if (input.paused) {
        await tx.projectCollaborator.update({
          where: {
            projectId_userId: {
              projectId: input.projectId,
              userId: input.collaboratorId,
            },
          },
          data: {
            chatVisibilityPaused: true,
          },
        });

        await tx.projectCollaboratorVisibilityPause.create({
          data: {
            projectId: input.projectId,
            userId: input.collaboratorId,
            pausedAt: new Date(),
            createdById: actor.id,
          },
        });

        return;
      }

      const latestOpenPause = await tx.projectCollaboratorVisibilityPause.findFirst({
        where: {
          projectId: input.projectId,
          userId: input.collaboratorId,
          resumedAt: null,
        },
        orderBy: {
          pausedAt: "desc",
        },
        select: {
          id: true,
        },
      });

      await tx.projectCollaborator.update({
        where: {
          projectId_userId: {
            projectId: input.projectId,
            userId: input.collaboratorId,
          },
        },
        data: {
          chatVisibilityPaused: false,
        },
      });

      if (latestOpenPause) {
        await tx.projectCollaboratorVisibilityPause.update({
          where: {
            id: latestOpenPause.id,
          },
          data: {
            resumedAt: new Date(),
          },
        });
      }
    }),
  );

  return getProjectCollaboratorAssignments(input.projectId);
}

function buildProjectsWhere(filter: ProjectsListFilter) {
  const query = filter.query?.trim();
  const category = filter.category?.trim();
  const tag = filter.tag?.trim();
  const statusWhere =
    filter.status === "ALL" || !filter.status
      ? undefined
      : filter.status;

  return {
    ...(statusWhere
      ? {
          status: statusWhere,
        }
      : {}),
    ...(query
      ? {
          OR: [
            {
              name: {
                contains: query,
                mode: "insensitive" as const,
              },
            },
            {
              category: {
                contains: query,
                mode: "insensitive" as const,
              },
            },
            {
              tag: {
                contains: query,
                mode: "insensitive" as const,
              },
            },
            {
              createdBy: {
                is: {
                  name: {
                    contains: query,
                    mode: "insensitive" as const,
                  },
                },
              },
            },
            {
              createdBy: {
                is: {
                  email: {
                    contains: query,
                    mode: "insensitive" as const,
                  },
                },
              },
            },
          ],
        }
      : {}),
    ...(category
      ? {
          category: {
            equals: category,
            mode: "insensitive" as const,
          },
        }
      : {}),
    ...(tag
      ? {
          tag: {
            equals: tag,
            mode: "insensitive" as const,
          },
        }
      : {}),
  };
}

export async function getProjectListFilterOptions(
  currentUser: ProjectAccessUser,
): Promise<ProjectListFilterOptions> {
  const accessibleWhere = buildAccessibleProjectsWhere(currentUser);
  const projects = await unstable_cache(
    async () =>
      withPrismaRetry(() =>
        prisma.project.findMany({
          where: accessibleWhere,
          select: {
            category: true,
            tag: true,
          },
        }),
      ),
    [
      "project-list-filter-options",
      currentUser.id,
      currentUser.role,
    ],
    { revalidate: 20, tags: [PROJECTS_CACHE_TAG] },
  )();

  const categories = new Map<string, string>();
  const tags = new Map<string, string>();

  for (const project of projects) {
    const normalizedCategory = project.category.trim();
    if (normalizedCategory) {
      categories.set(normalizedCategory.toLowerCase(), normalizedCategory);
    }

    const normalizedTag = project.tag?.trim();
    if (normalizedTag) {
      tags.set(normalizedTag.toLowerCase(), normalizedTag);
    }
  }

  return {
    categories: [...categories.values()].sort((left, right) =>
      left.localeCompare(right, undefined, { sensitivity: "base" }),
    ),
    tags: [...tags.values()].sort((left, right) =>
      left.localeCompare(right, undefined, { sensitivity: "base" }),
    ),
  };
}

export async function getDashboardProjectCounts(
  currentUser?: ProjectAccessUser,
): Promise<DashboardProjectCounts> {
  const accessibleWhere = buildAccessibleProjectsWhere(currentUser);
  const getCachedCounts = unstable_cache(
    async () =>
      withPrismaRetry(() =>
        Promise.all([
          prisma.project.count({
            where: accessibleWhere,
          }),
          prisma.project.groupBy({
            by: ["status"],
            where: accessibleWhere,
            _count: {
              _all: true,
            },
          }),
        ]),
      ),
    [
      "dashboard-project-counts",
      currentUser?.id ?? "all",
      currentUser?.role ?? "all",
    ],
    { revalidate: 20, tags: [PROJECTS_CACHE_TAG] },
  );

  const [total, grouped] = await getCachedCounts();

  const counts = grouped.reduce<Record<ProjectStatus, number>>(
    (accumulator, item) => {
      accumulator[item.status] = item._count._all;
      return accumulator;
    },
    {
      ONGOING: 0,
      ON_HOLD: 0,
      PENDING: 0,
      COMPLETED: 0,
    },
  );

  return {
    total,
    ongoing: counts.ONGOING,
    onHold: counts.ON_HOLD,
    pending: counts.PENDING,
    completed: counts.COMPLETED,
  };
}

export async function getRecentProjects(limit = 5, currentUser?: ProjectAccessUser) {
  const accessibleWhere = buildAccessibleProjectsWhere(currentUser);
  const projects = await unstable_cache(
    async () =>
      withPrismaRetry(() =>
        prisma.project.findMany({
          where: accessibleWhere,
          orderBy: {
            createdAt: "desc",
          },
          take: limit,
        }),
      ),
    [
      "recent-projects",
      String(limit),
      currentUser?.id ?? "all",
      currentUser?.role ?? "all",
    ],
    { revalidate: 20, tags: [PROJECTS_CACHE_TAG] },
  )();

  return projects.map((project, index) => ({
    name: project.name,
    tone: index < 2 ? "brand" : index < 4 ? "deep" : "muted",
  })) as {
    name: string;
    tone: "brand" | "deep" | "muted";
  }[];
}

export async function getProjectsList(
  filter: ProjectsListFilter,
  currentUser: ProjectAccessUser,
) {
  const orderBy =
    filter.sort === "oldest"
      ? [{ isPinned: "desc" as const }, { createdAt: "asc" as const }, { id: "asc" as const }]
      : filter.sort === "name"
        ? [
            { isPinned: "desc" as const },
            { name: "asc" as const },
            { createdAt: "asc" as const },
            { id: "asc" as const },
          ]
        : [{ isPinned: "desc" as const }, { createdAt: "desc" as const }, { id: "asc" as const }];

  const projects = await unstable_cache(
    async () =>
      withPrismaRetry(() =>
        prisma.project.findMany({
          where: {
            AND: [
              buildAccessibleProjectsWhere(currentUser),
              buildProjectsWhere(filter),
            ],
          },
          include: {
            createdBy: {
              select: {
                name: true,
                email: true,
              },
            },
            executorUser: {
              select: {
                id: true,
                name: true,
                email: true,
                collaboratorType: true,
              },
            },
            stages: true,
            attachments: {
              where: {
                assetType: "GENERAL_PROJECT_ASSET" as AttachmentAssetType,
                status: "READY" as AttachmentStatus,
              },
              orderBy: {
                createdAt: "desc",
              },
              select: {
                id: true,
                stageId: true,
                revisionId: true,
                commentId: true,
                assetType: true,
                originalFileName: true,
                mimeType: true,
                fileSize: true,
                createdAt: true,
                uploadedBy: {
                  select: {
                    name: true,
                    email: true,
                  },
                },
              },
            },
          },
          orderBy,
        }),
      ),
    [
      "projects-list",
      filter.status ?? "all",
      filter.query?.trim().toLowerCase() ?? "",
      filter.category?.trim().toLowerCase() ?? "",
      filter.tag?.trim().toLowerCase() ?? "",
      filter.sort ?? "newest",
      currentUser.id,
      currentUser.role,
    ],
    { revalidate: 20, tags: [PROJECTS_CACHE_TAG] },
  )();

  const sortedProjects =
    filter.sort === "name" ? [...projects].sort(compareProjectsByName) : projects;

  return sortedProjects.map((project) => mapProjectToCard(project, currentUser));
}

export async function getProjectById(
  id: string,
  currentUser: BudgetAccessUser & ProjectAccessUser,
) {
  const project = await unstable_cache(
    async () =>
      withPrismaRetry(() =>
        prisma.project.findUnique({
          where: { id },
          include: {
            createdBy: {
              select: {
                name: true,
                email: true,
              },
            },
            executorUser: {
              select: {
                id: true,
                name: true,
                email: true,
                collaboratorType: true,
              },
            },
            executors: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                    collaboratorType: true,
                  },
                },
              },
            },
            stages: {
              include: {
                startedBy: {
                  select: {
                    name: true,
                    email: true,
                  },
                },
              },
            },
            collaborators: {
              orderBy: {
                createdAt: "asc",
              },
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                    collaboratorType: true,
                  },
                },
              },
            },
            attachments: {
              where: {
                assetType: "GENERAL_PROJECT_ASSET" as AttachmentAssetType,
                status: "READY" as AttachmentStatus,
              },
              orderBy: {
                createdAt: "desc",
              },
              select: {
                id: true,
                stageId: true,
                revisionId: true,
                commentId: true,
                assetType: true,
                originalFileName: true,
                mimeType: true,
                fileSize: true,
                createdAt: true,
                uploadedBy: {
                  select: {
                    name: true,
                    email: true,
                  },
                },
              },
            },
          },
        }),
      ),
    ["project-by-id", id, currentUser.id, currentUser.role],
    { revalidate: 20, tags: [PROJECTS_CACHE_TAG] },
  )();

  if (!project) {
    return null;
  }

  if (!canAccessProjectRecord(project, currentUser)) {
    return null;
  }

  const favoritedAttachmentIds = await getFavoriteAttachmentIdSetForUser(
    currentUser.id,
    project.attachments.map((attachment) => attachment.id),
  );

  return mapProjectToFlow(project, currentUser, favoritedAttachmentIds);
}

export async function getProjectEditorById(
  id: string,
  currentUser: BudgetAccessUser & ProjectAccessUser,
) {
  const project = await unstable_cache(
    async () =>
      withPrismaRetry(() =>
        prisma.project.findUnique({
          where: { id },
          include: {
            createdBy: {
              select: {
                name: true,
                email: true,
              },
            },
            executorUser: {
              select: {
                id: true,
                name: true,
                email: true,
                collaboratorType: true,
              },
            },
            executors: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                    collaboratorType: true,
                  },
                },
              },
            },
            stages: {
              include: {
                startedBy: {
                  select: {
                    name: true,
                    email: true,
                  },
                },
              },
            },
            collaborators: {
              orderBy: {
                createdAt: "asc",
              },
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                    collaboratorType: true,
                  },
                },
              },
            },
            attachments: {
              where: {
                assetType: "GENERAL_PROJECT_ASSET" as AttachmentAssetType,
                status: "READY" as AttachmentStatus,
              },
              orderBy: {
                createdAt: "desc",
              },
              select: {
                id: true,
                stageId: true,
                revisionId: true,
                commentId: true,
                assetType: true,
                originalFileName: true,
                mimeType: true,
                fileSize: true,
                createdAt: true,
                uploadedBy: {
                  select: {
                    name: true,
                    email: true,
                  },
                },
              },
            },
          },
        }),
      ),
    ["project-editor-by-id", id, currentUser.id, currentUser.role],
    { revalidate: 20, tags: [PROJECTS_CACHE_TAG] },
  )();

  if (!project) {
    return null;
  }

  if (!canAccessProjectRecord(project, currentUser)) {
    return null;
  }

  const favoritedAttachmentIds = await getFavoriteAttachmentIdSetForUser(
    currentUser.id,
    project.attachments.map((attachment) => attachment.id),
  );

  return mapProjectToEditor(project, currentUser, favoritedAttachmentIds);
}

export async function getProjectEditAccessById(
  id: string,
  currentUser: ProjectAccessUser,
) {
  const project = await withPrismaRetry(() =>
    prisma.project.findUnique({
      where: { id },
      select: {
        status: true,
        createdById: true,
        executorUserId: true,
        executors: {
          select: {
            userId: true,
            role: true,
          },
        },
        collaborators: {
          select: {
            userId: true,
          },
        },
      },
    }),
  );

  if (!project || !canAccessProjectRecord(project, currentUser)) {
    return null;
  }

  return {
    canEdit:
      project.status !== "COMPLETED" &&
      hasProjectPermission(currentUser, project, "project.update"),
  };
}
