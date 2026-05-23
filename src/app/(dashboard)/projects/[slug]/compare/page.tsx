import { notFound } from "next/navigation";

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { ProjectBackButton } from "@/components/projects/project-back-button";
import { ProjectCompareWorkspace } from "@/components/projects/project-compare-workspace";
import { getProjectById } from "@/lib/projects";

export default async function ProjectComparePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ stage?: string }>;
}) {
  const { slug } = await params;
  const { stage } = await searchParams;
  const project = await getProjectById(slug);

  if (!project) {
    notFound();
  }

  return (
    <DashboardLayout
      topbarProps={{
        searchPlaceholder: "Search for Projects...",
        leadingContent: <ProjectBackButton />,
      }}
    >
      <ProjectCompareWorkspace project={project} stageId={stage} />
    </DashboardLayout>
  );
}
