import { notFound } from "next/navigation";

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { ProjectBackButton } from "@/components/projects/project-back-button";
import { ProjectChatWorkspace } from "@/components/projects/project-chat-workspace";
import { requireUser } from "@/lib/auth";
import { getProjectStageHistory } from "@/lib/project-history";
import { getProjectById } from "@/lib/projects";

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
  const [project, history] = await Promise.all([
    getProjectById(slug),
    getProjectStageHistory(user, slug, stage),
  ]);

  if (!project) {
    notFound();
  }

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
      />
    </DashboardLayout>
  );
}
