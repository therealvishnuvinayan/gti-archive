"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Download } from "lucide-react";

import { AssetPreviewButton } from "@/components/projects/asset-preview-button";
import { ProjectCollaboratorsPanel } from "@/components/projects/project-collaborators-panel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { StageHistoryRecord } from "@/lib/project-history";
import type {
  ProjectAttachmentRecord,
  ProjectCollaboratorRecord,
  ProjectFlowRecord,
  ProjectStageRecord,
} from "@/lib/projects";

type ProjectCompareWorkspaceProps = {
  project: ProjectFlowRecord;
  stageId?: string | null;
  history: StageHistoryRecord;
};

function getStageSubmissionAttachments(
  messages: StageHistoryRecord["entries"],
): ProjectAttachmentRecord[] {
  const submissions = messages
    .flatMap((message) => message.attachments ?? [])
    .filter((attachment) => attachment.isSubmission);

  return submissions
    .filter(
      (attachment, index, current) =>
        current.findIndex((candidate) => candidate.id === attachment.id) === index,
    )
    .sort(
      (left, right) =>
        (left.submissionNumber ?? Number.MAX_SAFE_INTEGER) -
        (right.submissionNumber ?? Number.MAX_SAFE_INTEGER),
    );
}

export function ProjectCompareWorkspace({
  project,
  stageId,
  history,
}: ProjectCompareWorkspaceProps) {
  const [collaborators, setCollaborators] = useState<ProjectCollaboratorRecord[]>(
    project.collaborators,
  );
  const activeStage = useMemo<ProjectStageRecord | undefined>(() => {
    if (!stageId) {
      return (
        project.stageCards.find((stage) => stage.id === project.currentStageId) ??
        project.stageCards[0]
      );
    }

    return project.stageCards.find((stage) => stage.id === stageId) ?? project.stageCards[0];
  }, [project.currentStageId, project.stageCards, stageId]);
  const submissions = useMemo(
    () => getStageSubmissionAttachments(history.entries),
    [history.entries],
  );
  const hasEnoughSubmissions = submissions.length >= 2;

  function removeCollaborator(id: string) {
    setCollaborators((current) => current.filter((collaborator) => collaborator.id !== id));
  }

  return (
    <section className="space-y-6">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_288px]">
        <div className="space-y-4">
          <Card className="rounded-[20px] border border-brand/40 p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h1 className="text-[28px] font-[700] tracking-[-0.03em] text-[#111712]">
                  Compare Submissions
                </h1>
                <p className="mt-2 text-[14px] text-[#5e685f]">
                  Review submissions uploaded in the current stage only.
                </p>
                <div className="mt-4 space-y-1 text-[13px] text-[#242b26]">
                  <p>
                    <span className="font-[700]">Project :</span> {project.title}
                  </p>
                  <p>
                    <span className="font-[700]">Stage :</span>{" "}
                    {activeStage?.label ?? project.currentStageName}
                  </p>
                  <p>
                    <span className="font-[700]">Submissions :</span> {submissions.length}
                  </p>
                </div>
              </div>

              <Button asChild size="sm" className="min-w-[160px] text-[13px]">
                <Link href={`/projects/${project.id}/chat?stage=${stageId ?? ""}`}>
                  Back to stage chat
                </Link>
              </Button>
            </div>
          </Card>

          {hasEnoughSubmissions ? null : (
            <Card className="rounded-[18px] border border-dashed border-[#d7e3d8] bg-[#fbfcfa] p-5">
              <p className="text-[15px] font-[700] text-[#243028]">
                Upload at least two submissions to compare.
              </p>
              <p className="mt-1 text-[13px] text-[#6f786f]">
                This stage currently has {submissions.length} submission
                {submissions.length === 1 ? "" : "s"}.
              </p>
            </Card>
          )}

          {submissions.length > 0 ? (
            <div className="space-y-3">
              {submissions.map((submission) => (
                <Card
                  key={submission.id}
                  className="rounded-[18px] border border-[#dde6de] bg-white p-4 shadow-[0_8px_20px_rgba(19,28,22,0.04)]"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex shrink-0 whitespace-nowrap rounded-full bg-[#edf7ef] px-2.5 py-1 text-[10px] font-[800] uppercase tracking-[0.08em] leading-none text-[#2b8b56]">
                          {submission.submissionNumber
                            ? `Submission ${submission.submissionNumber}`
                            : "Submission"}
                        </span>
                        <p className="truncate text-[14px] font-[700] text-[#111712]">
                          {submission.originalFileName}
                        </p>
                      </div>
                      <div className="mt-3 grid gap-1 text-[12px] text-[#5f685f] sm:grid-cols-2">
                        <p>
                          <span className="font-[700] text-[#242b26]">Uploaded by :</span>{" "}
                          {submission.uploadedBy}
                        </p>
                        <p>
                          <span className="font-[700] text-[#242b26]">Uploaded at :</span>{" "}
                          {submission.uploadedAt}
                        </p>
                        <p>
                          <span className="font-[700] text-[#242b26]">File type :</span>{" "}
                          {submission.fileTypeLabel}
                        </p>
                        <p>
                          <span className="font-[700] text-[#242b26]">File size :</span>{" "}
                          {submission.fileSizeLabel}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-start">
                      <AssetPreviewButton
                        fileName={submission.originalFileName}
                        mimeType={submission.mimeType}
                        previewPath={submission.previewPath}
                        downloadPath={submission.downloadPath}
                        triggerClassName="h-9 rounded-full border border-[#d6dfd7] px-3 text-brand hover:bg-[#f5f8f5]"
                        iconOnly={false}
                      />
                      <Button asChild type="button" variant="secondary" size="sm" className="rounded-full">
                        <a
                          href={submission.downloadPath}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`Download ${submission.originalFileName}`}
                        >
                          <Download className="h-4 w-4" />
                          Download
                        </a>
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="rounded-[18px] border border-dashed border-[#d7e3d8] bg-white p-6 text-center">
              <CardTitle className="text-[18px] text-[#111712]">No submissions yet</CardTitle>
              <p className="mt-2 text-[13px] text-[#6f786f]">
                Stage submissions will appear here after they are uploaded in the stage chat.
              </p>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card className="rounded-[20px] border border-brand/40">
            <CardHeader className="pb-3">
              <CardTitle className="text-[20px] text-brand">Stage Overview</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <dl className="space-y-1.5 text-[13px] text-[#242b26]">
                <div>
                  <dt className="inline font-[700]">Budget :</dt>{" "}
                  <dd className="inline">{activeStage?.budget ?? project.budget}</dd>
                </div>
                <div>
                  <dt className="inline font-[700]">Stage Started :</dt>{" "}
                  <dd className="inline">{activeStage?.plannedStartAt ?? project.startDate}</dd>
                </div>
                <div>
                  <dt className="inline font-[700]">Stage Deadline :</dt>{" "}
                  <dd className="inline">{activeStage?.plannedDueAt ?? project.endDate}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <ProjectCollaboratorsPanel
            collaborators={collaborators}
            onRemove={removeCollaborator}
          />
        </div>
      </div>
    </section>
  );
}
