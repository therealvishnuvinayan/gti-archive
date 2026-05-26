import { notFound } from "next/navigation";

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { ProjectBackButton } from "@/components/projects/project-back-button";
import { ProjectChatWorkspace } from "@/components/projects/project-chat-workspace";
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
  const [project, history, availableCollaborators] = await Promise.all([
    getProjectById(slug, user),
    getProjectStageHistory(user, slug, stage),
    getCollaborators(),
  ]);

  if (!project) {
    notFound();
  }

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
      />
    </DashboardLayout>
  );
}
