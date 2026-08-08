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
} from "@/lib/projects";
import { getProjectResearchPageData } from "@/lib/project-research";

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
  workspaceId,
}: {
  slug: string;
  userPromise: Promise<StageTwoPageUser>;
  workspaceId?: string;
}) {
  const user = await userPromise;
  let data = null;

  try {
    data = await getProjectResearchPageData(user, slug, workspaceId);
  } catch {
    data = null;
  }

  if (!data) {
    return <StageTwoUnavailableContent slug={slug} user={user} />;
  }

  return (
    <StageTwoWorkspace
      key={data.selectedWorkspace.id}
      data={data}
      currentUserId={user.id}
    />
  );
}

export default async function StageTwoPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ workspace?: string }>;
}) {
  const { slug } = await params;
  const { workspace } = await searchParams;
  const userPromise = requireUser();

  return (
    <DashboardLayout
      topbarProps={{
        searchPlaceholder: "Search for projects, folders, files...",
        leadingContent: <ProjectBackButton href={`/projects/${slug}`} />,
      }}
    >
      <Suspense fallback={<StageTwoLoadingShell />}>
        <StageTwoContent slug={slug} userPromise={userPromise} workspaceId={workspace} />
      </Suspense>
    </DashboardLayout>
  );
}
