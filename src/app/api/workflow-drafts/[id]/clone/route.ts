import { cloneDraft } from "@/lib/stage-builder/service";
import { body, response } from "@/lib/stage-builder/http";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) { return response(async () => cloneDraft((await context.params).id, await body(request))); }
