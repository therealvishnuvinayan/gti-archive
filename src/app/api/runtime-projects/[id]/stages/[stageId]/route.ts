import { runtimeStageCommand } from "@/lib/stage-runtime/service";
import { body, runtimeResponse } from "@/lib/stage-runtime/http";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string; stageId: string }> }) { return runtimeResponse(async () => { const { id, stageId } = await context.params; return runtimeStageCommand(id, stageId, await body(request)); }); }
