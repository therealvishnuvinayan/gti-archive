import type { ReactNode } from "react";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { getUserDisplayName, getUserInitials, requireUser } from "@/lib/auth";
import { getDashboardProjectCounts } from "@/lib/projects";

type DashboardLayoutProps = {
  children: React.ReactNode;
  topbarProps?: {
    searchPlaceholder?: string;
    leadingContent?: ReactNode;
    showSearch?: boolean;
    searchAction?: string;
    searchName?: string;
    searchDefaultValue?: string;
    searchHiddenFields?: Array<{
      name: string;
      value: string;
    }>;
  };
};

export async function DashboardLayout({
  children,
  topbarProps,
}: DashboardLayoutProps) {
  const [user, projectCounts] = await Promise.all([
    requireUser(),
    getDashboardProjectCounts(),
  ]);
  const displayName = getUserDisplayName(user);

  return (
    <DashboardShell
      topbarProps={topbarProps}
      projectBadgeCount={projectCounts.ongoing}
      user={{
        name: displayName,
        email: user.email,
        initials: getUserInitials(displayName),
      }}
    >
      {children}
    </DashboardShell>
  );
}
