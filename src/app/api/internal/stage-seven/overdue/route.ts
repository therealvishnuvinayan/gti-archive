import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { processStageSevenOverdueDeadlines } from "@/lib/stage-seven";

export const dynamic = "force-dynamic";

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

async function processRequest(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "Stage 7 overdue processing is not configured." },
      { status: 503 },
    );
  }
  const authorization = request.headers.get("authorization");
  const provided = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : request.headers.get("x-cron-secret") ?? "";
  if (!safeEqual(provided, secret)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  try {
    const result = await processStageSevenOverdueDeadlines();
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("[stage-seven] overdue processor failed", error);
    return NextResponse.json(
      { error: "Unable to process Stage 7 overdue deadlines." },
      { status: 500 },
    );
  }
}

export const GET = processRequest;
export const POST = processRequest;
