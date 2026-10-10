import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { ProjectMasterDataWorkspace } from "@/components/settings/project-master-data-workspace";
import { requireUser } from "@/lib/auth";
import { getProjectMasterData } from "@/lib/project-master-data";

export default async function ArchiveCategoriesPage() {
  await requireUser();
  const masterData = await getProjectMasterData();

  return (
    <DashboardLayout>
      <ProjectMasterDataWorkspace
        archiveOnly
        categories={[]}
        projectStatusGroups={[]}
        projectStatuses={[]}
        tags={[]}
        assetTags={[]}
        archiveCategories={masterData.archiveCategories}
        archiveCategoryAccessUsers={[]}
        summary={masterData.summary}
        canManageItems
        canDeleteItems
      />
    </DashboardLayout>
  );
}
