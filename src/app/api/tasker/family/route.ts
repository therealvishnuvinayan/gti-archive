import { NextResponse } from "next/server";
import { getTaskFamily, mutateTaskFamily, taskFamilyFileDownload, taskFamilyFileAccess } from "@/lib/tasker/families";
import { afterTaskMutation, taskerRoute } from "@/lib/tasker/http";
import { taskAssert } from "@/lib/tasker/errors";
import type { TaskSource } from "@/lib/tasker/types";

export const dynamic = "force-dynamic";
function sourceFrom(request: Request): TaskSource {
  const params = new URL(request.url).searchParams;
  return { type: params.get("type") as TaskSource["type"], id: params.get("id") ?? "" };
}
export async function GET(request: Request) {
  return taskerRoute(async (user) => {
    const key = new URL(request.url).searchParams.get("fileKey");
    const mode = new URL(request.url).searchParams.get("mode");
    if (key && mode) {
      taskAssert(mode === "preview" || mode === "text" || mode === "download", "Unknown file mode.");
      const result = await taskFamilyFileAccess(user, sourceFrom(request), key, mode);
      return "url" in result ? NextResponse.redirect(result.url!, { status: 302, headers: { "Cache-Control": "no-store" } }) : result;
    }
    return key ? { url: await taskFamilyFileDownload(user, sourceFrom(request), key) } : { family: await getTaskFamily(user, sourceFrom(request)) };
  });
}
export async function POST(request: Request) {
  return taskerRoute(async (user) => {
    const input = await request.json();
    taskAssert(input && typeof input === "object", "Invalid revision action.");
    const result = await mutateTaskFamily(user, sourceFrom(request), input);
    afterTaskMutation();
    return result;
  });
}
