import { createTask, getTaskCreateOptions, listTaskProjects, listTasks } from "@/lib/tasker/service";
import { afterTaskMutation, taskerRoute } from "@/lib/tasker/http";
import type { TaskProjectType } from "@/lib/tasker/types";
import { taskAssert } from "@/lib/tasker/errors";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return taskerRoute(async (user) => {
    const params = new URL(request.url).searchParams;
    if (params.get("view") === "projects") return { projects: await listTaskProjects(user) };
    const projectId = params.get("projectId"), projectType = params.get("projectType") as TaskProjectType;
    const ref = projectId ? { projectId, projectType } : undefined;
    if (params.get("view") === "options") { taskAssert(ref, "Choose a project."); return { options: await getTaskCreateOptions(user, ref) }; }
    return { tasks: await listTasks(user, ref) };
  });
}
export async function POST(request: Request) {
  return taskerRoute(async (user) => {
    const input = await request.json();
    taskAssert(input && typeof input === "object", "Invalid task request.");
    const id = await createTask(user, input);
    afterTaskMutation(id);
    return { id };
  });
}
