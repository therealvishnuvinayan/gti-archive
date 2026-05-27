import { unstable_cache } from "next/cache";
import {
  AttachmentStatus,
  AttachmentAssetType,
  ProjectRevisionStatus,
  SubmissionReviewStatus,
  UserRole,
} from "@prisma/client";
import type {
  CollaboratorType,
  Project,
  ProjectCollaborator,
  ProjectStage,
  ProjectStatus,
  User,
} from "@prisma/client";

import {
  getDefaultProjectCollaboratorParticipantType,
  getProjectCollaboratorTypeMeta,
  type ProjectCollaboratorParticipantType,
} from "@/lib/project-collaborator-participant-types";
import { prisma, withPrismaRetry } from "@/lib/prisma";

export const PROJECTS_CACHE_TAG = "projects";

type BudgetAccessUser = Pick<User, "id">;
type ProjectAccessUser = Pick<User, "id" | "role">;

type ProjectWithCreator = Project & {
  createdBy: Pick<User, "name" | "email">;
  executorUser?: Pick<User, "id" | "name" | "email" | "collaboratorType"> | null;
  stages: ProjectStage[];
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
  featured?: boolean;
  emphasized?: boolean;
};

export type ProjectEditorRecord = {
  id: string;
  name: string;
  category: string;
  executorName: string;
  executorUserId?: string | null;
  tag: string;
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
  plannedStartAt: string;
  plannedStartAtValue: string | null;
  plannedDueAt: string;
  plannedDueAtValue: string | null;
  status: ProjectStageVisualStatus;
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
};

export type ProjectChatEntry = {
  id: string;
  kind: "revision" | "comment";
  revisionId?: string;
  title?: string;
  revisionStatus?: ProjectRevisionStatus | null;
  rejectionReason?: string | null;
  author: string;
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
  pending: number;
  completed: number;
};

export type ProjectsListFilter = {
  status?: "ONGOING" | "ON_HOLD" | "COMPLETED";
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
  return type === "EXTERNAL" ? "external" : "internal";
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
    role:
      assignment.user.collaboratorType === "EXTERNAL"
        ? "External Collaborator"
        : "Collaborator",
    group: getProjectCollaboratorTypeMeta(participantType).group,
    participantType,
    chatVisibilityPaused: assignment.chatVisibilityPaused,
    access: "view",
    removable: true,
  };
}

