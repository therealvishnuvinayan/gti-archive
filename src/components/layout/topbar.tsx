"use client";

import type { ReactNode } from "react";
import { Bell, ChevronDown, LogOut, Menu, MessageSquareText } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type DashboardUserView = {
  name: string;
  email: string;
  initials: string;
};

export type DashboardTopbarProps = {
  user?: DashboardUserView;
  onOpenSidebar: () => void;
  leadingContent?: ReactNode;
};

const defaultUser: DashboardUserView = {
  name: "Demo User",
  email: "demouser@gulbahartobacco.com",
  initials: "DU",
};

export function Topbar({
  user = defaultUser,
  onOpenSidebar,
  leadingContent,
}: DashboardTopbarProps) {
  return (
    <header className="rounded-[30px] bg-surface px-4 py-4 shadow-[0_18px_40px_rgba(23,39,28,0.05)] sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onOpenSidebar}
              className="grid h-12 w-12 place-items-center rounded-2xl border border-line bg-white text-[#263129] shadow-[0_8px_24px_rgba(15,26,20,0.06)] lg:hidden"
              aria-label="Open sidebar"
            >
              <Menu className="h-5 w-5" />
            </button>

            {leadingContent}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 sm:gap-4">
          {[
            { label: "Messages", icon: MessageSquareText },
            { label: "Notifications", icon: Bell },
          ].map((item) => {
            const Icon = item.icon;

            return (
              <button
                key={item.label}
                type="button"
                className="grid h-[54px] w-[54px] place-items-center rounded-full bg-white text-[#1c241d] shadow-[0_10px_24px_rgba(15,26,20,0.05)] transition-transform hover:-translate-y-0.5"
                aria-label={item.label}
              >
                <Icon className="h-[18px] w-[18px]" />
              </button>
            );
          })}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex min-w-[250px] cursor-pointer items-center gap-3 rounded-full bg-white px-3 py-2 shadow-[0_10px_24px_rgba(15,26,20,0.05)] outline-none transition-transform hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-brand/35"
                aria-label="Open user menu"
              >
                <div className="grid h-[56px] w-[56px] place-items-center rounded-full bg-[radial-gradient(circle_at_top,#ffd7c5,#d88f6c_55%,#7c4a34)] text-[20px] font-bold text-white">
                  {user.initials}
                </div>
                <div className="min-w-0 flex-1 text-left">
                  <p className="truncate text-[17px] font-extrabold leading-tight text-[#18211a]">
                    {user.name}
                  </p>
                  <p className="truncate text-[13px] text-muted">
                    {user.email}
                  </p>
                </div>
                <ChevronDown className="h-4 w-4 shrink-0 text-[#7d877f]" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[260px]">
              <DropdownMenuLabel>Account</DropdownMenuLabel>
              <div className="px-3 pb-2">
                <p className="truncate text-[15px] font-semibold text-[#18211a]">
                  {user.name}
                </p>
                <p className="truncate text-[13px] text-muted">{user.email}</p>
              </div>
              <DropdownMenuSeparator />
              <form action="/sign-out" method="post">
                <DropdownMenuItem asChild variant="destructive">
                  <button type="submit" className="flex w-full cursor-pointer items-center">
                    <LogOut className="h-4 w-4" />
                    Sign out
                  </button>
                </DropdownMenuItem>
              </form>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
