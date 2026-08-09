import { NextResponse } from "next/server";

import {
  checkExternalRequestRateLimit,
  getExternalRequestClientIp,
} from "@/lib/external-request-rate-limit";
import { completeExternalChecklistAttachment } from "@/lib/stage-five-external";

const NO_STORE_HEADERS = { "Cache-Control": "private, no-store, max-age=0" };

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const rateLimit = checkExternalRequestRateLimit({
    token,
    clientIp: getExternalRequestClientIp(request.headers),
    scope: "upload",
    limit: 20,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many upload attempts. Please try again shortly." },
      {
        status: 429,
        headers: { ...NO_STORE_HEADERS, "Retry-After": String(rateLimit.retryAfterSeconds) },
      },
    );
  }
  let payload: { attachmentId?: string; failed?: boolean } = {};
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ error: "Invalid completion request." }, { status: 400, headers: NO_STORE_HEADERS });
  }
  if (!payload.attachmentId) {
    return NextResponse.json({ error: "Attachment id is required." }, { status: 400, headers: NO_STORE_HEADERS });
  }
  const result = await completeExternalChecklistAttachment(
    token,
    payload.attachmentId,
    Boolean(payload.failed),
  );
  return NextResponse.json(result, {
    status: "error" in result ? 400 : 200,
    headers: NO_STORE_HEADERS,
  });
}
