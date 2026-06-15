import { redirect } from "next/navigation";

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { ProjectBackButton } from "@/components/projects/project-back-button";
import { CreateProjectWorkspace } from "@/components/projects/create-project-workspace";
import { requireUser } from "@/lib/auth";
import { getCollaborators } from "@/lib/collaboration";
import { hasPermission } from "@/lib/permissions/resolver";
import { getActiveProjectMasterDataOptions } from "@/lib/project-master-data";

export default async function NewProjectPage() {
  const user = await requireUser();

  if (!hasPermission(user, "project.create")) {
    redirect("/projects");
  }

  const [collaborators, masterDataOptions] = await Promise.all([
    getCollaborators(),
    getActiveProjectMasterDataOptions(),
  ]);

  const canManageProjectMasterData = hasPermission(user, "settings.manageMasterData");
  const canInviteExecutor = hasPermission(user, "collaboration.createUser");

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
        currencyOptions={masterDataOptions.currencies}
        canManageProjectMasterData={canManageProjectMasterData}
        canInviteExecutor={canInviteExecutor}
      />
    </DashboardLayout>
  );
}
