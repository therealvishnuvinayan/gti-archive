import Link from "next/link";
import { Download } from "lucide-react";

import { AssetPreviewButton } from "@/components/projects/asset-preview-button";
import { AttachmentFavoriteButton } from "@/components/projects/attachment-favorite-button";
import {
  ProjectCollaboratorsPanel,
  ProjectExecutorsPanel,
} from "@/components/projects/project-collaborators-panel";
import {
  CompletedProjectArchiveSummaryCard,
  ProjectCompletionChecklist,
} from "@/components/projects/project-completion-checklist";
import type { ProjectFlowRecord, ProjectStageRecord } from "@/lib/projects";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  MotionItem,
  MotionStaggerGroup,
} from "@/components/motion/motion-primitives";
import type { ProjectCompletionSummary } from "@/lib/archives";
import type { ProjectCompletionWorkflowRecord } from "@/lib/project-completion";

type ProjectDetailWorkspaceProps = {
  project: ProjectFlowRecord;
  completionSummary: ProjectCompletionSummary;
  completionWorkflow: ProjectCompletionWorkflowRecord | null;
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

export function ProjectDetailWorkspace({
  project,
  completionSummary,
  completionWorkflow,
}: ProjectDetailWorkspaceProps) {
  const stageGridClasses = "grid-cols-[repeat(auto-fit,minmax(180px,210px))]";

  return (
    <section className="mx-auto w-full max-w-[1140px] lg:h-[calc(100dvh-12rem)] lg:overflow-hidden">
      <div className="grid items-start gap-3 lg:h-full lg:grid-cols-[minmax(0,1fr)_252px]">
        <MotionItem
          y={10}
          className="no-scrollbar min-w-0 space-y-3 lg:h-full lg:overflow-x-hidden lg:overflow-y-auto lg:pr-1.5"
        >
          <Card className="rounded-[18px] border-none bg-[linear-gradient(135deg,#466d58,#5e8f75)] px-4 py-3.5 text-white shadow-[0_18px_45px_rgba(23,39,28,0.08)] sm:px-5">
            <div className="flex min-h-[76px] flex-col justify-between gap-4">
              <div>
                <h1 className="text-[23px] font-semibold leading-[1.08] tracking-tight">
                  {project.title}
                </h1>
                <p className="mt-0.5 text-[20px] font-semibold leading-[1.08] text-[#86d66f]">
                  {project.category}
                </p>
              </div>
              <div className="flex flex-col gap-1.5 text-[12px] font-[600] text-white/95 sm:flex-row sm:items-end sm:justify-between">
                <p>Project Owner : {project.createdBy}</p>
                <p className="text-[14px] font-semibold text-[#83db71]">
                  {project.currentStageName} : {project.statusLabel}
                </p>
              </div>
            </div>
          </Card>

          <Card className="rounded-[18px] bg-white shadow-[0_18px_42px_rgba(23,39,28,0.05)]">
            <CardHeader className="px-5 pt-5 pb-3">
              <CardTitle className="text-[20px] font-semibold tracking-tight">Project Stages</CardTitle>
              <p className="mt-0.5 text-[13px] text-[#6b756d]">
                Open a stage to continue discussion and revision work. Use compare from the stage flow.
              </p>
            </CardHeader>

            {project.stageCards.length > 0 ? (
              <CardContent className="px-5 pb-5 pt-0">
                <MotionStaggerGroup
                  className={`grid justify-start gap-3 ${stageGridClasses}`}
                  stagger={0.045}
                >
                  {project.stageCards.map((stage) => {
                    const styles = getStageCardClasses(stage);
                    const stageInactive = stage.status === "pending";

                    return (
                      <MotionItem key={stage.id} y={10} className="min-w-0">
                        <Card className={`flex min-h-[198px] min-w-0 flex-col overflow-hidden rounded-[10px] p-3.5 ${styles.card}`}>
                          <Badge
                            variant="secondary"
                            className={`max-w-full min-w-0 truncate border-none bg-white/12 text-[11px] font-semibold leading-tight ${styles.label}`}
                          >
                            {stage.label}
                          </Badge>
                          <p className="mt-1 truncate text-[11px] font-[600] leading-tight text-white/90">
                            {stage.subtitle}
                          </p>
                          {stage.description ? (
                            <p className="mt-1.5 line-clamp-2 text-[11px] leading-[1.35] text-white/82">
                              {stage.description}
                            </p>
                          ) : null}
                          <h3 className="mt-2.5 line-clamp-2 min-h-[36px] text-[17px] font-semibold leading-[1.08] tracking-tight text-white">
                            {stage.title}
                          </h3>
                          <div className={`mt-2.5 space-y-0.5 text-[11px] leading-4 ${styles.meta}`}>
                            <p>Created on {stage.createdOn}</p>
                            <p>Stage Budget: {stage.budget}</p>
                          </div>

                          <Separator className="mb-3 mt-auto bg-white/12" />

                          <Button
                            asChild
                            className={
                              stageInactive
                                ? "pointer-events-none min-h-9 w-full rounded-full bg-[#f1f1f1] px-4 py-2 text-[12px] text-[#d7d7d7] shadow-none"
                                : "min-h-9 w-full rounded-full bg-[#0c4c34] px-4 py-2 text-[12px] text-white hover:bg-[#0a402c]"
                            }
                          >
                            <Link href={`/projects/${project.id}/chat?stage=${stage.id}`}>
                              Open Stage
                            </Link>
                          </Button>
                        </Card>
                      </MotionItem>
                    );
                  })}
                </MotionStaggerGroup>
              </CardContent>
            ) : (
              <CardContent className="px-5 pb-5">
                <div className="rounded-[16px] border border-dashed border-[#d7ded7] bg-[#fbfcfa] px-5 py-8 text-center text-[14px] text-[#6e776f]">
                  No stages are attached to this project yet.
                </div>
              </CardContent>
            )}
          </Card>

          {completionSummary.isCompleted ? (
            <MotionStaggerGroup className="space-y-4" stagger={0.04}>
              <MotionItem y={10}>
                <CompletedProjectArchiveSummaryCard completionSummary={completionSummary} />
              </MotionItem>
              {completionWorkflow ? (
                <MotionItem y={10}>
                  <ProjectCompletionChecklist
                    projectId={project.id}
                    workflow={completionWorkflow}
                  />
                </MotionItem>
              ) : null}
            </MotionStaggerGroup>
          ) : null}

          <Card className="rounded-[18px]">
            <CardHeader className="px-5 pt-5 pb-2">
              <CardTitle className="text-[19px] font-semibold tracking-tight">Project Brief</CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-5">
              <p className="whitespace-pre-wrap text-[13px] leading-5 text-[#39433c]">
                {project.description}
              </p>
            </CardContent>
          </Card>
        </MotionItem>

        <aside className="no-scrollbar min-w-0 space-y-3 lg:sticky lg:top-0 lg:max-h-full lg:self-start lg:overflow-x-hidden lg:overflow-y-hidden lg:pr-1 lg:hover:overflow-y-auto lg:focus-within:overflow-y-auto">
          <Card className="rounded-[18px] border border-brand/40 shadow-none">
            <CardContent className="p-3.5">
              <h2 className="text-[16px] font-semibold tracking-tight text-brand">Project Overview</h2>
              <dl className="mt-2.5 space-y-1.5 text-[11px] leading-4 text-[#242b26]">
                <div>
                  <dt className="inline font-semibold">Budget:</dt>{" "}
                  <dd className="inline">{project.budget}</dd>
                </div>
                <div>
                  <dt className="inline font-semibold">Stages:</dt>{" "}
                  <dd className="inline">{project.stageCount}</dd>
                </div>
                <div>
                  <dt className="inline font-semibold">Project Started:</dt>{" "}
                  <dd className="inline">{project.startDate}</dd>
                </div>
                <div>
                  <dt className="inline font-semibold">Project Deadline:</dt>{" "}
                  <dd className="inline">{project.endDate}</dd>
                </div>
                <div>
                  <dt className="inline font-semibold">Executor:</dt>{" "}
                  <dd className="inline">{project.executorName}</dd>
                </div>
                <div>
                  <dt className="inline font-semibold">Tag:</dt>{" "}
                  <dd className="inline">{project.tag}</dd>
                </div>
                <div>
                  <dt className="inline font-semibold">Priority:</dt>{" "}
                  <dd className="inline">{project.priority}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <ProjectExecutorsPanel executors={project.executors} />

          <ProjectCollaboratorsPanel collaborators={project.collaborators} />

          <Card className="rounded-[18px]">
            <CardHeader className="px-4 pt-4 pb-2">
              <CardTitle className="text-[17px] font-semibold tracking-tight">Project Assets</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {project.attachments.length > 0 ? (
                <div className="space-y-2">
                  {project.attachments.map((attachment) => (
                    <div
                      key={attachment.id}
                      className="flex items-start justify-between gap-2 rounded-[14px] border border-[#dce6dd] bg-[#fbfcfa] px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[12px] font-semibold text-[#243028]">
                          {attachment.originalFileName}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[10px] text-[#7a837b]">
                          <span>{attachment.fileSizeLabel}</span>
                          <span>·</span>
                          <span>{attachment.uploadedBy}</span>
                          <span>·</span>
                          <span>{attachment.uploadedAt}</span>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <AssetPreviewButton
                          fileName={attachment.originalFileName}
                          mimeType={attachment.mimeType}
                          previewPath={attachment.previewPath}
                          downloadPath={attachment.downloadPath}
                          triggerClassName="size-7 text-brand"
                        />
                        <AttachmentFavoriteButton
                          attachmentId={attachment.id}
                          initialIsFavorited={attachment.isFavoritedByCurrentUser}
                          className="size-7 text-[#7a847d] hover:bg-[#fff4f5]"
                        />
                        <Button
                          asChild
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-7 text-brand"
                        >
                          <a
                            href={attachment.downloadPath}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={`Download ${attachment.originalFileName}`}
                          >
                            <Download className="h-4 w-4" />
                          </a>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-[16px] border border-dashed border-[#d7ded7] bg-[#fbfcfa] px-4 py-6 text-center text-[13px] text-[#6e776f]">
                  No project-level attachments uploaded yet.
                </div>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </section>
  );
}
