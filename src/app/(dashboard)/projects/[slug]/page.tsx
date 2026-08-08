import { Suspense } from "react";

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { ProjectBackButton } from "@/components/projects/project-back-button";
import {
  ProjectOverviewLoadingShell,
  ProjectOverviewWorkspace,
} from "@/components/projects/project-overview-workspace";
import {
  ProjectAccessUnavailableState,
  ProjectNotFoundState,
} from "@/components/projects/project-route-state";
import { requireUser } from "@/lib/auth";
import {
  getProjectRouteAvailability,
  getProjectStageShellById,
} from "@/lib/projects";
import { canBypassImplementedWorkflowStageLock } from "@/lib/workflow-stage-access";

type ProjectPageUser = Awaited<ReturnType<typeof requireUser>>;

async function ProjectUnavailableContent({
  slug,
  user,
}: {
  slug: string;
  user: ProjectPageUser;
}) {
  const availability = await getProjectRouteAvailability(slug, user);

  if (availability === "access-unavailable") {
    return <ProjectAccessUnavailableState />;
  }

  return <ProjectNotFoundState />;
}

async function ProjectOverviewContent({
  slug,
  userPromise,
}: {
  slug: string;
  userPromise: Promise<ProjectPageUser>;
}) {
  const user = await userPromise;
  const project = await getProjectStageShellById(slug, user);

  if (!project) {
    return <ProjectUnavailableContent slug={slug} user={user} />;
  }

  return (
    <ProjectOverviewWorkspace
      project={project}
      currentUserId={user.id}
      canBypassLockedStages={canBypassImplementedWorkflowStageLock(user)}
    />
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
      <Suspense fallback={<ProjectOverviewLoadingShell />}>
        <ProjectOverviewContent slug={slug} userPromise={userPromise} />
      </Suspense>
    </DashboardLayout>
  );
}
