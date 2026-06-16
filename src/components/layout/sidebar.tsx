"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Archive,
  Bell,
  BookOpen,
  CalendarDays,
  Folder,
  Handshake,
  HelpCircle,
  LayoutDashboard,
  Settings,
  ShieldUser,
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
      { label: "Dashboard", href: "/", icon: LayoutDashboard, visibilityKey: "dashboard" },
      { label: "Projects", href: "/projects", icon: Folder, visibilityKey: "projects" },
      { label: "Calendar", href: "/calendar", icon: CalendarDays, visibilityKey: "calendar" },
      {
        label: "Collaboration",
        href: "/collaboration",
        icon: Handshake,
        visibilityKey: "collaboration",
      },
      {
        label: "Users & Permissions",
        href: "/users",
        icon: ShieldUser,
        visibilityKey: "users",
      },
      { label: "Notifications", href: "/notifications", icon: Bell, visibilityKey: "notifications" },
      { label: "Library", href: "/library", icon: BookOpen, visibilityKey: "library" },
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

const PROJECT_BADGE_COUNT_CACHE_KEY = "gti:sidebar-project-badge-count";
const PROJECT_BADGE_COUNT_CACHE_TTL_MS = 30_000;

function readCachedProjectBadgeCount() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const cachedValue = window.sessionStorage.getItem(PROJECT_BADGE_COUNT_CACHE_KEY);

    if (!cachedValue) {
      return null;
    }

    const payload = JSON.parse(cachedValue) as {
      ongoing?: unknown;
      cachedAt?: unknown;
    };

    if (
      typeof payload.ongoing !== "number" ||
      typeof payload.cachedAt !== "number" ||
      Date.now() - payload.cachedAt > PROJECT_BADGE_COUNT_CACHE_TTL_MS
    ) {
      return null;
    }

    return payload.ongoing;
  } catch {
    return null;
  }
}

function cacheProjectBadgeCount(ongoing: number) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(
      PROJECT_BADGE_COUNT_CACHE_KEY,
      JSON.stringify({
        ongoing,
        cachedAt: Date.now(),
      }),
    );
  } catch {
    // Ignore storage failures; the count can still load from the API.
  }
}

type SidebarProps = {
  isOpen: boolean;
  onClose: () => void;
  projectBadgeCount?: number;
  visibility: SidebarVisibility;
};

function LogoMark() {
  return (
    <div className="relative h-[86px] w-[178px]">
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
  const [fetchedProjectBadgeCount, setFetchedProjectBadgeCount] = useState<
    number | undefined
  >(undefined);
  const resolvedProjectBadgeCount =
    typeof projectBadgeCount === "number"
      ? projectBadgeCount
      : fetchedProjectBadgeCount;

  useEffect(() => {
    if (typeof projectBadgeCount === "number" || !visibility.projects) {
      return;
    }

    const controller = new AbortController();
    const cachedCount = readCachedProjectBadgeCount();

    if (typeof cachedCount === "number") {
      const cacheTimeoutId = window.setTimeout(() => {
        setFetchedProjectBadgeCount(cachedCount);
      }, 0);

      return () => {
        window.clearTimeout(cacheTimeoutId);
      };
    }

    const timeoutId = window.setTimeout(() => {
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
            cacheProjectBadgeCount(payload.ongoing);
          }
        })
        .catch((error) => {
          if (!(error instanceof DOMException && error.name === "AbortError")) {
            setFetchedProjectBadgeCount(undefined);
          }
        });
    }, 500);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [projectBadgeCount, visibility.projects]);

  return (
    <>
      <div
        className={`fixed inset-0 z-30 bg-[#152119]/45 backdrop-blur-[2px] transition-opacity duration-200 lg:hidden ${
          isOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        aria-hidden={!isOpen}
        onClick={onClose}
      />

      <aside
        className={`fixed inset-y-3 left-3 z-40 flex w-[min(86vw,330px)] flex-col overflow-hidden rounded-[32px] border border-white/70 bg-[linear-gradient(180deg,#f8faf5_0%,#eef2eb_100%)] px-6 py-7 shadow-[0_28px_90px_rgba(18,34,25,0.16)] transition-transform duration-300 sm:px-7 lg:static lg:inset-auto lg:z-0 lg:h-full lg:w-[326px] lg:translate-x-0 lg:shadow-[0_22px_60px_rgba(18,34,25,0.06)] ${
          isOpen ? "translate-x-0" : "-translate-x-[115%]"
        }`}
      >
        <div className="mb-9 flex items-start justify-center gap-3 lg:mb-10">
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
            className="absolute right-5 top-5 grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[#dfe6dc] bg-white text-[#344038] shadow-[0_12px_28px_rgba(18,34,25,0.08)] lg:hidden"
            aria-label="Close sidebar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="sidebar-scroll flex min-h-0 flex-1 flex-col gap-9 overflow-y-auto pb-1 pr-2">
          {sidebarSections.map((section) => (
            <div key={section.title}>
              <p className="mb-4 px-4 text-[11px] font-[800] uppercase leading-5 text-[#6d7a70]">
                {section.title}
              </p>
              <ul className="space-y-2">
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
                        <span className="absolute inset-y-3 -left-6 w-1.5 rounded-r-full bg-[linear-gradient(180deg,#2f8d5d,#147347)] shadow-[0_8px_18px_rgba(43,128,85,0.32)] sm:-left-7" />
                      ) : null}
                      <Link
                        href={item.href}
                        onClick={onClose}
                        className={`group grid min-h-[58px] grid-cols-[42px_minmax(0,1fr)_auto] items-center gap-3 rounded-[20px] px-3.5 py-2.5 text-[15px] transition-all ${
                          isActive
                            ? "bg-white text-[#121714] shadow-[0_16px_38px_rgba(18,34,25,0.09)]"
                            : "text-[#59635c] hover:bg-white/70 hover:text-[#202a23]"
                        }`}
                      >
                        <span
                          className={`grid size-[42px] place-items-center rounded-[14px] transition-colors ${
                            isActive
                              ? "bg-[#eef8ef] text-brand"
                              : "text-[#758178] group-hover:bg-[#eef3ed] group-hover:text-brand"
                          }`}
                        >
                          <Icon className="h-[21px] w-[21px]" strokeWidth={1.9} />
                        </span>
                        <span
                          className={`min-w-0 truncate ${
                            isActive ? "font-[800]" : "font-[650]"
                          }`}
                        >
                          {item.label}
                        </span>
                        {badge ? (
                          <span className="grid min-h-7 min-w-7 shrink-0 place-items-center rounded-[10px] bg-[linear-gradient(180deg,#2f8d5d,#197448)] px-2 text-[12px] font-[800] leading-none text-white shadow-[0_8px_18px_rgba(43,128,85,0.24)]">
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
