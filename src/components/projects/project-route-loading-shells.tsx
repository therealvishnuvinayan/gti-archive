import {
  BadgeDollarSign,
  CalendarDays,
  ClipboardList,
  FileText,
  FolderKanban,
  MessageSquareText,
  MoreHorizontal,
  Paperclip,
  Send,
  UserRound,
  Users,
  WalletCards,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { ProjectFlowRecord, ProjectStageRecord } from "@/lib/projects";

function resolveShellStage(
  project?: ProjectFlowRecord | null,
  stageId?: string | null,
): ProjectStageRecord | null {
  if (!project) {
    return null;
  }

  return (
    project.stageCards.find((stage) => stage.id === stageId) ??
    project.stageCards.find((stage) => stage.id === project.currentStageId) ??
    project.stageCards[0] ??
    null
  );
}

function InlineSkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className="rounded-[18px] border border-[#e1e9e2] bg-white px-4 py-4"
        >
          <div className="flex items-start gap-3">
            <Skeleton className="size-9 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-3.5 w-40 rounded-full" />
              <Skeleton className="h-3 w-full rounded-full" />
              <Skeleton className="h-3 w-8/12 rounded-full" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function LoadingDots() {
  return (
    <span className="inline-flex h-5 items-center gap-1" aria-hidden="true">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand/75" />
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand/45 [animation-delay:120ms]" />
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand/25 [animation-delay:240ms]" />
    </span>
  );
}

function LoaderValue({
  value,
  className = "text-[12px] font-semibold text-[#445248]",
  skeletonClassName = "h-3 w-full rounded-full bg-[#dde6de]",
}: {
  value?: string | null;
  className?: string;
  skeletonClassName?: string;
}) {
  if (value?.trim()) {
    return <span className={`min-w-0 truncate ${className}`}>{value}</span>;
  }

  return <Skeleton className={skeletonClassName} />;
}

function ChatOpeningStageCard({
  project,
  activeStage,
}: {
  project?: ProjectFlowRecord | null;
  activeStage: ProjectStageRecord | null;
}) {
  const title = activeStage?.name ?? project?.currentStageName ?? project?.title ?? null;
  const subtitle = project?.title && title !== project.title ? project.title : null;

  return (
    <Card className="overflow-hidden rounded-[24px] border border-[#dbe7dd] bg-white shadow-[0_18px_46px_rgba(18,35,23,0.07)]">
      <CardContent className="px-5 py-5 sm:px-6">
        <div className="flex items-center gap-3">
          <LoadingDots />
          <p className="text-[12px] font-[900] uppercase tracking-[0.12em] text-brand">
            Opening Stage
          </p>
        </div>

        <div className="mt-5 space-y-3">
          {title ? (
            <h1 className="truncate text-[22px] font-[900] tracking-tight text-[#111712]">
              {title}
            </h1>
          ) : (
            <Skeleton className="h-5 w-full max-w-[360px] rounded-full bg-[#dde6de]" />
          )}
          {subtitle ? (
            <p className="truncate text-[13px] font-semibold text-[#6b756d]">
              {subtitle}
            </p>
          ) : project ? null : (
            <Skeleton className="h-4 w-full max-w-[300px] rounded-full bg-[#e8eee8]" />
          )}
        </div>

        <div className="mt-6 grid gap-3 text-[12px] text-[#445248] sm:grid-cols-3">
          <div className="inline-flex min-h-11 items-center gap-2 rounded-[14px] border border-[#dbe7dd] bg-[#fbfcfa] px-3">
            <span className="h-2.5 w-2.5 rounded-full bg-brand/80" />
            <span className="truncate font-[800] text-brand">
              {activeStage?.statusLabel ?? project?.statusLabel ?? "Opening Stage"}
            </span>
          </div>
          <div className="inline-flex min-h-11 items-center gap-2 rounded-[14px] border border-[#dbe7dd] bg-white px-3">
            <CalendarDays className="h-4 w-4 shrink-0 text-[#70806f]" />
            <span className="shrink-0 font-semibold">Start:</span>
            <LoaderValue
              value={activeStage?.plannedStartAt ?? project?.startDate}
              skeletonClassName="h-3 w-full rounded-full bg-[#dde6de]"
            />
          </div>
          <div className="inline-flex min-h-11 items-center gap-2 rounded-[14px] border border-[#dbe7dd] bg-white px-3">
            <CalendarDays className="h-4 w-4 shrink-0 text-[#70806f]" />
            <span className="shrink-0 font-semibold">Due:</span>
            <LoaderValue
              value={activeStage?.plannedDueAt ?? project?.endDate}
              skeletonClassName="h-3 w-full rounded-full bg-[#dde6de]"
            />
          </div>
        </div>

        <div className="mt-6">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[13px] font-[800] text-[#1f2b23]">
              Preparing stage data...
            </p>
            <p className="hidden text-[11px] font-[800] uppercase tracking-[0.08em] text-brand sm:block">
              Loading
            </p>
          </div>
          <div className="mt-3 h-3 overflow-hidden rounded-full bg-[#e8eee8]">
            <div className="h-full w-7/12 animate-pulse rounded-full bg-[linear-gradient(90deg,#cfe4d3,#2f8d5d,#cfe4d3)]" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DiscussionMessageSkeleton({
  side = "left",
  compact = false,
}: {
  side?: "left" | "right";
  compact?: boolean;
}) {
  const isRight = side === "right";

  return (
    <div className={`flex w-full ${isRight ? "justify-end" : "justify-start"}`}>
      <div
        className={`grid max-w-[76%] items-end gap-2 ${
          isRight
            ? "grid-cols-[minmax(0,1fr)_2rem]"
            : "grid-cols-[2rem_minmax(0,1fr)]"
        }`}
      >
        {!isRight ? <Skeleton className="size-8 rounded-full bg-[#e2e9e2]" /> : null}
        <div
          className={`rounded-[16px] border px-3 py-2.5 ${
            isRight
              ? "rounded-br-[6px] border-[#c7dfce] bg-[#edf8ef]"
              : "rounded-bl-[6px] border-[#e1e9e2] bg-white"
          }`}
        >
          <Skeleton className="h-3 w-28 rounded-full bg-[#dde6de]" />
          <Skeleton
            className={`mt-2 h-2.5 rounded-full bg-[#e5ebe5] ${
              compact ? "w-36" : "w-64 max-w-full"
            }`}
          />
          <Skeleton className="mt-1.5 h-2.5 w-8/12 rounded-full bg-[#e8eee8]" />
        </div>
        {isRight ? <Skeleton className="size-8 rounded-full bg-[#dce7dd]" /> : null}
      </div>
    </div>
  );
}

function RevisionPreviewSkeleton() {
  return (
    <div className="grid grid-cols-[2rem_minmax(0,1fr)] items-end gap-2">
      <Skeleton className="size-8 rounded-full bg-[#e2e9e2]" />
      <div className="rounded-[18px] border border-[#dbe7dd] bg-white p-3 shadow-[0_10px_24px_rgba(18,35,23,0.04)]">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid size-16 shrink-0 place-items-center rounded-[14px] bg-[#eef6ef] text-brand">
            <FileText className="h-8 w-8" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-[800] text-[#1f2b23]">Revision Preview</p>
            <p className="mt-1 text-[11px] font-semibold text-[#7a837b]">
              Updating file preview...
            </p>
            <div className="mt-3 flex items-center gap-2">
              <span className="rounded-full bg-[#edf7ef] px-2 py-0.5 text-[9px] font-[800] text-brand">
                PDF
              </span>
              <Skeleton className="h-2.5 w-full max-w-[220px] rounded-full bg-[#dde6de]" />
            </div>
          </div>
          <LoadingDots />
        </div>
      </div>
    </div>
  );
}

function ChatComposerSkeleton() {
  return (
    <div className="border-t border-[#e3eae4] pt-4">
      <div className="flex items-center gap-3 rounded-[22px] border border-[#dfe8df] bg-white p-3 shadow-[0_12px_30px_rgba(18,35,23,0.05)]">
        <div className="grid size-10 shrink-0 place-items-center rounded-full border border-[#dbe7dd] bg-[#fbfcfa] text-[#7a857c]">
          <Paperclip className="h-5 w-5" />
        </div>
        <div className="flex min-h-10 flex-1 items-center rounded-full border border-[#e4ebe5] bg-[#fbfcfa] px-4 text-[13px] font-semibold text-[#a2aca4]">
          Loading input...
        </div>
        <div className="grid size-10 shrink-0 place-items-center rounded-full bg-[#edf6ef] text-brand/45">
          <Send className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}

function DiscussionLoadingCard() {
  return (
    <Card className="rounded-[24px] border border-[#dbe7dd] bg-white shadow-[0_18px_46px_rgba(18,35,23,0.06)]">
      <CardContent className="px-5 py-5 sm:px-6">
        <div className="flex items-start gap-3 border-b border-[#e4ece5] pb-4">
          <div className="grid size-11 shrink-0 place-items-center rounded-[16px] bg-[#eaf6ee] text-brand">
            <MessageSquareText className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[16px] font-[900] text-[#111712]">Loading Discussion</p>
            <p className="mt-1 text-[13px] font-semibold text-[#7a837b]">
              Fetching conversations and updates...
            </p>
          </div>
        </div>

        <div className="space-y-3 py-5">
          <DiscussionMessageSkeleton side="left" compact />
          <DiscussionMessageSkeleton side="right" compact />
          <DiscussionMessageSkeleton side="left" />
          <DiscussionMessageSkeleton side="right" compact />
          <RevisionPreviewSkeleton />
        </div>

        <ChatComposerSkeleton />
      </CardContent>
    </Card>
  );
}

function StageOverviewLoadingCard({
  project,
  activeStage,
}: {
  project?: ProjectFlowRecord | null;
  activeStage: ProjectStageRecord | null;
}) {
  const rows = [
    {
      label: "Budget",
      value: activeStage?.budget ?? project?.budget,
      skeletonClassName: "h-3.5 w-10/12 rounded-full bg-[#dde6de]",
    },
    {
      label: "Status",
      value: activeStage?.statusLabel ?? project?.statusLabel,
      skeletonClassName: "h-3.5 w-5/12 rounded-full bg-[#dde6de]",
    },
    {
      label: "Start Date",
      value: activeStage?.plannedStartAt ?? project?.startDate,
      skeletonClassName: "h-3.5 w-8/12 rounded-full bg-[#dde6de]",
    },
    {
      label: "Due Date",
      value: activeStage?.plannedDueAt ?? project?.endDate,
      skeletonClassName: "h-3.5 w-8/12 rounded-full bg-[#dde6de]",
    },
    {
      label: "Progress",
      value: activeStage?.statusLabel,
      skeletonClassName: "h-3.5 w-8/12 rounded-full bg-[#dde6de]",
    },
  ];

  return (
    <Card className="rounded-[24px] border border-[#dbe7dd] bg-white shadow-[0_18px_42px_rgba(18,35,23,0.06)]">
      <CardHeader className="flex-row items-center justify-between gap-3 pb-3">
        <CardTitle className="text-[20px] font-[900] tracking-tight text-brand">
          Stage Overview
        </CardTitle>
        <LoadingDots />
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        {rows.map((row) => (
          <div key={row.label} className="grid grid-cols-[86px_minmax(0,1fr)] items-center gap-3">
            <p className="text-[12px] font-semibold text-[#1f2b23]">{row.label}</p>
            <LoaderValue
              value={row.value}
              className="text-[12px] font-semibold text-[#6b756d]"
              skeletonClassName={row.skeletonClassName}
            />
          </div>
        ))}
        <div className="flex items-center gap-2 pt-3 text-[12px] font-[900] text-brand">
          <LoadingDots />
          <span>Preparing stage data...</span>
        </div>
      </CardContent>
    </Card>
  );
}

function ProjectAssetsLoadingCard() {
  return (
    <Card className="rounded-[24px] border border-[#dbe7dd] bg-white shadow-[0_18px_42px_rgba(18,35,23,0.06)]">
      <CardHeader className="flex-row items-center justify-between gap-3 pb-3">
        <CardTitle className="text-[20px] font-[900] tracking-tight text-brand">
          Project Assets
        </CardTitle>
        <LoadingDots />
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="min-h-[128px] rounded-[16px] border border-[#dce6dd] bg-[#fbfcfa] p-3"
            >
              <div className="flex min-w-0 items-center gap-2">
                <div className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-[#edf6ef] text-brand/70">
                  <FileText className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Skeleton className="h-3 w-10/12 rounded-full bg-[#dde6de]" />
                  <Skeleton className="h-2.5 w-7/12 rounded-full bg-[#e8eee8]" />
                </div>
              </div>
              <div className="mt-6 flex items-center justify-between rounded-[10px] bg-[#f0f4f0] px-2 py-2">
                <Skeleton className="h-2.5 w-16 rounded-full bg-[#dde6de]" />
                <MoreHorizontal className="h-4 w-4 text-[#7d887f]" />
              </div>
            </div>
          ))}
        </div>
        <div className="mt-5 flex items-center gap-2 text-[12px] font-[900] text-brand">
          <LoadingDots />
          <span>Loading project assets...</span>
        </div>
      </CardContent>
    </Card>
  );
}

export function ProjectDetailRouteLoadingShell() {
  return (
    <section className="mx-auto w-full max-w-[1420px]">
      <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px] 2xl:grid-cols-[minmax(0,1fr)_410px]">
        <div className="min-w-0 space-y-5">
          <Card className="relative overflow-hidden rounded-[24px] border-none bg-[linear-gradient(135deg,#123f2d,#19553a,#1a6845)] px-5 py-5 text-white shadow-[0_22px_52px_rgba(16,49,31,0.18)] sm:px-7 sm:py-6">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
              <div className="grid size-[86px] shrink-0 place-items-center rounded-[22px] bg-white/95 text-brand">
                <FolderKanban className="h-11 w-11" />
              </div>
              <div className="min-w-0 flex-1">
                <Skeleton className="h-8 w-8/12 rounded-full bg-white/24" />
                <Skeleton className="mt-3 h-5 w-44 rounded-full bg-white/18" />
                <div className="mt-6 flex items-center gap-3">
                  <div className="grid size-9 place-items-center rounded-[10px] border border-white/20 bg-white/10">
                    <UserRound className="h-4 w-4 text-white/80" />
                  </div>
                  <div className="space-y-2">
                    <Skeleton className="h-2.5 w-24 rounded-full bg-white/18" />
                    <Skeleton className="h-3.5 w-40 rounded-full bg-white/24" />
                  </div>
                </div>
              </div>
              <Skeleton className="h-9 w-44 rounded-full bg-white/18" />
            </div>
          </Card>

          <div className="rounded-[24px] border border-[#dfe7de] bg-white px-5 py-5 shadow-[0_18px_45px_rgba(23,39,28,0.06)] sm:px-6 sm:py-6">
            <div className="flex items-start gap-3">
              <div className="grid size-9 place-items-center rounded-[10px] bg-[#eef8ef] text-brand">
                <ClipboardList className="h-5 w-5" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-6 w-40 rounded-full" />
                <Skeleton className="h-3.5 w-72 rounded-full" />
              </div>
            </div>
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              {Array.from({ length: 2 }).map((_, index) => (
                <div
                  key={index}
                  className="min-h-[286px] rounded-[16px] border border-[#dfe6df] border-l-[4px] border-l-[#d6ded7] bg-[#fbfcfa] px-5 py-5"
                >
                  <div className="flex justify-between gap-3">
                    <Skeleton className="h-10 w-36 rounded-[12px]" />
                    <Skeleton className="h-7 w-24 rounded-full" />
                  </div>
                  <div className="mt-6 space-y-2">
                    <Skeleton className="h-3.5 w-full rounded-full" />
                    <Skeleton className="h-3.5 w-10/12 rounded-full" />
                    <Skeleton className="h-3.5 w-7/12 rounded-full" />
                  </div>
                  <div className="my-5 border-t border-dashed border-[#d5ddd4]" />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="flex gap-2.5">
                      <CalendarDays className="h-4 w-4 text-brand" />
                      <Skeleton className="h-9 w-24 rounded-[10px]" />
                    </div>
                    <div className="flex gap-2.5">
                      <WalletCards className="h-4 w-4 text-brand" />
                      <Skeleton className="h-9 w-24 rounded-[10px]" />
                    </div>
                  </div>
                  <Skeleton className="mt-5 h-[48px] w-full rounded-full" />
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-4 rounded-[24px] border border-[#dfe7de] bg-white px-5 py-5 shadow-[0_18px_45px_rgba(23,39,28,0.05)] sm:grid-cols-[64px_minmax(0,1fr)] sm:px-6 sm:py-6">
            <div className="grid size-16 place-items-center rounded-[18px] bg-[#eaf6ee] text-brand">
              <FileText className="h-8 w-8" />
            </div>
            <div className="space-y-3">
              <Skeleton className="h-6 w-36 rounded-full" />
              <Skeleton className="h-3.5 w-full rounded-full" />
              <Skeleton className="h-3.5 w-10/12 rounded-full" />
            </div>
          </div>
        </div>

        <aside className="space-y-5">
          {[
            ClipboardList,
            Users,
            Users,
            BadgeDollarSign,
          ].map((Icon, index) => (
            <Card key={index} className="rounded-[24px] border border-[#e0e7df] bg-white">
              <CardContent className="space-y-3 p-5">
                <div className="flex items-start gap-3">
                  <div className="grid size-9 place-items-center rounded-[10px] bg-[#eef8ef] text-brand">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="space-y-2">
                    <Skeleton className="h-5 w-36 rounded-full" />
                    <Skeleton className="h-3 w-24 rounded-full" />
                  </div>
                </div>
                <Skeleton className="h-3.5 w-full rounded-full" />
                <Skeleton className="h-3.5 w-9/12 rounded-full" />
              </CardContent>
            </Card>
          ))}
        </aside>
      </div>
    </section>
  );
}

export function ProjectChatLoadingShell({
  project,
  stageId,
}: {
  project?: ProjectFlowRecord | null;
  stageId?: string | null;
}) {
  const activeStage = resolveShellStage(project, stageId);

  return (
    <section className="min-h-0 xl:h-[calc(100dvh-12rem)] xl:min-h-[620px] xl:overflow-hidden">
      <div className="grid min-h-0 gap-4 xl:h-full xl:grid-cols-[minmax(0,1fr)_280px] 2xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-4 xl:h-full xl:overflow-hidden">
          <ChatOpeningStageCard project={project} activeStage={activeStage} />
          <DiscussionLoadingCard />
        </div>

        <div className="space-y-4 xl:h-full xl:overflow-y-auto xl:pr-1">
          <StageOverviewLoadingCard project={project} activeStage={activeStage} />
          <ProjectAssetsLoadingCard />
        </div>
      </div>
    </section>
  );
}

export function ProjectCompareLoadingShell({
  project,
  stageId,
}: {
  project?: ProjectFlowRecord | null;
  stageId?: string | null;
}) {
  const activeStage = resolveShellStage(project, stageId);

  return (
    <section className="space-y-5">
      <Card className="rounded-[22px] border border-[#dbe7dd] bg-white shadow-[0_14px_34px_rgba(18,35,23,0.05)]">
        <CardContent className="px-5 py-5">
          <p className="text-[12px] font-[800] uppercase tracking-[0.08em] text-brand">
            {project?.title ?? "Project"}
          </p>
          <h1 className="mt-2 text-[24px] font-semibold tracking-tight text-[#111712]">
            Compare Submissions
          </h1>
          <p className="mt-1 text-[13px] text-[#667168]">
            {activeStage?.name ?? project?.currentStageName ?? "Stage"}
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <Card className="min-h-[520px] rounded-[24px] border border-[#dbe7dd] bg-[#fbfcfa]">
          <CardContent className="grid h-full gap-4 p-5 lg:grid-cols-2">
            <Skeleton className="min-h-[380px] rounded-[18px]" />
            <Skeleton className="min-h-[380px] rounded-[18px]" />
          </CardContent>
        </Card>
        <Card className="rounded-[20px] border border-[#dbe7dd]">
          <CardHeader className="pb-3">
            <CardTitle className="text-[18px] font-semibold tracking-tight">
              Comparison Notes
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <InlineSkeletonRows rows={4} />
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
