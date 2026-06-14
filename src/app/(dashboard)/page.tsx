import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { CollaborationCard } from "@/components/dashboard/collaboration-card";
import { DeadlineCard } from "@/components/dashboard/deadline-card";
import { ProjectProgressCard } from "@/components/dashboard/project-progress-card";
import { RecentProjects } from "@/components/dashboard/recent-projects";
import { ReminderCard } from "@/components/dashboard/reminder-card";
import { StatCard } from "@/components/dashboard/stat-card";
import { UpdateList } from "@/components/dashboard/update-list";
import { ArchiveUploadButton } from "@/components/dashboard/upload-assets-button";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import {
  MotionItem,
  MotionSection,
  MotionStaggerGroup,
} from "@/components/motion/motion-primitives";
import { Skeleton } from "@/components/ui/skeleton";
import {
  buildProgressRecord,
  getDashboardCollaboration,
  getDashboardCounts,
  getDashboardDeadlines,
  getDashboardReminders,
  getDashboardUpdates,
  type DashboardCollaboratorRecord,
  type DashboardDeadlineRecord,
  type DashboardProgressRecord,
  type DashboardReminderRecord,
  type DashboardUpdateRecord,
} from "@/lib/dashboard";
import {
  getRecentProjects,
  type DashboardProjectCounts,
} from "@/lib/projects";
import { getDashboardArchiveUploadAccessState } from "@/lib/archives";
import { requireUser } from "@/lib/auth";
import { getAuthenticatedDefaultRoute } from "@/lib/permissions/fallback-route";
import { hasPermission } from "@/lib/permissions/resolver";

type RecentProjectsPromise = Promise<Awaited<ReturnType<typeof getRecentProjects>>>;

function getStatCards(counts: DashboardProjectCounts) {
  return [
    {
      title: "Total Projects",
      value: `${counts.total}`.padStart(2, "0"),
      delta: `${counts.total}`.padStart(2, "0"),
      note: "Accessible projects",
      href: "/projects?status=ALL&sort=newest",
      emphasize: true,
    },
    {
      title: "Active Projects",
      value: `${counts.ongoing}`.padStart(2, "0"),
      delta: `${counts.ongoing}`.padStart(2, "0"),
      note: "Currently active",
      href: "/projects?status=ACTIVE&sort=newest",
    },
    {
      title: "Pending Projects",
      value: `${counts.pending}`.padStart(2, "0"),
      delta: `${counts.pending}`.padStart(2, "0"),
      note: "Waiting to start",
      href: "/projects?status=PENDING&sort=newest",
    },
    {
      title: "On Hold Projects",
      value: `${counts.onHold}`.padStart(2, "0"),
      delta: `${counts.onHold}`.padStart(2, "0"),
      note: "Paused projects",
      href: "/projects?status=ON_HOLD&sort=newest",
    },
    {
      title: "Completed Projects",
      value: `${counts.completed}`.padStart(2, "0"),
      delta: `${counts.completed}`.padStart(2, "0"),
      note: "Delivered projects",
      href: "/projects?status=COMPLETED&sort=newest",
    },
  ] as const;
}

function StatCardsGrid({ counts }: { counts: DashboardProjectCounts }) {
  return (
    <MotionStaggerGroup
      className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,180px),1fr))] items-stretch gap-4"
      stagger={0.05}
    >
      {getStatCards(counts).map((card) => (
        <MotionItem key={card.title} className="h-full" y={10}>
          <StatCard {...card} />
        </MotionItem>
      ))}
    </MotionStaggerGroup>
  );
}

function StatCardsSkeleton() {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,180px),1fr))] items-stretch gap-4">
      {Array.from({ length: 5 }).map((_, index) => (
        <Skeleton key={index} className="h-[184px] rounded-[24px]" />
      ))}
    </div>
  );
}

