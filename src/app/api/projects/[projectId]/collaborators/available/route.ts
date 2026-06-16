import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { getCollaborators } from "@/lib/collaboration";
import { hasProjectPermission } from "@/lib/permissions/resolver";
import { getProjectChatShellById } from "@/lib/projects";
import { logStageChatTiming } from "@/lib/stage-chat-timing";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  _request: Request,
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
  logStageChatTiming("init", "collaborator directory auth/session", authStartedAt);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { projectId } = await params;

  try {
    const projectLookupStartedAt = performance.now();
    const project = await getProjectChatShellById(projectId, user);
    logStageChatTiming(
      "init",
      "collaborator directory project lookup",
      projectLookupStartedAt,
      { projectId },
    );

    if (!project) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }

    const projectContext = {
      createdById: project.ownerId,
      executors: project.executors.map((executor) => ({
        userId: executor.id,
        role: executor.role,
      })),
      collaborators: project.collaborators.map((collaborator) => ({
        userId: collaborator.id,
      })),
    };

    if (!hasProjectPermission(user, projectContext, "project.manageCollaborators")) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const collaboratorsStartedAt = performance.now();
    const collaborators = await getCollaborators();
    logStageChatTiming(
      "init",
      "collaborator directory query",
      collaboratorsStartedAt,
      { collaborators: collaborators.length },
    );
    logStageChatTiming("init", "collaborator directory api total", totalStartedAt);

    return NextResponse.json(
      { collaborators },
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
      { error: message || "Unable to load collaborators right now." },
      { status },
    );
  }
}
