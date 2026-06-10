import {
  BadgeDollarSign,
  CalendarDays,
  ClipboardList,
  FileText,
  FolderKanban,
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

function AssetGridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={index}
          className="aspect-square rounded-[18px] border border-[#dce6dd] bg-[#fbfcfa] p-3"
        >
          <Skeleton className="h-3.5 w-10/12 rounded-full" />
          <Skeleton className="mt-2 h-2.5 w-8/12 rounded-full" />
          <div className="mt-auto pt-12">
            <Skeleton className="h-8 w-full rounded-full" />
          </div>
        </div>
      ))}
    </div>
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
    <section className="space-y-6">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px] 2xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-4">
          <Card className="rounded-[20px] border border-[#dbe7dd] bg-white shadow-[0_14px_34px_rgba(18,35,23,0.05)]">
            <CardContent className="px-5 py-5">
              <p className="text-[12px] font-[800] uppercase tracking-[0.08em] text-brand">
                {project?.title ?? "Project"}
              </p>
              <h1 className="mt-2 text-[24px] font-semibold tracking-tight text-[#111712]">
                {activeStage?.name ?? project?.currentStageName ?? "Stage"}
              </h1>
              <div className="mt-3 grid gap-2 text-[12px] text-[#5f6b62] sm:grid-cols-3">
                <span>{activeStage?.statusLabel ?? project?.statusLabel ?? "Loading"}</span>
                <span>{activeStage?.plannedStartAt ?? project?.startDate ?? "—"}</span>
                <span>{activeStage?.plannedDueAt ?? project?.endDate ?? "—"}</span>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[20px] border border-[#dbe7dd] bg-[#fbfcfa]">
            <CardHeader className="pb-3">
              <CardTitle className="text-[20px] font-semibold tracking-tight">
                Discussion
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <InlineSkeletonRows rows={5} />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-[20px] font-semibold tracking-tight text-brand">
                Stage Overview
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-0">
              <p className="text-[13px] text-[#242b26]">
                Budget: {activeStage?.budget ?? project?.budget ?? "—"}
              </p>
              <p className="text-[13px] text-[#242b26]">
                Status: {activeStage?.statusLabel ?? project?.statusLabel ?? "Loading"}
              </p>
              <p className="text-[13px] text-[#242b26]">
                Stage Deadline: {activeStage?.plannedDueAt ?? project?.endDate ?? "—"}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-[20px] font-semibold tracking-tight">
                Project Assets
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <AssetGridSkeleton />
            </CardContent>
          </Card>
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
