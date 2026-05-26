"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { ProjectStatus, UserRole } from "@prisma/client";

import type {
  ProjectFormFieldErrors,
  ProjectFormState,
} from "@/app/(dashboard)/projects/new/project-form-state";
import { requireUser } from "@/lib/auth";
import {
  getDefaultProjectCollaboratorParticipantType,
  isProjectCollaboratorParticipantType,
  type ProjectCollaboratorParticipantType,
} from "@/lib/project-collaborator-participant-types";
import { prisma } from "@/lib/prisma";
import { PROJECTS_CACHE_TAG } from "@/lib/projects";

function parseBudget(value: string) {
  const normalized = value.replace(/[^\d]/g, "");
  const parsed = Number.parseInt(normalized, 10);

  return Number.isFinite(parsed) ? parsed : NaN;
}

function isProjectStatus(value: string): value is ProjectStatus {
  return Object.values(ProjectStatus).includes(value as ProjectStatus);
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

function parseProjectFormData(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const executorName = String(formData.get("executorName") ?? "").trim();
  const executorUserId = String(formData.get("executorUserId") ?? "").trim();
  const tag = String(formData.get("tag") ?? "").trim();
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
    collaboratorIds,
    collaboratorParticipantTypes,
  };
}

function validateProjectFormData(
  parsed: ReturnType<typeof parseProjectFormData>,
  options: { requireBudget?: boolean } = {},
) {
  const requireBudget = options.requireBudget ?? true;
  const fieldErrors: ProjectFormFieldErrors = {};

  if (!parsed.name) fieldErrors.name = "Project name is required.";
  if (!parsed.category) fieldErrors.category = "Project category is required.";
  if (!parsed.executorName) {
    fieldErrors.executorUserId = "Project executor is required.";
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

  const budget = parseBudget(parsed.budgetInput);
  const status = isProjectStatus(parsed.statusInput) ? parsed.statusInput : null;
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

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return {
      error: "Please correct the highlighted fields.",
      fieldErrors: {
        startDate: "Choose a valid start date.",
        endDate: "Choose a valid end date.",
      },
    };
  }

  if (startDate > endDate) {
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
        stageDescriptions: [...["Stage description is required."]],
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
    value ? undefined : "Stage description is required.",
  );
  const stageStartDateErrors: Array<string | undefined> = parsed.stageStartDates.map((value) =>
    value ? undefined : "Stage start is required.",
  );
  const stageDueDateErrors: Array<string | undefined> = parsed.stageDueDates.map((value) =>
    value ? undefined : "Stage due is required.",
  );

  const projectStartBoundary = new Date(parsed.startDateInput);
  projectStartBoundary.setHours(0, 0, 0, 0);
  const projectEndBoundary = new Date(parsed.endDateInput);
  projectEndBoundary.setHours(23, 59, 59, 999);

  parsed.stageStartDates.forEach((value, index) => {
    if (!value) return;

    const stageStart = new Date(value);

    if (Number.isNaN(stageStart.getTime())) {
      stageStartDateErrors[index] = "Choose a valid stage start.";
      return;
    }

    if (stageStart < projectStartBoundary || stageStart > projectEndBoundary) {
      stageStartDateErrors[index] = "Stage start must be within the project date range.";
    }
  });

  parsed.stageDueDates.forEach((value, index) => {
    if (!value) return;

    const stageDue = new Date(value);
    const stageStartValue = parsed.stageStartDates[index];
    const stageStart = stageStartValue ? new Date(stageStartValue) : null;

    if (Number.isNaN(stageDue.getTime())) {
      stageDueDateErrors[index] = "Choose a valid stage due time.";
      return;
    }

    if (stageDue < projectStartBoundary || stageDue > projectEndBoundary) {
      stageDueDateErrors[index] = "Stage due must be within the project date range.";
      return;
    }

    if (stageStart && !Number.isNaN(stageStart.getTime()) && stageDue <= stageStart) {
      stageDueDateErrors[index] = "Stage due must be after the stage start.";
    }
  });

  if (
    stageNameErrors.some(Boolean) ||
    stageBudgetErrors.some(Boolean) ||
    stageDescriptionErrors.some(Boolean) ||
    stageStartDateErrors.some(Boolean) ||
    stageDueDateErrors.some(Boolean)
  ) {
    return {
      error: "Please correct the highlighted stage fields.",
      fieldErrors: {
        stageNames: stageNameErrors,
        stageBudgets: stageBudgetErrors,
        stageDescriptions: stageDescriptionErrors,
        stageStartDates: stageStartDateErrors,
        stageDueDates: stageDueDateErrors,
      },
    };
  }

  return {
    data: {
      ...parsed,
      budget,
      currency: parsed.currencyInput,
      status,
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

async function resolveProjectExecutor(
  executorUserId: string,
  fallbackExecutorName: string,
) {
  const normalizedId = executorUserId.trim();

  if (!normalizedId) {
    return fallbackExecutorName
      ? { executorUserId: null, executorName: fallbackExecutorName }
      : null;
  }

  const executorUser = await prisma.user.findUnique({
    where: {
      id: normalizedId,
    },
    select: {
      id: true,
      name: true,
      email: true,
      collaboratorType: true,
    },
  });

  if (!executorUser) {
    return null;
  }

  return {
    executorUserId: executorUser.id,
    executorName: executorUser.name?.trim() || executorUser.email,
  };
}

export async function createProjectAction(
  _previousState: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  const user = await requireUser();
  if (user.role === UserRole.COLLABORATOR) {
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
    executorName,
    executorUserId,
    tag,
    description,
    budget,
    currency,
    status,
    startDate,
    endDate,
    stageNames,
    stageBudgets,
    stageDescriptions,
    stageStartDates,
    stageDueDates,
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

  const resolvedExecutor = await resolveProjectExecutor(executorUserId, executorName);

  if (!resolvedExecutor) {
    return {
      error: "Please correct the highlighted fields.",
      fieldErrors: { executorUserId: "Choose a valid project executor." },
    };
  }

  const validCollaborators = collaboratorIds.length
    ? await prisma.user.findMany({
        where: {
          id: {
            in: collaboratorIds,
          },
          role: UserRole.COLLABORATOR,
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
      collaborator.collaboratorType === "EXTERNAL" ? "external" : "internal",
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
  let initialBriefStageId: string | undefined;
  let initialBriefCommentId: string | undefined;

  try {
    const project = await prisma.$transaction(async (tx) => {
      const createdProject = await tx.project.create({
        data: {
          name,
          category,
          executorName: resolvedExecutor.executorName,
          executorUserId: resolvedExecutor.executorUserId,
          tag: tag || null,
          description,
          budget,
          currency: currencyCode,
          status,
          startDate,
          endDate,
          currentStageName,
          stageCount: stageNames.length,
          createdById: user.id,
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
        const initialComment = await tx.projectComment.create({
          data: {
            projectId: createdProject.id,
            stageId: firstStageId,
            authorId: user.id,
            body: description,
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
    initialBriefStageId = project.stages[0]?.id;
    initialBriefCommentId = project.initialCommentId;
  } catch {
    return { error: "Unable to create the project right now. Please try again." };
  }

  revalidatePath("/");
  revalidatePath("/projects");
  revalidatePath(`/projects/${projectId}`);
  revalidateTag(PROJECTS_CACHE_TAG, "max");

  return { projectId, initialBriefStageId, initialBriefCommentId };
}

export async function updateProjectAction(
  _previousState: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  const user = await requireUser();

  if (user.role === UserRole.COLLABORATOR) {
    return { error: "You are not allowed to edit projects." };
  }

  const projectId = String(formData.get("projectId") ?? "").trim();

  if (!projectId) {
    return { error: "Project id is missing." };
  }

  const existingProject = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      currency: true,
      budget: true,
      createdById: true,
      stages: {
        orderBy: {
          order: "asc",
        },
        select: {
          budget: true,
        },
      },
    },
  });

  if (!existingProject) {
    return { error: "Project not found." };
  }

  const canViewBudget = existingProject.createdById === user.id;
  const validated = validateProjectFormData(parseProjectFormData(formData), {
    requireBudget: canViewBudget,
  });

  if ("error" in validated) {
    return validated;
  }

  const {
    name,
    category,
    executorName,
    executorUserId,
    tag,
    description,
    budget,
    currency,
    status,
    startDate,
    endDate,
    stageNames,
    stageBudgets,
    stageDescriptions,
    stageStartDates,
    stageDueDates,
    stageStatuses,
    currentStageName,
    collaboratorIds,
    collaboratorParticipantTypes,
  } = validated.data;

  const currencyCode = canViewBudget
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

  const resolvedExecutor = await resolveProjectExecutor(executorUserId, executorName);

  if (!resolvedExecutor) {
    return {
      error: "Please correct the highlighted fields.",
      fieldErrors: { executorUserId: "Choose a valid project executor." },
    };
  }

  const validCollaborators = collaboratorIds.length
    ? await prisma.user.findMany({
        where: {
          id: {
            in: collaboratorIds,
          },
          role: UserRole.COLLABORATOR,
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
      collaborator.collaboratorType === "EXTERNAL" ? "external" : "internal",
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

  try {
    await prisma.project.update({
      where: { id: projectId },
      data: {
        name,
        category,
        executorName: resolvedExecutor.executorName,
        executorUserId: resolvedExecutor.executorUserId,
        tag: tag || null,
        description,
        budget: canViewBudget ? budget : existingProject.budget,
        currency: currencyCode,
        status,
        startDate,
        endDate,
        currentStageName,
        stageCount: stageNames.length,
        collaborators: {
          deleteMany: {},
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
          deleteMany: {},
          create: stageNames.map((stageName, index) => {
            const parsedStageBudget = parseBudget(stageBudgets[index] ?? "");

            return {
              name: stageName,
              description: stageDescriptions[index] || null,
              budget:
                canViewBudget
                  ? Number.isFinite(parsedStageBudget) && parsedStageBudget > 0
                    ? parsedStageBudget
                    : index === 0
                      ? budget
                      : null
                  : existingProject.stages[index]?.budget ?? null,
              plannedStartAt: stageStartDates[index],
              plannedDueAt: stageDueDates[index],
              status: stageStatuses[index],
              order: index + 1,
            };
          }),
        },
      },
    });
  } catch {
    return { error: "Unable to update the project right now. Please try again." };
  }

  revalidatePath("/");
  revalidatePath("/projects");
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/edit`);
  revalidateTag(PROJECTS_CACHE_TAG, "max");

  redirect(`/projects/${projectId}`);
}

export async function deleteProjectAction(projectId: string) {
  const user = await requireUser();

  if (user.role === UserRole.COLLABORATOR) {
    throw new Error("You are not allowed to delete projects.");
  }

  await prisma.project.delete({
    where: { id: projectId },
  });

  revalidatePath("/");
  revalidatePath("/projects");
  revalidatePath(`/projects/${projectId}`);
  revalidateTag(PROJECTS_CACHE_TAG, "max");
}
