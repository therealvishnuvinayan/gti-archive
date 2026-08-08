"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  CheckCircle2,
  ChevronRight,
  CircleCheck,
  FileCheck2,
  Info,
  ListChecks,
  LoaderCircle,
  Mail,
  Send,
  ShieldCheck,
} from "lucide-react";

import { ProjectAccessRealtimeGuard } from "@/components/projects/project-access-realtime-guard";
import { ProjectStageSummary } from "@/components/projects/project-stage-summary";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { ProjectStageShellRecord } from "@/lib/projects";
import { showInfoToast } from "@/lib/toast";

type Tone = "green" | "amber" | "red" | "purple";

type ImplementationMetric = {
  label: string;
  value: number;
  helper: string;
  icon: LucideIcon;
  tone: Tone;
};

type EmailCategory = {
  label: string;
  helper: string;
  count: number;
  icon: LucideIcon;
  tone: Tone;
};

type ActivityItem = {
  message: string;
  date: string;
  icon: LucideIcon;
  tone: Tone;
};

const IMPLEMENTATION_METRICS: ImplementationMetric[] = [
  {
    label: "Emails Sent",
    value: 12,
    helper: "Total emails sent to relevant departments",
    icon: Mail,
    tone: "green",
  },
  {
    label: "Sample Requests",
    value: 5,
    helper: "Requests for product samples",
    icon: Send,
    tone: "green",
  },
  {
    label: "Issues Reported",
    value: 3,
    helper: "Problems reported via email",
    icon: AlertTriangle,
    tone: "amber",
  },
  {
    label: "In Progress",
    value: 2,
    helper: "Issues under resolution",
    icon: LoaderCircle,
    tone: "green",
  },
  {
    label: "Resolved",
    value: 7,
    helper: "Complaints and issues resolved",
    icon: CircleCheck,
    tone: "green",
  },
];

const EMAIL_CATEGORIES: EmailCategory[] = [
  {
    label: "File Handover Emails",
    helper: "Emails sent for file handover",
    count: 4,
    icon: Mail,
    tone: "green",
  },
  {
    label: "Sample Request Emails",
    helper: "Emails for requesting samples",
    count: 5,
    icon: Send,
    tone: "amber",
  },
  {
    label: "Problem Handover Emails",
    helper: "Emails sent regarding reported problems",
    count: 2,
    icon: AlertTriangle,
    tone: "red",
  },
  {
    label: "Complaint Resolution Emails",
    helper: "Emails for complaint resolution",
    count: 1,
    icon: CheckCircle2,
    tone: "purple",
  },
];

const RECENT_ACTIVITY: ActivityItem[] = [
  {
    message: "File handover email sent to production.head@company.com",
    date: "08 Aug 2026, 09:30 PM",
    icon: Mail,
    tone: "green",
  },
  {
    message: "Sample request sent to quality@company.com",
    date: "08 Aug 2026, 04:15 PM",
    icon: Send,
    tone: "amber",
  },
  {
    message: "Problem reported by marketing@company.com",
    date: "07 Aug 2026, 02:40 PM",
    icon: AlertTriangle,
    tone: "red",
  },
  {
    message: "Complaint resolved for invoice.issue@company.com",
    date: "07 Aug 2026, 11:20 AM",
    icon: CheckCircle2,
    tone: "purple",
  },
];

const TONE_CLASSES: Record<Tone, string> = {
  green: "bg-[#eaf4ed] text-[#2f7751]",
  amber: "bg-[#fff4e2] text-[#c57a18]",
  red: "bg-[#fdeceb] text-[#c94f45]",
  purple: "bg-[#f1ecfb] text-[#7b55ba]",
};

function IconTile({ icon: Icon, tone }: { icon: LucideIcon; tone: Tone }) {
  return (
    <span className={`grid size-10 shrink-0 place-items-center rounded-[11px] ${TONE_CLASSES[tone]}`}>
      <Icon className="h-[18px] w-[18px]" />
    </span>
  );
}

