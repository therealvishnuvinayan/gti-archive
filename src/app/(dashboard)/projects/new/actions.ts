"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { CurrencyCode, ProjectStatus, UserRole } from "@prisma/client";

import type { ProjectFormState } from "@/app/(dashboard)/projects/new/project-form-state";
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
  };
}

function validateProjectFormData(parsed: ReturnType<typeof parseProjectFormData>) {
  if (
    !parsed.name ||
    !parsed.category ||
    !parsed.description ||
    !parsed.budgetInput ||
    !parsed.startDateInput ||
    !parsed.endDateInput
  ) {
    return { error: "Fill in all required project fields before saving the project." } as const;
  }

  const budget = parseBudget(parsed.budgetInput);
  const currency = isCurrencyCode(parsed.currencyInput) ? parsed.currencyInput : null;
  const status = isProjectStatus(parsed.statusInput) ? parsed.statusInput : null;
  const startDate = new Date(parsed.startDateInput);
  const endDate = new Date(parsed.endDateInput);

  if (!Number.isFinite(budget) || budget <= 0) {
    return { error: "Enter a valid project budget." } as const;
  }

  if (!currency) {
    return { error: "Choose a valid project currency." } as const;
  }

  if (!status) {
    return { error: "Choose a valid project status." } as const;
  }

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return { error: "Choose valid start and end dates." } as const;
  }

  if (startDate > endDate) {
    return { error: "Project end date must be after the start date." } as const;
  }

  if (parsed.stageNames.length === 0) {
    return { error: "Add at least one valid stage before saving the project." } as const;
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
  } as const;
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
  } = validated.data;

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

  redirect(`/projects/${projectId}`);
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
  } = validated.data;

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
