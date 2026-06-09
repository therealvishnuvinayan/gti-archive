import { notFound } from "next/navigation";
import { Suspense } from "react";

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { ProjectBackButton } from "@/components/projects/project-back-button";
import { ProjectDetailWorkspace } from "@/components/projects/project-detail-workspace";
import { ProjectDetailRouteLoadingShell } from "@/components/projects/project-route-loading-shells";
import { getProjectCompletionSummary } from "@/lib/archives";
import { requireUser } from "@/lib/auth";
import { getProjectCompletionWorkflowForUser } from "@/lib/project-completion";
import { getProjectById, getProjectShellById } from "@/lib/projects";

type ProjectPageUser = Awaited<ReturnType<typeof requireUser>>;

async function ProjectDetailDeferredContent({
  slug,
  user,
}: {
  slug: string;
  user: ProjectPageUser;
}) {
  const project = await getProjectById(slug, user);

  if (!project) {
    notFound();
  }

  const [completionSummary, completionWorkflow] = await Promise.all([
    getProjectCompletionSummary(user, slug, project.currentStageId),
    getProjectCompletionWorkflowForUser(user, slug),
  ]);

  return (
    <ProjectDetailWorkspace
      project={project}
      completionSummary={completionSummary}
      completionWorkflow={completionWorkflow}
    />
  );
}

async function ProjectDetailShellContent({
  slug,
  userPromise,
}: {
  slug: string;
  userPromise: Promise<ProjectPageUser>;
}) {
  const user = await userPromise;
  const project = await getProjectShellById(slug, user);

  if (!project) {
    notFound();
  }

  return (
    <Suspense
      fallback={
        <ProjectDetailWorkspace
          project={project}
          completionWorkflow={null}
          assetsLoading
          completionLoading
        />
      }
    >
      <ProjectDetailDeferredContent slug={slug} user={user} />
    </Suspense>
  );
}

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const userPromise = requireUser();

  return (
    <DashboardLayout
      topbarProps={{
        searchPlaceholder: "Search for Projects...",
        leadingContent: <ProjectBackButton />,
      }}
    >
      <Suspense fallback={<ProjectDetailRouteLoadingShell />}>
        <ProjectDetailShellContent slug={slug} userPromise={userPromise} />
      </Suspense>
    </DashboardLayout>
  );
}
