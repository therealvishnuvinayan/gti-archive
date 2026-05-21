import { CalendarWorkspace } from "@/components/calendar/calendar-workspace";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { getCalendarEvents } from "@/lib/calendar";

export default async function CalendarPage() {
  const events = await getCalendarEvents();

  return (
    <DashboardLayout
      topbarProps={{
        searchPlaceholder: "Search calendar...",
      }}
    >
      <CalendarWorkspace initialEvents={events} />
    </DashboardLayout>
  );
}
