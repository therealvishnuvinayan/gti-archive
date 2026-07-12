import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import {
  createFluxAIConversationForUser,
  listFluxAIConversationsForUser,
} from "@/lib/flux-ai/conversations";
import type { FluxAIConversationsListResponse } from "@/lib/flux-ai/types";
import { hasPermission } from "@/lib/permissions/resolver";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type CreateConversationPayload = {
  title?: unknown;
};

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
}

function forbidden() {
  return NextResponse.json(
    { error: "You do not have permission to use Flux AI." },
    { status: 403 },
  );
}

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return unauthorized();
  }

  if (!hasPermission(user, "fluxAi.view")) {
    return forbidden();
  }

  const payload: FluxAIConversationsListResponse =
    await listFluxAIConversationsForUser(user);

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return unauthorized();
  }

  if (!hasPermission(user, "fluxAi.view")) {
    return forbidden();
  }

  let payload: CreateConversationPayload = {};

  try {
    payload = (await request.json().catch(() => ({}))) as CreateConversationPayload;
  } catch {
    payload = {};
  }

  const conversation = await createFluxAIConversationForUser({
    user,
    title: typeof payload.title === "string" ? payload.title : null,
  });

  return NextResponse.json(
    { conversation },
    {
      status: 201,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
