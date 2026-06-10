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
import { Skeleton } from "@/components/ui/skeleton";
import {
  MotionItem,
  MotionStaggerGroup,
} from "@/components/motion/motion-primitives";
import type { ProjectCompletionSummary } from "@/lib/archives";
import type { ProjectCompletionWorkflowRecord } from "@/lib/project-completion";

type ProjectDetailWorkspaceProps = {
  project: ProjectFlowRecord;
  completionSummary?: ProjectCompletionSummary | null;
  completionWorkflow: ProjectCompletionWorkflowRecord | null;
  assetsLoading?: boolean;
  completionLoading?: boolean;
};

function DetailAssetsSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={index}
          className="rounded-[14px] border border-[#dce6dd] bg-[#fbfcfa] px-3 py-2.5"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-3.5 w-10/12 rounded-full" />
              <Skeleton className="h-2.5 w-8/12 rounded-full" />
            </div>
            <div className="flex shrink-0 gap-1">
              <Skeleton className="size-7 rounded-full" />
              <Skeleton className="size-7 rounded-full" />
              <Skeleton className="size-7 rounded-full" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function CompletionLoadingCard() {
  return (
    <Card className="rounded-[18px] border border-[#dbe7dd] bg-[#f7fbf6] shadow-none">
      <CardContent className="space-y-3 px-5 py-5">
        <Skeleton className="h-5 w-48 rounded-full" />
        <Skeleton className="h-3.5 w-10/12 rounded-full" />
        <Skeleton className="h-3.5 w-7/12 rounded-full" />
      </CardContent>
    </Card>
  );
}

function getStageCardClasses(stage: ProjectStageRecord) {
  switch (stage.status) {
    case "completed":
      return {
        card: "bg-[linear-gradient(135deg,#315b45,#47725a)] text-white",
        label: "bg-white/14 text-[#dff5e3]",
        meta: "text-[#bdecc6]",
        actionButton:
          "bg-white text-[#0c4c34] shadow-none hover:bg-[#f3faf4]",
      };
    case "on-hold":
      return {
        card: "bg-[linear-gradient(135deg,#58675e,#73857b)] text-white",
        label: "bg-white/14 text-[#eef6ef]",
        meta: "text-[#d8eee0]",
        actionButton:
          "bg-[#e6ebe7] text-[#8b958e] shadow-none hover:bg-[#e6ebe7]",
      };
    case "pending":
      return {
        card: "bg-[linear-gradient(135deg,#6f8679,#91a69a)] text-white",
        label: "bg-white/14 text-[#f1f8f2]",
        meta: "text-[#dcf0df]",
        actionButton:
          "bg-[#e6ebe7] text-[#8b958e] shadow-none hover:bg-[#e6ebe7]",
      };
    default:
      return {
        card: "bg-[linear-gradient(135deg,#2f7a52,#52946d)] text-white",
        label: "bg-white/14 text-[#dff5e3]",
        meta: "text-[#bdecc6]",
        actionButton:
          "bg-[#0c4c34] text-white shadow-none hover:bg-[#0a402c]",
      };
  }
}

function getStageStatusPillClassName(stage: ProjectStageRecord) {
  switch (stage.status) {
    case "completed":
      return "border-white/25 bg-white/16 text-[#e5f7e8]";
    case "pending":
      return "border-white/22 bg-white/12 text-white/82";
    case "on-hold":
      return "border-white/24 bg-white/14 text-white/88";
    default:
      return "border-white/25 bg-white/16 text-[#e5f7e8]";
  }
}

export function ProjectDetailWorkspace({
  project,
  completionSummary,
  completionWorkflow,
  assetsLoading = false,
  completionLoading = false,
}: ProjectDetailWorkspaceProps) {
  const stageGridClasses = "grid-cols-[repeat(auto-fit,minmax(215px,235px))]";
  const shouldShowCompletionLoading =
    completionLoading && project.statusLabel.toLowerCase() === "completed";

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
              <div className="flex flex-col gap-1.5 text-[12px] font-semibold text-white/95 sm:flex-row sm:items-end sm:justify-between">
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
                    const stageOpenable = stage.status === "in-progress";
                    const stageCompleted = stage.status === "completed";
                    const stageDisabledTitle =
                      stage.status === "on-hold"
                        ? "This stage is on hold."
                        : "This stage is not active yet.";
                    const stageButtonLabel = stageCompleted ? "View Stage" : "Open Stage";
                    const disabledStageButtonLabel =
                      stage.status === "on-hold" ? "On Hold" : "Pending";
                    const stageStatusLabel =
                      stage.status === "on-hold" ? "On Hold" : stage.statusLabel;

                    return (
                      <MotionItem key={stage.id} y={10} className="min-w-0">
                        <Card className={`flex h-[260px] min-w-0 flex-col overflow-hidden rounded-[12px] p-3.5 pb-5 shadow-none ${styles.card}`}>
                          <div className="min-h-[43px] space-y-1.5">
                            <div className="flex min-w-0 items-center justify-between gap-1.5">
                              <span className="inline-flex shrink-0 rounded-full border border-white/18 bg-white/16 px-2 py-0.5 text-[10px] font-semibold leading-tight text-white">
                                Stage {stage.order}
                              </span>
                              <Badge
                                variant="secondary"
                                className={`min-w-0 max-w-[112px] truncate border-none px-2 py-0.5 text-[10px] font-semibold leading-tight ${styles.label}`}
                              >
                                {stage.name}
                              </Badge>
                            </div>
                            <span
                              className={`inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-tight ${getStageStatusPillClassName(
                                stage,
                              )}`}
                            >
                              {stageStatusLabel}
                            </span>
                          </div>
                          <p className="mt-2 truncate text-[11px] font-medium leading-tight text-white/90">
                            {stage.subtitle}
                          </p>
                          <p className="mt-2 line-clamp-2 min-h-[30px] text-[11px] leading-[1.35] text-white/82">
                            {stage.description || "No stage brief added yet."}
                          </p>
                          <h3 className="mt-3 line-clamp-2 min-h-[38px] text-[17px] font-semibold leading-[1.1] tracking-tight text-white">
                            {stage.title}
                          </h3>
                          <div className={`mt-2.5 space-y-0.5 text-[11px] font-medium leading-4 ${styles.meta}`}>
                            <p>Created on {stage.createdOn}</p>
                            <p>Stage Budget: {stage.budget}</p>
                          </div>

                          <Separator className="mb-3 mt-auto bg-white/14" />

                          {stageOpenable || stageCompleted ? (
                            <Button
                              asChild
                              className={`min-h-9 w-full justify-center rounded-full px-4 py-2 ${styles.actionButton}`}
                            >
                              <Link href={`/projects/${project.id}/chat?stage=${stage.id}`}>
                                <span className="text-[12px] font-semibold leading-none">
                                  {stageButtonLabel}
                                </span>
                              </Link>
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              disabled
                              title={stageDisabledTitle}
                              className={`min-h-9 w-full cursor-not-allowed justify-center rounded-full px-4 py-2 disabled:opacity-100 ${styles.actionButton}`}
                            >
                              <span className="text-[12px] font-semibold leading-none">
                                {disabledStageButtonLabel}
                              </span>
                            </Button>
                          )}
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

          {shouldShowCompletionLoading ? (
            <CompletionLoadingCard />
          ) : completionSummary?.isCompleted ? (
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
                  <dt className="inline font-semibold">Execution Type:</dt>{" "}
                  <dd className="inline">{project.executionTypeLabel}</dd>
                </div>
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
              {assetsLoading ? (
                <DetailAssetsSkeleton />
              ) : project.attachments.length > 0 ? (
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
