import Link from "next/link";
import { CalendarWorkspace } from "@/components/calendar/calendar-workspace";
import { getCalendarAccessState, getCalendarEvents, type CalendarAccessUser } from "@/lib/calendar";
import { hasPermission } from "@/lib/permissions/resolver";

// Reuse the established manual-event projection and operations. V2 does not
// grant calendar sharing, so no collaborator directory is loaded here.
export async function ManualCalendarWorkspace({ user, params, taskCalendarEnabled }: {
  user: CalendarAccessUser;
  params: Record<string, string | string[] | undefined>;
  taskCalendarEnabled: boolean;
}) {
  const [access, events] = await Promise.all([getCalendarAccessState(user), getCalendarEvents(user)]);
  return <div className="space-y-4" data-manual-calendar>
    {taskCalendarEnabled && <nav aria-label="Calendar workspaces" className="flex flex-wrap gap-4 text-sm">
      <Link href="/calendar" className="text-emerald-800 underline">Task Calendar</Link>
      <span aria-current="page" className="font-semibold">Manual Events</span>
    </nav>}
    <h1 className="text-2xl font-semibold">{taskCalendarEnabled ? "Manual Events" : "Calendar"}</h1>
    <CalendarWorkspace
      initialEvents={events}
      initialView={params.view === "day" || params.view === "week" ? params.view : "month"}
      initialDate={typeof params.date === "string" ? params.date : undefined}
      focusedEventId={typeof params.event === "string" ? params.event : undefined}
      availableCollaborators={[]}
      assignedCollaborators={[]}
      canUseBusinessCalendars={access.canViewSharedSchedule}
      canCreateEvents={hasPermission(user, "calendar.create")}
      canManageCollaborators={access.canManageCollaborators}
    />
  </div>;
}
