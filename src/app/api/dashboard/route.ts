import { NextResponse } from "next/server";
import { AuthorizationDeniedError } from "@/lib/authorization/policy";
import { TaskerError } from "@/lib/tasker/contracts";
import { getRoleDashboard } from "@/lib/dashboard-v2/service";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const params = new URL(request.url).searchParams;
    if (new Set(params.keys()).size !== [...params.keys()].length) throw new TaskerError("INVALID_DASHBOARD_FILTER");
    return NextResponse.json(await getRoleDashboard(Object.fromEntries(params)), { headers });
  } catch (error) {
    const status = error instanceof TaskerError ? error.status : error instanceof AuthorizationDeniedError ? 403 : 500;
    if (status === 500) console.error("Dashboard read failed", error);
    return NextResponse.json({ error: status === 500 ? "Dashboard unavailable. Please try again." : status === 403 ? "Dashboard access denied." : status === 404 ? "Dashboard unavailable." : "Invalid dashboard filters." }, { status, headers });
  }
}
