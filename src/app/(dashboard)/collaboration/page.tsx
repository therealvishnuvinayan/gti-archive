import { UserRole } from "@prisma/client";

import { CollaborationWorkspace } from "@/components/collaboration/collaboration-workspace";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { requireUser } from "@/lib/auth";
import { getCollaborators } from "@/lib/collaboration";

export default async function CollaborationPage() {
  const user = await requireUser();
  const collaborators = await getCollaborators();

  return (
    <DashboardLayout
      topbarProps={{
        searchPlaceholder: "Search collaborators...",
      }}
    >
      <CollaborationWorkspace
        initialCollaborators={collaborators}
        canDeleteCollaborators={user.role === UserRole.SUPER_ADMIN}
      />
    </DashboardLayout>
  );
}
