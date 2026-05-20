"use client";

import { useMemo, useState } from "react";
import { Eye, Trash2 } from "lucide-react";

import type { ProjectCollaborator, ProjectRecord, ProjectStage } from "@/components/projects/project-data";

type ProjectDetailWorkspaceProps = {
  project: ProjectRecord;
};

const stageStyles: Record<
  ProjectStage["status"],
  {
    card: string;
    label: string;
    primaryButton: string;
    secondaryButton: string;
  }
> = {
  completed: {
    card: "bg-[linear-gradient(135deg,#466d58,#5d9874)]",
    label: "text-[#f3a11a]",
    primaryButton: "bg-white text-brand",
    secondaryButton: "bg-white text-brand",
  },
  "in-progress": {
    card: "bg-[linear-gradient(135deg,#48745b,#4f8d68)]",
    label: "text-[#7edb66]",
    primaryButton: "bg-[linear-gradient(90deg,#31a06a,#133f2d)] text-white",
    secondaryButton: "bg-white text-brand",
  },
  due: {
    card: "bg-[linear-gradient(135deg,#668d77,#7da38f)]",
    label: "text-[#36a2ff]",
    primaryButton: "bg-[#e7e6ea] text-white",
    secondaryButton: "bg-[#e7e6ea] text-white",
  },
};

function getInitials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function ProjectDetailWorkspace({ project }: ProjectDetailWorkspaceProps) {
  const [collaborators, setCollaborators] = useState<ProjectCollaborator[]>(
    project.collaborators,
  );

  const groupedCollaborators = useMemo(
    () => ({
      internal: collaborators.filter((collaborator) => collaborator.group === "internal"),
      external: collaborators.filter((collaborator) => collaborator.group === "external"),
    }),
    [collaborators],
  );

  function removeCollaborator(id: string) {
    setCollaborators((current) => current.filter((collaborator) => collaborator.id !== id));
  }

  return (
    <section className="space-y-6">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_288px]">
        <div className="rounded-[20px] bg-[linear-gradient(135deg,#466d58,#5e8f75)] px-6 py-5 text-white shadow-[0_18px_45px_rgba(23,39,28,0.08)]">
          <h1 className="text-[23px] font-[700] leading-[1.15] tracking-[-0.03em]">
            {project.title}
          </h1>
          <p className="mt-1 text-[16px] font-[700] leading-[1.1] text-[#86d66f]">
            {project.category}
          </p>
          <div className="mt-3 flex flex-col gap-2 text-[13px] text-white/95 sm:flex-row sm:items-end sm:justify-between">
            <p>Project Owner : {project.owner}</p>
            <p className="text-[14px] font-[500] text-[#83db71]">{project.statusLabel}</p>
          </div>
        </div>

        <aside className="rounded-[20px] border border-brand/40 bg-white p-5 shadow-[0_18px_45px_rgba(23,39,28,0.05)]">
          <h2 className="text-[21px] font-[700] tracking-[-0.03em] text-brand">
            Project Overview
          </h2>
          <dl className="mt-3 space-y-1.5 text-[13px] text-[#242b26]">
            <div>
              <dt className="inline font-[700]">Budget:</dt> <dd className="inline">{project.budget}</dd>
            </div>
            <div>
              <dt className="inline font-[700]">Stages:</dt> <dd className="inline">{project.stages}</dd>
            </div>
            <div>
              <dt className="inline font-[700]">Project Started:</dt> <dd className="inline">{project.startDate}</dd>
            </div>
            <div>
              <dt className="inline font-[700]">Project Deadline:</dt> <dd className="inline">{project.deadline}</dd>
            </div>
            <div>
              <dt className="inline font-[700]">Tag:</dt> <dd className="inline">{project.tag}</dd>
            </div>
            <div>
              <dt className="inline font-[700]">Priority:</dt> <dd className="inline">{project.priority}</dd>
            </div>
          </dl>
        </aside>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_288px]">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {project.stageCards.map((stage) => {
            const style = stageStyles[stage.status];

            return (
              <article
                key={stage.id}
                className={`rounded-[20px] p-5 text-white shadow-[0_18px_42px_rgba(23,39,28,0.06)] ${style.card}`}
              >
                <p className={`text-[15px] font-[700] ${style.label}`}>{stage.label}</p>
                <p className="mt-1 text-[13px] text-white/90">{stage.subtitle}</p>
                <h3 className="mt-1.5 text-[17px] font-[700] leading-[1.15]">
                  {stage.title}
                </h3>
                <div className="mt-3 space-y-1 text-[13px] text-[#9fe87b]">
                  <p>Created on {stage.createdOn}</p>
                  <p>Stage Budget: {stage.budget}</p>
                </div>
                <div className="mt-6 space-y-2.5">
                  <button
                    type="button"
                    className={`inline-flex min-h-[40px] w-full items-center justify-center rounded-full px-5 text-[14px] font-[600] ${style.primaryButton}`}
                  >
                    Open Stage
                  </button>
                  <button
                    type="button"
                    className={`inline-flex min-h-[40px] w-full items-center justify-center rounded-full px-5 text-[14px] font-[600] ${style.secondaryButton}`}
                  >
                    Edit
                  </button>
                </div>
              </article>
            );
          })}
        </div>

        <aside className="rounded-[20px] bg-white p-5 shadow-[0_18px_45px_rgba(23,39,28,0.05)]">
          <h2 className="text-[20px] font-[700] tracking-[-0.03em] text-[#111712]">
            Project Collaborators
          </h2>

          {(["internal", "external"] as const).map((group) => (
            <div key={group} className="mt-5">
              <h3 className="text-[16px] font-[700] text-[#86c864] capitalize">
                {group}
              </h3>
              <ul className="mt-3 space-y-3">
                {groupedCollaborators[group].map((collaborator) => (
                  <li key={collaborator.id} className="flex items-center gap-3">
                    <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[linear-gradient(145deg,#f0dcc4,#b58257)] text-[10px] font-[700] text-white">
                      {getInitials(collaborator.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] font-[600] text-[#111712]">
                        {collaborator.name}
                      </p>
                      <p className="truncate text-[10px] text-[#7a837b]">{collaborator.role}</p>
                    </div>
                    {collaborator.group === "external" ? (
                      <Eye
                        className={`h-4 w-4 ${
                          collaborator.access === "view"
                            ? "text-[#50b848]"
                            : "text-[#ff2f2f]"
                        }`}
                      />
                    ) : collaborator.removable ? (
                      <button
                        type="button"
                        onClick={() => removeCollaborator(collaborator.id)}
                        className="text-[#ff6e68]"
                        aria-label={`Remove ${collaborator.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </aside>
      </div>
    </section>
  );
}
