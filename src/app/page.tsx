import Link from "next/link";

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { StatCard } from "@/components/dashboard/stat-card";
import { UpdateList, type UpdateItem } from "@/components/dashboard/update-list";
import { ReminderCard } from "@/components/dashboard/reminder-card";
import {
  RecentProjects,
} from "@/components/dashboard/recent-projects";
import {
  CollaborationCard,
  type Collaborator,
} from "@/components/dashboard/collaboration-card";
import { ProjectProgressCard } from "@/components/dashboard/project-progress-card";
import { DeadlineCard } from "@/components/dashboard/deadline-card";
import { getDashboardProjectCounts, getRecentProjects } from "@/lib/projects";
import {
  MotionItem,
  MotionSection,
  MotionStaggerGroup,
} from "@/components/motion/motion-primitives";

const updates: UpdateItem[] = [
  {
    title: "Review the Artwork from company DCD",
    project: "Project Milano ABCD",
    tone: "critical",
  },
  {
    title: "Review the Submission from company Nixon",
    project: "Project Mond ABCD",
    tone: "critical",
  },
  {
    title: "Review the Approval from CEO for Milano ABCD",
    project: "Project Milano ABCD",
    tone: "success",
  },
  {
    title: "Review the Changes from CEO for Alster ABCD",
    project: "Project Alster ABCD",
    tone: "warning",
  },
];

const collaborators: Collaborator[] = [
  {
    name: "Sam",
    task: "Working on",
    project: "Milano ABCD",
    status: "Occupied",
  },
  {
    name: "Peter",
    task: "Working on",
    project: "Milano ABCD",
    status: "Rejected",
  },
  {
    name: "Tommy",
    task: "Working on",
    project: "Milano ABCD",
    status: "Free",
  },
  {
    name: "Louis",
    task: "Working on",
    project: "Milano ABCD",
    status: "Free",
  },
  {
    name: "Hennesey",
    task: "Working on",
    project: "Milano ABCD",
    status: "Occupied",
  },
];

const progressSegments = [
  { label: "Completed", value: 55, tone: "completed" },
  { label: "In Progress", value: 25, tone: "progress" },
  { label: "Pending", value: 20, tone: "pending" },
] as const;

export default async function Home() {
  const [counts, recentProjects] = await Promise.all([
    getDashboardProjectCounts(),
    getRecentProjects(),
  ]);
  const statCards = [
    {
      title: "Total Projects",
      value: `${counts.total}`.padStart(2, "0"),
      delta: `${counts.total}`.padStart(2, "0"),
      note: "Projects in database",
      emphasize: true,
    },
    {
      title: "Ongoing Projects",
      value: `${counts.ongoing}`.padStart(2, "0"),
      delta: `${counts.ongoing}`.padStart(2, "0"),
      note: "Currently active",
    },
    {
      title: "Pending Projects",
      value: `${counts.pending}`.padStart(2, "0"),
      delta: `${counts.pending}`.padStart(2, "0"),
      note: "Waiting to begin",
    },
    {
      title: "Completed Projects",
      value: `${counts.completed}`.padStart(2, "0"),
      delta: `${counts.completed}`.padStart(2, "0"),
      note: "Delivered projects",
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
              <Link
                href="/projects/new"
                className="inline-flex min-h-[54px] items-center justify-center rounded-full bg-[linear-gradient(90deg,#2f8d5d,#123f2d)] px-8 text-[17px] font-semibold text-white shadow-[0_16px_34px_rgba(34,102,70,0.24)] transition-transform hover:-translate-y-0.5"
              >
                + New Project
              </Link>
              <button
                type="button"
                className="inline-flex min-h-[54px] items-center justify-center rounded-full border border-brand bg-white px-8 text-[17px] font-medium text-brand transition-colors hover:bg-brand-soft"
              >
                + Upload Assets
              </button>
            </div>
          </header>
        </MotionSection>

        <MotionStaggerGroup
          className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4"
          stagger={0.05}
        >
          {statCards.map((card) => (
            <MotionItem key={card.title} y={10}>
              <StatCard {...card} />
            </MotionItem>
          ))}
        </MotionStaggerGroup>

        <MotionStaggerGroup
          className="grid grid-cols-1 gap-4 xl:grid-cols-12"
          stagger={0.045}
        >
          <div className="xl:col-span-6">
            <MotionItem y={12}>
              <UpdateList title="Important Updates" items={updates} />
            </MotionItem>
          </div>
          <div className="xl:col-span-3">
            <MotionItem y={12}>
              <ReminderCard
                title="Reminder"
                headline="Review the Artwork from company ABC"
                project="Project Milano ABCD"
                actionLabel="Take Action"
              />
            </MotionItem>
          </div>
          <div className="xl:col-span-3">
            <MotionItem y={12}>
              <RecentProjects title="Recent Projects" items={recentProjects} />
            </MotionItem>
          </div>
          <div className="xl:col-span-5">
            <MotionItem y={12}>
              <CollaborationCard title="Collaboration" items={collaborators} />
            </MotionItem>
          </div>
          <div className="xl:col-span-4">
            <MotionItem y={12}>
              <ProjectProgressCard
                title="Project Progress"
                percentage={55}
                subtitle="Projects Completed"
                segments={progressSegments}
              />
            </MotionItem>
          </div>
          <div className="xl:col-span-3">
            <MotionItem y={12}>
              <DeadlineCard
                title="Project Deadline"
                project="Project ABCD"
                timeLeft="48:50:29"
              />
            </MotionItem>
          </div>
        </MotionStaggerGroup>
      </section>
    </DashboardLayout>
  );
}
