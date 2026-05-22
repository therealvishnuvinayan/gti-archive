import type { Metadata } from "next";

import { DashboardAppFrame } from "@/components/layout/dashboard-app-frame";
import { getCurrentUser, getUserDisplayName, getUserInitials } from "@/lib/auth";
import { getDashboardProjectCounts } from "@/lib/projects";

import "./globals.css";

export const metadata: Metadata = {
  title: "GTI Archive",
  description:
    "A secure project archive and workflow management platform for organizing projects, documents, approvals, and team collaboration.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const layoutPromise = (async () => {
    const user = await getCurrentUser();

    if (!user) {
      return {
        user: null,
        projectBadgeCount: undefined,
      };
    }

    const counts = await getDashboardProjectCounts();
    const displayName = getUserDisplayName(user);

    return {
      user: {
        name: displayName,
        email: user.email,
        initials: getUserInitials(displayName),
      },
      projectBadgeCount: counts.ongoing,
    };
  })();

  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        <AsyncDashboardFrame promise={layoutPromise}>
          {children}
        </AsyncDashboardFrame>
      </body>
    </html>
  );
}

async function AsyncDashboardFrame({
  children,
  promise,
}: {
  children: React.ReactNode;
  promise: Promise<{
    user: {
      name: string;
      email: string;
      initials: string;
    } | null;
    projectBadgeCount?: number;
  }>;
}) {
  const { user, projectBadgeCount } = await promise;

  return (
    <DashboardAppFrame user={user} projectBadgeCount={projectBadgeCount}>
      {children}
    </DashboardAppFrame>
  );
}
