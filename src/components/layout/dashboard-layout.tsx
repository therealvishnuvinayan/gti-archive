"use client";

import type { ReactNode } from "react";
import { useState } from "react";

import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";

type DashboardLayoutProps = {
  children: React.ReactNode;
  topbarProps?: {
    searchPlaceholder?: string;
    leadingContent?: ReactNode;
    showSearch?: boolean;
  };
};

export function DashboardLayout({
  children,
  topbarProps,
}: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background p-3 sm:p-4 lg:p-6">
      <div className="mx-auto flex max-w-[1600px] gap-4 lg:gap-5">
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <Topbar
            onOpenSidebar={() => setSidebarOpen(true)}
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
