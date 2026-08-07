import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import type { FluxAIChatResponse } from "@/lib/flux-ai/types";
import {
  FluxAIConversationAccessError,
  persistFluxAIAssistantMessage,
} from "@/lib/flux-ai/conversations";
import { hasPermission } from "@/lib/permissions/resolver";

export const runtime = "nodejs";

type FluxAICreateProjectPayload = {
  conversationId?: unknown;
};

function jsonFluxAI(response: FluxAIChatResponse, status = 200) {
  return NextResponse.json(response, { status });
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
        assistantMessage: "You do not have permission to create projects.",
      },
      403,
    );
  }

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

  const response: FluxAIChatResponse = {
    type: "error",
    assistantMessage:
      "Flux AI project creation is temporarily unavailable for the V2 workflow. Use Create Project to select an operational owner, optional co-owners, and executors.",
  };
  const conversationId = normalizeString(payload.conversationId);

  if (conversationId) {
    try {
      await persistFluxAIAssistantMessage({
        user,
        conversationId,
        response,
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

      throw error;
    }
  }

  return jsonFluxAI(response, 409);
}
