import { redirect } from "next/navigation";

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { UserTasksWorkspace } from "@/components/tasks/user-tasks-workspace";
import { requireUser } from "@/lib/auth";
import { canUseTasks } from "@/lib/permissions/resolver";
import { getUserTasksPageData } from "@/lib/user-tasks";

export default async function TasksPage() {
  const user = await requireUser();

  if (!canUseTasks(user)) {
    redirect("/no-access");
  }

  const data = await getUserTasksPageData(user);

  return (
    <DashboardLayout>
      <UserTasksWorkspace data={data} />
    </DashboardLayout>
  );
}
