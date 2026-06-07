import { notFound } from "next/navigation";

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { ProjectBackButton } from "@/components/projects/project-back-button";
import { ProjectChatWorkspace } from "@/components/projects/project-chat-workspace";
import { getProjectCompletionSummary } from "@/lib/archives";
import { requireUser } from "@/lib/auth";
import { getCollaborators } from "@/lib/collaboration";
import { getProjectCompletionWorkflowForUser } from "@/lib/project-completion";
import { getProjectStageHistory } from "@/lib/project-history";
import { getProjectById } from "@/lib/projects";
import { hasProjectPermission } from "@/lib/permissions/resolver";

export default async function ProjectChatPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ stage?: string }>;
}) {
  const { slug } = await params;
  const { stage } = await searchParams;
  const user = await requireUser();
  const project = await getProjectById(slug, user);

  if (!project) {
    notFound();
  }

  const projectContext = {
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

  if (!hasProjectPermission(user, projectContext, "chat.view")) {
    notFound();
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
  const currentUserAvatarSrc = user.avatarUrl
    ? `/api/profile/avatar?v=${encodeURIComponent(user.avatarUrl)}`
    : null;

  return (
    <DashboardLayout
      topbarProps={{
        searchPlaceholder: "Search for Projects...",
        leadingContent: <ProjectBackButton href={`/projects/${slug}`} />,
      }}
    >
      <ProjectChatWorkspace
        project={project}
        stageId={history.activeStageId ?? stage}
        history={history}
        availableCollaborators={availableCollaborators}
        currentUserId={user.id}
        currentUserAvatarSrc={currentUserAvatarSrc}
        canManageCollaborators={canManageCollaborators}
        completionSummary={completionSummary}
        completionWorkflow={completionWorkflow}
      />
    </DashboardLayout>
  );
}
