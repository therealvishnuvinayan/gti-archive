"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import {
  ProjectExecutorRole,
  ProjectStatus,
  type CollaboratorType,
} from "@prisma/client";

import type {
  ProjectFormFieldErrors,
  ProjectFormState,
} from "@/app/(dashboard)/projects/new/project-form-state";
import { requireUser } from "@/lib/auth";
import {
  notifyProjectAssignmentChanges,
  notifyProjectCreated,
  runNotificationTask,
} from "@/lib/notification-center";
import {
  getDefaultProjectCollaboratorParticipantType,
  getCollaboratorTypeGroup,
  isProjectCollaboratorParticipantType,
  type ProjectCollaboratorParticipantType,
} from "@/lib/project-collaborator-participant-types";
import { prisma } from "@/lib/prisma";
import { PROJECTS_CACHE_TAG } from "@/lib/projects";
import {
  hasPermission,
  hasProjectPermission,
} from "@/lib/permissions/resolver";
import {
  DEFAULT_PROJECT_PRIORITY,
  isProjectPriority,
} from "@/lib/project-priority";

function parseBudget(value: string) {
  const normalized = value.trim().replace(/,/g, "");

  if (!normalized || !/^\d+$/.test(normalized)) {
    return NaN;
  }

  const parsed = Number.parseInt(normalized, 10);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function formatBudgetValue(value: number, currencyCode: string) {
  const formattedNumber = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);

  return `${formattedNumber} ${currencyCode}`.trim();
}

function validateBudgetAllocation(input: {
  projectBudget: number;
  stageBudgetInputs: string[];
  currencyCode: string;
  requireBudget: boolean;
}) {
  if (!input.requireBudget) {
    return null;
  }

  const stageBudgets = input.stageBudgetInputs.map((value) => parseBudget(value));
  const hasInvalidStageBudget = stageBudgets.some(
    (budget) => !Number.isFinite(budget) || budget < 0,
  );

  if (hasInvalidStageBudget || !Number.isFinite(input.projectBudget) || input.projectBudget < 0) {
    return null;
  }

  const totalStageBudget = stageBudgets.reduce((sum, budget) => sum + budget, 0);

  if (totalStageBudget === input.projectBudget) {
    return null;
  }

  const difference = Math.abs(totalStageBudget - input.projectBudget);
  const mismatchLabel =
    totalStageBudget > input.projectBudget ? "over budget" : "unallocated";
  const mismatchDescription =
    totalStageBudget > input.projectBudget
      ? "stage budgets add up to"
      : "stage budgets only add up to";

  return {
    error: `Stage budgets must equal the total project budget. Total project budget is ${formatBudgetValue(
      input.projectBudget,
      input.currencyCode,
    )}, but ${mismatchDescription} ${formatBudgetValue(
      totalStageBudget,
      input.currencyCode,
    )}.`,
    fieldErrors: {
      budgetSummary: `Total stage budgets are ${formatBudgetValue(
        difference,
        input.currencyCode,
      )} ${mismatchLabel}.`,
      budget: `Project budget is ${formatBudgetValue(
        input.projectBudget,
        input.currencyCode,
      )}, but stages total ${formatBudgetValue(totalStageBudget, input.currencyCode)}.`,
      stageBudgets: input.stageBudgetInputs.map((value) => {
        const budget = parseBudget(value);
        return Number.isFinite(budget) ? "Included in an over-budget stage total." : undefined;
      }),
    } satisfies ProjectFormFieldErrors,
  };
}

function isProjectStatus(value: string): value is ProjectStatus {
  return Object.values(ProjectStatus).includes(value as ProjectStatus);
}

function isProjectExecutorRole(value: string): value is ProjectExecutorRole {
  return Object.values(ProjectExecutorRole).includes(value as ProjectExecutorRole);
}

function getInitialStageStatuses(
  projectStatus: ProjectStatus,
  stageCount: number,
) {
  if (projectStatus === ProjectStatus.COMPLETED) {
    return Array.from({ length: stageCount }, () => ProjectStatus.COMPLETED);
  }

  if (projectStatus === ProjectStatus.PENDING) {
    return Array.from({ length: stageCount }, () => ProjectStatus.PENDING);
  }

  return Array.from({ length: stageCount }, (_, index) =>
    index === 0 ? projectStatus : ProjectStatus.PENDING,
  );
}

function getStartOfDay(date: Date) {
  const normalizedDate = new Date(date);
  normalizedDate.setHours(0, 0, 0, 0);
  return normalizedDate;
}

function getEndOfDay(date: Date) {
  const normalizedDate = new Date(date);
  normalizedDate.setHours(23, 59, 59, 999);
  return normalizedDate;
}

