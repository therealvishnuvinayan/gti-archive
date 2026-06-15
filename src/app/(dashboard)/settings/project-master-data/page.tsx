import { redirect } from "next/navigation";

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { ProjectMasterDataWorkspace } from "@/components/settings/project-master-data-workspace";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions/resolver";
import { getProjectMasterData } from "@/lib/project-master-data";

export default async function ProjectMasterDataPage() {
  const user = await requireUser();

  if (!hasPermission(user, "settings.viewMasterData")) {
    redirect("/settings");
  }

  const masterData = await getProjectMasterData();

  return (
    <DashboardLayout>
      <ProjectMasterDataWorkspace
        categories={masterData.categories}
        projectStatusGroups={masterData.projectStatusGroups}
        projectStatuses={masterData.projectStatuses}
        tags={masterData.tags}
        assetTags={masterData.assetTags}
        archiveCategories={masterData.archiveCategories}
        summary={masterData.summary}
        canManageItems={hasPermission(user, "settings.manageMasterData")}
        canDeleteItems={hasPermission(user, "settings.deleteMasterData")}
      />
    </DashboardLayout>
  );
}
