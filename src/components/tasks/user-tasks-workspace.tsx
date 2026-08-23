"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Clock3,
  FolderKanban,
  ListTodo,
  Search,
  UserRound,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatProjectPriority } from "@/lib/project-priority";
import type {
  UserTaskListItem,
  UserTasksPageData,
} from "@/lib/user-tasks";
import type {
  UserTaskDisplayStatus,
  UserTaskDotTone,
} from "@/lib/user-projects";

type TaskFilter =
  | "ALL"
  | "OPEN"
  | "NEEDS_ATTENTION"
  | "WAITING_FOR_REVIEW"
  | "COMPLETED";

const taskStatusClasses: Record<UserTaskDisplayStatus, string> = {
  NOT_STARTED: "border-[#dde2de] bg-[#f3f5f3] text-[#667068]",
  IN_PROGRESS: "border-[#d2e5f6] bg-[#edf6ff] text-[#276fa8]",
  NEEDS_ATTENTION: "border-[#f4d5c4] bg-[#fff1e9] text-[#c75a29]",
  WAITING_FOR_REVIEW: "border-[#dfd5f2] bg-[#f4efff] text-[#7554b3]",
  COMPLETED: "border-[#cee7d7] bg-[#eaf7ee] text-[#28764c]",
};

const taskDotClasses: Record<UserTaskDotTone, string> = {
  gray: "bg-[#9ca39e]",
  blue: "bg-[#4b9ce8]",
  orange: "bg-[#ef6a43]",
  purple: "bg-[#8b68d6]",
  green: "bg-[#28a066]",
};

const filterOptions: Array<{ value: TaskFilter; label: string }> = [
  { value: "ALL", label: "All Tasks" },
  { value: "OPEN", label: "Open" },
  { value: "NEEDS_ATTENTION", label: "Needs Attention" },
  { value: "WAITING_FOR_REVIEW", label: "Waiting for Review" },
  { value: "COMPLETED", label: "Completed" },
];

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No deadline";

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Dubai",
  }).format(date);
}

function taskMatchesFilter(task: UserTaskListItem, filter: TaskFilter) {
  if (filter === "OPEN") return task.display.status !== "COMPLETED";
  if (filter === "NEEDS_ATTENTION") {
    return task.display.status === "NEEDS_ATTENTION";
  }
  if (filter === "WAITING_FOR_REVIEW") {
    return task.display.status === "WAITING_FOR_REVIEW";
  }
  if (filter === "COMPLETED") return task.display.status === "COMPLETED";
  return true;
}

