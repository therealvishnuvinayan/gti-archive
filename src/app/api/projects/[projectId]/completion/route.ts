import { NextResponse } from "next/server";

import { getProjectCompletionSummary } from "@/lib/archives";
import { getCurrentUser } from "@/lib/auth";
import { getProjectCompletionWorkflowForUser } from "@/lib/project-completion";
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
    }>;
  },
) {
  const totalStartedAt = performance.now();
  const authStartedAt = performance.now();
  const user = await getCurrentUser();
  logStageChatTiming("init", "completion api auth/session", authStartedAt);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { projectId } = await params;
  const url = new URL(request.url);
  const stageId = url.searchParams.get("stage");

  try {
    const summaryStartedAt = performance.now();
    const summaryPromise = getProjectCompletionSummary(user, projectId, stageId).finally(() =>
      logStageChatTiming("init", "completion summary query", summaryStartedAt),
    );
    const workflowStartedAt = performance.now();
    const workflowPromise = getProjectCompletionWorkflowForUser(user, projectId).finally(() =>
      logStageChatTiming("init", "completion workflow query", workflowStartedAt),
    );
    const [completionSummary, completionWorkflow] = await Promise.all([
      summaryPromise,
      workflowPromise,
    ]);
    logStageChatTiming("init", "completion api total", totalStartedAt);

    return NextResponse.json(
      {
        completionSummary,
        completionWorkflow,
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
      { error: message || "Unable to load completion details right now." },
      { status },
    );
  }
}
