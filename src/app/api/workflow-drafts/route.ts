import { createDraft, listDrafts } from "@/lib/stage-builder/service";
import { body, response } from "@/lib/stage-builder/http";
import { ensure } from "@/lib/stage-builder/contracts";
export const runtime = "nodejs";
export async function GET(request: Request) { return response(async () => {
  const params = new URL(request.url).searchParams;
  ensure([...params.keys()].every(k => k === "offset" && params.getAll(k).length === 1), "INVALID_QUERY");
  return listDrafts(Number(params.get("offset") ?? "0"));
}); }
export async function POST(request: Request) { return response(async () => createDraft(await body(request))); }
