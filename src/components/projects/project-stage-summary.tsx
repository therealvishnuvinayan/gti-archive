import {
  BriefcaseBusiness,
  Building2,
  UserRound,
  Users,
} from "lucide-react";

import type { ProjectFlowRecord } from "@/lib/projects";

function getProjectDetails(project: ProjectFlowRecord) {
  const owner = project.collaborators.find(
    (collaborator) => collaborator.role === "Project Owner",
  );
  const coOwners = project.collaborators
    .filter((collaborator) => collaborator.role === "Project Co-Owner")
    .map((collaborator) => collaborator.name);
  const executors = project.executors.map((executor) => executor.name);
  const unavailableLabel = project.canViewParticipants ? "None assigned" : "Restricted";

  return {
    projectName: project.title,
    ownerName:
      owner?.name ??
      (project.ownerId ? "Restricted" : "Operational owner not assigned"),
    coOwnerNames: coOwners.join(", ") || unavailableLabel,
    executorNames: executors.join(", ") || unavailableLabel,
  };
}

function SummaryItem({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-w-0 items-start gap-3 rounded-[16px] border border-[#e7ece7] bg-[#fbfcfb] px-4 py-3.5">
      <span className="grid size-9 shrink-0 place-items-center rounded-[11px] bg-[#edf5ef] text-[#32704e]">
        {icon}
      </span>
      <div className="min-w-0 pt-0.5">
        <dt className="text-[11px] font-[700] uppercase tracking-[0.08em] text-[#7b857e]">
          {label}
        </dt>
        <dd className="mt-1 truncate text-[13px] font-[680] text-[#253028]" title={value}>
          {value}
        </dd>
      </div>
    </div>
  );
}

export function ProjectStageSummary({ project }: { project: ProjectFlowRecord }) {
  const details = getProjectDetails(project);

  return (
    <dl className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <SummaryItem
        icon={<Building2 className="h-[17px] w-[17px]" />}
        label="Project Name"
        value={details.projectName}
      />
      <SummaryItem
        icon={<UserRound className="h-[17px] w-[17px]" />}
        label="Project Owner"
        value={details.ownerName}
      />
      <SummaryItem
        icon={<Users className="h-[17px] w-[17px]" />}
        label="Project Co-Owners"
        value={details.coOwnerNames}
      />
      <SummaryItem
        icon={<BriefcaseBusiness className="h-[17px] w-[17px]" />}
        label="Project Executors"
        value={details.executorNames}
      />
    </dl>
  );
}
