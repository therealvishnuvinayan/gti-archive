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
  backNavigation?: {
    href: string;
    label: string;
    ariaLabel: string;
  };
};

function getTopbarProps(
  pathname: string,
  searchParams: URLSearchParams,
  backNavigation?: DashboardAppFrameProps["backNavigation"],
) {
  if (backNavigation) {
    return {
      leadingContent: (
        <ProjectBackButton
          href={backNavigation.href}
          label={backNavigation.label}
          ariaLabel={backNavigation.ariaLabel}
        />
      ),
    };
  }

  const navigation = getDashboardBackNavigation(pathname, searchParams);
  if (navigation.owner !== "topbar") return {};
  const isCompareWorkspace =
    /^\/projects\/[^/]+\/compare$/.test(pathname) ||
    /^\/projects\/[^/]+\/stages\/[34]\/concepts\/[^/]+\/compare$/.test(pathname);

  return {
    leadingContent: (
      <div className="flex min-w-0 items-center gap-3">
        <ProjectBackButton
          href={navigation.href}
          label={navigation.label}
          ariaLabel={navigation.ariaLabel}
        />
        {isCompareWorkspace ? (
          <h1 className="max-w-[110px] truncate text-[15px] font-semibold tracking-[-0.02em] text-[#111712] sm:max-w-none sm:text-[18px]">
            Compare Submissions
          </h1>
        ) : null}
      </div>
    ),
  };
}

export function DashboardAppFrame({
  children,
  user,
  projectBadgeCount,
  sidebarVisibility,
  backNavigation,
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
        topbarProps={getTopbarProps(pathname, searchParams, backNavigation)}
      >
        {children}
      </DashboardShell>
    </NotificationCenterProvider>
  );
}
