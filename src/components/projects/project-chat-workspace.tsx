"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import {
  Download,
  Languages,
  Link2,
  Loader2,
  Paperclip,
  Plus,
  Upload,
  X,
} from "lucide-react";

import { createStageCommentAction, createStageRevisionAction } from "@/app/(dashboard)/projects/actions";
import { AssetPreviewButton } from "@/components/projects/asset-preview-button";
import { ProjectCollaboratorsPanel } from "@/components/projects/project-collaborators-panel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { StageHistoryRecord } from "@/lib/project-history";
import type {
  ProjectAttachmentRecord,
  ProjectCollaboratorRecord,
  ProjectFlowRecord,
  ProjectStageRecord,
} from "@/lib/projects";

type ProjectChatWorkspaceProps = {
  project: ProjectFlowRecord;
  stageId?: string | null;
  history: StageHistoryRecord;
};

type PendingFile = {
  id: string;
  file: File;
};

type UploadAssetType = "REVISION_ORIGINAL" | "COMMENT_ATTACHMENT";

const fileTypeStyles: Record<string, string> = {
  AI: "bg-[#2d1207] text-[#ff9d12]",
  PSD: "bg-[#042a4c] text-[#57b2ff]",
  PDF: "bg-[#fff6f4] text-[#d94a41] border border-[#f2d7d3]",
  FIG: "bg-[#f8fbf8] text-[#657268] border border-[#dde6de]",
  ZIP: "bg-[#f4fbf5] text-[#4a9454] border border-[#dbe8dd]",
};

function getFileBadgeClass(label: string) {
  return fileTypeStyles[label] ?? "bg-[#f8fbf8] text-brand border border-[#dde6de]";
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function AttachmentHistoryList({
  attachments,
  compact = false,
}: {
  attachments: ProjectAttachmentRecord[];
  compact?: boolean;
}) {
  if (attachments.length === 0) {
    return null;
  }

  return (
    <div className={compact ? "mt-3 space-y-2" : "mt-3 space-y-2.5"}>
      {attachments.map((attachment) => (
        <div
          key={attachment.id}
          className={`rounded-[14px] border border-white/15 bg-white/92 px-3 py-2.5 text-[#111712] shadow-[0_10px_22px_rgba(18,35,23,0.06)] ${
            compact ? "sm:max-w-[360px]" : ""
          }`}
        >
          <div className="flex items-start gap-3">
            <div
              className={`grid h-8 min-w-8 place-items-center rounded-md text-[10px] font-[800] ${getFileBadgeClass(
                attachment.fileTypeLabel,
              )}`}
            >
              {attachment.fileTypeLabel}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-[700] text-[#111712]">
                {attachment.originalFileName}
              </p>
              <p className="mt-0.5 text-[10px] leading-4 text-[#6c756e]">
                {attachment.fileSizeLabel} · Uploaded by {attachment.uploadedBy}
              </p>
              <p className="text-[10px] leading-4 text-[#89928b]">{attachment.uploadedAt}</p>
            </div>
            <div className="flex items-center gap-1">
              <AssetPreviewButton
                fileName={attachment.originalFileName}
                mimeType={attachment.mimeType}
                previewPath={attachment.previewPath}
                downloadPath={attachment.downloadPath}
                triggerClassName="size-8 rounded-full text-brand"
              />
              <Button
                asChild
                variant="ghost"
                size="icon"
                className="size-8 rounded-full text-brand"
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
        </div>
      ))}
    </div>
  );
}

async function uploadAssetFile(input: {
  file: File;
  projectId: string;
  stageId: string;
  revisionId?: string | null;
  commentId?: string | null;
  assetType: UploadAssetType;
}) {
  const requestUploadResponse = await fetch("/api/project-assets/upload-url", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      projectId: input.projectId,
      stageId: input.stageId,
      revisionId: input.revisionId ?? null,
      commentId: input.commentId ?? null,
      originalFileName: input.file.name,
      mimeType: input.file.type || "application/octet-stream",
      fileSize: input.file.size,
      assetType: input.assetType,
    }),
  });

  const uploadPayload = (await requestUploadResponse.json()) as {
    error?: string;
    attachmentId?: string;
    uploadUrl?: string;
  };

  if (!requestUploadResponse.ok || !uploadPayload.attachmentId || !uploadPayload.uploadUrl) {
    throw new Error(uploadPayload.error || "Unable to prepare the upload.");
  }

  try {
    const uploadResponse = await fetch(uploadPayload.uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": input.file.type || "application/octet-stream",
      },
      body: input.file,
    });

    if (!uploadResponse.ok) {
      throw new Error(`Upload failed for ${input.file.name}.`);
    }

    const completionResponse = await fetch("/api/project-assets/complete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        attachmentId: uploadPayload.attachmentId,
        projectId: input.projectId,
      }),
    });

    const completionPayload = (await completionResponse.json()) as { error?: string };

    if (!completionResponse.ok) {
      throw new Error(completionPayload.error || "Unable to finalise the upload.");
    }
  } catch (error) {
    await fetch("/api/project-assets/complete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        attachmentId: uploadPayload.attachmentId,
        failed: true,
        projectId: input.projectId,
      }),
    }).catch(() => undefined);

    throw error;
  }
}

