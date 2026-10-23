import { ProjectTaskerLink } from "@/components/tasks/project-tasker-link";
import { ProjectCompletionGovernance } from "@/components/projects/project-completion-governance";
import { RestrictedProjectContextView } from "@/components/projects/restricted-project-context";
import { getFlexibleContextBySlug } from "@/lib/authorization/project-context";
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
  if (!project) {
    const context = await getFlexibleContextBySlug(projectSlug, user);
    if (!context) notFound();
    return <DashboardLayout><ProjectTaskerLink kind="flexible" projectId={context.id} /><RestrictedProjectContextView data={context} /></DashboardLayout>;
  }
  const userOptions = project.canManageProject
    ? await getFlexibleProjectUserOptions()
    : project.participantOptions;

  return (
    <DashboardLayout>
      <ProjectTaskerLink kind="flexible" projectId={project.id} />
      <FlexibleProjectDetailWorkspace
        project={project}
        userOptions={userOptions}
        currentUserId={user.id}
      />
      <ProjectCompletionGovernance user={user} target={{ kind: "FLEXIBLE", projectId: project.id }} />
    </DashboardLayout>
  );
}
