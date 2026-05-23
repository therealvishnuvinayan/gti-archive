import { unstable_cache } from "next/cache";
import type {
  CurrencyCode,
  Project,
  ProjectStage,
  ProjectStatus,
  User,
} from "@prisma/client";

import { prisma, withPrismaRetry } from "@/lib/prisma";

export const PROJECTS_CACHE_TAG = "projects";

type ProjectWithCreator = Project & {
  createdBy: Pick<User, "name" | "email">;
  stages: ProjectStage[];
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
  }>;
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
  status: ProjectStageVisualStatus;
};

export type ProjectCollaboratorRecord = {
  id: string;
  name: string;
  role: string;
  group: "internal" | "external";
  access: "owner" | "view";
  removable?: boolean;
};

export type ProjectAttachmentRecord = {
  id: string;
  originalFileName: string;
  fileTypeLabel: string;
  mimeType: string;
  fileSizeLabel: string;
  uploadedBy: string;
  uploadedAt: string;
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
  compareLabel?: string;
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
    status: mapStageStatusToVisual(stage.status),
  };
}

function mapProjectToFlow(project: ProjectWithCreator): ProjectFlowRecord {
  const creatorName = getCreatorName(project.createdBy);
  const stages = getProjectStages(project);
  const currentStage =
    stages.find((stage) => stage.name === project.currentStageName) ?? stages[0] ?? null;

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
        role: "Project Owner",
        group: "internal",
        access: "owner",
      },
    ],
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
    })),
  };
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
