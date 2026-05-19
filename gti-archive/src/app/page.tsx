import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { StatCard } from "@/components/dashboard/stat-card";
import { UpdateList, type UpdateItem } from "@/components/dashboard/update-list";
import { ReminderCard } from "@/components/dashboard/reminder-card";
import {
  RecentProjects,
  type RecentProject,
} from "@/components/dashboard/recent-projects";
import {
  CollaborationCard,
  type Collaborator,
} from "@/components/dashboard/collaboration-card";
import { ProjectProgressCard } from "@/components/dashboard/project-progress-card";
import { DeadlineCard } from "@/components/dashboard/deadline-card";

const statCards = [
  {
    title: "Total Projects",
    value: "24",
    delta: "18^",
    note: "Increased from last month",
    emphasize: true,
  },
  {
    title: "Ongoing Projects",
    value: "07",
    delta: "12^",
    note: "Increased from last month",
  },
  {
    title: "Pending Projects",
    value: "03",
    delta: "01^",
    note: "Increased from last month",
  },
  {
    title: "Completed Projects",
    value: "14",
    delta: "09^",
    note: "Increased from last month",
  },
] as const;

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

const recentProjects: RecentProject[] = [
  { name: "Project Milano Fanpack ABCD", tone: "brand" },
  { name: "Project Cavallo Fanpack ABCD", tone: "brand" },
  { name: "Project Momento Fanpack ABCD", tone: "deep" },
  { name: "Project Alster Fanpack ABCD", tone: "deep" },
  { name: "Project Mond Fanpack ABCD", tone: "muted" },
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

export default function Home() {
  return (
    <DashboardLayout>
      <section className="space-y-6">
        <header className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight text-[#0f1411] sm:text-5xl">
              Dashboard
            </h1>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              className="inline-flex min-h-14 items-center justify-center rounded-full bg-[linear-gradient(90deg,#2f8d5d,#123f2d)] px-7 text-xl font-semibold text-white shadow-[0_16px_34px_rgba(34,102,70,0.24)] transition-transform hover:-translate-y-0.5"
            >
              + New Project
            </button>
            <button
              type="button"
              className="inline-flex min-h-14 items-center justify-center rounded-full border border-brand bg-white px-7 text-xl font-semibold text-brand transition-colors hover:bg-brand-soft"
            >
              + Upload Assets
            </button>
          </div>
        </header>

        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {statCards.map((card) => (
            <StatCard key={card.title} {...card} />
          ))}
        </section>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          <div className="xl:col-span-6">
            <UpdateList title="Important Updates" items={updates} />
          </div>
          <div className="xl:col-span-3">
            <ReminderCard
              title="Reminder"
              headline="Review the Artwork from company ABC"
              project="Project Milano ABCD"
              actionLabel="Take Action"
            />
          </div>
          <div className="xl:col-span-3">
            <RecentProjects title="Recent Projects" items={recentProjects} />
          </div>
          <div className="xl:col-span-5">
            <CollaborationCard title="Collaboration" items={collaborators} />
          </div>
          <div className="xl:col-span-4">
            <ProjectProgressCard
              title="Project Progress"
              percentage={55}
              subtitle="Projects Completed"
              segments={progressSegments}
            />
          </div>
          <div className="xl:col-span-3">
            <DeadlineCard
              title="Project Deadline"
              project="Project ABCD"
              timeLeft="48:50:29"
            />
          </div>
        </section>
      </section>
    </DashboardLayout>
  );
}
