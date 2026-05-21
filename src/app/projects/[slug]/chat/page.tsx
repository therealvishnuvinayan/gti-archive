import Link from "next/link";
import { notFound } from "next/navigation";

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { ProjectChatWorkspace } from "@/components/projects/project-chat-workspace";
import { getProjectById } from "@/lib/projects";

function BackPill() {
  return (
    <Link
      href="/projects"
      className="inline-flex min-h-[52px] min-w-[140px] items-center justify-center rounded-full bg-[linear-gradient(90deg,#2f8d5d,#123f2d)] px-8 text-[18px] font-semibold text-white shadow-[0_16px_34px_rgba(34,102,70,0.2)] transition-transform hover:-translate-y-0.5"
    >
      Back
    </Link>
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
  const project = await getProjectById(slug);

  if (!project) {
    notFound();
  }

  return (
    <DashboardLayout
      topbarProps={{
        searchPlaceholder: "Search for Projects...",
        leadingContent: <BackPill />,
      }}
    >
      <ProjectChatWorkspace project={project} stageId={stage} />
    </DashboardLayout>
  );
}