function parseProjectFormData(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const executorName = String(formData.get("executorName") ?? "").trim();
  const executorUserId = String(formData.get("executorUserId") ?? "").trim();
  const tag = String(formData.get("tag") ?? "").trim();
  const priorityInput = String(formData.get("priority") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const budgetInput = String(formData.get("budget") ?? "").trim();
  const currencyInput = String(formData.get("currency") ?? "").trim().toUpperCase();
  const statusInput = String(formData.get("status") ?? "").trim();
  const startDateInput = String(formData.get("startDate") ?? "").trim();
  const endDateInput = String(formData.get("endDate") ?? "").trim();
  const stageNames = formData
    .getAll("stageNames")
    .map((value) => String(value).trim());
  const stageBudgets = formData
    .getAll("stageBudgets")
    .map((value) => String(value).trim());
  const stageDescriptions = formData
    .getAll("stageDescriptions")
    .map((value) => String(value).trim());
  const stageStartDates = formData
    .getAll("stageStartDates")
    .map((value) => String(value).trim());
  const stageDueDates = formData
    .getAll("stageDueDates")
    .map((value) => String(value).trim());
  const stageInvoiceRequired = formData
    .getAll("stageInvoiceRequired")
    .map((value) => String(value).trim() !== "false");
  const stageIds = formData
    .getAll("stageIds")
    .map((value) => String(value).trim());
  const executorIds = formData
    .getAll("executorIds")
    .map((value) => String(value).trim());
  const executorRoles = formData
    .getAll("executorRoles")
    .map((value) => String(value).trim());
  const collaboratorIds = [...new Set(
    formData
      .getAll("collaboratorIds")
      .map((value) => String(value).trim())
      .filter(Boolean),
  )];
  const collaboratorParticipantTypes = formData
    .getAll("collaboratorParticipantTypes")
    .map((value) => String(value).trim());

  return {
    name,
    category,
    executorName,
    executorUserId,
    tag,
    priorityInput,
    description,
    budgetInput,
    currencyInput,
    statusInput,
    startDateInput,
    endDateInput,
    stageNames,
    stageBudgets,
    stageDescriptions,
    stageStartDates,
    stageDueDates,
    stageInvoiceRequired,
    stageIds,
    executorIds,
    executorRoles,
    collaboratorIds,
    collaboratorParticipantTypes,
  };
}

function normalizeProjectExecutorAssignments(
  parsed: ReturnType<typeof parseProjectFormData>,
) {
  const assignmentMap = new Map<string, { userId: string; role: ProjectExecutorRole }>();
  let hasInvalidRole = false;

  parsed.executorIds.forEach((executorId, index) => {
    if (!executorId) {
      return;
    }

    const roleInput = parsed.executorRoles[index] ?? "";

    if (!isProjectExecutorRole(roleInput)) {
      hasInvalidRole = true;
      return;
    }

    assignmentMap.set(executorId, {
      userId: executorId,
      role: roleInput,
    });
  });

  if (assignmentMap.size === 0 && parsed.executorUserId) {
    assignmentMap.set(parsed.executorUserId, {
      userId: parsed.executorUserId,
      role: ProjectExecutorRole.MAIN_EXECUTOR,
    });
  }

  const assignments = [...assignmentMap.values()];
  const hasMainExecutor = assignments.some(
    (assignment) => assignment.role === ProjectExecutorRole.MAIN_EXECUTOR,
  );

  if (hasInvalidRole) {
    return {
      error: "Choose a valid executor role.",
    };
  }

  if (!hasMainExecutor) {
    return {
      error: "Add at least one Main Executor.",
    };
  }

  return {
    assignments,
  };
}

function validateStageTimeline(
  parsed: ReturnType<typeof parseProjectFormData>,
  projectStartDate: Date,
  projectEndDate: Date,
) {
  const stageStartDateErrors: Array<string | undefined> = Array.from(
    { length: parsed.stageNames.length },
    () => undefined,
  );
  const stageDueDateErrors: Array<string | undefined> = Array.from(
    { length: parsed.stageNames.length },
    () => undefined,
  );
  const projectStartBoundary = getStartOfDay(projectStartDate);
  const projectEndBoundary = getEndOfDay(projectEndDate);
  const validRanges = new Map<number, { start: Date; due: Date }>();

  parsed.stageNames.forEach((_, index) => {
    const stageStartInput = parsed.stageStartDates[index] ?? "";
    const stageDueInput = parsed.stageDueDates[index] ?? "";
    const stageStart = stageStartInput ? new Date(stageStartInput) : null;
    const stageDue = stageDueInput ? new Date(stageDueInput) : null;

    if (!stageStartInput) {
      stageStartDateErrors[index] = "Stage start is required.";
    } else if (!stageStart || Number.isNaN(stageStart.getTime())) {
      stageStartDateErrors[index] = "Choose a valid stage start.";
    }

    if (!stageDueInput) {
      stageDueDateErrors[index] = "Stage due is required.";
    } else if (!stageDue || Number.isNaN(stageDue.getTime())) {
      stageDueDateErrors[index] = "Choose a valid stage due time.";
    }

    if (
      !stageStart ||
      !stageDue ||
      Number.isNaN(stageStart.getTime()) ||
      Number.isNaN(stageDue.getTime())
    ) {
      return;
    }

    if (stageStart < projectStartBoundary || stageStart > projectEndBoundary) {
      stageStartDateErrors[index] = "Stage start must be within the project date range.";
    }

    if (stageDue < projectStartBoundary || stageDue > projectEndBoundary) {
      stageDueDateErrors[index] = "Stage due must be within the project date range.";
    }

    if (stageDue <= stageStart) {
      stageDueDateErrors[index] = "Stage due must be after the stage start.";
    }

    if (!stageStartDateErrors[index] && !stageDueDateErrors[index]) {
      validRanges.set(index, {
        start: stageStart,
        due: stageDue,
      });
    }
  });

  for (let index = 1; index < parsed.stageNames.length; index += 1) {
    const previousRange = validRanges.get(index - 1);
    const currentRange = validRanges.get(index);

    if (!previousRange || !currentRange) {
      continue;
    }

    if (currentRange.start < previousRange.due) {
      stageStartDateErrors[index] = `Stage ${index + 1} cannot start before Stage ${index} ends.`;
      validRanges.delete(index);
    }
  }

  return {
    stageStartDateErrors,
    stageDueDateErrors,
    hasErrors: stageStartDateErrors.some(Boolean) || stageDueDateErrors.some(Boolean),
  };
}

function validateProjectFormData(
  parsed: ReturnType<typeof parseProjectFormData>,
  options: { requireBudget?: boolean } = {},
) {
  const requireBudget = options.requireBudget ?? true;
  const fieldErrors: ProjectFormFieldErrors = {};
  const executorValidation = normalizeProjectExecutorAssignments(parsed);

  if (!parsed.name) fieldErrors.name = "Project name is required.";
  if (!parsed.category) fieldErrors.category = "Project category is required.";
  if ("error" in executorValidation) {
    fieldErrors.executorUserId = executorValidation.error;
  }
  if (!parsed.description) fieldErrors.description = "Project brief is required.";
  if (requireBudget && !parsed.budgetInput) fieldErrors.budget = "Project budget is required.";
  if (requireBudget && !parsed.currencyInput) fieldErrors.currency = "Project currency is required.";
  if (!parsed.statusInput) fieldErrors.status = "Project status is required.";
  if (!parsed.startDateInput) fieldErrors.startDate = "Project start date is required.";
  if (!parsed.endDateInput) fieldErrors.endDate = "Project end date is required.";

  if (Object.keys(fieldErrors).length > 0) {
    return { error: "Please fill the required fields.", fieldErrors };
  }

  const executorAssignments =
    "assignments" in executorValidation ? executorValidation.assignments : [];
  const budget = parseBudget(parsed.budgetInput);
  const status = isProjectStatus(parsed.statusInput) ? parsed.statusInput : null;
  const priority = parsed.priorityInput
    ? isProjectPriority(parsed.priorityInput)
      ? parsed.priorityInput
      : null
    : DEFAULT_PROJECT_PRIORITY;
  const startDate = new Date(parsed.startDateInput);
  const endDate = new Date(parsed.endDateInput);

  if (requireBudget && (!Number.isFinite(budget) || budget <= 0)) {
    return {
      error: "Please correct the highlighted fields.",
      fieldErrors: { budget: "Enter a valid project budget." },
    };
  }

  if (!status) {
    return {
      error: "Please correct the highlighted fields.",
      fieldErrors: { status: "Choose a valid project status." },
    };
  }

  if (!priority) {
    return {
      error: "Please correct the highlighted fields.",
      fieldErrors: { priority: "Choose a valid project priority." },
    };
  }

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return {
      error: "Please correct the highlighted fields.",
      fieldErrors: {
        startDate: "Choose a valid start date.",
        endDate: "Choose a valid end date.",
      },
    };
  }

  if (getStartOfDay(endDate) <= getStartOfDay(startDate)) {
    return {
      error: "Please correct the highlighted fields.",
      fieldErrors: { endDate: "Project end date must be after the start date." },
    };
  }

  if (parsed.stageNames.length === 0) {
    return {
      error: "Please add at least one stage.",
      fieldErrors: {
        stageNames: [...["Stage name is required."]],
        stageBudgets: [...["Stage budget is required."]],
        stageDescriptions: [...["Stage brief is required."]],
        stageStartDates: [...["Stage start is required."]],
        stageDueDates: [...["Stage due is required."]],
      },
    };
  }

  const stageNameErrors: Array<string | undefined> = parsed.stageNames.map((value) =>
    value ? undefined : "Stage name is required.",
  );
  const stageBudgetErrors: Array<string | undefined> = parsed.stageBudgets.map((value) => {
    if (!requireBudget) {
      return undefined;
    }

    const budget = parseBudget(value);
    return Number.isFinite(budget) && budget > 0 ? undefined : "Enter a valid stage budget.";
  });
  const stageDescriptionErrors: Array<string | undefined> = parsed.stageDescriptions.map((value) =>
    value ? undefined : "Stage brief is required.",
  );
  const stageTimelineValidation = validateStageTimeline(parsed, startDate, endDate);
  const stageStartDateErrors = stageTimelineValidation.stageStartDateErrors;
  const stageDueDateErrors = stageTimelineValidation.stageDueDateErrors;

  if (
    stageNameErrors.some(Boolean) ||
    stageBudgetErrors.some(Boolean) ||
    stageDescriptionErrors.some(Boolean) ||
    stageStartDateErrors.some(Boolean) ||
    stageDueDateErrors.some(Boolean)
  ) {
    return {
      error: stageTimelineValidation.hasErrors
        ? "Please review the highlighted stage timeline fields."
        : "Please correct the highlighted stage fields.",
      fieldErrors: {
        stageNames: stageNameErrors,
        stageBudgets: stageBudgetErrors,
        stageDescriptions: stageDescriptionErrors,
        stageStartDates: stageStartDateErrors,
        stageDueDates: stageDueDateErrors,
      },
    };
  }

  const budgetConflict = validateBudgetAllocation({
    projectBudget: budget,
    stageBudgetInputs: parsed.stageBudgets,
    currencyCode: parsed.currencyInput || "—",
    requireBudget,
  });

  if (budgetConflict) {
    return budgetConflict;
  }

  return {
    data: {
      ...parsed,
      executorAssignments,
      budget,
      currency: parsed.currencyInput,
      status,
      priority,
      startDate,
      endDate,
      stageStartDates: parsed.stageStartDates.map((value) => new Date(value)),
      stageDueDates: parsed.stageDueDates.map((value) => new Date(value)),
      stageStatuses: getInitialStageStatuses(status, parsed.stageNames.length),
      currentStageName: parsed.stageNames[0] || "Stage 1",
    },
  };
}

