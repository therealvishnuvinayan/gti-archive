import { Suspense } from "react";

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { ProjectBackButton } from "@/components/projects/project-back-button";
import { ProjectChatWorkspace } from "@/components/projects/project-chat-workspace";
import {
  ProjectAccessUnavailableState,
  ProjectNotFoundState,
  StageNotFoundState,
} from "@/components/projects/project-route-state";
import { ProjectChatLoadingShell } from "@/components/projects/project-route-loading-shells";
import { getProjectCompletionSummary } from "@/lib/archives";
import { requireUser } from "@/lib/auth";
import { getCollaborators } from "@/lib/collaboration";
import { getProjectCompletionWorkflowForUser } from "@/lib/project-completion";
import { getProjectStageHistory } from "@/lib/project-history";
import {
  getProjectById,
  getProjectRouteAvailability,
  getProjectShellById,
} from "@/lib/projects";
import { hasProjectPermission } from "@/lib/permissions/resolver";

type ProjectChatPageUser = Awaited<ReturnType<typeof requireUser>>;

function getProjectPermissionContext(project: NonNullable<Awaited<ReturnType<typeof getProjectShellById>>>) {
  return {
    createdById: project.ownerId,
    executorUserId: project.executorUserId ?? null,
    executors: project.executors.map((executor) => ({
      userId: executor.id,
      role: executor.role,
    })),
    collaborators: project.collaborators.map((collaborator) => ({
      userId: collaborator.id,
    })),
  };
}

async function ProjectUnavailableContent({
  slug,
  user,
}: {
  slug: string;
  user: ProjectChatPageUser;
}) {
  const availability = await getProjectRouteAvailability(slug, user);

  if (availability === "access-unavailable") {
    return <ProjectAccessUnavailableState />;
  }

  return <ProjectNotFoundState />;
}

async function ProjectChatDeferredContent({
  slug,
  stage,
  user,
}: {
  slug: string;
  stage?: string;
  user: ProjectChatPageUser;
}) {
  const project = await getProjectById(slug, user);

  if (!project) {
    return <ProjectUnavailableContent slug={slug} user={user} />;
  }

  const projectContext = getProjectPermissionContext(project);

  if (!hasProjectPermission(user, projectContext, "chat.view")) {
    return <ProjectAccessUnavailableState />;
  }

  if (stage && !project.stageCards.some((stageCard) => stageCard.id === stage)) {
    return <StageNotFoundState projectHref={`/projects/${slug}`} />;
  }

  const [history, availableCollaborators] = await Promise.all([
    getProjectStageHistory(user, slug, stage),
    getCollaborators(),
  ]);
  const [completionSummary, completionWorkflow] = await Promise.all([
    getProjectCompletionSummary(user, slug, history.activeStageId ?? stage),
    getProjectCompletionWorkflowForUser(user, slug),
  ]);

  const canManageCollaborators = hasProjectPermission(
    user,
    projectContext,
    "project.manageCollaborators",
  );
  const canManageChatVisibility = hasProjectPermission(
    user,
    projectContext,
    "collaborator.pauseVisibility",
  );
  const currentUserAvatarSrc = user.avatarUrl
    ? `/api/profile/avatar?v=${encodeURIComponent(user.avatarUrl)}`
    : null;

  return (
    <ProjectChatWorkspace
      project={project}
      stageId={history.activeStageId ?? stage}
      history={history}
      availableCollaborators={availableCollaborators}
      currentUserId={user.id}
      currentUserAvatarSrc={currentUserAvatarSrc}
      canManageCollaborators={canManageCollaborators}
      canManageChatVisibility={canManageChatVisibility}
      completionSummary={completionSummary}
      completionWorkflow={completionWorkflow}
    />
  );
}

async function ProjectChatShellContent({
  slug,
  stage,
  userPromise,
}: {
  slug: string;
  stage?: string;
  userPromise: Promise<ProjectChatPageUser>;
}) {
  const user = await userPromise;
  const project = await getProjectShellById(slug, user);

  if (!project) {
    return <ProjectUnavailableContent slug={slug} user={user} />;
  }

  const projectContext = getProjectPermissionContext(project);

  if (!hasProjectPermission(user, projectContext, "chat.view")) {
    return <ProjectAccessUnavailableState />;
  }

  if (stage && !project.stageCards.some((stageCard) => stageCard.id === stage)) {
    return <StageNotFoundState projectHref={`/projects/${slug}`} />;
  }

  return (
    <Suspense fallback={<ProjectChatLoadingShell project={project} stageId={stage} />}>
      <ProjectChatDeferredContent slug={slug} stage={stage} user={user} />
    </Suspense>
  );
}

export default async function ProjectChatPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ stage?: string }>;
}) {
  const { slug } = await params;
  const { stage } = await searchParams;
  const userPromise = requireUser();

  return (
    <DashboardLayout
      topbarProps={{
        searchPlaceholder: "Search for Projects...",
        leadingContent: <ProjectBackButton href={`/projects/${slug}`} />,
      }}
    >
      <Suspense fallback={<ProjectChatLoadingShell stageId={stage} />}>
        <ProjectChatShellContent
          slug={slug}
          stage={stage}
          userPromise={userPromise}
        />
      </Suspense>
    </DashboardLayout>
  );
}
