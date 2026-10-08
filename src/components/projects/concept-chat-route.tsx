import { UserRole } from "@prisma/client";

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { ProjectAccessUnavailableState } from "@/components/projects/project-route-state";
import { ProjectChatRoute } from "@/app/(dashboard)/projects/[slug]/chat/page";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canUseTasks } from "@/lib/permissions/resolver";
import { conceptTaskAccessWhere } from "@/lib/tasker/service";
import {
  getProjectConceptChatContext,
  type ConceptWorkflowStageKey,
  type ProjectConceptChatMode,
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

  const conceptMode: ProjectConceptChatMode =
    user.role === UserRole.USER
      ? {
          ...context.chatMode,
          stageNeutral: true,
          backHref: backHref ?? `/projects/${encodeURIComponent(projectId)}`,
          backLabel: backHref === "/tasks" ? "Back to Tasks" : "Back to Workspace",
        }
      : context.chatMode;

  if (canUseTasks(user) && await prisma.projectConceptFolder.count({ where: { id: folderId, ...conceptTaskAccessWhere(user, projectId) } })) {
    conceptMode.sisterTasksHref = `/tasks/concepts/${encodeURIComponent(folderId)}/revisions`;
  }

  return (
    <ProjectChatRoute
      slug={projectId}
      stage={context.folder.taskerStageId}
      taskerStageId={context.folder.taskerStageId}
      conceptMode={conceptMode}
    />
  );
}
