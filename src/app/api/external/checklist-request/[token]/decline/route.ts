import { NextResponse } from "next/server";

import {
  checkExternalRequestRateLimit,
  getExternalRequestClientIp,
} from "@/lib/external-request-rate-limit";
import { declineExternalChecklistRequest } from "@/lib/stage-five-external";

const NO_STORE_HEADERS = { "Cache-Control": "private, no-store, max-age=0" };

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const rateLimit = checkExternalRequestRateLimit({
    token,
    clientIp: getExternalRequestClientIp(request.headers),
    scope: "submit",
    limit: 10,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again shortly." },
      {
        status: 429,
        headers: { ...NO_STORE_HEADERS, "Retry-After": String(rateLimit.retryAfterSeconds) },
      },
    );
  }
  let payload: { reason?: string } = {};
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ error: "Invalid response." }, { status: 400, headers: NO_STORE_HEADERS });
  }
  const result = await declineExternalChecklistRequest(token, payload.reason ?? "");
  return NextResponse.json(result, {
    status: "error" in result ? 400 : 200,
    headers: NO_STORE_HEADERS,
  });
}
