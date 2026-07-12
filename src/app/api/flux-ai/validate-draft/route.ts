import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import type { FluxAIChatResponse, FluxAIDraftProject } from "@/lib/flux-ai/types";
import {
  FluxAIConversationAccessError,
  persistFluxAISystemEvent,
} from "@/lib/flux-ai/conversations";
import {
  FluxAIPermissionError,
  validateFluxAIDraftForCreation,
} from "@/lib/flux-ai/tools";
import { hasPermission } from "@/lib/permissions/resolver";

export const runtime = "nodejs";

type FluxAIValidateDraftPayload = {
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
        assistantMessage: "You do not have permission to prepare project drafts.",
      },
      403,
    );
  }

  let payload: FluxAIValidateDraftPayload = {};

  try {
    payload = (await request.json()) as FluxAIValidateDraftPayload;
  } catch {
    return jsonFluxAI(
      {
        type: "error",
        assistantMessage: "Invalid Flux AI draft validation request.",
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
        assistantMessage: "Draft project details are required before validation.",
      },
      400,
    );
  }

  try {
    const { draftProject, missingFields, warnings } = await validateFluxAIDraftForCreation({
      user,
      draftProject: submittedDraftProject,
    });
    const isReady = Boolean(draftProject.canCreate) && missingFields.length === 0;
    const response = {
      type: isReady ? "draft_project" : "missing_fields",
      intent: "draft_project_create",
      assistantMessage: isReady
        ? "Draft updated and ready to create."
        : `Draft updated. ${missingFields.length} field${
            missingFields.length === 1 ? "" : "s"
          } still need attention.`,
      draftProject,
      missingFields,
      warnings,
      suggestions: isReady
        ? ["Create Project", "Edit Details", "Cancel"]
        : ["Add missing project details", "Edit Details", "Cancel"],
    } satisfies FluxAIChatResponse;

    if (requestedConversationId) {
      await persistFluxAISystemEvent({
        user,
        conversationId: requestedConversationId,
        response,
      });
    }

    return jsonFluxAI({
      ...response,
      conversationId: requestedConversationId || undefined,
    });
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
            : "Flux AI could not validate the draft right now.",
      },
      500,
    );
  }
}
