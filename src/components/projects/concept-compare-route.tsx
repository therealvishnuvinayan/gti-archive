import { Suspense } from "react";

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { ProjectBackButton } from "@/components/projects/project-back-button";
import { ProjectCompareWorkspace } from "@/components/projects/project-compare-workspace";
import { ProjectCompareLoadingShell } from "@/components/projects/project-route-loading-shells";
import { ProjectAccessUnavailableState } from "@/components/projects/project-route-state";
import { requireUser } from "@/lib/auth";
import { getComparisonCommentsForPair } from "@/lib/comparison";
import {
  getStageSubmissionAttachments,
  resolveComparisonSelection,
} from "@/lib/comparison-utils";
import {
  getProjectConceptChatContext,
  type ConceptWorkflowStageKey,
  type ProjectConceptChatMode,
} from "@/lib/project-concepts";
import { getProjectStageHistory } from "@/lib/project-history";
import { getProjectChatShellById } from "@/lib/projects";

type ConceptCompareUser = Awaited<ReturnType<typeof requireUser>>;

async function ConceptCompareContent({
  projectId,
  taskerStageId,
  chatMode,
  base,
  compare,
  user,
}: {
  projectId: string;
  taskerStageId: string;
  chatMode: ProjectConceptChatMode;
  base?: string;
  compare?: string;
  user: ConceptCompareUser;
}) {
  const [project, history] = await Promise.all([
    getProjectChatShellById(projectId, user, {
      taskerStageIds: [taskerStageId],
      participantUserIds: chatMode.participantUserIds,
      includeStageInvoiceData: false,
    }),
    getProjectStageHistory(user, projectId, taskerStageId, "compare.view"),
  ]);

  if (!project || history.activeStageId !== taskerStageId) {
    return <ProjectAccessUnavailableState />;
  }

  const submissions = getStageSubmissionAttachments(history.entries, project.category);
  const { baseSubmission, compareSubmission } = resolveComparisonSelection(
    submissions,
    base,
    compare,
  );
  const initialComments =
    baseSubmission && compareSubmission
      ? await getComparisonCommentsForPair(user, {
          projectId,
          stageId: taskerStageId,
          baseAttachmentId: baseSubmission.id,
          compareAttachmentId: compareSubmission.id,
        })
      : [];

  return (
    <ProjectCompareWorkspace
      key={`${chatMode.folderId}:${baseSubmission?.id ?? "no-base"}:${compareSubmission?.id ?? "no-compare"}`}
      project={project}
      stageId={taskerStageId}
      history={history}
      initialBaseAttachmentId={baseSubmission?.id ?? null}
      initialCompareAttachmentId={compareSubmission?.id ?? null}
      initialComments={initialComments}
      canManageCollaborators={false}
      canManageChatVisibility={false}
      canAddCaptions={chatMode.canReview}
      currentUserId={user.id}
      conceptMode={chatMode}
    />
  );
}

export async function ConceptCompareRoute({
  projectId,
  folderId,
  stageKey,
  base,
  compare,
}: {
  projectId: string;
  folderId: string;
  stageKey: ConceptWorkflowStageKey;
  base?: string;
  compare?: string;
}) {
  const user = await requireUser();
  const context = await getProjectConceptChatContext(user, {
    projectId,
    folderId,
    stageKey,
  });

  if (!context) {
    return (
      <DashboardLayout>
        <ProjectAccessUnavailableState />
      </DashboardLayout>
    );
  }

  const conceptChatHref = `/projects/${encodeURIComponent(projectId)}/stages/${context.chatMode.stageNumber}/concepts/${encodeURIComponent(folderId)}`;

  return (
    <DashboardLayout
      topbarProps={{
        searchPlaceholder: "Search for Projects...",
        leadingContent: <ProjectBackButton href={conceptChatHref} />,
      }}
    >
      <Suspense fallback={<ProjectCompareLoadingShell stageId={context.folder.taskerStageId} />}>
        <ConceptCompareContent
          projectId={projectId}
          taskerStageId={context.folder.taskerStageId}
          chatMode={context.chatMode}
          base={base}
          compare={compare}
          user={user}
        />
      </Suspense>
    </DashboardLayout>
  );
}
