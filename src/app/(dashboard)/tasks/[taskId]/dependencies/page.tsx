import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getTaskDependencies } from "@/lib/tasker/dependencies";
import { TaskerError } from "@/lib/tasker/errors";
import { TaskerDependencyWorkspace } from "@/components/tasks/tasker-dependency-workspace";

export default async function TaskDependenciesPage({ params }: { params: Promise<{ taskId: string }> }) {
  const [user, { taskId }] = await Promise.all([requireUser(), params]);
  let data;
  try { data = await getTaskDependencies(user, { type: "TASK", id: taskId }); }
  catch (error) { if (error instanceof TaskerError && [403, 404].includes(error.status)) notFound(); throw error; }
  return <TaskerDependencyWorkspace initialData={data} />;
}
