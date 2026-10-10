import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getTaskDetail } from "@/lib/tasker/service";
import { TaskerError } from "@/lib/tasker/errors";
import { TaskerDetailWorkspace } from "@/components/tasks/tasker-workspace";

export default async function TaskDetailPage({ params }: { params: Promise<{ taskId: string }> }) {
  const [user, { taskId }] = await Promise.all([requireUser(), params]);
  try { return <TaskerDetailWorkspace initialTask={await getTaskDetail(user, taskId)} />; }
  catch (error) { if (error instanceof TaskerError && [403, 404].includes(error.status)) notFound(); throw error; }
}