async function resolveProjectCurrencyCode(
  currencyCode: string,
  options: { allowInactiveCode?: string } = {},
) {
  const normalizedCode = currencyCode.trim().toUpperCase();

  if (!normalizedCode) {
    return null;
  }

  const currency = await prisma.projectCurrency.findFirst({
    where: {
      code: normalizedCode,
      OR:
        options.allowInactiveCode &&
        normalizedCode === options.allowInactiveCode.trim().toUpperCase()
          ? [{ isActive: true }, { code: normalizedCode }]
          : [{ isActive: true }],
    },
    select: {
      code: true,
    },
  });

  return currency?.code ?? null;
}

type ResolvedProjectExecutor = {
  userId: string;
  name: string;
  role: ProjectExecutorRole;
  collaboratorType: CollaboratorType;
};

async function resolveProjectExecutors(
  executorAssignments: Array<{ userId: string; role: ProjectExecutorRole }> | undefined,
) {
  const normalizedExecutorAssignments = executorAssignments ?? [];
  const executorIds = normalizedExecutorAssignments.map((assignment) => assignment.userId);
  const executorUsers = executorIds.length
    ? await prisma.user.findMany({
        where: {
          id: {
            in: executorIds,
          },
        },
        select: {
          id: true,
          name: true,
          email: true,
          collaboratorType: true,
        },
      })
    : [];
  const executorUserMap = new Map(
    executorUsers.map((executorUser) => [executorUser.id, executorUser] as const),
  );

  if (executorUsers.length !== executorIds.length) {
    return null;
  }

  const executors = normalizedExecutorAssignments.map<ResolvedProjectExecutor | null>((assignment) => {
    const executorUser = executorUserMap.get(assignment.userId);

    if (!executorUser) {
      return null;
    }

    return {
      userId: executorUser.id,
      name: executorUser.name?.trim() || executorUser.email,
      role: assignment.role,
      collaboratorType: executorUser.collaboratorType,
    };
  });

  if (executors.some((executor) => executor === null)) {
    return null;
  }

  const resolvedExecutors = executors.filter(
    (executor): executor is ResolvedProjectExecutor => executor !== null,
  );
  const legacyExecutor =
    resolvedExecutors.find(
      (executor) => executor.role === ProjectExecutorRole.MAIN_EXECUTOR,
    ) ?? resolvedExecutors[0];

  if (!legacyExecutor) {
    return null;
  }

  return {
    executors: resolvedExecutors,
    executorUserId: legacyExecutor.userId,
    executorName: legacyExecutor.name,
  };
}

