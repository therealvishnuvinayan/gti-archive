import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { ManualCalendarWorkspace } from "@/components/calendar/manual-calendar-workspace";
import { calendarV2Enabled } from "@/lib/calendar-v2/activation";
import { hasPermission } from "@/lib/permissions/resolver";
import { getAuthenticatedDefaultRoute } from "@/lib/permissions/fallback-route";

export const dynamic = "force-dynamic";
export default async function ManualCalendarPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  if (!hasPermission(user, "calendar.view")) redirect(getAuthenticatedDefaultRoute(user));
  return <ManualCalendarWorkspace user={user} params={await searchParams} taskCalendarEnabled={calendarV2Enabled()} />;
}
