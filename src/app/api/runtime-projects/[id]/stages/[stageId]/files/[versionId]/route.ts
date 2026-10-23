import { openRuntimeFile } from "@/lib/stage-runtime/files";
import { runtimeResponse } from "@/lib/stage-runtime/http";
export const runtime = "nodejs";
export async function GET(_request: Request, context: { params: Promise<{ id: string; stageId: string; versionId: string }> }) {
  try { const p = await context.params, f = await openRuntimeFile(p.id, p.stageId, p.versionId); return new Response(f.body.transformToWebStream(), { headers: { "Content-Type": f.mimeType, "Content-Length": String(f.size), "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(f.fileName)}`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } }); }
  catch (e) { return runtimeResponse(async () => { throw e; }); }
}
