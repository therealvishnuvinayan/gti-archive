import { redirect } from "next/navigation";

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { NotificationsPageWorkspace } from "@/components/notifications/notifications-page-workspace";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions/resolver";

export default async function NotificationsPage() {
  const user = await requireUser();

  if (!hasPermission(user, "notification.view")) {
    redirect("/");
  }

  return (
    <DashboardLayout>
      <NotificationsPageWorkspace />
    </DashboardLayout>
  );
}