export function ProjectChatWorkspace({
  project,
  stageId,
  history,
}: ProjectChatWorkspaceProps) {
  const router = useRouter();
  const [collaborators, setCollaborators] = useState<ProjectCollaboratorRecord[]>(
    project.collaborators,
  );
  const [draft, setDraft] = useState("");
  const [composerError, setComposerError] = useState<string | null>(null);
  const [pendingCommentFiles, setPendingCommentFiles] = useState<PendingFile[]>([]);
  const [isSendingComment, setIsSendingComment] = useState(false);
  const [isUploadingRevision, setIsUploadingRevision] = useState(false);
  const [, startRefresh] = useTransition();
  const revisionFileInputRef = useRef<HTMLInputElement | null>(null);
  const commentFileInputRef = useRef<HTMLInputElement | null>(null);

  const messages = history.entries;

  const activeStage = useMemo<ProjectStageRecord | undefined>(() => {
    if (!stageId) {
      return (
        project.stageCards.find((stage) => stage.id === project.currentStageId) ??
        project.stageCards[0]
      );
    }

    return project.stageCards.find((stage) => stage.id === stageId) ?? project.stageCards[0];
  }, [project.currentStageId, project.stageCards, stageId]);

  function removeCollaborator(id: string) {
    setCollaborators((current) => current.filter((collaborator) => collaborator.id !== id));
  }

  function refreshHistory() {
    startRefresh(() => {
      router.refresh();
    });
  }

  async function handleRevisionFilesSelected(files: FileList | null) {
    const selectedFiles = Array.from(files ?? []);
    const activeStageId = activeStage?.id;

    if (selectedFiles.length === 0) {
      return;
    }

    if (!activeStageId) {
      setComposerError("This project does not have an active stage to upload into.");
      return;
    }

    setComposerError(null);
    setIsUploadingRevision(true);

    try {
      const revisionResult = await createStageRevisionAction({
        projectId: project.id,
        stageId: activeStageId,
        summary:
          selectedFiles.length === 1
            ? `Uploaded ${selectedFiles[0]?.name}`
            : `Uploaded ${selectedFiles.length} revision files.`,
      });

      if ("error" in revisionResult) {
        throw new Error(revisionResult.error);
      }

      for (const file of selectedFiles) {
        await uploadAssetFile({
          file,
          projectId: project.id,
          stageId: activeStageId,
          revisionId: revisionResult.revisionId,
          assetType: "REVISION_ORIGINAL",
        });
      }

      refreshHistory();
    } catch (error) {
      setComposerError(
        error instanceof Error ? error.message : "Unable to upload the revision files right now.",
      );
    } finally {
      setIsUploadingRevision(false);

      if (revisionFileInputRef.current) {
        revisionFileInputRef.current.value = "";
      }
    }
  }

  function handleCommentFilesSelected(files: FileList | null) {
    const selectedFiles = Array.from(files ?? []);

    if (selectedFiles.length === 0) {
      return;
    }

    setComposerError(null);
    setPendingCommentFiles((current) => [
      ...current,
      ...selectedFiles.map((file) => ({
        id: `${file.name}-${file.size}-${crypto.randomUUID()}`,
        file,
      })),
    ]);

    if (commentFileInputRef.current) {
      commentFileInputRef.current.value = "";
    }
  }

  function removePendingCommentFile(fileId: string) {
    setPendingCommentFiles((current) => current.filter((file) => file.id !== fileId));
  }

  async function handleSendComment() {
    const body = draft.trim();
    const activeStageId = activeStage?.id;

    if (!body && pendingCommentFiles.length === 0) {
      return;
    }

    if (!activeStageId) {
      setComposerError("This project does not have an active stage to comment on.");
      return;
    }

    setComposerError(null);
    setIsSendingComment(true);

    try {
      const commentResult = await createStageCommentAction({
        projectId: project.id,
        stageId: activeStageId,
        body,
        allowEmptyBody: pendingCommentFiles.length > 0,
      });

      if ("error" in commentResult) {
        throw new Error(commentResult.error);
      }

      for (const pendingFile of pendingCommentFiles) {
        await uploadAssetFile({
          file: pendingFile.file,
          projectId: project.id,
          stageId: activeStageId,
          revisionId: commentResult.revisionId,
          commentId: commentResult.commentId,
          assetType: "COMMENT_ATTACHMENT",
        });
      }

      setDraft("");
      setPendingCommentFiles([]);
      refreshHistory();
    } catch (error) {
      setComposerError(
        error instanceof Error ? error.message : "Unable to send the comment right now.",
      );
    } finally {
      setIsSendingComment(false);
    }
  }

  return (
    <section className="space-y-6">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px] 2xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-4">
          {composerError ? (
            <div className="rounded-[18px] border border-[#f0d4d2] bg-[#fff5f4] px-4 py-3 text-[13px] text-[#bd554f]">
              {composerError}
            </div>
          ) : null}

          {messages.length === 0 ? (
            <Card className="border border-dashed border-[#d8e1d8] px-6 py-10 text-center">
              <CardTitle className="text-[20px]">
                {activeStage?.label ?? "Stage"} History
              </CardTitle>
              <p className="mt-2 text-[14px] text-[#6e776f]">
                No revisions or comments have been added to this stage yet.
              </p>
              <p className="mt-1 text-[13px] text-[#8a938c]">
                Upload the first revision to start the proof and archive trail.
              </p>
              <div className="mt-5 flex justify-center">
                <Button
                  type="button"
                  onClick={() => revisionFileInputRef.current?.click()}
                  disabled={isUploadingRevision}
                >
                  {isUploadingRevision ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  Upload First Revision
                </Button>
              </div>
            </Card>
          ) : null}

          {messages.map((message, index) =>
            message.kind === "revision" ? (
              <div
                key={message.id}
                className="grid gap-3 2xl:grid-cols-[minmax(0,1fr)_176px] 2xl:items-start"
              >
                <Card className="flex-1 rounded-[20px] border-none bg-[linear-gradient(135deg,#2f8d5d,#476f5a)] p-5 text-white shadow-[0_18px_45px_rgba(23,39,28,0.08)]">
                  <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(300px,380px)] xl:items-start 2xl:grid-cols-[minmax(0,1fr)_420px]">
                    <div>
                      <h1 className="text-[18px] font-[700] text-[#95d867]">
                        {message.title}
                      </h1>
                      <div className="mt-2 flex items-center gap-2">
                        <div className="grid h-7 w-7 place-items-center rounded-full bg-[linear-gradient(145deg,#f0dcc4,#b58257)] text-[10px] font-[700] text-white">
                          {getInitials(message.author)}
                        </div>
                        <div>
                          <p className="text-[12px] font-[600]">{message.author}</p>
                          <p className="text-[10px] text-[#93d68a]">{message.role}</p>
                        </div>
                      </div>
                      <p className="mt-3 text-[12px] leading-[1.45] text-white/90">
                        {message.body}
                      </p>
                      <p className="mt-2 text-[10px] text-white/70">{message.createdAt}</p>
                    </div>

                    {message.attachments?.length ? (
                      <Card className="min-w-0 rounded-[16px] border border-white/25 bg-[#1f5f40]/75 p-3 shadow-[0_10px_24px_rgba(13,39,27,0.28)]">
                        <p className="text-center text-[11px] font-[700]">Attachments</p>
                        <AttachmentHistoryList attachments={message.attachments} />
                        {message.compareLabel ? (
                          <Button asChild size="sm" className="mt-3 min-h-[30px] w-full text-[11px]">
                            <Link href={`/projects/${project.id}/compare?stage=${activeStage?.id ?? ""}`}>
                              {message.compareLabel}
                            </Link>
                          </Button>
                        ) : null}
                      </Card>
                    ) : null}
                  </div>
                </Card>

                <div className="flex flex-col gap-2 2xl:w-[176px] sm:flex-row sm:flex-wrap 2xl:flex-col">
                  {index === messages.findIndex((entry) => entry.kind === "revision") ? (
                    <>
                      <Button
                        type="button"
                        onClick={() => revisionFileInputRef.current?.click()}
                        size="sm"
                        className="text-[12px]"
                        disabled={isUploadingRevision}
                      >
                        {isUploadingRevision ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Upload className="h-3.5 w-3.5" />
                        )}
                        Create Revision
                      </Button>
                      <Button type="button" size="sm" variant="secondary" className="text-[12px]" disabled>
                        Mark as complete
                      </Button>
                    </>
                  ) : null}
                  <Button
                    type="button"
                    onClick={() => setDraft(`Replying to ${message.author}: `)}
                    size="sm"
                    variant="secondary"
                    className="text-[12px]"
                  >
                    Add Comments
                  </Button>
                </div>
              </div>
            ) : (
              <Card
                key={message.id}
                className="rounded-[8px] border border-[#4b4d4b] bg-white p-3 shadow-[0_8px_20px_rgba(19,28,22,0.04)]"
              >
                <div className="flex items-center gap-2">
                  <div className="grid h-6 w-6 place-items-center rounded-full bg-[linear-gradient(145deg,#f0dcc4,#b58257)] text-[10px] font-[700] text-white">
                    {getInitials(message.author)}
                  </div>
                  <div>
                    <p className="text-[12px] font-[700] text-[#111712]">{message.author}</p>
                    <p className="text-[10px] text-[#8acb74]">{message.role}</p>
                  </div>
                  <span className="ml-auto text-[10px] text-[#7d847e]">{message.createdAt}</span>
                </div>
                <p className="mt-3 text-[12px] leading-[1.35] text-[#111712]">{message.body}</p>
                {message.attachments?.length ? (
                  <AttachmentHistoryList attachments={message.attachments} compact />
                ) : null}
              </Card>
            ),
          )}

          <Card className="sticky bottom-0 rounded-[22px] bg-white/95 p-3 backdrop-blur">
            <input
              ref={revisionFileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(event) => {
                void handleRevisionFilesSelected(event.target.files);
              }}
            />
            <input
              ref={commentFileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(event) => {
                handleCommentFilesSelected(event.target.files);
              }}
            />

            {pendingCommentFiles.length ? (
              <div className="mb-3 flex flex-wrap gap-2 rounded-[18px] border border-[#e2e7e2] bg-[#fbfcfa] px-3 py-2.5">
                {pendingCommentFiles.map((pendingFile) => (
                  <div
                    key={pendingFile.id}
                    className="inline-flex items-center gap-2 rounded-full border border-[#d6dfd7] bg-white px-3 py-1.5 text-[11px] text-[#324138]"
                  >
                    <span className="max-w-[180px] truncate">{pendingFile.file.name}</span>
                    <button
                      type="button"
                      onClick={() => removePendingCommentFile(pendingFile.id)}
                      className="cursor-pointer text-[#7d847e] transition hover:text-[#27322b]"
                      aria-label={`Remove ${pendingFile.file.name}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="flex items-center gap-3 rounded-full border border-[#e2e7e2] px-4 py-3">
              <Input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder='Add a comment or upload files for this stage revision history.'
                className="h-auto border-none bg-transparent p-0 text-[14px] shadow-none ring-0 focus-visible:ring-0"
              />
              <div className="flex items-center gap-2">
                <Button type="button" variant="ghost" size="icon" className="size-8 text-[#5083ff]" aria-label="Translate">
                  <Languages className="h-5 w-5" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 rounded-md px-2 text-[10px] font-[700]"
                >
                  EN
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 text-brand"
                  aria-label="Attach file"
                  onClick={() => commentFileInputRef.current?.click()}
                >
                  <Paperclip className="h-5 w-5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 text-brand"
                  aria-label="Insert link"
                  disabled
                >
                  <Link2 className="h-5 w-5" />
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    void handleSendComment();
                  }}
                  size="sm"
                  className="text-[12px]"
                  disabled={isSendingComment}
                >
                  {isSendingComment ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Plus className="h-3.5 w-3.5" />
                  )}
                  Send
                </Button>
              </div>
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="rounded-[20px] border border-brand/40">
            <CardHeader className="pb-3">
              <CardTitle className="text-[20px] text-brand">
                Stage Overview
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <dl className="space-y-1.5 text-[13px] text-[#242b26]">
                <div>
                  <dt className="inline font-[700]">Budget :</dt>{" "}
                  <dd className="inline">{activeStage?.budget ?? project.budget}</dd>
                </div>
                <div>
                  <dt className="inline font-[700]">Revisions :</dt>{" "}
                  <dd className="inline">
                    {messages.filter((message) => message.kind === "revision").length}
                  </dd>
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
              <div className="mt-5">
                <Button asChild size="sm" className="min-w-[110px] text-[13px]">
                  <Link href="#">Brief</Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-[20px] text-[#111712]">
                Project Reference Files
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {project.attachments.length > 0 ? (
                <AttachmentHistoryList attachments={project.attachments} compact />
              ) : (
                <p className="text-[13px] text-[#7a837b]">
                  No project reference files uploaded yet.
                </p>
              )}
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
