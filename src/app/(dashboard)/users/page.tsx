import { redirect } from "next/navigation";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { UsersWorkspace } from "@/components/users/users-workspace";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions/resolver";
import { listUsersForPermissionManagement } from "@/lib/user-permissions";
import { isBusinessAdministratorRole } from "@/lib/user-role-compatibility";

export default async function UsersPage() {
  const user = await requireUser();

  if (!isBusinessAdministratorRole(user.role) || !hasPermission(user, "users.view")) {
    redirect("/settings");
  }

  const users = await listUsersForPermissionManagement();

  return (
    <DashboardLayout>
      <UsersWorkspace
        currentUserId={user.id}
        initialUsers={users}
        canUpdateUsers={hasPermission(user, "users.update")}
        canManagePermissions={
          hasPermission(user, "users.managePermissions") &&
          hasPermission(user, "settings.managePermissions")
        }
      />
    </DashboardLayout>
  );
}
