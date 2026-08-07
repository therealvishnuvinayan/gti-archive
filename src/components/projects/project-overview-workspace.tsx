import {
  ArrowRight,
  Briefcase,
  FileText,
  FolderKanban,
  Lock,
  UserRound,
  Users,
} from "lucide-react";

import { ProjectAccessRealtimeGuard } from "@/components/projects/project-access-realtime-guard";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { ProjectFlowRecord } from "@/lib/projects";

type ProjectOverviewWorkspaceProps = {
  project: ProjectFlowRecord;
  currentUserId: string;
};

type ProjectOverviewStage = {
  number: number;
  name: string;
  description: string;
};

const PROJECT_OVERVIEW_STAGES: ProjectOverviewStage[] = [
  {
    number: 1,
    name: "Project Inquiry",
    description: "Gather the initial requirements, goals, and context for the project.",
  },
  {
    number: 2,
    name: "Project Research and Planning",
    description: "Research and plan the project scope, timeline, and resources.",
  },
  {
    number: 3,
    name: "Concept Creation",
    description: "Develop creative concepts and clear design directions.",
  },
  {
    number: 4,
    name: "Project Development",
    description: "Refine and develop the selected concepts and solutions.",
  },
  {
    number: 5,
    name: "Final Layout",
    description: "Prepare final layouts and detailed design specifications.",
  },
  {
    number: 6,
    name: "Production and Handover",
    description: "Oversee production and prepare a clear quality handover.",
  },
  {
    number: 7,
    name: "Implementation and Supervision",
    description: "Implement the project and provide on-site supervision.",
  },
];

function formatNames(names: string[], emptyLabel: string) {
  return names.length > 0 ? names.join(", ") : emptyLabel;
}

function SummaryRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="grid gap-3 border-b border-[#e7ece7] py-4 last:border-b-0 sm:grid-cols-[210px_minmax(0,1fr)] sm:items-center sm:gap-6">
      <dt className="flex items-center gap-3 text-[13px] font-[700] text-[#657068]">
        <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-[#f0f6f1] text-[#427158]">
          {icon}
        </span>
        {label}
      </dt>
      <dd className="min-w-0 text-[14px] font-[650] leading-6 text-[#263029] sm:border-l sm:border-[#dfe6df] sm:pl-6">
        {value}
      </dd>
    </div>
  );
}

export function ProjectOverviewHeader({ projectName }: { projectName: string }) {
  return (
    <header>
      <div className="flex items-center gap-2 text-[12px] font-[750] uppercase tracking-[0.12em] text-[#4d765d]">
        <FolderKanban className="h-4 w-4" />
        Project workspace
      </div>
      <h1 className="mt-3 text-[30px] font-[780] leading-[1.12] tracking-[-0.045em] text-[#111713] sm:text-[38px] lg:text-[42px]">
        Project - {projectName}
      </h1>
    </header>
  );
}

export function ProjectSummaryCard({ project }: { project: ProjectFlowRecord }) {
  const owner = project.collaborators.find(
    (collaborator) => collaborator.role === "Project Owner",
  );
  const coOwnerNames = project.collaborators
    .filter((collaborator) => collaborator.role === "Project Co-Owner")
    .map((collaborator) => collaborator.name);
  const executorNames = project.executors.map((executor) => executor.name);
  const restrictedLabel = project.canViewParticipants ? "None" : "Restricted";

  return (
    <Card className="mt-7 rounded-[22px] border-[#dde5de] shadow-[0_16px_40px_rgba(23,39,28,0.045)]">
      <CardContent className="px-5 py-2 sm:px-7 lg:px-8">
        <dl>
          <SummaryRow
            icon={<FileText className="h-[18px] w-[18px]" />}
            label="Project Name"
            value={project.title}
          />
          <SummaryRow
            icon={<UserRound className="h-[18px] w-[18px]" />}
            label="Project Owner"
            value={
              owner?.name ??
              (project.ownerId ? "Restricted" : "Operational owner not assigned")
            }
          />
          <SummaryRow
            icon={<Users className="h-[18px] w-[18px]" />}
            label="Project Co-Owners"
            value={formatNames(coOwnerNames, restrictedLabel)}
          />
          <SummaryRow
            icon={<Briefcase className="h-[18px] w-[18px]" />}
            label="Project Executors"
            value={formatNames(executorNames, restrictedLabel)}
          />
        </dl>
      </CardContent>
    </Card>
  );
}

