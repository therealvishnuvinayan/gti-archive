"use client";

import { useState } from "react";

import { Sidebar } from "@/components/layout/sidebar";
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
};

export function DashboardShell({
  children,
  topbarProps,
  user,
}: DashboardShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background p-3 sm:p-4 lg:p-6">
      <div className="mx-auto flex max-w-[1600px] gap-4 lg:gap-5">
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <Topbar
            onOpenSidebar={() => setSidebarOpen(true)}
            user={user}
            {...topbarProps}
          />
          <main className="min-w-0 rounded-[32px] bg-surface p-5 shadow-[0_24px_80px_rgba(23,39,28,0.06)] sm:p-6 lg:p-8">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
