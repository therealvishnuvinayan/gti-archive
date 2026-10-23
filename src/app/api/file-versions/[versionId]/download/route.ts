import { NextResponse } from "next/server";
import { openSharedFileVersion } from "@/lib/files/access";

export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ versionId: string }> }) {
  try {
    const url = new URL(request.url);
    if ([...url.searchParams.keys()].some(key => !["kind", "id", "disposition"].includes(key)) ||
      url.searchParams.getAll("kind").length !== 1 || url.searchParams.getAll("id").length !== 1 ||
      url.searchParams.getAll("disposition").length > 1 ||
      (url.searchParams.has("disposition") && url.searchParams.get("disposition") !== "inline")) {
      return NextResponse.json({ error: "Invalid file source." }, { status: 400 });
    }
    const { versionId } = await params;
    const object = await openSharedFileVersion({ kind: url.searchParams.get("kind"), id: url.searchParams.get("id") }, versionId);
    const inline = url.searchParams.get("disposition") === "inline" &&
      ["application/pdf", "image/png", "image/jpeg", "image/gif", "image/webp"].includes(object.mimeType);
    return new Response(object.body.transformToWebStream(), { headers: {
      "Content-Type": object.mimeType,
      "Content-Length": String(object.fileSize),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(object.originalFileName).replace(/['()*]/g, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)}`,
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'", "Referrer-Policy": "no-referrer",
    } });
  } catch {
    // Do not expose storage paths, version existence or authorization diagnostics.
    return NextResponse.json({ error: "File unavailable or access denied." }, { status: 403 });
  }
}
