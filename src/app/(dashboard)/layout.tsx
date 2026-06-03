import { DashboardAppFrame } from "@/components/layout/dashboard-app-frame";
import { requireUser, getUserDisplayName, getUserInitials } from "@/lib/auth";
import {
  getSidebarVisibility,
  hasPermission,
} from "@/lib/permissions/resolver";
import { getDashboardProjectCounts } from "@/lib/projects";

export default async function DashboardRoutesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const counts = hasPermission(user, "dashboard.viewProjectCounts")
    ? await getDashboardProjectCounts(user)
    : { ongoing: 0 };
  const displayName = getUserDisplayName(user);
  const sidebarVisibility = getSidebarVisibility(user);

  return (
    <DashboardAppFrame
      user={{
        name: displayName,
        email: user.email,
        initials: getUserInitials(displayName),
        avatarSrc: user.avatarUrl
          ? `/api/profile/avatar?v=${encodeURIComponent(user.avatarUrl)}`
          : null,
      }}
      projectBadgeCount={counts.ongoing}
      sidebarVisibility={sidebarVisibility}
    >
      {children}
    </DashboardAppFrame>
  );
}
