import { NextResponse } from "next/server";
import { checkExternalRequestRateLimit, getExternalRequestClientIp } from "@/lib/external-request-rate-limit";
import { getProductionHandoverFileUrl } from "@/lib/stage-six";

export async function GET(request: Request, { params }: { params: Promise<{ token: string; attachmentId: string }> }) {
  const { token, attachmentId } = await params;
  const limit = checkExternalRequestRateLimit({ token, clientIp: getExternalRequestClientIp(request.headers), scope: "file", limit: 30 });
  if (!limit.allowed) return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: { "Cache-Control": "private, no-store", "Retry-After": String(limit.retryAfterSeconds) } });
  try { const url = await getProductionHandoverFileUrl(token, attachmentId, "download"); return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "private, no-store, max-age=0" } }); }
  catch { return NextResponse.json({ error: "Handover file not found." }, { status: 404, headers: { "Cache-Control": "private, no-store" } }); }
}
