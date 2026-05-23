"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";

import { Sidebar } from "@/components/layout/sidebar";
import { MotionPage } from "@/components/motion/motion-primitives";
import {
  Topbar,
  type DashboardTopbarProps,
  type DashboardUserView,
} from "@/components/layout/topbar";

type DashboardShellTopbarProps = Omit<
  DashboardTopbarProps,
  "onOpenSidebar" | "user"
>;

type DashboardShellProps = {
  children: React.ReactNode;
  topbarProps?: DashboardShellTopbarProps;
  user: DashboardUserView;
  projectBadgeCount?: number;
};

export function DashboardShell({
  children,
  topbarProps,
  user,
  projectBadgeCount,
}: DashboardShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();

  return (
    <div className="h-[100svh] overflow-hidden bg-background p-3 sm:p-4 lg:p-6">
      <div className="mx-auto flex h-full max-w-[1600px] gap-4 lg:gap-5">
        <Sidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          projectBadgeCount={projectBadgeCount}
        />

        <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-hidden">
          <Topbar
            onOpenSidebar={() => setSidebarOpen(true)}
            user={user}
            {...topbarProps}
          />
          <main className="dashboard-scroll min-h-0 flex-1 overflow-y-auto rounded-[32px] bg-surface p-5 shadow-[0_24px_80px_rgba(23,39,28,0.06)] sm:p-6 lg:p-8">
            <MotionPage key={pathname} y={12}>
              {children}
            </MotionPage>
          </main>
        </div>
      </div>
    </div>
  );
}
