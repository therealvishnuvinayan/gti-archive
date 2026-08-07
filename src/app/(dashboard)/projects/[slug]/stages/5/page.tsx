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
  StageFiveLoadingShell,
  StageFiveWorkspace,
} from "@/components/projects/stage-five-workspace";
import { requireUser } from "@/lib/auth";
import { getProjectRouteAvailability, getProjectShellById } from "@/lib/projects";
import { decodeRouteParam } from "@/lib/route-params";
import { canOpenImplementedWorkflowStage } from "@/lib/workflow-stage-access";

type StageFiveUser = Awaited<ReturnType<typeof requireUser>>;

async function StageFiveUnavailableContent({
  slug,
  user,
}: {
  slug: string;
  user: StageFiveUser;
}) {
  const availability = await getProjectRouteAvailability(slug, user);

  return availability === "access-unavailable" ? (
    <ProjectAccessUnavailableState />
  ) : (
    <ProjectNotFoundState />
  );
}

async function StageFiveContent({
  slug,
  userPromise,
}: {
  slug: string;
  userPromise: Promise<StageFiveUser>;
}) {
  const user = await userPromise;
  const project = await getProjectShellById(slug, user);

  if (!project) {
    return <StageFiveUnavailableContent slug={slug} user={user} />;
  }

  const workflowStage = project.workflowStages.find(
    (stage) => stage.stageKey === ProjectWorkflowStageKey.FINAL_LAYOUT,
  );

  if (
    !canOpenImplementedWorkflowStage({
      user,
      stageKey: ProjectWorkflowStageKey.FINAL_LAYOUT,
      status: workflowStage?.status,
    })
  ) {
    return (
      <StageLockedState
        projectHref={`/projects/${slug}`}
        message="Stage 5 - File Checklist is locked. Complete the preceding workflow stage before opening it."
      />
    );
  }

  return <StageFiveWorkspace project={project} currentUserId={user.id} />;
}

export default async function StageFivePage({
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
      <Suspense fallback={<StageFiveLoadingShell />}>
        <StageFiveContent slug={slug} userPromise={userPromise} />
      </Suspense>
    </DashboardLayout>
  );
}
