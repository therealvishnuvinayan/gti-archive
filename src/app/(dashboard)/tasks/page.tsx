import { GeneralTasker } from "@/components/tasks/general-tasker";
import { taskEnabled, deliverablesEnabled, conceptsEnabled } from "@/lib/tasker/contracts";
import { listTasks } from "@/lib/tasker/service";
import { redirect } from "next/navigation";

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { UserTasksWorkspace } from "@/components/tasks/user-tasks-workspace";
import { requireUser } from "@/lib/auth";
import { canUseTasks } from "@/lib/permissions/resolver";
import { getUserTasksPageData } from "@/lib/user-tasks";

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ context?: string; createContext?: string; destination?: string }> }) {
  const user = await requireUser();

  if (!canUseTasks(user)) {
    redirect("/no-access");
  }

  const data = await getUserTasksPageData(user);
  const query = await searchParams;
  const general = taskEnabled() ? await listTasks(query.context ? { context: query.context } : {}) : null;

  return (
    <DashboardLayout>
      {general ? <>
        <GeneralTasker deliverables={deliverablesEnabled() || conceptsEnabled()} initial={general} context={query.context} createContext={query.createContext} initialDestination={query.destination} />
        <details className="mt-8 rounded-2xl border border-[#d9e2da] p-5"><summary className="cursor-pointer font-semibold">Legacy concept tasks</summary><p className="my-3 text-sm text-[#68766b]">Concept tasks continue in their existing project workflow.</p><UserTasksWorkspace data={data} /></details>
      </> : <UserTasksWorkspace data={data} />}
    </DashboardLayout>
  );
}