export function StageOverviewCard({ stage }: { stage: ProjectOverviewStage }) {
  const active = stage.number === 1;

  return (
    <article
      className={`flex min-h-[250px] min-w-0 flex-col rounded-[22px] border p-5 transition sm:p-6 ${
        active
          ? "border-[#287750] bg-[linear-gradient(145deg,#0f5b39_0%,#19764c_55%,#378a62_100%)] text-white shadow-[0_18px_42px_rgba(25,103,67,0.2)]"
          : "border-[#dfe5df] bg-[linear-gradient(145deg,#fbfcfa,#f3f6f3)] text-[#7a847d] shadow-[0_12px_30px_rgba(23,39,28,0.035)]"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <span
          className={`inline-flex rounded-full px-3 py-1 text-[11px] font-[750] ${
            active
              ? "border border-white/35 bg-white/10 text-white"
              : "bg-[#e7ece7] text-[#78827b]"
          }`}
        >
          Stage {stage.number}
        </span>
        {!active ? <Lock className="h-4 w-4 text-[#9ba49e]" aria-hidden="true" /> : null}
      </div>

      <h2
        className={`mt-5 text-[18px] font-[760] leading-[1.25] tracking-[-0.02em] ${
          active ? "text-white" : "text-[#6f7972]"
        }`}
      >
        {stage.name}
      </h2>
      <p
        className={`mt-3 text-[13px] font-[500] leading-5 ${
          active ? "text-white/82" : "text-[#7d8780]"
        }`}
      >
        {stage.description}
      </p>

      <div className="mt-auto pt-6">
        {active ? (
          <Button
            type="button"
            variant="secondary"
            title="Stage 1 workspace will be connected in the next implementation phase."
            className="h-11 w-full justify-between rounded-[13px] border-white bg-white px-5 text-[#174f34] shadow-[0_10px_24px_rgba(0,0,0,0.12)] hover:bg-[#f5fbf6]"
          >
            Open Stage
            <ArrowRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            type="button"
            variant="secondary"
            disabled
            className="h-11 w-full rounded-[13px] border-0 bg-[#e7ebe7] text-[#818a83] shadow-none disabled:opacity-100"
          >
            <Lock className="h-4 w-4" />
            Locked
          </Button>
        )}
      </div>
    </article>
  );
}

export function ProjectStageGrid() {
  return (
    <section className="mt-8" aria-labelledby="project-stages-heading">
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

      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {PROJECT_OVERVIEW_STAGES.map((stage) => (
          <StageOverviewCard key={stage.number} stage={stage} />
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
      <ProjectStageGrid />
    </section>
  );
}

export function ProjectOverviewLoadingShell() {
  return (
    <section className="mx-auto w-full max-w-[1420px] pb-6">
      <Skeleton className="h-4 w-36 rounded-full" />
      <Skeleton className="mt-4 h-10 w-full max-w-[560px] rounded-[12px]" />

      <Card className="mt-7 rounded-[22px] border-[#dde5de] shadow-none">
        <CardContent className="px-5 py-2 sm:px-7 lg:px-8">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="grid gap-3 border-b border-[#e7ece7] py-4 last:border-b-0 sm:grid-cols-[210px_minmax(0,1fr)] sm:items-center sm:gap-6"
            >
              <div className="flex items-center gap-3">
                <Skeleton className="size-9 rounded-[10px]" />
                <Skeleton className="h-3.5 w-28 rounded-full" />
              </div>
              <div className="sm:border-l sm:border-[#dfe6df] sm:pl-6">
                <Skeleton className="h-3.5 w-full max-w-[360px] rounded-full" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="mt-8">
        <Skeleton className="h-6 w-36 rounded-full" />
        <Skeleton className="mt-2 h-3.5 w-full max-w-[560px] rounded-full" />
        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {Array.from({ length: 7 }).map((_, index) => (
            <Skeleton key={index} className="min-h-[250px] rounded-[22px]" />
          ))}
        </div>
      </div>
    </section>
  );
}
