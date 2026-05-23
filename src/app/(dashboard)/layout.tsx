import { DashboardAppFrame } from "@/components/layout/dashboard-app-frame";
import { requireUser, getUserDisplayName, getUserInitials } from "@/lib/auth";
import { getDashboardProjectCounts } from "@/lib/projects";

export default async function DashboardRoutesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const counts = await getDashboardProjectCounts();
  const displayName = getUserDisplayName(user);

  return (
    <DashboardAppFrame
      user={{
        name: displayName,
        email: user.email,
        initials: getUserInitials(displayName),
      }}
      projectBadgeCount={counts.ongoing}
    >
      {children}
    </DashboardAppFrame>
  );
}