function ImplementationOverview() {
  return (
    <section aria-labelledby="implementation-overview-heading">
      <h2 id="implementation-overview-heading" className="text-[16px] font-[750] text-[#1b261f]">
        Overview
      </h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {IMPLEMENTATION_METRICS.map((metric) => (
          <article
            key={metric.label}
            className="rounded-[17px] border border-[#e2e8e2] bg-white p-4 shadow-[0_10px_26px_rgba(23,39,28,0.035)]"
          >
            <div className="flex items-start gap-3">
              <IconTile icon={metric.icon} tone={metric.tone} />
              <div className="min-w-0">
                <p className="text-[22px] font-[780] leading-none tracking-[-0.03em] text-[#1d2921]">
                  {metric.value}
                </p>
                <h3 className="mt-1.5 text-[12px] font-[720] text-[#344239]">{metric.label}</h3>
              </div>
            </div>
            <p className="mt-3 text-[10px] leading-4 text-[#7c867f]">{metric.helper}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function showEmailTrackingPreview() {
  showInfoToast(
    "Email tracking is a UI preview.",
    "No Stage 7 email data is connected yet.",
  );
}

function EmailTrackingPanel() {
  return (
    <section className="rounded-[18px] border border-[#e2e8e2] bg-white p-4 shadow-[0_10px_26px_rgba(23,39,28,0.035)] sm:p-5">
      <h2 className="text-[16px] font-[750] text-[#1b261f]">Email Tracking</h2>
      <p className="mt-1 text-[11px] text-[#7a857d]">Track email activities related to this project.</p>
      <div className="mt-3 divide-y divide-[#e8ede8]">
        {EMAIL_CATEGORIES.map((category) => (
          <button
            key={category.label}
            type="button"
            className="flex w-full items-center gap-3 py-3 text-left transition hover:bg-[#f8faf8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#79a98a]/50"
            onClick={showEmailTrackingPreview}
          >
            <IconTile icon={category.icon} tone={category.tone} />
            <span className="min-w-0 flex-1">
              <span className="block text-[12px] font-[720] text-[#28342c]">{category.label}</span>
              <span className="mt-0.5 block text-[10px] leading-4 text-[#7b857e]">{category.helper}</span>
            </span>
            <span className="text-[13px] font-[760] text-[#2c3930]">{category.count}</span>
            <ChevronRight className="h-4 w-4 text-[#9aa39c]" />
          </button>
        ))}
      </div>
    </section>
  );
}

function RecentImplementationActivity() {
  return (
    <section className="rounded-[18px] border border-[#e2e8e2] bg-white p-4 shadow-[0_10px_26px_rgba(23,39,28,0.035)] sm:p-5">
      <h2 className="text-[16px] font-[750] text-[#1b261f]">Recent Activity</h2>
      <p className="mt-1 text-[11px] text-[#7a857d]">Latest updates and email activities.</p>
      <ol className="relative mt-4 space-y-4 before:absolute before:bottom-4 before:left-5 before:top-4 before:w-px before:bg-[#dce6dd]">
        {RECENT_ACTIVITY.map((activity) => (
          <li key={activity.message} className="relative flex gap-3">
            <IconTile icon={activity.icon} tone={activity.tone} />
            <div className="min-w-0 pt-0.5">
              <p className="text-[11px] font-[630] leading-4 text-[#344139]">{activity.message}</p>
              <time className="mt-1 block text-[10px] text-[#869088]">{activity.date}</time>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function StageSevenNotifications() {
  return (
    <section className="flex min-h-[350px] flex-col rounded-[18px] border border-[#e2e8e2] bg-white p-4 shadow-[0_10px_26px_rgba(23,39,28,0.035)] sm:p-5">
      <h2 className="text-[16px] font-[750] text-[#1b261f]">Notifications</h2>
      <p className="mt-1 text-[11px] text-[#7a857d]">Important alerts and notifications.</p>
      <div className="mt-4 grid flex-1 place-items-center rounded-[14px] bg-[#fafbfa] px-5 py-10 text-center">
        <div>
          <Bell className="mx-auto h-12 w-12 text-[#c5ccc7]" strokeWidth={1.5} />
          <p className="mt-5 text-[13px] font-[740] text-[#2d3931]">No new notifications</p>
          <p className="mt-1 text-[11px] text-[#7d8780]">You&apos;re all caught up.</p>
        </div>
      </div>
    </section>
  );
}

export function StageSevenWorkspace({
  project,
  currentUserId,
}: {
  project: ProjectStageShellRecord;
  currentUserId: string;
}) {
  return (
    <section className="mx-auto w-full max-w-[1420px] pb-6">
      <ProjectAccessRealtimeGuard projectId={project.id} currentUserId={currentUserId} />
      <Card className="overflow-hidden rounded-[26px] border-[#dfe6df] shadow-[0_20px_54px_rgba(23,39,28,0.055)]">
        <CardContent className="p-0">
          <div className="px-5 py-6 sm:px-7 sm:py-8 lg:px-9">
            <div className="flex items-center gap-2 text-[11px] font-[760] uppercase tracking-[0.13em] text-[#4d765d]">
              <ShieldCheck className="h-4 w-4" /> Implementation &amp; Supervision
            </div>
            <h1 className="mt-3 text-[28px] font-[780] tracking-[-0.04em] text-[#111713] sm:text-[34px]">
              Stage 7 - Implementation &amp; Supervision
            </h1>
            <p className="mt-2 text-[13px] leading-5 text-[#6f7a72]">
              Monitor implementation progress, sample requests, issues and complaint resolution.
            </p>
            <ProjectStageSummary project={project} />
          </div>

          <div className="space-y-5 border-t border-[#e7ece7] bg-[#fbfcfb] px-5 py-6 sm:px-7 lg:px-9 lg:py-7">
            <ImplementationOverview />
            <div className="grid gap-5 xl:grid-cols-[1fr_1fr_0.92fr]">
              <EmailTrackingPanel />
              <RecentImplementationActivity />
              <StageSevenNotifications />
            </div>
            <div className="flex items-start gap-2 rounded-[13px] border border-[#c9daf8] bg-[#f5f8ff] px-4 py-3 text-[11px] leading-5 text-[#425d8b]">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#426fbd]" />
              <span>
                Communications in this stage will be handled via email with the relevant departments.
                No emails are sent in this UI preview.
              </span>
            </div>
          </div>

          <div className="flex flex-col-reverse gap-3 border-t border-[#e7ece7] bg-white px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-7 lg:px-9">
            <Button asChild type="button" variant="outline" className="min-w-[160px] rounded-[13px] shadow-none">
              <Link href={`/projects/${project.id}`}>
                <ListChecks className="h-4 w-4" /> All Stages
              </Link>
            </Button>
            <Button
              type="button"
              className="min-w-[190px] rounded-[13px]"
              onClick={() =>
                showInfoToast(
                  "Project completion UI preview.",
                  "Project completion workflow will be connected in a later phase. No project state was changed.",
                )
              }
            >
              <FileCheck2 className="h-4 w-4" /> Complete Project <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

export function StageSevenLoadingShell() {
  return (
    <section className="mx-auto w-full max-w-[1420px] pb-6">
      <Card className="overflow-hidden rounded-[26px] border-[#dfe6df] shadow-none">
        <CardContent className="p-0">
          <div className="p-7 lg:p-9">
            <Skeleton className="h-4 w-48 rounded-full" />
            <Skeleton className="mt-4 h-10 w-full max-w-[640px] rounded-[12px]" />
            <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }, (_, index) => (
                <Skeleton key={index} className="h-[82px] rounded-[16px]" />
              ))}
            </div>
          </div>
          <div className="space-y-5 border-t border-[#e7ece7] bg-[#fbfcfb] p-6">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {Array.from({ length: 5 }, (_, index) => (
                <Skeleton key={index} className="h-[118px] rounded-[17px]" />
              ))}
            </div>
            <div className="grid gap-5 xl:grid-cols-3">
              {Array.from({ length: 3 }, (_, index) => (
                <Skeleton key={index} className="h-[350px] rounded-[18px]" />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
