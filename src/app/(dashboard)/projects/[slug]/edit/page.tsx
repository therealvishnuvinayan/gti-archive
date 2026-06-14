import { notFound } from "next/navigation";

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { ProjectBackButton } from "@/components/projects/project-back-button";
import { CreateProjectWorkspace } from "@/components/projects/create-project-workspace";
import { requireUser } from "@/lib/auth";
import { getCollaborators } from "@/lib/collaboration";
import { hasPermission } from "@/lib/permissions/resolver";
import { getActiveProjectMasterDataOptions } from "@/lib/project-master-data";
import { getProjectEditAccessById, getProjectEditorById } from "@/lib/projects";

export default async function EditProjectPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const [{ slug }, user] = await Promise.all([params, requireUser()]);
  const projectAccess = await getProjectEditAccessById(slug, user);

  if (!projectAccess?.canEdit) {
    notFound();
  }

  const [project, collaborators, masterDataOptions] = await Promise.all([
    getProjectEditorById(slug, user),
    getCollaborators(),
    getActiveProjectMasterDataOptions(),
  ]);

  if (!project) {
    notFound();
  }

  const canManageProjectMasterData = hasPermission(user, "settings.manageMasterData");
  const canInviteExecutor = hasPermission(user, "collaboration.createUser");

  return (
    <DashboardLayout
      topbarProps={{
        leadingContent: <ProjectBackButton href={`/projects/${slug}`} />,
        showSearch: false,
      }}
    >
      <CreateProjectWorkspace
        availableCollaborators={collaborators}
        categoryOptions={masterDataOptions.categories}
        statusOptions={masterDataOptions.projectStatuses}
        tagOptions={masterDataOptions.tags}
        mode="edit"
        initialValues={project}
        canManageProjectMasterData={canManageProjectMasterData}
        canInviteExecutor={canInviteExecutor}
      />
    </DashboardLayout>
  );
}
