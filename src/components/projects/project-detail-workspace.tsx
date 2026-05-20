"use client";

import Link from "next/link";
import { useState } from "react";

import { ProjectCollaboratorsPanel } from "@/components/projects/project-collaborators-panel";
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

export function ProjectDetailWorkspace({ project }: ProjectDetailWorkspaceProps) {
  const [collaborators, setCollaborators] = useState<ProjectCollaborator[]>(
    project.collaborators,
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
                  <Link
                    href={`/projects/${project.slug}/chat?stage=${stage.id}`}
                    className={`inline-flex min-h-[40px] w-full items-center justify-center rounded-full px-5 text-[14px] font-[600] ${style.primaryButton}`}
                  >
                    Open Stage
                  </Link>
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

        <ProjectCollaboratorsPanel
          collaborators={collaborators}
          onRemove={removeCollaborator}
        />
      </div>
    </section>
  );
}
