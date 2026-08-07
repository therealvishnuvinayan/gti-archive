import { Suspense } from "react";

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { ProjectBackButton } from "@/components/projects/project-back-button";
import {
  ProjectAccessUnavailableState,
  ProjectNotFoundState,
} from "@/components/projects/project-route-state";
import {
  StageOneLoadingShell,
  StageOneWorkspace,
} from "@/components/projects/stage-one-workspace";
import { requireUser } from "@/lib/auth";
import {
  getProjectRouteAvailability,
  getProjectShellById,
} from "@/lib/projects";

type StageOnePageUser = Awaited<ReturnType<typeof requireUser>>;

async function StageOneUnavailableContent({
  slug,
  user,
}: {
  slug: string;
  user: StageOnePageUser;
}) {
  const availability = await getProjectRouteAvailability(slug, user);

  if (availability === "access-unavailable") {
    return <ProjectAccessUnavailableState />;
  }

  return <ProjectNotFoundState />;
}

async function StageOneContent({
  slug,
  userPromise,
}: {
  slug: string;
  userPromise: Promise<StageOnePageUser>;
}) {
  const user = await userPromise;
  const project = await getProjectShellById(slug, user);

  if (!project) {
    return <StageOneUnavailableContent slug={slug} user={user} />;
  }

  return <StageOneWorkspace project={project} currentUserId={user.id} />;
}

export default async function StageOnePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const userPromise = requireUser();

  return (
    <DashboardLayout
      topbarProps={{
        showSearch: false,
        leadingContent: <ProjectBackButton href={`/projects/${slug}`} />,
      }}
    >
      <Suspense fallback={<StageOneLoadingShell />}>
        <StageOneContent slug={slug} userPromise={userPromise} />
      </Suspense>
    </DashboardLayout>
  );
}
