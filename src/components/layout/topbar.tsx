"use client";

import type { ReactNode } from "react";
import { Bell, Menu, MessageSquareText, Search } from "lucide-react";

type TopbarProps = {
  onOpenSidebar: () => void;
  searchPlaceholder?: string;
  leadingContent?: ReactNode;
  showSearch?: boolean;
};

export function Topbar({
  onOpenSidebar,
  searchPlaceholder = "Search.....",
  leadingContent,
  showSearch = true,
}: TopbarProps) {
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

          {showSearch ? (
            <label className="flex h-[52px] w-full max-w-[430px] items-center gap-3 rounded-full bg-white px-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] xl:min-w-[350px]">
              <Search className="h-4.5 w-4.5 text-muted" />
              <input
                type="search"
                placeholder={searchPlaceholder}
                className="w-full bg-transparent text-[15px] font-medium text-[#1b231d] outline-none placeholder:text-[#9aa197]"
              />
            </label>
          ) : null}
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

          <div className="flex min-w-[250px] items-center gap-3 rounded-full bg-white px-3 py-2 shadow-[0_10px_24px_rgba(15,26,20,0.05)]">
            <div className="grid h-[56px] w-[56px] place-items-center rounded-full bg-[radial-gradient(circle_at_top,#ffd7c5,#d88f6c_55%,#7c4a34)] text-[20px] font-bold text-white">
              DU
            </div>
            <div className="min-w-0">
              <p className="truncate text-[17px] font-extrabold leading-tight text-[#18211a]">
                Demo User
              </p>
              <p className="truncate text-[13px] text-muted">
                demouser@gulbahartobacco.com
              </p>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
