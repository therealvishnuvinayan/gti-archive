import {
  AttachmentStatus,
  ProjectCompletionStepStatus,
  ProjectExecutionType,
  ProjectRevisionStatus,
  StageStatus,
  SubmissionReviewStatus,
  type Prisma,
} from "@prisma/client";

import { getCollaborators, type CollaboratorRecord } from "@/lib/collaboration";
import { getFinalCompletionArchiveBlockers } from "@/lib/project-completion";
import {
  normalizeProjectCollaboratorPermissions,
  projectCollaboratorPermissionSelect,
} from "@/lib/project-collaborator-permissions";
import { DEFAULT_PROJECT_CURRENCY, resolveProjectCurrency } from "@/lib/project-currencies";
import { getActiveProjectMasterDataOptions } from "@/lib/project-master-data";
import {
  DEFAULT_PROJECT_PRIORITY,
  isProjectPriority,
  type ProjectPriorityValue,
} from "@/lib/project-priority";
import { prisma, withPrismaRetry } from "@/lib/prisma";
import { getDashboardProjectCounts, MAX_PROJECT_TAGS } from "@/lib/projects";
import {
  canUseArchives,
  getAccessibleProjectsWhere,
  getArchiveAccessLevel,
  hasPermission,
  hasProjectPermission,
  isProjectAdmin,
  isClientOfGtiUser,
  type PermissionUser,
} from "@/lib/permissions/resolver";
import {
  defaultProjectStatusGroupSlugs,
  getProjectStatusDisplay,
} from "@/lib/project-statuses";
import type {
  FluxAIDraftProject,
  FluxAIArchiveAssetResult,
  FluxAIIntentDetection,
  FluxAIPersonCandidate,
  FluxAIPersonMatch,
  FluxAIProjectResult,
  FluxAIProjectStatusSummary,
  FluxAIProjectStageResult,
  FluxAIStageDraft,
  FluxAIStatusSummary,
} from "@/lib/flux-ai/types";

export class FluxAIPermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FluxAIPermissionError";
  }
}

const MAX_PROJECTS_FOR_FLUX_AI = 100;
const DEFAULT_RESULT_LIMIT = 6;
const MAX_ARCHIVE_ASSETS_FOR_FLUX_AI = 100;

const archiveFileExtensions = [
  "pdf",
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
  "ai",
  "psd",
  "zip",
  "rar",
  "docx",
  "xlsx",
  "pptx",
] as const;

const fluxProjectSelect = {
  id: true,
  name: true,
  category: true,
  description: true,
  executionType: true,
  budgetRequired: true,
  budget: true,
  currency: true,
  currentStageName: true,
  stageCount: true,
  startDate: true,
  endDate: true,
  ownerId: true,
  completedAt: true,
  archivedAt: true,
  owner: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
  coOwners: {
    select: { userId: true },
  },
  tags: {
    select: {
      tag: {
        select: {
          name: true,
        },
      },
    },
  },
  status: {
    select: {
      id: true,
      name: true,
      slug: true,
      color: true,
      group: {
        select: {
          id: true,
          name: true,
          slug: true,
          color: true,
          isActive: true,
        },
      },
    },
  },
  stages: {
    where: {
      isTasker: false,
    },
    orderBy: {
      order: "asc",
    },
    select: {
      id: true,
      name: true,
      status: true,
      order: true,
      plannedDueAt: true,
      completedAt: true,
    },
  },
  executors: {
    select: {
      userId: true,
      user: {
        select: {
          name: true,
          email: true,
        },
      },
    },
  },
  collaborators: {
    select: {
      ...projectCollaboratorPermissionSelect,
      user: {
        select: {
          name: true,
          email: true,
        },
      },
    },
  },
  revisions: {
    where: {
      status: ProjectRevisionStatus.PENDING_REVIEW,
    },
    select: {
      id: true,
      title: true,
      stage: {
        select: {
          name: true,
        },
      },
    },
  },
  attachments: {
    where: {
      submissionReviewStatus: SubmissionReviewStatus.PENDING_REVIEW,
    },
    select: {
      id: true,
      stage: {
        select: {
          name: true,
        },
      },
    },
  },
  archive: {
    select: {
      id: true,
      archivedAt: true,
    },
  },
  completionWorkflow: {
    select: {
      approvalRequired: true,
      approvalStatus: true,
      copyrightRequired: true,
      copyrightStatus: true,
      invoiceRequired: true,
      invoiceStatus: true,
    },
  },
} satisfies Prisma.ProjectSelect;

type FluxProject = Prisma.ProjectGetPayload<{
  select: typeof fluxProjectSelect;
}>;

