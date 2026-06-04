import { redirect } from "next/navigation";
import { UserRole } from "@prisma/client";

import { CollaborationWorkspace } from "@/components/collaboration/collaboration-workspace";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { requireUser } from "@/lib/auth";
import { getCollaborators } from "@/lib/collaboration";
import { hasPermission } from "@/lib/permissions/resolver";

export default async function CollaborationPage() {
  const user = await requireUser();

  if (!hasPermission(user, "collaboration.viewDirectory")) {
    redirect("/");
  }

  const collaborators = await getCollaborators();

  return (
    <DashboardLayout
      topbarProps={{
        searchPlaceholder: "Search collaborators...",
      }}
    >
      <CollaborationWorkspace
        initialCollaborators={collaborators}
        canSaveCollaborators={
          hasPermission(user, "collaboration.createUser") &&
          hasPermission(user, "collaboration.updateUser") &&
          hasPermission(user, "collaboration.manageModuleAccess")
        }
        canDeleteCollaborators={hasPermission(user, "collaboration.deleteGlobal")}
        canManagePermissions={
          user.role === UserRole.SUPER_ADMIN &&
          hasPermission(user, "users.view") &&
          hasPermission(user, "users.managePermissions") &&
          hasPermission(user, "settings.managePermissions")
        }
      />
    </DashboardLayout>
  );
}
