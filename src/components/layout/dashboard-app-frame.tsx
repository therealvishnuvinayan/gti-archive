"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import type { DashboardUserView } from "@/components/layout/topbar";
import { Button } from "@/components/ui/button";

type DashboardAppFrameProps = {
  children: React.ReactNode;
  user?: DashboardUserView | null;
  projectBadgeCount?: number;
};

function BackPill({ href }: { href: string }) {
  return (
    <Button asChild size="lg" className="min-w-[146px]">
      <Link href={href}>Back</Link>
    </Button>
  );
}

function isPublicPath(pathname: string) {
  return pathname === "/sign-in" || pathname.startsWith("/register/");
}

function getTopbarProps(
  pathname: string,
  searchParams: URLSearchParams,
) {
  if (pathname === "/projects/new") {
    return {
      leadingContent: <BackPill href="/projects" />,
      showSearch: false,
    };
  }

  if (pathname === "/projects") {
    const query = searchParams.get("q")?.trim() ?? "";
    const status = searchParams.get("status") ?? "ONGOING";
    const sort = searchParams.get("sort") ?? "newest";

    return {
      searchPlaceholder: "Search for Projects...",
      searchAction: "/projects",
      searchDefaultValue: query,
      searchHiddenFields: [
        { name: "status", value: status },
        { name: "sort", value: sort },
      ],
    };
  }

  if (pathname.startsWith("/projects/")) {
    return {
      searchPlaceholder: "Search for Projects...",
      leadingContent: <BackPill href="/projects" />,
    };
  }

  if (pathname.startsWith("/archives/")) {
    return {
      searchPlaceholder: "Search archive files...",
      leadingContent: <BackPill href="/archives" />,
    };
  }

  if (pathname === "/archives") {
    return {
      searchPlaceholder: "Search archives...",
    };
  }

  if (pathname === "/calendar") {
    return {
      searchPlaceholder: "Search calendar...",
    };
  }

  if (pathname === "/collaboration") {
    return {
      searchPlaceholder: "Search collaborators...",
    };
  }

  if (pathname === "/library") {
    return {
      searchPlaceholder: "Search library...",
    };
  }

  if (pathname === "/settings" || pathname === "/help") {
    return {
      searchPlaceholder: "Search projects, files, people...",
    };
  }

  return {};
}

export function DashboardAppFrame({
  children,
  user,
  projectBadgeCount,
}: DashboardAppFrameProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (!pathname || isPublicPath(pathname) || !user) {
    return <>{children}</>;
  }

  return (
    <DashboardShell
      user={user}
      projectBadgeCount={projectBadgeCount}
      topbarProps={getTopbarProps(pathname, searchParams)}
    >
      {children}
    </DashboardShell>
  );
}
