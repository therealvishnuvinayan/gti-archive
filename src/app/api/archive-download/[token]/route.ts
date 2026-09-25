import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { getSharedArchiveFileDownload } from "@/lib/archives";
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
      { error: "Too many download attempts. Please try again shortly." },
      { status: 429, headers: { "Cache-Control": "no-store" } },
    );
  }

  const result = await getSharedArchiveFileDownload(token);

  if (result.state !== "active") {
    const expired = result.state === "expired";
    return NextResponse.json(
      {
        error: expired
          ? "This archive download link has expired."
          : "This archive download link is invalid or unavailable.",
      },
      {
        status: expired ? 410 : 404,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }

  const response = NextResponse.redirect(result.downloadUrl);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
