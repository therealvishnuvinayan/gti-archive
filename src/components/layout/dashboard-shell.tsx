"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import { Sidebar } from "@/components/layout/sidebar";
import { MotionPage } from "@/components/motion/motion-primitives";
import {
  Topbar,
  type DashboardTopbarProps,
  type DashboardUserView,
} from "@/components/layout/topbar";
import type { SidebarVisibility } from "@/lib/permissions/resolver";

const SIDEBAR_COLLAPSED_STORAGE_KEY = "gti-sidebar-collapsed";

function isDenseWorkspaceRoute(pathname: string) {
  return (
    pathname.includes("/chat") ||
    /^\/projects\/[^/]+\/stages\/[34]\/concepts\/[^/]+/.test(pathname) ||
    /^\/projects\/[^/]+\/(?:stages\/2\/folders|workspace\/(?:private|shared))\/[^/]+/.test(
      pathname,
    )
  );
}

type DashboardShellTopbarProps = Omit<
  DashboardTopbarProps,
  "onOpenSidebar" | "user"
>;

type DashboardShellProps = {
  children: React.ReactNode;
  topbarProps?: DashboardShellTopbarProps;
  user: DashboardUserView;
  projectBadgeCount?: number;
  sidebarVisibility: SidebarVisibility;
};

export function DashboardShell({
  children,
  topbarProps,
  user,
  projectBadgeCount,
  sidebarVisibility,
}: DashboardShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const pathname = usePathname();
  const denseWorkspace = isDenseWorkspaceRoute(pathname);

  useEffect(() => {
    const preferenceTimer = window.setTimeout(() => {
      try {
        setSidebarCollapsed(
          window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "true",
        );
      } catch {
        // Storage can be unavailable in privacy-restricted browsing contexts.
      }
    }, 0);

    return () => window.clearTimeout(preferenceTimer);
  }, []);

  function toggleSidebarCollapsed() {
    setSidebarCollapsed((current) => {
      const nextValue = !current;

      try {
        window.localStorage.setItem(
          SIDEBAR_COLLAPSED_STORAGE_KEY,
          String(nextValue),
        );
      } catch {
        // The in-memory preference still works for the current session.
      }

      return nextValue;
    });
  }

  return (
    <div className="h-[100dvh] overflow-hidden bg-background p-2 sm:p-3 xl:p-4">
      <div className="flex h-full w-full min-w-0 gap-3 xl:gap-4">
        <Sidebar
          isCollapsed={sidebarCollapsed}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          onToggleCollapsed={toggleSidebarCollapsed}
          projectBadgeCount={projectBadgeCount}
          visibility={sidebarVisibility}
        />

        <div className="flex min-w-0 flex-1 flex-col gap-2.5 overflow-hidden">
          <Topbar
            onOpenSidebar={() => setSidebarOpen(true)}
            user={user}
            {...topbarProps}
            showNotifications={sidebarVisibility.notifications}
          />
          <main
            className={`dashboard-scroll min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto rounded-[22px] bg-surface shadow-[0_20px_60px_rgba(23,39,28,0.055)] sm:rounded-[26px] ${
              denseWorkspace
                ? "p-2 sm:p-3 lg:p-3"
                : "p-3 sm:p-4 lg:p-5 xl:p-6"
            }`}
            data-layout-density={denseWorkspace ? "workspace" : "standard"}
          >
            <MotionPage
              key={pathname}
              y={12}
              className={denseWorkspace ? "h-full min-w-0" : "min-w-0"}
            >
              {children}
            </MotionPage>
          </main>
        </div>
      </div>
    </div>
  );
}
