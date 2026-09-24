import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { getSharedArchiveFilePreview } from "@/lib/archives";
import {
  checkExternalRequestRateLimit,
  getExternalRequestClientIp,
} from "@/lib/external-request-rate-limit";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const [{ token }, requestHeaders] = await Promise.all([params, headers()]);
  const rateLimit = checkExternalRequestRateLimit({
    token,
    clientIp: getExternalRequestClientIp(requestHeaders),
    scope: "file",
    limit: 30,
  });

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many preview attempts. Please try again shortly." },
      { status: 429, headers: { "Cache-Control": "no-store" } },
    );
  }

  const result = await getSharedArchiveFilePreview(token);

  if (result.state !== "active") {
    const expired = result.state === "expired";
    return NextResponse.json(
      {
        error: expired
          ? "This archive preview link has expired."
          : "This archive preview link is invalid or unavailable.",
      },
      {
        status: expired ? 410 : 404,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }

  return NextResponse.redirect(result.previewUrl, {
    status: 302,
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}
