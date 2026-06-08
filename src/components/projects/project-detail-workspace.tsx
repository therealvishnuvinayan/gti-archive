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
  const stageGridClasses = "grid-cols-[repeat(auto-fit,minmax(210px,240px))]";

  return (
    <section className="mx-auto w-full max-w-[1180px] lg:h-[calc(100dvh-12rem)] lg:overflow-hidden">
      <div className="grid items-start gap-4 lg:h-full lg:grid-cols-[minmax(0,1fr)_260px]">
        <MotionItem
          y={10}
          className="no-scrollbar min-w-0 space-y-4 lg:h-full lg:overflow-x-hidden lg:overflow-y-auto lg:pr-2"
        >
          <Card className="rounded-[18px] border-none bg-[linear-gradient(135deg,#466d58,#5e8f75)] px-4 py-4 text-white shadow-[0_18px_45px_rgba(23,39,28,0.08)] sm:px-5">
            <div className="flex min-h-[92px] flex-col justify-between gap-6">
              <div>
                <h1 className="text-[25px] font-semibold leading-[1.1] tracking-tight">
                  {project.title}
                </h1>
                <p className="mt-1 text-[22px] font-semibold leading-[1.08] text-[#86d66f]">
                  {project.category}
                </p>
              </div>
              <div className="flex flex-col gap-2 text-[12px] font-[600] text-white/95 sm:flex-row sm:items-end sm:justify-between">
                <p>Project Owner : {project.createdBy}</p>
                <p className="text-[15px] font-semibold text-[#83db71]">
                  {project.currentStageName} : {project.statusLabel}
                </p>
              </div>
            </div>
          </Card>

          <Card className="rounded-[18px] bg-white shadow-[0_18px_42px_rgba(23,39,28,0.05)]">
            <CardHeader className="pb-3">
              <CardTitle className="text-[22px] font-semibold tracking-tight">Project Stages</CardTitle>
              <p className="mt-1 text-[13px] text-[#6b756d]">
                Open a stage to continue discussion and revision work. Use compare from the stage flow.
              </p>
            </CardHeader>

            {project.stageCards.length > 0 ? (
              <CardContent className="pt-0">
                <MotionStaggerGroup
                  className={`grid justify-start gap-3 ${stageGridClasses}`}
                  stagger={0.045}
                >
                  {project.stageCards.map((stage) => {
                    const styles = getStageCardClasses(stage);
                    const stageInactive = stage.status === "pending";

                    return (
                      <MotionItem key={stage.id} y={10} className="min-w-0">
                        <Card className={`min-h-[250px] min-w-0 overflow-hidden rounded-[10px] p-4 ${styles.card}`}>
                          <Badge
                            variant="secondary"
                            className={`max-w-full min-w-0 truncate border-none bg-white/12 text-[13px] font-semibold leading-tight ${styles.label}`}
                          >
                            {stage.label}
                          </Badge>
                          <p className="mt-1 truncate text-[12px] font-[600] leading-tight text-white/90">
                            {stage.subtitle}
                          </p>
                          {stage.description ? (
                            <p className="mt-2 line-clamp-2 text-[12px] leading-[1.35] text-white/82">
                              {stage.description}
                            </p>
                          ) : null}
                          <h3 className="mt-3 line-clamp-2 min-h-[44px] text-[20px] font-semibold leading-[1.12] tracking-tight text-white">
                            {stage.title}
                          </h3>
                          <div className={`mt-3 space-y-0.5 text-[13px] ${styles.meta}`}>
                            <p>Created on {stage.createdOn}</p>
                            <p>Stage Budget: {stage.budget}</p>
                          </div>

                          <Separator className="my-3 bg-white/12" />

                          <Button
                            asChild
                            className={
                              stageInactive
                                ? "pointer-events-none w-full rounded-full bg-[#f1f1f1] text-[#d7d7d7] shadow-none"
                                : "w-full rounded-full bg-[#0c4c34] text-white hover:bg-[#0a402c]"
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
              <CardContent>
                <div className="rounded-[18px] border border-dashed border-[#d7ded7] bg-[#fbfcfa] px-5 py-10 text-center text-[15px] text-[#6e776f]">
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
            <CardHeader className="pb-2">
              <CardTitle className="text-[20px] font-semibold tracking-tight">Project Brief</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-[14px] leading-6 text-[#39433c]">
                {project.description}
              </p>
            </CardContent>
          </Card>
        </MotionItem>

        <aside className="no-scrollbar min-w-0 space-y-4 lg:sticky lg:top-0 lg:max-h-full lg:self-start lg:overflow-x-hidden lg:overflow-y-hidden lg:pr-1 lg:hover:overflow-y-auto lg:focus-within:overflow-y-auto">
          <Card className="rounded-[18px] border border-brand/40 shadow-none">
            <CardContent className="p-4">
              <h2 className="text-[18px] font-semibold tracking-tight text-brand">Project Overview</h2>
              <dl className="mt-3 space-y-1.5 text-[12px] leading-5 text-[#242b26]">
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
            <CardHeader className="pb-2">
              <CardTitle className="text-[20px] font-semibold tracking-tight">Project Assets</CardTitle>
            </CardHeader>
            <CardContent>
              {project.attachments.length > 0 ? (
                <div className="space-y-3">
                  {project.attachments.map((attachment) => (
                    <div
                      key={attachment.id}
                      className="flex items-start justify-between gap-3 rounded-[16px] border border-[#dce6dd] bg-[#fbfcfa] px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-[700] text-[#243028]">
                          {attachment.originalFileName}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-[#7a837b]">
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
                          triggerClassName="size-8 text-brand"
                        />
                        <AttachmentFavoriteButton
                          attachmentId={attachment.id}
                          initialIsFavorited={attachment.isFavoritedByCurrentUser}
                          className="size-8 text-[#7a847d] hover:bg-[#fff4f5]"
                        />
                        <Button
                          asChild
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8 text-brand"
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
                <div className="rounded-[18px] border border-dashed border-[#d7ded7] bg-[#fbfcfa] px-4 py-8 text-center text-[14px] text-[#6e776f]">
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