function canAccessProjectRecord(
  project: Pick<Project, "createdById" | "executorUserId"> & {
    collaborators?: Array<Pick<ProjectCollaborator, "userId">>;
  },
  currentUser: ProjectAccessUser,
) {
  if (
    currentUser.role === UserRole.SUPER_ADMIN ||
    currentUser.role === UserRole.ADMIN ||
    project.createdById === currentUser.id ||
    project.executorUserId === currentUser.id
  ) {
    return true;
  }

  return (
    project.collaborators?.some(
      (collaborator) => collaborator.userId === currentUser.id,
    ) ?? false
  );
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

function buildSyntheticStages(project: Project): ProjectStage[] {
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

function mapProjectToCard(project: ProjectWithCreator, index: number): ProjectCardRecord {
  return {
    id: project.id,
    stage: formatProjectStageLabel(project),
    category: project.category,
    title: project.name,
    createdOn: formatProjectDate(project.createdAt),
    createdBy: getCreatorName(project.createdBy),
    featured: index === 0,
    emphasized: index === 3,
  };
}

function mapStageToCard(
  project: ProjectWithCreator,
  stage: ProjectStage,
  allowBudgetView: boolean,
): ProjectStageRecord {
  return {
    id: stage.id,
    label: `${stage.name} : ${projectStatusMeta[stage.status].label}`,
    subtitle: project.category,
    description: stage.description?.trim() || "",
    title: project.name,
    createdOn: formatProjectDate(stage.createdAt),
    budget: allowBudgetView
      ? formatProjectBudget(stage.budget, project.currency)
      : "Restricted",
    actualStartedAt: formatProjectDateTime(stage.actualStartedAt),
    actualStartedAtValue: toProjectIsoString(stage.actualStartedAt),
    plannedStartAt: formatProjectDateTime(stage.plannedStartAt),
    plannedStartAtValue: toProjectIsoString(stage.plannedStartAt),
    plannedDueAt: formatProjectDateTime(stage.plannedDueAt),
    plannedDueAtValue: toProjectIsoString(stage.plannedDueAt),
    status: mapStageStatusToVisual(stage.status),
  };
}

function mapProjectToFlow(
  project: ProjectWithCreator,
  currentUser: BudgetAccessUser,
): ProjectFlowRecord {
  const creatorName = getCreatorName(project.createdBy);
  const executorDisplayName =
    project.executorUser?.name?.trim() ||
    project.executorUser?.email ||
    project.executorName?.trim() ||
    "—";
  const allowBudgetView = canViewProjectBudget(project, currentUser);
  const stages = getProjectStages(project);
  const currentStage =
    stages.find((stage) => stage.name === project.currentStageName) ?? stages[0] ?? null;

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
    ...(project.executorUser
      ? [
          {
            id: project.executorUser.id,
            name:
              project.executorUser.name?.trim() ||
              project.executorUser.email,
            email: project.executorUser.email,
            role: "Project Executor",
            group: mapCollaboratorTypeToGroup(project.executorUser.collaboratorType),
            chatVisibilityPaused: false,
          },
        ]
      : []),
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
    canViewBudget: allowBudgetView,
    title: project.name,
    category: project.category,
    executorName: executorDisplayName,
    description: project.description,
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
    priority: "Medium",
    stageCards: stages.map((stage) => mapStageToCard(project, stage, allowBudgetView)),
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
    attachments: project.attachments.map(mapAttachmentToRecord),
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
  currentUser: BudgetAccessUser,
): ProjectEditorRecord {
  const stages = getProjectStages(project);
  const executorDisplayName =
    project.executorUser?.name?.trim() ||
    project.executorUser?.email ||
    project.executorName?.trim() ||
    "";
  const allowBudgetView = canViewProjectBudget(project, currentUser);

  return {
    id: project.id,
    name: project.name,
    category: project.category,
    executorName: executorDisplayName,
    executorUserId: project.executorUserId ?? null,
    tag: project.tag?.trim() || "",
    description: project.description,
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
      description: stage.description?.trim() || "",
      plannedStartAt: formatProjectInputDateTime(stage.plannedStartAt ?? project.startDate),
      plannedDueAt: formatProjectInputDateTime(stage.plannedDueAt ?? project.endDate),
    })),
    collaborators: (project.collaborators ?? []).map((assignment) => ({
      ...mapProjectCollaboratorAssignmentToRecord(assignment),
    })),
    attachments: project.attachments.map(mapAttachmentToRecord),
  };
}

