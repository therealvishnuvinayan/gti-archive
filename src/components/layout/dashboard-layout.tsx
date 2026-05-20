import type { ReactNode } from "react";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { getUserDisplayName, getUserInitials, requireUser } from "@/lib/auth";

type DashboardLayoutProps = {
  children: React.ReactNode;
  topbarProps?: {
    searchPlaceholder?: string;
    leadingContent?: ReactNode;
    showSearch?: boolean;
  };
};

export async function DashboardLayout({
  children,
  topbarProps,
}: DashboardLayoutProps) {
  const user = await requireUser();
  const displayName = getUserDisplayName(user);

  return (
    <DashboardShell
      topbarProps={topbarProps}
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
