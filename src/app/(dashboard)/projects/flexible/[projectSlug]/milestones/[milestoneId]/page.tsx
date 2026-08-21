import { notFound, redirect } from "next/navigation";

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { FlexibleMilestoneWorkspace } from "@/components/projects/flexible-milestone-workspace";
import { requireUser } from "@/lib/auth";
import { getFlexibleMilestoneDetail } from "@/lib/flexible-projects";
import { canUseProjects } from "@/lib/permissions/resolver";

export default async function FlexibleMilestonePage({
  params,
}: {
  params: Promise<{ projectSlug: string; milestoneId: string }>;
}) {
  const [{ projectSlug, milestoneId }, user] = await Promise.all([params, requireUser()]);

  if (!canUseProjects(user)) {
    redirect("/no-access");
  }

  const detail = await getFlexibleMilestoneDetail(projectSlug, milestoneId, user);
  if (!detail) notFound();

  return (
    <DashboardLayout>
      <FlexibleMilestoneWorkspace
        project={detail.project}
        milestone={detail.milestone}
      />
    </DashboardLayout>
  );
}
