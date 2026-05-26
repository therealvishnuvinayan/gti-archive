import { notFound } from "next/navigation";

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { ProjectBackButton } from "@/components/projects/project-back-button";
import { ProjectDetailWorkspace } from "@/components/projects/project-detail-workspace";
import { requireUser } from "@/lib/auth";
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

  return (
    <DashboardLayout
      topbarProps={{
        searchPlaceholder: "Search for Projects...",
        leadingContent: <ProjectBackButton />,
      }}
    >
      <ProjectDetailWorkspace project={project} />
    </DashboardLayout>
  );
}
