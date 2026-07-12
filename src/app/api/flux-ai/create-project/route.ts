import { NextResponse } from "next/server";
import { ProjectExecutionType, ProjectExecutorRole } from "@prisma/client";

import { createProjectAction } from "@/app/(dashboard)/projects/new/actions";
import { initialProjectFormState } from "@/app/(dashboard)/projects/new/project-form-state";
import { getCurrentUser } from "@/lib/auth";
import type { FluxAIChatResponse, FluxAIDraftProject } from "@/lib/flux-ai/types";
import {
  FluxAIConversationAccessError,
  persistFluxAIAssistantMessage,
} from "@/lib/flux-ai/conversations";
import {
  FluxAIPermissionError,
  validateFluxAIDraftForCreation,
} from "@/lib/flux-ai/tools";
import { hasPermission } from "@/lib/permissions/resolver";
import { DEFAULT_PROJECT_CURRENCY } from "@/lib/project-currencies";
import { DEFAULT_PROJECT_PRIORITY } from "@/lib/project-priority";
import { getDefaultProjectStatusOption } from "@/lib/project-statuses";

export const runtime = "nodejs";

type FluxAICreateProjectPayload = {
  draftProject?: unknown;
  conversationId?: unknown;
};

function jsonFluxAI(response: FluxAIChatResponse, status = 200) {
  return NextResponse.json(response, { status });
}

function normalizeDraftProject(value: unknown) {
  if (!value || typeof value !== "object") {
    return null;
  }

  return value as FluxAIDraftProject;
}

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function appendIfPresent(formData: FormData, key: string, value: string | null | undefined) {
  if (value) {
    formData.append(key, value);
  }
}

function formatBudgetInput(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "";
}

function getFieldErrorMessages(fieldErrors: Record<string, unknown> | undefined) {
  if (!fieldErrors) {
    return [];
  }

  return Object.values(fieldErrors)
    .flatMap((value) => {
      if (Array.isArray(value)) {
        return value.filter((item): item is string => typeof item === "string" && Boolean(item));
      }

      return typeof value === "string" && value ? [value] : [];
    })
    .filter(Boolean);
}

