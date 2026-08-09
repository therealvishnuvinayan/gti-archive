import Link from "next/link";
import {
  ArrowRight,
  CircleCheck,
  Clock3,
  FolderKanban,
  Lock,
} from "lucide-react";

import { ProjectAccessRealtimeGuard } from "@/components/projects/project-access-realtime-guard";
import { ProjectFlowSummaryStrip } from "@/components/projects/project-summary-strip";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { ProjectStageShellRecord } from "@/lib/projects";
import { PROJECT_WORKFLOW_STAGE_DEFINITIONS } from "@/lib/project-workflow";

type ProjectOverviewWorkspaceProps = {
  project: ProjectStageShellRecord;
  currentUserId: string;
};

type ProjectOverviewStage = (typeof PROJECT_WORKFLOW_STAGE_DEFINITIONS)[number];

export function ProjectOverviewHeader({ projectName }: { projectName: string }) {
  return (
    <header>
      <div className="flex items-center gap-2 text-[12px] font-[750] uppercase tracking-[0.12em] text-[#4d765d]">
        <FolderKanban className="h-4 w-4" />
        Project workspace
      </div>
      <h1 className="mt-2 text-[29px] font-[780] leading-[1.12] tracking-[-0.045em] text-[#111713] sm:text-[34px] lg:text-[38px]">
        Project - {projectName}
      </h1>
    </header>
  );
}

export function ProjectSummaryCard({ project }: { project: ProjectStageShellRecord }) {
  return <ProjectFlowSummaryStrip project={project} className="mt-5" />;
}

