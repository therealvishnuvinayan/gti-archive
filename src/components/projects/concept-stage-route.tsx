import { Suspense } from "react";
import { FolderKanban } from "lucide-react";

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import {
  ConceptStageWorkspace,
} from "@/components/projects/concept-stage-workspace";
import {
  StageRouteInitialShell,
  StageRouteShell,
  StageSectionLoadingShell,
} from "@/components/projects/stage-route-shell";
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
import { getProjectRouteAvailability, getProjectStageShellById } from "@/lib/projects";
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
  const project = await getProjectStageShellById(slug, user);

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

  return (
    <section className="mx-auto w-full max-w-[1420px] pb-8">
      <StageRouteShell
        project={project}
        currentUserId={user.id}
        eyebrow="Concept Workspace"
        title={`Stage ${stageNumber} - ${stageTitle}`}
        description="Create and manage concept folders."
        icon={<FolderKanban className="h-4 w-4" />}
      />
      <Suspense fallback={<StageSectionLoadingShell rows={3} />}>
        <ConceptStageDataContent
          slug={slug}
          stageNumber={stageNumber}
          stageTitle={stageTitle}
          stageKey={stageKey}
          user={user}
          project={project}
        />
      </Suspense>
    </section>
  );
}

async function ConceptStageDataContent({
  slug,
  stageNumber,
  stageTitle,
  stageKey,
  user,
  project,
}: {
  slug: string;
  stageNumber: 3 | 4;
  stageTitle: string;
  stageKey: ConceptWorkflowStageKey;
  user: ConceptStageRouteUser;
  project: NonNullable<Awaited<ReturnType<typeof getProjectStageShellById>>>;
}) {
  const [folders, stageFourHandoffData] = await Promise.all([
    getProjectConceptFolders(user, slug, stageKey),
    stageNumber === 4
      ? getStageFourFinalFileHandoffData(user, slug)
      : Promise.resolve(undefined),
  ]);

  if (!folders) {
    return <ProjectAccessUnavailableState />;
  }

  return (
    <ConceptStageWorkspace
      stageNumber={stageNumber}
      stageTitle={stageTitle}
      stageKey={stageKey}
      project={project}
      currentUserId={user.id}
      initialFolders={folders}
      stageFourHandoffData={stageFourHandoffData ?? undefined}
      showChrome={false}
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
      <Suspense fallback={<StageRouteInitialShell />}>
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
