import Link from "next/link";

import type { ProjectFlowRecord, ProjectStageRecord } from "@/lib/projects";

type ProjectDetailWorkspaceProps = {
  project: ProjectFlowRecord;
};

function getStageCardClasses(stage: ProjectStageRecord) {
  switch (stage.status) {
    case "completed":
      return {
        card: "bg-[linear-gradient(135deg,#466d58,#5d876f)] text-white",
        label: "text-[#ffaf00]",
        meta: "text-[#8dde76]",
        secondaryButton:
          "border border-transparent bg-white text-brand hover:bg-[#f3faf4]",
      };
    case "on-hold":
      return {
        card: "bg-[linear-gradient(135deg,#5a6d64,#7a8e83)] text-white",
        label: "text-[#ffd16f]",
        meta: "text-[#d8eee0]",
        secondaryButton:
          "border border-transparent bg-white text-brand hover:bg-[#f3faf4]",
      };
    case "pending":
      return {
        card: "bg-[linear-gradient(135deg,#6f9482,#8eafa0)] text-white",
        label: "text-[#59b4ff]",
        meta: "text-[#b7f08f]",
        secondaryButton:
          "border border-[#cbd6ce] bg-[#f1f1f1] text-[#d7d7d7] cursor-not-allowed",
      };
    default:
      return {
        card: "bg-[linear-gradient(135deg,#4f7f63,#5e9f79)] text-white",
        label: "text-[#92db6f]",
        meta: "text-[#8dde76]",
        secondaryButton:
          "border border-transparent bg-white text-brand hover:bg-[#f3faf4]",
      };
  }
}

export function ProjectDetailWorkspace({ project }: ProjectDetailWorkspaceProps) {
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
            <p>Created By : {project.createdBy}</p>
            <p className="text-[14px] font-[500] text-[#83db71]">
              {project.currentStageName} : {project.statusLabel}
            </p>
          </div>
        </div>

        <aside className="rounded-[20px] border border-brand/40 bg-white p-5 shadow-[0_18px_45px_rgba(23,39,28,0.05)]">
          <h2 className="text-[21px] font-[700] tracking-[-0.03em] text-brand">
            Project Overview
          </h2>
          <dl className="mt-3 space-y-1.5 text-[13px] text-[#242b26]">
            <div>
              <dt className="inline font-[700]">Budget:</dt>{" "}
              <dd className="inline">{project.budget}</dd>
            </div>
            <div>
              <dt className="inline font-[700]">Stages:</dt>{" "}
              <dd className="inline">{project.stageCount}</dd>
            </div>
            <div>
              <dt className="inline font-[700]">Project Started:</dt>{" "}
              <dd className="inline">{project.startDate}</dd>
            </div>
            <div>
              <dt className="inline font-[700]">Project Deadline:</dt>{" "}
              <dd className="inline">{project.endDate}</dd>
            </div>
            <div>
              <dt className="inline font-[700]">Tag:</dt>{" "}
              <dd className="inline">{project.tag}</dd>
            </div>
            <div>
              <dt className="inline font-[700]">Priority:</dt>{" "}
              <dd className="inline">{project.priority}</dd>
            </div>
          </dl>
        </aside>
      </div>

      <section className="rounded-[20px] bg-white p-6 shadow-[0_18px_45px_rgba(23,39,28,0.05)]">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-[22px] font-[700] tracking-[-0.03em] text-[#111712]">
              Project Stages
            </h2>
            <p className="mt-1 text-[14px] text-[#6b756d]">
              Open a stage to continue discussion and revision work. Use compare from the stage flow.
            </p>
          </div>
        </div>

        {project.stageCards.length > 0 ? (
          <div className="mt-5 grid gap-4 xl:grid-cols-3">
            {project.stageCards.map((stage) => {
              const styles = getStageCardClasses(stage);
              const stageInactive = stage.status === "pending";

              return (
                <article
                  key={stage.id}
                  className={`rounded-[18px] p-4 shadow-[0_18px_42px_rgba(23,39,28,0.05)] ${styles.card}`}
                >
                  <p className={`text-[16px] font-[700] leading-tight ${styles.label}`}>
                    {stage.label}
                  </p>
                  <p className="mt-1 text-[14px] leading-tight text-white/90">
                    {stage.subtitle}
                  </p>
                  <h3 className="mt-1 min-h-[76px] text-[20px] font-[700] leading-[1.08] text-white">
                    {stage.title}
                  </h3>
                  <div className={`space-y-0.5 text-[14px] ${styles.meta}`}>
                    <p>Created on {stage.createdOn}</p>
                    <p>Stage Budget: {stage.budget}</p>
                  </div>

                  <div className="mt-5 space-y-2.5">
                    <Link
                      href={`/projects/${project.id}/chat?stage=${stage.id}`}
                      className={`inline-flex min-h-[42px] w-full items-center justify-center rounded-full px-5 text-[15px] font-[600] transition-transform hover:-translate-y-0.5 ${
                        stageInactive
                          ? "cursor-not-allowed bg-[#f1f1f1] text-[#d7d7d7] pointer-events-none"
                          : "bg-[linear-gradient(90deg,#31a06a,#133f2d)] text-white"
                      }`}
                    >
                      Open Stage
                    </Link>
                    <Link
                      href={`/projects/${project.id}/compare?stage=${stage.id}`}
                      className={`inline-flex min-h-[42px] w-full items-center justify-center rounded-full px-5 text-[15px] font-[600] transition-colors ${styles.secondaryButton} ${
                        stageInactive ? "pointer-events-none" : ""
                      }`}
                    >
                      Compare
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="mt-5 rounded-[18px] border border-dashed border-[#d7ded7] bg-[#fbfcfa] px-5 py-10 text-center text-[15px] text-[#6e776f]">
            No stages are attached to this project yet.
          </div>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)]">
        <article className="rounded-[20px] bg-white p-6 shadow-[0_18px_45px_rgba(23,39,28,0.05)]">
          <h2 className="text-[20px] font-[700] tracking-[-0.03em] text-[#111712]">
            Project Brief
          </h2>
          <p className="mt-4 whitespace-pre-wrap text-[15px] leading-7 text-[#39433c]">
            {project.description}
          </p>
        </article>

        <article className="rounded-[20px] bg-white p-6 shadow-[0_18px_45px_rgba(23,39,28,0.05)]">
          <h2 className="text-[20px] font-[700] tracking-[-0.03em] text-[#111712]">
            Project Assets
          </h2>
          <div className="mt-4 rounded-[18px] border border-dashed border-[#d7ded7] bg-[#fbfcfa] px-4 py-8 text-center text-[14px] text-[#6e776f]">
            No project-level attachments uploaded yet.
          </div>
        </article>
      </section>
    </section>
  );
}