export async function updateProjectCollaborators(
  projectId: string,
  collaborators: Array<{
    id: string;
    participantType: ProjectCollaboratorParticipantType | null;
  }>,
  addedById: string,
) {
  const normalizedCollaborators = collaborators.reduce<
    Array<{ id: string; participantType: ProjectCollaboratorParticipantType | null }>
  >((current, collaborator) => {
    const id = collaborator.id.trim();

    if (!id || current.some((item) => item.id === id)) {
      return current;
    }

    current.push({
      id,
      participantType: collaborator.participantType,
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
      },
    }),
  );
  const existingIds = new Set(existingAssignments.map((assignment) => assignment.userId));
  const nextIds = new Set(validIds);
  const idsToDelete = existingAssignments
    .map((assignment) => assignment.userId)
    .filter((userId) => !nextIds.has(userId));
  const idsToCreate = validIds.filter((userId) => !existingIds.has(userId));
  const idsToUpdate = validIds.filter((userId) => existingIds.has(userId));

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
            participantType:
              validCollaboratorMap.get(userId) ??
              getDefaultProjectCollaboratorParticipantType(
                validCollaboratorTypeMap.get(userId) ?? "external",
              ),
          },
        }),
      ),
      ...(idsToCreate.length > 0
        ? [
            prisma.projectCollaborator.createMany({
              data: idsToCreate.map((userId) => ({
                projectId,
                userId,
                addedById,
                participantType:
                  validCollaboratorMap.get(userId) ??
                  getDefaultProjectCollaboratorParticipantType(
                    validCollaboratorTypeMap.get(userId) ?? "external",
                  ),
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
  actor: Pick<User, "id" | "role">,
  projectId: string,
) {
  const project = await withPrismaRetry(() =>
    prisma.project.findUnique({
      where: {
        id: projectId,
      },
      select: {
        id: true,
        createdById: true,
      },
    }),
  );

  if (!project) {
    throw new Error("Project not found.");
  }

  if (
    actor.role !== UserRole.SUPER_ADMIN &&
    actor.role !== UserRole.ADMIN &&
    project.createdById !== actor.id
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

export async function removeProjectCollaborator(
  actor: Pick<User, "id" | "role">,
  projectId: string,
  collaboratorId: string,
) {
  await assertProjectCollaboratorManagementAccess(actor, projectId);

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
  actor: Pick<User, "id" | "role">,
  input: {
    projectId: string;
    collaboratorId: string;
    paused: boolean;
  },
) {
  await assertProjectCollaboratorManagementAccess(actor, input.projectId);

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

  return {
    ...(filter.status
      ? {
          status:
            filter.status === "ONGOING"
              ? {
                  in: ["ONGOING", "PENDING"] as ProjectStatus[],
                }
              : filter.status,
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

export async function getProjectListFilterOptions(): Promise<ProjectListFilterOptions> {
  const projects = await unstable_cache(
    async () =>
      withPrismaRetry(() =>
        prisma.project.findMany({
          select: {
            category: true,
            tag: true,
          },
        }),
      ),
    ["project-list-filter-options"],
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

export async function getDashboardProjectCounts(): Promise<DashboardProjectCounts> {
  const getCachedCounts = unstable_cache(
    async () =>
      withPrismaRetry(() =>
        Promise.all([
          prisma.project.count(),
          prisma.project.groupBy({
            by: ["status"],
            _count: {
              _all: true,
            },
          }),
        ]),
      ),
    ["dashboard-project-counts"],
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
    pending: counts.PENDING,
    completed: counts.COMPLETED,
  };
}

export async function getRecentProjects(limit = 5) {
  const projects = await unstable_cache(
    async () =>
      withPrismaRetry(() =>
        prisma.project.findMany({
          orderBy: {
            createdAt: "desc",
          },
          take: limit,
        }),
      ),
    ["recent-projects", String(limit)],
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

export async function getProjectsList(filter: ProjectsListFilter) {
  const orderBy =
    filter.sort === "oldest"
      ? [{ createdAt: "asc" as const }]
      : filter.sort === "name"
        ? [{ name: "asc" as const }]
        : [{ createdAt: "desc" as const }];

  const projects = await unstable_cache(
    async () =>
      withPrismaRetry(() =>
        prisma.project.findMany({
          where: buildProjectsWhere(filter),
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
    ],
    { revalidate: 20, tags: [PROJECTS_CACHE_TAG] },
  )();

  return projects.map(mapProjectToCard);
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
            stages: true,
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
    ["project-by-id", id, currentUser.id],
    { revalidate: 20, tags: [PROJECTS_CACHE_TAG] },
  )();

  if (!project) {
    return null;
  }

  if (!canAccessProjectRecord(project, currentUser)) {
    return null;
  }

  return mapProjectToFlow(project, currentUser);
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
            stages: true,
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
    ["project-editor-by-id", id, currentUser.id],
    { revalidate: 20, tags: [PROJECTS_CACHE_TAG] },
  )();

  if (!project) {
    return null;
  }

  if (!canAccessProjectRecord(project, currentUser)) {
    return null;
  }

  return mapProjectToEditor(project, currentUser);
}
