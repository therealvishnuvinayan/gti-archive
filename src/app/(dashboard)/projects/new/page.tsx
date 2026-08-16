import { redirect } from "next/navigation";

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { CreateProjectForm } from "@/components/projects/create-project-form";
import { getUserDisplayName, requireUser } from "@/lib/auth";
import { getCollaborators } from "@/lib/collaboration";
import {
  canCreateProjects,
  canUseProjects,
  hasPermission,
} from "@/lib/permissions/resolver";
import { getEligibleProjectOwnerCandidates } from "@/lib/project-owner-candidates";

export default async function NewProjectPage() {
  const user = await requireUser();

  if (!canUseProjects(user)) {
    redirect("/no-access");
  }

  if (!canCreateProjects(user)) {
    redirect("/projects");
  }

  const [collaborators, eligibleOwnerCandidates] = await Promise.all([
    getCollaborators(),
    getEligibleProjectOwnerCandidates(),
  ]);
  const displayName = getUserDisplayName(user);

  return (
    <DashboardLayout>
      <CreateProjectForm
        currentUser={{
          id: user.id,
          name: displayName,
          email: user.email,
          role: user.role,
          avatarSrc: user.avatarUrl
            ? `/api/profile/avatar?v=${encodeURIComponent(user.avatarUrl)}`
            : null,
        }}
        eligibleOwnerCandidates={eligibleOwnerCandidates}
        availableCollaborators={collaborators}
        canInviteCollaborator={hasPermission(user, "collaboration.createUser")}
      />
    </DashboardLayout>
  );
}
