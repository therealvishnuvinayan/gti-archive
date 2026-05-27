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
import { getProjectStageHistory } from "@/lib/project-history";
import { getProjectById } from "@/lib/projects";
import { UserRole } from "@prisma/client";

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
  const [project, history] = await Promise.all([
    getProjectById(slug, user),
    getProjectStageHistory(user, slug, stage),
  ]);

  if (!project) {
    notFound();
  }

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

  const canManageCollaborators =
    user.role === UserRole.SUPER_ADMIN ||
    user.role === UserRole.ADMIN ||
    project.ownerId === user.id;

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
      />
    </DashboardLayout>
  );
}
