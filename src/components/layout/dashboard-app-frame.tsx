"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { NotificationCenterProvider } from "@/components/notifications/notification-center";
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
      leadingContent: <BackPill href="/projects" />,
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
}: DashboardAppFrameProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (!pathname || !user) {
    return <>{children}</>;
  }

  return (
    <NotificationCenterProvider>
      <DashboardShell
        user={user}
        projectBadgeCount={projectBadgeCount}
        topbarProps={getTopbarProps(pathname, searchParams)}
      >
        {children}
      </DashboardShell>
    </NotificationCenterProvider>
  );
}
