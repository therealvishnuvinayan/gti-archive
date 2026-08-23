import { UserRole } from "@prisma/client";
import { redirect } from "next/navigation";

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { UserTasksWorkspace } from "@/components/tasks/user-tasks-workspace";
import { requireUser } from "@/lib/auth";
import { canUseProjects } from "@/lib/permissions/resolver";
import { getUserTasksPageData } from "@/lib/user-tasks";

export default async function TasksPage() {
  const user = await requireUser();

  if (!canUseProjects(user)) {
    redirect("/no-access");
  }

  if (user.role !== UserRole.USER) {
    redirect("/projects");
  }

  const data = await getUserTasksPageData(user);

  return (
    <DashboardLayout>
      <UserTasksWorkspace data={data} />
    </DashboardLayout>
  );
}
