import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  FilePenLine,
  Inbox,
  MessageSquareWarning,
  ShieldAlert,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";

import type {
  DashboardAttentionItem,
  DashboardSnapshot,
  DashboardWorkSummaryItem,
} from "@/lib/dashboard";

const ATTENTION_ICONS: Record<DashboardAttentionItem["kind"], LucideIcon> = {
  deadline: TriangleAlert,
  review: FilePenLine,
  revision: MessageSquareWarning,
  request: Inbox,
  approval: ClipboardCheck,
};

const severityStyles: Record<
  DashboardAttentionItem["severity"],
  { dot: string; box: string; icon: string; label: string }
> = {
  critical: {
    dot: "bg-[#db3b32]",
    box: "bg-[#ffebea]",
    icon: "text-[#d83a32]",
    label: "Critical",
  },
  warning: {
    dot: "bg-[#ed850c]",
    box: "bg-[#fff1e2]",
    icon: "text-[#e27300]",
    label: "Action needed",
  },
  info: {
    dot: "bg-[#3f82c4]",
    box: "bg-[#eaf3fc]",
    icon: "text-[#397dbc]",
    label: "Ready to review",
  },
};

const workToneStyles: Record<
  DashboardWorkSummaryItem["tone"],
  { box: string; icon: string; count: string }
> = {
  blue: {
    box: "bg-[#e9f2fb]",
    icon: "text-[#3e7ebf]",
    count: "text-[#2f76b9]",
  },
  amber: {
    box: "bg-[#fff0df]",
    icon: "text-[#dc7108]",
    count: "text-[#c86506]",
  },
  red: {
    box: "bg-[#ffebe9]",
    icon: "text-[#d44238]",
    count: "text-[#cb3b32]",
  },
  green: {
    box: "bg-[#e8f4ea]",
    icon: "text-[#248654]",
    count: "text-[#218051]",
  },
};

function Panel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`min-w-0 rounded-[20px] border border-[#e3e8e3] bg-white shadow-[0_12px_32px_rgba(30,53,39,0.05)] ${className}`}
    >
      {children}
    </section>
  );
}

