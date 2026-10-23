import { downloadTaskFile } from "@/lib/tasker/service";
export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ taskId: string; uploadId: string }> }) {
  try {
    const { taskId, uploadId } = await params, search = new URL(request.url).searchParams;
    if ([...search.keys()].some(k => k !== "versionId") || search.getAll("versionId").length !== 1) throw new Error("Invalid reference");
    const file = await downloadTaskFile(taskId, uploadId, search.get("versionId") ?? "");
    return new Response(file.body.transformToWebStream(), { headers: { "Content-Type": file.mimeType, "Content-Length": String(file.size),
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.name).replace(/['()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`,
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox; default-src 'none'", "Referrer-Policy": "no-referrer" } });
  } catch { return Response.json({ error: "File unavailable or access denied." }, { status: 403, headers: { "Cache-Control": "private, no-store" } }); }
}
