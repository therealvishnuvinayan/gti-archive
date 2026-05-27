import { requireUser } from "@/lib/auth";
import { CalendarWorkspace } from "@/components/calendar/calendar-workspace";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import {
  getCalendarAccessState,
  getCalendarEvents,
  type CalendarView,
} from "@/lib/calendar";
import { getCalendarCollaborators, getCollaborators } from "@/lib/collaboration";

type CalendarPageProps = {
  searchParams?: Promise<{
    view?: string;
  }>;
};

function resolveInitialView(value?: string): CalendarView {
  return value === "day" || value === "week" || value === "month" ? value : "month";
}

export default async function CalendarPage({ searchParams }: CalendarPageProps) {
  const user = await requireUser();
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const [events, availableCollaborators, assignedCollaborators, access] = await Promise.all([
    getCalendarEvents(user),
    getCollaborators(),
    getCalendarCollaborators(),
    getCalendarAccessState(user),
  ]);

  return (
    <DashboardLayout
      topbarProps={{
        searchPlaceholder: "Search calendar...",
      }}
    >
      <CalendarWorkspace
        initialEvents={events}
        initialView={resolveInitialView(resolvedSearchParams?.view)}
        availableCollaborators={availableCollaborators}
        assignedCollaborators={assignedCollaborators}
        canManageCollaborators={access.canManageCollaborators}
      />
    </DashboardLayout>
  );
}
