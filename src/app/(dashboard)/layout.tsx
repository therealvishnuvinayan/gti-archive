import { DashboardAppFrame } from "@/components/layout/dashboard-app-frame";
import { requireUser, getUserDisplayName, getUserInitials } from "@/lib/auth";
import {
  getSidebarVisibility,
} from "@/lib/permissions/resolver";

export default async function DashboardRoutesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
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
      sidebarVisibility={sidebarVisibility}
    >
      {children}
    </DashboardAppFrame>
  );
}
