import { downloadInheritedEvidence } from "@/lib/tasker/service";
export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ taskId: string; referenceId: string }> }) {
  try {
    const { taskId, referenceId } = await params, search = new URL(request.url).searchParams;
    if ([...search.keys()].some(k => !["versionId", "disposition"].includes(k)) || search.getAll("versionId").length !== 1 || search.getAll("disposition").length > 1 || (search.has("disposition") && search.get("disposition") !== "inline")) throw new Error("Invalid reference");
    const file = await downloadInheritedEvidence(taskId, referenceId, search.get("versionId") ?? "");
    const inline = search.get("disposition") === "inline" && ["application/pdf", "image/png", "image/jpeg", "image/gif", "image/webp"].includes(file.mimeType);
    return new Response(file.body.transformToWebStream(), { headers: { "Content-Type": file.mimeType, "Content-Length": String(file.size),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.name).replace(/['()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`,
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox; default-src 'none'", "Referrer-Policy": "no-referrer" } });
  } catch { return Response.json({ error: "File unavailable or access denied." }, { status: 403, headers: { "Cache-Control": "private, no-store" } }); }
}