function stageHasLinkedHistory(stage: {
  actualStartedAt: Date | null;
  startedById: string | null;
  completedAt: Date | null;
  status: ProjectStatus;
  _count: {
    comments: number;
    revisions: number;
    attachments: number;
    comparisonComments: number;
    archives: number;
    activityLogs: number;
  };
}) {
  return (
    Boolean(stage.actualStartedAt || stage.startedById || stage.completedAt) ||
    stage.status !== ProjectStatus.PENDING ||
    stage._count.comments > 0 ||
    stage._count.revisions > 0 ||
    stage._count.attachments > 0 ||
    stage._count.comparisonComments > 0 ||
    stage._count.archives > 0 ||
    stage._count.activityLogs > 0
  );
}

export async function createProjectAction(
  _previousState: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  const user = await requireUser();

  if (!hasPermission(user, "project.create")) {
    return { error: "You are not allowed to create projects." };
  }

  const validated = validateProjectFormData(parseProjectFormData(formData), {
    requireBudget: true,
  });

  if ("error" in validated) {
    return validated;
  }

  const {
    name,
    category,
    executorAssignments,
    tag,
    description,
    budget,
    currency,
    status,
    priority,
    startDate,
    endDate,
    stageNames,
    stageBudgets,
    stageDescriptions,
    stageStartDates,
    stageDueDates,
    stageInvoiceRequired,
    stageStatuses,
    currentStageName,
    collaboratorIds,
    collaboratorParticipantTypes,
  } = validated.data;

  const currencyCode = await resolveProjectCurrencyCode(currency);

  if (!currencyCode) {
    return {
      error: "Please correct the highlighted fields.",
      fieldErrors: { currency: "Choose a valid project currency." },
    };
  }

  const resolvedExecutors = await resolveProjectExecutors(executorAssignments);

  if (!resolvedExecutors) {
    return {
      error: "Please correct the highlighted fields.",
      fieldErrors: { executorUserId: "Choose valid project executors." },
    };
  }

  const assignedCollaboratorIds = [
    ...new Set(
      [
        ...collaboratorIds,
        ...resolvedExecutors.executors.map((executor) => executor.userId),
      ].filter(
        (collaboratorId): collaboratorId is string =>
          Boolean(collaboratorId) && collaboratorId !== user.id,
      ),
    ),
  ];

  const validCollaborators = assignedCollaboratorIds.length
    ? await prisma.user.findMany({
        where: {
          id: {
            in: assignedCollaboratorIds,
          },
        },
        select: {
          id: true,
          collaboratorType: true,
        },
      })
    : [];
  const validCollaboratorIds = validCollaborators.map((collaborator) => collaborator.id);
  const validCollaboratorTypeMap = new Map(
    validCollaborators.map((collaborator) => [
      collaborator.id,
      getCollaboratorTypeGroup(collaborator.collaboratorType),
    ] as const),
  );
  const collaboratorParticipantTypeMap = new Map<
    string,
    ProjectCollaboratorParticipantType | null
  >(
    collaboratorIds.map((collaboratorId, index) => {
      const participantType = collaboratorParticipantTypes[index] ?? "";
      return [
        collaboratorId,
        isProjectCollaboratorParticipantType(participantType) ? participantType : null,
      ];
    }),
  );

  let projectId: string;
  let createdStageIds: string[] = [];
  let initialBriefStageId: string | undefined;
  let initialBriefCommentId: string | undefined;

  try {
    const project = await prisma.$transaction(async (tx) => {
      const createdProject = await tx.project.create({
        data: {
          name,
          category,
          executorName: resolvedExecutors.executorName,
          executorUserId: resolvedExecutors.executorUserId,
          tag: tag || null,
          description,
          budget,
          currency: currencyCode,
          status,
          priority,
          startDate,
          endDate,
          currentStageName,
          stageCount: stageNames.length,
          createdById: user.id,
          executors: {
            createMany: {
              data: resolvedExecutors.executors.map((executor) => ({
                userId: executor.userId,
                role: executor.role,
                addedById: user.id,
              })),
              skipDuplicates: true,
            },
          },
          collaborators: {
            createMany: {
                data: validCollaboratorIds.map((collaboratorId) => ({
                  userId: collaboratorId,
                  addedById: user.id,
                  participantType:
                    collaboratorParticipantTypeMap.get(collaboratorId) ??
                    getDefaultProjectCollaboratorParticipantType(
                      validCollaboratorTypeMap.get(collaboratorId) ?? "external",
                    ),
                })),
              skipDuplicates: true,
            },
          },
          stages: {
            create: stageNames.map((stageName, index) => {
              const parsedStageBudget = parseBudget(stageBudgets[index] ?? "");

              return {
                name: stageName,
                description: stageDescriptions[index] || null,
                budget:
                  Number.isFinite(parsedStageBudget) && parsedStageBudget > 0
                    ? parsedStageBudget
                    : index === 0
                      ? budget
                      : null,
                plannedStartAt: stageStartDates[index],
                plannedDueAt: stageDueDates[index],
                invoiceRequired: stageInvoiceRequired[index] ?? true,
                status: stageStatuses[index],
                order: index + 1,
              };
            }),
          },
        },
        select: {
          id: true,
          stages: {
            orderBy: {
              order: "asc",
            },
            select: {
              id: true,
            },
          },
        },
      });

      const firstStageId = createdProject.stages[0]?.id;
      let initialCommentId: string | undefined;

      if (firstStageId) {
        const firstStageBrief = stageDescriptions[0]?.trim() ?? "";
        const initialBriefBody = [
          `Project Brief:\n${description}`,
          firstStageBrief ? `Stage Brief:\n${firstStageBrief}` : null,
        ]
          .filter(Boolean)
          .join("\n\n");
        const initialComment = await tx.projectComment.create({
          data: {
            projectId: createdProject.id,
            stageId: firstStageId,
            authorId: user.id,
            body: initialBriefBody,
          },
          select: {
            id: true,
          },
        });

        initialCommentId = initialComment.id;
      }

      return {
        id: createdProject.id,
        stages: createdProject.stages,
        initialCommentId,
      };
    });
    projectId = project.id;
    createdStageIds = project.stages.map((stage) => stage.id);
    initialBriefStageId = project.stages[0]?.id;
    initialBriefCommentId = project.initialCommentId;
  } catch {
    return { error: "Unable to create the project right now. Please try again." };
  }

  revalidatePath("/");
  revalidatePath("/projects");
  revalidatePath(`/projects/${projectId}`);
  revalidateTag(PROJECTS_CACHE_TAG, "max");

  await runNotificationTask("project-created", () =>
    notifyProjectCreated({
      projectId,
      actorId: user.id,
    }),
  );

  return { projectId, createdStageIds, initialBriefStageId, initialBriefCommentId };
}

