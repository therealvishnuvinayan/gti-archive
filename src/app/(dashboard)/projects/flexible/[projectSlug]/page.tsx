import { notFound, redirect } from "next/navigation";

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { FlexibleProjectDetailWorkspace } from "@/components/projects/flexible-project-detail-workspace";
import { requireUser } from "@/lib/auth";
import {
  getFlexibleProjectDetail,
  getFlexibleProjectUserOptions,
} from "@/lib/flexible-projects";
import { canUseProjects } from "@/lib/permissions/resolver";

export default async function FlexibleProjectPage({
  params,
}: {
  params: Promise<{ projectSlug: string }>;
}) {
  const [{ projectSlug }, user] = await Promise.all([params, requireUser()]);

  if (!canUseProjects(user)) {
    redirect("/no-access");
  }

  const project = await getFlexibleProjectDetail(projectSlug, user);
  if (!project) notFound();
  const userOptions = project.canManageProject
    ? await getFlexibleProjectUserOptions()
    : project.participantOptions;

  return (
    <DashboardLayout>
      <FlexibleProjectDetailWorkspace
        project={project}
        userOptions={userOptions}
        currentUserId={user.id}
      />
    </DashboardLayout>
  );
}
