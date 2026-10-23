import { openRuntimeDocument } from "@/lib/runtime-completion/service";
import { runtimeResponse } from "@/lib/stage-runtime/http";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string; versionId: string }> }) {
  try { const p = await context.params, f = await openRuntimeDocument(p.id, p.versionId); return new Response(f.body.transformToWebStream(), { headers: { "Content-Type": f.mimeType, "Content-Length": String(f.size), "Content-Disposition": `${new URL(request.url).searchParams.get("preview") === "1" ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(f.fileName)}`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox" } }); }
  catch (e) { return runtimeResponse(async () => { throw e; }); }
}
