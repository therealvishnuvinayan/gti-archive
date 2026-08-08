import { NextResponse } from "next/server";

import {
  checkExternalRequestRateLimit,
  getExternalRequestClientIp,
} from "@/lib/external-request-rate-limit";
import { prepareExternalChecklistAttachment } from "@/lib/stage-five-external";

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

  let payload: { originalFileName?: string; mimeType?: string; fileSize?: number } = {};
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ error: "Invalid upload request." }, { status: 400, headers: NO_STORE_HEADERS });
  }
  if (!payload.originalFileName || typeof payload.fileSize !== "number") {
    return NextResponse.json({ error: "Missing required upload fields." }, { status: 400, headers: NO_STORE_HEADERS });
  }
  const result = await prepareExternalChecklistAttachment(token, {
    originalFileName: payload.originalFileName,
    mimeType: payload.mimeType || "application/octet-stream",
    fileSize: payload.fileSize,
  });
  return NextResponse.json(result, {
    status: "error" in result ? 400 : 200,
    headers: NO_STORE_HEADERS,
  });
}
