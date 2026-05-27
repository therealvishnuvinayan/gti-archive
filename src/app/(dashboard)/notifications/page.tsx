import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { NotificationsPageWorkspace } from "@/components/notifications/notifications-page-workspace";

export default function NotificationsPage() {
  return (
    <DashboardLayout>
      <NotificationsPageWorkspace />
    </DashboardLayout>
  );
}
