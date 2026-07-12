import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import {
  deleteFluxAIConversationForUser,
  FluxAIConversationAccessError,
  getFluxAIConversationDetailForUser,
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

function notFound() {
  return NextResponse.json(
    { error: "Flux AI conversation not found." },
    { status: 404 },
  );
}

export async function GET(
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
    const detail = await getFluxAIConversationDetailForUser({
      user,
      conversationId,
    });

    return NextResponse.json(detail, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof FluxAIConversationAccessError) {
      return notFound();
    }

    return NextResponse.json(
      { error: "Unable to load Flux AI conversation." },
      { status: 500 },
    );
  }
}

export async function DELETE(
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

  if (!hasPermission(user, "fluxAi.deleteOwnConversation")) {
    return NextResponse.json(
      { error: "You do not have permission to delete Flux AI chats." },
      { status: 403 },
    );
  }

  const { conversationId } = await params;

  try {
    await deleteFluxAIConversationForUser({
      user,
      conversationId,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof FluxAIConversationAccessError) {
      return notFound();
    }

    return NextResponse.json(
      { error: "Unable to delete Flux AI conversation." },
      { status: 500 },
    );
  }
}
