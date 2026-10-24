import { NextResponse } from "next/server";
import { AuthorizationDeniedError } from "@/lib/authorization/policy";
import { CalendarError } from "@/lib/calendar-v2/contracts";
import { getTaskCalendar } from "@/lib/calendar-v2/service";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const params = new URL(request.url).searchParams;
    if ([...params.keys()].length !== new Set(params.keys()).size) throw new CalendarError("INVALID_CALENDAR");
    return NextResponse.json(await getTaskCalendar(Object.fromEntries(params)), { headers });
  } catch (error) {
    const status = error instanceof CalendarError ? error.status : error instanceof AuthorizationDeniedError ? 403 : 500;
    if (status === 500) console.error("Calendar read failed", error);
    return NextResponse.json({ error: status === 500 ? "Calendar unavailable. Please try again." : status === 403 ? "Calendar access denied." : status === 404 ? "Calendar unavailable." : "Invalid calendar dates or filters." }, { status, headers });
  }
}
