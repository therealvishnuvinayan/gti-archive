import { CalendarWorkspace } from "@/components/calendar/calendar-workspace";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { getCalendarEvents } from "@/lib/calendar";
import { getCollaborators } from "@/lib/collaboration";

export default async function CalendarPage() {
  const [events, collaborators] = await Promise.all([
    getCalendarEvents(),
    getCollaborators(),
  ]);

  return (
    <DashboardLayout
      topbarProps={{
        searchPlaceholder: "Search calendar...",
      }}
    >
      <CalendarWorkspace
        initialEvents={events}
        collaborators={collaborators}
      />
    </DashboardLayout>
  );
}
