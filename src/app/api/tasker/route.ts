import { body, response } from "@/lib/tasker/http";
import { createTask, listTasks, taskOptions } from "@/lib/tasker/service";
import { ensure } from "@/lib/tasker/contracts";
export const runtime = "nodejs";
export async function GET(request: Request) {
  return response(async () => {
    const params = new URL(request.url).searchParams;
    ensure([...params.keys()].every(k => ["options", "context", "status", "ownerId", "executorId", "search", "offset", "type", "priority", "scope", "overdue", "sort", "familyId"].includes(k) && params.getAll(k).length === 1), "INVALID_QUERY");
    if (params.get("options") === "1") return taskOptions(params.get("context") ?? undefined);
    ensure(!params.has("options"), "INVALID_QUERY"); return listTasks(Object.fromEntries(params));
  });
}
export async function POST(request: Request) { return response(async () => createTask(await body(request))); }
