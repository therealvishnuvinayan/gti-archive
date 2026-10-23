import { submitWorkflowDraft } from "@/lib/stage-builder/publication";
import { body, response } from "@/lib/stage-builder/http";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function POST(request: Request, context: Context) { return response(async () => submitWorkflowDraft((await context.params).id, await body(request))); }
