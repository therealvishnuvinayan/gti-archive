import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { getStageChatUpdatesForUser } from "@/lib/project-history";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  request: Request,
  {
    params,
  }: {
    params: Promise<{
      projectId: string;
      stageId: string;
    }>;
  },
) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { projectId, stageId } = await params;
  const searchParams = new URL(request.url).searchParams;
  const after = searchParams.get("after");
  const limit = Number(searchParams.get("limit") ?? "50");

  try {
    const payload = await getStageChatUpdatesForUser(user, {
      projectId,
      stageId,
      after,
      limit,
    });

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load chat updates.";
    const status = message.toLowerCase().includes("permission") ? 403 : 400;

    return NextResponse.json({ error: message }, { status });
  }
}

