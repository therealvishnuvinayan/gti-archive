import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { getProjectStageHistory } from "@/lib/project-history";
import { generateOrFetchStageActivitySummary } from "@/lib/project-stage-summary";
import { getProjectById } from "@/lib/projects";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  _request: Request,
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
  const project = await getProjectById(projectId, user);

  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const stage = project.stageCards.find((item) => item.id === stageId);

  if (!stage) {
    return NextResponse.json({ error: "Stage not found." }, { status: 404 });
  }

  try {
    const history = await getProjectStageHistory(user, projectId, stageId);
    const summary = await generateOrFetchStageActivitySummary({
      userId: user.id,
      projectId,
      stage,
      entries: history.entries,
    });

    return NextResponse.json(
      { summary },
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
      { error: "Unable to load stage summary right now." },
      { status },
    );
  }
}
