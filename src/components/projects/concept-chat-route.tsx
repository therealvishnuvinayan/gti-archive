import { UserRole } from "@prisma/client";

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { ProjectAccessUnavailableState } from "@/components/projects/project-route-state";
import { ProjectChatRoute } from "@/app/(dashboard)/projects/[slug]/chat/page";
import { requireUser } from "@/lib/auth";
import {
  getProjectConceptChatContext,
  type ConceptWorkflowStageKey,
} from "@/lib/project-concepts";

export async function ConceptChatRoute({
  projectId,
  folderId,
  stageKey,
  backHref,
}: {
  projectId: string;
  folderId: string;
  stageKey: ConceptWorkflowStageKey;
  backHref?: string;
}) {
  const user = await requireUser();
  const context = await getProjectConceptChatContext(user, {
    projectId,
    stageKey,
    folderId,
  });
  if (!context) {
    return (
      <DashboardLayout>
        <ProjectAccessUnavailableState />
      </DashboardLayout>
    );
  }

  const conceptMode =
    user.role === UserRole.USER
      ? {
          ...context.chatMode,
          stageNeutral: true,
          backHref: backHref ?? `/projects/${encodeURIComponent(projectId)}`,
          backLabel: backHref === "/tasks" ? "Back to Tasks" : "Back to Workspace",
        }
      : context.chatMode;

  return (
    <ProjectChatRoute
      slug={projectId}
      stage={context.folder.taskerStageId}
      taskerStageId={context.folder.taskerStageId}
      conceptMode={conceptMode}
    />
  );
}
