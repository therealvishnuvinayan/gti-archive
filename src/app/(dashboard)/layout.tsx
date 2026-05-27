import { DashboardAppFrame } from "@/components/layout/dashboard-app-frame";
import { requireUser, getUserDisplayName, getUserInitials } from "@/lib/auth";
import { getSidebarVisibility } from "@/lib/permissions/resolver";
import { getDashboardProjectCounts } from "@/lib/projects";

export default async function DashboardRoutesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const counts = await getDashboardProjectCounts(user);
  const displayName = getUserDisplayName(user);

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
      visibleSidebarItems={getSidebarVisibility(user)}
    >
      {children}
    </DashboardAppFrame>
  );
}
