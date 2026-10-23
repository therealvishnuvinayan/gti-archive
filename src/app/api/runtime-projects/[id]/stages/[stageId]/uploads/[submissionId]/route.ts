import { runtimeUploadTarget } from "@/lib/stage-runtime/files";
import { body, runtimeResponse } from "@/lib/stage-runtime/http";
import { record } from "@/lib/stage-builder/contracts";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string; stageId: string; submissionId: string }> }) { return runtimeResponse(async () => { record(await body(request), []); const p = await context.params; return runtimeUploadTarget(p.id, p.stageId, p.submissionId); }); }