async function buildProjectFormData(draftProject: FluxAIDraftProject) {
  const defaultStatus = await getDefaultProjectStatusOption();

  if (!defaultStatus) {
    throw new Error("No active default project status is configured.");
  }

  const formData = new FormData();
  const executionType = draftProject.executionType ?? ProjectExecutionType.EXTERNAL;
  const isExternalExecution = executionType === ProjectExecutionType.EXTERNAL;
  const mainExecutorId = draftProject.mainExecutorMatch?.selectedUserId;
  const collaboratorIds = [
    ...new Set(
      (draftProject.collaboratorMatches ?? [])
        .map((match) => match.selectedUserId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  formData.set("name", draftProject.projectName);
  formData.set("category", draftProject.category);
  formData.set("priority", draftProject.priority ?? DEFAULT_PROJECT_PRIORITY);
  formData.set("description", draftProject.projectBrief);
  formData.set("executionType", executionType);
  formData.set("budgetRequired", draftProject.budgetRequired ? "true" : "false");
  formData.set("budget", draftProject.budgetRequired ? formatBudgetInput(draftProject.budget) : "");
  formData.set(
    "currency",
    draftProject.currency ?? (draftProject.budgetRequired ? DEFAULT_PROJECT_CURRENCY : ""),
  );
  formData.set("statusId", defaultStatus.id);
  formData.set("startDate", draftProject.startDate ?? "");
  formData.set("endDate", draftProject.endDate ?? "");

  draftProject.tags.forEach((tag) => appendIfPresent(formData, "tags", tag));

  draftProject.stages.forEach((stage) => {
    formData.append("stageNames", stage.name);
    formData.append("stageBudgets", formatBudgetInput(stage.budget));
    formData.append("stageDescriptions", stage.brief);
    formData.append("stageStartDates", stage.startDate ?? "");
    formData.append("stageDueDates", stage.dueDate ?? "");
    formData.append(
      "stageInvoiceRequired",
      isExternalExecution ? String(stage.invoiceRequired ?? true) : "false",
    );
  });

  if (mainExecutorId) {
    formData.append("executorIds", mainExecutorId);
    formData.append("executorRoles", ProjectExecutorRole.MAIN_EXECUTOR);
  }

  collaboratorIds.forEach((collaboratorId) => {
    formData.append("collaboratorIds", collaboratorId);
  });

  return formData;
}

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return jsonFluxAI({ type: "error", assistantMessage: "Unauthorized." }, 401);
  }

  if (!hasPermission(user, "fluxAi.view")) {
    return jsonFluxAI(
      {
        type: "error",
        assistantMessage: "You do not have permission to use Flux AI.",
      },
      403,
    );
  }

  if (!hasPermission(user, "project.create")) {
    return jsonFluxAI(
      {
        type: "error",
        assistantMessage: "You do not have permission to create projects.",
      },
      403,
    );
  }

  const currentUser = user;

  let payload: FluxAICreateProjectPayload = {};

  try {
    payload = (await request.json()) as FluxAICreateProjectPayload;
  } catch {
    return jsonFluxAI(
      {
        type: "error",
        assistantMessage: "Invalid Flux AI project creation request.",
      },
      400,
    );
  }

  const submittedDraftProject = normalizeDraftProject(payload.draftProject);
  const requestedConversationId = normalizeString(payload.conversationId);

  if (!submittedDraftProject) {
    return jsonFluxAI(
      {
        type: "error",
        assistantMessage: "Draft project details are required before creating a project.",
      },
      400,
    );
  }

  try {
    async function persistResponse(response: FluxAIChatResponse) {
      if (!requestedConversationId) {
        return response;
      }

      await persistFluxAIAssistantMessage({
        user: currentUser,
        conversationId: requestedConversationId,
        response,
      });

      return {
        ...response,
        conversationId: requestedConversationId,
      } satisfies FluxAIChatResponse;
    }

    const { draftProject, missingFields, warnings } = await validateFluxAIDraftForCreation({
      user,
      draftProject: submittedDraftProject,
    });

    if (!draftProject.canCreate || missingFields.length > 0) {
      const response = await persistResponse({
        type: "missing_fields",
        assistantMessage:
          "The draft is not ready to create yet. Review the missing fields first.",
        draftProject,
        missingFields,
        warnings,
      });

      return jsonFluxAI(
        response,
        400,
      );
    }

    const result = await createProjectAction(
      initialProjectFormState,
      await buildProjectFormData(draftProject),
    );

    if (result.error || !result.projectId) {
      const validationMessages = getFieldErrorMessages(result.fieldErrors);
      const response = await persistResponse({
        type: "error",
        assistantMessage: result.error ?? "Unable to create the project right now.",
        draftProject,
        warnings: validationMessages.length ? validationMessages : warnings,
      });

      return jsonFluxAI(
        response,
        400,
      );
    }

    const createdProjectHref = `/projects/${result.projectId}`;
    const response = await persistResponse({
      type: "created_project",
      assistantMessage: `Project created successfully. You can open it from ${createdProjectHref}.`,
      createdProjectId: result.projectId,
      createdProjectHref,
      draftProject,
      suggestions: [
        "Summarize this project status",
        "Find projects waiting for approval",
        "Show overdue stages",
      ],
    });

    return jsonFluxAI(response);
  } catch (error) {
    if (error instanceof FluxAIConversationAccessError) {
      return jsonFluxAI(
        {
          type: "error",
          assistantMessage: "Flux AI conversation not found.",
        },
        404,
      );
    }

    if (error instanceof FluxAIPermissionError) {
      return jsonFluxAI(
        {
          type: "error",
          assistantMessage: error.message,
        },
        403,
      );
    }

    return jsonFluxAI(
      {
        type: "error",
        assistantMessage:
          error instanceof Error
            ? error.message
            : "Flux AI could not create the project right now.",
      },
      500,
    );
  }
}
