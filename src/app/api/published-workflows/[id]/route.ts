import { getPublishedWorkflow } from "@/lib/stage-builder/publication";
import { publicationQuery } from "@/lib/stage-builder/publication-http";
import { response } from "@/lib/stage-builder/http";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) { return response(async () => { const p = publicationQuery(request, ["version", "historyOffset"]); return getPublishedWorkflow((await context.params).id, p.has("version") ? Number(p.get("version")) : undefined, Number(p.get("historyOffset") ?? 0)); }); }
