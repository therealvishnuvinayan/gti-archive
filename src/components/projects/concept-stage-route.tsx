import { Suspense } from "react";
import {
  type ProjectWorkflowStageKey,
  ProjectWorkflowStageStatus,
} from "@prisma/client";

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { ProjectBackButton } from "@/components/projects/project-back-button";
import {
  ConceptStageLoadingShell,
  ConceptStageWorkspace,
} from "@/components/projects/concept-stage-workspace";
import {
  ProjectAccessUnavailableState,
  ProjectNotFoundState,
  StageLockedState,
} from "@/components/projects/project-route-state";
import { requireUser } from "@/lib/auth";
import { getProjectRouteAvailability, getProjectShellById } from "@/lib/projects";

type ConceptStageRouteUser = Awaited<ReturnType<typeof requireUser>>;

async function ConceptStageUnavailableContent({
  slug,
  user,
}: {
  slug: string;
  user: ConceptStageRouteUser;
}) {
  const availability = await getProjectRouteAvailability(slug, user);

  return availability === "access-unavailable" ? (
    <ProjectAccessUnavailableState />
  ) : (
    <ProjectNotFoundState />
  );
}

async function ConceptStageContent({
  slug,
  stageNumber,
  stageTitle,
  stageKey,
  userPromise,
}: {
  slug: string;
  stageNumber: 3 | 4;
  stageTitle: string;
  stageKey: ProjectWorkflowStageKey;
  userPromise: Promise<ConceptStageRouteUser>;
}) {
  const user = await userPromise;
  const project = await getProjectShellById(slug, user);

  if (!project) {
    return <ConceptStageUnavailableContent slug={slug} user={user} />;
  }

  const workflowStage = project.workflowStages.find(
    (stage) => stage.stageKey === stageKey,
  );
  const stageAvailable =
    workflowStage?.status === ProjectWorkflowStageStatus.AVAILABLE ||
    workflowStage?.status === ProjectWorkflowStageStatus.COMPLETED;

  if (!stageAvailable) {
    return (
      <StageLockedState
        projectHref={`/projects/${slug}`}
        message={`Stage ${stageNumber} - ${stageTitle} is locked. Complete the preceding workflow stage before opening it.`}
      />
    );
  }

  return (
    <ConceptStageWorkspace
      stageNumber={stageNumber}
      stageTitle={stageTitle}
      project={project}
      currentUserId={user.id}
    />
  );
}

export function ConceptStageRoute({
  slug,
  stageNumber,
  stageTitle,
  stageKey,
}: {
  slug: string;
  stageNumber: 3 | 4;
  stageTitle: string;
  stageKey: ProjectWorkflowStageKey;
}) {
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
      <Suspense fallback={<ConceptStageLoadingShell />}>
        <ConceptStageContent
          slug={slug}
          stageNumber={stageNumber}
          stageTitle={stageTitle}
          stageKey={stageKey}
          userPromise={userPromise}
        />
      </Suspense>
    </DashboardLayout>
  );
}
