import { getTaskDetail, mutateTask } from "@/lib/tasker/service";
import { afterTaskMutation, taskerRoute } from "@/lib/tasker/http";
import { prepareAcceptedTaskFiles } from "@/lib/tasker/files";
import { taskAssert } from "@/lib/tasker/errors";
type Context = { params: Promise<{ taskId: string }> };
export const dynamic = "force-dynamic";
export async function GET(_request: Request, context: Context) {
  return taskerRoute(async (user) => ({ task: await getTaskDetail(user, (await context.params).taskId) }));
}
export async function POST(request: Request, context: Context) {
  return taskerRoute(async (user) => {
    const { taskId } = await context.params, input = await request.json();
    taskAssert(input && typeof input === "object", "Invalid task action.");
    const files = input.action === "ACCEPT" ? await prepareAcceptedTaskFiles(user, taskId, input.version) : [];
    const result = await mutateTask(user, taskId, input, files);
    afterTaskMutation(taskId);
    return result;
  });
}
