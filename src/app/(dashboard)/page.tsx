import Link from "next/link";
import { redirect } from "next/navigation";

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { StatCard } from "@/components/dashboard/stat-card";
import { UploadAssetsButton } from "@/components/dashboard/upload-assets-button";
import { UpdateList } from "@/components/dashboard/update-list";
import { ReminderCard } from "@/components/dashboard/reminder-card";
import {
  RecentProjects,
} from "@/components/dashboard/recent-projects";
import {
  CollaborationCard,
} from "@/components/dashboard/collaboration-card";
import { ProjectProgressCard } from "@/components/dashboard/project-progress-card";
import { DeadlineCard } from "@/components/dashboard/deadline-card";
import { requireUser } from "@/lib/auth";
import { getDashboardSnapshot } from "@/lib/dashboard";
import { getAuthenticatedDefaultRoute } from "@/lib/permissions/fallback-route";
import { hasPermission } from "@/lib/permissions/resolver";
import {
  getDashboardLibraryUploadAccessState,
  getLibraryUploadProjectsForUser,
} from "@/lib/library";
import {
  MotionItem,
  MotionSection,
  MotionStaggerGroup,
} from "@/components/motion/motion-primitives";

export default async function Home() {
  const user = await requireUser();

  if (!hasPermission(user, "dashboard.view")) {
    redirect(getAuthenticatedDefaultRoute(user));
  }

  const [dashboard, uploadProjects] = await Promise.all([
    getDashboardSnapshot(user),
    getLibraryUploadProjectsForUser(user),
  ]);
  const uploadAccess = getDashboardLibraryUploadAccessState(user);
  const canCreateProject = hasPermission(user, "project.create");
  const statCards = [
    {
      title: "Total Projects",
      value: `${dashboard.counts.total}`.padStart(2, "0"),
      delta: `${dashboard.counts.total}`.padStart(2, "0"),
      note: "Accessible projects",
      href: "/projects?status=ALL&sort=newest",
      emphasize: true,
    },
    {
      title: "Ongoing Projects",
      value: `${dashboard.counts.ongoing}`.padStart(2, "0"),
      delta: `${dashboard.counts.ongoing}`.padStart(2, "0"),
      note: "Currently active",
      href: "/projects?status=ONGOING&sort=newest",
    },
    {
      title: "Pending Projects",
      value: `${dashboard.counts.pending}`.padStart(2, "0"),
      delta: `${dashboard.counts.pending}`.padStart(2, "0"),
      note: "Waiting to start",
      href: "/projects?status=PENDING&sort=newest",
    },
    {
      title: "On Hold Projects",
      value: `${dashboard.counts.onHold}`.padStart(2, "0"),
      delta: `${dashboard.counts.onHold}`.padStart(2, "0"),
      note: "Paused projects",
      href: "/projects?status=ON_HOLD&sort=newest",
    },
    {
      title: "Completed Projects",
      value: `${dashboard.counts.completed}`.padStart(2, "0"),
      delta: `${dashboard.counts.completed}`.padStart(2, "0"),
      note: "Delivered projects",
      href: "/projects?status=COMPLETED&sort=newest",
    },
  ] as const;

  return (
    <DashboardLayout>
      <section className="space-y-6">
        <MotionSection>
          <header className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h1 className="text-[42px] font-[600] leading-none tracking-[-0.05em] text-[#0f1411] sm:text-[56px]">
                Dashboard
              </h1>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              {canCreateProject ? (
                <Link
                  href="/projects/new"
                  className="inline-flex min-h-[54px] items-center justify-center rounded-full bg-[linear-gradient(90deg,#2f8d5d,#123f2d)] px-8 text-[17px] font-semibold text-white shadow-[0_16px_34px_rgba(34,102,70,0.24)] transition-transform hover:-translate-y-0.5"
                >
                  + New Project
                </Link>
              ) : null}
              <UploadAssetsButton
                canUploadAssets={uploadAccess.canUploadAssets}
                disabledReason={
                  uploadAccess.canUploadAssets
                    ? undefined
                    : "You do not have permission to upload assets."
                }
                projects={uploadProjects}
              />
            </div>
          </header>
        </MotionSection>

        <MotionStaggerGroup
          className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-2 xl:grid-cols-5"
          stagger={0.05}
        >
          {statCards.map((card) => (
            <MotionItem key={card.title} className="h-full" y={10}>
              <StatCard {...card} />
            </MotionItem>
          ))}
        </MotionStaggerGroup>

        <MotionStaggerGroup
          className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,0.95fr)_minmax(0,1fr)]"
          stagger={0.045}
        >
          <MotionItem className="grid content-start gap-4" y={12}>
            <UpdateList
              title="Important Updates"
              items={dashboard.updates.map((item) => ({
                id: item.id,
                title: item.title,
                project: item.detail,
                tone: item.tone,
                href: item.href,
              }))}
            />
            <CollaborationCard
              title="Collaboration"
              items={dashboard.collaborators}
              href="/collaboration"
            />
          </MotionItem>

          <MotionItem className="grid content-start gap-4" y={12}>
            <ReminderCard
              title="Reminder"
              headline={dashboard.reminder?.headline}
              project={dashboard.reminder?.project}
              actionLabel={dashboard.reminder?.actionLabel}
              actionHref={dashboard.reminder?.actionHref}
              detailHref={dashboard.reminder?.actionHref}
            />
            <ProjectProgressCard
              title="Project Progress"
              percentage={dashboard.progress.percentage}
              subtitle={dashboard.progress.subtitle}
              segments={dashboard.progress.segments}
            />
          </MotionItem>

          <MotionItem className="grid content-start gap-4 lg:col-span-2 xl:col-span-1" y={12}>
            <RecentProjects
              title="Recent Projects"
              items={dashboard.recentProjects}
              href="/projects"
            />
            <DeadlineCard
              title="Project Deadline"
              project={dashboard.deadline?.project}
              detail={dashboard.deadline?.detail}
              timeLabel={dashboard.deadline?.timeLabel}
              actionHref={dashboard.deadline?.actionHref}
              overdue={dashboard.deadline?.overdue}
            />
          </MotionItem>
        </MotionStaggerGroup>
      </section>
    </DashboardLayout>
  );
}
