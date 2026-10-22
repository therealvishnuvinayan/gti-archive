import { getDraftPublication } from "@/lib/stage-builder/publication";
import { response } from "@/lib/stage-builder/http";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) { return response(async () => getDraftPublication((await context.params).id)); }
