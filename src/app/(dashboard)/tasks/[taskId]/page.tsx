import { notFound } from "next/navigation";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { GeneralTaskDetail } from "@/components/tasks/general-tasker";
import { requireUser } from "@/lib/auth";
import { getTask } from "@/lib/tasker/service";
export default async function TaskPage({ params }: { params: Promise<{ taskId: string }> }) {
  await requireUser();
  const task = await getTask((await params).taskId).catch(() => null);
  if (!task) notFound();
  return <DashboardLayout><GeneralTaskDetail initial={task} /></DashboardLayout>;
}
