"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { CurrencyCode, ProjectStatus } from "@prisma/client";

import type { ProjectFormState } from "@/app/projects/new/project-form-state";
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

export async function createProjectAction(
  _previousState: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  const user = await requireUser();
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

  if (!name || !category || !description || !budgetInput || !startDateInput || !endDateInput) {
    return { error: "Fill in all required project fields before creating the project." };
  }

  const budget = parseBudget(budgetInput);
  const currency = isCurrencyCode(currencyInput) ? currencyInput : null;
  const status = isProjectStatus(statusInput) ? statusInput : null;
  const startDate = new Date(startDateInput);
  const endDate = new Date(endDateInput);

  if (!Number.isFinite(budget) || budget <= 0) {
    return { error: "Enter a valid project budget." };
  }

  if (!currency) {
    return { error: "Choose a valid project currency." };
  }

  if (!status) {
    return { error: "Choose a valid project status." };
  }

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return { error: "Choose valid start and end dates." };
  }

  if (startDate > endDate) {
    return { error: "Project end date must be after the start date." };
  }

  if (stageNames.length === 0) {
    return { error: "Add at least one valid stage before creating the project." };
  }

  const stageStatuses = getInitialStageStatuses(status, stageNames.length);
  const currentStageName = stageNames[0] || "Stage 1";

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
