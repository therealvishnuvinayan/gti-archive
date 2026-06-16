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
import type { ProjectCompletionSummary } from "@/lib/archives";
import { requireUser } from "@/lib/auth";
import {
  getProjectStageChatMessages,
  type ProjectStageChatAccessRecord,
} from "@/lib/project-history";
import {
  getProjectChatShellById,
  getProjectRouteAvailability,
} from "@/lib/projects";
import { hasProjectPermission } from "@/lib/permissions/resolver";
import {
  getStageChatTimingStart,
  logStageChatTiming,
  shouldLogStageChatTimings,
} from "@/lib/stage-chat-timing";

type ProjectChatPageUser = Awaited<ReturnType<typeof requireUser>>;
type ProjectChatShellProject = NonNullable<
  Awaited<ReturnType<typeof getProjectChatShellById>>
>;

function getProjectPermissionContext(project: ProjectChatShellProject) {
  return {
    createdById: project.ownerId,
    executors: project.executors.map((executor) => ({
      userId: executor.id,
      role: executor.role,
    })),
    collaborators: project.collaborators.map((collaborator) => ({
      userId: collaborator.id,
    })),
  };
}

function getProjectStageChatAccessRecord(
  project: ProjectChatShellProject,
): ProjectStageChatAccessRecord {
  return {
    id: project.id,
    createdById: project.ownerId,
    executors: project.executors.map((executor) => ({
      userId: executor.id,
      role: executor.role,
    })),
    collaborators: project.collaborators
      .filter((collaborator) => collaborator.id !== project.ownerId)
      .map((collaborator) => ({
        userId: collaborator.id,
      })),
    stages: project.stageCards.map((stageCard) => ({
      id: stageCard.id,
      revisionCount: stageCard.revisionCount,
      comparisonCount: stageCard.comparisonCount,
    })),
  };
}

function getInitialCompletionSummary(
  project: ProjectChatShellProject,
  stageId?: string | null,
): ProjectCompletionSummary {
  const finalStage = project.stageCards.at(-1) ?? null;
  const selectedStageId = stageId ?? project.currentStageId;
  const incompleteStages = project.stageCards
    .filter((stage) => stage.status !== "completed")
    .map((stage) => ({
      id: stage.id,
      name: stage.name,
      status: stage.statusLabel,
    }));

  return {
    isCompleted: project.isCompleted,
    completedAt: null,
    archivedAt: null,
    finalStageId: finalStage?.id ?? null,
    finalStageName: finalStage?.name ?? null,
    isSelectedStageFinal: Boolean(finalStage && selectedStageId === finalStage.id),
    canCompleteProject: false,
    approvedFileCount: 0,
    allStagesCompleted: project.stageCards.length > 0 && incompleteStages.length === 0,
    incompleteStages,
    archiveCategorySlug: null,
    archiveCategoryLabel: null,
    archivedFiles: [],
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
  project,
  pageStartedAt,
}: {
  slug: string;
  stage?: string;
  user: ProjectChatPageUser;
  project: ProjectChatShellProject;
  pageStartedAt: number;
}) {
  const history = await getProjectStageChatMessages(user, slug, stage, {
    projectAccessRecord: getProjectStageChatAccessRecord(project),
  });
  const completionSummary = getInitialCompletionSummary(
    project,
    history.activeStageId ?? stage,
  );

  if (shouldLogStageChatTimings()) {
    console.log("[stage-chat:init] completion summary query", {
      ms: 0,
      deferred: true,
    });
    console.log("[stage-chat:init] completion workflow query", {
      ms: 0,
      deferred: true,
    });
    console.log("[stage-chat:init] invoice query", {
      ms: 0,
      includedIn: "project shell",
    });
    console.log("[stage-chat:init] collaborator directory query", {
      ms: 0,
      deferred: true,
    });
  }

  const projectContext = getProjectPermissionContext(project);
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
  logStageChatTiming("init", "total page server render", pageStartedAt, {
    entries: history.entries.length,
    hasMore: Boolean(history.hasMore),
  });

  return (
    <ProjectChatWorkspace
      project={project}
      stageId={history.activeStageId ?? stage}
      history={history}
      availableCollaborators={[]}
      currentUserId={user.id}
      currentUserAvatarSrc={currentUserAvatarSrc}
      canManageCollaborators={canManageCollaborators}
      canManageChatVisibility={canManageChatVisibility}
      completionSummary={completionSummary}
      completionWorkflow={null}
      deferCompletionData
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
  const pageStartedAt = getStageChatTimingStart();
  const authStartedAt = getStageChatTimingStart();
  const user = await userPromise;
  logStageChatTiming("init", "auth/session", authStartedAt);
  const projectLookupStartedAt = getStageChatTimingStart();
  const project = await getProjectChatShellById(slug, user);
  logStageChatTiming("init", "project chat shell lookup", projectLookupStartedAt, {
    projectId: slug,
  });

  if (!project) {
    return <ProjectUnavailableContent slug={slug} user={user} />;
  }

  const permissionStartedAt = getStageChatTimingStart();
  const projectContext = getProjectPermissionContext(project);

  if (!hasProjectPermission(user, projectContext, "chat.view")) {
    return <ProjectAccessUnavailableState />;
  }
  logStageChatTiming("init", "route permission check", permissionStartedAt);

  const stageLookupStartedAt = getStageChatTimingStart();
  if (stage && !project.stageCards.some((stageCard) => stageCard.id === stage)) {
    return <StageNotFoundState projectHref={`/projects/${slug}`} />;
  }
  logStageChatTiming("init", "route stage lookup", stageLookupStartedAt, {
    stageId: stage,
  });

  return (
    <Suspense fallback={<ProjectChatLoadingShell project={project} stageId={stage} />}>
      <ProjectChatDeferredContent
        slug={slug}
        stage={stage}
        user={user}
        project={project}
        pageStartedAt={pageStartedAt}
      />
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
  const pageStartedAt = getStageChatTimingStart();
  const { slug } = await params;
  const { stage } = await searchParams;
  const userPromise = requireUser();
  logStageChatTiming("init", "page params", pageStartedAt, { slug, stage });

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
