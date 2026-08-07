import { Suspense } from "react";

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { ProjectBackButton } from "@/components/projects/project-back-button";
import {
  ProjectAccessUnavailableState,
  ProjectNotFoundState,
} from "@/components/projects/project-route-state";
import {
  StageTwoLoadingShell,
  StageTwoWorkspace,
} from "@/components/projects/stage-two-workspace";
import { requireUser } from "@/lib/auth";
import {
  getProjectRouteAvailability,
  getProjectShellById,
} from "@/lib/projects";

type StageTwoPageUser = Awaited<ReturnType<typeof requireUser>>;

async function StageTwoUnavailableContent({
  slug,
  user,
}: {
  slug: string;
  user: StageTwoPageUser;
}) {
  const availability = await getProjectRouteAvailability(slug, user);

  if (availability === "access-unavailable") {
    return <ProjectAccessUnavailableState />;
  }

  return <ProjectNotFoundState />;
}

async function StageTwoContent({
  slug,
  userPromise,
}: {
  slug: string;
  userPromise: Promise<StageTwoPageUser>;
}) {
  const user = await userPromise;
  const project = await getProjectShellById(slug, user);

  if (!project) {
    return <StageTwoUnavailableContent slug={slug} user={user} />;
  }

  return <StageTwoWorkspace project={project} currentUserId={user.id} />;
}

export default async function StageTwoPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const userPromise = requireUser();

  return (
    <DashboardLayout
      topbarProps={{
        searchPlaceholder: "Search for projects, folders, files...",
        leadingContent: <ProjectBackButton href={`/projects/${slug}`} />,
      }}
    >
      <Suspense fallback={<StageTwoLoadingShell />}>
        <StageTwoContent slug={slug} userPromise={userPromise} />
      </Suspense>
    </DashboardLayout>
  );
}
