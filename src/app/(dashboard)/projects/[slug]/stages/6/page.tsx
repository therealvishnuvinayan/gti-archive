import { Suspense } from "react";
import { ProjectWorkflowStageKey } from "@prisma/client";

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { ProjectBackButton } from "@/components/projects/project-back-button";
import {
  ProjectAccessUnavailableState,
  ProjectNotFoundState,
  StageLockedState,
} from "@/components/projects/project-route-state";
import {
  StageSixLoadingShell,
  StageSixWorkspace,
} from "@/components/projects/stage-six-workspace";
import { requireUser } from "@/lib/auth";
import { getProjectRouteAvailability, getProjectStageShellById } from "@/lib/projects";
import { decodeRouteParam } from "@/lib/route-params";
import { canOpenImplementedWorkflowStage } from "@/lib/workflow-stage-access";

type StageSixUser = Awaited<ReturnType<typeof requireUser>>;

async function StageSixUnavailableContent({
  slug,
  user,
}: {
  slug: string;
  user: StageSixUser;
}) {
  const availability = await getProjectRouteAvailability(slug, user);

  return availability === "access-unavailable" ? (
    <ProjectAccessUnavailableState />
  ) : (
    <ProjectNotFoundState />
  );
}

async function StageSixContent({
  slug,
  userPromise,
}: {
  slug: string;
  userPromise: Promise<StageSixUser>;
}) {
  const user = await userPromise;
  const project = await getProjectStageShellById(slug, user);

  if (!project) {
    return <StageSixUnavailableContent slug={slug} user={user} />;
  }

  const workflowStage = project.workflowStages.find(
    (stage) =>
      stage.stageKey === ProjectWorkflowStageKey.PRODUCTION_AND_HANDOVER,
  );

  if (
    !canOpenImplementedWorkflowStage({
      user,
      stageKey: ProjectWorkflowStageKey.PRODUCTION_AND_HANDOVER,
      status: workflowStage?.status,
    })
  ) {
    return (
      <StageLockedState
        projectHref={`/projects/${slug}`}
        message="Stage 6 - Handover & Approval is locked. Complete the preceding workflow stage before opening it."
      />
    );
  }

  return <StageSixWorkspace project={project} currentUserId={user.id} />;
}

export default async function StageSixPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug: rawSlug } = await params;
  const slug = decodeRouteParam(rawSlug);
  const userPromise = requireUser();

  return (
    <DashboardLayout
      topbarProps={{
        showSearch: false,
        leadingContent: (
          <ProjectBackButton
            href={`/projects/${slug}`}
            label="Back to Project Overview"
          />
        ),
      }}
    >
      <Suspense fallback={<StageSixLoadingShell />}>
        <StageSixContent slug={slug} userPromise={userPromise} />
      </Suspense>
    </DashboardLayout>
  );
}
