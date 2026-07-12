import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import {
  FluxAIConversationAccessError,
  persistFluxAISystemEvent,
} from "@/lib/flux-ai/conversations";
import { hasPermission } from "@/lib/permissions/resolver";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
}

function forbidden() {
  return NextResponse.json(
    { error: "You do not have permission to use Flux AI." },
    { status: 403 },
  );
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const user = await getCurrentUser();

  if (!user) {
    return unauthorized();
  }

  if (!hasPermission(user, "fluxAi.view")) {
    return forbidden();
  }

  const { conversationId } = await params;

  try {
    await persistFluxAISystemEvent({
      user,
      conversationId,
      response: {
        type: "message",
        assistantMessage: "Flux AI draft state cleared.",
        suggestions: [
          "Show overdue stages",
          "View projects waiting for approval",
          "Find projects ready for archive",
        ],
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof FluxAIConversationAccessError) {
      return NextResponse.json(
        { error: "Flux AI conversation not found." },
        { status: 404 },
      );
    }

    return NextResponse.json(
      { error: "Unable to clear Flux AI state." },
      { status: 500 },
    );
  }
}
