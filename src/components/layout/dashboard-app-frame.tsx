"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { NotificationCenterProvider } from "@/components/notifications/notification-center";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import type { DashboardUserView } from "@/components/layout/topbar";
import { Button } from "@/components/ui/button";
import type { SidebarVisibility } from "@/lib/permissions/resolver";

type DashboardAppFrameProps = {
  children: React.ReactNode;
  user?: DashboardUserView | null;
  projectBadgeCount?: number;
  sidebarVisibility: SidebarVisibility;
};

function BackPill({ href }: { href: string }) {
  return (
    <Button asChild size="lg" className="min-w-[146px]">
      <Link href={href}>Back</Link>
    </Button>
  );
}

function getProjectsReturnHref(value: string | null) {
  if (!value) {
    return "/projects";
  }

  try {
    const decodedValue = decodeURIComponent(value);

    if (decodedValue === "/projects" || decodedValue.startsWith("/projects?")) {
      return decodedValue;
    }
  } catch {
    if (value === "/projects" || value.startsWith("/projects?")) {
      return value;
    }
  }

  if (value === "/projects" || value.startsWith("/projects?")) {
    return value;
  }

  return "/projects";
}

function getTopbarProps(
  pathname: string,
  searchParams: URLSearchParams,
) {
  const projectSegments = pathname.split("/").filter(Boolean);

  if (pathname === "/projects/new") {
    return {
      leadingContent: <BackPill href="/projects" />,
    };
  }

  if (pathname === "/settings/project-master-data") {
    return {
      leadingContent: <BackPill href="/settings" />,
    };
  }

  if (pathname === "/projects") {
    return {};
  }

  if (projectSegments.length >= 3 && projectSegments[0] === "projects") {
    const [, projectId, nestedSegment] = projectSegments;

    if (nestedSegment === "chat") {
      return {
        leadingContent: <BackPill href={`/projects/${projectId}`} />,
      };
    }

    if (nestedSegment === "compare") {
      const stage = searchParams.get("stage");

      return {
        leadingContent: (
          <BackPill
            href={
              stage
                ? `/projects/${projectId}/chat?stage=${stage}`
                : `/projects/${projectId}`
            }
          />
        ),
      };
    }

    if (nestedSegment === "edit") {
      return {
        leadingContent: <BackPill href={`/projects/${projectId}`} />,
      };
    }
  }

  if (projectSegments.length === 2 && projectSegments[0] === "projects") {
    return {
      leadingContent: (
        <BackPill href={getProjectsReturnHref(searchParams.get("returnTo"))} />
      ),
    };
  }

  if (pathname.startsWith("/archives/")) {
    return {
      leadingContent: <BackPill href="/archives" />,
    };
  }

  return {};
}

export function DashboardAppFrame({
  children,
  user,
  projectBadgeCount,
  sidebarVisibility,
}: DashboardAppFrameProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    document.documentElement.classList.add("dashboard-document-scroll-lock");
    document.body.classList.add("dashboard-document-scroll-lock");

    return () => {
      document.documentElement.classList.remove("dashboard-document-scroll-lock");
      document.body.classList.remove("dashboard-document-scroll-lock");
    };
  }, []);

  if (!pathname || !user) {
    return <>{children}</>;
  }

  return (
    <NotificationCenterProvider>
      <DashboardShell
        user={user}
        projectBadgeCount={projectBadgeCount}
        sidebarVisibility={sidebarVisibility}
        topbarProps={getTopbarProps(pathname, searchParams)}
      >
        {children}
      </DashboardShell>
    </NotificationCenterProvider>
  );
}
