import { CalendarWorkspace } from "@/components/calendar/calendar-workspace";
import { DashboardLayout } from "@/components/layout/dashboard-layout";

export default function CalendarPage() {
  return (
    <DashboardLayout
      topbarProps={{
        searchPlaceholder: "Search calendar...",
      }}
    >
      <CalendarWorkspace />
    </DashboardLayout>
  );
}
