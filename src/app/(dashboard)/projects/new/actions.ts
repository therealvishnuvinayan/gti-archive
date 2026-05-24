"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { CurrencyCode, ProjectStatus, UserRole } from "@prisma/client";

import type {
  ProjectFormFieldErrors,
  ProjectFormState,
} from "@/app/(dashboard)/projects/new/project-form-state";
import { requireUser } from "@/lib/auth";
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

function isCurrencyCode(value: string): value is CurrencyCode {
  return Object.values(CurrencyCode).includes(value as CurrencyCode);
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
  const tag = String(formData.get("tag") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const budgetInput = String(formData.get("budget") ?? "").trim();
  const currencyInput = String(formData.get("currency") ?? "").trim();
  const statusInput = String(formData.get("status") ?? "").trim();
  const startDateInput = String(formData.get("startDate") ?? "").trim();
  const endDateInput = String(formData.get("endDate") ?? "").trim();
  const stageNames = formData
    .getAll("stageNames")
    .map((value) => String(value).trim())
    .filter(Boolean);
  const stageBudgets = formData
    .getAll("stageBudgets")
    .map((value) => String(value).trim());
  const stageDescriptions = formData
    .getAll("stageDescriptions")
    .map((value) => String(value).trim());
  const collaboratorIds = [...new Set(
    formData
      .getAll("collaboratorIds")
      .map((value) => String(value).trim())
      .filter(Boolean),
  )];

  return {
    name,
    category,
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
    collaboratorIds,
  };
}

function validateProjectFormData(parsed: ReturnType<typeof parseProjectFormData>) {
  const fieldErrors: ProjectFormFieldErrors = {};

  if (!parsed.name) fieldErrors.name = "Project name is required.";
  if (!parsed.category) fieldErrors.category = "Project category is required.";
  if (!parsed.tag) fieldErrors.tag = "Project tag is required.";
  if (!parsed.description) fieldErrors.description = "Project brief is required.";
  if (!parsed.budgetInput) fieldErrors.budget = "Project budget is required.";
  if (!parsed.currencyInput) fieldErrors.currency = "Project currency is required.";
  if (!parsed.statusInput) fieldErrors.status = "Project status is required.";
  if (!parsed.startDateInput) fieldErrors.startDate = "Project start date is required.";
  if (!parsed.endDateInput) fieldErrors.endDate = "Project end date is required.";

  if (Object.keys(fieldErrors).length > 0) {
    return { error: "Please fill the required fields.", fieldErrors };
  }

  const budget = parseBudget(parsed.budgetInput);
  const currency = isCurrencyCode(parsed.currencyInput) ? parsed.currencyInput : null;
  const status = isProjectStatus(parsed.statusInput) ? parsed.statusInput : null;
  const startDate = new Date(parsed.startDateInput);
  const endDate = new Date(parsed.endDateInput);

  if (!Number.isFinite(budget) || budget <= 0) {
    return {
      error: "Please correct the highlighted fields.",
      fieldErrors: { budget: "Enter a valid project budget." },
    };
  }

  if (!currency) {
    return {
      error: "Please correct the highlighted fields.",
      fieldErrors: { currency: "Choose a valid project currency." },
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
      },
    };
  }

  const stageNameErrors = parsed.stageNames.map((value) =>
    value ? undefined : "Stage name is required.",
  );
  const stageBudgetErrors = parsed.stageBudgets.map((value) => {
    const budget = parseBudget(value);
    return Number.isFinite(budget) && budget > 0 ? undefined : "Enter a valid stage budget.";
  });
  const stageDescriptionErrors = parsed.stageDescriptions.map((value) =>
    value ? undefined : "Stage description is required.",
  );

  if (stageNameErrors.some(Boolean) || stageBudgetErrors.some(Boolean) || stageDescriptionErrors.some(Boolean)) {
    return {
      error: "Please correct the highlighted stage fields.",
      fieldErrors: {
        stageNames: stageNameErrors,
        stageBudgets: stageBudgetErrors,
        stageDescriptions: stageDescriptionErrors,
      },
    };
  }

  return {
    data: {
      ...parsed,
      budget,
      currency,
      status,
      startDate,
      endDate,
      stageStatuses: getInitialStageStatuses(status, parsed.stageNames.length),
      currentStageName: parsed.stageNames[0] || "Stage 1",
    },
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

  const validated = validateProjectFormData(parseProjectFormData(formData));

  if ("error" in validated) {
    return validated;
  }

  const {
    name,
    category,
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
    stageStatuses,
    currentStageName,
    collaboratorIds,
  } = validated.data;

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
        },
      })
    : [];
  const validCollaboratorIds = validCollaborators.map((collaborator) => collaborator.id);

  let projectId: string;

  try {
    const project = await prisma.project.create({
      data: {
        name,
        category,
        tag: tag || null,
        description,
        budget,
        currency,
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
              status: stageStatuses[index],
              order: index + 1,
            };
          }),
        },
      },
    });
    projectId = project.id;
  } catch {
    return { error: "Unable to create the project right now. Please try again." };
  }

  revalidatePath("/");
  revalidatePath("/projects");
  revalidatePath(`/projects/${projectId}`);
  revalidateTag(PROJECTS_CACHE_TAG, "max");

  return { projectId };
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

  const validated = validateProjectFormData(parseProjectFormData(formData));

  if ("error" in validated) {
    return validated;
  }

  const {
    name,
    category,
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
    stageStatuses,
    currentStageName,
    collaboratorIds,
  } = validated.data;

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
        },
      })
    : [];
  const validCollaboratorIds = validCollaborators.map((collaborator) => collaborator.id);

  try {
    await prisma.project.update({
      where: { id: projectId },
      data: {
        name,
        category,
        tag: tag || null,
        description,
        budget,
        currency,
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
                Number.isFinite(parsedStageBudget) && parsedStageBudget > 0
                  ? parsedStageBudget
                  : index === 0
                    ? budget
                    : null,
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
