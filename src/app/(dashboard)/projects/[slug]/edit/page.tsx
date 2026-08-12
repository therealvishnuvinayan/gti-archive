import { redirect } from "next/navigation";

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { CreateProjectForm } from "@/components/projects/create-project-form";
import { getUserDisplayName, requireUser } from "@/lib/auth";
import { getCollaborators } from "@/lib/collaboration";
import { hasPermission, hasProjectPermission } from "@/lib/permissions/resolver";
import { getEligibleProjectOwnerCandidates } from "@/lib/project-owner-candidates";
import { getProjectStageAccessRecordById } from "@/lib/project-stage-data";
import { isProjectStatusCompleted } from "@/lib/project-statuses";

export default async function EditProjectPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const user = await requireUser();
  const project = await getProjectStageAccessRecordById(slug);

  if (!project) redirect("/projects");

  const canEdit =
    !project.completedAt &&
    !project.archivedAt &&
    !isProjectStatusCompleted(project.status) &&
    hasProjectPermission(user, project, "project.update") &&
    hasProjectPermission(user, project, "project.manageCollaborators");

  if (!canEdit) redirect(`/projects/${slug}`);

  const [collaborators, eligibleOwnerCandidates] = await Promise.all([
    getCollaborators(),
    getEligibleProjectOwnerCandidates(),
  ]);
  const executorIds = project.executors.map((executor) => executor.userId);
  const ownerIds = new Set([
    project.ownerId,
    ...project.coOwners.map((coOwner) => coOwner.userId),
  ]);
  const executorIdSet = new Set(executorIds);

  return (
    <DashboardLayout>
      <CreateProjectForm
        mode="edit"
        initialProject={{
          id: project.id,
          name: project.name,
          ownerId: project.ownerId ?? user.id,
          coOwnerIds: project.coOwners.map((coOwner) => coOwner.userId),
          executorIds,
          collaboratorIds: project.collaborators
            .map((collaborator) => collaborator.userId)
            .filter(
              (collaboratorId) =>
                !ownerIds.has(collaboratorId) &&
                !executorIdSet.has(collaboratorId),
            ),
        }}
        currentUser={{
          id: user.id,
          name: getUserDisplayName(user),
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
