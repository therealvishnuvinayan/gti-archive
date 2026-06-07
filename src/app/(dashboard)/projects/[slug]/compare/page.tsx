import { notFound, redirect } from "next/navigation";

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { ProjectBackButton } from "@/components/projects/project-back-button";
import { ProjectCompareWorkspace } from "@/components/projects/project-compare-workspace";
import { getProjectCompletionSummary } from "@/lib/archives";
import { requireUser } from "@/lib/auth";
import { getComparisonCommentsForPair } from "@/lib/comparison";
import {
  getStageSubmissionAttachments,
  resolveComparisonSelection,
} from "@/lib/comparison-utils";
import { hasProjectPermission } from "@/lib/permissions/resolver";
import { getProjectStageHistory } from "@/lib/project-history";
import { getProjectById } from "@/lib/projects";

export default async function ProjectComparePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ stage?: string; base?: string; compare?: string }>;
}) {
  const { slug } = await params;
  const { stage, base, compare } = await searchParams;
  const user = await requireUser();
  const project = await getProjectById(slug, user);

  if (!project) {
    notFound();
  }

  const projectContext = {
    createdById: project.ownerId,
    executorUserId: project.executorUserId ?? null,
    executors: project.executors.map((executor) => ({
      userId: executor.id,
      role: executor.role,
    })),
    collaborators: project.collaborators.map((collaborator) => ({
      userId: collaborator.id,
    })),
  };

  if (!hasProjectPermission(user, projectContext, "compare.view")) {
    notFound();
  }

  const history = await getProjectStageHistory(user, slug, stage, "compare.view");

  const completionSummary = await getProjectCompletionSummary(
    user,
    slug,
    history.activeStageId ?? stage,
  );

  if (completionSummary.isCompleted) {
    redirect(
      history.activeStageId
        ? `/projects/${slug}/chat?stage=${history.activeStageId}`
        : `/projects/${slug}/chat`,
    );
  }

  const canManageCollaborators = hasProjectPermission(
    user,
    projectContext,
    "project.manageCollaborators",
  );
  const canManageChatVisibility = hasProjectPermission(
    user,
    projectContext,
    "collaborator.pauseVisibility",
  );

  const submissions = getStageSubmissionAttachments(history.entries);
  const { baseSubmission, compareSubmission } = resolveComparisonSelection(
    submissions,
    base,
    compare,
  );
  const comparisonComments =
    history.activeStageId && baseSubmission && compareSubmission
      ? await getComparisonCommentsForPair(user, {
          projectId: slug,
          stageId: history.activeStageId,
          baseAttachmentId: baseSubmission.id,
          compareAttachmentId: compareSubmission.id,
        })
      : [];

  return (
    <DashboardLayout
      topbarProps={{
        searchPlaceholder: "Search for Projects...",
        leadingContent: (
          <ProjectBackButton
            href={
              stage
                ? `/projects/${slug}/chat?stage=${stage}`
                : `/projects/${slug}`
            }
          />
        ),
      }}
    >
      <ProjectCompareWorkspace
        key={`${history.activeStageId ?? stage ?? "no-stage"}:${baseSubmission?.id ?? "no-base"}:${compareSubmission?.id ?? "no-compare"}`}
        project={project}
        stageId={history.activeStageId ?? stage}
        history={history}
        initialBaseAttachmentId={baseSubmission?.id ?? null}
        initialCompareAttachmentId={compareSubmission?.id ?? null}
        initialComments={comparisonComments}
        canManageCollaborators={canManageCollaborators}
        canManageChatVisibility={canManageChatVisibility}
        currentUserId={user.id}
      />
    </DashboardLayout>
  );
}
