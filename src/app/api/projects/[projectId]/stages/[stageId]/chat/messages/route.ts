import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { getProjectStageChatMessages } from "@/lib/project-history";
import { logStageChatTiming } from "@/lib/stage-chat-timing";

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
  const totalStartedAt = performance.now();
  const authStartedAt = performance.now();
  const user = await getCurrentUser();
  logStageChatTiming("init", "messages api auth/session", authStartedAt);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { projectId, stageId } = await params;
  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor");
  const limitParam = Number(url.searchParams.get("limit") ?? "30");

  try {
    const history = await getProjectStageChatMessages(user, projectId, stageId, {
      cursor,
      limit: limitParam,
    });
    logStageChatTiming("init", "messages api total", totalStartedAt, {
      entries: history.entries.length,
      hasMore: Boolean(history.hasMore),
    });

    return NextResponse.json(
      {
        activeStageId: history.activeStageId,
        latestRevisionId: history.latestRevisionId,
        entries: history.entries,
        revisionCount: history.revisionCount ?? 0,
        nextCursor: history.nextCursor ?? null,
        hasMore: Boolean(history.hasMore),
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const status = message.toLowerCase().includes("permission") ? 403 : 400;

    return NextResponse.json(
      { error: message || "Unable to load messages right now." },
      { status },
    );
  }
}
