import Link from "next/link";
import { notFound, redirect } from "next/navigation";
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
  if (!calendarV2Enabled()) notFound();
  const user = await requireUser();
  if (!getSidebarVisibility(user).calendar) redirect(getAuthenticatedDefaultRoute(user));
  let data;
  try { data = await getTaskCalendar(await searchParams); }
  catch (error) {
    if (error instanceof AuthorizationDeniedError || (error instanceof CalendarError && error.status === 403)) redirect("/sign-in");
    const invalid = error instanceof CalendarError && error.status === 400;
    return <DashboardLayout><main className="space-y-4 p-4"><h1 className="text-2xl font-semibold">{invalid ? "Invalid calendar dates or filters" : "Calendar unavailable"}</h1><p>{invalid ? "Choose a valid date and supported filters." : "Please try again."}</p><Link className="text-emerald-800 underline" href="/calendar">Return to Calendar</Link></main></DashboardLayout>;
  }
  return <DashboardLayout><TaskCalendarWorkspace data={data} /></DashboardLayout>;
}
