import { redirect } from "next/navigation";
import { UserRole } from "@prisma/client";

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { UsersWorkspace } from "@/components/users/users-workspace";
import { requireUser } from "@/lib/auth";
import { listUsersForPermissionManagement } from "@/lib/user-permissions";

export default async function UsersPage() {
  const user = await requireUser();

  if (user.role !== UserRole.SUPER_ADMIN) {
    redirect("/settings");
  }

  const users = await listUsersForPermissionManagement();

  return (
    <DashboardLayout>
      <UsersWorkspace currentUserId={user.id} initialUsers={users} />
    </DashboardLayout>
  );
}
