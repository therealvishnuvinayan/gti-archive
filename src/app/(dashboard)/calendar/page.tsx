import { notFound } from "next/navigation";

import { CalendarWorkspace } from "@/components/calendar/calendar-workspace";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { requireUser } from "@/lib/auth";
import { getCalendarEvents } from "@/lib/calendar";
import { getCalendarCollaborators, getCollaborators } from "@/lib/collaboration";
import { hasPermission } from "@/lib/permissions/resolver";

export default async function CalendarPage() {
  const user = await requireUser();

  if (!hasPermission(user, "calendar.view")) {
    notFound();
  }

  const canAssignParticipants = hasPermission(user, "calendar.assignParticipants");
  const canInviteCollaborators =
    hasPermission(user, "collaboration.createUser") &&
    hasPermission(user, "collaboration.manageModuleAccess");
  const [events, availableCollaborators, assignedCollaborators] = await Promise.all([
    getCalendarEvents(user),
    canAssignParticipants ? getCollaborators() : Promise.resolve([]),
    canAssignParticipants ? getCalendarCollaborators() : Promise.resolve([]),
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
        canCreateEvents={hasPermission(user, "calendar.create")}
        canAssignParticipants={canAssignParticipants}
        canInviteCollaborators={canInviteCollaborators}
      />
    </DashboardLayout>
  );
}
