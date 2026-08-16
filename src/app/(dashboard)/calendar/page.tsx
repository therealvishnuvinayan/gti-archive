import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { CalendarWorkspace } from "@/components/calendar/calendar-workspace";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import {
  getCalendarAccessState,
  getCalendarEvents,
  type CalendarView,
} from "@/lib/calendar";
import { getCalendarCollaborators, getCollaborators } from "@/lib/collaboration";
import { hasPermission } from "@/lib/permissions/resolver";

type CalendarPageProps = {
  searchParams?: Promise<{
    view?: string;
    date?: string;
    event?: string;
  }>;
};

function resolveInitialView(value?: string): CalendarView {
  return value === "day" || value === "week" || value === "month" ? value : "month";
}

export default async function CalendarPage({ searchParams }: CalendarPageProps) {
  const user = await requireUser();

  if (!hasPermission(user, "calendar.view")) {
    redirect("/");
  }

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const access = await getCalendarAccessState(user);
  const [events, availableCollaborators, assignedCollaborators] = await Promise.all([
    getCalendarEvents(user),
    access.canManageCollaborators ? getCollaborators() : Promise.resolve([]),
    access.canManageCollaborators
      ? getCalendarCollaborators()
      : Promise.resolve([]),
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
        initialDate={resolvedSearchParams?.date}
        focusedEventId={resolvedSearchParams?.event}
        availableCollaborators={availableCollaborators}
        assignedCollaborators={assignedCollaborators}
        canCreateEvents={hasPermission(user, "calendar.create")}
        canManageCollaborators={access.canManageCollaborators}
      />
    </DashboardLayout>
  );
}
