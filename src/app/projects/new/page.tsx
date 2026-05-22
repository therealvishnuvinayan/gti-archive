import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { ProjectBackButton } from "@/components/projects/project-back-button";
import { CreateProjectWorkspace } from "@/components/projects/create-project-workspace";

export default function NewProjectPage() {
  return (
    <DashboardLayout
      topbarProps={{
        leadingContent: <ProjectBackButton />,
        showSearch: false,
      }}
    >
      <CreateProjectWorkspace />
    </DashboardLayout>
  );
}
