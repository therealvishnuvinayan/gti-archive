import { unstable_cache } from "next/cache";
import {
  AttachmentStatus,
  AttachmentAssetType,
  Prisma,
  ProjectExecutionType,
  ProjectExecutorRole,
  ProjectRevisionStatus,
  StageStatus,
  SubmissionReviewStatus,
  UserRole,
} from "@prisma/client";
import type {
  CollaboratorType,
  Project,
  ProjectCollaborator,
  ProjectExecutor,
  ProjectTag,
  ProjectStage,
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
import {
  DEFAULT_PROJECT_CURRENCY,
  resolveProjectCurrency,
} from "@/lib/project-currencies";
import {
  canBypassCollaboratorVisibility,
  getProjectCollaboratorVisibilityState,
  isTimestampHiddenByPauseWindows,
} from "@/lib/project-collaborator-visibility";
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
import {
  defaultProjectStatusGroupSlugs,
  getActiveProjectStatusOptions,
  getProjectStatusDisplay,
  isProjectStatusCompleted,
  type ActiveProjectStatusOption,
} from "@/lib/project-statuses";

export const PROJECTS_CACHE_TAG = "projects";
export const INTERNAL_EXECUTION_NOT_REQUIRED_LABEL =
  "Not required for internal execution";
export const PROJECT_BUDGET_NOT_REQUIRED_LABEL = "No budget required";
export const PROJECT_BUDGET_REQUIRED_NOT_SET_LABEL = "Budget required - not set";
export const MAX_PROJECT_TAGS = 5;

type BudgetAccessUser = Pick<User, "id">;
export type ProjectAccessUser = PermissionUser;
type ProjectStageWithStarter = ProjectStage & {
  startedBy?: Pick<User, "name" | "email"> | null;
  invoiceRequests?: Array<{
    id: string;
    requestedById: string;
    requestedFromId: string;
    note: string | null;
    fulfilledAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    requestedBy: Pick<User, "name" | "email">;
    requestedFrom: Pick<User, "name" | "email">;
  }>;
};

const projectStatusGroupSelect = {
  id: true,
  name: true,
  slug: true,
  color: true,
  isActive: true,
} as const;

type ProjectStatusGroupRelation = {
  id: string;
  name: string;
  slug: string;
  color: string | null;
  isActive?: boolean;
} | null;

type ProjectStatusRelation = {
  id: string;
  name: string;
  slug: string;
  color: string | null;
  group: ProjectStatusGroupRelation;
  isActive?: boolean;
} | null;

type ProjectWithCreator = Project & {
  createdBy: Pick<User, "name" | "email">;
  status: ProjectStatusRelation;
  tags?: Array<{
    tag: Pick<ProjectTag, "id" | "name" | "color">;
  }>;
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
  tags: string[];
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
  executorDisplayName: string;
  executors: ProjectExecutorRecord[];
  tags: string[];
  priority: ProjectPriorityValue;
  description: string;
  executionType: ProjectExecutionType;
  budgetRequired: boolean;
  budget: string;
  currency: string | null;
  canViewBudget: boolean;
  statusId: string | null;
  statusName: string;
  statusColor: string;
  statusGroupId: string | null;
  statusGroupName: string;
  statusGroupSlug: string;
  statusGroupColor: string;
  statusGroupIsActive: boolean;
  statusIsActive: boolean;
  startDate: string;
  endDate: string;
  stages: Array<{
    id: string;
    name: string;
    invoiceRequired: boolean;
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
  order: number;
  label: string;
  name: string;
  statusLabel: "Pending" | "Ongoing" | "On Hold" | "Completed";
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
  invoiceRequired: boolean;
  invoiceAttachment: ProjectAttachmentRecord | null;
  invoiceRequest: {
    id: string;
    requestedById: string;
    requestedByName: string;
    requestedFromId: string;
    requestedFromName: string;
    note: string | null;
    requestedAt: string;
    fulfilledAt: string | null;
  } | null;
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
  chatVisibilityPaused: boolean;
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
  kind: "revision" | "comment" | "system" | "comparison";
  revisionId?: string;
  revisionNumber?: number;
  title?: string;
  revisionStatus?: ProjectRevisionStatus | null;
  rejectionReason?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  authorId?: string;
  author: string;
  authorAvatarSrc?: string | null;
  role: string;
  body: string;
  createdAt: string;
  deletedAt?: string | null;
  deletedByUserId?: string | null;
  canDeleteUntil?: string | null;
  mentions?: Array<{
    userId: string;
    name: string;
  }>;
  attachments?: ProjectAttachmentRecord[];
  comparison?: {
    baseAttachmentId: string;
    compareAttachmentId: string;
    baseFileName: string;
    compareFileName: string;
    baseSubmissionLabel: string;
    compareSubmissionLabel: string;
    xPercent: number;
    yPercent: number;
  };
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
  executors: ProjectExecutorRecord[];
  canViewBudget: boolean;
  title: string;
  category: string;
  executorDisplayName: string;
  description: string;
  executionType: ProjectExecutionType;
  executionTypeLabel: string;
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
  tags: string[];
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
  status?: string;
  query?: string;
  category?: string;
  tag?: string;
  sort?: "newest" | "oldest" | "name";
};

export type ProjectListFilterOptions = {
  statuses: ActiveProjectStatusOption[];
  categories: string[];
  tags: string[];
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
  currency: string | null | undefined = DEFAULT_PROJECT_CURRENCY,
) {
  if (!budget || budget <= 0) {
    return "Not specified";
  }

  const currencyCode = resolveProjectCurrency(currency ?? "");

  if (!currencyCode) {
    return "Not specified";
  }

  return `${budget.toLocaleString("en-US")} ${currencyCode}`;
}

export function formatProjectExecutionTypeLabel(
  executionType: ProjectExecutionType,
) {
  return executionType === ProjectExecutionType.INTERNAL
    ? "Internal Execution"
    : "External Execution";
}

function isInternalExecutionProject(project: Pick<Project, "executionType">) {
  return project.executionType === ProjectExecutionType.INTERNAL;
}

function formatProjectBudgetForRequirement(
  project: Pick<Project, "budgetRequired" | "currency">,
  budget: number | null | undefined,
) {
  if (budget && budget > 0) {
    return formatProjectBudget(budget, project.currency);
  }

  return project.budgetRequired
    ? PROJECT_BUDGET_REQUIRED_NOT_SET_LABEL
    : PROJECT_BUDGET_NOT_REQUIRED_LABEL;
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

function uniqueTrimmedValues(values: Array<string | null | undefined>) {
  const normalized = new Map<string, string>();

  values.forEach((value) => {
    const trimmedValue = value?.trim();

    if (!trimmedValue) {
      return;
    }

    const key = trimmedValue.toLowerCase();
    if (!normalized.has(key)) {
      normalized.set(key, trimmedValue);
    }
  });

  return [...normalized.values()];
}

function getProjectTagNames(
  project: {
    tags?: Array<{
      tag: Pick<ProjectTag, "name">;
    }>;
  },
) {
  const relationTags =
    project.tags
      ?.map((assignment) => assignment.tag.name)
      .filter((tagName) => tagName.trim())
      .sort((left, right) =>
        left.localeCompare(right, undefined, { sensitivity: "base" }),
      ) ?? [];

  return uniqueTrimmedValues(relationTags);
}

function formatProjectTagsLabel(tags: string[]) {
  return tags.length > 0 ? tags.join(", ") : "—";
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
  visibilityStateByUserId: ReadonlyMap<string, boolean>,
): ProjectExecutorRecord {
  return {
    id: assignment.user.id,
    name: assignment.user.name?.trim() || assignment.user.email,
    email: assignment.user.email,
    role: assignment.role,
    roleLabel: formatProjectExecutorRole(assignment.role),
    group: mapCollaboratorTypeToGroup(assignment.user.collaboratorType),
    chatVisibilityPaused: visibilityStateByUserId.get(assignment.user.id) ?? false,
  };
}

function getProjectExecutorRecords(
  project: Pick<
    ProjectWithCreator,
    "executors" | "collaborators"
  >,
) {
  const visibilityStateByUserId = new Map(
    (project.collaborators ?? []).map((collaborator) => [
      collaborator.userId,
      collaborator.chatVisibilityPaused,
    ] as const),
  );
  const mappedExecutors = (project.executors ?? [])
    .map((assignment) =>
      mapProjectExecutorAssignmentToRecord(assignment, visibilityStateByUserId),
    )
    .filter((executor, index, current) =>
      current.findIndex((item) => item.id === executor.id) === index,
    )
    .sort(compareProjectExecutorRecords);

  return mappedExecutors;
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

function maskExecutorVisibilityState(executor: ProjectExecutorRecord) {
  return {
    ...executor,
    chatVisibilityPaused: false,
  };
}

function maskCollaboratorVisibilityState(collaborator: ProjectCollaboratorRecord) {
  return {
    ...collaborator,
    chatVisibilityPaused: false,
  };
}

function buildProjectStatusWhere(statusFilter?: string): Prisma.ProjectWhereInput | null {
  if (!statusFilter || statusFilter === "ALL") {
    return null;
  }

  const normalizedFilter = statusFilter.trim();
  const groupFilterPrefix = "group:";

  if (normalizedFilter.startsWith(groupFilterPrefix)) {
    const groupSlug = normalizedFilter.slice(groupFilterPrefix.length);

    if (!groupSlug) {
      return null;
    }

    return {
      status: {
        is: {
          group: {
            is: {
              slug: groupSlug,
            },
          },
        },
      },
    };
  }

  const groupSlugByLegacyFilter: Record<string, string> = {
    ONGOING: defaultProjectStatusGroupSlugs.active,
    ACTIVE: defaultProjectStatusGroupSlugs.active,
    PENDING: defaultProjectStatusGroupSlugs.pending,
    ON_HOLD: defaultProjectStatusGroupSlugs.onHold,
    ARCHIVED: defaultProjectStatusGroupSlugs.archived,
    CANCELLED: defaultProjectStatusGroupSlugs.cancelled,
  };

  if (normalizedFilter === "COMPLETED") {
    return {
      status: {
        is: {
          group: {
            is: {
              slug: {
                in: [
                  defaultProjectStatusGroupSlugs.completed,
                  defaultProjectStatusGroupSlugs.archived,
                ],
              },
            },
          },
        },
      },
    };
  }

  const legacyGroupSlug = groupSlugByLegacyFilter[normalizedFilter];

  if (legacyGroupSlug) {
    return {
      status: {
        is: {
          group: {
            is: {
              slug: legacyGroupSlug,
            },
          },
        },
      },
    };
  }

  return {
    statusId: normalizedFilter,
  };
}

function canAccessProjectRecord(
  project: Pick<Project, "createdById"> & {
    executors?: Array<Pick<ProjectExecutor, "userId" | "role">>;
    collaborators?: Array<Pick<ProjectCollaborator, "userId">>;
  },
  currentUser: ProjectAccessUser,
) {
  return hasProjectPermission(currentUser, project, "project.view");
}

function canViewBriefContent(
  project: Pick<Project, "createdById"> & {
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

async function getProjectAttachmentsVisibleToUser(
  currentUser: ProjectAccessUser,
  project: Pick<ProjectWithCreator, "id" | "createdById" | "attachments">,
) {
  if (canBypassCollaboratorVisibility(currentUser, project.createdById)) {
    return project.attachments;
  }

  const visibilityState = await getProjectCollaboratorVisibilityState(
    project.id,
    currentUser.id,
  );

  if (!visibilityState) {
    return project.attachments;
  }

  if (
    visibilityState.chatVisibilityPaused &&
    visibilityState.visibilityPauses.length === 0
  ) {
    return [];
  }

  return project.attachments.filter(
    (attachment) =>
      !isTimestampHiddenByPauseWindows(
        attachment.createdAt,
        visibilityState.visibilityPauses,
      ),
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

function mapStageStatusToVisual(status: StageStatus): ProjectStageVisualStatus {
  switch (status) {
    case StageStatus.COMPLETED:
      return "completed";
    case StageStatus.ON_HOLD:
      return "on-hold";
    case StageStatus.PENDING:
      return "pending";
    default:
      return "in-progress";
  }
}

function mapStageStatusToDisplayLabel(
  status: StageStatus,
): ProjectStageRecord["statusLabel"] {
  switch (status) {
    case StageStatus.COMPLETED:
      return "Completed";
    case StageStatus.ON_HOLD:
      return "On Hold";
    case StageStatus.PENDING:
      return "Pending";
    default:
      return "Ongoing";
  }
}

function buildSyntheticStages(project: ProjectWithCreator): ProjectStageWithStarter[] {
  const isInternalExecution = isInternalExecutionProject(project);
  const completed = isProjectStatusCompleted(project.status);

  return Array.from({ length: Math.max(project.stageCount, 1) }, (_, index) => ({
    id: `${project.id}-stage-${index + 1}`,
    projectId: project.id,
    name:
      index === 0
        ? project.currentStageName?.trim() || `Stage ${index + 1}`
        : `Stage ${index + 1}`,
    description: null,
    budget: isInternalExecution ? null : index === 0 ? project.budget : null,
    actualStartedAt: null,
    startedById: null,
    completedAt: null,
    invoiceRequired: !isInternalExecution,
    plannedStartAt: project.startDate,
    plannedDueAt: project.endDate,
    status: completed
      ? StageStatus.COMPLETED
      : index === 0
        ? StageStatus.ONGOING
        : StageStatus.PENDING,
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

export function formatProjectStageLabel(
  project: Pick<Project, "currentStageName"> & { status: ProjectStatusRelation },
) {
  const stageName = project.currentStageName?.trim() || "Stage 1";
  const statusLabel = getProjectStatusDisplay(project.status).name;

  return `${stageName} : ${statusLabel}`;
}

function mapProjectToCard(
  project: ProjectWithCreator,
  currentUser: ProjectAccessUser,
): ProjectCardRecord {
  const tags = getProjectTagNames(project);

  return {
    id: project.id,
    stage: formatProjectStageLabel(project),
    category: project.category,
    tags,
    title: project.name,
    createdOn: formatProjectDate(project.createdAt),
    createdBy: getCreatorName(project.createdBy),
    isPinned: project.isPinned,
    canPin: hasProjectPermission(currentUser, project, "project.update"),
    canEdit:
      !isProjectStatusCompleted(project.status) &&
      hasProjectPermission(currentUser, project, "project.update"),
    canDelete:
      !isProjectStatusCompleted(project.status) &&
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
  const invoiceRequest = stage.invoiceRequests?.[0] ?? null;

  return {
    id: stage.id,
    order: stage.order,
    label: `${stage.name} : ${mapStageStatusToDisplayLabel(stage.status)}`,
    name: stage.name,
    statusLabel: mapStageStatusToDisplayLabel(stage.status),
    subtitle: project.category,
    description: canViewBrief ? stage.description?.trim() || "" : "",
    title: project.name,
    createdOn: formatProjectDate(stage.createdAt),
    budget: allowBudgetView
      ? formatProjectBudgetForRequirement(project, stage.budget)
      : "Restricted",
    actualStartedAt: formatProjectDateTime(stage.actualStartedAt),
    actualStartedAtValue: toProjectIsoString(stage.actualStartedAt),
    startedByName: stage.startedBy ? getCreatorName(stage.startedBy) : null,
    plannedStartAt: formatProjectDateTime(stage.plannedStartAt),
    plannedStartAtValue: toProjectIsoString(stage.plannedStartAt),
    plannedDueAt: formatProjectDateTime(stage.plannedDueAt),
    plannedDueAtValue: toProjectIsoString(stage.plannedDueAt),
    status: mapStageStatusToVisual(stage.status),
    invoiceRequired: stage.invoiceRequired,
    invoiceAttachment: null,
    invoiceRequest: invoiceRequest
      ? {
          id: invoiceRequest.id,
          requestedById: invoiceRequest.requestedById,
          requestedByName: getCreatorName(invoiceRequest.requestedBy),
          requestedFromId: invoiceRequest.requestedFromId,
          requestedFromName: getCreatorName(invoiceRequest.requestedFrom),
          note: invoiceRequest.note,
          requestedAt: formatProjectDateTime(invoiceRequest.updatedAt),
          fulfilledAt: invoiceRequest.fulfilledAt
            ? formatProjectDateTime(invoiceRequest.fulfilledAt)
            : null,
        }
      : null,
    briefAttachments: canViewBrief ? briefAttachments : [],
  };
}

function mapProjectToFlow(
  project: ProjectWithCreator,
  currentUser: BudgetAccessUser & ProjectAccessUser,
  favoritedAttachmentIds?: ReadonlySet<string>,
): ProjectFlowRecord {
  const creatorName = getCreatorName(project.createdBy);
  const rawExecutorRecords = getProjectExecutorRecords(project);
  const canViewChatVisibilityState = hasProjectPermission(
    currentUser,
    project,
    "collaborator.pauseVisibility",
  );
  const executorRecords = canViewChatVisibilityState
    ? rawExecutorRecords
    : rawExecutorRecords.map(maskExecutorVisibilityState);
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
  const stageInvoiceAttachmentMap = new Map<string, ProjectAttachmentRecord>();
  const tags = getProjectTagNames(project);

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

  project.attachments
    .filter((attachment) => attachment.assetType === AttachmentAssetType.STAGE_INVOICE)
    .forEach((attachment) => {
      if (!attachment.stageId || stageInvoiceAttachmentMap.has(attachment.stageId)) {
        return;
      }

      stageInvoiceAttachmentMap.set(
        attachment.stageId,
        mapAttachmentToRecord(attachment, favoritedAttachmentIds),
      );
    });

  const rawCollaboratorRecords = (project.collaborators ?? [])
    .map(mapProjectCollaboratorAssignmentToRecord)
    .filter((collaborator, index, current) =>
      current.findIndex((item) => item.id === collaborator.id) === index,
    );
  const collaboratorRecords = canViewChatVisibilityState
    ? rawCollaboratorRecords
    : rawCollaboratorRecords.map(maskCollaboratorVisibilityState);
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
      chatVisibilityPaused: executor.chatVisibilityPaused,
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
    executors: executorRecords,
    canViewBudget: allowBudgetView,
    title: project.name,
    category: project.category,
    executorDisplayName,
    description: allowBriefView ? project.description : "",
    executionType: project.executionType,
    executionTypeLabel: formatProjectExecutionTypeLabel(project.executionType),
    budget: allowBudgetView
      ? formatProjectBudgetForRequirement(project, project.budget)
      : "Restricted",
    currency: allowBudgetView ? project.currency : null,
    statusLabel: getProjectStatusDisplay(project.status).name,
    currentStageName: currentStage?.name ?? project.currentStageName?.trim() ?? "Stage 1",
    currentStageId: currentStage?.id ?? null,
    stageCount: stages.length,
    startDate: formatProjectDate(project.startDate),
    endDate: formatProjectDate(project.endDate),
    createdOn: formatProjectDate(project.createdAt),
    createdBy: creatorName,
    tags,
    priority: formatProjectPriority(project.priority ?? DEFAULT_PROJECT_PRIORITY),
    stageCards: stages.map((stage) => ({
      ...mapStageToCard(
        project,
        stage,
        allowBudgetView,
        allowBriefView,
        stageBriefAttachmentMap.get(stage.id) ?? [],
      ),
      invoiceAttachment: stageInvoiceAttachmentMap.get(stage.id) ?? null,
    })),
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
  const tags = getProjectTagNames(project);
  const statusDisplay = getProjectStatusDisplay(project.status);
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
    executorDisplayName,
    executors: executorRecords,
    tags,
    priority: project.priority ?? DEFAULT_PROJECT_PRIORITY,
    description: allowBriefView ? project.description : "",
    executionType: project.executionType,
    budgetRequired: project.budgetRequired,
    budget:
      allowBudgetView && project.budget && project.budget > 0
        ? String(project.budget)
        : "",
    currency: allowBudgetView ? project.currency : null,
    canViewBudget: allowBudgetView,
    statusId: statusDisplay.id,
    statusName: statusDisplay.name,
    statusColor: statusDisplay.color,
    statusGroupId: statusDisplay.group?.id ?? null,
    statusGroupName: statusDisplay.group?.name ?? "No group",
    statusGroupSlug: statusDisplay.group?.slug ?? "",
    statusGroupColor: statusDisplay.group?.color ?? "",
    statusGroupIsActive: statusDisplay.group?.isActive ?? true,
    statusIsActive: project.status?.isActive ?? true,
    startDate: formatProjectInputDate(project.startDate),
    endDate: formatProjectInputDate(project.endDate),
    stages: stages.map((stage, index) => ({
      id: stage.id,
      name: stage.name,
      invoiceRequired: isInternalExecutionProject(project) ? false : stage.invoiceRequired,
      budget:
        allowBudgetView && ((stage.budget ?? 0) > 0 || (index === 0 && (project.budget ?? 0) > 0))
          ? stage.budget && stage.budget > 0
            ? String(stage.budget)
            : index === 0
              ? String(project.budget ?? "")
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
  const project = await assertProjectCollaboratorManagementAccess(
    actor,
    input.projectId,
    "collaborator.pauseVisibility",
  );

  if (input.collaboratorId === actor.id) {
    throw new Error("You cannot change your own chat visibility.");
  }

  if (input.collaboratorId === project.createdById) {
    throw new Error("Project owner chat visibility cannot be changed.");
  }

  const isExecutorTarget = project.executors.some(
    (executor) => executor.userId === input.collaboratorId,
  );

  let assignment = await withPrismaRetry(() =>
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
    if (!input.paused || !isExecutorTarget) {
      throw new Error("Collaborator not found.");
    }

    const targetUser = await withPrismaRetry(() =>
      prisma.user.findUnique({
        where: {
          id: input.collaboratorId,
        },
        select: {
          collaboratorType: true,
        },
      }),
    );

    if (!targetUser) {
      throw new Error("Collaborator not found.");
    }

    assignment = await withPrismaRetry(() =>
      prisma.projectCollaborator.create({
        data: {
          projectId: input.projectId,
          userId: input.collaboratorId,
          addedById: actor.id,
          participantType: getDefaultProjectCollaboratorParticipantType(
            mapCollaboratorTypeToGroup(targetUser.collaboratorType),
          ),
        },
        select: {
          projectId: true,
          userId: true,
          chatVisibilityPaused: true,
        },
      }),
    );
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
  const statusWhere = buildProjectStatusWhere(filter.status);
  const clauses: Prisma.ProjectWhereInput[] = [];

  if (statusWhere) {
    clauses.push(statusWhere);
  }

  if (query) {
    clauses.push({
      OR: [
        {
          name: {
            contains: query,
            mode: "insensitive",
          },
        },
        {
          category: {
            contains: query,
            mode: "insensitive",
          },
        },
        {
          tags: {
            some: {
              tag: {
                is: {
                  name: {
                    contains: query,
                    mode: "insensitive",
                  },
                },
              },
            },
          },
        },
        {
          status: {
            is: {
              name: {
                contains: query,
                mode: "insensitive",
              },
            },
          },
        },
        {
          createdBy: {
            is: {
              name: {
                contains: query,
                mode: "insensitive",
              },
            },
          },
        },
        {
          createdBy: {
            is: {
              email: {
                contains: query,
                mode: "insensitive",
              },
            },
          },
        },
        {
          executors: {
            some: {
              user: {
                is: {
                  name: {
                    contains: query,
                    mode: "insensitive",
                  },
                },
              },
            },
          },
        },
        {
          executors: {
            some: {
              user: {
                is: {
                  email: {
                    contains: query,
                    mode: "insensitive",
                  },
                },
              },
            },
          },
        },
      ],
    });
  }

  if (category) {
    clauses.push({
      category: {
        equals: category,
        mode: "insensitive",
      },
    });
  }

  if (tag) {
    clauses.push({
      tags: {
        some: {
          tag: {
            is: {
              name: {
                equals: tag,
                mode: "insensitive",
              },
            },
          },
        },
      },
    });
  }

  return clauses.length > 0 ? { AND: clauses } : {};
}

export async function getProjectListFilterOptions(
  currentUser: ProjectAccessUser,
): Promise<ProjectListFilterOptions> {
  const accessibleWhere = buildAccessibleProjectsWhere(currentUser);
  const [projects, statuses] = await Promise.all([
    unstable_cache(
      async () =>
        withPrismaRetry(() =>
          prisma.project.findMany({
            where: accessibleWhere,
            select: {
              category: true,
              tags: {
                include: {
                  tag: true,
                },
              },
            },
          }),
        ),
      [
        "project-list-filter-options",
        currentUser.id,
        currentUser.role,
      ],
      { revalidate: 20, tags: [PROJECTS_CACHE_TAG] },
    )(),
    getActiveProjectStatusOptions(),
  ]);

  const categories = new Map<string, string>();
  const tags = new Map<string, string>();

  for (const project of projects) {
    const normalizedCategory = project.category.trim();
    if (normalizedCategory) {
      categories.set(normalizedCategory.toLowerCase(), normalizedCategory);
    }

    for (const normalizedTag of getProjectTagNames(project)) {
      tags.set(normalizedTag.toLowerCase(), normalizedTag);
    }
  }

  return {
    statuses,
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
        prisma.project.findMany({
          where: accessibleWhere,
          select: {
            status: {
              select: {
                group: {
                  select: projectStatusGroupSelect,
                },
              },
            },
          },
        }),
      ),
    [
      "dashboard-project-counts",
      currentUser?.id ?? "all",
      currentUser?.role ?? "all",
    ],
    { revalidate: 20, tags: [PROJECTS_CACHE_TAG] },
  );

  const projects = await getCachedCounts();

  const counts = projects.reduce(
    (accumulator, project) => {
      const groupSlug = project.status?.group?.slug;

      if (groupSlug === defaultProjectStatusGroupSlugs.pending) {
        accumulator.pending += 1;
      } else if (groupSlug === defaultProjectStatusGroupSlugs.onHold) {
        accumulator.onHold += 1;
      } else if (
        groupSlug === defaultProjectStatusGroupSlugs.completed ||
        groupSlug === defaultProjectStatusGroupSlugs.archived
      ) {
        accumulator.completed += 1;
      } else if (groupSlug === defaultProjectStatusGroupSlugs.active) {
        accumulator.ongoing += 1;
      }

      return accumulator;
    },
    {
      ongoing: 0,
      onHold: 0,
      pending: 0,
      completed: 0,
    },
  );

  return {
    total: projects.length,
    ongoing: counts.ongoing,
    onHold: counts.onHold,
    pending: counts.pending,
    completed: counts.completed,
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
          select: {
            id: true,
            name: true,
            status: {
              select: {
                id: true,
                name: true,
                slug: true,
                color: true,
                group: {
                  select: projectStatusGroupSelect,
                },
              },
            },
            category: true,
            tags: {
              include: {
                tag: true,
              },
            },
            createdAt: true,
          },
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

  return projects.map((project, index) => {
    const tags = getProjectTagNames(project);
    const tagLabel = formatProjectTagsLabel(tags);

    return {
      id: project.id,
      name: project.name,
      statusLabel: getProjectStatusDisplay(project.status).name,
      meta: [
        project.category,
        tagLabel === "—" ? null : tagLabel,
        `Created ${formatProjectDate(project.createdAt)}`,
      ].filter(Boolean).join(" • "),
      href: `/projects/${project.id}`,
      tone: index < 2 ? "brand" : index < 4 ? "deep" : "muted",
    };
  }) as {
    id: string;
    name: string;
    statusLabel: string;
    meta: string;
    href: string;
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
            status: {
              select: {
                id: true,
                name: true,
                slug: true,
                color: true,
                group: {
                  select: projectStatusGroupSelect,
                },
              },
            },
            tags: {
              include: {
                tag: true,
              },
            },
            createdBy: {
              select: {
                name: true,
                email: true,
              },
            },
            stages: true,
            attachments: {
              where: {
                assetType: {
                  in: [
                    "GENERAL_PROJECT_ASSET" as AttachmentAssetType,
                    "STAGE_INVOICE" as AttachmentAssetType,
                  ],
                },
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
            status: {
              select: {
                id: true,
                name: true,
                slug: true,
                color: true,
                group: {
                  select: projectStatusGroupSelect,
                },
              },
            },
            tags: {
              include: {
                tag: true,
              },
            },
            createdBy: {
              select: {
                name: true,
                email: true,
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
                invoiceRequests: {
                  include: {
                    requestedBy: {
                      select: {
                        name: true,
                        email: true,
                      },
                    },
                    requestedFrom: {
                      select: {
                        name: true,
                        email: true,
                      },
                    },
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
                assetType: {
                  in: [
                    "GENERAL_PROJECT_ASSET" as AttachmentAssetType,
                    "STAGE_INVOICE" as AttachmentAssetType,
                  ],
                },
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

  const visibleAttachments = await getProjectAttachmentsVisibleToUser(
    currentUser,
    project,
  );
  const favoritedAttachmentIds = await getFavoriteAttachmentIdSetForUser(
    currentUser.id,
    visibleAttachments.map((attachment) => attachment.id),
  );

  return mapProjectToFlow(
    {
      ...project,
      attachments: visibleAttachments,
    },
    currentUser,
    favoritedAttachmentIds,
  );
}

export async function getProjectShellById(
  id: string,
  currentUser: BudgetAccessUser & ProjectAccessUser,
) {
  const project = await unstable_cache(
    async () =>
      withPrismaRetry(() =>
        prisma.project.findUnique({
          where: { id },
          include: {
            status: {
              select: {
                id: true,
                name: true,
                slug: true,
                color: true,
                group: {
                  select: projectStatusGroupSelect,
                },
              },
            },
            tags: {
              include: {
                tag: true,
              },
            },
            createdBy: {
              select: {
                name: true,
                email: true,
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
                invoiceRequests: {
                  include: {
                    requestedBy: {
                      select: {
                        name: true,
                        email: true,
                      },
                    },
                    requestedFrom: {
                      select: {
                        name: true,
                        email: true,
                      },
                    },
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
          },
        }),
      ),
    ["project-shell-by-id", id, currentUser.id, currentUser.role],
    { revalidate: 20, tags: [PROJECTS_CACHE_TAG] },
  )();

  if (!project) {
    return null;
  }

  if (!canAccessProjectRecord(project, currentUser)) {
    return null;
  }

  return mapProjectToFlow(
    {
      ...project,
      attachments: [],
    },
    currentUser,
  );
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
            status: {
              select: {
                id: true,
                name: true,
                slug: true,
                color: true,
                group: {
                  select: projectStatusGroupSelect,
                },
                isActive: true,
              },
            },
            tags: {
              include: {
                tag: true,
              },
            },
            createdBy: {
              select: {
                name: true,
                email: true,
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
                invoiceRequests: {
                  include: {
                    requestedBy: {
                      select: {
                        name: true,
                        email: true,
                      },
                    },
                    requestedFrom: {
                      select: {
                        name: true,
                        email: true,
                      },
                    },
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
                assetType: {
                  in: [
                    "GENERAL_PROJECT_ASSET" as AttachmentAssetType,
                    "STAGE_INVOICE" as AttachmentAssetType,
                  ],
                },
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
        status: {
          select: {
            id: true,
            name: true,
            slug: true,
            color: true,
            group: {
              select: projectStatusGroupSelect,
            },
          },
        },
        createdById: true,
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
      !isProjectStatusCompleted(project.status) &&
      hasProjectPermission(currentUser, project, "project.update"),
  };
}

export async function getProjectRouteAvailability(
  id: string,
  currentUser: ProjectAccessUser,
): Promise<"available" | "not-found" | "access-unavailable"> {
  const project = await withPrismaRetry(() =>
    prisma.project.findUnique({
      where: { id },
      select: {
        createdById: true,
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

  if (!project) {
    return "not-found";
  }

  return canAccessProjectRecord(project, currentUser)
    ? "available"
    : "access-unavailable";
}
