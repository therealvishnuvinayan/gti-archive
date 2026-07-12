import {
  ProjectCompletionStepStatus,
  ProjectExecutionType,
  ProjectExecutorRole,
  ProjectRevisionStatus,
  StageStatus,
  SubmissionReviewStatus,
  type Prisma,
} from "@prisma/client";

import { getCollaborators, type CollaboratorRecord } from "@/lib/collaboration";
import { getFinalCompletionArchiveBlockers } from "@/lib/project-completion";
import { projectCollaboratorPermissionSelect } from "@/lib/project-collaborator-permissions";
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
  hasPermission,
  hasProjectPermission,
  isClientOfGtiUser,
  type PermissionUser,
} from "@/lib/permissions/resolver";
import {
  defaultProjectStatusGroupSlugs,
  getProjectStatusDisplay,
} from "@/lib/project-statuses";
import type {
  FluxAIDraftProject,
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
  createdById: true,
  completedAt: true,
  archivedAt: true,
  createdBy: {
    select: {
      name: true,
      email: true,
    },
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
      role: true,
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
  const mainExecutor =
    project.executors.find((executor) => executor.role === ProjectExecutorRole.MAIN_EXECUTOR) ??
    project.executors[0] ??
    null;

  return mainExecutor ? getDisplayName(mainExecutor.user) : "Not assigned";
}

function getVisibleOwnerName(user: PermissionUser, project: FluxProject) {
  if (canUseParticipantFilter(user, project) || project.createdById === user.id) {
    return getDisplayName(project.createdBy);
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
    category: project.category,
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
      includesSearchValue(getDisplayName(project.createdBy), searchValue)) ||
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
        /^(?:find|show|list|view|display|search|give)\s+(?:me\s+)?(?:the\s+)?/i,
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

async function getAccessibleFluxProjects(user: PermissionUser, limit = MAX_PROJECTS_FOR_FLUX_AI) {
  return withPrismaRetry(() =>
    prisma.project.findMany({
      where: getAccessibleProjectWhere(user),
      orderBy: [
        {
          updatedAt: "desc",
        },
        {
          createdAt: "desc",
        },
      ],
      take: limit,
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
  const projects = await getAccessibleFluxProjects(user);
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
          includesSearchValue(getDisplayName(project.createdBy), ownerName)
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
    .slice(0, resolveLimit(input.limit))
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
  const projects = await getAccessibleFluxProjects(user, 200);
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

function normalizeDraftDate(value: string | null | undefined) {
  const normalizedValue = normalizeDraftText(value);

  if (!normalizedValue) {
    return null;
  }

  const isoMatch = normalizedValue.match(/\b(\d{4}-\d{2}-\d{2})\b/);

  if (isoMatch?.[1]) {
    return isoMatch[1];
  }

  const parsedDate = new Date(normalizedValue);

  if (Number.isNaN(parsedDate.getTime())) {
    return normalizedValue;
  }

  return parsedDate.toISOString().slice(0, 10);
}

function inferProjectTimeline(message: string) {
  const rangeMatch = message.match(
    /\b(?:from|between)\s+(\d{4}-\d{2}-\d{2})\s+(?:to|and|-)\s+(\d{4}-\d{2}-\d{2})\b/i,
  );
  const startMatch = message.match(
    /\bstart(?:\s+date)?\s*(?:is|:)?\s*(\d{4}-\d{2}-\d{2})\b/i,
  );
  const endMatch = message.match(
    /\bend(?:\s+date)?\s*(?:is|:)?\s*(\d{4}-\d{2}-\d{2})\b/i,
  );

  return {
    startDate: normalizeDraftDate(startMatch?.[1] ?? rangeMatch?.[1]),
    endDate: normalizeDraftDate(endMatch?.[1] ?? rangeMatch?.[2]),
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
    typeLabel: collaborator.typeLabel,
  } satisfies FluxAIPersonCandidate;
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
    normalizeDraftDate(detectedDraft?.startDate) ??
    normalizeDraftDate(currentDraft?.startDate) ??
    inferredTimeline.startDate;
  const endDate =
    normalizeDraftDate(detectedDraft?.endDate) ??
    normalizeDraftDate(currentDraft?.endDate) ??
    inferredTimeline.endDate;
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
  if (!draftProject.startDate) addMissingField(missingFields, "Start Date");
  if (!draftProject.endDate) addMissingField(missingFields, "End Date");

  if (draftProject.mainExecutorMatch?.status === "missing") {
    addMissingField(missingFields, "Main Executor");
  } else if (draftProject.mainExecutorMatch?.status === "multiple") {
    addMissingField(missingFields, "Choose Main Executor");
    warnings.push(
      `Multiple collaborators matched "${draftProject.mainExecutorMatch.requestedName}". Choose one before creating.`,
    );
  } else if (draftProject.mainExecutorMatch?.status === "not_found") {
    addMissingField(missingFields, "Valid Main Executor");
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