function DashboardWidgetSkeleton({
  title,
  rows = 3,
}: {
  title: string;
  rows?: number;
}) {
  return (
    <article className="flex h-full min-h-[300px] min-w-0 flex-col rounded-[24px] bg-card p-5 shadow-[0_18px_45px_rgba(23,39,28,0.05)] sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <Skeleton className="h-5 w-40 rounded-full" aria-label={`${title} loading`} />
        <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
      </div>
      <div className="min-h-0 flex-1 space-y-2.5 overflow-hidden">
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="flex items-center gap-3 rounded-[16px] px-2 py-2">
            <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-3.5 w-3/4 rounded-full" />
              <Skeleton className="h-3 w-1/2 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}

function DashboardWidgetError({ title }: { title: string }) {
  return (
    <article className="flex h-full min-h-[300px] min-w-0 flex-col rounded-[24px] border border-[#f0d6ca] bg-[#fff8f3] p-5 shadow-[0_18px_45px_rgba(120,54,20,0.05)] sm:p-6">
      <h2 className="text-[17px] font-extrabold leading-none text-[#7b321f]">
        {title}
      </h2>
      <div className="grid min-h-0 flex-1 place-items-center text-center">
        <p className="max-w-[240px] text-[14px] leading-6 text-[#8a5a45]">
          Unable to load this dashboard card right now.
        </p>
      </div>
    </article>
  );
}

async function DashboardStatCards({
  countsPromise,
}: {
  countsPromise: Promise<DashboardProjectCounts>;
}) {
  const counts = await countsPromise.catch(() => null);

  if (!counts) {
    return <DashboardWidgetError title="Project Stats" />;
  }

  return <StatCardsGrid counts={counts} />;
}

async function ImportantUpdatesWidget({
  updatesPromise,
}: {
  updatesPromise: Promise<DashboardUpdateRecord[]>;
}) {
  const updates = await updatesPromise.catch(() => null);

  if (!updates) {
    return <DashboardWidgetError title="Important Updates" />;
  }

  return (
    <UpdateList
      title="Important Updates"
      items={updates.map((item) => ({
        id: item.id,
        title: item.title,
        project: item.detail,
        tone: item.tone,
        href: item.href,
      }))}
    />
  );
}

async function CollaborationWidget({
  collaborationPromise,
}: {
  collaborationPromise: Promise<DashboardCollaboratorRecord[]>;
}) {
  const collaborators = await collaborationPromise.catch(() => null);

  if (!collaborators) {
    return <DashboardWidgetError title="Collaboration" />;
  }

  return (
    <CollaborationCard
      title="Collaboration"
      items={collaborators}
      href="/collaboration"
    />
  );
}

async function ReminderWidget({
  remindersPromise,
}: {
  remindersPromise: Promise<DashboardReminderRecord[]>;
}) {
  const reminders = await remindersPromise.catch(() => null);

  if (!reminders) {
    return <DashboardWidgetError title="Reminder" />;
  }

  return (
    <ReminderCard
      title="Reminder"
      reminders={reminders}
      detailHref="/calendar"
    />
  );
}

async function ProjectProgressWidget({
  progressPromise,
}: {
  progressPromise: Promise<DashboardProgressRecord>;
}) {
  const progress = await progressPromise.catch(() => null);

  if (!progress) {
    return <DashboardWidgetError title="Active Projects" />;
  }

  return (
    <ProjectProgressCard
      title="Active Projects"
      percentage={progress.percentage}
      subtitle={progress.subtitle}
      segments={progress.segments}
    />
  );
}

async function RecentProjectsWidget({
  recentProjectsPromise,
}: {
  recentProjectsPromise: RecentProjectsPromise;
}) {
  const recentProjects = await recentProjectsPromise.catch(() => null);

  if (!recentProjects) {
    return <DashboardWidgetError title="Recent Projects" />;
  }

  return (
    <RecentProjects
      title="Recent Projects"
      items={recentProjects}
      href="/projects"
    />
  );
}

async function DeadlinesWidget({
  deadlinesPromise,
}: {
  deadlinesPromise: Promise<DashboardDeadlineRecord[]>;
}) {
  const deadlines = await deadlinesPromise.catch(() => null);

  if (!deadlines) {
    return <DashboardWidgetError title="Project Deadlines" />;
  }

  return (
    <DeadlineCard
      title="Project Deadlines"
      deadlines={deadlines}
    />
  );
}

export default async function Home() {
  const user = await requireUser();

  if (!hasPermission(user, "dashboard.view")) {
    redirect(getAuthenticatedDefaultRoute(user));
  }

  const uploadAccess = getDashboardArchiveUploadAccessState(user);
  const canCreateProject = hasPermission(user, "project.create");
  const countsPromise = getDashboardCounts(user);
  const recentProjectsPromise = hasPermission(user, "dashboard.viewRecentProjects")
    ? getRecentProjects(5, user)
    : Promise.resolve([]);
  const updatesPromise = getDashboardUpdates(user);
  const remindersPromise = getDashboardReminders(user);
  const collaborationPromise = getDashboardCollaboration(user);
  const progressPromise = countsPromise.then(buildProgressRecord);
  const deadlinesPromise = getDashboardDeadlines(user);

  return (
    <DashboardLayout>
      <section className="space-y-6">
        <MotionSection>
          <header className="flex min-w-0 flex-col gap-4 min-[1100px]:flex-row min-[1100px]:items-center min-[1100px]:justify-between">
            <div className="min-w-0">
              <h1 className="text-[42px] font-[600] leading-none text-[#0f1411] sm:text-[56px]">
                Dashboard
              </h1>
            </div>

            <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap">
              {canCreateProject ? (
                <Link
                  href="/projects/new"
                  className="inline-flex min-h-[54px] min-w-0 items-center justify-center rounded-full bg-[linear-gradient(90deg,#2f8d5d,#123f2d)] px-8 text-[17px] font-semibold text-white shadow-[0_16px_34px_rgba(34,102,70,0.24)] transition-transform hover:-translate-y-0.5"
                >
                  + New Project
                </Link>
              ) : null}
              <ArchiveUploadButton
                canUploadAssets={uploadAccess.canUploadAssets}
                disabledReason={
                  uploadAccess.canUploadAssets
                    ? undefined
                    : "You do not have permission to upload to Archive."
                }
              />
            </div>
          </header>
        </MotionSection>

        <Suspense fallback={<StatCardsSkeleton />}>
          <DashboardStatCards countsPromise={countsPromise} />
        </Suspense>

        <MotionStaggerGroup className="grid items-stretch gap-4 lg:grid-cols-2 xl:grid-cols-3" stagger={0.045}>
          <MotionItem className="h-full min-w-0" y={12}>
            <Suspense fallback={<DashboardWidgetSkeleton title="Important Updates" rows={4} />}>
              <ImportantUpdatesWidget updatesPromise={updatesPromise} />
            </Suspense>
          </MotionItem>

          <MotionItem className="h-full min-w-0" y={12}>
            <Suspense fallback={<DashboardWidgetSkeleton title="Reminder" rows={2} />}>
              <ReminderWidget remindersPromise={remindersPromise} />
            </Suspense>
          </MotionItem>

          <MotionItem className="h-full min-w-0" y={12}>
            <Suspense fallback={<DashboardWidgetSkeleton title="Recent Projects" rows={4} />}>
              <RecentProjectsWidget recentProjectsPromise={recentProjectsPromise} />
            </Suspense>
          </MotionItem>

          <MotionItem className="h-full min-w-0" y={12}>
            <Suspense fallback={<DashboardWidgetSkeleton title="Collaboration" rows={4} />}>
              <CollaborationWidget collaborationPromise={collaborationPromise} />
            </Suspense>
          </MotionItem>

          <MotionItem className="h-full min-w-0" y={12}>
            <Suspense fallback={<DashboardWidgetSkeleton title="Active Projects" rows={3} />}>
              <ProjectProgressWidget progressPromise={progressPromise} />
            </Suspense>
          </MotionItem>

          <MotionItem className="h-full min-w-0" y={12}>
            <Suspense fallback={<DashboardWidgetSkeleton title="Project Deadlines" rows={2} />}>
              <DeadlinesWidget deadlinesPromise={deadlinesPromise} />
            </Suspense>
          </MotionItem>
        </MotionStaggerGroup>
      </section>
    </DashboardLayout>
  );
}
