"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { NotificationCenterProvider } from "@/components/notifications/notification-center";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import type { DashboardUserView } from "@/components/layout/topbar";
import { ProjectBackButton } from "@/components/projects/project-back-button";
import { getDashboardBackNavigation } from "@/lib/dashboard-navigation";
import type { SidebarVisibility } from "@/lib/permissions/resolver";

type DashboardAppFrameProps = {
  children: React.ReactNode;
  user?: DashboardUserView | null;
  projectBadgeCount?: number;
  sidebarVisibility: SidebarVisibility;
};

function getTopbarProps(
  pathname: string,
  searchParams: URLSearchParams,
) {
  const navigation = getDashboardBackNavigation(pathname, searchParams);
  if (navigation.owner !== "topbar") return {};

  return {
    leadingContent: (
      <ProjectBackButton
        href={navigation.href}
        label={navigation.label}
        ariaLabel={navigation.ariaLabel}
      />
    ),
  };
}

export function DashboardAppFrame({
  children,
  user,
  projectBadgeCount,
  sidebarVisibility,
}: DashboardAppFrameProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    document.documentElement.classList.add("dashboard-document-scroll-lock");
    document.body.classList.add("dashboard-document-scroll-lock");

    return () => {
      document.documentElement.classList.remove("dashboard-document-scroll-lock");
      document.body.classList.remove("dashboard-document-scroll-lock");
    };
  }, []);

  if (!pathname || !user) {
    return <>{children}</>;
  }

  return (
    <NotificationCenterProvider currentUserId={user.id}>
      <DashboardShell
        user={user}
        projectBadgeCount={projectBadgeCount}
        sidebarVisibility={sidebarVisibility}
        topbarProps={getTopbarProps(pathname, searchParams)}
      >
        {children}
      </DashboardShell>
    </NotificationCenterProvider>
  );
}
