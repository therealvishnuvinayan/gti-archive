import { notFound } from "next/navigation";

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { ProjectBackButton } from "@/components/projects/project-back-button";
import { ProjectDetailWorkspace } from "@/components/projects/project-detail-workspace";
import { getProjectCompletionSummary } from "@/lib/archives";
import { requireUser } from "@/lib/auth";
import { getProjectCompletionWorkflowForUser } from "@/lib/project-completion";
import { getProjectById } from "@/lib/projects";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const user = await requireUser();
  const project = await getProjectById(slug, user);

  if (!project) {
    notFound();
  }

  const [completionSummary, completionWorkflow] = await Promise.all([
    getProjectCompletionSummary(user, slug, project.currentStageId),
    getProjectCompletionWorkflowForUser(user, slug),
  ]);

  return (
    <DashboardLayout
      topbarProps={{
        searchPlaceholder: "Search for Projects...",
        leadingContent: <ProjectBackButton />,
      }}
    >
      <ProjectDetailWorkspace
        project={project}
        completionSummary={completionSummary}
        completionWorkflow={completionWorkflow}
      />
    </DashboardLayout>
  );
}
