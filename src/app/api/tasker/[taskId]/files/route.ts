import { NextResponse } from "next/server";
import { discardTaskUpload, finalizeTaskUpload, requestTaskUpload, taskFileDownload, taskFileAccess } from "@/lib/tasker/files";
import { taskerRoute } from "@/lib/tasker/http";
import { taskAssert } from "@/lib/tasker/errors";
type Context = { params: Promise<{ taskId: string }> };
export const dynamic = "force-dynamic";
export async function POST(request: Request, context: Context) {
  return taskerRoute(async (user) => {
    const { taskId } = await context.params, input = await request.json();
    taskAssert(input && typeof input === "object", "Invalid upload request.");
    if (input.action === "FINALIZE") return finalizeTaskUpload(user, taskId, input.fileId);
    if (input.action === "DISCARD") { await discardTaskUpload(user, taskId, input.fileId); return { success: true }; }
    taskAssert(input.action === "UPLOAD", "Unknown file action.");
    return requestTaskUpload(user, taskId, input);
  });
}
export async function GET(request: Request, context: Context) {
  return taskerRoute(async (user) => {
    const params = new URL(request.url).searchParams, taskId = (await context.params).taskId, fileId = params.get("fileId") ?? "";
    const mode = params.get("mode");
    if (!mode) return { url: await taskFileDownload(user, taskId, fileId) };
    taskAssert(mode === "preview" || mode === "text" || mode === "download", "Unknown file mode.");
    const result = await taskFileAccess(user, taskId, fileId, mode);
    return "url" in result ? NextResponse.redirect(result.url!, { status: 302, headers: { "Cache-Control": "no-store" } }) : result;
  });
}
