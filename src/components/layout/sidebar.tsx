"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  ShieldUser,
  Sparkles,
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
      { label: "Flux AI", href: "/flux-ai", icon: Sparkles, visibilityKey: "fluxAi" },
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
      total?: unknown;
      cachedAt?: unknown;
    };

    if (
      typeof payload.total !== "number" ||
      typeof payload.cachedAt !== "number" ||
      Date.now() - payload.cachedAt > PROJECT_BADGE_COUNT_CACHE_TTL_MS
    ) {
      return null;
    }

    return payload.total;
  } catch {
    return null;
  }
}

function cacheProjectBadgeCount(total: number) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(
      PROJECT_BADGE_COUNT_CACHE_KEY,
      JSON.stringify({
        total,
        cachedAt: Date.now(),
      }),
    );
  } catch {
    // Ignore storage failures; the count can still load from the API.
  }
}

function clearCachedProjectBadgeCount() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.removeItem(PROJECT_BADGE_COUNT_CACHE_KEY);
  } catch {
    // Ignore storage failures; the badge can remain hidden without cache access.
  }
}

type SidebarProps = {
  isCollapsed: boolean;
  isOpen: boolean;
  onClose: () => void;
  onToggleCollapsed: () => void;
  projectBadgeCount?: number;
  visibility: SidebarVisibility;
};

function LogoMark({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <div className="relative h-9 w-7 overflow-hidden rounded-[9px] bg-white/55">
        <Image
          src="/gti-logo.svg"
          alt="GTI logo mark"
          width={80}
          height={57}
          priority
          className="absolute left-1/2 top-0 h-auto w-20 max-w-none -translate-x-1/2"
        />
      </div>
    );
  }

  return (
    <div className="relative h-[76px] w-[166px]">
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

function SidebarNavigationLink({
  item,
  badge,
  isActive,
  isCollapsed,
  onNavigate,
}: {
  item: SidebarItem;
  badge?: string;
  isActive: boolean;
  isCollapsed: boolean;
  onNavigate: () => void;
}) {
  const Icon = item.icon;
  const tooltipId = useId();
  const linkRef = useRef<HTMLAnchorElement | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);

  function showTooltip() {
    if (!isCollapsed || !linkRef.current) {
      return;
    }

    const rect = linkRef.current.getBoundingClientRect();
    setTooltipPosition({ left: rect.right + 10, top: rect.top + rect.height / 2 });
  }

  function hideTooltip() {
    setTooltipPosition(null);
  }

  return (
    <li className="relative">
      {isActive ? (
        <span
          className={`absolute inset-y-2 w-1 rounded-r-full bg-[linear-gradient(180deg,#2f8d5d,#147347)] shadow-[0_8px_18px_rgba(43,128,85,0.32)] ${
            isCollapsed ? "-left-2" : "-left-4"
          }`}
        />
      ) : null}
      <Link
        ref={linkRef}
        href={item.href}
        onClick={onNavigate}
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
        onFocus={showTooltip}
        onBlur={hideTooltip}
        aria-label={isCollapsed ? item.label : undefined}
        aria-describedby={isCollapsed ? tooltipId : undefined}
        className={`group relative grid min-h-[52px] grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-[18px] px-2.5 py-2 text-[14px] transition-[background-color,color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/35 ${
          isCollapsed
            ? "xl:min-h-[50px] xl:grid-cols-1 xl:place-items-center xl:gap-0 xl:rounded-[16px] xl:px-1 xl:py-1"
            : ""
        } ${
          isActive
            ? "bg-white text-[#121714] shadow-[0_12px_30px_rgba(18,34,25,0.09)]"
            : "text-[#59635c] hover:bg-white/70 hover:text-[#202a23]"
        }`}
      >
        <span
          className={`grid size-10 place-items-center rounded-[13px] transition-colors ${
            isActive
              ? "bg-[#eef8ef] text-brand"
              : "text-[#758178] group-hover:bg-[#eef3ed] group-hover:text-brand"
          }`}
        >
          <Icon className="h-5 w-5" strokeWidth={1.9} />
        </span>
        <span
          className={`min-w-0 truncate ${isCollapsed ? "xl:sr-only" : ""} ${
            isActive ? "font-[800]" : "font-[650]"
          }`}
        >
          {item.label}
        </span>
        {badge ? (
          <span
            className={`grid min-h-6 min-w-6 shrink-0 place-items-center rounded-[9px] bg-[linear-gradient(180deg,#2f8d5d,#197448)] px-1.5 text-[11px] font-[800] leading-none text-white shadow-[0_8px_18px_rgba(43,128,85,0.24)] ${
              isCollapsed
                ? "xl:absolute xl:right-0 xl:top-0 xl:min-h-5 xl:min-w-5 xl:rounded-[7px] xl:px-1 xl:text-[9px]"
                : ""
            }`}
          >
            {badge}
          </span>
        ) : null}
      </Link>

      {tooltipPosition && typeof document !== "undefined"
        ? createPortal(
            <span
              id={tooltipId}
              role="tooltip"
              className="pointer-events-none fixed z-[80] hidden -translate-y-1/2 whitespace-nowrap rounded-[9px] border border-[#dce5dc] bg-[#17231b] px-2.5 py-1.5 text-[11px] font-[700] text-white shadow-[0_12px_30px_rgba(14,28,19,0.2)] xl:block"
              style={{ left: tooltipPosition.left, top: tooltipPosition.top }}
            >
              {item.label}
            </span>,
            document.body,
          )
        : null}
    </li>
  );
}

