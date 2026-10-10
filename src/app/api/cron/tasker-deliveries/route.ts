import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { deliverTaskerEmails } from "@/lib/tasker/delivery";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET, authorization = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (!secret || authorization.length !== expected.length || !timingSafeEqual(Buffer.from(authorization), Buffer.from(expected))) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  return NextResponse.json(await deliverTaskerEmails({ limit: 100 }));
}
