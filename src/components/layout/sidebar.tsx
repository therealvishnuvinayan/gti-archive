"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  BookCopy,
  Bell,
  CalendarDays,
  HelpCircle,
  LayoutGrid,
  Library,
  Settings,
  Users,
  Archive,
  X,
} from "lucide-react";

import { useNotificationCenter } from "@/components/notifications/notification-center";
import type { SidebarVisibility } from "@/lib/permissions/resolver";

type SidebarItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  visibilityKey: keyof SidebarVisibility;
  badge?: string;
};

type SidebarSection = {
  title: string;
  items: SidebarItem[];
};

const sidebarSections: SidebarSection[] = [
  {
    title: "Menu",
    items: [
      { label: "Dashboard", href: "/", icon: LayoutGrid, visibilityKey: "dashboard" },
      { label: "Projects", href: "/projects", icon: BookCopy, visibilityKey: "projects" },
      { label: "Calendar", href: "/calendar", icon: CalendarDays, visibilityKey: "calendar" },
      { label: "Collaboration", href: "/collaboration", icon: Users, visibilityKey: "collaboration" },
      { label: "Users", href: "/users", icon: Users, visibilityKey: "users" },
      { label: "Notifications", href: "/notifications", icon: Bell, visibilityKey: "notifications" },
      { label: "Library", href: "/library", icon: Library, visibilityKey: "library" },
      { label: "Archives", href: "/archives", icon: Archive, visibilityKey: "archives" },
    ],
  },
  {
    title: "General",
    items: [
      { label: "Settings", href: "/settings", icon: Settings, visibilityKey: "settings" },
      { label: "Help", href: "/help", icon: HelpCircle, visibilityKey: "help" },
    ],
  },
];

type SidebarProps = {
  isOpen: boolean;
  onClose: () => void;
  projectBadgeCount?: number;
  visibility: SidebarVisibility;
};

function LogoMark() {
  return (
    <div className="relative h-[78px] w-[176px]">
      <Image
        src="/gti-logo.svg"
        alt="GTI logo"
        fill
        priority
        className="object-contain object-left"
      />
    </div>
  );
}

export function Sidebar({
  isOpen,
  onClose,
  projectBadgeCount,
  visibility,
}: SidebarProps) {
  const pathname = usePathname();
  const { unreadCount } = useNotificationCenter();
  const [fetchedProjectBadgeCount, setFetchedProjectBadgeCount] = useState<number>();
  const resolvedProjectBadgeCount =
    typeof projectBadgeCount === "number"
      ? projectBadgeCount
      : fetchedProjectBadgeCount;

  useEffect(() => {
    if (typeof projectBadgeCount === "number" || !visibility.projects) {
      return;
    }

    const controller = new AbortController();

    fetch("/api/projects/dashboard-count", {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          return null;
        }

        return (await response.json()) as { ongoing?: unknown };
      })
      .then((payload) => {
        if (typeof payload?.ongoing === "number") {
          setFetchedProjectBadgeCount(payload.ongoing);
        }
      })
      .catch((error) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setFetchedProjectBadgeCount(undefined);
        }
      });

    return () => controller.abort();
  }, [projectBadgeCount, visibility.projects]);

  return (
    <>
      <div
        className={`fixed inset-0 z-30 bg-[#152119]/45 transition-opacity duration-200 lg:hidden ${
          isOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        aria-hidden={!isOpen}
        onClick={onClose}
      />

      <aside
        className={`fixed inset-y-3 left-3 z-40 flex w-[min(82vw,290px)] flex-col overflow-hidden rounded-[30px] bg-sidebar px-6 py-7 shadow-[0_25px_80px_rgba(18,34,25,0.08)] transition-transform duration-300 lg:static lg:inset-auto lg:z-0 lg:h-full lg:w-[306px] lg:translate-x-0 lg:shadow-none ${
          isOpen ? "translate-x-0" : "-translate-x-[115%]"
        }`}
      >
        <div className="mb-10 flex items-start justify-between gap-3 lg:mb-14">
          <Link
            href="/"
            onClick={onClose}
            className="inline-flex cursor-pointer"
            aria-label="Go to dashboard home"
            title="Go to dashboard home"
          >
            <LogoMark />
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-line bg-white text-[#344038] lg:hidden"
            aria-label="Close sidebar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="dashboard-scroll-thin flex min-h-0 flex-1 flex-col gap-10 overflow-y-auto pr-1">
          {sidebarSections.map((section) => (
            <div key={section.title}>
              <p className="mb-4 px-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted/75">
                {section.title}
              </p>
              <ul className="space-y-1.5">
                {section.items.filter((item) => visibility[item.visibilityKey]).map((item) => {
                  const Icon = item.icon;
                  const badge =
                    item.href === "/projects" && typeof resolvedProjectBadgeCount === "number"
                      ? String(resolvedProjectBadgeCount)
                      : item.href === "/notifications"
                        ? unreadCount > 0
                          ? String(unreadCount)
                          : undefined
                      : item.badge;
                  const isActive =
                    item.href !== "#" &&
                    (pathname === item.href ||
                      (item.href !== "/" && pathname.startsWith(`${item.href}/`)));

                  return (
                    <li key={item.label} className="relative">
                      {isActive ? (
                        <span className="absolute inset-y-2 -left-6 w-2 rounded-r-full bg-brand" />
                      ) : null}
                      <Link
                        href={item.href}
                        onClick={onClose}
                        className={`flex items-center gap-3 rounded-2xl px-3 py-3.5 text-[15px] font-semibold transition-colors ${
                          isActive
                            ? "bg-white text-[#18211a] shadow-[0_12px_30px_rgba(24,48,34,0.06)]"
                            : "text-[#6c736d] hover:bg-white/70 hover:text-[#263129]"
                        }`}
                      >
                        <Icon
                          className={`h-5 w-5 ${
                            isActive ? "text-brand" : "text-[#adb5af]"
                          }`}
                        />
                        <span className="flex-1">{item.label}</span>
                        {badge ? (
                          <span className="rounded-md bg-brand px-2 py-0.5 text-[11px] font-bold text-white">
                            {badge}
                          </span>
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

      </aside>
    </>
  );
}
