import { redirect } from "next/navigation";

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { ProjectMasterDataWorkspace } from "@/components/settings/project-master-data-workspace";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions/resolver";
import { getProjectMasterData } from "@/lib/project-master-data";

export default async function ProjectMasterDataPage() {
  const user = await requireUser();

  if (!hasPermission(user, "settings.manageMasterData")) {
    redirect("/settings");
  }

  const masterData = await getProjectMasterData();

  return (
    <DashboardLayout>
      <ProjectMasterDataWorkspace
        categories={masterData.categories}
        tags={masterData.tags}
        currencies={masterData.currencies}
        summary={masterData.summary}
        canDeleteItems={hasPermission(user, "settings.deleteMasterData")}
      />
    </DashboardLayout>
  );
}
