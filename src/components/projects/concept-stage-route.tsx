import { Suspense } from "react";

import { DashboardLayout } from "@/components/layout/dashboard-layout";
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
import {
  getProjectConceptFolders,
  type ConceptWorkflowStageKey,
} from "@/lib/project-concepts";
import { getProjectRouteAvailability, getProjectShellById } from "@/lib/projects";
import { canOpenImplementedWorkflowStage } from "@/lib/workflow-stage-access";
import { getStageFourFinalFileHandoffData } from "@/lib/stage-five";

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
  stageKey: ConceptWorkflowStageKey;
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
  const stageAvailable = canOpenImplementedWorkflowStage({
    user,
    stageKey,
    status: workflowStage?.status,
  });

  if (!stageAvailable) {
    return (
      <StageLockedState
        projectHref={`/projects/${slug}`}
        message={`Stage ${stageNumber} - ${stageTitle} is locked. Complete the preceding workflow stage before opening it.`}
      />
    );
  }

  const folders = await getProjectConceptFolders(user, slug, stageKey);

  if (!folders) {
    return <ProjectAccessUnavailableState />;
  }

  const stageFourHandoffData =
    stageNumber === 4
      ? await getStageFourFinalFileHandoffData(user, slug)
      : undefined;

  return (
    <ConceptStageWorkspace
      stageNumber={stageNumber}
      stageTitle={stageTitle}
      stageKey={stageKey}
      project={project}
      currentUserId={user.id}
      initialFolders={folders}
      stageFourHandoffData={stageFourHandoffData ?? undefined}
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
  stageKey: ConceptWorkflowStageKey;
}) {
  const userPromise = requireUser();

  return (
    <DashboardLayout>
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
