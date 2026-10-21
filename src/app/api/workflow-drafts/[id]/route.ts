import { getDraft, reviseDraft } from "@/lib/stage-builder/service";
import { body, response } from "@/lib/stage-builder/http";
import { ensure } from "@/lib/stage-builder/contracts";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) { return response(async () => {
  const params = new URL(request.url).searchParams;
  ensure([...params.keys()].every(k => k === "revision" && params.getAll(k).length === 1), "INVALID_QUERY");
  return getDraft((await context.params).id, params.has("revision") ? Number(params.get("revision")) : undefined);
}); }
export async function PATCH(request: Request, context: Context) { return response(async () => reviseDraft((await context.params).id, await body(request))); }
