import { CalendarWorkspace } from "@/components/calendar/calendar-workspace";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { getCalendarEvents } from "@/lib/calendar";
import { getCalendarCollaborators, getCollaborators } from "@/lib/collaboration";

export default async function CalendarPage() {
  const [events, availableCollaborators, assignedCollaborators] = await Promise.all([
    getCalendarEvents(),
    getCollaborators(),
    getCalendarCollaborators(),
  ]);

  return (
    <DashboardLayout
      topbarProps={{
        searchPlaceholder: "Search calendar...",
      }}
    >
      <CalendarWorkspace
        initialEvents={events}
        availableCollaborators={availableCollaborators}
        assignedCollaborators={assignedCollaborators}
      />
    </DashboardLayout>
  );
}
