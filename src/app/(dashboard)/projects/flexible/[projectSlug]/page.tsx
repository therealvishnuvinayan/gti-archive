import { notFound, redirect } from "next/navigation";

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { FlexibleProjectDetailWorkspace } from "@/components/projects/flexible-project-detail-workspace";
import { requireUser } from "@/lib/auth";
import { getFlexibleProjectFixture } from "@/lib/flexible-project-ui-fixtures";
import { hasPermission } from "@/lib/permissions/resolver";

export default async function FlexibleProjectPrototypePage({
  params,
}: {
  params: Promise<{ projectSlug: string }>;
}) {
  const [{ projectSlug }, user] = await Promise.all([params, requireUser()]);

  if (!hasPermission(user, "project.list")) {
    redirect("/no-access");
  }

  const project = getFlexibleProjectFixture(projectSlug);
  if (!project) notFound();

  return (
    <DashboardLayout>
      <FlexibleProjectDetailWorkspace project={project} />
    </DashboardLayout>
  );
}

