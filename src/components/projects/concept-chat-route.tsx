import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { ProjectBackButton } from "@/components/projects/project-back-button";
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
  stageNumber,
  stageKey,
}: {
  projectId: string;
  folderId: string;
  stageNumber: 3 | 4;
  stageKey: ConceptWorkflowStageKey;
}) {
  const user = await requireUser();
  const context = await getProjectConceptChatContext(user, {
    projectId,
    stageKey,
    folderId,
  });
  const overviewHref = `/projects/${projectId}/stages/${stageNumber}`;

  if (!context) {
    return (
      <DashboardLayout
        topbarProps={{
          showSearch: false,
          leadingContent: (
            <ProjectBackButton
              href={overviewHref}
              label="Back to Concept Folders"
            />
          ),
        }}
      >
        <ProjectAccessUnavailableState />
      </DashboardLayout>
    );
  }

  return (
    <ProjectChatRoute
      slug={projectId}
      stage={context.folder.taskerStageId}
      taskerStageId={context.folder.taskerStageId}
      backHref={overviewHref}
      backLabel="Back to Concept Folders"
    />
  );
}