function TaskStatusBadge({ task }: { task: UserTaskListItem }) {
  return (
    <span
      className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-[760] ${taskStatusClasses[task.display.status]}`}
    >
      <span className={`size-1.5 rounded-full ${taskDotClasses[task.display.dotTone]}`} />
      {task.display.label}
    </span>
  );
}

function TaskRow({ task }: { task: UserTaskListItem }) {
  return (
    <Link
      href={task.href}
      className="group grid gap-4 rounded-[16px] border border-[#e2e8e2] bg-white px-4 py-4 transition hover:-translate-y-0.5 hover:border-[#bcd3c3] hover:shadow-[0_14px_34px_rgba(27,69,44,0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2d8258] focus-visible:ring-offset-2 md:grid-cols-[110px_minmax(0,1fr)_auto] md:items-center"
    >
      <span className="inline-flex w-fit items-center rounded-[10px] bg-[#edf5ef] px-3 py-2 text-[11px] font-[780] text-[#277650]">
        Stage {task.stageNumber}
      </span>

      <span className="min-w-0">
        <span className="block truncate text-[14px] font-[760] text-[#1d2720] sm:text-[15px]">
          {task.name}
        </span>
        <span className="mt-1 block text-[11px] text-[#7b857e]">
          {task.stageLabel}
        </span>
        <span className="mt-2 flex flex-wrap items-center gap-2.5">
          <TaskStatusBadge task={task} />
          {task.dueAt ? (
            <span
              className={`inline-flex items-center gap-1.5 text-[10px] font-[680] ${
                task.isOverdue ? "text-[#c6572d]" : "text-[#68736b]"
              }`}
            >
              <CalendarClock className="size-3.5" />
              {task.isOverdue ? "Overdue" : "Due"} {formatDate(task.dueAt)}
            </span>
          ) : null}
        </span>
      </span>

      <span className="inline-flex items-center gap-2 text-[11px] font-[760] text-[#25744e] md:justify-self-end">
        Open task
        <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}

export function UserTasksWorkspace({ data }: { data: UserTasksPageData }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<TaskFilter>("ALL");
  const [expandedProjectIds, setExpandedProjectIds] = useState<Set<string>>(
    () => new Set(data.projects.slice(0, 1).map((project) => project.id)),
  );
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredProjects = useMemo(
    () =>
      data.projects
        .map((project) => ({
          ...project,
          tasks: project.tasks.filter((task) => {
            const matchesQuery =
              !normalizedQuery ||
              project.name.toLocaleLowerCase().includes(normalizedQuery) ||
              project.ownerName?.toLocaleLowerCase().includes(normalizedQuery) ||
              task.name.toLocaleLowerCase().includes(normalizedQuery) ||
              task.stageLabel.toLocaleLowerCase().includes(normalizedQuery);

            return matchesQuery && taskMatchesFilter(task, filter);
          }),
        }))
        .filter((project) => project.tasks.length > 0),
    [data.projects, filter, normalizedQuery],
  );
  function toggleProject(projectId: string) {
    setExpandedProjectIds((current) => {
      const next = new Set(current);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  }

  if (data.summary.total === 0) {
    return (
      <section className="mx-auto flex min-h-[520px] w-full max-w-[1180px] items-center justify-center pb-8">
        <Card className="w-full rounded-[26px] border border-dashed border-[#cbd8ce] bg-white shadow-[0_18px_50px_rgba(22,49,31,0.05)]">
          <CardContent className="flex min-h-[360px] flex-col items-center justify-center px-6 py-12 text-center">
            <span className="grid size-16 place-items-center rounded-[20px] bg-[#eaf4ed] text-[#2f8057]">
              <ListTodo className="size-8" />
            </span>
            <h1 className="mt-5 text-[27px] font-[780] tracking-[-0.035em] text-[#172019]">
              No tasks assigned yet
            </h1>
            <p className="mt-2 max-w-md text-[13px] leading-6 text-[#707a73]">
              Stage 3 and Stage 4 concept taskers assigned to you will appear here automatically.
            </p>
          </CardContent>
        </Card>
      </section>
    );
  }

  const summaryCards = [
    {
      label: "All Tasks",
      value: data.summary.total,
      note: `${data.projects.length} project ${data.projects.length === 1 ? "folder" : "folders"}`,
      icon: ListTodo,
      tone: "bg-[#e9f4ed] text-[#267950]",
    },
    {
      label: "Open",
      value: data.summary.open,
      note: "Ready for your work",
      icon: Clock3,
      tone: "bg-[#edf4fb] text-[#3678a9]",
    },
    {
      label: "Needs Attention",
      value: data.summary.needsAttention,
      note: "Changes requested",
      icon: CircleAlert,
      tone: "bg-[#fff0e8] text-[#c75a29]",
    },
    {
      label: "Completed",
      value: data.summary.completed,
      note: `${data.summary.waitingForReview} waiting for review`,
      icon: CheckCircle2,
      tone: "bg-[#edf7f0] text-[#2c7a50]",
    },
  ];

  return (
    <section className="mx-auto w-full max-w-[1280px] pb-8">
      <header className="rounded-[25px] border border-[#dfe7e0] bg-[linear-gradient(135deg,#ffffff_0%,#f3f8f3_62%,#eaf4ed_100%)] px-5 py-6 shadow-[0_16px_44px_rgba(25,59,38,0.055)] sm:px-7 sm:py-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] font-[800] uppercase tracking-[0.14em] text-[#2d8056]">
              Executor Workspace
            </p>
            <h1 className="mt-2 text-[34px] font-[800] leading-none tracking-[-0.045em] text-[#101611] sm:text-[44px]">
              My Tasks
            </h1>
            <p className="mt-3 max-w-[680px] text-[13px] leading-6 text-[#68736b] sm:text-[14px]">
              Open a project folder and jump directly into your assigned concept work.
            </p>
          </div>
          <div className="flex w-fit items-center gap-3 rounded-[16px] border border-[#d7e5da] bg-white/80 px-4 py-3 shadow-[0_10px_26px_rgba(27,67,43,0.05)]">
            <span className="grid size-10 place-items-center rounded-[13px] bg-[#e7f3ea] text-[#2d8056]">
              <ListTodo className="size-5" />
            </span>
            <span>
              <span className="block text-[10px] font-[700] text-[#7a857d]">Assigned work</span>
              <span className="mt-0.5 block text-[13px] font-[760] text-[#263129]">
                {data.summary.open} open {data.summary.open === 1 ? "task" : "tasks"}
              </span>
            </span>
          </div>
        </div>
      </header>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.label} className="rounded-[19px] border-[#e0e7e0] bg-white shadow-[0_12px_30px_rgba(24,52,34,0.04)]">
              <CardContent className="flex items-center gap-4 p-4 sm:p-5">
                <span className={`grid size-11 shrink-0 place-items-center rounded-[14px] ${card.tone}`}>
                  <Icon className="size-5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[22px] font-[800] leading-none tracking-[-0.035em] text-[#172019]">
                    {card.value}
                  </span>
                  <span className="mt-1.5 block text-[11px] font-[750] text-[#3e4941]">{card.label}</span>
                  <span className="mt-0.5 block truncate text-[10px] text-[#879088]">{card.note}</span>
                </span>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <section className="mt-6">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="no-scrollbar flex max-w-full overflow-x-auto rounded-[14px] border border-[#d9e2da] bg-white p-1 shadow-[0_8px_24px_rgba(22,48,31,0.035)]">
            {filterOptions.map((option) => (
              <Button
                key={option.value}
                type="button"
                variant={filter === option.value ? "default" : "ghost"}
                onClick={() => setFilter(option.value)}
                className={`h-10 shrink-0 rounded-[10px] px-4 text-[12px] ${
                  filter === option.value ? "shadow-[0_8px_18px_rgba(31,112,70,0.18)]" : "text-[#465149]"
                }`}
              >
                {option.label}
              </Button>
            ))}
          </div>
          <label className="relative block w-full xl:w-[340px]">
            <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[#879189]" />
            <Input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search project folders or tasks..."
              className="h-12 rounded-[14px] border-[#d9e2da] bg-white pl-11 text-[12px] shadow-[0_8px_24px_rgba(22,48,31,0.035)]"
            />
          </label>
        </div>

        <div className="mt-5 space-y-3">
          {filteredProjects.map((project) => {
            const expanded = expandedProjectIds.has(project.id);

            return (
              <Card
                key={project.id}
                className="overflow-hidden rounded-[21px] border-[#dce5dd] bg-white shadow-[0_12px_34px_rgba(23,53,34,0.045)]"
              >
                <button
                  type="button"
                  onClick={() => toggleProject(project.id)}
                  aria-expanded={expanded}
                  aria-controls={`tasks-${project.id}`}
                  className="flex w-full items-center gap-4 px-4 py-4 text-left transition hover:bg-[#f9fbf9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#2d8258] sm:px-5"
                >
                  <span className="grid size-12 shrink-0 place-items-center rounded-[15px] bg-[linear-gradient(145deg,#eaf5ed,#dceee2)] text-[#31805a]">
                    <FolderKanban className="size-6" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-[780] text-[#1d2720] sm:text-[17px]">
                      {project.name}
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-[#7a847d]">
                      {project.ownerName ? (
                        <span className="inline-flex items-center gap-1.5">
                          <UserRound className="size-3.5" /> {project.ownerName}
                        </span>
                      ) : null}
                      <span>{project.tasks.length} {project.tasks.length === 1 ? "task" : "tasks"}</span>
                      <span>{project.openTaskCount} open</span>
                    </span>
                  </span>
                  <span className="hidden rounded-full border border-[#dce4dd] bg-[#f7f9f7] px-3 py-1 text-[10px] font-[720] text-[#5d685f] sm:inline-flex">
                    {formatProjectPriority(project.priority)} priority
                  </span>
                  <ChevronDown
                    className={`size-5 shrink-0 text-[#718078] transition-transform ${expanded ? "rotate-180" : ""}`}
                  />
                </button>

                {expanded ? (
                  <div id={`tasks-${project.id}`} className="border-t border-[#e7ece7] bg-[#f8faf8] p-3 sm:p-4">
                    <div className="space-y-2.5">
                      {project.tasks.map((task) => (
                        <TaskRow key={task.id} task={task} />
                      ))}
                    </div>
                  </div>
                ) : null}
              </Card>
            );
          })}

          {filteredProjects.length === 0 ? (
            <div className="rounded-[21px] border border-dashed border-[#cad6cc] bg-white px-6 py-12 text-center">
              <Search className="mx-auto size-7 text-[#6f9b7e]" />
              <h2 className="mt-3 text-[17px] font-[760] text-[#263129]">No matching tasks</h2>
              <p className="mt-1 text-[12px] text-[#78827a]">Try another search or task status.</p>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setQuery("");
                  setFilter("ALL");
                }}
                className="mt-4 rounded-full"
              >
                Clear filters
              </Button>
            </div>
          ) : null}
        </div>
      </section>
    </section>
  );
}
