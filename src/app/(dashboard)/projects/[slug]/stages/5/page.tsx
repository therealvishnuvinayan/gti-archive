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
import { getStageFiveWorkspaceData } from "@/lib/stage-five";

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
  initialHandoffId,
  initialMode,
}: {
  slug: string;
  userPromise: Promise<StageFiveUser>;
  initialHandoffId?: string;
  initialMode?: "edit" | "view";
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

  const pageData = await getStageFiveWorkspaceData(user, slug);

  if (!pageData) {
    return <ProjectAccessUnavailableState />;
  }

  return (
    <StageFiveWorkspace
      project={project}
      currentUserId={user.id}
      pageData={pageData}
      initialHandoffId={initialHandoffId}
      initialMode={initialMode}
    />
  );
}

export default async function StageFivePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ file?: string; mode?: string }>;
}) {
  const { slug: rawSlug } = await params;
  const query = await searchParams;
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
        <StageFiveContent
          slug={slug}
          userPromise={userPromise}
          initialHandoffId={query.file}
          initialMode={query.mode === "view" ? "view" : "edit"}
        />
      </Suspense>
    </DashboardLayout>
  );
}
