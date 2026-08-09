import { NextResponse } from "next/server";

import {
  checkExternalRequestRateLimit,
  getExternalRequestClientIp,
} from "@/lib/external-request-rate-limit";
import { getExternalChecklistSourceFileUrl } from "@/lib/stage-five-external";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const rateLimit = checkExternalRequestRateLimit({
    token,
    clientIp: getExternalRequestClientIp(request.headers),
    scope: "file",
    limit: 30,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: { "Cache-Control": "private, no-store", "Retry-After": String(rateLimit.retryAfterSeconds) } });
  }
  try {
    const previewUrl = await getExternalChecklistSourceFileUrl(token, "preview");
    return NextResponse.redirect(previewUrl, {
      status: 302,
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  } catch {
    return NextResponse.json({ error: "Requested file not found." }, { status: 404, headers: { "Cache-Control": "private, no-store" } });
  }
}
