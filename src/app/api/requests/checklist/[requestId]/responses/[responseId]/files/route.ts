import { NextResponse } from "next/server";
import { taskerRoute } from "@/lib/tasker/http";
import { taskAssert } from "@/lib/tasker/errors";
import { checklistResponseFileAccess } from "@/lib/tasker/checklist-review";

export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ requestId: string; responseId: string }> }) {
  return taskerRoute(async (user) => {
    const { requestId, responseId } = await context.params, params = new URL(request.url).searchParams;
    const mode = params.get("mode");
    taskAssert(mode === "preview" || mode === "text" || mode === "download", "Unknown file mode.");
    const result = await checklistResponseFileAccess(user, requestId, responseId, params.get("fileId") ?? "", mode);
    return "url" in result ? NextResponse.redirect(result.url!, { status: 302, headers: { "Cache-Control": "no-store" } }) : result;
  });
}
