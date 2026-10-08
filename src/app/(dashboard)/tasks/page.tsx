import { redirect } from "next/navigation";

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { TaskerWorkspace } from "@/components/tasks/tasker-workspace";
import { requireUser } from "@/lib/auth";
import { canUseTasks } from "@/lib/permissions/resolver";
import { listTasks } from "@/lib/tasker/service";

export default async function TasksPage() {
  const user = await requireUser();

  if (!canUseTasks(user)) {
    redirect("/no-access");
  }

  const tasks = await listTasks(user);

  return (
    <DashboardLayout>
      <TaskerWorkspace currentUserId={user.id} initialTasks={tasks} />
    </DashboardLayout>
  );
}
