import { redirect } from "next/navigation";

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { ProjectTrackerWorkspace } from "@/components/project-tracker/project-tracker-workspace";
import { requireUser } from "@/lib/auth";
import { getProjectTrackerWorkspace, canEditProjectTracker } from "@/lib/project-tracker";

export default async function ProjectTrackerPage() {
  const user = await requireUser();

  if (!canEditProjectTracker(user)) redirect("/");

  const workspace = await getProjectTrackerWorkspace(user);

  return (
    <DashboardLayout>
      <ProjectTrackerWorkspace initialWorkspace={workspace} />
    </DashboardLayout>
  );
}
