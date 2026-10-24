import Link from "next/link";
import { redirect } from "next/navigation";
import { ManualCalendarWorkspace } from "@/components/calendar/manual-calendar-workspace";
import { requireUser } from "@/lib/auth";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { TaskCalendarWorkspace } from "@/components/calendar/task-calendar-workspace";
import { getSidebarVisibility } from "@/lib/permissions/resolver";
import { getAuthenticatedDefaultRoute } from "@/lib/permissions/fallback-route";
import { calendarV2Enabled } from "@/lib/calendar-v2/activation";
import { CalendarError } from "@/lib/calendar-v2/contracts";
import { getTaskCalendar } from "@/lib/calendar-v2/service";
import { AuthorizationDeniedError } from "@/lib/authorization/policy";
export const dynamic = "force-dynamic";
export default async function CalendarPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  if (!getSidebarVisibility(user).calendar) redirect(getAuthenticatedDefaultRoute(user));
  const params = await searchParams;
  if (!calendarV2Enabled()) return <ManualCalendarWorkspace user={user} params={params} taskCalendarEnabled={false} />;
  // Preserve established event deep links and the legacy-only day view.
  if (typeof params.event === "string" || params.view === "day") {
    const manual = new URLSearchParams();
    for (const key of ["view", "date", "event"]) if (typeof params[key] === "string") manual.set(key, params[key]);
    redirect(`/calendar/manual?${manual}`);
  }
  let data;
  try { data = await getTaskCalendar(params); }
  catch (error) {
    if (error instanceof AuthorizationDeniedError || (error instanceof CalendarError && error.status === 403)) redirect("/sign-in");
    const invalid = error instanceof CalendarError && error.status === 400;
    return <DashboardLayout><main className="space-y-4 p-4"><h1 className="text-2xl font-semibold">{invalid ? "Invalid calendar dates or filters" : "Calendar unavailable"}</h1><p>{invalid ? "Choose a valid date and supported filters." : "Please try again."}</p><Link className="text-emerald-800 underline" href="/calendar">Return to Calendar</Link></main></DashboardLayout>;
  }
  return <DashboardLayout><nav aria-label="Calendar workspaces" className="mb-4 flex flex-wrap gap-4 text-sm"><span aria-current="page" className="font-semibold">Task Calendar</span><Link href="/calendar/manual" className="text-emerald-800 underline">Manual Events</Link></nav><TaskCalendarWorkspace data={data} /></DashboardLayout>;
}