export function StageOverviewCard({
  stage,
  projectId,
  workflowStage,
}: {
  stage: ProjectOverviewStage;
  projectId: string;
  workflowStage: ProjectStageShellRecord["workflowStages"][number] | null;
}) {
  const status = workflowStage?.status ?? "LOCKED";
  const available = status === "AVAILABLE";
  const completed = status === "COMPLETED";
  const locked = status === "LOCKED";
  const stageOpenable = !locked;
  const statusLabel = completed ? "Completed" : available ? "Available" : "Locked";

  return (
    <article
      className={`flex min-h-[210px] min-w-0 flex-col rounded-[20px] border p-4 transition sm:p-5 ${
        stageOpenable
          ? "border-[#287750] bg-[linear-gradient(145deg,#0f5b39_0%,#19764c_55%,#378a62_100%)] text-white shadow-[0_18px_42px_rgba(25,103,67,0.2)]"
          : available
            ? "border-[#b9dbc5] bg-[linear-gradient(145deg,#f8fff9,#edf8f0)] text-[#285c40] shadow-[0_12px_30px_rgba(23,85,50,0.06)]"
          : "border-[#dfe5df] bg-[linear-gradient(145deg,#fbfcfa,#f3f6f3)] text-[#7a847d] shadow-[0_12px_30px_rgba(23,39,28,0.035)]"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <span
          className={`inline-flex rounded-full px-3 py-1 text-[11px] font-[750] ${
            stageOpenable
              ? "border border-white/35 bg-white/10 text-white"
              : available
                ? "bg-[#dff1e5] text-[#28724b]"
              : "bg-[#e7ece7] text-[#78827b]"
          }`}
        >
          Stage {stage.number}
        </span>
        <span
          className={`inline-flex items-center gap-1.5 text-[11px] font-[700] ${
            stageOpenable ? "text-white/85" : available ? "text-[#397a55]" : "text-[#8a948c]"
          }`}
        >
          {completed ? (
            <CircleCheck className="h-4 w-4" />
          ) : available ? (
            <Clock3 className="h-4 w-4" />
          ) : (
            <Lock className="h-4 w-4" />
          )}
          {statusLabel}
        </span>
      </div>

      <h2
        className={`mt-4 text-[17px] font-[760] leading-[1.25] tracking-[-0.02em] ${
          stageOpenable ? "text-white" : available ? "text-[#285c40]" : "text-[#6f7972]"
        }`}
      >
        {stage.name}
      </h2>
      <p
        className={`mt-2 line-clamp-2 text-[12px] font-[500] leading-[1.55] ${
          stageOpenable ? "text-white/82" : available ? "text-[#587063]" : "text-[#7d8780]"
        }`}
      >
        {stage.description}
      </p>

      {locked ? (
        <p className="mt-3 text-[11px] font-[650] leading-4 text-[#727d75]">
          {stage.number === 1
            ? "This stage is not available."
            : `Complete Stage ${stage.number - 1} to unlock Stage ${stage.number}.`}
        </p>
      ) : null}

      <div className="mt-auto pt-4">
        {stageOpenable ? (
          <Button
            asChild
            variant="secondary"
            className="h-10 w-full justify-between rounded-[12px] border-white bg-white px-4 text-[#174f34] shadow-[0_8px_20px_rgba(0,0,0,0.1)] hover:bg-[#f5fbf6]"
          >
            <Link href={`/projects/${projectId}/stages/${stage.number}`}>
              Open Stage
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        ) : (
          <Button
            type="button"
            variant="secondary"
            disabled
            className="h-10 w-full rounded-[12px] border-0 bg-[#e7ebe7] text-[#818a83] shadow-none disabled:opacity-100"
          >
            <Lock className="h-4 w-4" />
            Locked
          </Button>
        )}
      </div>
    </article>
  );
}

export function ProjectStageGrid({
  project,
}: {
  project: ProjectStageShellRecord;
}) {
  return (
    <section className="mt-6" aria-labelledby="project-stages-heading">
      <div>
        <h2
          id="project-stages-heading"
          className="text-[21px] font-[760] tracking-[-0.025em] text-[#18211b]"
        >
          Project stages
        </h2>
        <p className="mt-1 text-[13px] leading-5 text-[#707a73]">
          Begin with Project Inquiry. Later stages will become available as the workflow progresses.
        </p>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {PROJECT_WORKFLOW_STAGE_DEFINITIONS.map((stage) => (
          <StageOverviewCard
            key={stage.key}
            stage={stage}
            projectId={project.id}
            workflowStage={
              project.workflowStages.find(
                (workflowStage) => workflowStage.stageKey === stage.key,
              ) ?? null
            }
          />
        ))}
      </div>
    </section>
  );
}

export function ProjectOverviewWorkspace({
  project,
  currentUserId,
}: ProjectOverviewWorkspaceProps) {
  return (
    <section className="mx-auto w-full max-w-[1420px] pb-6">
      <ProjectAccessRealtimeGuard projectId={project.id} currentUserId={currentUserId} />
      <ProjectOverviewHeader projectName={project.title} />
      <ProjectSummaryCard project={project} />
      <ProjectStageGrid project={project} />
    </section>
  );
}

export function ProjectOverviewLoadingShell() {
  return (
    <section className="mx-auto w-full max-w-[1420px] pb-6">
      <Skeleton className="h-4 w-36 rounded-full" />
      <Skeleton className="mt-4 h-10 w-full max-w-[560px] rounded-[12px]" />

      <Card className="mt-5 rounded-[18px] border-[#dde5de] p-4 shadow-none">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="flex items-center gap-3">
              <Skeleton className="size-9 rounded-[11px]" />
              <div className="min-w-0 flex-1">
                <Skeleton className="h-2.5 w-20 rounded-full" />
                <Skeleton className="mt-2 h-3.5 w-full max-w-[180px] rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="mt-6">
        <Skeleton className="h-6 w-36 rounded-full" />
        <Skeleton className="mt-2 h-3.5 w-full max-w-[560px] rounded-full" />
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {Array.from({ length: 7 }).map((_, index) => (
            <Skeleton key={index} className="min-h-[210px] rounded-[20px]" />
          ))}
        </div>
      </div>
    </section>
  );
}
