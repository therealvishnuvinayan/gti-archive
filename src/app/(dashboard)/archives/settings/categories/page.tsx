import { canArchive } from "@/lib/authorization/archive-rules";
import { redirect } from "next/navigation";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { ProjectMasterDataWorkspace } from "@/components/settings/project-master-data-workspace";
import { requireUser } from "@/lib/auth";
import { getProjectMasterData } from "@/lib/project-master-data";

export default async function ArchiveCategoriesPage() {
  const user = await requireUser();
  if (!canArchive(user, "archive.category.create")) redirect("/");
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
        archiveCategoryAccessUsers={masterData.archiveCategoryAccessUsers}
        summary={masterData.summary}
        canManageItems={canArchive(user, "archive.category.create")}
        canDeleteItems={canArchive(user, "archive.category.delete")}
        canManageArchiveItems={canArchive(user, "archive.category.create")}
        canDeleteArchiveItems={canArchive(user, "archive.category.delete")}
      />
    </DashboardLayout>
  );
}
