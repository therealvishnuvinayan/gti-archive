import { listPublishedWorkflows } from "@/lib/stage-builder/publication";
import { publicationQuery } from "@/lib/stage-builder/publication-http";
import { response } from "@/lib/stage-builder/http";
export const runtime = "nodejs";
export async function GET(request: Request) { return response(async () => { const p = publicationQuery(request, ["offset"]); return listPublishedWorkflows(Number(p.get("offset") ?? 0)); }); }
