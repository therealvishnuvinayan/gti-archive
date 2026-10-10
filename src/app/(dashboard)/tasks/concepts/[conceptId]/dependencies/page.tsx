import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getTaskDependencies } from "@/lib/tasker/dependencies";
import { TaskerError } from "@/lib/tasker/errors";
import { TaskerDependencyWorkspace } from "@/components/tasks/tasker-dependency-workspace";

export default async function ConceptDependenciesPage({ params }: { params: Promise<{ conceptId: string }> }) {
  const [user, { conceptId }] = await Promise.all([requireUser(), params]);
  let data;
  try { data = await getTaskDependencies(user, { type: "CONCEPT", id: conceptId }); }
  catch (error) { if (error instanceof TaskerError && [403, 404].includes(error.status)) notFound(); throw error; }
  return <TaskerDependencyWorkspace initialData={data} />;
}
