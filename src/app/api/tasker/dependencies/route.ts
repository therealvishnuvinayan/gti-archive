import { getTaskDependencies, mutateTaskDependency } from "@/lib/tasker/dependencies";
import { afterTaskMutation, taskerRoute } from "@/lib/tasker/http";
import { taskAssert } from "@/lib/tasker/errors";
import type { TaskSource } from "@/lib/tasker/types";

export const dynamic = "force-dynamic";
function source(request: Request): TaskSource {
  const params = new URL(request.url).searchParams;
  return { type: params.get("type") as TaskSource["type"], id: params.get("id") ?? "" };
}
export async function GET(request: Request) {
  return taskerRoute(async (user) => ({ dependencies: await getTaskDependencies(user, source(request)) }));
}
export async function POST(request: Request) {
  return taskerRoute(async (user) => {
    const input = await request.json();
    taskAssert(input && typeof input === "object", "Invalid dependency action.");
    const result = await mutateTaskDependency(user, source(request), input);
    afterTaskMutation();
    return result;
  });
}
