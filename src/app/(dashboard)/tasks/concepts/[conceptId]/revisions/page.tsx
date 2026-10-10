import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getTaskFamily } from "@/lib/tasker/families";
import { TaskerError } from "@/lib/tasker/errors";
import { TaskerFamilyWorkspace } from "@/components/tasks/tasker-family-workspace";

export default async function TaskRevisionsPage({ params }: { params: Promise<{ conceptId: string }> }) {
  const [user, { conceptId }] = await Promise.all([requireUser(), params]);
  try { return <TaskerFamilyWorkspace initialFamily={await getTaskFamily(user, { type: "CONCEPT", id: conceptId })} />; }
  catch (error) { if (error instanceof TaskerError && [403, 404].includes(error.status)) notFound(); throw error; }
}