function normalizeText(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function normalizeSearchValue(value: string | null | undefined) {
  return normalizeText(value).toLowerCase();
}

function includesSearchValue(value: string | null | undefined, searchValue: string) {
  return normalizeSearchValue(value).includes(searchValue);
}

function containsInsensitive(value: string) {
  return {
    contains: value,
    mode: "insensitive" as const,
  };
}

function getDisplayName(user: { name?: string | null; email: string }) {
  return user.name?.trim() || user.email;
}

function formatFluxDate(date: Date | null | undefined) {
  if (!date) {
    return "Not set";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatFluxFileSize(size: number | null | undefined) {
  if (!size || size <= 0) {
    return "Unknown size";
  }

  const units = ["B", "KB", "MB", "GB"];
  let value = size;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const formattedValue = unitIndex === 0 ? String(size) : value.toFixed(value >= 10 ? 1 : 2);

  return `${formattedValue} ${units[unitIndex]}`;
}

function getFileExtensionFromName(fileName: string | null | undefined) {
  const normalizedFileName = normalizeText(fileName).toLowerCase();
  const match = normalizedFileName.match(/\.([a-z0-9]{1,8})$/i);

  return match?.[1] ?? "";
}

function getFileTypeLabel(fileName: string | null | undefined, mimeType: string | null | undefined) {
  const extension = getFileExtensionFromName(fileName);

  if (extension) {
    return extension.toUpperCase();
  }

  const normalizedMimeType = normalizeText(mimeType);

  return normalizedMimeType ? normalizedMimeType.split("/").pop()?.toUpperCase() ?? "File" : "File";
}

function formatStageStatus(status: StageStatus) {
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

function getExecutorName(project: FluxProject) {
  const mainExecutor = project.executors[0] ?? null;

  return mainExecutor ? getDisplayName(mainExecutor.user) : "Not assigned";
}

function getVisibleOwnerName(user: PermissionUser, project: FluxProject) {
  if (
    project.owner &&
    (canUseParticipantFilter(user, project) || project.ownerId === user.id)
  ) {
    return getDisplayName(project.owner);
  }

  return "Restricted";
}

function getVisibleExecutorName(user: PermissionUser, project: FluxProject) {
  if (canUseParticipantFilter(user, project)) {
    return getExecutorName(project);
  }

  const currentUserExecutor = project.executors.find(
    (executor) => executor.userId === user.id,
  );

  return currentUserExecutor ? getDisplayName(currentUserExecutor.user) : "Restricted";
}

function getCurrentStage(project: FluxProject) {
  return (
    project.stages.find((stage) => stage.name === project.currentStageName) ??
    project.stages.find((stage) => stage.status !== StageStatus.COMPLETED) ??
    project.stages[0] ??
    null
  );
}

function getCurrentStageLabel(project: FluxProject) {
  const currentStage = getCurrentStage(project);

  if (!currentStage) {
    return project.currentStageName?.trim() || "Stage 1";
  }

  return `${currentStage.name} : ${formatStageStatus(currentStage.status)}`;
}

function getTagNames(project: FluxProject) {
  return project.tags
    .map((assignment) => assignment.tag.name.trim())
    .filter(Boolean);
}

function canUseParticipantFilter(user: PermissionUser, project: FluxProject) {
  return hasProjectPermission(user, project, "project.viewParticipants");
}

function collaboratorMatchesSearch(
  user: PermissionUser,
  project: FluxProject,
  searchValue: string,
) {
  if (!searchValue || !canUseParticipantFilter(user, project)) {
    return false;
  }

  return project.collaborators.some((collaborator) =>
    includesSearchValue(getDisplayName(collaborator.user), searchValue),
  );
}

function normalizeStageStatus(value: string | null | undefined) {
  const normalizedValue = normalizeSearchValue(value).replace(/[_-]+/g, " ");

  if (!normalizedValue) {
    return null;
  }

  if (
    normalizedValue.includes("ongoing") ||
    normalizedValue.includes("in progress") ||
    normalizedValue === "active"
  ) {
    return StageStatus.ONGOING;
  }

  if (normalizedValue.includes("hold")) {
    return StageStatus.ON_HOLD;
  }

  if (normalizedValue.includes("pending") || normalizedValue.includes("waiting")) {
    return StageStatus.PENDING;
  }

  if (normalizedValue.includes("complete") || normalizedValue.includes("done")) {
    return StageStatus.COMPLETED;
  }

  return null;
}

function normalizeCompletionBlocker(value: string | null | undefined) {
  const normalizedValue = normalizeSearchValue(value);

  if (normalizedValue.includes("approval")) {
    return "approval" as const;
  }

  if (normalizedValue.includes("copyright")) {
    return "copyright" as const;
  }

  if (normalizedValue.includes("invoice") || normalizedValue.includes("payment")) {
    return "invoice" as const;
  }

  return null;
}

function isCompletionStepWaiting(
  required: boolean | null,
  status: ProjectCompletionStepStatus | null,
) {
  return (
    required === true &&
    (!status ||
      status === ProjectCompletionStepStatus.NOT_STARTED ||
      status === ProjectCompletionStepStatus.PENDING)
  );
}

function formatCompletionStepStatus(status: ProjectCompletionStepStatus | null | undefined) {
  switch (status) {
    case ProjectCompletionStepStatus.COMPLETED:
      return "Completed";
    case ProjectCompletionStepStatus.NOT_REQUIRED:
      return "Not Required";
    case ProjectCompletionStepStatus.PENDING:
      return "Pending";
    case ProjectCompletionStepStatus.NOT_STARTED:
      return "Not Started";
    default:
      return "Not Configured";
  }
}

function projectHasCompletionBlocker(
  project: FluxProject,
  blocker: "approval" | "copyright" | "invoice",
) {
  if (project.executionType === "INTERNAL") {
    return false;
  }

  const workflow = project.completionWorkflow;

  if (!workflow) {
    return false;
  }

  if (blocker === "approval") {
    return isCompletionStepWaiting(workflow.approvalRequired, workflow.approvalStatus);
  }

  if (blocker === "copyright") {
    return isCompletionStepWaiting(workflow.copyrightRequired, workflow.copyrightStatus);
  }

  return isCompletionStepWaiting(workflow.invoiceRequired, workflow.invoiceStatus);
}

function getCompletionBlockerMessages(
  project: FluxProject,
  blocker: "approval" | "copyright" | "invoice",
) {
  if (!projectHasCompletionBlocker(project, blocker)) {
    return [];
  }

  const workflow = project.completionWorkflow;

  if (!workflow) {
    return ["Final completion checklist must be configured before archive."];
  }

  if (blocker === "approval") {
    return workflow.approvalRequired === null
      ? ["Approval requirement must be confirmed."]
      : ["Approval is required and still pending."];
  }

  if (blocker === "copyright") {
    return workflow.copyrightRequired === null
      ? ["Copyright transfer requirement must be confirmed."]
      : ["Copyright transfer is required and still pending."];
  }

  return workflow.invoiceRequired === null
    ? ["Final invoice requirement must be confirmed."]
    : ["Final invoice is required and still pending."];
}

function getDeadlineWindow(deadlineState: string | null | undefined) {
  const normalizedValue = normalizeSearchValue(deadlineState);
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  const nextSevenDays = new Date(endOfToday);
  nextSevenDays.setDate(nextSevenDays.getDate() + 7);

  if (normalizedValue.includes("overdue") || normalizedValue.includes("past due")) {
    return { before: now, includeCompleted: false };
  }

  if (normalizedValue.includes("today")) {
    return { after: startOfToday, before: endOfToday, includeCompleted: true };
  }

  if (
    normalizedValue.includes("week") ||
    normalizedValue.includes("next 7") ||
    normalizedValue.includes("soon")
  ) {
    return { after: startOfToday, before: nextSevenDays, includeCompleted: true };
  }

  if (normalizedValue.includes("upcoming")) {
    return { after: now, includeCompleted: true };
  }

  return null;
}

function projectMatchesDeadlineState(project: FluxProject, deadlineState: string | null | undefined) {
  const window = getDeadlineWindow(deadlineState);

  if (!window) {
    return true;
  }

  if (!window.includeCompleted && isProjectCompletedOrArchived(project)) {
    return false;
  }

  if (!project.endDate) {
    return false;
  }

  if (window.after && project.endDate < window.after) {
    return false;
  }

  if (window.before && project.endDate > window.before) {
    return false;
  }

  return true;
}

function projectMatchesStatus(project: FluxProject, status: string) {
  if (!status) {
    return true;
  }

  const statusDisplay = getProjectStatusDisplay(project.status);
  const groupSlug = statusDisplay.group?.slug ?? "";
  const statusSlug = statusDisplay.slug ?? "";

  if (
    (status.includes("ongoing") ||
      status.includes("active") ||
      status.includes("progress")) &&
    groupSlug === defaultProjectStatusGroupSlugs.active
  ) {
    return true;
  }

  if (status.includes("pending") && groupSlug === defaultProjectStatusGroupSlugs.pending) {
    return true;
  }

  if (status.includes("hold") && groupSlug === defaultProjectStatusGroupSlugs.onHold) {
    return true;
  }

  if (
    status.includes("complete") &&
    (groupSlug === defaultProjectStatusGroupSlugs.completed || Boolean(project.completedAt))
  ) {
    return true;
  }

  if (
    status.includes("archive") &&
    (groupSlug === defaultProjectStatusGroupSlugs.archived ||
      Boolean(project.archivedAt || project.archive))
  ) {
    return true;
  }

  if (status.includes("cancel") && groupSlug === defaultProjectStatusGroupSlugs.cancelled) {
    return true;
  }

  return (
    includesSearchValue(statusDisplay.name, status) ||
    includesSearchValue(statusDisplay.group?.name, status) ||
    includesSearchValue(statusSlug, status) ||
    includesSearchValue(groupSlug, status)
  );
}

function canShowBudget(user: PermissionUser, project: FluxProject) {
  return (
    hasProjectPermission(user, project, "project.viewBudget") ||
    hasProjectPermission(user, project, "project.updateBudget")
  );
}

function formatBudgetLabel(user: PermissionUser, project: FluxProject) {
  if (!canShowBudget(user, project)) {
    return null;
  }

  if (project.budget && project.budget > 0) {
    return `${project.budget.toLocaleString("en-US")} ${project.currency}`;
  }

  return project.budgetRequired ? "Required, not set" : "Not required";
}

function mapOverdueStage(stage: FluxProject["stages"][number]): FluxAIProjectStageResult {
  return {
    id: stage.id,
    name: stage.name,
    status: formatStageStatus(stage.status),
    dueDate: stage.plannedDueAt ? formatFluxDate(stage.plannedDueAt) : null,
  };
}

function mapProjectForFluxAI(
  user: PermissionUser,
  project: FluxProject,
  options: {
    overdueStages?: FluxAIProjectStageResult[];
    archiveBlockers?: string[];
    readyForArchive?: boolean;
  } = {},
): FluxAIProjectResult {
  const statusDisplay = getProjectStatusDisplay(project.status);

  return {
    id: project.id,
    slug: project.id,
    name: project.name,
    href: `/projects/${project.id}`,
    category: project.category ?? "Uncategorized",
    status: statusDisplay.name,
    statusGroup: statusDisplay.group?.name ?? null,
    currentStage: getCurrentStageLabel(project),
    owner: getVisibleOwnerName(user, project),
    executor: getVisibleExecutorName(user, project),
    deadline: formatFluxDate(project.endDate),
    budgetLabel: formatBudgetLabel(user, project),
    blockersSummary: options.archiveBlockers?.length
      ? options.archiveBlockers.slice(0, 2).join(" ")
      : null,
    ...options,
  };
}

const fluxArchiveProjectFileSelect = {
  id: true,
  finalArchiveFileName: true,
  originalFileName: true,
  mimeType: true,
  fileSize: true,
  archivedAt: true,
  archive: {
    select: {
      status: true,
      projectName: true,
      projectCategory: true,
      projectTag: true,
      archiveCategory: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  },
  artworkMetadata: {
    select: {
      artworkId: true,
      titleWorkingName: true,
      languageMarket: true,
      artworkType: true,
      brandSubBrand: true,
      productSku: true,
      campaignProject: true,
      archiveStatus: true,
      changeLog: true,
      generalNotes: true,
    },
  },
} satisfies Prisma.ArchivedProjectFileSelect;

const fluxManualArchiveFileSelect = {
  id: true,
  fileName: true,
  originalFileName: true,
  projectName: true,
  projectCreatedBy: true,
  mimeType: true,
  fileSize: true,
  status: true,
  uploadedAt: true,
  archiveCategory: {
    select: {
      id: true,
      name: true,
    },
  },
  artworkMetadata: {
    select: {
      artworkId: true,
      titleWorkingName: true,
      languageMarket: true,
      artworkType: true,
      brandSubBrand: true,
      productSku: true,
      campaignProject: true,
      archiveStatus: true,
      changeLog: true,
      generalNotes: true,
    },
  },
} satisfies Prisma.ManualArchiveFileSelect;

type FluxArchiveProjectFile = Prisma.ArchivedProjectFileGetPayload<{
  select: typeof fluxArchiveProjectFileSelect;
}>;

type FluxManualArchiveFile = Prisma.ManualArchiveFileGetPayload<{
  select: typeof fluxManualArchiveFileSelect;
}>;

type ArchiveDateWindow = {
  gte: Date;
  lte: Date;
};

function getFluxAIAccessibleArchiveCategoryWhere(user: PermissionUser) {
  if (!canUseArchives(user)) {
    return {
      id: "__no_archive_access__",
    } satisfies Prisma.ArchiveCategoryWhereInput;
  }

  if (hasPermission(user, "settings.manageMasterData")) {
    return {
      isActive: true,
    } satisfies Prisma.ArchiveCategoryWhereInput;
  }

  return {
    isActive: true,
    OR: [
      {
        allowedUsers: {
          none: {},
        },
      },
      {
        allowedUsers: {
          some: {
            userId: user.id,
          },
        },
      },
    ],
  } satisfies Prisma.ArchiveCategoryWhereInput;
}

function extractArchiveFilenameTerms(message: string) {
  const terms = new Set<string>();
  const extensionPattern = archiveFileExtensions.join("|");
  const fileNamePattern = new RegExp(
    `[^\\s"'<>]+\\.(${extensionPattern})\\b`,
    "gi",
  );

  for (const match of message.matchAll(fileNamePattern)) {
    const fileName = normalizeText(match[0]).replace(/[),.;:!?]+$/g, "");

    if (fileName) {
      terms.add(fileName);
      terms.add(fileName.replace(/\.[^.]+$/, ""));
    }
  }

  return [...terms].filter((term) => term.length >= 2);
}

function extractArchiveFileExtensions(message: string) {
  const normalizedMessage = normalizePromptTokenText(message);
  const extensions = new Set<string>();

  for (const extension of archiveFileExtensions) {
    if (
      new RegExp(`\\b${extension}\\b`, "i").test(normalizedMessage) ||
      new RegExp(`\\.${extension}\\b`, "i").test(normalizedMessage)
    ) {
      extensions.add(extension);
    }
  }

  return [...extensions];
}

function normalizePromptTokenText(value: string | null | undefined) {
  return normalizeText(value).toLowerCase().replace(/[_-]+/g, " ");
}

function cleanArchiveSearchQuery(value: string | null | undefined) {
  let query = normalizeText(value);

  if (!query) {
    return "";
  }

  query = query
    .replace(/^(?:can\s+you\s+)?(?:please\s+)?/i, "")
    .replace(
      /^(?:find|show|list|view|search|display|give)\s+(?:me\s+)?(?:an?\s+|the\s+)?/i,
      "",
    )
    .replace(/\b(?:pdf|png|jpg|jpeg|webp|gif|ai|psd|zip|rar|docx|xlsx|pptx)\s+files?\b/gi, " ")
    .replace(/\b(?:archive|archived|assets?|files?|artworks?|artwork\s+id|artwork|ids?)\b/gi, " ")
    .replace(/\b(?:in|from|for|by|with|to|category|categories|brand|type)\b/gi, " ")
    .replace(/\b(?:pdf|png|jpg|jpeg|webp|gif|ai|psd|zip|rar|docx|xlsx|pptx)\b/gi, " ")
    .replace(/\b(?:uploaded|created|today|yesterday|recent|latest)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  return query.length >= 2 ? query : "";
}

function getArchiveDateWindow(message: string | null | undefined): ArchiveDateWindow | null {
  const normalizedMessage = normalizePromptTokenText(message);
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  if (/\byesterday\b/.test(normalizedMessage)) {
    start.setDate(start.getDate() - 1);
    end.setDate(end.getDate() - 1);
    return { gte: start, lte: end };
  }

  if (/\btoday\b/.test(normalizedMessage)) {
    return { gte: start, lte: end };
  }

  return null;
}

function uniqueSearchTerms(...values: Array<string | null | undefined>) {
  const terms = new Set<string>();

  for (const value of values) {
    const normalizedValue = normalizeText(value);

    if (normalizedValue.length >= 2) {
      terms.add(normalizedValue);
    }
  }

  return [...terms];
}

function buildArchivedProjectFileTextWhere(term: string): Prisma.ArchivedProjectFileWhereInput {
  const containsTerm = containsInsensitive(term);

  return {
    OR: [
      { finalArchiveFileName: containsTerm },
      { originalFileName: containsTerm },
      { mimeType: containsTerm },
      {
        archive: {
          is: {
            projectName: containsTerm,
          },
        },
      },
      {
        archive: {
          is: {
            projectCategory: containsTerm,
          },
        },
      },
      {
        archive: {
          is: {
            projectTag: containsTerm,
          },
        },
      },
      {
        archive: {
          is: {
            archiveCategory: {
              is: {
                name: containsTerm,
              },
            },
          },
        },
      },
      {
        archivedBy: {
          is: {
            name: containsTerm,
          },
        },
      },
      {
        artworkMetadata: {
          is: {
            artworkId: containsTerm,
          },
        },
      },
      {
        artworkMetadata: {
          is: {
            titleWorkingName: containsTerm,
          },
        },
      },
      {
        artworkMetadata: {
          is: {
            brandSubBrand: containsTerm,
          },
        },
      },
      {
        artworkMetadata: {
          is: {
            productSku: containsTerm,
          },
        },
      },
      {
        artworkMetadata: {
          is: {
            campaignProject: containsTerm,
          },
        },
      },
      {
        artworkMetadata: {
          is: {
            languageMarket: containsTerm,
          },
        },
      },
      {
        artworkMetadata: {
          is: {
            artworkType: containsTerm,
          },
        },
      },
      {
        artworkMetadata: {
          is: {
            archiveStatus: containsTerm,
          },
        },
      },
      {
        artworkMetadata: {
          is: {
            changeLog: containsTerm,
          },
        },
      },
      {
        artworkMetadata: {
          is: {
            generalNotes: containsTerm,
          },
        },
      },
    ],
  };
}

function buildArchivedProjectFileAnyTextWhere(
  terms: string[],
): Prisma.ArchivedProjectFileWhereInput | null {
  if (terms.length === 0) {
    return null;
  }

  return {
    OR: terms.flatMap((term) => buildArchivedProjectFileTextWhere(term).OR ?? []),
  };
}

function buildManualArchiveFileTextWhere(term: string): Prisma.ManualArchiveFileWhereInput {
  const containsTerm = containsInsensitive(term);

  return {
    OR: [
      { fileName: containsTerm },
      { originalFileName: containsTerm },
      { projectName: containsTerm },
      { projectCreatedBy: containsTerm },
      { mimeType: containsTerm },
      {
        archiveCategory: {
          is: {
            name: containsTerm,
          },
        },
      },
      {
        uploadedBy: {
          is: {
            name: containsTerm,
          },
        },
      },
      {
        artworkMetadata: {
          is: {
            artworkId: containsTerm,
          },
        },
      },
      {
        artworkMetadata: {
          is: {
            titleWorkingName: containsTerm,
          },
        },
      },
      {
        artworkMetadata: {
          is: {
            brandSubBrand: containsTerm,
          },
        },
      },
      {
        artworkMetadata: {
          is: {
            productSku: containsTerm,
          },
        },
      },
      {
        artworkMetadata: {
          is: {
            campaignProject: containsTerm,
          },
        },
      },
      {
        artworkMetadata: {
          is: {
            languageMarket: containsTerm,
          },
        },
      },
      {
        artworkMetadata: {
          is: {
            artworkType: containsTerm,
          },
        },
      },
      {
        artworkMetadata: {
          is: {
            archiveStatus: containsTerm,
          },
        },
      },
      {
        artworkMetadata: {
          is: {
            changeLog: containsTerm,
          },
        },
      },
      {
        artworkMetadata: {
          is: {
            generalNotes: containsTerm,
          },
        },
      },
    ],
  };
}

function buildManualArchiveFileAnyTextWhere(
  terms: string[],
): Prisma.ManualArchiveFileWhereInput | null {
  if (terms.length === 0) {
    return null;
  }

  return {
    OR: terms.flatMap((term) => buildManualArchiveFileTextWhere(term).OR ?? []),
  };
}

function buildArchivedProjectFileExtensionWhere(
  extensions: string[],
): Prisma.ArchivedProjectFileWhereInput | null {
  if (extensions.length === 0) {
    return null;
  }

  return {
    OR: extensions.flatMap((extension) => [
      {
        finalArchiveFileName: {
          endsWith: `.${extension}`,
          mode: "insensitive" as const,
        },
      },
      {
        originalFileName: {
          endsWith: `.${extension}`,
          mode: "insensitive" as const,
        },
      },
      {
        mimeType: containsInsensitive(extension),
      },
    ]),
  };
}

function buildManualArchiveFileExtensionWhere(
  extensions: string[],
): Prisma.ManualArchiveFileWhereInput | null {
  if (extensions.length === 0) {
    return null;
  }

  return {
    OR: extensions.flatMap((extension) => [
      {
        fileName: {
          endsWith: `.${extension}`,
          mode: "insensitive" as const,
        },
      },
      {
        originalFileName: {
          endsWith: `.${extension}`,
          mode: "insensitive" as const,
        },
      },
      {
        mimeType: containsInsensitive(extension),
      },
    ]),
  };
}

function buildArchivedProjectFileAccessWhere(
  user: PermissionUser,
): Prisma.ArchivedProjectFileWhereInput {
  if (getArchiveAccessLevel(user) === "PARTIAL") {
    return {
      userArchiveAccesses: {
        some: {
          userId: user.id,
        },
      },
    };
  }

  return {
    project: {
      is: getAccessibleProjectsWhere(user),
    },
  };
}

function buildManualArchiveFileAccessWhere(user: PermissionUser): Prisma.ManualArchiveFileWhereInput {
  if (getArchiveAccessLevel(user) === "PARTIAL") {
    return {
      userArchiveAccesses: {
        some: {
          userId: user.id,
        },
      },
    };
  }

  return {};
}

function mapProjectArchiveFileForFluxAI(
  file: FluxArchiveProjectFile,
  options: { canDownload: boolean },
): FluxAIArchiveAssetResult {
  const title =
    file.artworkMetadata?.titleWorkingName?.trim() ||
    file.finalArchiveFileName ||
    file.originalFileName;

  return {
    id: file.id,
    recordType: "FINAL_ARCHIVE_FILE",
    title,
    fileName: file.finalArchiveFileName,
    originalFileName: file.originalFileName,
    artworkId: file.artworkMetadata?.artworkId?.trim() || null,
    archiveCategory: file.archive.archiveCategory?.name ?? "Uncategorized",
    brandSubBrand: file.artworkMetadata?.brandSubBrand?.trim() || null,
    fileType: getFileTypeLabel(file.finalArchiveFileName, file.mimeType),
    mimeType: file.mimeType,
    fileSize: formatFluxFileSize(file.fileSize),
    linkedProject:
      file.artworkMetadata?.campaignProject?.trim() ||
      file.archive.projectName?.trim() ||
      null,
    archivedAt: formatFluxDate(file.archivedAt),
    status: file.artworkMetadata?.archiveStatus?.trim() || file.archive.status,
    viewHref: `/api/archives/files/${file.id}/preview`,
    downloadHref: options.canDownload
      ? `/api/archives/files/${file.id}/download`
      : null,
  };
}

function mapManualArchiveFileForFluxAI(
  file: FluxManualArchiveFile,
  options: { canDownload: boolean },
): FluxAIArchiveAssetResult {
  const title =
    file.artworkMetadata?.titleWorkingName?.trim() ||
    file.fileName ||
    file.originalFileName;

  return {
    id: file.id,
    recordType: "MANUAL_ARCHIVE_FILE",
    title,
    fileName: file.fileName,
    originalFileName: file.originalFileName,
    artworkId: file.artworkMetadata?.artworkId?.trim() || null,
    archiveCategory: file.archiveCategory?.name ?? "Uncategorized",
    brandSubBrand: file.artworkMetadata?.brandSubBrand?.trim() || null,
    fileType: getFileTypeLabel(file.fileName, file.mimeType),
    mimeType: file.mimeType,
    fileSize: formatFluxFileSize(file.fileSize),
    linkedProject:
      file.artworkMetadata?.campaignProject?.trim() ||
      file.projectName?.trim() ||
      null,
    archivedAt: formatFluxDate(file.uploadedAt),
    status: file.artworkMetadata?.archiveStatus?.trim() || "Archived",
    viewHref: `/api/archives/files/${file.id}/preview`,
    downloadHref: options.canDownload
      ? `/api/archives/files/${file.id}/download`
      : null,
  };
}

function buildArchiveAssetSearchText(asset: FluxAIArchiveAssetResult) {
  return [
    asset.title,
    asset.fileName,
    asset.originalFileName,
    asset.artworkId,
    asset.archiveCategory,
    asset.brandSubBrand,
    asset.fileType,
    asset.linkedProject,
    asset.status,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function scoreArchiveAssetResult(input: {
  asset: FluxAIArchiveAssetResult;
  searchTerms: string[];
  filenameTerms: string[];
  extensions: string[];
}) {
  const finalName = input.asset.fileName.toLowerCase();
  const originalName = input.asset.originalFileName.toLowerCase();
  const searchableText = buildArchiveAssetSearchText(input.asset);
  let score = 0;

  for (const filenameTerm of input.filenameTerms.map((term) => term.toLowerCase())) {
    if (finalName === filenameTerm || originalName === filenameTerm) {
      score += 140;
    } else if (finalName.includes(filenameTerm) || originalName.includes(filenameTerm)) {
      score += 90;
    }
  }

  for (const extension of input.extensions) {
    if (
      finalName.endsWith(`.${extension}`) ||
      originalName.endsWith(`.${extension}`) ||
      input.asset.fileType.toLowerCase() === extension
    ) {
      score += 30;
    }
  }

  for (const term of input.searchTerms.map((value) => value.toLowerCase())) {
    if (searchableText.includes(term)) {
      score += 20;
    }
  }

  return score;
}

export async function searchArchiveAssetsForFluxAI(
  user: PermissionUser,
  input: {
    query?: string | null;
    rawMessage?: string | null;
    category?: string | null;
    tag?: string | null;
    limit?: number | null;
  },
) {
  if (!canUseArchives(user) || isClientOfGtiUser(user)) {
    return [];
  }

  const rawMessage = input.rawMessage ?? input.query ?? "";
  const filenameTerms = extractArchiveFilenameTerms(rawMessage || input.query || "");
  const extensions = extractArchiveFileExtensions(`${rawMessage} ${input.query ?? ""}`);
  const cleanedQuery =
    filenameTerms.length > 0
      ? ""
      : cleanArchiveSearchQuery(input.query) || cleanArchiveSearchQuery(rawMessage);
  const searchTerms = uniqueSearchTerms(
    cleanedQuery,
    input.category,
    input.tag,
  );
  const dateWindow = getArchiveDateWindow(rawMessage);
  const resultLimit = resolveLimit(input.limit);

  const accessibleCategoryIds = await withPrismaRetry(() =>
    prisma.archiveCategory.findMany({
      where: getFluxAIAccessibleArchiveCategoryWhere(user),
      select: {
        id: true,
      },
    }),
  );
  const archiveCategoryIds = accessibleCategoryIds.map((category) => category.id);

  if (archiveCategoryIds.length === 0) {
    return [];
  }

  const projectFileWhereParts: Prisma.ArchivedProjectFileWhereInput[] = [
    {
      archive: {
        is: {
          archiveCategoryId: {
            in: archiveCategoryIds,
          },
        },
      },
    },
    buildArchivedProjectFileAccessWhere(user),
    ...searchTerms.map(buildArchivedProjectFileTextWhere),
  ];
  const projectFileNameWhere = buildArchivedProjectFileAnyTextWhere(filenameTerms);
  const projectFileExtensionWhere = buildArchivedProjectFileExtensionWhere(extensions);

  if (projectFileNameWhere) {
    projectFileWhereParts.push(projectFileNameWhere);
  }

  if (projectFileExtensionWhere) {
    projectFileWhereParts.push(projectFileExtensionWhere);
  }

  if (dateWindow) {
    projectFileWhereParts.push({
      archivedAt: dateWindow,
    });
  }

  const manualFileWhereParts: Prisma.ManualArchiveFileWhereInput[] = [
    {
      status: AttachmentStatus.READY,
      archiveCategoryId: {
        in: archiveCategoryIds,
      },
    },
    buildManualArchiveFileAccessWhere(user),
    ...searchTerms.map(buildManualArchiveFileTextWhere),
  ];
  const manualFileNameWhere = buildManualArchiveFileAnyTextWhere(filenameTerms);
  const manualFileExtensionWhere = buildManualArchiveFileExtensionWhere(extensions);

  if (manualFileNameWhere) {
    manualFileWhereParts.push(manualFileNameWhere);
  }

  if (manualFileExtensionWhere) {
    manualFileWhereParts.push(manualFileExtensionWhere);
  }

  if (dateWindow) {
    manualFileWhereParts.push({
      uploadedAt: dateWindow,
    });
  }

  const [projectFiles, manualFiles] = await withPrismaRetry(() =>
    Promise.all([
      prisma.archivedProjectFile.findMany({
        where: {
          AND: projectFileWhereParts,
        },
        orderBy: [
          {
            archivedAt: "desc",
          },
          {
            finalArchiveFileName: "asc",
          },
        ],
        take: MAX_ARCHIVE_ASSETS_FOR_FLUX_AI,
        select: fluxArchiveProjectFileSelect,
      }),
      prisma.manualArchiveFile.findMany({
        where: {
          AND: manualFileWhereParts,
        },
        orderBy: [
          {
            uploadedAt: "desc",
          },
          {
            fileName: "asc",
          },
        ],
        take: MAX_ARCHIVE_ASSETS_FOR_FLUX_AI,
        select: fluxManualArchiveFileSelect,
      }),
    ]),
  );

  const canDownloadArchiveAssets = hasPermission(user, "archive.download");
  const results = [
    ...projectFiles.map((file) =>
      mapProjectArchiveFileForFluxAI(file, { canDownload: canDownloadArchiveAssets }),
    ),
    ...manualFiles.map((file) =>
      mapManualArchiveFileForFluxAI(file, { canDownload: canDownloadArchiveAssets }),
    ),
  ];

  return results
    .map((asset) => ({
      asset,
      score: scoreArchiveAssetResult({
        asset,
        searchTerms,
        filenameTerms,
        extensions,
      }),
    }))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return left.asset.fileName.localeCompare(right.asset.fileName);
    })
    .slice(0, resultLimit)
    .map((entry) => entry.asset);
}

function projectMatchesSearch(user: PermissionUser, project: FluxProject, searchValue: string) {
  if (!searchValue) {
    return true;
  }

  const statusDisplay = getProjectStatusDisplay(project.status);
  const canSearchParticipants = canUseParticipantFilter(user, project);

  return (
    includesSearchValue(project.name, searchValue) ||
    includesSearchValue(project.category, searchValue) ||
    includesSearchValue(project.description, searchValue) ||
    includesSearchValue(project.currentStageName, searchValue) ||
    includesSearchValue(statusDisplay.name, searchValue) ||
    includesSearchValue(statusDisplay.group?.name, searchValue) ||
    (canSearchParticipants &&
      project.owner &&
      includesSearchValue(getDisplayName(project.owner), searchValue)) ||
    getTagNames(project).some((tagName) => includesSearchValue(tagName, searchValue)) ||
    (canSearchParticipants &&
      project.executors.some((executor) =>
        includesSearchValue(getDisplayName(executor.user), searchValue),
      )) ||
    collaboratorMatchesSearch(user, project, searchValue) ||
    project.stages.some((stage) => includesSearchValue(stage.name, searchValue))
  );
}

function normalizePromptForInference(value: string | null | undefined) {
  return normalizeSearchValue(value)
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanExtractedSearchValue(value: string | null | undefined) {
  const cleanedValue = normalizePromptForInference(value)
    .replace(/^[\s"'`“”‘’]+|[\s"'`“”‘’.?!]+$/g, "")
    .replace(/^(?:the|a|an)\s+/i, "")
    .replace(/\b(?:projects?|stages?)$/i, "")
    .replace(/\s+/g, " ")
    .trim();

  return /^(?:all|my|the|project|projects|stage|stages|please)$/.test(cleanedValue)
    ? ""
    : cleanedValue;
}

function isAllProjectsPrompt(rawQuery: string | null | undefined) {
  const prompt = normalizePromptForInference(rawQuery);

  if (!prompt) {
    return false;
  }

  return (
    /^(?:find|show|list|view|display|search)\s+(?:me\s+)?(?:all\s+|my\s+|the\s+|accessible\s+)?projects?$/.test(
      prompt,
    ) ||
    /^(?:all|my|accessible)\s+projects?$/.test(prompt) ||
    /^projects?$/.test(prompt)
  );
}

function isBroadProjectSearchPrompt(rawQuery: string | null | undefined) {
  return /\b(?:find|show|list|view|display|search)\b.*\bprojects?\b/.test(
    normalizePromptForInference(rawQuery),
  );
}

function inferProjectNameFromPrompt(rawQuery: string | null | undefined) {
  const prompt = normalizePromptForInference(rawQuery);

  return cleanExtractedSearchValue(
    prompt.match(/\bprojects?\s+(?:named|called)\s+(.+)$/)?.[1] ??
      prompt.match(/\bby\s+name\s+(.+)$/)?.[1] ??
      prompt.match(/\bname\s+(?:is\s+)?(.+)$/)?.[1] ??
      null,
  );
}

function inferOwnerNameFromPrompt(rawQuery: string | null | undefined) {
  const prompt = normalizePromptForInference(rawQuery);

  return cleanExtractedSearchValue(
    prompt.match(/\bowned\s+by\s+(.+)$/)?.[1] ??
      prompt.match(/\bowner\s+(?:is\s+|:|=)?\s*(.+)$/)?.[1] ??
      null,
  );
}

function inferExecutorNameFromPrompt(rawQuery: string | null | undefined) {
  const prompt = normalizePromptForInference(rawQuery);

  return cleanExtractedSearchValue(
    prompt.match(/\b(?:main\s+)?executor\s+(?:is\s+|:|=)?\s*(.+)$/)?.[1] ??
      prompt.match(/\bexecuted\s+by\s+(.+)$/)?.[1] ??
      null,
  );
}

function inferCollaboratorNameFromPrompt(rawQuery: string | null | undefined) {
  const prompt = normalizePromptForInference(rawQuery);

  return cleanExtractedSearchValue(
    prompt.match(/\bcollaborator\s+(?:is\s+|:|=)?\s*(.+)$/)?.[1] ??
      prompt.match(/\bwith\s+collaborator\s+(.+)$/)?.[1] ??
      prompt.match(/\bcollaborating\s+with\s+(.+)$/)?.[1] ??
      prompt.match(/\bwhere\s+(.+?)\s+is\s+(?:a\s+)?collaborator\b/)?.[1] ??
      null,
  );
}

function inferAssigneeNameFromPrompt(rawQuery: string | null | undefined) {
  const prompt = normalizePromptForInference(rawQuery);

  return cleanExtractedSearchValue(
    prompt.match(/\bassigned\s+to\s+(.+)$/)?.[1] ??
      prompt.match(/\bassignee\s+(?:is\s+|:|=)?\s*(.+)$/)?.[1] ??
      null,
  );
}

function inferCategoryNameFromPrompt(rawQuery: string | null | undefined) {
  const prompt = normalizePromptForInference(rawQuery);

  return cleanExtractedSearchValue(
    prompt.match(/\bcategory\s+(?:is\s+|:|=)?\s*(.+)$/)?.[1] ??
      prompt.match(/\bcategor(?:y|ies)\s+(.+)$/)?.[1] ??
      null,
  );
}

function inferTagNameFromPrompt(rawQuery: string | null | undefined) {
  const prompt = normalizePromptForInference(rawQuery);

  return cleanExtractedSearchValue(
    prompt.match(/\btagged\s+(.+)$/)?.[1] ??
      prompt.match(/\bwith\s+tag\s+(.+)$/)?.[1] ??
      prompt.match(/\btags?\s+(?:is\s+|:|=)?\s*(.+)$/)?.[1] ??
      null,
  );
}

function inferProjectStatusFromPrompt(rawQuery: string | null | undefined) {
  const prompt = normalizePromptForInference(rawQuery);

  if (/\b(?:active|ongoing|in progress)\s+projects?\b/.test(prompt)) {
    return "active";
  }

  if (/\bcompleted\s+projects?\b/.test(prompt)) {
    return "completed";
  }

  if (/\bpending\s+projects?\b/.test(prompt)) {
    return "pending";
  }

  if (/\bon\s+hold\s+projects?\b/.test(prompt)) {
    return "on hold";
  }

  return "";
}

function inferCompletionBlockerFromPrompt(rawQuery: string | null | undefined) {
  const prompt = normalizePromptForInference(rawQuery);

  if (
    /\b(?:waiting|pending|blocked|needs?|requiring|required)\b.*\bapproval\b/.test(
      prompt,
    ) ||
    /\bapproval\b.*\b(?:waiting|pending|needed|required)\b/.test(prompt)
  ) {
    return "approval";
  }

  if (
    /\b(?:waiting|pending|blocked|needs?|requiring|required)\b.*\bcopyright\b/.test(
      prompt,
    ) ||
    /\bcopyright\b.*\b(?:waiting|pending|needed|required)\b/.test(prompt)
  ) {
    return "copyright";
  }

  if (
    /\b(?:waiting|pending|blocked|needs?|requiring|required)\b.*\b(?:invoice|payment)\b/.test(
      prompt,
    ) ||
    /\b(?:invoice|payment)\b.*\b(?:waiting|pending|needed|required)\b/.test(prompt)
  ) {
    return "invoice";
  }

  return "";
}

function buildFluxAIUserNameWhere(searchValue: string) {
  return {
    OR: [
      {
        name: containsInsensitive(searchValue),
      },
      {
        email: containsInsensitive(searchValue),
      },
    ],
  } satisfies Prisma.UserWhereInput;
}

function buildFluxAIParticipantVisibilityScopeWhere(user: PermissionUser) {
  if (isProjectAdmin(user)) {
    return null;
  }

  return {
    OR: [
      {
        ownerId: user.id,
      },
      {
        coOwners: { some: { userId: user.id } },
      },
      {
        collaborators: {
          some: {
            userId: user.id,
            canViewVendorInfo: true,
          },
        },
      },
    ],
  } satisfies Prisma.ProjectWhereInput;
}

function scopeParticipantSearchForFluxAI(
  user: PermissionUser,
  where: Prisma.ProjectWhereInput,
) {
  const scopeWhere = buildFluxAIParticipantVisibilityScopeWhere(user);

  if (!scopeWhere) {
    return where;
  }

  return {
    AND: [
      scopeWhere,
      where,
    ],
  } satisfies Prisma.ProjectWhereInput;
}

function buildFluxAIOwnerSearchWhere(searchValue: string) {
  return {
    owner: {
      is: buildFluxAIUserNameWhere(searchValue),
    },
  } satisfies Prisma.ProjectWhereInput;
}

function buildFluxAIExecutorSearchWhere(searchValue: string) {
  return {
    executors: {
      some: {
        user: {
          is: buildFluxAIUserNameWhere(searchValue),
        },
      },
    },
  } satisfies Prisma.ProjectWhereInput;
}

function buildFluxAICollaboratorSearchWhere(searchValue: string) {
  return {
    collaborators: {
      some: {
        user: {
          is: buildFluxAIUserNameWhere(searchValue),
        },
      },
    },
  } satisfies Prisma.ProjectWhereInput;
}

function buildFluxAIParticipantSearchWhere(
  user: PermissionUser,
  searchValue: string,
  fields: Array<"owner" | "executor" | "collaborator"> = [
    "owner",
    "executor",
    "collaborator",
  ],
) {
  const clauses = fields.map((field) => {
    if (field === "owner") {
      return buildFluxAIOwnerSearchWhere(searchValue);
    }

    if (field === "executor") {
      return buildFluxAIExecutorSearchWhere(searchValue);
    }

    return buildFluxAICollaboratorSearchWhere(searchValue);
  });

  return scopeParticipantSearchForFluxAI(user, {
    OR: clauses,
  });
}

function buildFluxAISafeTextSearchWhere(user: PermissionUser, searchValue: string) {
  const participantWhere = buildFluxAIParticipantSearchWhere(user, searchValue);

  return {
    OR: [
      {
        name: containsInsensitive(searchValue),
      },
      {
        category: containsInsensitive(searchValue),
      },
      {
        description: containsInsensitive(searchValue),
      },
      {
        currentStageName: containsInsensitive(searchValue),
      },
      {
        status: {
          is: {
            OR: [
              {
                name: containsInsensitive(searchValue),
              },
              {
                slug: containsInsensitive(searchValue),
              },
              {
                group: {
                  is: {
                    OR: [
                      {
                        name: containsInsensitive(searchValue),
                      },
                      {
                        slug: containsInsensitive(searchValue),
                      },
                    ],
                  },
                },
              },
            ],
          },
        },
      },
      {
        tags: {
          some: {
            tag: {
              is: {
                name: containsInsensitive(searchValue),
              },
            },
          },
        },
      },
      {
        stages: {
          some: {
            isTasker: false,
            name: containsInsensitive(searchValue),
          },
        },
      },
      participantWhere,
    ],
  } satisfies Prisma.ProjectWhereInput;
}

function buildFluxAIStatusSearchWhere(status: string) {
  if (!status) {
    return null;
  }

  if (
    status.includes("ongoing") ||
    status.includes("active") ||
    status.includes("progress")
  ) {
    return {
      status: {
        is: {
          group: {
            is: {
              slug: defaultProjectStatusGroupSlugs.active,
            },
          },
        },
      },
    } satisfies Prisma.ProjectWhereInput;
  }

  if (status.includes("pending")) {
    return {
      status: {
        is: {
          group: {
            is: {
              slug: defaultProjectStatusGroupSlugs.pending,
            },
          },
        },
      },
    } satisfies Prisma.ProjectWhereInput;
  }

  if (status.includes("hold")) {
    return {
      status: {
        is: {
          group: {
            is: {
              slug: defaultProjectStatusGroupSlugs.onHold,
            },
          },
        },
      },
    } satisfies Prisma.ProjectWhereInput;
  }

  if (status.includes("complete")) {
    return {
      OR: [
        {
          completedAt: {
            not: null,
          },
        },
        {
          status: {
            is: {
              group: {
                is: {
                  slug: defaultProjectStatusGroupSlugs.completed,
                },
              },
            },
          },
        },
      ],
    } satisfies Prisma.ProjectWhereInput;
  }

  if (status.includes("archive")) {
    return {
      OR: [
        {
          archivedAt: {
            not: null,
          },
        },
        {
          archive: {
            isNot: null,
          },
        },
        {
          status: {
            is: {
              group: {
                is: {
                  slug: defaultProjectStatusGroupSlugs.archived,
                },
              },
            },
          },
        },
      ],
    } satisfies Prisma.ProjectWhereInput;
  }

  if (status.includes("cancel")) {
    return {
      status: {
        is: {
          group: {
            is: {
              slug: defaultProjectStatusGroupSlugs.cancelled,
            },
          },
        },
      },
    } satisfies Prisma.ProjectWhereInput;
  }

  return {
    status: {
      is: {
        OR: [
          {
            name: containsInsensitive(status),
          },
          {
            slug: containsInsensitive(status),
          },
          {
            group: {
              is: {
                OR: [
                  {
                    name: containsInsensitive(status),
                  },
                  {
                    slug: containsInsensitive(status),
                  },
                ],
              },
            },
          },
        ],
      },
    },
  } satisfies Prisma.ProjectWhereInput;
}

function buildFluxAIDeadlineSearchWhere(deadlineState: string | null | undefined) {
  const window = getDeadlineWindow(deadlineState);

  if (!window) {
    return null;
  }

  return {
    AND: [
      window.after
        ? {
            endDate: {
              gte: window.after,
            },
          }
        : {},
      window.before
        ? {
            endDate: {
              lte: window.before,
            },
          }
        : {},
      !window.includeCompleted
        ? {
            completedAt: null,
            archivedAt: null,
            archive: {
              is: null,
            },
          }
        : {},
    ],
  } satisfies Prisma.ProjectWhereInput;
}

function buildFluxAIProjectSearchWhere(
  user: PermissionUser,
  input: {
    query: string;
    projectName: string;
    executorName: string;
    ownerName: string;
    collaboratorName: string;
    assigneeName: string;
    status: string;
    category: string;
    tag: string;
    stageStatus: StageStatus | null;
    deadlineState?: string | null;
  },
) {
  const clauses: Prisma.ProjectWhereInput[] = [];

  if (input.query) {
    clauses.push(buildFluxAISafeTextSearchWhere(user, input.query));
  }

  if (input.projectName) {
    clauses.push({
      name: containsInsensitive(input.projectName),
    });
  }

  if (input.category) {
    clauses.push({
      category: containsInsensitive(input.category),
    });
  }

  if (input.tag) {
    clauses.push({
      tags: {
        some: {
          tag: {
            is: {
              name: containsInsensitive(input.tag),
            },
          },
        },
      },
    });
  }

  if (input.assigneeName) {
    clauses.push(
      buildFluxAIParticipantSearchWhere(user, input.assigneeName, [
        "executor",
        "collaborator",
      ]),
    );
  }

  if (input.executorName) {
    clauses.push(
      scopeParticipantSearchForFluxAI(
        user,
        buildFluxAIExecutorSearchWhere(input.executorName),
      ),
    );
  }

  if (input.ownerName) {
    clauses.push(
      scopeParticipantSearchForFluxAI(
        user,
        buildFluxAIOwnerSearchWhere(input.ownerName),
      ),
    );
  }

  if (input.collaboratorName) {
    clauses.push(
      scopeParticipantSearchForFluxAI(
        user,
        buildFluxAICollaboratorSearchWhere(input.collaboratorName),
      ),
    );
  }

  if (input.stageStatus) {
    clauses.push({
      stages: {
        some: {
          isTasker: false,
          status: input.stageStatus,
        },
      },
    });
  }

  const statusWhere = buildFluxAIStatusSearchWhere(input.status);
  if (statusWhere) {
    clauses.push(statusWhere);
  }

  const deadlineWhere = buildFluxAIDeadlineSearchWhere(input.deadlineState);
  if (deadlineWhere) {
    clauses.push(deadlineWhere);
  }

  return clauses.length > 0
    ? ({
        AND: clauses,
      } satisfies Prisma.ProjectWhereInput)
    : null;
}

function sanitizeProjectSearchQuery(input: {
  query?: string | null;
  rawMessage?: string | null;
  hasStructuredFilter: boolean;
}) {
  const query = normalizePromptForInference(input.query);
  const rawMessage = normalizePromptForInference(input.rawMessage);

  if (
    input.hasStructuredFilter ||
    isAllProjectsPrompt(query) ||
    isAllProjectsPrompt(rawMessage)
  ) {
    return "";
  }

  return cleanExtractedSearchValue(
    query
      .replace(
        /^(?:find|show|list|view|display|search|lookup|open|give)\s+(?:me\s+)?(?:the\s+)?/i,
        "",
      )
      .replace(/\b(?:projects?|records?)\b/gi, " ")
      .replace(/\b(?:by\s+name|named|called|category|tagged|tags?|assigned\s+to|assignee|owner|owned\s+by|executor|main\s+executor|collaborator|with\s+collaborator|where|is|are)\b/gi, " ")
      .replace(/\s+/g, " "),
  );
}

function getAccessibleProjectWhere(user: PermissionUser) {
  if (!hasPermission(user, "project.list") && !hasPermission(user, "project.view")) {
    return {
      id: "__permission_denied__",
    } satisfies Prisma.ProjectWhereInput;
  }

  return getAccessibleProjectsWhere(user);
}

async function getAccessibleFluxProjects(
  user: PermissionUser,
  options: {
    where?: Prisma.ProjectWhereInput | null;
    limit?: number;
  } = {},
) {
  const where = options.where
    ? {
        AND: [
          getAccessibleProjectWhere(user),
          options.where,
        ],
      }
    : getAccessibleProjectWhere(user);

  return withPrismaRetry(() =>
    prisma.project.findMany({
      where,
      orderBy: [
        {
          updatedAt: "desc",
        },
        {
          createdAt: "desc",
        },
      ],
      take: options.limit ?? MAX_PROJECTS_FOR_FLUX_AI,
      select: fluxProjectSelect,
    }),
  );
}

function resolveLimit(limit: number | null | undefined) {
  if (!limit || !Number.isFinite(limit)) {
    return DEFAULT_RESULT_LIMIT;
  }

  return Math.max(1, Math.min(12, Math.floor(limit)));
}

export async function searchProjectsForFluxAI(
  user: PermissionUser,
  input: {
    query?: string | null;
    rawMessage?: string | null;
    projectName?: string | null;
    executorName?: string | null;
    ownerName?: string | null;
    collaboratorName?: string | null;
    status?: string | null;
    category?: string | null;
    tag?: string | null;
    stageStatus?: string | null;
    completionBlocker?: string | null;
    deadlineState?: string | null;
    limit?: number | null;
  },
) {
  const rawMessage = input.rawMessage ?? input.query ?? "";
  const explicitProjectName =
    inferProjectNameFromPrompt(rawMessage) || inferProjectNameFromPrompt(input.query);
  const modelProjectName = cleanExtractedSearchValue(input.projectName);
  const assigneeName = normalizeSearchValue(
    inferAssigneeNameFromPrompt(rawMessage) || inferAssigneeNameFromPrompt(input.query),
  );
  const completionBlocker =
    normalizeCompletionBlocker(input.completionBlocker) ??
    normalizeCompletionBlocker(inferCompletionBlockerFromPrompt(rawMessage)) ??
    normalizeCompletionBlocker(inferCompletionBlockerFromPrompt(input.query));
  const projectName = normalizeSearchValue(
    explicitProjectName ||
      (!isBroadProjectSearchPrompt(rawMessage) ? modelProjectName : ""),
  );
  const executorName = normalizeSearchValue(
    cleanExtractedSearchValue(input.executorName) ||
      (!assigneeName
        ? inferExecutorNameFromPrompt(rawMessage) || inferExecutorNameFromPrompt(input.query)
        : ""),
  );
  const ownerName = normalizeSearchValue(
    cleanExtractedSearchValue(input.ownerName) ||
      inferOwnerNameFromPrompt(rawMessage) ||
      inferOwnerNameFromPrompt(input.query),
  );
  const collaboratorName = normalizeSearchValue(
    cleanExtractedSearchValue(input.collaboratorName) ||
      (!assigneeName
        ? inferCollaboratorNameFromPrompt(rawMessage) ||
          inferCollaboratorNameFromPrompt(input.query)
        : ""),
  );
  const rawStatus = normalizeSearchValue(
    input.status ||
      inferProjectStatusFromPrompt(rawMessage) ||
      inferProjectStatusFromPrompt(input.query),
  );
  const status =
    completionBlocker && /(?:pending|waiting)/i.test(rawStatus) ? "" : rawStatus;
  const category = normalizeSearchValue(
    cleanExtractedSearchValue(input.category) ||
      inferCategoryNameFromPrompt(rawMessage) ||
      inferCategoryNameFromPrompt(input.query),
  );
  const tag = normalizeSearchValue(
    cleanExtractedSearchValue(input.tag) ||
      inferTagNameFromPrompt(rawMessage) ||
      inferTagNameFromPrompt(input.query),
  );
  const stageStatus = normalizeStageStatus(input.stageStatus);
  const query = sanitizeProjectSearchQuery({
    query: input.query,
    rawMessage,
    hasStructuredFilter: Boolean(
      projectName ||
        executorName ||
        ownerName ||
        collaboratorName ||
        assigneeName ||
        status ||
        category ||
        tag ||
        stageStatus ||
        completionBlocker ||
        input.deadlineState,
    ),
  });
  const searchWhere = buildFluxAIProjectSearchWhere(user, {
    query,
    projectName,
    executorName,
    ownerName,
    collaboratorName,
    assigneeName,
    status,
    category,
    tag,
    stageStatus,
    deadlineState: input.deadlineState,
  });
  const resultLimit = resolveLimit(input.limit);
  const projects = await getAccessibleFluxProjects(user, {
    where: searchWhere,
    limit: searchWhere
      ? Math.max(MAX_PROJECTS_FOR_FLUX_AI, resultLimit * 8)
      : MAX_PROJECTS_FOR_FLUX_AI,
  });

  return projects
    .filter((project) => projectMatchesSearch(user, project, query))
    .filter((project) =>
      projectName ? includesSearchValue(project.name, projectName) : true,
    )
    .filter((project) =>
      category ? includesSearchValue(project.category, category) : true,
    )
    .filter((project) =>
      tag ? getTagNames(project).some((tagName) => includesSearchValue(tagName, tag)) : true,
    )
    .filter((project) =>
      assigneeName
        ? canUseParticipantFilter(user, project) &&
          (project.executors.some((executor) =>
            includesSearchValue(getDisplayName(executor.user), assigneeName),
          ) ||
            collaboratorMatchesSearch(user, project, assigneeName))
        : true,
    )
    .filter((project) =>
      executorName
        ? canUseParticipantFilter(user, project) &&
          project.executors.some((executor) =>
            includesSearchValue(getDisplayName(executor.user), executorName),
          )
        : true,
    )
    .filter((project) =>
      ownerName
        ? canUseParticipantFilter(user, project) &&
          Boolean(
            project.owner &&
              includesSearchValue(getDisplayName(project.owner), ownerName),
          )
        : true,
    )
    .filter((project) =>
      collaboratorName ? collaboratorMatchesSearch(user, project, collaboratorName) : true,
    )
    .filter((project) =>
      stageStatus ? project.stages.some((stage) => stage.status === stageStatus) : true,
    )
    .filter((project) =>
      completionBlocker
        ? canViewArchiveReadiness(user, project) &&
          projectHasCompletionBlocker(project, completionBlocker)
        : true,
    )
    .filter((project) => projectMatchesDeadlineState(project, input.deadlineState))
    .filter((project) => {
      return projectMatchesStatus(project, status);
    })
    .map((project) => ({
      project,
      blockers: completionBlocker
        ? getCompletionBlockerMessages(project, completionBlocker)
        : [],
    }))
    .slice(0, resultLimit)
    .map((entry) =>
      mapProjectForFluxAI(user, entry.project, {
        archiveBlockers: entry.blockers.length > 0 ? entry.blockers : undefined,
      }),
    );
}

function getPendingReviewCount(project: FluxProject) {
  return project.revisions.length + project.attachments.length;
}

function getPendingReviewLabel(project: FluxProject) {
  const revisionCount = project.revisions.length;
  const submissionCount = project.attachments.length;

  if (revisionCount === 0 && submissionCount === 0) {
    return "No pending review";
  }

  return [
    revisionCount > 0
      ? `${revisionCount} revision${revisionCount === 1 ? "" : "s"} pending review`
      : null,
    submissionCount > 0
      ? `${submissionCount} submission${submissionCount === 1 ? "" : "s"} pending review`
      : null,
  ].filter(Boolean).join(", ");
}

function getCompletionStatusLabel(
  project: FluxProject,
  step: "approval" | "copyright" | "invoice",
) {
  if (project.executionType === "INTERNAL") {
    return "Not Required";
  }

  const workflow = project.completionWorkflow;

  if (!workflow) {
    return "Not Configured";
  }

  if (step === "approval") {
    return workflow.approvalRequired === false
      ? "Not Required"
      : formatCompletionStepStatus(workflow.approvalStatus);
  }

  if (step === "copyright") {
    return workflow.copyrightRequired === false
      ? "Not Required"
      : formatCompletionStepStatus(workflow.copyrightStatus);
  }

  return workflow.invoiceRequired === false
    ? "Not Required"
    : formatCompletionStepStatus(workflow.invoiceStatus);
}

function getArchiveReadiness(
  user: PermissionUser,
  project: FluxProject,
  blockers: string[],
): FluxAIProjectStatusSummary["archiveReadiness"] {
  if (isClientOfGtiUser(user)) {
    return "restricted";
  }

  if (isProjectCompletedOrArchived(project)) {
    return "completed";
  }

  if (!canViewArchiveReadiness(user, project)) {
    return "restricted";
  }

  if (blockers.length === 0 && project.stages.length > 0) {
    return "ready";
  }

  return blockers.length > 0 ? "blocked" : "not_ready";
}

function getNextRecommendedAction(user: PermissionUser, project: FluxProject, blockers: string[]) {
  if (isProjectCompletedOrArchived(project)) {
    return "Review the completed project record.";
  }

  const pendingReviewCount = getPendingReviewCount(project);

  if (pendingReviewCount > 0) {
    return "Review pending submissions or revisions.";
  }

  if (blockers.length > 0) {
    return blockers[0] ?? "Resolve the remaining completion blocker.";
  }

  if (!canViewArchiveReadiness(user, project)) {
    return "Continue with available project updates.";
  }

  if (project.stages.length > 0 && project.stages.every((stage) => stage.status === StageStatus.COMPLETED)) {
    return "Prepare final archive when you are ready.";
  }

  const currentStage = getCurrentStage(project);

  return currentStage
    ? `Continue ${currentStage.name}.`
    : "Review project setup and stage progress.";
}

function mapProjectStatusSummaryForFluxAI(
  user: PermissionUser,
  project: FluxProject,
): FluxAIProjectStatusSummary {
  const currentStage = getCurrentStage(project);
  const canViewArchiveDetails = canViewArchiveReadiness(user, project);
  const blockers = canViewArchiveDetails ? getArchiveBlockers(project) : [];

  return {
    projectId: project.id,
    projectName: project.name,
    href: `/projects/${project.id}`,
    currentStage: currentStage?.name ?? project.currentStageName?.trim() ?? "Stage 1",
    stageStatus: currentStage ? formatStageStatus(currentStage.status) : "Not Set",
    pendingReviewCount: getPendingReviewCount(project),
    pendingReviewLabel: getPendingReviewLabel(project),
    approvalStatus: canViewArchiveDetails
      ? getCompletionStatusLabel(project, "approval")
      : "Restricted",
    copyrightStatus: canViewArchiveDetails
      ? getCompletionStatusLabel(project, "copyright")
      : "Restricted",
    invoiceStatus: canViewArchiveDetails
      ? getCompletionStatusLabel(project, "invoice")
      : "Restricted",
    archiveReadiness: getArchiveReadiness(user, project, blockers),
    blockers,
    nextRecommendedAction: getNextRecommendedAction(user, project, blockers),
  };
}

function scoreProjectMatch(project: FluxProject, searchValue: string) {
  if (!searchValue) {
    return 0;
  }

  const name = normalizeSearchValue(project.name);

  if (name === searchValue) {
    return 100;
  }

  if (name.includes(searchValue)) {
    return 80;
  }

  return 0;
}

function findBestProject(
  user: PermissionUser,
  projects: FluxProject[],
  input: { query?: string | null; projectName?: string | null },
) {
  const searchValue = normalizeSearchValue(input.projectName ?? input.query);

  if (!searchValue) {
    return null;
  }

  return projects
    .map((project) => ({
      project,
      score:
        scoreProjectMatch(project, searchValue) +
        (projectMatchesSearch(user, project, searchValue) ? 5 : 0),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .at(0)?.project ?? null;
}

export async function getProjectStatusForFluxAI(
  user: PermissionUser,
  input: {
    query?: string | null;
    projectName?: string | null;
  } = {},
) {
  const projects = await getAccessibleFluxProjects(user, { limit: 200 });
  const project = findBestProject(user, projects, input);
  const statusSummary: FluxAIStatusSummary = {
    total: projects.length,
    active: 0,
    pending: 0,
    onHold: 0,
    completed: 0,
    archived: 0,
    cancelled: 0,
  };

  projects.forEach((project) => {
    const groupSlug = project.status?.group?.slug;

    if (groupSlug === defaultProjectStatusGroupSlugs.active) {
      statusSummary.active += 1;
    } else if (groupSlug === defaultProjectStatusGroupSlugs.pending) {
      statusSummary.pending += 1;
    } else if (groupSlug === defaultProjectStatusGroupSlugs.onHold) {
      statusSummary.onHold += 1;
    } else if (groupSlug === defaultProjectStatusGroupSlugs.completed) {
      statusSummary.completed += 1;
    } else if (groupSlug === defaultProjectStatusGroupSlugs.archived) {
      statusSummary.archived += 1;
    } else if (groupSlug === defaultProjectStatusGroupSlugs.cancelled) {
      statusSummary.cancelled += 1;
    }
  });

  return {
    statusSummary,
    projectStatus: project ? mapProjectStatusSummaryForFluxAI(user, project) : null,
    projects: projects.slice(0, DEFAULT_RESULT_LIMIT).map((project) => mapProjectForFluxAI(user, project)),
  };
}

export async function getProjectCountSummaryForFluxAI(user: PermissionUser) {
  const counts = await getDashboardProjectCounts(user);

  return {
    total: counts.total,
    active: counts.ongoing,
    pending: counts.pending,
    onHold: counts.onHold,
    completed: counts.completed,
    archived: 0,
    cancelled: 0,
  } satisfies FluxAIStatusSummary;
}

function canViewArchiveReadiness(user: PermissionUser, project: FluxProject) {
  if (isClientOfGtiUser(user)) {
    return false;
  }

  return (
    canUseArchives(user) ||
    hasProjectPermission(user, project, "archive.view") ||
    hasProjectPermission(user, project, "project.completeArchive")
  );
}

function isProjectCompletedOrArchived(project: FluxProject) {
  return Boolean(project.completedAt || project.archivedAt || project.archive);
}

function getIncompleteStageBlockers(project: FluxProject) {
  return project.stages
    .filter((stage) => stage.status !== StageStatus.COMPLETED)
    .map((stage) => `${stage.name} is ${formatStageStatus(stage.status).toLowerCase()}.`);
}

function getArchiveBlockers(project: FluxProject) {
  if (isProjectCompletedOrArchived(project)) {
    return [];
  }

  const stageBlockers = getIncompleteStageBlockers(project);

  if (stageBlockers.length > 0) {
    return stageBlockers;
  }

  return getFinalCompletionArchiveBlockers({
    executionType: project.executionType,
    workflow: project.completionWorkflow,
  });
}

export async function getArchiveBlockersForFluxAI(
  user: PermissionUser,
  input: {
    query?: string | null;
    limit?: number | null;
  } = {},
) {
  if (isClientOfGtiUser(user)) {
    throw new FluxAIPermissionError("Archive information is not available for this account.");
  }

  const searchValue = normalizeSearchValue(input.query);
  const projects = await getAccessibleFluxProjects(user);

  return projects
    .filter((project) => canViewArchiveReadiness(user, project))
    .filter((project) => projectMatchesSearch(user, project, searchValue))
    .map((project) => ({
      project,
      blockers: getArchiveBlockers(project),
    }))
    .filter((entry) => entry.blockers.length > 0)
    .slice(0, resolveLimit(input.limit))
    .map((entry) =>
      mapProjectForFluxAI(user, entry.project, {
        archiveBlockers: entry.blockers,
      }),
    );
}

export async function getOverdueStagesForFluxAI(
  user: PermissionUser,
  input: {
    limit?: number | null;
  } = {},
) {
  const now = new Date();
  const projects = await withPrismaRetry(() =>
    prisma.project.findMany({
      where: {
        AND: [
          getAccessibleProjectWhere(user),
          {
            stages: {
              some: {
                isTasker: false,
                status: {
                  not: StageStatus.COMPLETED,
                },
                plannedDueAt: {
                  lt: now,
                },
              },
            },
          },
        ],
      },
      orderBy: [
        {
          updatedAt: "desc",
        },
      ],
      take: MAX_PROJECTS_FOR_FLUX_AI,
      select: fluxProjectSelect,
    }),
  );

  return projects
    .map((project) => {
      const overdueStages = project.stages
        .filter(
          (stage) =>
            stage.status !== StageStatus.COMPLETED &&
            Boolean(stage.plannedDueAt && stage.plannedDueAt < now),
        )
        .map(mapOverdueStage);

      return {
        project,
        overdueStages,
      };
    })
    .filter((entry) => entry.overdueStages.length > 0)
    .sort((left, right) => {
      const leftDue = left.overdueStages[0]?.dueDate ?? "";
      const rightDue = right.overdueStages[0]?.dueDate ?? "";
      return leftDue.localeCompare(rightDue);
    })
    .slice(0, resolveLimit(input.limit))
    .map((entry) =>
      mapProjectForFluxAI(user, entry.project, {
        overdueStages: entry.overdueStages,
      }),
    );
}

export async function getReadyForArchiveProjectsForFluxAI(
  user: PermissionUser,
  input: {
    limit?: number | null;
  } = {},
) {
  if (isClientOfGtiUser(user)) {
    throw new FluxAIPermissionError("Archive information is not available for this account.");
  }

  const projects = await getAccessibleFluxProjects(user);

  return projects
    .filter((project) => canViewArchiveReadiness(user, project))
    .filter((project) => !isProjectCompletedOrArchived(project))
    .filter((project) => project.stages.length > 0)
    .filter((project) =>
      project.stages.every((stage) => stage.status === StageStatus.COMPLETED),
    )
    .map((project) => ({
      project,
      blockers: getArchiveBlockers(project),
    }))
    .filter((entry) => entry.blockers.length === 0)
    .slice(0, resolveLimit(input.limit))
    .map((entry) =>
      mapProjectForFluxAI(user, entry.project, {
        readyForArchive: true,
      }),
    );
}

function normalizeDraftText(value: string | null | undefined) {
  const normalizedValue = normalizeText(value);
  return normalizedValue || "";
}

function normalizeDraftOptionalText(value: string | null | undefined) {
  const normalizedValue = normalizeDraftText(value);
  return normalizedValue || null;
}

function dedupeDraftStrings(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const result: string[] = [];

  values.forEach((value) => {
    const normalizedValue = normalizeDraftText(value);
    const key = normalizedValue.toLowerCase();

    if (!normalizedValue || seen.has(key)) {
      return;
    }

    seen.add(key);
    result.push(normalizedValue);
  });

  return result;
}

function canonicalOption(value: string | null | undefined, options: string[]) {
  const normalizedValue = normalizeSearchValue(value);

  if (!normalizedValue) {
    return "";
  }

  return (
    options.find((option) => normalizeSearchValue(option) === normalizedValue) ??
    normalizeDraftText(value)
  );
}

function parseDraftAmount(value: string | null | undefined) {
  const normalizedValue = normalizeDraftText(value).replace(/,/g, "");

  if (!normalizedValue) {
    return null;
  }

  const parsedAmount = Number.parseFloat(normalizedValue);

  return Number.isFinite(parsedAmount) ? parsedAmount : null;
}

function parseBudgetFromMessage(message: string) {
  const budgetMatch = message.match(
    /\bbudget\s*(?:is|of|:)?\s*([0-9][0-9,]*(?:\.\d+)?)\s*(?:AED|USD|EUR)?\b/i,
  );
  const currencyMatch = message.match(
    /\b([0-9][0-9,]*(?:\.\d+)?)\s*(AED|USD|EUR)\b/i,
  );
  const parsedAmount = parseDraftAmount(budgetMatch?.[1] ?? currencyMatch?.[1]);

  return parsedAmount;
}

function inferProjectName(message: string) {
  const calledMatch = message.match(
    /\bcalled\s+(.+?)(?:\.\s*(?:category|budget|main executor|executor|add|stages?|two stages?|with\b)|$)/i,
  );
  const forMatch = message.match(
    /\bfor\s+(.+?)(?:\s+with\s+\d+\s+stages?|\s+with\s+stages?|\.\s*(?:category|budget|main executor|executor|add|stages?)|\s*$)/i,
  );
  const match = calledMatch ?? forMatch;

  return normalizeDraftText(match?.[1]).replace(/[.?!]$/, "");
}

function inferCategory(message: string) {
  const explicitMatch = message.match(/\bcategory\s*(?:is|:)?\s*([A-Za-z][A-Za-z0-9 &/-]+?)(?:\.|,|$)/i);
  const explicitCategory = normalizeDraftText(explicitMatch?.[1]);

  if (explicitCategory) {
    return explicitCategory;
  }

  if (/packaging/i.test(message)) {
    return "Packaging";
  }

  if (/rebrand|branding/i.test(message)) {
    return "Branding";
  }

  if (/campaign/i.test(message)) {
    return "Campaign";
  }

  return "";
}

function inferProjectBrief(message: string) {
  const match = message.match(/\b(?:project\s+brief|brief|description)\s*(?:is|:)?\s*(.+?)(?:\.\s*(?:category|budget|main executor|executor|add|stages?|timeline|start|end)|$)/i);

  return normalizeDraftText(match?.[1]).replace(/[.?!]$/, "");
}

function inferExecutionType(message: string) {
  if (/\binternal\b/i.test(message)) {
    return "INTERNAL" as const;
  }

  if (/\bexternal\b/i.test(message)) {
    return "EXTERNAL" as const;
  }

  return null;
}

function inferCurrency(message: string) {
  const match = message.match(/\b(AED|USD|EUR)\b/i);

  return match?.[1]?.toUpperCase() ?? null;
}

function inferMainExecutor(message: string) {
  const match = message.match(
    /\bmain\s+executor\s*(?:is|:)?\s*(.+?)(?:\.\s*(?:add|with|stages?|start|end|timeline|budget|category)|,|\s+and\s+add\b|$)/i,
  );

  return normalizeDraftOptionalText(match?.[1]);
}

function splitDraftNames(value: string) {
  return dedupeDraftStrings(
    value
      .replace(/\bas\s+collaborators?\b/gi, "")
      .split(/\s*,\s*|\s+\band\b\s+|\s*&\s*/i),
  );
}

function splitDraftStageNames(value: string) {
  return dedupeDraftStrings(value.split(/\s*,\s*|\s+\band\b\s+/i));
}

function inferCollaborators(message: string) {
  const match = message.match(
    /\b(?:add|include)\s+(.+?)\s+as\s+collaborators?\b/i,
  );

  return match?.[1] ? splitDraftNames(match[1]) : [];
}

function inferTags(message: string) {
  const match = message.match(/\btags?\s*(?:are|is|:)?\s*(.+?)(?:\.|$)/i);

  return match?.[1] ? splitDraftNames(match[1]) : [];
}

const draftDateMonthMap: ReadonlyMap<string, number> = new Map([
  ["jan", 1],
  ["january", 1],
  ["feb", 2],
  ["february", 2],
  ["mar", 3],
  ["march", 3],
  ["apr", 4],
  ["april", 4],
  ["may", 5],
  ["jun", 6],
  ["june", 6],
  ["jul", 7],
  ["july", 7],
  ["aug", 8],
  ["august", 8],
  ["sep", 9],
  ["sept", 9],
  ["september", 9],
  ["oct", 10],
  ["october", 10],
  ["nov", 11],
  ["november", 11],
  ["dec", 12],
  ["december", 12],
]);

function padDraftDatePart(value: number) {
  return String(value).padStart(2, "0");
}

function buildDraftIsoDate(year: number, month: number, day: number) {
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    year < 1900 ||
    year > 2100 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return `${year}-${padDraftDatePart(month)}-${padDraftDatePart(day)}`;
}

function getDefaultDraftDateYear() {
  return new Date().getFullYear();
}

function getDraftDateContextYear(values: Array<string | null | undefined>) {
  for (const value of values) {
    const yearMatch = normalizeDraftText(value).match(/\b(20\d{2}|19\d{2})\b/);

    if (yearMatch?.[1]) {
      return Number.parseInt(yearMatch[1], 10);
    }
  }

  return getDefaultDraftDateYear();
}

function parseDraftNaturalDate(
  value: string,
  options: {
    defaultYear?: number;
  } = {},
) {
  const normalizedValue = normalizeDraftText(value).replace(/\b(\d+)(st|nd|rd|th)\b/gi, "$1");
  const defaultYear = options.defaultYear ?? getDefaultDraftDateYear();
  const monthNamePattern =
    "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
  const monthFirstMatch = normalizedValue.match(
    new RegExp(`\\b${monthNamePattern}\\s+(\\d{1,2})(?:\\s*,?\\s*(\\d{4}))?\\b`, "i"),
  );
  const dayFirstMatch = normalizedValue.match(
    new RegExp(`\\b(\\d{1,2})\\s+${monthNamePattern}(?:\\s*,?\\s*(\\d{4}))?\\b`, "i"),
  );
  const numericMatch = normalizedValue.match(
    /\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/,
  );

  if (monthFirstMatch?.[1] && monthFirstMatch?.[2]) {
    const month = draftDateMonthMap.get(monthFirstMatch[1].toLowerCase());
    const day = Number.parseInt(monthFirstMatch[2], 10);
    const year = monthFirstMatch[3]
      ? Number.parseInt(monthFirstMatch[3], 10)
      : defaultYear;

    return month ? buildDraftIsoDate(year, month, day) : null;
  }

  if (dayFirstMatch?.[1] && dayFirstMatch?.[2]) {
    const day = Number.parseInt(dayFirstMatch[1], 10);
    const month = draftDateMonthMap.get(dayFirstMatch[2].toLowerCase());
    const year = dayFirstMatch[3]
      ? Number.parseInt(dayFirstMatch[3], 10)
      : defaultYear;

    return month ? buildDraftIsoDate(year, month, day) : null;
  }

  if (numericMatch?.[1] && numericMatch?.[2]) {
    const first = Number.parseInt(numericMatch[1], 10);
    const second = Number.parseInt(numericMatch[2], 10);
    const parsedYear = numericMatch[3]
      ? Number.parseInt(numericMatch[3].length === 2 ? `20${numericMatch[3]}` : numericMatch[3], 10)
      : defaultYear;
    const month = first > 12 ? second : first;
    const day = first > 12 ? first : second;

    return buildDraftIsoDate(parsedYear, month, day);
  }

  return null;
}

function normalizeDraftDate(
  value: string | null | undefined,
  options: {
    defaultYear?: number;
  } = {},
) {
  const normalizedValue = normalizeDraftText(value);

  if (!normalizedValue) {
    return null;
  }

  const isoMatch = normalizedValue.match(/\b(\d{4}-\d{2}-\d{2})\b/);

  if (isoMatch?.[1]) {
    return isoMatch[1];
  }

  const naturalDate = parseDraftNaturalDate(normalizedValue, options);

  if (naturalDate) {
    return naturalDate;
  }

  return normalizedValue;
}

function inferProjectTimeline(message: string) {
  const dateValuePattern =
    "(\\d{4}-\\d{2}-\\d{2}|(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\s+\\d{1,2}(?:\\s*,?\\s*\\d{4})?|\\d{1,2}\\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\\s*,?\\s*\\d{4})?|\\d{1,2}[/-]\\d{1,2}(?:[/-]\\d{2,4})?)";
  const rangeMatch = message.match(
    new RegExp(`\\b(?:from|between)\\s+${dateValuePattern}\\s+(?:to|and|-)\\s+${dateValuePattern}\\b`, "i"),
  );
  const startMatch = message.match(
    new RegExp(`\\bstart(?:\\s+date)?\\s*(?:is|:)?\\s*${dateValuePattern}\\b`, "i"),
  );
  const endMatch = message.match(
    new RegExp(`\\bend(?:\\s+date)?\\s*(?:is|:)?\\s*${dateValuePattern}\\b`, "i"),
  );
  const defaultYear = getDraftDateContextYear([
    startMatch?.[1],
    endMatch?.[1],
    rangeMatch?.[1],
    rangeMatch?.[2],
    message,
  ]);

  return {
    startDate: normalizeDraftDate(startMatch?.[1] ?? rangeMatch?.[1], {
      defaultYear,
    }),
    endDate: normalizeDraftDate(endMatch?.[1] ?? rangeMatch?.[2], {
      defaultYear,
    }),
  };
}

function getStageCountFromMessage(message: string) {
  const digitMatch = message.match(/\b(\d+)\s+stages?\b/i);

  if (digitMatch?.[1]) {
    return Math.min(12, Math.max(1, Number.parseInt(digitMatch[1], 10)));
  }

  const wordCounts: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
  };
  const wordMatch = message.match(/\b(one|two|three|four|five|six)\s+stages?\b/i);

  return wordMatch?.[1] ? wordCounts[wordMatch[1].toLowerCase()] ?? 0 : 0;
}

function createStageDraft(input: Partial<FluxAIStageDraft> & { name?: string }) {
  return {
    name: normalizeDraftText(input.name),
    brief: normalizeDraftText(input.brief),
    budget: typeof input.budget === "number" && Number.isFinite(input.budget)
      ? input.budget
      : null,
    startDate: normalizeDraftDate(input.startDate),
    dueDate: normalizeDraftDate(input.dueDate),
    invoiceRequired: typeof input.invoiceRequired === "boolean" ? input.invoiceRequired : null,
  } satisfies FluxAIStageDraft;
}

function inferStages(message: string) {
  const explicitMatch = message.match(/\bstages?\s*:\s*(.+?)(?:\.|$)/i);
  const explicitStages = explicitMatch?.[1]
    ? splitDraftStageNames(explicitMatch[1]).map((name) => createStageDraft({ name }))
    : [];

  if (explicitStages.length > 0) {
    return explicitStages;
  }

  const stageCount = getStageCountFromMessage(message);

  if (stageCount === 2) {
    return [
      createStageDraft({ name: "Concept & Design" }),
      createStageDraft({ name: "Production & Delivery" }),
    ];
  }

  if (stageCount > 0) {
    return Array.from({ length: stageCount }, (_, index) =>
      createStageDraft({ name: `Stage ${index + 1}` }),
    );
  }

  return [];
}

function normalizeDetectedStage(stage: unknown) {
  if (typeof stage === "string") {
    return createStageDraft({ name: stage });
  }

  if (!stage || typeof stage !== "object") {
    return null;
  }

  const stageRecord = stage as Partial<FluxAIStageDraft>;

  return createStageDraft(stageRecord);
}

function normalizeDetectedStages(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(normalizeDetectedStage)
    .filter((stage): stage is FluxAIStageDraft => Boolean(stage))
    .filter(
      (stage) =>
        stage.name ||
        stage.brief ||
        stage.budget !== null ||
        stage.startDate ||
        stage.dueDate,
    );
}

function mergeStageDrafts(
  primaryStages: FluxAIStageDraft[],
  fallbackStages: FluxAIStageDraft[],
) {
  if (primaryStages.length === 0) {
    return fallbackStages;
  }

  return primaryStages.map((stage, index) => {
    const fallbackStage = fallbackStages[index];

    if (!fallbackStage) {
      return stage;
    }

    return {
      name: stage.name || fallbackStage.name,
      brief: stage.brief || fallbackStage.brief,
      budget: stage.budget ?? fallbackStage.budget,
      startDate: stage.startDate ?? fallbackStage.startDate,
      dueDate: stage.dueDate ?? fallbackStage.dueDate,
      invoiceRequired: stage.invoiceRequired ?? fallbackStage.invoiceRequired,
    } satisfies FluxAIStageDraft;
  });
}

function normalizeProjectExecutionType(value: string | null | undefined) {
  const normalizedValue = normalizeDraftText(value).toUpperCase();

  if (normalizedValue === ProjectExecutionType.INTERNAL) {
    return ProjectExecutionType.INTERNAL;
  }

  if (normalizedValue === ProjectExecutionType.EXTERNAL) {
    return ProjectExecutionType.EXTERNAL;
  }

  return null;
}

function normalizeProjectPriority(value: string | null | undefined) {
  const normalizedValue = normalizeDraftText(value).toUpperCase();

  return isProjectPriority(normalizedValue) ? normalizedValue : null;
}

function normalizeBudgetRequired(input: {
  detectedBudgetRequired: boolean | null | undefined;
  currentBudgetRequired: boolean | null | undefined;
  budget: number | null;
  message: string;
}) {
  if (/without\s+(?:a\s+)?budget|no\s+budget|budget\s+not\s+required/i.test(input.message)) {
    return false;
  }

  if (typeof input.detectedBudgetRequired === "boolean") {
    return input.detectedBudgetRequired;
  }

  if (input.budget !== null || /\bbudget\s+(?:required|needed)\b/i.test(input.message)) {
    return true;
  }

  if (typeof input.currentBudgetRequired === "boolean") {
    return input.currentBudgetRequired;
  }

  return false;
}

function collaboratorToCandidate(collaborator: CollaboratorRecord) {
  return {
    id: collaborator.id,
    name: collaborator.name,
    email: collaborator.email,
    type: collaborator.type,
    typeLabel: collaborator.typeLabel,
    typeGroup: collaborator.typeGroup,
  } satisfies FluxAIPersonCandidate;
}

function getFluxAICollaboratorPermissions(
  collaborator: CollaboratorRecord,
  existingMatch?: FluxAIPersonMatch | null,
) {
  return normalizeProjectCollaboratorPermissions(
    existingMatch?.permissions ?? null,
    collaborator.type,
  );
}

function collaboratorMatchesName(collaborator: CollaboratorRecord, requestedName: string) {
  const searchValue = normalizeSearchValue(requestedName);

  if (!searchValue) {
    return false;
  }

  return (
    normalizeSearchValue(collaborator.name) === searchValue ||
    normalizeSearchValue(collaborator.email) === searchValue ||
    normalizeSearchValue(collaborator.name).includes(searchValue) ||
    normalizeSearchValue(collaborator.email).includes(searchValue)
  );
}

function buildPersonMatch(input: {
  requestedName: string | null | undefined;
  collaborators: CollaboratorRecord[];
  existingMatch?: FluxAIPersonMatch | null;
}) {
  const requestedName =
    normalizeDraftText(input.requestedName) ||
    normalizeDraftText(input.existingMatch?.requestedName);

  if (input.existingMatch?.selectedUserId) {
    const selectedCollaborator = input.collaborators.find(
      (collaborator) => collaborator.id === input.existingMatch?.selectedUserId,
    );

    if (selectedCollaborator) {
      return {
        requestedName: requestedName || selectedCollaborator.name,
        status: "matched",
        selectedUserId: selectedCollaborator.id,
        selectedName: selectedCollaborator.name,
        selectedEmail: selectedCollaborator.email,
        candidates: [collaboratorToCandidate(selectedCollaborator)],
        permissions: getFluxAICollaboratorPermissions(
          selectedCollaborator,
          input.existingMatch,
        ),
      } satisfies FluxAIPersonMatch;
    }
  }

  if (!requestedName) {
    return {
      requestedName: "",
      status: "missing",
      selectedUserId: null,
      selectedName: null,
      selectedEmail: null,
      candidates: [],
    } satisfies FluxAIPersonMatch;
  }

  const matches = input.collaborators
    .filter((collaborator) => collaboratorMatchesName(collaborator, requestedName))
    .slice(0, 5);
  const exactMatches = matches.filter(
    (collaborator) =>
      normalizeSearchValue(collaborator.name) === normalizeSearchValue(requestedName) ||
      normalizeSearchValue(collaborator.email) === normalizeSearchValue(requestedName),
  );
  const candidates = (exactMatches.length > 0 ? exactMatches : matches).map(collaboratorToCandidate);

  if (candidates.length === 1) {
    const [candidate] = candidates;

    return {
      requestedName,
      status: "matched",
      selectedUserId: candidate.id,
      selectedName: candidate.name,
      selectedEmail: candidate.email,
      candidates,
      permissions: getFluxAICollaboratorPermissions(
        matches.find((collaborator) => collaborator.id === candidate.id) ?? {
          id: candidate.id,
          name: candidate.name,
          email: candidate.email,
          type: candidate.type as CollaboratorRecord["type"],
          typeLabel: candidate.typeLabel,
          typeGroup: candidate.typeGroup,
        },
        input.existingMatch,
      ),
    } satisfies FluxAIPersonMatch;
  }

  if (candidates.length > 1) {
    return {
      requestedName,
      status: "multiple",
      selectedUserId: null,
      selectedName: null,
      selectedEmail: null,
      candidates,
    } satisfies FluxAIPersonMatch;
  }

  return {
    requestedName,
    status: "not_found",
    selectedUserId: null,
    selectedName: null,
    selectedEmail: null,
    candidates: [],
  } satisfies FluxAIPersonMatch;
}

function buildCollaboratorMatches(input: {
  requestedNames: string[];
  collaborators: CollaboratorRecord[];
  existingMatches?: FluxAIPersonMatch[];
}) {
  const existingMatchesByName = new Map(
    (input.existingMatches ?? []).map((match) => [
      normalizeSearchValue(match.requestedName || match.selectedName),
      match,
    ]),
  );

  return input.requestedNames.map((requestedName) =>
    buildPersonMatch({
      requestedName,
      collaborators: input.collaborators,
      existingMatch: existingMatchesByName.get(normalizeSearchValue(requestedName)),
    }),
  );
}

function addMissingField(missingFields: Set<string>, field: string) {
  missingFields.add(field);
}

function getValidDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const parsedDate = new Date(value);

  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
}

function validateDraftStageDates(input: {
  draftProject: FluxAIDraftProject;
  missingFields: Set<string>;
  warnings: string[];
}) {
  const projectStartDate = getValidDate(input.draftProject.startDate);
  const projectEndDate = getValidDate(input.draftProject.endDate);

  if (input.draftProject.startDate && !projectStartDate) {
    addMissingField(input.missingFields, "Valid Start Date");
  }

  if (input.draftProject.endDate && !projectEndDate) {
    addMissingField(input.missingFields, "Valid End Date");
  }

  if (projectStartDate && projectEndDate && projectEndDate <= projectStartDate) {
    addMissingField(input.missingFields, "Valid Project Timeline");
    input.warnings.push("Project end date must be after the start date.");
  }

  input.draftProject.stages.forEach((stage, index) => {
    const stageNumber = index + 1;
    const stageStartDate = getValidDate(stage.startDate);
    const stageDueDate = getValidDate(stage.dueDate);

    if (stage.startDate && !stageStartDate) {
      addMissingField(input.missingFields, `Valid Stage ${stageNumber} Start Date`);
    }

    if (stage.dueDate && !stageDueDate) {
      addMissingField(input.missingFields, `Valid Stage ${stageNumber} Due Date`);
    }

    if (stageStartDate && stageDueDate && stageDueDate <= stageStartDate) {
      addMissingField(input.missingFields, `Valid Stage ${stageNumber} Timeline`);
      input.warnings.push(`Stage ${stageNumber} due date must be after its start date.`);
    }

    if (
      projectStartDate &&
      projectEndDate &&
      stageStartDate &&
      (stageStartDate < projectStartDate || stageStartDate > projectEndDate)
    ) {
      addMissingField(input.missingFields, `Stage ${stageNumber} Timeline Within Project`);
      input.warnings.push(`Stage ${stageNumber} start date must be within the project timeline.`);
    }

    if (
      projectStartDate &&
      projectEndDate &&
      stageDueDate &&
      (stageDueDate < projectStartDate || stageDueDate > projectEndDate)
    ) {
      addMissingField(input.missingFields, `Stage ${stageNumber} Timeline Within Project`);
      input.warnings.push(`Stage ${stageNumber} due date must be within the project timeline.`);
    }
  });

  input.draftProject.stages.forEach((stage, index) => {
    if (index === 0) {
      return;
    }

    const previousDueDate = getValidDate(input.draftProject.stages[index - 1]?.dueDate);
    const currentStartDate = getValidDate(stage.startDate);

    if (previousDueDate && currentStartDate && currentStartDate < previousDueDate) {
      addMissingField(input.missingFields, `Stage ${index + 1} Timeline`);
      input.warnings.push(`Stage ${index + 1} cannot start before Stage ${index} ends.`);
    }
  });
}

function validateDraftBudgets(input: {
  draftProject: FluxAIDraftProject;
  missingFields: Set<string>;
  warnings: string[];
}) {
  const isExternalExecution = input.draftProject.executionType === ProjectExecutionType.EXTERNAL;

  if (!input.draftProject.budgetRequired) {
    return;
  }

  if (
    input.draftProject.budget === null ||
    !Number.isFinite(input.draftProject.budget) ||
    input.draftProject.budget <= 0 ||
    !Number.isInteger(input.draftProject.budget)
  ) {
    addMissingField(input.missingFields, "Valid Budget");
  }

  if (!input.draftProject.currency) {
    addMissingField(input.missingFields, "Currency");
  } else if (!resolveProjectCurrency(input.draftProject.currency)) {
    addMissingField(input.missingFields, "Valid Currency");
    input.warnings.push("Currency must be AED, USD, or EUR.");
  }

  if (!isExternalExecution) {
    return;
  }

  const invalidStageBudget = input.draftProject.stages.some(
    (stage) =>
      stage.budget === null ||
      !Number.isFinite(stage.budget) ||
      stage.budget <= 0 ||
      !Number.isInteger(stage.budget),
  );

  if (invalidStageBudget) {
    addMissingField(input.missingFields, "Stage Budgets");
  }

  const stageBudgetTotal = input.draftProject.stages.reduce(
    (sum, stage) => sum + (stage.budget ?? 0),
    0,
  );

  if (
    !invalidStageBudget &&
    input.draftProject.budget !== null &&
    stageBudgetTotal !== input.draftProject.budget
  ) {
    addMissingField(input.missingFields, "Stage Budget Allocation");
    input.warnings.push(
      `Stage budgets total ${stageBudgetTotal.toLocaleString("en-US")} ${input.draftProject.currency ?? ""}, but project budget is ${input.draftProject.budget.toLocaleString("en-US")} ${input.draftProject.currency ?? ""}.`.trim(),
    );
  }
}

async function getDuplicateProjectWarning(projectName: string) {
  if (!projectName) {
    return null;
  }

  const duplicateProject = await withPrismaRetry(() =>
    prisma.project.findFirst({
      where: {
        name: {
          equals: projectName,
          mode: "insensitive",
        },
      },
      select: {
        id: true,
      },
    }),
  );

  return duplicateProject
    ? `A project named "${projectName}" already exists. Review before creating another one.`
    : null;
}

type FluxAIDraftPreparationInput = {
  user: PermissionUser;
  message: string;
  detection?: FluxAIIntentDetection | null;
  currentDraft?: FluxAIDraftProject | null;
  detectedDraft?: FluxAIDraftProject | null;
};

export async function prepareFluxAIDraftProject(input: FluxAIDraftPreparationInput) {
  if (!hasPermission(input.user, "project.create")) {
    throw new FluxAIPermissionError("You do not have permission to create projects.");
  }

  const detectedDraft = input.detectedDraft ?? input.detection?.draftProject ?? null;
  const currentDraft = input.currentDraft ?? null;
  const masterData = await getActiveProjectMasterDataOptions();
  const collaborators = await getCollaborators();
  const inferredTimeline = inferProjectTimeline(input.message);
  const draftDateContextYear = getDraftDateContextYear([
    inferredTimeline.startDate,
    inferredTimeline.endDate,
    detectedDraft?.startDate,
    detectedDraft?.endDate,
    currentDraft?.startDate,
    currentDraft?.endDate,
    input.message,
  ]);
  const inferredBudget = parseBudgetFromMessage(input.message);
  const inferredStages = inferStages(input.message);
  const detectedStages = normalizeDetectedStages(detectedDraft?.stages);
  const currentStages = normalizeDetectedStages(currentDraft?.stages);
  const rawProjectName =
    normalizeDraftText(detectedDraft?.projectName) ||
    normalizeDraftText(currentDraft?.projectName) ||
    inferProjectName(input.message);
  const rawCategory =
    normalizeDraftText(detectedDraft?.category) ||
    normalizeDraftText(currentDraft?.category) ||
    inferCategory(input.message);
  const rawTags = dedupeDraftStrings([
    ...(detectedDraft?.tags ?? []),
    ...((detectedDraft?.tags?.length ? [] : currentDraft?.tags) ?? []),
    ...(detectedDraft?.tags?.length || currentDraft?.tags?.length ? [] : inferTags(input.message)),
  ]);
  const rawMainExecutor =
    normalizeDraftOptionalText(detectedDraft?.mainExecutor) ??
    normalizeDraftOptionalText(currentDraft?.mainExecutor) ??
    input.detection?.executorName ??
    inferMainExecutor(input.message);
  const rawCollaborators = dedupeDraftStrings([
    ...((detectedDraft?.collaborators?.length
      ? detectedDraft.collaborators
      : currentDraft?.collaborators) ?? []),
    ...(!detectedDraft?.collaborators?.length && !currentDraft?.collaborators?.length
      ? inferCollaborators(input.message)
      : []),
  ]);
  const budget = typeof detectedDraft?.budget === "number"
    ? detectedDraft.budget
    : typeof currentDraft?.budget === "number"
      ? currentDraft.budget
      : inferredBudget;
  const currency =
    normalizeDraftOptionalText(detectedDraft?.currency)?.toUpperCase() ??
    normalizeDraftOptionalText(currentDraft?.currency)?.toUpperCase() ??
    inferCurrency(input.message);
  const executionType =
    normalizeProjectExecutionType(detectedDraft?.executionType) ??
    normalizeProjectExecutionType(currentDraft?.executionType) ??
    inferExecutionType(input.message) ??
    ProjectExecutionType.EXTERNAL;
  const projectBrief =
    normalizeDraftText(detectedDraft?.projectBrief) ||
    normalizeDraftText(currentDraft?.projectBrief) ||
    inferProjectBrief(input.message);
  const priority =
    normalizeProjectPriority(detectedDraft?.priority) ??
    normalizeProjectPriority(currentDraft?.priority) ??
    DEFAULT_PROJECT_PRIORITY;
  const startDate =
    inferredTimeline.startDate ??
    normalizeDraftDate(detectedDraft?.startDate, { defaultYear: draftDateContextYear }) ??
    normalizeDraftDate(currentDraft?.startDate, { defaultYear: draftDateContextYear });
  const endDate =
    inferredTimeline.endDate ??
    normalizeDraftDate(detectedDraft?.endDate, { defaultYear: draftDateContextYear }) ??
    normalizeDraftDate(currentDraft?.endDate, { defaultYear: draftDateContextYear });
  const stages = detectedStages.length
    ? mergeStageDrafts(detectedStages, currentStages)
    : currentStages.length
      ? currentStages
      : inferredStages;
  const mainExecutorMatch = buildPersonMatch({
    requestedName: rawMainExecutor,
    collaborators,
    existingMatch: detectedDraft?.mainExecutorMatch ?? currentDraft?.mainExecutorMatch,
  });
  const collaboratorMatches = buildCollaboratorMatches({
    requestedNames: rawCollaborators,
    collaborators,
    existingMatches: detectedDraft?.collaboratorMatches ?? currentDraft?.collaboratorMatches,
  });
  const canonicalCategory = canonicalOption(rawCategory, masterData.categories);
  const canonicalTags = rawTags.map((tag) => canonicalOption(tag, masterData.tags));
  const budgetRequired = normalizeBudgetRequired({
    detectedBudgetRequired: detectedDraft?.budgetRequired,
    currentBudgetRequired: currentDraft?.budgetRequired,
    budget,
    message: input.message,
  });
  const draftProject: FluxAIDraftProject = {
    projectName: rawProjectName,
    executionType,
    category: canonicalCategory,
    tags: canonicalTags,
    budgetRequired,
    budget,
    currency: budgetRequired ? currency ?? DEFAULT_PROJECT_CURRENCY : currency,
    projectBrief,
    priority: priority as ProjectPriorityValue,
    statusId: normalizeDraftOptionalText(detectedDraft?.statusId ?? currentDraft?.statusId),
    statusName: normalizeDraftOptionalText(detectedDraft?.statusName ?? currentDraft?.statusName),
    startDate,
    endDate,
    mainExecutor: rawMainExecutor,
    mainExecutorMatch,
    collaborators: rawCollaborators,
    collaboratorMatches,
    stages,
    clientName: normalizeDraftOptionalText(detectedDraft?.clientName ?? currentDraft?.clientName),
    budgetCategory: normalizeDraftOptionalText(
      detectedDraft?.budgetCategory ?? currentDraft?.budgetCategory,
    ),
  };
  const missingFields = new Set<string>();
  const warnings: string[] = [];

  if (!draftProject.projectName) addMissingField(missingFields, "Project Name");
  if (!draftProject.category) addMissingField(missingFields, "Category");
  if (
    draftProject.category &&
    !masterData.categories.some(
      (category) => normalizeSearchValue(category) === normalizeSearchValue(draftProject.category),
    )
  ) {
    addMissingField(missingFields, "Valid Category");
    warnings.push(`Category "${draftProject.category}" was not found in active project categories.`);
  }

  if (draftProject.tags.length > MAX_PROJECT_TAGS) {
    addMissingField(missingFields, "Project Tags");
    warnings.push(`Use ${MAX_PROJECT_TAGS} project tags or fewer.`);
  }

  const invalidTags = draftProject.tags.filter(
    (tag) => !masterData.tags.some((option) => normalizeSearchValue(option) === normalizeSearchValue(tag)),
  );

  if (invalidTags.length > 0) {
    addMissingField(missingFields, "Valid Project Tags");
    warnings.push(`Tag${invalidTags.length === 1 ? "" : "s"} not found: ${invalidTags.join(", ")}.`);
  }

  if (!draftProject.projectBrief) addMissingField(missingFields, "Project Brief");
  if (!draftProject.executionType) addMissingField(missingFields, "Execution Type");
  if (
    draftProject.statusId &&
    !masterData.projectStatuses.some((status) => status.id === draftProject.statusId)
  ) {
    addMissingField(missingFields, "Valid Project Status");
    warnings.push("Select an active project status.");
  }
  if (!draftProject.startDate) addMissingField(missingFields, "Start Date");
  if (!draftProject.endDate) addMissingField(missingFields, "End Date");

  if (draftProject.mainExecutorMatch?.status === "missing") {
    addMissingField(missingFields, "Executor");
  } else if (draftProject.mainExecutorMatch?.status === "multiple") {
    addMissingField(missingFields, "Choose Executor");
    warnings.push(
      `Multiple collaborators matched "${draftProject.mainExecutorMatch.requestedName}". Choose one before creating.`,
    );
  } else if (draftProject.mainExecutorMatch?.status === "not_found") {
    addMissingField(missingFields, "Valid Executor");
    warnings.push(
      `No collaborator matched "${draftProject.mainExecutorMatch.requestedName}". Choose an existing collaborator or provide an email.`,
    );
  }

  const unresolvedCollaborators = draftProject.collaboratorMatches?.filter(
    (match) => match.status === "multiple" || match.status === "not_found",
  ) ?? [];

  if (unresolvedCollaborators.length > 0) {
    addMissingField(missingFields, "Resolve Collaborators");
    unresolvedCollaborators.forEach((match) => {
      warnings.push(
        match.status === "multiple"
          ? `Multiple collaborators matched "${match.requestedName}". Choose one before creating.`
          : `No collaborator matched "${match.requestedName}". Choose an existing collaborator or provide an email.`,
      );
    });
  }

  if (draftProject.stages.length === 0) {
    addMissingField(missingFields, "Stages");
  }

  draftProject.stages.forEach((stage, index) => {
    const stageNumber = index + 1;

    if (!stage.name) {
      addMissingField(missingFields, `Stage ${stageNumber} Name`);
    }

    if (draftProject.executionType === ProjectExecutionType.EXTERNAL) {
      if (!stage.brief) addMissingField(missingFields, `Stage ${stageNumber} Brief`);
      if (!stage.startDate) addMissingField(missingFields, `Stage ${stageNumber} Start Date`);
      if (!stage.dueDate) addMissingField(missingFields, `Stage ${stageNumber} Due Date`);
    }
  });

  validateDraftStageDates({ draftProject, missingFields, warnings });
  validateDraftBudgets({ draftProject, missingFields, warnings });

  const duplicateProjectWarning = await getDuplicateProjectWarning(draftProject.projectName);

  if (duplicateProjectWarning) {
    warnings.push(duplicateProjectWarning);
  }

  const resolvedMissingFields = [...missingFields];
  const resolvedWarnings = dedupeDraftStrings(warnings);

  draftProject.missingFields = resolvedMissingFields;
  draftProject.warnings = resolvedWarnings;
  draftProject.canCreate = resolvedMissingFields.length === 0;

  return {
    draftProject,
    missingFields: resolvedMissingFields,
    warnings: resolvedWarnings,
  };
}

export async function extractDraftProjectForFluxAI(input: {
  user: PermissionUser;
  message: string;
  detection?: FluxAIIntentDetection | null;
  currentDraft?: FluxAIDraftProject | null;
}) {
  return prepareFluxAIDraftProject(input);
}

export async function validateFluxAIDraftForCreation(input: {
  user: PermissionUser;
  draftProject: FluxAIDraftProject;
}) {
  return prepareFluxAIDraftProject({
    user: input.user,
    message: "",
    detectedDraft: input.draftProject,
  });
}