export async function updateProjectAction(
  _previousState: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  const user = await requireUser();

  const projectId = String(formData.get("projectId") ?? "").trim();

  if (!projectId) {
    return { error: "Project id is missing." };
  }

  const existingProject = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      currency: true,
      budget: true,
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
          participantType: true,
        },
      },
      stages: {
        orderBy: {
          order: "asc",
        },
        select: {
          id: true,
          budget: true,
          status: true,
          invoiceRequired: true,
          actualStartedAt: true,
          startedById: true,
          completedAt: true,
          _count: {
            select: {
              comments: true,
              revisions: true,
              attachments: true,
              comparisonComments: true,
              archives: true,
              activityLogs: true,
            },
          },
        },
      },
    },
  });

  if (!existingProject) {
    return { error: "Project not found." };
  }

  if (!hasProjectPermission(user, existingProject, "project.update")) {
    return { error: "You are not allowed to edit projects." };
  }

  if (existingProject.status === ProjectStatus.COMPLETED) {
    return { error: "Completed projects cannot be edited." };
  }

  const canUpdateBudget = hasProjectPermission(
    user,
    existingProject,
    "project.updateBudget",
  );
  const validated = validateProjectFormData(parseProjectFormData(formData), {
    requireBudget: canUpdateBudget,
  });

  if ("error" in validated) {
    return validated;
  }

  const {
    name,
    category,
    executorAssignments,
    tag,
    description,
    budget,
    currency,
    status,
    priority,
    startDate,
    endDate,
    stageNames,
    stageBudgets,
    stageDescriptions,
    stageStartDates,
    stageDueDates,
    stageInvoiceRequired,
    stageStatuses,
    stageIds,
    currentStageName,
    collaboratorIds,
    collaboratorParticipantTypes,
  } = validated.data;

  const currencyCode = canUpdateBudget
    ? await resolveProjectCurrencyCode(currency, {
        allowInactiveCode: existingProject.currency,
      })
    : existingProject.currency;

  if (!currencyCode) {
    return {
      error: "Please correct the highlighted fields.",
      fieldErrors: { currency: "Choose a valid project currency." },
    };
  }

  const resolvedExecutors = await resolveProjectExecutors(executorAssignments);

  if (!resolvedExecutors) {
    return {
      error: "Please correct the highlighted fields.",
      fieldErrors: { executorUserId: "Choose valid project executors." },
    };
  }

  const assignedCollaboratorIds = [
    ...new Set(
      [
        ...collaboratorIds,
        ...resolvedExecutors.executors.map((executor) => executor.userId),
      ].filter(
        (collaboratorId): collaboratorId is string =>
          Boolean(collaboratorId) && collaboratorId !== existingProject.createdById,
      ),
    ),
  ];

  const validCollaborators = assignedCollaboratorIds.length
    ? await prisma.user.findMany({
        where: {
          id: {
            in: assignedCollaboratorIds,
          },
        },
        select: {
          id: true,
          collaboratorType: true,
        },
      })
    : [];
  const validCollaboratorIds = validCollaborators.map((collaborator) => collaborator.id);
  const existingCollaboratorIds = existingProject.collaborators.map(
    (collaborator) => collaborator.userId,
  );
  const existingCollaboratorParticipantTypeMap = new Map(
    existingProject.collaborators.map((collaborator) => [
      collaborator.userId,
      collaborator.participantType as ProjectCollaboratorParticipantType | null,
    ]),
  );
  const addedCollaboratorIds = validCollaboratorIds.filter(
    (collaboratorId) => !existingCollaboratorIds.includes(collaboratorId),
  );
  const removedCollaboratorIds = existingCollaboratorIds.filter(
    (collaboratorId) => !validCollaboratorIds.includes(collaboratorId),
  );
  const validCollaboratorTypeMap = new Map(
    validCollaborators.map((collaborator) => [
      collaborator.id,
      getCollaboratorTypeGroup(collaborator.collaboratorType),
    ] as const),
  );
  const collaboratorParticipantTypeMap = new Map<
    string,
    ProjectCollaboratorParticipantType | null
  >(
    collaboratorIds.map((collaboratorId, index) => {
      const participantType = collaboratorParticipantTypes[index] ?? "";
      return [
        collaboratorId,
        isProjectCollaboratorParticipantType(participantType) ? participantType : null,
      ];
    }),
  );

  const existingStageById = new Map(
    existingProject.stages.map((stage) => [stage.id, stage] as const),
  );
  const submittedExistingStageIds = stageIds.filter(Boolean);
  const submittedExistingStageIdSet = new Set(submittedExistingStageIds);
  const projectStatusChanged = existingProject.status !== status;

  if (submittedExistingStageIdSet.size !== submittedExistingStageIds.length) {
    return { error: "Unable to update project stages. Please refresh and try again." };
  }

  if (submittedExistingStageIds.some((stageId) => !existingStageById.has(stageId))) {
    return { error: "Unable to update project stages. Please refresh and try again." };
  }

  const removedStages = existingProject.stages.filter(
    (stage) => !submittedExistingStageIdSet.has(stage.id),
  );

  if (removedStages.some(stageHasLinkedHistory)) {
    return {
      error:
        "This stage cannot be removed because it already has chat, submissions, or files.",
    };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.project.update({
        where: { id: projectId },
        data: {
          name,
          category,
          executorName: resolvedExecutors.executorName,
          executorUserId: resolvedExecutors.executorUserId,
          tag: tag || null,
          description,
          budget: canUpdateBudget ? budget : existingProject.budget,
          currency: currencyCode,
          status,
          priority,
          startDate,
          endDate,
          currentStageName,
          stageCount: stageNames.length,
        },
      });

      if (removedCollaboratorIds.length > 0) {
        await tx.projectCollaborator.deleteMany({
          where: {
            projectId,
            userId: {
              in: removedCollaboratorIds,
            },
          },
        });
      }

      for (const collaboratorId of validCollaboratorIds) {
        const participantType =
          collaboratorParticipantTypeMap.get(collaboratorId) ??
          existingCollaboratorParticipantTypeMap.get(collaboratorId) ??
          getDefaultProjectCollaboratorParticipantType(
            validCollaboratorTypeMap.get(collaboratorId) ?? "external",
          );

        await tx.projectCollaborator.upsert({
          where: {
            projectId_userId: {
              projectId,
              userId: collaboratorId,
            },
          },
          update: {
            participantType,
          },
          create: {
            projectId,
            userId: collaboratorId,
            addedById: user.id,
            participantType,
          },
        });
      }

      const nextExecutorMap = new Map(
        resolvedExecutors.executors.map((executor) => [executor.userId, executor] as const),
      );
      const existingExecutorMap = new Map(
        existingProject.executors.map((executor) => [executor.userId, executor] as const),
      );
      const executorIdsToDelete = existingProject.executors
        .map((executor) => executor.userId)
        .filter((executorId) => !nextExecutorMap.has(executorId));

      if (executorIdsToDelete.length > 0) {
        await tx.projectExecutor.deleteMany({
          where: {
            projectId,
            userId: {
              in: executorIdsToDelete,
            },
          },
        });
      }

      for (const executor of resolvedExecutors.executors) {
        const existingExecutor = existingExecutorMap.get(executor.userId);

        if (!existingExecutor) {
          await tx.projectExecutor.create({
            data: {
              projectId,
              userId: executor.userId,
              role: executor.role,
              addedById: user.id,
            },
          });
          continue;
        }

        if (existingExecutor.role !== executor.role) {
          await tx.projectExecutor.update({
            where: {
              projectId_userId: {
                projectId,
                userId: executor.userId,
              },
            },
            data: {
              role: executor.role,
            },
          });
        }
      }

      if (removedStages.length > 0) {
        await tx.projectStage.deleteMany({
          where: {
            projectId,
            id: {
              in: removedStages.map((stage) => stage.id),
            },
          },
        });
      }

      for (const [index, stageName] of stageNames.entries()) {
        const stageId = stageIds[index]?.trim() ?? "";
        const existingStage = stageId ? existingStageById.get(stageId) : null;
        const parsedStageBudget = parseBudget(stageBudgets[index] ?? "");
        const nextBudget = canUpdateBudget
          ? Number.isFinite(parsedStageBudget) && parsedStageBudget > 0
            ? parsedStageBudget
            : index === 0
              ? budget
              : null
          : existingStage?.budget ?? null;
        const stageData = {
          name: stageName,
          description: stageDescriptions[index] || null,
          budget: nextBudget,
          plannedStartAt: stageStartDates[index],
          plannedDueAt: stageDueDates[index],
          invoiceRequired: stageInvoiceRequired[index] ?? existingStage?.invoiceRequired ?? true,
          order: index + 1,
          ...(projectStatusChanged
            ? { status: stageStatuses[index] ?? ProjectStatus.PENDING }
            : {}),
        };

        if (existingStage) {
          await tx.projectStage.update({
            where: { id: existingStage.id },
            data: stageData,
          });
          continue;
        }

        await tx.projectStage.create({
          data: {
            ...stageData,
            projectId,
            status: stageStatuses[index] ?? ProjectStatus.PENDING,
          },
        });
      }
    });
  } catch {
    return { error: "Unable to update the project right now. Please try again." };
  }

  const updatedStages = await prisma.projectStage.findMany({
    where: {
      projectId,
    },
    orderBy: {
      order: "asc",
    },
    select: {
      id: true,
    },
  });

  revalidatePath("/");
  revalidatePath("/projects");
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/edit`);
  revalidateTag(PROJECTS_CACHE_TAG, "max");

  await runNotificationTask("project-updated", () =>
    notifyProjectAssignmentChanges({
      projectId,
      actorId: user.id,
      previousExecutorUserId: existingProject.executorUserId,
      nextExecutorUserId: resolvedExecutors.executorUserId,
      addedCollaboratorIds,
      removedCollaboratorIds,
    }),
  );

  return { projectId, createdStageIds: updatedStages.map((stage) => stage.id) };
}

export async function deleteProjectAction(projectId: string) {
  const user = await requireUser();
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      status: true,
      createdById: true,
      executorUserId: true,
      collaborators: {
        select: {
          userId: true,
        },
      },
    },
  });

  if (!project) {
    throw new Error("Project not found.");
  }

  if (!hasProjectPermission(user, project, "project.delete")) {
    throw new Error("You are not allowed to delete projects.");
  }

  if (project.status === ProjectStatus.COMPLETED) {
    throw new Error("Completed projects cannot be deleted.");
  }

  await prisma.project.delete({
    where: { id: projectId },
  });

  revalidatePath("/");
  revalidatePath("/projects");
  revalidatePath(`/projects/${projectId}`);
  revalidateTag(PROJECTS_CACHE_TAG, "max");
}
