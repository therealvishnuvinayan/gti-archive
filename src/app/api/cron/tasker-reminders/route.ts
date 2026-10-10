import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { processTaskDeadlineReminders } from "@/lib/tasker/reminders";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const provided = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (!secret || provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  try {
    const result = await processTaskDeadlineReminders();
    return NextResponse.json(result, { status: result.failed ? 500 : 200 });
  } catch {
    console.error("Tasker deadline reminder worker failed.");
    return NextResponse.json({ error: "Unable to process deadline reminders." }, { status: 500 });
  }
}
