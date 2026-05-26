import { notFound } from "next/navigation";
import { UserRole } from "@prisma/client";

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { ProjectBackButton } from "@/components/projects/project-back-button";
import { CreateProjectWorkspace } from "@/components/projects/create-project-workspace";
import { requireUser } from "@/lib/auth";
import { getCollaborators } from "@/lib/collaboration";
import { getActiveProjectMasterDataOptions } from "@/lib/project-master-data";
import { getProjectEditorById } from "@/lib/projects";

export default async function EditProjectPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const [{ slug }, user] = await Promise.all([params, requireUser()]);

  if (user.role === UserRole.COLLABORATOR) {
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
        tagOptions={masterDataOptions.tags}
        currencyOptions={masterDataOptions.currencies}
        mode="edit"
        initialValues={project}
      />
    </DashboardLayout>
  );
}
