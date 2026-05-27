import { UserRole } from "@prisma/client";

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { ProjectBackButton } from "@/components/projects/project-back-button";
import { CreateProjectWorkspace } from "@/components/projects/create-project-workspace";
import { requireUser } from "@/lib/auth";
import { getCollaborators } from "@/lib/collaboration";
import { getActiveProjectMasterDataOptions } from "@/lib/project-master-data";

export default async function NewProjectPage() {
  const [user, collaborators, masterDataOptions] = await Promise.all([
    requireUser(),
    getCollaborators(),
    getActiveProjectMasterDataOptions(),
  ]);
  const canManageProjectMasterData =
    user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN;
  const canInviteExecutor = user.role !== UserRole.COLLABORATOR;

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
