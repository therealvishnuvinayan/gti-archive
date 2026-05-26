import { redirect } from "next/navigation";
import { UserRole } from "@prisma/client";

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { ProjectMasterDataWorkspace } from "@/components/settings/project-master-data-workspace";
import { requireUser } from "@/lib/auth";
import { getProjectMasterData } from "@/lib/project-master-data";

export default async function ProjectMasterDataPage() {
  const user = await requireUser();

  if (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN) {
    redirect("/settings");
  }

  const masterData = await getProjectMasterData();

  return (
    <DashboardLayout>
      <ProjectMasterDataWorkspace
        categories={masterData.categories}
        tags={masterData.tags}
        summary={masterData.summary}
      />
    </DashboardLayout>
  );
}
