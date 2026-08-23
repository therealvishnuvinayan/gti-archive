import { DashboardAppFrame } from "@/components/layout/dashboard-app-frame";
import { requireUser, getUserDisplayName, getUserInitials } from "@/lib/auth";
import {
  getSidebarVisibility,
} from "@/lib/permissions/resolver";
import { getUserTaskSidebarCount } from "@/lib/user-tasks";

export default async function DashboardRoutesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const displayName = getUserDisplayName(user);
  const taskBadgeCount = await getUserTaskSidebarCount(user);
  const sidebarVisibility = {
    ...getSidebarVisibility(user),
    tasks: taskBadgeCount > 0,
  };

  return (
    <DashboardAppFrame
      user={{
        id: user.id,
        name: displayName,
        email: user.email,
        initials: getUserInitials(displayName),
        avatarSrc: user.avatarUrl
          ? `/api/profile/avatar?v=${encodeURIComponent(user.avatarUrl)}`
          : null,
      }}
      taskBadgeCount={taskBadgeCount}
      sidebarVisibility={sidebarVisibility}
    >
      {children}
    </DashboardAppFrame>
  );
}
