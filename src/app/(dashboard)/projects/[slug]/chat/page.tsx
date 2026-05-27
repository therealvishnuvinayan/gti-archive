import { notFound } from "next/navigation";

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { ProjectBackButton } from "@/components/projects/project-back-button";
import { ProjectChatWorkspace } from "@/components/projects/project-chat-workspace";
import { getProjectCompletionSummary } from "@/lib/archives";
import { requireUser } from "@/lib/auth";
import { getCollaborators } from "@/lib/collaboration";
import { getProjectStageHistory } from "@/lib/project-history";
import { getProjectById } from "@/lib/projects";
import { UserRole } from "@prisma/client";

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

  const [history, availableCollaborators] = await Promise.all([
    getProjectStageHistory(user, slug, stage),
    getCollaborators(),
  ]);
  const completionSummary = await getProjectCompletionSummary(
    user,
    slug,
    history.activeStageId ?? stage,
  );

  const canManageCollaborators =
    user.role === UserRole.SUPER_ADMIN ||
    user.role === UserRole.ADMIN ||
    project.ownerId === user.id;

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
        canManageCollaborators={canManageCollaborators}
        completionSummary={completionSummary}
      />
    </DashboardLayout>
  );
}
