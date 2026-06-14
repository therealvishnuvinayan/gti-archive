"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import {
  AttachmentAssetType,
  AttachmentStatus,
  ProjectCompletionStepStatus,
  ProjectExecutionType,
  ProjectExecutorRole,
  StageStatus,
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
import { MAX_PROJECT_TAGS, PROJECTS_CACHE_TAG } from "@/lib/projects";
import {
  hasPermission,
  hasProjectPermission,
} from "@/lib/permissions/resolver";
import {
  DEFAULT_PROJECT_PRIORITY,
  isProjectPriority,
} from "@/lib/project-priority";
import {
  defaultProjectStatusGroupSlugs,
  isProjectStatusCompleted,
} from "@/lib/project-statuses";

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

function isProjectExecutionType(value: string): value is ProjectExecutionType {
  return Object.values(ProjectExecutionType).includes(value as ProjectExecutionType);
}

function isProjectExecutorRole(value: string): value is ProjectExecutorRole {
  return Object.values(ProjectExecutorRole).includes(value as ProjectExecutorRole);
}

function getInitialStageStatuses(
  projectStatusGroupSlug: string | null | undefined,
  stageCount: number,
) {
  const normalizedGroupSlug = projectStatusGroupSlug ?? "";

  if (
    normalizedGroupSlug === defaultProjectStatusGroupSlugs.completed ||
    normalizedGroupSlug === defaultProjectStatusGroupSlugs.archived
  ) {
    return Array.from({ length: stageCount }, () => StageStatus.COMPLETED);
  }

  if (normalizedGroupSlug === defaultProjectStatusGroupSlugs.pending) {
    return Array.from({ length: stageCount }, () => StageStatus.PENDING);
  }

  if (
    normalizedGroupSlug === defaultProjectStatusGroupSlugs.onHold ||
    normalizedGroupSlug === defaultProjectStatusGroupSlugs.cancelled
  ) {
    return Array.from({ length: stageCount }, (_, index) =>
      index === 0 ? StageStatus.ON_HOLD : StageStatus.PENDING,
    );
  }

  return Array.from({ length: stageCount }, (_, index) =>
    index === 0 ? StageStatus.ONGOING : StageStatus.PENDING,
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
  const tags = formData
    .getAll("tags")
    .map((value) => String(value).trim())
    .filter(Boolean);
  const priorityInput = String(formData.get("priority") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const executionTypeInput = String(formData.get("executionType") ?? "").trim();
  const budgetInput = String(formData.get("budget") ?? "").trim();
  const currencyInput = String(formData.get("currency") ?? "").trim().toUpperCase();
  const statusId = String(formData.get("statusId") ?? "").trim();
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
  const projectAttachmentIds = [
    ...new Set(
      formData
        .getAll("projectAttachmentIds")
        .map((value) => String(value).trim())
        .filter(Boolean),
    ),
  ];
  const stageAttachmentIds = formData
    .getAll("stageAttachmentIds")
    .map((value) => String(value).trim())
    .filter(Boolean);

  return {
    name,
    category,
    executorName,
    executorUserId,
    tags,
    priorityInput,
    description,
    executionTypeInput,
    budgetInput,
    currencyInput,
    statusId,
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
    projectAttachmentIds,
    stageAttachmentIds,
  };
}

async function validateSubmittedProjectAttachments(input: {
  projectId: string;
  projectAttachmentIds: string[];
  stageAttachmentIds: string[];
}) {
  const submittedIds = [
    ...new Set([...input.projectAttachmentIds, ...input.stageAttachmentIds]),
  ];

  if (submittedIds.length === 0) {
    return null;
  }

  const attachments = await prisma.projectAttachment.findMany({
    where: {
      id: {
        in: submittedIds,
      },
    },
    select: {
      id: true,
      projectId: true,
      stageId: true,
      assetType: true,
      status: true,
    },
  });
  const attachmentById = new Map(attachments.map((attachment) => [attachment.id, attachment]));

  if (submittedIds.some((attachmentId) => !attachmentById.has(attachmentId))) {
    return {
      error: "One or more attachments failed to upload. Please remove them or try again.",
      fieldErrors: {
        attachments: "One or more attachments failed to upload. Please remove them or try again.",
      } satisfies ProjectFormFieldErrors,
    };
  }

  const hasUploadingAttachment = attachments.some(
    (attachment) => attachment.status === AttachmentStatus.UPLOADING,
  );

  if (hasUploadingAttachment) {
    return {
      error: "Please wait for all attachments to finish uploading.",
      fieldErrors: {
        attachments: "Please wait for all attachments to finish uploading.",
      } satisfies ProjectFormFieldErrors,
    };
  }

  const hasBrokenAttachment = attachments.some(
    (attachment) =>
      attachment.projectId !== input.projectId ||
      attachment.status !== AttachmentStatus.READY ||
      attachment.assetType !== AttachmentAssetType.GENERAL_PROJECT_ASSET,
  );
  const hasMismatchedProjectAttachment = input.projectAttachmentIds.some(
    (attachmentId) => attachmentById.get(attachmentId)?.stageId,
  );
  const hasMismatchedStageAttachment = input.stageAttachmentIds.some(
    (attachmentId) => !attachmentById.get(attachmentId)?.stageId,
  );

  if (hasBrokenAttachment || hasMismatchedProjectAttachment || hasMismatchedStageAttachment) {
    return {
      error: "One or more attachments failed to upload. Please remove them or try again.",
      fieldErrors: {
        attachments: "One or more attachments failed to upload. Please remove them or try again.",
      } satisfies ProjectFormFieldErrors,
    };
  }

  return null;
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
  options: { requireStageTimeline: boolean },
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

    if (!stageStartInput && options.requireStageTimeline) {
      stageStartDateErrors[index] = "Stage start is required.";
    } else if (stageStartInput && (!stageStart || Number.isNaN(stageStart.getTime()))) {
      stageStartDateErrors[index] = "Choose a valid stage start.";
    }

    if (!stageDueInput && options.requireStageTimeline) {
      stageDueDateErrors[index] = "Stage due is required.";
    } else if (stageDueInput && (!stageDue || Number.isNaN(stageDue.getTime()))) {
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
  const executionType = isProjectExecutionType(parsed.executionTypeInput)
    ? parsed.executionTypeInput
    : null;
  const requireBudget =
    executionType === ProjectExecutionType.EXTERNAL && (options.requireBudget ?? true);
  const requireStageDetails = executionType === ProjectExecutionType.EXTERNAL;
  const fieldErrors: ProjectFormFieldErrors = {};
  const executorValidation = normalizeProjectExecutorAssignments(parsed);

  if (!parsed.name) fieldErrors.name = "Project name is required.";
  if (!parsed.category) fieldErrors.category = "Project category is required.";
  if ("error" in executorValidation) {
    fieldErrors.executorUserId = executorValidation.error;
  }
  if (!parsed.description) fieldErrors.description = "Project brief is required.";
  if (!parsed.executionTypeInput) {
    fieldErrors.executionType = "Project execution type is required.";
  }
  if (requireBudget && !parsed.budgetInput) fieldErrors.budget = "Project budget is required.";
  if (requireBudget && !parsed.currencyInput) fieldErrors.currency = "Project currency is required.";
  if (!parsed.statusId) fieldErrors.statusId = "Project status is required.";
  if (!parsed.startDateInput) fieldErrors.startDate = "Project start date is required.";
  if (!parsed.endDateInput) fieldErrors.endDate = "Project end date is required.";

  if (Object.keys(fieldErrors).length > 0) {
    return { error: "Please fill the required fields.", fieldErrors };
  }

  const executorAssignments =
    "assignments" in executorValidation ? executorValidation.assignments : [];
  const parsedBudget = parseBudget(parsed.budgetInput);
  const budget =
    requireBudget || (Number.isFinite(parsedBudget) && parsedBudget > 0)
      ? parsedBudget
      : 0;
  const priority = parsed.priorityInput
    ? isProjectPriority(parsed.priorityInput)
      ? parsed.priorityInput
      : null
    : DEFAULT_PROJECT_PRIORITY;
  const startDate = new Date(parsed.startDateInput);
  const endDate = new Date(parsed.endDateInput);

  if (!executionType) {
    return {
      error: "Please correct the highlighted fields.",
      fieldErrors: { executionType: "Choose a valid project execution type." },
    };
  }

  if (requireBudget && (!Number.isFinite(budget) || budget <= 0)) {
    return {
      error: "Please correct the highlighted fields.",
      fieldErrors: { budget: "Enter a valid project budget." },
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
        ...(requireBudget ? { stageBudgets: [...["Stage budget is required."]] } : {}),
        ...(requireStageDetails
          ? {
              stageDescriptions: [...["Stage brief is required."]],
              stageStartDates: [...["Stage start is required."]],
              stageDueDates: [...["Stage due is required."]],
            }
          : {}),
      },
    };
  }

  const normalizedStageNames = parsed.stageNames.map((value, index) =>
    value || (!requireStageDetails ? `Stage ${index + 1}` : ""),
  );
  const stageNameErrors: Array<string | undefined> = normalizedStageNames.map((value) =>
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
    !requireStageDetails || value ? undefined : "Stage brief is required.",
  );
  const stageTimelineValidation = validateStageTimeline(parsed, startDate, endDate, {
    requireStageTimeline: requireStageDetails,
  });
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
      stageNames: normalizedStageNames,
      executionType,
      budget,
      currency: parsed.currencyInput || "USD",
      statusId: parsed.statusId,
      priority,
      startDate,
      endDate,
      stageStartDates: parsed.stageStartDates.map((value) =>
        value ? new Date(value) : null,
      ),
      stageDueDates: parsed.stageDueDates.map((value) =>
        value ? new Date(value) : null,
      ),
      currentStageName: normalizedStageNames[0] || "Stage 1",
    },
  };
}

