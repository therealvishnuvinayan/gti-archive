import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { ProjectBackButton } from "@/components/projects/project-back-button";
import { CreateProjectWorkspace } from "@/components/projects/create-project-workspace";
import { getCollaborators } from "@/lib/collaboration";

export default async function NewProjectPage() {
  const collaborators = await getCollaborators();

  return (
    <DashboardLayout
      topbarProps={{
        leadingContent: <ProjectBackButton />,
        showSearch: false,
      }}
    >
      <CreateProjectWorkspace initialCollaborators={collaborators} />
    </DashboardLayout>
  );
}
