import Link from "next/link";

import type { ProjectFlowRecord, ProjectStageRecord } from "@/lib/projects";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

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
          "cursor-pointer border border-transparent bg-white text-brand hover:bg-[#f3faf4]",
      };
    case "on-hold":
      return {
        card: "bg-[linear-gradient(135deg,#5a6d64,#7a8e83)] text-white",
        label: "text-[#ffd16f]",
        meta: "text-[#d8eee0]",
        secondaryButton:
          "cursor-pointer border border-transparent bg-white text-brand hover:bg-[#f3faf4]",
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
          "cursor-pointer border border-transparent bg-white text-brand hover:bg-[#f3faf4]",
      };
  }
}

export function ProjectDetailWorkspace({ project }: ProjectDetailWorkspaceProps) {
  return (
    <section className="space-y-6">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_288px]">
        <Card className="rounded-[20px] border-none bg-[linear-gradient(135deg,#466d58,#5e8f75)] px-6 py-5 text-white shadow-[0_18px_45px_rgba(23,39,28,0.08)]">
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
        </Card>

        <Card className="rounded-[20px] border border-brand/40">
          <CardHeader className="pb-3">
          <CardTitle className="text-[21px] text-brand">
            Project Overview
          </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
          <dl className="space-y-1.5 text-[13px] text-[#242b26]">
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
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-[20px]">
        <CardHeader>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <CardTitle className="text-[22px]">
              Project Stages
            </CardTitle>
            <p className="mt-1 text-[14px] text-[#6b756d]">
              Open a stage to continue discussion and revision work. Use compare from the stage flow.
            </p>
          </div>
        </div>
        </CardHeader>

        {project.stageCards.length > 0 ? (
          <CardContent className="grid gap-4 xl:grid-cols-3">
            {project.stageCards.map((stage) => {
              const styles = getStageCardClasses(stage);
              const stageInactive = stage.status === "pending";

              return (
                <Card
                  key={stage.id}
                  className={`rounded-[18px] p-4 shadow-[0_18px_42px_rgba(23,39,28,0.05)] ${styles.card}`}
                >
                  <Badge
                    variant="secondary"
                    className={`w-fit border-none bg-white/12 text-[16px] font-[700] leading-tight ${styles.label}`}
                  >
                    {stage.label}
                  </Badge>
                  <p className="mt-1 text-[14px] leading-tight text-white/90">
                    {stage.subtitle}
                  </p>
                  {stage.description ? (
                    <p className="mt-2 min-h-[40px] text-[12px] leading-[1.4] text-white/82">
                      {stage.description}
                    </p>
                  ) : (
                    <div className="mt-2 min-h-[40px]" />
                  )}
                  <h3 className="mt-1 min-h-[76px] text-[20px] font-[700] leading-[1.08] text-white">
                    {stage.title}
                  </h3>
                  <div className={`space-y-0.5 text-[14px] ${styles.meta}`}>
                    <p>Created on {stage.createdOn}</p>
                    <p>Stage Budget: {stage.budget}</p>
                  </div>

                  <Separator className="my-4 bg-white/12" />

                  <div className="mt-5 space-y-2.5">
                    <Button
                      asChild
                      className={stageInactive ? "pointer-events-none bg-[#f1f1f1] text-[#d7d7d7] shadow-none" : "w-full"}
                    >
                      <Link href={`/projects/${project.id}/chat?stage=${stage.id}`}>
                        Open Stage
                      </Link>
                    </Button>
                    <Button
                      asChild
                      variant="secondary"
                      className={stageInactive ? "pointer-events-none border-[#cbd6ce] bg-[#f1f1f1] text-[#d7d7d7]" : styles.secondaryButton}
                    >
                      <Link href={`/projects/${project.id}/compare?stage=${stage.id}`}>
                        Compare
                      </Link>
                    </Button>
                  </div>
                </Card>
              );
            })}
          </CardContent>
        ) : (
          <CardContent>
            <div className="rounded-[18px] border border-dashed border-[#d7ded7] bg-[#fbfcfa] px-5 py-10 text-center text-[15px] text-[#6e776f]">
              No stages are attached to this project yet.
            </div>
          </CardContent>
        )}
      </Card>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)]">
        <Card className="rounded-[20px]">
          <CardHeader>
          <CardTitle className="text-[20px]">
            Project Brief
          </CardTitle>
          </CardHeader>
          <CardContent>
          <p className="whitespace-pre-wrap text-[15px] leading-7 text-[#39433c]">
            {project.description}
          </p>
          </CardContent>
        </Card>

        <Card className="rounded-[20px]">
          <CardHeader>
          <CardTitle className="text-[20px]">
            Project Assets
          </CardTitle>
          </CardHeader>
          <CardContent>
          <div className="rounded-[18px] border border-dashed border-[#d7ded7] bg-[#fbfcfa] px-4 py-8 text-center text-[14px] text-[#6e776f]">
            No project-level attachments uploaded yet.
          </div>
          </CardContent>
        </Card>
      </section>
    </section>
  );
}
