import { unstable_cache } from "next/cache";
import {
  AttachmentStatus,
  AttachmentAssetType,
  UserRole,
} from "@prisma/client";
import type {
  CollaboratorType,
  CurrencyCode,
  Project,
  ProjectCollaborator,
  ProjectStage,
  ProjectStatus,
  User,
} from "@prisma/client";

import { prisma, withPrismaRetry } from "@/lib/prisma";

export const PROJECTS_CACHE_TAG = "projects";

type ProjectWithCreator = Project & {
  createdBy: Pick<User, "name" | "email">;
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
  tag: string;
  description: string;
  budget: string;
  currency: CurrencyCode;
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
  plannedStartAt: string;
  plannedDueAt: string;
  status: ProjectStageVisualStatus;
};

export type ProjectCollaboratorRecord = {
  id: string;
  name: string;
  email?: string;
  role: string;
  group: "internal" | "external";
  access: "owner" | "view";
  removable?: boolean;
};

export type ProjectAttachmentRecord = {
  id: string;
  isSubmission: boolean;
  submissionNumber?: number;
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
  author: string;
  role: string;
  body: string;
  createdAt: string;
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
  title: string;
  category: string;
  description: string;
  budget: string;
  currency: CurrencyCode;
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
  sort?: "newest" | "oldest" | "name";
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
  currency: CurrencyCode = "USD",
) {
  if (!budget || budget <= 0) {
    return "—";
  }

  return `${budget.toLocaleString("en-US")} ${currency}`;
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
  return {
    id: assignment.user.id,
    name: assignment.user.name?.trim() || assignment.user.email,
    email: assignment.user.email,
    role:
      assignment.user.collaboratorType === "EXTERNAL"
        ? "External Collaborator"
        : "Collaborator",
    group: mapCollaboratorTypeToGroup(assignment.user.collaboratorType),
    access: "view",
    removable: true,
  };
}

function mapAttachmentToRecord(
  attachment: {
    id: string;
    assetType: AttachmentAssetType;
    originalFileName: string;
    mimeType: string;
    fileSize: number;
    createdAt: Date | string | number;
    uploadedBy: Pick<User, "name" | "email">;
  },
): ProjectAttachmentRecord {
  return {
    id: attachment.id,
    isSubmission: attachment.assetType === AttachmentAssetType.STAGE_SUBMISSION,
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

function mapStageToCard(project: ProjectWithCreator, stage: ProjectStage): ProjectStageRecord {
  return {
    id: stage.id,
    label: `${stage.name} : ${projectStatusMeta[stage.status].label}`,
    subtitle: project.category,
    description: stage.description?.trim() || "",
    title: project.name,
    createdOn: formatProjectDate(stage.createdAt),
    budget: formatProjectBudget(stage.budget, project.currency),
    plannedStartAt: formatProjectDateTime(stage.plannedStartAt),
    plannedDueAt: formatProjectDateTime(stage.plannedDueAt),
    status: mapStageStatusToVisual(stage.status),
  };
}

function mapProjectToFlow(project: ProjectWithCreator): ProjectFlowRecord {
  const creatorName = getCreatorName(project.createdBy);
  const stages = getProjectStages(project);
  const currentStage =
    stages.find((stage) => stage.name === project.currentStageName) ?? stages[0] ?? null;

  const collaboratorRecords = (project.collaborators ?? [])
    .map(mapProjectCollaboratorAssignmentToRecord)
    .filter((collaborator, index, current) =>
      current.findIndex((item) => item.id === collaborator.id) === index,
    );

  return {
    id: project.id,
    title: project.name,
    category: project.category,
    description: project.description,
    budget: formatProjectBudget(project.budget, project.currency),
    currency: project.currency,
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
    stageCards: stages.map((stage) => mapStageToCard(project, stage)),
    collaborators: [
      {
        id: project.createdById,
        name: creatorName,
        email: project.createdBy.email,
        role: "Project Owner",
        group: "internal",
        access: "owner",
      },
      ...collaboratorRecords,
    ],
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

function mapProjectToEditor(project: ProjectWithCreator): ProjectEditorRecord {
  const stages = getProjectStages(project);

  return {
    id: project.id,
    name: project.name,
    category: project.category,
    tag: project.tag?.trim() || "",
    description: project.description,
    budget: String(project.budget),
    currency: project.currency,
    status: project.status,
    startDate: formatProjectInputDate(project.startDate),
    endDate: formatProjectInputDate(project.endDate),
    stages: stages.map((stage, index) => ({
      id: stage.id,
      name: stage.name,
      budget:
        stage.budget && stage.budget > 0
          ? String(stage.budget)
          : index === 0
            ? String(project.budget)
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
  collaboratorIds: string[],
  addedById: string,
) {
  const normalizedIds = [...new Set(collaboratorIds.filter(Boolean))];

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
          },
        }),
      )
    : [];

  const validIds = validCollaborators.map((collaborator) => collaborator.id);

  await withPrismaRetry(() =>
    prisma.$transaction([
      prisma.projectCollaborator.deleteMany({
        where: {
          projectId,
          userId: {
            notIn: validIds,
          },
        },
      }),
      ...(validIds.length > 0
        ? [
            prisma.projectCollaborator.createMany({
              data: validIds.map((userId) => ({
                projectId,
                userId,
                addedById,
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

function buildProjectsWhere(filter: ProjectsListFilter) {
  const query = filter.query?.trim();

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
          ],
        }
      : {}),
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
      filter.sort ?? "newest",
    ],
    { revalidate: 20, tags: [PROJECTS_CACHE_TAG] },
  )();

  return projects.map(mapProjectToCard);
}

export async function getProjectById(id: string) {
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
    ["project-by-id", id],
    { revalidate: 20, tags: [PROJECTS_CACHE_TAG] },
  )();

  if (!project) {
    return null;
  }

  return mapProjectToFlow(project);
}

export async function getProjectEditorById(id: string) {
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
    ["project-editor-by-id", id],
    { revalidate: 20, tags: [PROJECTS_CACHE_TAG] },
  )();

  if (!project) {
    return null;
  }

  return mapProjectToEditor(project);
}