function PanelHeader({
  title,
  href,
  linkLabel,
  icon,
}: {
  title: string;
  href?: string;
  linkLabel?: string;
  icon?: React.ReactNode;
}) {
  return (
    <header className="flex min-h-[56px] items-center justify-between gap-4 border-b border-[#edf0ed] px-5 py-3 sm:px-6">
      <div className="flex min-w-0 items-center gap-2">
        {icon}
        <h2 className="truncate text-[15px] font-bold text-[#171d19]">{title}</h2>
      </div>
      {href && linkLabel ? (
        <Link
          href={href}
          className="inline-flex shrink-0 items-center gap-1 text-[12px] font-semibold text-[#197848] transition-colors hover:text-[#0e5b34]"
        >
          {linkLabel}
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      ) : null}
    </header>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="grid min-h-[190px] place-items-center px-6 py-8 text-center">
      <div>
        <span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-[#edf6ef] text-[#28875a]">
          <Icon className="h-5 w-5" />
        </span>
        <p className="mt-3 text-[14px] font-semibold text-[#1e2721]">{title}</p>
        <p className="mx-auto mt-1 max-w-[290px] text-[12px] leading-5 text-[#778079]">
          {description}
        </p>
      </div>
    </div>
  );
}

function NeedsAttention({
  items,
  total,
}: {
  items: DashboardSnapshot["attention"];
  total: number;
}) {
  return (
    <Panel className="xl:col-span-3">
      <div id="needs-attention" className="scroll-mt-24">
        <PanelHeader
          title="Needs Attention"
          href={total > items.length ? "/notifications" : undefined}
          linkLabel={total > items.length ? `View all ${total}` : undefined}
        />
      </div>
      {items.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="You’re all caught up"
          description="No actions currently require your attention."
        />
      ) : (
        <div className="divide-y divide-[#edf0ed] px-5 sm:px-6">
          {items.map((item) => {
            const Icon = ATTENTION_ICONS[item.kind];
            const style = severityStyles[item.severity];
            return (
              <Link
                key={item.id}
                href={item.href}
                className="group grid grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-3 py-3 transition-colors hover:bg-[#fbfcfb] sm:gap-4"
              >
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${style.dot}`}
                  aria-label={style.label}
                />
                <span
                  className={`grid h-10 w-10 shrink-0 place-items-center rounded-[12px] ${style.box} ${style.icon}`}
                >
                  <Icon className="h-[18px] w-[18px]" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-semibold text-[#171d19]">
                    {item.title}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-[#69716b]">
                    <span className="font-medium text-[#3f4741]">{item.projectName}</span>
                    <span className="px-1.5 text-[#a4aaa6]">•</span>
                    {item.detail}
                  </span>
                </span>
                <span className="hidden items-center gap-1 text-[11px] font-semibold text-[#187548] group-hover:text-[#0f5c37] sm:inline-flex">
                  {item.actionLabel}
                  <ChevronRight className="h-3.5 w-3.5" />
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

function UpcomingDeadlines({
  deadlines,
}: {
  deadlines: DashboardSnapshot["deadlines"];
}) {
  return (
    <Panel className="xl:col-span-2">
      <PanelHeader
        title="Upcoming Deadlines"
        href="/calendar"
        linkLabel="View calendar"
        icon={<CalendarDays className="h-4 w-4 text-[#268457]" />}
      />
      {deadlines.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="No upcoming deadlines"
          description="Relevant workflow dates will appear here as they are scheduled."
        />
      ) : (
        <div className="divide-y divide-[#edf0ed] px-5 sm:px-6">
          {deadlines.map((deadline) => (
            <Link
              key={deadline.id}
              href={deadline.href}
              className="group grid grid-cols-[minmax(0,1fr)_auto] gap-3 py-3 hover:bg-[#fbfcfb]"
            >
              <span className="min-w-0">
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${
                      deadline.tone === "critical"
                        ? "bg-[#dc4037]"
                        : deadline.tone === "warning"
                          ? "bg-[#ed870b]"
                          : "bg-[#2f9361]"
                    }`}
                  />
                  <span className="truncate text-[12px] font-medium text-[#202722]">
                    {deadline.projectName} — {deadline.detail}
                  </span>
                </span>
                <span className="ml-4 mt-1 inline-flex rounded-md bg-[#f1f3f1] px-2 py-0.5 text-[10px] font-semibold text-[#676f69]">
                  {deadline.stageLabel}
                </span>
              </span>
              <span className="text-right">
                <span className="block text-[11px] font-semibold text-[#424a44]">
                  {deadline.dateLabel}
                </span>
                <span
                  className={`mt-1 block text-[10px] font-medium ${
                    deadline.tone === "critical"
                      ? "text-[#d83830]"
                      : deadline.tone === "warning"
                        ? "text-[#dc6e05]"
                        : "text-[#69716b]"
                  }`}
                >
                  {deadline.statusLabel}
                </span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </Panel>
  );
}

function ProjectsByStage({ stages }: { stages: DashboardSnapshot["stages"] }) {
  return (
    <Panel className="self-start xl:col-span-3">
      <PanelHeader title="Projects by Stage" />
      <div className="overflow-x-auto px-5 py-6 sm:px-6">
        <div className="grid min-w-[680px] grid-cols-7">
          {stages.map((stage, index) => (
            <Link
              key={stage.number}
              href={stage.href}
              aria-label={`View ${stage.count} projects in stage ${stage.number}, ${stage.name}`}
              className="group relative min-w-0 text-center"
            >
              {index > 0 ? (
                <span className="absolute right-1/2 top-5 h-px w-full border-t border-dashed border-[#bcd2c2]" />
              ) : null}
              <span className="relative mx-auto grid h-10 w-10 place-items-center rounded-full border border-[#b9d9c3] bg-[#f3faf4] text-[15px] font-bold text-[#175f3c] transition group-hover:border-[#25895a] group-hover:bg-[#e8f5eb]">
                {stage.number}
              </span>
              <span className="mt-2 block truncate px-1 text-[11px] font-semibold text-[#303833]">
                {stage.name}
              </span>
              <span className="mt-1 block text-[10px] text-[#727a74]">
                {stage.count} {stage.count === 1 ? "project" : "projects"}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </Panel>
  );
}

function MyWork({ items }: { items: DashboardSnapshot["myWork"] }) {
  return (
    <Panel className="xl:col-span-2">
      <PanelHeader title="My Work" />
      {items.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="No open work"
          description="No open work assigned to you."
        />
      ) : (
        <div className="divide-y divide-[#edf0ed] px-5 sm:px-6">
          {items.map((item) => {
            const style = workToneStyles[item.tone];
            return (
              <Link
                key={item.id}
                href={item.href}
                className="group flex items-center gap-3 py-3 hover:bg-[#fbfcfb]"
              >
                <span
                  className={`grid h-7 w-7 shrink-0 place-items-center rounded-[8px] ${style.box} ${style.icon}`}
                >
                  {item.tone === "red" ? (
                    <ShieldAlert className="h-3.5 w-3.5" />
                  ) : item.tone === "amber" ? (
                    <Clock3 className="h-3.5 w-3.5" />
                  ) : item.tone === "blue" ? (
                    <FilePenLine className="h-3.5 w-3.5" />
                  ) : (
                    <ClipboardCheck className="h-3.5 w-3.5" />
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-[#242b26]">
                  {item.label}
                </span>
                <span className={`text-[12px] font-bold ${style.count}`}>
                  {item.count}
                </span>
                <ChevronRight className="h-4 w-4 text-[#747c76] transition-transform group-hover:translate-x-0.5" />
              </Link>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

function RecentProjects({
  projects,
}: {
  projects: DashboardSnapshot["recentProjects"];
}) {
  return (
    <Panel>
      <PanelHeader title="Recent Projects" href="/projects" linkLabel="View all projects" />
      {projects.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No recent projects"
          description="No projects available."
        />
      ) : (
        <div className="overflow-x-auto px-5 pb-2 sm:px-6">
          <div className="min-w-[620px]">
            <div className="grid grid-cols-[minmax(240px,1.5fr)_minmax(180px,1fr)_minmax(150px,0.8fr)_150px_24px] gap-4 border-b border-[#edf0ed] py-2 text-[10px] font-semibold text-[#747c76]">
              <span>Project Name</span>
              <span>Current Stage</span>
              <span>Owner</span>
              <span>Last Updated</span>
              <span />
            </div>
            <div className="divide-y divide-[#edf0ed]">
              {projects.map((project) => (
                <Link
                  key={project.id}
                  href={project.href}
                  className="group grid grid-cols-[minmax(240px,1.5fr)_minmax(180px,1fr)_minmax(150px,0.8fr)_150px_24px] items-center gap-4 py-3 text-[11px] hover:bg-[#fbfcfb]"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="h-2 w-2 shrink-0 rounded-full bg-[#2f9361]" />
                    <span className="truncate font-semibold text-[#252c27] group-hover:text-[#176e43]">
                      {project.name}
                    </span>
                  </span>
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span
                      className={`inline-flex max-w-full truncate rounded-md px-2 py-1 font-semibold ${
                        project.businessStatus === "COMPLETED"
                          ? "bg-[#e6f3e9] text-[#287d51]"
                          : project.businessStatus === "ACTIVE"
                            ? "bg-[#edf5ef] text-[#2c8053]"
                            : "bg-[#f7f5ed] text-[#736748]"
                      }`}
                      title={
                        project.workflowDiagnosticLabel
                          ? "This project was created before the current workflow or has incomplete workflow data."
                          : undefined
                      }
                    >
                      {project.businessStatus === "COMPLETED"
                        ? "Completed"
                        : project.stageNumber && project.stageName
                          ? `Stage ${project.stageNumber} · ${project.stageName}`
                          : project.workflowDiagnosticLabel}
                    </span>
                    {project.businessStatus && project.workflowDiagnosticLabel ? (
                      <span
                        className="shrink-0 rounded-md border border-[#ded9c9] bg-[#f7f5ed] px-1.5 py-1 text-[9px] font-semibold text-[#736748]"
                        title="This project was created before the current workflow or has incomplete workflow data."
                      >
                        {project.workflowDiagnosticLabel}
                      </span>
                    ) : null}
                  </span>
                  <span className="flex min-w-0 items-center gap-2 text-[#303833]">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#e8d3c0] text-[8px] font-bold text-[#8c5d38]">
                      {project.ownerInitials}
                    </span>
                    <span className="truncate">{project.ownerName}</span>
                  </span>
                  <span className="truncate text-[#69716b]">{project.updatedLabel}</span>
                  <ArrowRight className="h-3.5 w-3.5 text-[#626a64] transition-transform group-hover:translate-x-0.5" />
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </Panel>
  );
}

export function DashboardWorkspace({
  snapshot,
}: {
  snapshot: DashboardSnapshot;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-5">
        <NeedsAttention
          items={snapshot.attention}
          total={snapshot.attentionCount}
        />
        <UpcomingDeadlines deadlines={snapshot.deadlines} />
      </div>
      <div className="grid gap-4 xl:grid-cols-5">
        <ProjectsByStage stages={snapshot.stages} />
        <MyWork items={snapshot.myWork} />
      </div>
      {snapshot.canViewRecentProjects ? (
        <RecentProjects projects={snapshot.recentProjects} />
      ) : null}
    </div>
  );
}