export function Sidebar({
  isCollapsed,
  isOpen,
  onClose,
  onToggleCollapsed,
  projectBadgeCount,
  visibility,
}: SidebarProps) {
  const pathname = usePathname();
  const { unreadCount } = useNotificationCenter();
  const [fetchedProjectBadgeCount, setFetchedProjectBadgeCount] = useState<
    number | undefined
  >(undefined);
  const resolvedProjectBadgeCount =
    !visibility.projectCounts
      ? undefined
      : typeof projectBadgeCount === "number"
      ? projectBadgeCount
      : fetchedProjectBadgeCount;

  useEffect(() => {
    if (!visibility.projectCounts) {
      clearCachedProjectBadgeCount();
      return;
    }

    if (typeof projectBadgeCount === "number" || !visibility.projects) {
      return;
    }

    const controller = new AbortController();
    const cachedCount = readCachedProjectBadgeCount();

    const cacheTimeoutId =
      typeof cachedCount === "number"
        ? window.setTimeout(() => {
            setFetchedProjectBadgeCount(cachedCount);
          }, 0)
        : null;

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

          return (await response.json()) as { total?: unknown };
        })
        .then((payload) => {
          if (typeof payload?.total === "number") {
            setFetchedProjectBadgeCount(payload.total);
            cacheProjectBadgeCount(payload.total);
          }
        })
        .catch((error) => {
          if (!(error instanceof DOMException && error.name === "AbortError")) {
            setFetchedProjectBadgeCount(undefined);
          }
        });
    }, 500);

    return () => {
      if (cacheTimeoutId !== null) {
        window.clearTimeout(cacheTimeoutId);
      }

      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [pathname, projectBadgeCount, visibility.projectCounts, visibility.projects]);

  return (
    <>
      <div
        className={`fixed inset-0 z-30 bg-[#152119]/45 backdrop-blur-[2px] transition-opacity duration-200 xl:hidden ${
          isOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        aria-hidden={!isOpen}
        onClick={onClose}
      />

      <aside
        className={`fixed inset-y-2 left-2 z-40 flex w-[min(88vw,310px)] flex-col overflow-hidden rounded-[26px] border border-white/70 bg-[linear-gradient(180deg,#f8faf5_0%,#eef2eb_100%)] px-5 py-5 shadow-[0_28px_90px_rgba(18,34,25,0.16)] transition-transform duration-200 sm:inset-y-3 sm:left-3 sm:px-6 xl:static xl:inset-auto xl:z-0 xl:h-full xl:translate-x-0 xl:transition-[width,padding] xl:shadow-[0_18px_48px_rgba(18,34,25,0.055)] ${
          isCollapsed ? "xl:w-[76px] xl:px-2" : "xl:w-[280px] xl:px-4"
        } ${
          isOpen ? "translate-x-0" : "-translate-x-[115%]"
        }`}
      >
        <div
          className={`flex items-center justify-center ${
            isCollapsed ? "mb-5 gap-1 xl:mb-5 xl:flex-col xl:gap-2" : "mb-7 gap-1"
          }`}
        >
          <Link
            href="/"
            onClick={onClose}
            className="inline-flex cursor-pointer"
            aria-label="Go to dashboard home"
            title="Go to dashboard home"
          >
            <span className={isCollapsed ? "xl:hidden" : ""}>
              <LogoMark />
            </span>
            {isCollapsed ? (
              <span className="hidden xl:block">
                <LogoMark compact />
              </span>
            ) : null}
          </Link>
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="hidden size-7 shrink-0 place-items-center rounded-[9px] border border-[#dce4dc] bg-white/70 text-[#536057] transition hover:bg-white hover:text-[#234e37] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/35 xl:grid"
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isCollapsed ? (
              <PanelLeftOpen className="h-3.5 w-3.5" />
            ) : (
              <PanelLeftClose className="h-3.5 w-3.5" />
            )}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 grid h-9 w-9 shrink-0 place-items-center rounded-[12px] border border-[#dfe6dc] bg-white text-[#344038] shadow-[0_12px_28px_rgba(18,34,25,0.08)] xl:hidden"
            aria-label="Close sidebar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav
          className={`sidebar-scroll -mr-5 flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto pb-1 sm:-mr-6 ${
            isCollapsed
              ? "gap-6 pr-5 sm:pr-6 xl:-mr-2 xl:pr-2"
              : "gap-8 pr-6 sm:pr-7 xl:-mr-4 xl:pr-5"
          }`}
        >
          {sidebarSections.map((section) => (
            <div key={section.title}>
              <p className={`mb-3 px-3 text-[10px] font-[800] uppercase leading-5 text-[#6d7a70] ${isCollapsed ? "xl:sr-only" : ""}`}>
                {section.title}
              </p>
              <ul className="space-y-1.5">
                {section.items.filter((item) => visibility[item.visibilityKey]).map((item) => {
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
                    <SidebarNavigationLink
                      key={item.label}
                      item={item}
                      badge={badge}
                      isActive={isActive}
                      isCollapsed={isCollapsed}
                      onNavigate={onClose}
                    />
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
