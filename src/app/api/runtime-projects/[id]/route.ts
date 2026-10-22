import { getRuntimeProject } from "@/lib/stage-runtime/service";
import { runtimeResponse } from "@/lib/stage-runtime/http";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) { return runtimeResponse(async () => getRuntimeProject((await context.params).id, new URL(request.url).searchParams.get("stage") ?? undefined)); }