async function resolveSubmittedProjectStatus(
  statusId: string,
  options: { allowInactiveStatusId?: string | null } = {},
) {
  const status = await prisma.projectStatusOption.findUnique({
    where: {
      id: statusId,
    },
    select: {
      id: true,
      name: true,
      group: {
        select: {
          id: true,
          slug: true,
          isActive: true,
        },
      },
      isActive: true,
    },
  });

  if (!status) {
    return {
      error: "Please correct the highlighted fields.",
      fieldErrors: {
        statusId: "Choose a valid project status.",
      } satisfies ProjectFormFieldErrors,
    };
  }

  if (!status.isActive && status.id !== options.allowInactiveStatusId) {
    return {
      error: "Please correct the highlighted fields.",
      fieldErrors: {
        statusId: "Choose an active project status.",
      } satisfies ProjectFormFieldErrors,
    };
  }

  if ((!status.group || !status.group.isActive) && status.id !== options.allowInactiveStatusId) {
    return {
      error: "Please correct the highlighted fields.",
      fieldErrors: {
        statusId: "Choose a project status with an active group.",
      } satisfies ProjectFormFieldErrors,
    };
  }

  return {
    status,
  };
}

async function resolveSubmittedProjectTags(tagInputs: string[]) {
  const normalizedTags = tagInputs.map((tag) => tag.trim()).filter(Boolean);
  const duplicateCheck = new Set<string>();

  if (normalizedTags.length > MAX_PROJECT_TAGS) {
    return {
      error: "You can add up to 5 tags only.",
      fieldErrors: {
        tag: "You can add up to 5 tags only.",
      } satisfies ProjectFormFieldErrors,
    };
  }

  for (const tagName of normalizedTags) {
    const key = tagName.toLowerCase();

    if (duplicateCheck.has(key)) {
      return {
        error: "Please correct the highlighted fields.",
        fieldErrors: {
          tag: "Duplicate project tags are not allowed.",
        } satisfies ProjectFormFieldErrors,
      };
    }

    duplicateCheck.add(key);
  }

  if (normalizedTags.length === 0) {
    return {
      tags: [],
    };
  }

  const masterTags = await prisma.projectTag.findMany({
    where: {
      OR: normalizedTags.map((tagName) => ({
        name: {
          equals: tagName,
          mode: "insensitive" as const,
        },
      })),
    },
    select: {
      id: true,
      name: true,
    },
  });
  const masterTagByName = new Map(
    masterTags.map((tag) => [tag.name.trim().toLowerCase(), tag] as const),
  );
  const resolvedTags = normalizedTags
    .map((tagName) => masterTagByName.get(tagName.toLowerCase()) ?? null);

  if (resolvedTags.some((tag) => tag === null)) {
    return {
      error: "Please correct the highlighted fields.",
      fieldErrors: {
        tag: "Choose valid project tags.",
      } satisfies ProjectFormFieldErrors,
    };
  }

  const tags = resolvedTags.filter(
    (tag): tag is { id: string; name: string } => tag !== null,
  );

  return {
    tags,
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
  status: StageStatus;
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
    stage.status !== StageStatus.PENDING ||
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

  const resolvedTags = await resolveSubmittedProjectTags(validated.data.tags);

  if ("error" in resolvedTags) {
    return resolvedTags;
  }

  const resolvedStatus = await resolveSubmittedProjectStatus(validated.data.statusId);

  if ("error" in resolvedStatus) {
    return resolvedStatus;
  }

  const {
    name,
    category,
    executorAssignments,
    description,
    executionType,
    budget,
    currency,
    statusId,
    priority,
    startDate,
    endDate,
    stageNames,
    stageBudgets,
    stageDescriptions,
    stageStartDates,
    stageDueDates,
    stageInvoiceRequired,
    currentStageName,
    collaboratorIds,
    collaboratorParticipantTypes,
  } = validated.data;
  const isExternalExecution = executionType === ProjectExecutionType.EXTERNAL;
  const stageStatuses = getInitialStageStatuses(
    resolvedStatus.status.group?.slug,
    stageNames.length,
  );

  const currencyCode =
    (await resolveProjectCurrencyCode(currency)) ??
    (isExternalExecution ? null : "USD");

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
          description,
          executionType,
          budget,
          currency: currencyCode,
          statusId,
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
          tags:
            resolvedTags.tags.length > 0
              ? {
                  createMany: {
                    data: resolvedTags.tags.map((tag) => ({
                      tagId: tag.id,
                    })),
                    skipDuplicates: true,
                  },
                }
              : undefined,
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
                  isExternalExecution && Number.isFinite(parsedStageBudget) && parsedStageBudget > 0
                    ? parsedStageBudget
                    : isExternalExecution && index === 0
                      ? budget
                      : null,
                plannedStartAt: stageStartDates[index],
                plannedDueAt: stageDueDates[index],
                invoiceRequired: isExternalExecution
                  ? stageInvoiceRequired[index] ?? true
                  : false,
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
      executionType: true,
      budget: true,
      statusId: true,
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

  if (isProjectStatusCompleted(existingProject.status)) {
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

  const resolvedTags = await resolveSubmittedProjectTags(validated.data.tags);

  if ("error" in resolvedTags) {
    return resolvedTags;
  }

  const resolvedStatus = await resolveSubmittedProjectStatus(validated.data.statusId, {
    allowInactiveStatusId: existingProject.statusId,
  });

  if ("error" in resolvedStatus) {
    return resolvedStatus;
  }

  const {
    name,
    category,
    executorAssignments,
    description,
    executionType,
    budget,
    currency,
    statusId,
    priority,
    startDate,
    endDate,
    stageNames,
    stageBudgets,
    stageDescriptions,
    stageStartDates,
    stageDueDates,
    stageInvoiceRequired,
    stageIds,
    currentStageName,
    collaboratorIds,
    collaboratorParticipantTypes,
    projectAttachmentIds,
    stageAttachmentIds,
  } = validated.data;
  const isExternalExecution = executionType === ProjectExecutionType.EXTERNAL;

  if (
    isExternalExecution &&
    !canUpdateBudget &&
    (!Number.isFinite(existingProject.budget) || existingProject.budget <= 0)
  ) {
    return {
      error: "Please correct the highlighted fields.",
      fieldErrors: {
        budget: "External execution requires a valid project budget.",
      },
    };
  }

  const submittedAttachmentValidation = await validateSubmittedProjectAttachments({
    projectId,
    projectAttachmentIds,
    stageAttachmentIds,
  });

  if (submittedAttachmentValidation) {
    return submittedAttachmentValidation;
  }

  const currencyCode = canUpdateBudget
    ? (await resolveProjectCurrencyCode(currency, {
        allowInactiveCode: existingProject.currency,
      })) ?? (isExternalExecution ? null : existingProject.currency || "USD")
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
  const executionTypeChanged = existingProject.executionType !== executionType;

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
          description,
          executionType,
          budget: canUpdateBudget ? budget : existingProject.budget,
          currency: currencyCode,
          statusId,
          priority,
          startDate,
          endDate,
          currentStageName,
          stageCount: stageNames.length,
        },
      });

      await tx.projectTagAssignment.deleteMany({
        where: {
          projectId,
        },
      });

      if (resolvedTags.tags.length > 0) {
        await tx.projectTagAssignment.createMany({
          data: resolvedTags.tags.map((tag) => ({
            projectId,
            tagId: tag.id,
          })),
          skipDuplicates: true,
        });
      }

      if (executionTypeChanged) {
        await tx.projectCompletionWorkflow.updateMany({
          where: {
            projectId,
          },
          data: isExternalExecution
            ? {
                approvalRequired: null,
                approvalStatus: ProjectCompletionStepStatus.NOT_STARTED,
                approvalContactUserId: null,
                approvalNote: null,
                approvalSelectedArchivedFileIds: [],
                approvalRequestedAt: null,
                approvalCompletedAt: null,
                copyrightRequired: null,
                copyrightStatus: ProjectCompletionStepStatus.NOT_STARTED,
                copyrightContactUserId: null,
                copyrightNote: null,
                copyrightRequestedAt: null,
                copyrightCompletedAt: null,
                invoiceStatus: ProjectCompletionStepStatus.NOT_STARTED,
                invoiceCompletedAt: null,
                completedAt: null,
              }
            : {
                approvalRequired: false,
                approvalStatus: ProjectCompletionStepStatus.NOT_REQUIRED,
                approvalContactUserId: null,
                approvalNote: null,
                approvalSelectedArchivedFileIds: [],
                approvalRequestedAt: null,
                approvalCompletedAt: null,
                copyrightRequired: false,
                copyrightStatus: ProjectCompletionStepStatus.NOT_REQUIRED,
                copyrightContactUserId: null,
                copyrightNote: null,
                copyrightRequestedAt: null,
                copyrightCompletedAt: null,
                invoiceStatus: ProjectCompletionStepStatus.NOT_REQUIRED,
                invoiceCompletedAt: null,
                completedAt: null,
              },
        });
      }

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
          ? isExternalExecution && Number.isFinite(parsedStageBudget) && parsedStageBudget > 0
            ? parsedStageBudget
            : isExternalExecution && index === 0
              ? budget
              : null
          : existingStage?.budget ?? null;
        const stageData = {
          name: stageName,
          description: stageDescriptions[index] || null,
          budget: nextBudget,
          plannedStartAt: stageStartDates[index],
          plannedDueAt: stageDueDates[index],
          invoiceRequired: isExternalExecution
            ? stageInvoiceRequired[index] ?? existingStage?.invoiceRequired ?? true
            : false,
          order: index + 1,
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
            status: StageStatus.PENDING,
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
      previousExecutorUserIds: [
        existingProject.executorUserId,
        ...existingProject.executors.map((executor) => executor.userId),
      ].filter(Boolean) as string[],
      nextExecutorUserIds: [
        resolvedExecutors.executorUserId,
        ...resolvedExecutors.executors.map((executor) => executor.userId),
      ].filter(Boolean) as string[],
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
      createdById: true,
      executorUserId: true,
      collaborators: {
        select: {
          userId: true,
        },
      },
      stages: {
        select: {
          id: true,
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

  if (isProjectStatusCompleted(project.status)) {
    throw new Error("Completed projects cannot be deleted.");
  }

  const stageIds = project.stages.map((stage) => stage.id);

  await prisma.$transaction([
    prisma.notification.deleteMany({
      where: {
        OR: [
          { projectId },
          ...(stageIds.length > 0
            ? [
                {
                  stageId: {
                    in: stageIds,
                  },
                },
              ]
            : []),
        ],
      },
    }),
    prisma.project.delete({
      where: { id: projectId },
    }),
  ]);

  revalidatePath("/");
  revalidatePath("/notifications");
  revalidatePath("/projects");
  revalidatePath(`/projects/${projectId}`);
  revalidateTag(PROJECTS_CACHE_TAG, "max");
}
