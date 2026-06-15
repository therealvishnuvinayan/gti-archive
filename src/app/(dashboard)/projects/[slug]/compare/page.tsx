import { redirect } from "next/navigation";
import { Suspense } from "react";

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { ProjectBackButton } from "@/components/projects/project-back-button";
import { ProjectCompareWorkspace } from "@/components/projects/project-compare-workspace";
import {
  ProjectAccessUnavailableState,
  ProjectNotFoundState,
  StageNotFoundState,
} from "@/components/projects/project-route-state";
import { ProjectCompareLoadingShell } from "@/components/projects/project-route-loading-shells";
import { getProjectCompletionSummary } from "@/lib/archives";
import { requireUser } from "@/lib/auth";
import { getComparisonCommentsForPair } from "@/lib/comparison";
import {
  getStageSubmissionAttachments,
  resolveComparisonSelection,
} from "@/lib/comparison-utils";
import { hasProjectPermission } from "@/lib/permissions/resolver";
import { getProjectStageHistory } from "@/lib/project-history";
import {
  getProjectById,
  getProjectRouteAvailability,
  getProjectShellById,
} from "@/lib/projects";

type ProjectComparePageUser = Awaited<ReturnType<typeof requireUser>>;

function getProjectPermissionContext(project: NonNullable<Awaited<ReturnType<typeof getProjectShellById>>>) {
  return {
    createdById: project.ownerId,
    executors: project.executors.map((executor) => ({
      userId: executor.id,
      role: executor.role,
    })),
    collaborators: project.collaborators.map((collaborator) => ({
      userId: collaborator.id,
    })),
  };
}

async function ProjectUnavailableContent({
  slug,
  user,
}: {
  slug: string;
  user: ProjectComparePageUser;
}) {
  const availability = await getProjectRouteAvailability(slug, user);

  if (availability === "access-unavailable") {
    return <ProjectAccessUnavailableState />;
  }

  return <ProjectNotFoundState />;
}

async function ProjectCompareDeferredContent({
  slug,
  stage,
  base,
  compare,
  user,
}: {
  slug: string;
  stage?: string;
  base?: string;
  compare?: string;
  user: ProjectComparePageUser;
}) {
  const project = await getProjectById(slug, user);

  if (!project) {
    return <ProjectUnavailableContent slug={slug} user={user} />;
  }

  const projectContext = getProjectPermissionContext(project);

  if (!hasProjectPermission(user, projectContext, "compare.view")) {
    return <ProjectAccessUnavailableState />;
  }

  if (stage && !project.stageCards.some((stageCard) => stageCard.id === stage)) {
    return <StageNotFoundState projectHref={`/projects/${slug}`} />;
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
  );
}

async function ProjectCompareShellContent({
  slug,
  stage,
  base,
  compare,
  userPromise,
}: {
  slug: string;
  stage?: string;
  base?: string;
  compare?: string;
  userPromise: Promise<ProjectComparePageUser>;
}) {
  const user = await userPromise;
  const project = await getProjectShellById(slug, user);

  if (!project) {
    return <ProjectUnavailableContent slug={slug} user={user} />;
  }

  const projectContext = getProjectPermissionContext(project);

  if (!hasProjectPermission(user, projectContext, "compare.view")) {
    return <ProjectAccessUnavailableState />;
  }

  if (stage && !project.stageCards.some((stageCard) => stageCard.id === stage)) {
    return <StageNotFoundState projectHref={`/projects/${slug}`} />;
  }

  return (
    <Suspense fallback={<ProjectCompareLoadingShell project={project} stageId={stage} />}>
      <ProjectCompareDeferredContent
        slug={slug}
        stage={stage}
        base={base}
        compare={compare}
        user={user}
      />
    </Suspense>
  );
}

export default async function ProjectComparePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ stage?: string; base?: string; compare?: string }>;
}) {
  const { slug } = await params;
  const { stage, base, compare } = await searchParams;
  const userPromise = requireUser();

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
      <Suspense fallback={<ProjectCompareLoadingShell stageId={stage} />}>
        <ProjectCompareShellContent
          slug={slug}
          stage={stage}
          base={base}
          compare={compare}
          userPromise={userPromise}
        />
      </Suspense>
    </DashboardLayout>
  );
}
