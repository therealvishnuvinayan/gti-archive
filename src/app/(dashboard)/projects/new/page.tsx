import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { ProjectBackButton } from "@/components/projects/project-back-button";
import { CreateProjectWorkspace } from "@/components/projects/create-project-workspace";
import { getCollaborators } from "@/lib/collaboration";
import { getActiveProjectMasterDataOptions } from "@/lib/project-master-data";

export default async function NewProjectPage() {
  const [collaborators, masterDataOptions] = await Promise.all([
    getCollaborators(),
    getActiveProjectMasterDataOptions(),
  ]);

  return (
    <DashboardLayout
      topbarProps={{
        leadingContent: <ProjectBackButton />,
        showSearch: false,
      }}
    >
      <CreateProjectWorkspace
        availableCollaborators={collaborators}
        categoryOptions={masterDataOptions.categories}
        tagOptions={masterDataOptions.tags}
      />
    </DashboardLayout>
  );
}
