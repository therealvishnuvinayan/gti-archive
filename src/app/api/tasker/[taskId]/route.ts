import { body, response } from "@/lib/tasker/http";
import { getTask, mutateTask } from "@/lib/tasker/service";
type Context = { params: Promise<{ taskId: string }> };
export const runtime = "nodejs";
export async function GET(_request: Request, { params }: Context) { return response(async () => getTask((await params).taskId)); }
export async function PATCH(request: Request, { params }: Context) { return response(async () => mutateTask((await params).taskId, await body(request))); }
