import { notFound, redirect } from "next/navigation";

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { FlexibleMilestoneWorkspace } from "@/components/projects/flexible-milestone-workspace";
import { requireUser } from "@/lib/auth";
import { getFlexibleMilestoneFixture } from "@/lib/flexible-project-ui-fixtures";
import { hasPermission } from "@/lib/permissions/resolver";

export default async function FlexibleMilestonePrototypePage({
  params,
}: {
  params: Promise<{ projectSlug: string; milestoneId: string }>;
}) {
  const [{ projectSlug, milestoneId }, user] = await Promise.all([params, requireUser()]);

  if (!hasPermission(user, "project.list")) {
    redirect("/no-access");
  }

  const fixture = getFlexibleMilestoneFixture(projectSlug, milestoneId);
  if (!fixture) notFound();

  return (
    <DashboardLayout>
      <FlexibleMilestoneWorkspace
        project={fixture.project}
        milestone={fixture.milestone}
      />
    </DashboardLayout>
  );
}

