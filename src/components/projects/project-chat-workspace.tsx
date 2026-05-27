"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useDropzone } from "react-dropzone";
import {
  Download,
  Languages,
  Loader2,
  Mic,
  Paperclip,
  Plus,
  Square,
  Upload,
  X,
} from "lucide-react";

import {
  acceptStageBriefAction,
  completeProjectArchiveAction,
  createStageCommentAction,
  createStageRevisionAction,
  markSubmissionCompleteAction,
  markStageCompleteAction,
  prepareProjectCompletionAction,
  removeProjectCollaboratorAction,
  requestSubmissionRevisionAction,
  saveProjectCollaboratorsAction,
  setProjectCollaboratorChatVisibilityAction,
} from "@/app/(dashboard)/projects/actions";
import { saveCollaboratorAction } from "@/app/(dashboard)/collaboration/actions";
import {
  DEFAULT_CHAT_LANGUAGE,
  SUPPORTED_CHAT_LANGUAGES,
  getSupportedLanguageByCode,
} from "@/lib/ai/languages";
import { getStageSubmissionAttachments } from "@/lib/comparison-utils";
import {
  getDefaultProjectCollaboratorParticipantType,
  type ProjectCollaboratorParticipantType,
} from "@/lib/project-collaborator-participant-types";
import { AssetPreviewButton } from "@/components/projects/asset-preview-button";
import { ChatLanguagePicker } from "@/components/projects/chat-language-picker";
import {
  CompletedProjectArchiveSummaryCard,
  ProjectCompletionChecklist,
} from "@/components/projects/project-completion-checklist";
import {
  CollaboratorDialog,
  type CollaboratorForm,
} from "@/components/collaboration/collaborator-dialog";
import { CollaboratorPickerDialog } from "@/components/collaboration/collaborator-picker-dialog";
import { ProjectCollaboratorsPanel } from "@/components/projects/project-collaborators-panel";
import { StageTimeRemainingCard } from "@/components/projects/stage-time-remaining-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type {
  ProjectArchivePreparation,
  ProjectCompletionSummary,
} from "@/lib/archives";
import type { ProjectCompletionWorkflowRecord } from "@/lib/project-completion";
import { showErrorToast, showSuccessToast } from "@/lib/toast";
import type { StageHistoryRecord } from "@/lib/project-history";
import type {
  ProjectAttachmentRecord,
  ProjectChatEntry,
  ProjectCollaboratorRecord,
  ProjectFlowRecord,
  ProjectStageRecord,
} from "@/lib/projects";
import type { CollaboratorRecord } from "@/lib/collaboration";

type ProjectChatWorkspaceProps = {
  project: ProjectFlowRecord;
  stageId?: string | null;
  history: StageHistoryRecord;
  availableCollaborators: CollaboratorRecord[];
  currentUserId: string;
  canManageCollaborators: boolean;
  completionSummary: ProjectCompletionSummary;
  completionWorkflow: ProjectCompletionWorkflowRecord | null;
};

type PendingFile = {
  id: string;
  file: File;
  assetType?: UploadAssetType;
};

type UploadProgressState = "pending" | "uploading" | "uploaded" | "error";

type DisplayAttachmentRecord = ProjectAttachmentRecord & {
  uploadState?: UploadProgressState;
  progress?: number;
  errorMessage?: string;
};

type DisplayChatEntry = ProjectChatEntry & {
  attachments?: DisplayAttachmentRecord[];
  isOptimistic?: boolean;
  serverEntryId?: string;
};

type RevisionReviewState = "PENDING_REVIEW" | "APPROVED" | "REJECTED";

type TranslateApiResponse = {
  sourceLanguageCode: string;
  sourceLanguageName: string;
  targetLanguageCode: string;
  translatedText: string;
  error?: string;
};

type TranscribeApiResponse = {
  detectedSourceLanguage: string;
  detectedSourceLanguageCode: string;
  transcriptOriginal: string;
  translatedText: string;
  targetLanguageCode: string;
  error?: string;
};

type UploadAssetType =
  | "REVISION_ORIGINAL"
  | "COMMENT_ATTACHMENT"
  | "STAGE_SUBMISSION";
type CommentUploadIntent = "COMMENT_ATTACHMENT" | "STAGE_SUBMISSION";
const MAX_RECORDING_DURATION_MS = 60_000;
const submissionExtensions = new Set(["png", "jpg", "jpeg", "webp"]);
const submissionMimeTypes = new Set(["image/png", "image/jpeg", "image/webp"]);
const submissionDropzoneAccept = {
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/webp": [".webp"],
};

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

function isSubmissionFile(file: File) {
  const extension = file.name.split(".").at(-1)?.toLowerCase() ?? "";
  return submissionMimeTypes.has(file.type) || submissionExtensions.has(extension);
}

type UploadIntentDropzoneProps = {
  intent: CommentUploadIntent;
  disabled?: boolean;
  onFilesSelected: (files: File[]) => void;
  onError: (message: string) => void;
};

function UploadIntentDropzone({
  intent,
  disabled = false,
  onFilesSelected,
  onError,
}: UploadIntentDropzoneProps) {
  const dropzoneAccept =
    intent === "STAGE_SUBMISSION" ? submissionDropzoneAccept : undefined;

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    multiple: true,
    disabled,
    noClick: true,
    noKeyboard: true,
    accept: dropzoneAccept,
    onDrop: (acceptedFiles) => {
      if (acceptedFiles.length > 0) {
        onFilesSelected(acceptedFiles);
      }
    },
    onDropRejected: () => {
      if (intent === "STAGE_SUBMISSION") {
        onError("Submissions must be image files because they are used for comparison.");
        return;
      }

      onError("Unable to add one or more selected files. Please try different files.");
    },
  });

  return (
    <div
      {...getRootProps()}
      className={`min-h-[112px] rounded-[18px] border border-dashed px-4 py-6 text-center transition ${
        isDragActive
          ? "border-brand bg-[#eef7ef]"
          : "border-[#bfcbbf] bg-[#fbfdfb] hover:border-brand hover:bg-[#f4fbf5]"
      } ${disabled ? "pointer-events-none opacity-60" : ""}`}
    >
      <input {...getInputProps()} />

      <Upload className="mx-auto h-5 w-5 text-brand" />

      <p className="mt-3 text-[14px] font-[700] text-brand">
        {isDragActive ? "Drop files here" : "Drag files here"}
      </p>

      <p className="mt-1 text-[11px] text-[#7a837b]">
        {intent === "STAGE_SUBMISSION"
          ? "PNG, JPG, JPEG, or WebP only."
          : "Choose one or more files to attach to the chat discussion."}
      </p>

      <Button
        type="button"
        size="sm"
        className="mt-4 rounded-full text-[12px]"
        disabled={disabled}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          open();
        }}
      >
        Choose files
      </Button>
    </div>
  );
}
function getInitials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function getLocalFileTypeLabel(fileName: string) {
  const extension = fileName.split(".").pop()?.toUpperCase();
  return extension && extension.length <= 5 ? extension : "FILE";
}

function getLocalFileExtension(fileName: string) {
  const parts = fileName.split(".");

  if (parts.length < 2) {
    return "";
  }

  return parts.at(-1)?.toLowerCase() ?? "";
}

function formatLocalStageDateTime(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

function formatLocalFileSize(fileSize: number) {
  if (fileSize >= 1024 * 1024) {
    return `${(fileSize / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (fileSize >= 1024) {
    return `${(fileSize / 1024).toFixed(1)} KB`;
  }

  return `${fileSize} B`;
}

function getArchiveFileNameError(
  originalFileName: string,
  nextFileName: string,
  otherFileNames: string[],
) {
  const trimmedName = nextFileName.trim();

  if (!trimmedName) {
    return "Archive file name is required.";
  }

  const originalExtension = getLocalFileExtension(originalFileName);
  const nextExtension = getLocalFileExtension(trimmedName);

  if (originalExtension && nextExtension !== originalExtension) {
    return `Keep the .${originalExtension} extension for this file.`;
  }

  if (!originalExtension && nextExtension) {
    return "Use the original file extension format for this archive file.";
  }

  if (
    otherFileNames.some(
      (candidate) => candidate.trim().toLowerCase() === trimmedName.toLowerCase(),
    )
  ) {
    return "Archive file names must be unique within this project archive.";
  }

  return null;
}

function uploadFileToS3WithProgress(input: {
  uploadUrl: string;
  file: File;
  fileIndex?: number;
  fileCount?: number;
  assetType: UploadAssetType;
  onProgress?: (progress: number) => void;
}) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();

    request.open("PUT", input.uploadUrl, true);
    request.setRequestHeader(
      "Content-Type",
      input.file.type || "application/octet-stream",
    );

    request.upload.addEventListener("progress", (event) => {
      if (!event.lengthComputable) {
        return;
      }

      const progress = Math.round((event.loaded / event.total) * 100);
      input.onProgress?.(progress);
    });

    request.addEventListener("load", () => {
      if (request.status >= 200 && request.status < 300) {
        input.onProgress?.(100);
        resolve();
        return;
      }

      reject(new Error(`Upload failed with status ${request.status}.`));
    });

    request.addEventListener("error", () => {
      reject(new Error("Upload failed due to a network error."));
    });

    request.addEventListener("abort", () => {
      reject(new Error("Upload was cancelled."));
    });

    request.send(input.file);
  });
}

function getRevisionEntryId(
  entry: Pick<DisplayChatEntry, "id" | "kind" | "revisionId" | "serverEntryId">,
) {
  if (entry.kind !== "revision") {
    return entry.id;
  }

  return entry.revisionId ?? entry.serverEntryId ?? entry.id;
}

function getRevisionStatusMeta(status: RevisionReviewState) {
  switch (status) {
    case "APPROVED":
      return {
        label: "Completed",
        badgeClassName: "bg-[#edf7ef] text-[#2b8b56]",
      };
    case "REJECTED":
      return {
        label: "Revision Requested",
        badgeClassName: "bg-[#fff0ef] text-[#c14f46]",
      };
    default:
      return {
        label: "Pending Review",
        badgeClassName: "bg-[#fff8eb] text-[#b77420]",
      };
  }
}

function AttachmentHistoryList({
  attachments,
  compact = false,
  actionsDisabled = false,
}: {
  attachments: DisplayAttachmentRecord[];
  compact?: boolean;
  actionsDisabled?: boolean;
}) {
  if (attachments.length === 0) {
    return null;
  }

  return (
    <div className={compact ? "mt-3 space-y-2" : "mt-3 space-y-2.5"}>
      {attachments.map((attachment) => (
        (() => {
          const effectiveSubmissionStatus = attachment.isSubmission
            ? (attachment.submissionReviewStatus ?? "PENDING_REVIEW")
            : null;

          return (
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
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-[12px] font-[700] text-[#111712]">
                      {attachment.originalFileName}
                    </p>
                    {attachment.uploadState ? (
                      <span
                        className={`inline-flex shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[9px] font-[800] uppercase tracking-[0.08em] leading-none ${
                          attachment.uploadState === "error"
                            ? "bg-[#fff0ef] text-[#c14f46]"
                            : attachment.uploadState === "uploaded"
                              ? "bg-[#edf7ef] text-[#2b8b56]"
                              : "bg-[#f4f7f4] text-[#566259]"
                        }`}
                      >
                        {attachment.uploadState === "error"
                          ? "Failed"
                          : attachment.uploadState === "uploaded"
                            ? "Uploaded"
                            : "Uploading"}
                      </span>
                    ) : null}
                    {attachment.isSubmission ? (
                      <span className="inline-flex shrink-0 whitespace-nowrap rounded-full bg-[#edf7ef] px-2 py-0.5 text-[9px] font-[800] uppercase tracking-[0.08em] leading-none text-[#2b8b56]">
                        {attachment.submissionNumber
                          ? `Submission ${attachment.submissionNumber}`
                          : "Submission"}
                      </span>
                    ) : null}
                    {attachment.isSubmission && !attachment.uploadState ? (
                      <span
                        className={`inline-flex shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[9px] font-[800] uppercase tracking-[0.08em] leading-none ${
                          effectiveSubmissionStatus === "APPROVED"
                            ? "bg-[#edf7ef] text-[#2b8b56]"
                            : effectiveSubmissionStatus === "REJECTED"
                              ? "bg-[#fff0ef] text-[#c14f46]"
                              : "bg-[#fff8eb] text-[#b77420]"
                        }`}
                      >
                        {effectiveSubmissionStatus === "APPROVED"
                          ? "Completed"
                          : effectiveSubmissionStatus === "REJECTED"
                            ? "Revision Requested"
                            : "Pending Review"}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-[10px] leading-4 text-[#6c756e]">
                    {attachment.uploadState
                      ? attachment.uploadState === "error"
                        ? attachment.errorMessage || "Upload failed."
                        : attachment.uploadState === "uploaded"
                          ? `${attachment.fileSizeLabel} · Uploaded · Refreshing chat…`
                          : `${attachment.fileSizeLabel} · ${attachment.progress ?? 0}% uploaded`
                      : `${attachment.fileSizeLabel} · Uploaded by ${attachment.uploadedBy}`}
                  </p>
                  <p className="text-[10px] leading-4 text-[#89928b]">{attachment.uploadedAt}</p>
                  {attachment.uploadState && attachment.uploadState !== "error" ? (
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#edf2ed]">
                      <div
                        className="h-full rounded-full bg-[linear-gradient(90deg,#2f8d5d,#123f2d)] transition-[width] duration-200"
                        style={{ width: `${attachment.progress ?? 0}%` }}
                      />
                    </div>
                  ) : null}
                </div>
                {!actionsDisabled &&
                !attachment.uploadState &&
                attachment.previewPath &&
                attachment.downloadPath ? (
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
                ) : null}
              </div>
            </div>
          );
        })()
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
  fileIndex?: number;
  fileCount?: number;
  onProgress?: (progress: number) => void;
}): Promise<{ attachmentId: string }> {
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
    await uploadFileToS3WithProgress({
      uploadUrl: uploadPayload.uploadUrl,
      file: input.file,
      fileIndex: input.fileIndex,
      fileCount: input.fileCount,
      assetType: input.assetType,
      onProgress: input.onProgress,
    });

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

    return {
      attachmentId: uploadPayload.attachmentId,
    };
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
  availableCollaborators,
  currentUserId,
  canManageCollaborators,
  completionSummary,
  completionWorkflow,
}: ProjectChatWorkspaceProps) {
  const router = useRouter();
  const [collaborators, setCollaborators] = useState<ProjectCollaboratorRecord[]>(
    project.collaborators,
  );
  const [availableCollaboratorRecords, setAvailableCollaboratorRecords] =
    useState<CollaboratorRecord[]>(availableCollaborators);
  const [draft, setDraft] = useState("");
  const [composerError, setComposerError] = useState<string | null>(null);
  const [pendingCommentFiles, setPendingCommentFiles] = useState<PendingFile[]>([]);
  const [optimisticComments, setOptimisticComments] = useState<DisplayChatEntry[]>([]);
  const [confirmedComments, setConfirmedComments] = useState<DisplayChatEntry[]>([]);
  const [pendingRevisionReviewId, setPendingRevisionReviewId] = useState<string | null>(null);
  const [revisionReviewOverrides, setRevisionReviewOverrides] = useState<
    Record<string, { status: RevisionReviewState; rejectionReason: string | null }>
  >({});
  const [pendingRevisionFiles, setPendingRevisionFiles] = useState<PendingFile[]>([]);
  const [reviewRevisionId, setReviewRevisionId] = useState<string | null>(null);
  const [reviewRejectMode, setReviewRejectMode] = useState(false);
  const [reviewRejectReason, setReviewRejectReason] = useState("");
  const [reviewDialogError, setReviewDialogError] = useState<string | null>(null);
  const [commentUploadDialogOpen, setCommentUploadDialogOpen] = useState(false);
  const [commentUploadIntent, setCommentUploadIntent] =
    useState<CommentUploadIntent>("COMMENT_ATTACHMENT");
  const [isSendingComment, setIsSendingComment] = useState(false);
  const [isUploadingRevision, setIsUploadingRevision] = useState(false);
  const [selectedOutputLanguageCode, setSelectedOutputLanguageCode] = useState(
    DEFAULT_CHAT_LANGUAGE.code,
  );
  const [isTranslating, setIsTranslating] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [aiStatus, setAiStatus] = useState<string | null>(null);
  const [revisionDialogOpen, setRevisionDialogOpen] = useState(false);
  const [revisionSummary, setRevisionSummary] = useState("");
  const [revisionDialogError, setRevisionDialogError] = useState<string | null>(null);
  const [stageCompleteDialogOpen, setStageCompleteDialogOpen] = useState(false);
  const [stageCompleteError, setStageCompleteError] = useState<string | null>(null);
  const [isMarkingStageComplete, setIsMarkingStageComplete] = useState(false);
  const [acceptBriefDialogOpen, setAcceptBriefDialogOpen] = useState(false);
  const [acceptBriefError, setAcceptBriefError] = useState<string | null>(null);
  const [isAcceptingBrief, setIsAcceptingBrief] = useState(false);
  const [stageCardOverrides, setStageCardOverrides] = useState<
    Record<
      string,
      {
        actualStartedAt: string;
        actualStartedAtValue: string | null;
        status?: ProjectStageRecord["status"];
      }
    >
  >({});
  const [completionPrompt, setCompletionPrompt] = useState<{
    nextStageId: string | null;
    nextStageLabel: string | null;
    allStagesCompleted: boolean;
  } | null>(null);
  const [reviewCompleteDialogOpen, setReviewCompleteDialogOpen] = useState(false);
  const [collaboratorPickerOpen, setCollaboratorPickerOpen] = useState(false);
  const [collaboratorDialogOpen, setCollaboratorDialogOpen] = useState(false);
  const [collaboratorSaving, setCollaboratorSaving] = useState(false);
  const [collaboratorDialogError, setCollaboratorDialogError] = useState<string>();
  const [completionOverrides, setCompletionOverrides] =
    useState<Partial<ProjectCompletionSummary> | null>(null);
  const [projectCompletionConfirmOpen, setProjectCompletionConfirmOpen] = useState(false);
  const [projectCompletionError, setProjectCompletionError] = useState<string | null>(null);
  const [isPreparingProjectCompletion, setIsPreparingProjectCompletion] = useState(false);
  const [archivePreparation, setArchivePreparation] =
    useState<ProjectArchivePreparation | null>(null);
  const [archiveFileNames, setArchiveFileNames] = useState<Record<string, string>>({});
  const [archiveFileErrors, setArchiveFileErrors] = useState<Record<string, string>>({});
  const [archiveCategorySlug, setArchiveCategorySlug] = useState<string>("");
  const [archiveCompletionError, setArchiveCompletionError] = useState<string | null>(null);
  const [isCompletingProject, setIsCompletingProject] = useState(false);
  const [, startRefresh] = useTransition();
  const revisionFileInputRef = useRef<HTMLInputElement | null>(null);
  const commentAttachmentInputRef = useRef<HTMLInputElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimeoutRef = useRef<number | null>(null);
  const [collaboratorForm, setCollaboratorForm] = useState<CollaboratorForm>({
    name: "",
    email: "",
    type: "Internal",
    permissions: {
      project: "none",
      calendar: "none",
      library: "none",
      archive: "none",
    },
  });
  const messages = history.entries;
  const completionState = completionOverrides
    ? { ...completionSummary, ...completionOverrides }
    : completionSummary;
  const stageCards = useMemo(
    () =>
      project.stageCards.map((stage) => {
        const override = stageCardOverrides[stage.id];

        return override
          ? {
              ...stage,
              actualStartedAt: override.actualStartedAt,
              actualStartedAtValue: override.actualStartedAtValue,
            }
          : stage;
      }),
    [project.stageCards, stageCardOverrides],
  );
  const serverMessageIds = useMemo(
    () => new Set(messages.map((entry) => entry.id)),
    [messages],
  );
  const visibleOptimisticComments = useMemo(
    () =>
      optimisticComments.filter((entry) => {
        if (!entry.serverEntryId || !serverMessageIds.has(entry.serverEntryId)) {
          return true;
        }

        return (
          entry.attachments?.some(
            (attachment: DisplayAttachmentRecord) =>
              attachment.uploadState === "pending" || attachment.uploadState === "uploading",
          ) ?? false
        );
      }),
    [optimisticComments, serverMessageIds],
  );
  const visibleConfirmedComments = useMemo(
    () =>
      confirmedComments.filter(
        (entry) => !entry.serverEntryId || !serverMessageIds.has(entry.serverEntryId),
      ),
    [confirmedComments, serverMessageIds],
  );
  const serverEntryIdsWithLocalOverrides = useMemo(
    () =>
      new Set(
        [...visibleOptimisticComments, ...visibleConfirmedComments]
          .map((entry) => entry.serverEntryId)
          .filter((entryId): entryId is string => Boolean(entryId)),
      ),
    [visibleConfirmedComments, visibleOptimisticComments],
  );
  const displayedMessages = useMemo(
    () => [
      ...visibleOptimisticComments,
      ...visibleConfirmedComments,
      ...messages.filter((message) => !serverEntryIdsWithLocalOverrides.has(message.id)),
    ],
    [
      messages,
      serverEntryIdsWithLocalOverrides,
      visibleConfirmedComments,
      visibleOptimisticComments,
    ],
  );
  const stageSubmissions = useMemo(
    () =>
      getStageSubmissionAttachments(displayedMessages).filter(
        (attachment) =>
          !("uploadState" in attachment) || attachment.uploadState === "uploaded",
      ),
    [displayedMessages],
  );
  const canCompareSubmissions = stageSubmissions.length >= 2;
  const canSendComment = draft.trim().length > 0 || pendingCommentFiles.length > 0;
  const firstRevisionIndex = useMemo(
    () => displayedMessages.findIndex((entry) => entry.kind === "revision"),
    [displayedMessages],
  );

  const activeStage = useMemo<ProjectStageRecord | undefined>(() => {
    if (!stageId) {
      return (
        stageCards.find((stage) => stage.id === project.currentStageId) ??
        stageCards[0]
      );
    }

    return stageCards.find((stage) => stage.id === stageId) ?? stageCards[0];
  }, [project.currentStageId, stageCards, stageId]);
  const selectedCollaboratorIds = useMemo(
    () =>
      collaborators
        .filter((collaborator) => collaborator.access !== "owner")
        .map((collaborator) => collaborator.id),
    [collaborators],
  );
  const isProjectOwner = useMemo(
    () =>
      project.collaborators.some(
        (collaborator) =>
          collaborator.access === "owner" && collaborator.id === currentUserId,
      ),
    [currentUserId, project.collaborators],
  );
  const isProjectCompleted = completionState.isCompleted;
  const isFinalStage =
    Boolean(activeStage?.id) && activeStage?.id === completionState.finalStageId;
  const canCompleteProject =
    completionState.canCompleteProject && isProjectOwner && !isProjectCompleted;
  const isStageCompleted = isProjectCompleted || activeStage?.status === "completed";
  const isProjectExecutor = project.executorUserId === currentUserId;
  const hasAcceptedBrief = Boolean(activeStage?.actualStartedAtValue);
  const canReviewSubmissions = project.ownerId === currentUserId;
  const stageExecutionStatus = isStageCompleted
    ? "Completed"
    : hasAcceptedBrief
      ? "In progress"
      : "Waiting for executor";
  const hasRevisionEntries = displayedMessages.some((message) => message.kind === "revision");
  const selectedOutputLanguage =
    getSupportedLanguageByCode(selectedOutputLanguageCode) ?? DEFAULT_CHAT_LANGUAGE;
  const currentUserDisplayName = useMemo(() => {
    const collaborator = project.collaborators.find(
      (candidate) => candidate.id === currentUserId,
    );

    return collaborator?.name || "You";
  }, [currentUserId, project.collaborators]);
  const currentUserRoleLabel = useMemo(() => {
    const collaborator = project.collaborators.find(
      (candidate) => candidate.id === currentUserId,
    );

    if (!collaborator) {
      return "Internal Team";
    }

    return collaborator.group === "external" ? "External Collaborator" : "Internal Team";
  }, [currentUserId, project.collaborators]);
  const reviewRevisionMessage = useMemo(
    () =>
      reviewRevisionId
        ? displayedMessages.find(
            (entry) =>
              entry.kind === "revision" && getRevisionEntryId(entry) === reviewRevisionId,
          )
        : undefined,
    [displayedMessages, reviewRevisionId],
  );
  const reviewCompletionIsFinalStage =
    Boolean(activeStage?.id) && activeStage?.id === completionState.finalStageId;

  useEffect(() => {
    return () => {
      if (recordingTimeoutRef.current) {
        window.clearTimeout(recordingTimeoutRef.current);
      }

      mediaRecorderRef.current?.stream.getTracks().forEach((track) => track.stop());
      mediaRecorderRef.current = null;
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    };
  }, []);

  function applyUpdatedCollaborators(updatedCollaborators: ProjectCollaboratorRecord[]) {
    setCollaborators((current) => {
      const owner = current.find((collaborator) => collaborator.access === "owner");
      return owner ? [owner, ...updatedCollaborators] : updatedCollaborators;
    });
  }

  async function removeCollaborator(id: string) {
    setCollaboratorSaving(true);
    setCollaboratorDialogError(undefined);

    try {
      const result = await removeProjectCollaboratorAction(project.id, id);

      if ("error" in result) {
        throw new Error(result.error);
      }

      applyUpdatedCollaborators(result.collaborators);
      showSuccessToast("Collaborator removed successfully.");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to remove the collaborator right now.";
      setCollaboratorDialogError(message);
      showErrorToast("Unable to remove collaborator.", message);
    } finally {
      setCollaboratorSaving(false);
    }
  }

  async function handleCollaboratorChatVisibilityToggle(
    collaboratorId: string,
    paused: boolean,
  ) {
    setCollaboratorSaving(true);
    setCollaboratorDialogError(undefined);

    try {
      const result = await setProjectCollaboratorChatVisibilityAction({
        projectId: project.id,
        collaboratorId,
        paused,
      });

      if ("error" in result) {
        throw new Error(result.error);
      }

      applyUpdatedCollaborators(result.collaborators);
      showSuccessToast(
        paused ? "Chat visibility paused." : "Chat visibility resumed.",
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to update collaborator chat visibility right now.";
      setCollaboratorDialogError(message);
      showErrorToast(
        paused ? "Unable to pause chat visibility." : "Unable to resume chat visibility.",
        message,
      );
    } finally {
      setCollaboratorSaving(false);
    }
  }

  function setCollaboratorFormValue<K extends keyof CollaboratorForm>(
    field: K,
    value: CollaboratorForm[K],
  ) {
    setCollaboratorForm((current) => ({ ...current, [field]: value }));
  }

  function setCollaboratorPermissionValue(
    area: keyof CollaboratorForm["permissions"],
    value: CollaboratorForm["permissions"][keyof CollaboratorForm["permissions"]],
  ) {
    setCollaboratorForm((current) => ({
      ...current,
      permissions: { ...current.permissions, [area]: value },
    }));
  }

  function openCollaboratorInvite() {
    setCollaboratorPickerOpen(false);
    setCollaboratorForm({
      name: "",
      email: "",
      type: "Internal",
      permissions: {
        project: "none",
        calendar: "none",
        library: "none",
        archive: "none",
      },
    });
    setCollaboratorDialogError(undefined);
    setCollaboratorDialogOpen(true);
  }

  function toggleAssignedCollaborator(collaboratorId: string) {
    const availableCollaborator = availableCollaboratorRecords.find(
      (collaborator) => collaborator.id === collaboratorId,
    );

    if (!availableCollaborator) {
      return;
    }

    setCollaborators((current) => {
      const exists = current.some((collaborator) => collaborator.id === collaboratorId);

      if (exists) {
        return current.filter((collaborator) => collaborator.id !== collaboratorId);
      }

      return [
        ...current,
        {
          id: availableCollaborator.id,
          name: availableCollaborator.name,
          email: availableCollaborator.email,
          role:
            availableCollaborator.type === "External"
              ? "External Collaborator"
              : "Collaborator",
          group: availableCollaborator.type === "External" ? "external" : "internal",
          participantType: getDefaultProjectCollaboratorParticipantType(
            availableCollaborator.type === "External" ? "external" : "internal",
          ),
          chatVisibilityPaused: false,
          access: "view",
          removable: true,
        },
      ];
    });
  }

  async function applyCollaboratorsSelection() {
    setCollaboratorSaving(true);

    try {
      const result = await saveProjectCollaboratorsAction(
        project.id,
        collaborators
          .filter((collaborator) => collaborator.access !== "owner")
          .map((collaborator) => ({
            id: collaborator.id,
            participantType: collaborator.participantType,
          })),
      );

      if ("error" in result) {
        setCollaboratorDialogError(result.error);
        showErrorToast("Unable to update collaborators.", result.error);
        return;
      }

      applyUpdatedCollaborators(result.collaborators);
      setCollaboratorPickerOpen(false);
      setCollaboratorDialogError(undefined);
      showSuccessToast("Project collaborators updated successfully.");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to update project collaborators right now.";
      setCollaboratorDialogError(message);
      showErrorToast("Unable to update collaborators.", message);
    } finally {
      setCollaboratorSaving(false);
    }
  }

  async function handleCollaboratorInvite() {
    if (!collaboratorForm.name.trim() || !collaboratorForm.email.trim()) {
      setCollaboratorDialogError("Enter both collaborator name and email.");
      return;
    }

    setCollaboratorSaving(true);
    setCollaboratorDialogError(undefined);

    try {
      const inviteResult = await saveCollaboratorAction({
        ...collaboratorForm,
      });

      if ("error" in inviteResult) {
        setCollaboratorDialogError(inviteResult.error);
        showErrorToast("Unable to add collaborator.", inviteResult.error);
        return;
      }

      setAvailableCollaboratorRecords((current) => [
        ...current,
        inviteResult.collaborator,
      ]);

      const saveResult = await saveProjectCollaboratorsAction(project.id, [
        ...collaborators
          .filter((collaborator) => collaborator.access !== "owner")
          .map((collaborator) => ({
            id: collaborator.id,
            participantType: collaborator.participantType,
          })),
        {
          id: inviteResult.collaborator.id,
          participantType: getDefaultProjectCollaboratorParticipantType(
            inviteResult.collaborator.type === "External" ? "external" : "internal",
          ),
        },
      ]);

      if ("error" in saveResult) {
        setCollaboratorDialogError(saveResult.error);
        showErrorToast("Unable to add collaborator.", saveResult.error);
        return;
      }

      applyUpdatedCollaborators(saveResult.collaborators);
      setCollaboratorDialogOpen(false);
      showSuccessToast("Collaborator added successfully.");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to save the collaborator right now. Please try again.";
      setCollaboratorDialogError(message);
      showErrorToast("Unable to add collaborator.", message);
    } finally {
      setCollaboratorSaving(false);
    }
  }

  async function handleCollaboratorParticipantTypeChange(
    collaboratorId: string,
    participantType: ProjectCollaboratorParticipantType,
  ) {
    const nextCollaborators = collaborators.map((collaborator) =>
      collaborator.id === collaboratorId
        ? { ...collaborator, participantType }
        : collaborator,
    );

    setCollaborators(nextCollaborators);
    setCollaboratorSaving(true);
    setCollaboratorDialogError(undefined);

    try {
      const result = await saveProjectCollaboratorsAction(
        project.id,
        nextCollaborators
          .filter((collaborator) => collaborator.access !== "owner")
          .map((collaborator) => ({
            id: collaborator.id,
            participantType: collaborator.participantType,
          })),
      );

      if ("error" in result) {
        setCollaboratorDialogError(result.error);
        showErrorToast("Unable to update collaborator type.", result.error);
        refreshHistory();
        return;
      }

      applyUpdatedCollaborators(result.collaborators);
      showSuccessToast("Collaborator type updated successfully.");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to update collaborator type right now.";
      setCollaboratorDialogError(message);
      showErrorToast("Unable to update collaborator type.", message);
    } finally {
      setCollaboratorSaving(false);
    }
  }

  function refreshHistory() {
    startRefresh(() => {
      router.refresh();
    });
  }

  function resetProjectCompletionFlow() {
    setProjectCompletionError(null);
    setArchiveCompletionError(null);
    setArchivePreparation(null);
    setArchiveFileNames({});
    setArchiveFileErrors({});
    setArchiveCategorySlug("");
    setProjectCompletionConfirmOpen(false);
  }

  function openProjectCompletionConfirm() {
    setProjectCompletionError(null);
    setArchiveCompletionError(null);
    setProjectCompletionConfirmOpen(true);
  }

  function updateArchiveFileName(sourceAttachmentId: string, nextValue: string) {
    setArchiveFileNames((current) => {
      const nextNames = {
        ...current,
        [sourceAttachmentId]: nextValue,
      };

      if (archivePreparation) {
        const file = archivePreparation.files.find(
          (candidate) => candidate.sourceAttachmentId === sourceAttachmentId,
        );

        if (file) {
          const otherNames = archivePreparation.files
            .filter((candidate) => candidate.sourceAttachmentId !== sourceAttachmentId)
            .map(
              (candidate) =>
                nextNames[candidate.sourceAttachmentId] ?? candidate.defaultArchiveFileName,
            );
          const nextError = getArchiveFileNameError(
            file.originalFileName,
            nextValue,
            otherNames,
          );

          setArchiveFileErrors((currentErrors) => ({
            ...currentErrors,
            [sourceAttachmentId]: nextError ?? "",
          }));
        }
      }

      return nextNames;
    });
  }

  async function handlePrepareProjectCompletion() {
    const activeStageId = activeStage?.id;

    if (!activeStageId) {
      setProjectCompletionError("This project does not have an active stage.");
      return;
    }

    setProjectCompletionError(null);
    setArchiveCompletionError(null);
    setIsPreparingProjectCompletion(true);

    try {
      const result = await prepareProjectCompletionAction({
        projectId: project.id,
        stageId: activeStageId,
      });

      if ("error" in result) {
        throw new Error(result.error);
      }

      setArchivePreparation(result.preparation);
      setArchiveCategorySlug(result.preparation.selectedCategorySlug);
      setArchiveFileNames(
        Object.fromEntries(
          result.preparation.files.map((file) => [
            file.sourceAttachmentId,
            file.defaultArchiveFileName,
          ]),
        ),
      );
      setArchiveFileErrors({});
      setProjectCompletionConfirmOpen(false);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to prepare the archive files right now.";
      setProjectCompletionError(message);
      showErrorToast("Unable to prepare project archive.", message);
    } finally {
      setIsPreparingProjectCompletion(false);
    }
  }

  async function handleCompleteProjectArchive() {
    if (!archivePreparation) {
      return;
    }

    const nextErrors = archivePreparation.files.reduce<Record<string, string>>(
      (current, file) => {
        const nextName =
          archiveFileNames[file.sourceAttachmentId] ?? file.defaultArchiveFileName;
        const otherNames = archivePreparation.files
          .filter((candidate) => candidate.sourceAttachmentId !== file.sourceAttachmentId)
          .map(
            (candidate) =>
              archiveFileNames[candidate.sourceAttachmentId] ??
              candidate.defaultArchiveFileName,
          );
        const error = getArchiveFileNameError(
          file.originalFileName,
          nextName,
          otherNames,
        );

        current[file.sourceAttachmentId] = error ?? "";
        return current;
      },
      {},
    );

    setArchiveFileErrors(nextErrors);

    if (Object.values(nextErrors).some(Boolean)) {
      setArchiveCompletionError("Fix the archive file names before continuing.");
      return;
    }

    setArchiveCompletionError(null);
    setIsCompletingProject(true);

    try {
      const result = await completeProjectArchiveAction({
        projectId: archivePreparation.projectId,
        stageId: archivePreparation.finalStageId,
        archiveCategorySlug,
        files: archivePreparation.files.map((file) => ({
          sourceAttachmentId: file.sourceAttachmentId,
          finalArchiveFileName:
            archiveFileNames[file.sourceAttachmentId] ?? file.defaultArchiveFileName,
        })),
      });

      if ("error" in result) {
        throw new Error(result.error);
      }

      setCompletionOverrides((current) => ({
        ...(current ?? {}),
        isCompleted: true,
        canCompleteProject: false,
      }));
      resetProjectCompletionFlow();
      showSuccessToast("Project completed and files archived.");
      refreshHistory();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to complete and archive the project right now.";
      setArchiveCompletionError(message);
      showErrorToast("Archive failed.", message);
    } finally {
      setIsCompletingProject(false);
    }
  }

  function closeRevisionReviewDialog() {
    setPendingRevisionReviewId(null);
    setReviewRevisionId(null);
    setReviewCompleteDialogOpen(false);
    setReviewRejectMode(false);
    setReviewRejectReason("");
    setReviewDialogError(null);
  }

  function updateOptimisticAttachment(
    commentId: string,
    attachmentId: string,
    updater: (attachment: DisplayAttachmentRecord) => DisplayAttachmentRecord,
  ) {
    setOptimisticComments((current) =>
      current.map((entry) =>
        entry.id === commentId
          ? {
              ...entry,
              attachments: entry.attachments?.map((attachment: DisplayAttachmentRecord) =>
                attachment.id === attachmentId ? updater(attachment) : attachment,
              ),
            }
          : entry,
      ),
    );
  }

  function updateOptimisticComment(
    commentId: string,
    updater: (entry: DisplayChatEntry) => DisplayChatEntry,
  ) {
    setOptimisticComments((current) =>
      current.map((entry) => (entry.id === commentId ? updater(entry) : entry)),
    );
  }

  function clearRecorderResources() {
    if (recordingTimeoutRef.current) {
      window.clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = null;
    }

    mediaRecorderRef.current?.stream.getTracks().forEach((track) => track.stop());
    mediaRecorderRef.current = null;
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    audioChunksRef.current = [];
  }

  async function handleTranslateDraft() {
    if (!draft.trim()) {
      setComposerError("Enter a message to translate.");
      return;
    }

    setComposerError(null);
    setAiStatus("Translating…");
    setIsTranslating(true);

    try {
      const response = await fetch("/api/ai/translate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: draft,
          targetLanguageCode: selectedOutputLanguage.code,
          targetLanguageName: selectedOutputLanguage.name,
        }),
      });

      const payload = (await response.json()) as TranslateApiResponse;

      if (!response.ok || !payload.translatedText) {
        throw new Error(payload.error || "Unable to translate the message right now.");
      }

      setDraft(payload.translatedText);
    } catch (error) {
      setComposerError(
        error instanceof Error
          ? error.message
          : "Unable to translate the message right now.",
      );
    } finally {
      setIsTranslating(false);
      setAiStatus(null);
    }
  }

  function getRecordingMimeType() {
    if (typeof MediaRecorder === "undefined") {
      return "";
    }

    const preferredTypes = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4",
      "audio/ogg;codecs=opus",
    ];

    return (
      preferredTypes.find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) ?? ""
    );
  }

  async function handleRecordedAudio(blob: Blob) {
    const extension = blob.type.includes("mp4")
      ? "m4a"
      : blob.type.includes("ogg")
        ? "ogg"
        : "webm";
    const audioFile = new File([blob], `stage-chat-${Date.now()}.${extension}`, {
      type: blob.type || "audio/webm",
    });

    setIsTranscribing(true);
    setAiStatus("Transcribing…");
    setComposerError(null);

    try {
      const formData = new FormData();
      formData.append("audio", audioFile);
      formData.append("targetLanguageCode", selectedOutputLanguage.code);
      formData.append("targetLanguageName", selectedOutputLanguage.name);

      const response = await fetch("/api/ai/transcribe", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json()) as TranscribeApiResponse;

      if (!response.ok || !payload.translatedText) {
        throw new Error(payload.error || "Unable to transcribe the recording right now.");
      }

      setDraft((current) =>
        current.trim() ? `${current.trim()}\n${payload.translatedText}` : payload.translatedText,
      );
    } catch (error) {
      setComposerError(
        error instanceof Error
          ? error.message
          : "Unable to transcribe the recording right now.",
      );
    } finally {
      setIsTranscribing(false);
      setAiStatus(null);
    }
  }

  async function handleMicrophoneToggle() {
    if (isTranscribing || isTranslating) {
      return;
    }

    if (isListening) {
      setAiStatus("Transcribing…");
      mediaRecorderRef.current?.stop();
      return;
    }

    if (
      typeof window === "undefined" ||
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setComposerError(
        "Voice input is not supported in this browser. Try Chrome, Edge, or Safari with microphone access enabled.",
      );
      return;
    }

    try {
      setComposerError(null);
      setAiStatus("Requesting microphone…");

      if ("permissions" in navigator && navigator.permissions?.query) {
        try {
          const permissionStatus = await navigator.permissions.query({
            name: "microphone" as PermissionName,
          });

          if (permissionStatus.state === "denied") {
            setAiStatus(null);
            setComposerError(
              "Microphone permission is blocked in the browser. Allow microphone access in site settings and try again.",
            );
            return;
          }
        } catch {
          // Permission query support varies by browser. Continue to getUserMedia.
        }
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = getRecordingMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      mediaStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      setAiStatus("Listening…");
      setIsListening(true);

      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      });

      recorder.addEventListener("stop", () => {
        setIsListening(false);
        const audioBlob = new Blob(audioChunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        clearRecorderResources();

        if (!audioBlob.size) {
          setAiStatus(null);
          setComposerError("No speech was captured. Please try again.");
          return;
        }

        void handleRecordedAudio(audioBlob);
      });

      try {
        recorder.start();
      } catch (error) {
        clearRecorderResources();
        setIsListening(false);
        setAiStatus(null);
        setComposerError(
          error instanceof Error
            ? error.message
            : "Unable to start microphone recording right now.",
        );
        return;
      }

      recordingTimeoutRef.current = window.setTimeout(() => {
        if (mediaRecorderRef.current?.state === "recording") {
          setAiStatus("Transcribing…");
          mediaRecorderRef.current.stop();
        }
      }, MAX_RECORDING_DURATION_MS);
    } catch (error) {
      setIsListening(false);
      setAiStatus(null);
      clearRecorderResources();
      setComposerError(
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "Microphone permission was denied."
          : error instanceof DOMException && error.name === "NotFoundError"
            ? "No microphone was found on this device."
            : error instanceof DOMException && error.name === "NotReadableError"
              ? "The microphone is already being used by another application."
          : "Unable to access the microphone right now.",
      );
    }
  }

  function openRevisionDialog() {
    if (isProjectCompleted) {
      const message = "This project has already been completed.";
      setComposerError(message);
      showErrorToast("Unable to submit work.", message);
      return;
    }

    if (isStageCompleted) {
      const message = "This stage is already completed.";
      setComposerError(message);
      showErrorToast("Unable to submit work.", message);
      return;
    }

    if (!hasAcceptedBrief) {
      const message = "Please accept the brief before submitting work.";
      setComposerError(message);
      showErrorToast("Unable to submit work.", message);
      return;
    }

    setRevisionDialogError(null);
    setRevisionSummary("");
    setPendingRevisionFiles([]);
    setRevisionDialogOpen(true);
  }

  function handleRevisionFilesSelected(files: FileList | null) {
    const selectedFiles = Array.from(files ?? []);

    if (selectedFiles.length === 0) {
      return;
    }

    setRevisionDialogError(null);
    setPendingRevisionFiles((current) => [
      ...current,
      ...selectedFiles.map((file) => ({
        id: `${file.name}-${file.size}-${crypto.randomUUID()}`,
        file,
      })),
    ]);

    if (revisionFileInputRef.current) {
      revisionFileInputRef.current.value = "";
    }
  }

  function removePendingRevisionFile(fileId: string) {
    setPendingRevisionFiles((current) => current.filter((file) => file.id !== fileId));
  }

  function applyStageCompletionLocally(completedStageId: string) {
    const completedStage = stageCards.find((stage) => stage.id === completedStageId);
    const stageIndex = stageCards.findIndex((stage) => stage.id === completedStageId);
    const nextStage = stageIndex >= 0 ? stageCards[stageIndex + 1] ?? null : null;

    setStageCardOverrides((current) => ({
      ...current,
      ...(completedStage
        ? {
            [completedStageId]: {
              ...(current[completedStageId] ?? {}),
              actualStartedAt:
                current[completedStageId]?.actualStartedAt ?? completedStage.actualStartedAt,
              actualStartedAtValue:
                current[completedStageId]?.actualStartedAtValue ??
                completedStage.actualStartedAtValue,
              status: "completed",
            },
          }
        : {}),
      ...(nextStage
        ? {
            [nextStage.id]: {
              ...(current[nextStage.id] ?? {}),
              actualStartedAt:
                current[nextStage.id]?.actualStartedAt ?? nextStage.actualStartedAt,
              actualStartedAtValue:
                current[nextStage.id]?.actualStartedAtValue ?? nextStage.actualStartedAtValue,
              status: nextStage.status === "pending" ? "in-progress" : nextStage.status,
            },
          }
        : {}),
    }));

    setCompletionPrompt({
      nextStageId: nextStage?.id ?? null,
      nextStageLabel: nextStage?.label ?? null,
      allStagesCompleted: !nextStage,
    });
  }

  async function handleMarkStageComplete() {
    const activeStageId = activeStage?.id;

    if (!activeStageId) {
      setStageCompleteError("This project does not have an active stage.");
      return;
    }

    if (isProjectCompleted) {
      setStageCompleteError("This project has already been completed.");
      return;
    }

    setStageCompleteError(null);
    setIsMarkingStageComplete(true);

    try {
      const result = await markStageCompleteAction({
        projectId: project.id,
        stageId: activeStageId,
      });

      if ("error" in result) {
        setStageCompleteError(
          result.error ?? "Unable to mark this stage as complete right now.",
        );
        showErrorToast(
          "Unable to mark stage complete.",
          result.error ?? "Unable to mark this stage as complete right now.",
        );
        return;
      }

      applyStageCompletionLocally(activeStageId);
      setStageCompleteDialogOpen(false);
      showSuccessToast("Stage marked as complete.");
      refreshHistory();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to mark this stage as complete right now.";
      setStageCompleteError(message);
      showErrorToast("Unable to mark stage complete.", message);
    } finally {
      setIsMarkingStageComplete(false);
    }
  }

  async function handleAcceptBrief() {
    const activeStageId = activeStage?.id;

    if (!activeStageId) {
      setAcceptBriefError("This project does not have an active stage.");
      return;
    }

    if (isProjectCompleted) {
      setAcceptBriefError("This project has already been completed.");
      return;
    }

    setAcceptBriefError(null);
    setIsAcceptingBrief(true);

    try {
      const result = await acceptStageBriefAction({
        projectId: project.id,
        stageId: activeStageId,
      });

      if ("error" in result) {
        throw new Error(result.error);
      }

      const startedAtValue = result.result.stage.actualStartedAt
        ? new Date(result.result.stage.actualStartedAt).toISOString()
        : null;
      const startedAtLabel = startedAtValue
        ? formatLocalStageDateTime(startedAtValue)
        : "Just now";

      setStageCardOverrides((current) => ({
        ...current,
        [activeStageId]: {
          actualStartedAt: startedAtLabel,
          actualStartedAtValue: startedAtValue,
        },
      }));
      setConfirmedComments((current) => [
        {
          id: `confirmed-comment-${result.result.activityComment.id}`,
          serverEntryId: result.result.activityComment.id,
          kind: "comment",
          author: currentUserDisplayName,
          role: currentUserRoleLabel,
          body: result.result.activityComment.body,
          createdAt: "Just now",
        },
        ...current,
      ]);
      setAcceptBriefDialogOpen(false);
      showSuccessToast("Brief accepted. Stage timer started.");
      refreshHistory();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to accept the brief right now.";
      setAcceptBriefError(message);
      showErrorToast("Unable to accept brief.", message);
    } finally {
      setIsAcceptingBrief(false);
    }
  }

  function openCommentUploadDialog() {
    if (isProjectCompleted) {
      const message = "This project has already been completed.";
      setComposerError(message);
      showErrorToast("Unable to upload files.", message);
      return;
    }

    setComposerError(null);
    setCommentUploadIntent("COMMENT_ATTACHMENT");

    if (!isProjectExecutor) {
      commentAttachmentInputRef.current?.click();
      return;
    }

    setCommentUploadDialogOpen(true);
  }

  function handleCommentFilesSelected(files: File[] | FileList | null) {
    const selectedFiles = Array.isArray(files) ? files : Array.from(files ?? []);

    if (selectedFiles.length === 0) {
      return;
    }

    if (isProjectCompleted) {
      const message = "This project has already been completed.";
      setComposerError(message);
      showErrorToast("Unable to upload files.", message);
      return;
    }

    const selectedAssetType: CommentUploadIntent = isProjectExecutor
      ? commentUploadIntent
      : "COMMENT_ATTACHMENT";

    if (selectedAssetType === "STAGE_SUBMISSION" && !hasAcceptedBrief) {
      const message = "Please accept the brief before submitting work.";
      setComposerError(message);
      showErrorToast("Unable to submit work.", message);
      return;
    }

    if (selectedAssetType === "STAGE_SUBMISSION" && isStageCompleted) {
      const message = "This stage is already completed.";
      setComposerError(message);
      showErrorToast("Unable to submit work.", message);
      return;
    }

    if (selectedAssetType === "STAGE_SUBMISSION") {
      const invalidFile = selectedFiles.find((file) => !isSubmissionFile(file));

      if (invalidFile) {
        setComposerError(
          "Submissions must be image files because they are used for comparison.",
        );
        return;
      }
    }

    setComposerError(null);
    setPendingCommentFiles((current) => [
      ...current,
      ...selectedFiles.map((file) => ({
        id: `${file.name}-${file.size}-${crypto.randomUUID()}`,
        file,
        assetType: selectedAssetType,
      })),
    ]);
    setCommentUploadDialogOpen(false);
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

    if (isProjectCompleted) {
      setComposerError("This project has already been completed.");
      return;
    }

    setComposerError(null);
    setIsSendingComment(true);
    const optimisticCommentId = `optimistic-comment-${crypto.randomUUID()}`;
    const filesToUpload = [...pendingCommentFiles];
    const startingSubmissionNumber =
      getStageSubmissionAttachments(displayedMessages).filter(
        (attachment) =>
          !("uploadState" in attachment) || attachment.uploadState === "uploaded",
      ).length + 1;

    setOptimisticComments((current) => [
      {
        id: optimisticCommentId,
        kind: "comment",
        author: currentUserDisplayName,
        role: currentUserRoleLabel,
        body: body || "Attachment uploaded.",
        createdAt: "Uploading…",
        isOptimistic: true,
        attachments: filesToUpload.map((pendingFile) => ({
          id: pendingFile.id,
          isSubmission: pendingFile.assetType === "STAGE_SUBMISSION",
          originalFileName: pendingFile.file.name,
          fileTypeLabel: getLocalFileTypeLabel(pendingFile.file.name),
          mimeType: pendingFile.file.type || "application/octet-stream",
          fileSizeLabel: formatLocalFileSize(pendingFile.file.size),
          uploadedBy: currentUserDisplayName,
          uploadedAt: "Uploading…",
          previewPath: "",
          downloadPath: "",
          uploadState: "pending",
          progress: 0,
        })),
      },
      ...current,
    ]);

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

      updateOptimisticComment(optimisticCommentId, (entry) => ({
        ...entry,
        serverEntryId: commentResult.commentId,
      }));

      setDraft("");
      setPendingCommentFiles([]);

      const uploadResults = await Promise.allSettled(
        filesToUpload.map((pendingFile, index) => {
          updateOptimisticAttachment(optimisticCommentId, pendingFile.id, (attachment) => ({
            ...attachment,
            uploadState: "uploading",
            progress: 0,
            uploadedAt: "Uploading…",
          }));

          return uploadAssetFile({
            file: pendingFile.file,
            projectId: project.id,
            stageId: activeStageId,
            revisionId: commentResult.revisionId,
            commentId: commentResult.commentId,
            assetType: pendingFile.assetType ?? "COMMENT_ATTACHMENT",
            fileIndex: index + 1,
            fileCount: filesToUpload.length,
            onProgress: (progress) => {
              updateOptimisticAttachment(optimisticCommentId, pendingFile.id, (attachment) => ({
                ...attachment,
                uploadState: "uploading",
                progress,
              }));
            },
          })
            .then((uploadResult) => {
              updateOptimisticAttachment(optimisticCommentId, pendingFile.id, (attachment) => ({
                ...attachment,
                uploadState: "uploaded",
                progress: 100,
                uploadedAt: "Uploaded. Refreshing…",
              }));
              return uploadResult;
            })
            .catch((error) => {
              updateOptimisticAttachment(optimisticCommentId, pendingFile.id, (attachment) => ({
                ...attachment,
                uploadState: "error",
                progress: attachment.progress ?? 0,
                uploadedAt: "Upload failed",
                errorMessage:
                  error instanceof Error
                    ? error.message
                    : "Unable to upload this file right now.",
              }));
              throw error;
            });
        }),
      );

      const failedUploads = uploadResults.filter(
        (result): result is PromiseRejectedResult => result.status === "rejected",
      );
      const successfulUploads = uploadResults
        .flatMap((result, index) =>
          result.status === "fulfilled"
            ? [
                {
                  pendingFile: filesToUpload[index],
                  attachmentId: result.value.attachmentId,
                },
              ]
            : [],
        )
        .map((result, index, allSuccessfulUploads) => {
          const successfulSubmissionIndex = allSuccessfulUploads
            .slice(0, index + 1)
            .filter(
              (item) => item.pendingFile.assetType === "STAGE_SUBMISSION",
            ).length;

          return {
            ...result,
            submissionNumber:
              result.pendingFile.assetType === "STAGE_SUBMISSION"
                ? startingSubmissionNumber + successfulSubmissionIndex - 1
                : undefined,
          };
        });

      if (failedUploads.length > 0) {
        const message =
          failedUploads.length === filesToUpload.length
            ? "Comment saved, but all file uploads failed. Please try attaching them again."
            : `Comment saved, but ${failedUploads.length} file upload${failedUploads.length === 1 ? "" : "s"} failed.`;
        setComposerError(message);
        showErrorToast("Attachment upload failed.", message);
      }

      setConfirmedComments((current) => [
        {
          id: `confirmed-comment-${commentResult.commentId}`,
          serverEntryId: commentResult.commentId,
          revisionId: commentResult.revisionId ?? undefined,
          kind: "comment",
          author: currentUserDisplayName,
          role: currentUserRoleLabel,
          body: body || "Attachment uploaded.",
          createdAt: "Just now",
          attachments: successfulUploads.map((result) => ({
            id: result.attachmentId,
            isSubmission: result.pendingFile.assetType === "STAGE_SUBMISSION",
            submissionNumber: result.submissionNumber,
            originalFileName: result.pendingFile.file.name,
            fileTypeLabel: getLocalFileTypeLabel(result.pendingFile.file.name),
            mimeType: result.pendingFile.file.type || "application/octet-stream",
            fileSizeLabel: formatLocalFileSize(result.pendingFile.file.size),
            uploadedBy: currentUserDisplayName,
            uploadedAt: "Just now",
            previewPath: `/api/project-assets/${result.attachmentId}/preview`,
            downloadPath: `/api/project-assets/${result.attachmentId}/download`,
            submissionReviewStatus:
              result.pendingFile.assetType === "STAGE_SUBMISSION"
                ? "PENDING_REVIEW"
                : null,
          })),
        },
        ...current,
      ]);
      setOptimisticComments((current) =>
        current.filter((entry) => entry.id !== optimisticCommentId),
      );
      setIsSendingComment(false);
      refreshHistory();
    } catch (error) {
      setOptimisticComments((current) =>
        current.filter((entry) => entry.id !== optimisticCommentId),
      );
      const message =
        error instanceof Error ? error.message : "Unable to send the comment right now.";
      setComposerError(message);
      showErrorToast("Unable to send comment.", message);
    } finally {
      setIsSendingComment(false);
    }
  }

  async function handleCreateRevision() {
    const activeStageId = activeStage?.id;
    const summary = revisionSummary.trim();

    if (!activeStageId) {
      setRevisionDialogError("This project does not have an active stage to upload into.");
      return;
    }

    if (isProjectCompleted) {
      setRevisionDialogError("This project has already been completed.");
      return;
    }

    if (isStageCompleted) {
      setRevisionDialogError("This stage is already completed.");
      return;
    }

    if (!hasAcceptedBrief) {
      setRevisionDialogError("Please accept the brief before submitting work.");
      return;
    }

    if (!summary) {
      setRevisionDialogError("Enter the revision details before creating it.");
      return;
    }

    setRevisionDialogError(null);
    setComposerError(null);
    setIsUploadingRevision(true);
    const optimisticRevisionId = `optimistic-revision-${crypto.randomUUID()}`;
    const filesToUpload = [...pendingRevisionFiles];

    setOptimisticComments((current) => [
      {
        id: optimisticRevisionId,
        kind: "revision",
        title: "Submitting work…",
        revisionStatus: "PENDING_REVIEW",
        rejectionReason: null,
        author: currentUserDisplayName,
        role: currentUserRoleLabel,
        body: summary,
        createdAt: "Uploading…",
        isOptimistic: true,
        attachments: filesToUpload.map((pendingFile) => ({
          id: pendingFile.id,
          isSubmission: false,
          originalFileName: pendingFile.file.name,
          fileTypeLabel: getLocalFileTypeLabel(pendingFile.file.name),
          mimeType: pendingFile.file.type || "application/octet-stream",
          fileSizeLabel: formatLocalFileSize(pendingFile.file.size),
          uploadedBy: currentUserDisplayName,
          uploadedAt: "Uploading…",
          previewPath: "",
          downloadPath: "",
          uploadState: "pending",
          progress: 0,
        })),
      },
      ...current,
    ]);

    try {
      const revisionResult = await createStageRevisionAction({
        projectId: project.id,
        stageId: activeStageId,
        summary,
      });

      if ("error" in revisionResult) {
        throw new Error(revisionResult.error);
      }

      updateOptimisticComment(optimisticRevisionId, (entry) => ({
        ...entry,
        title: revisionResult.title,
        serverEntryId: revisionResult.revisionId,
      }));

      const uploadResults = await Promise.allSettled(
        filesToUpload.map((pendingFile) => {
          updateOptimisticAttachment(optimisticRevisionId, pendingFile.id, (attachment) => ({
            ...attachment,
            uploadState: "uploading",
            progress: 0,
            uploadedAt: "Uploading…",
          }));

          return uploadAssetFile({
            file: pendingFile.file,
            projectId: project.id,
            stageId: activeStageId,
            revisionId: revisionResult.revisionId,
            assetType: "REVISION_ORIGINAL",
            onProgress: (progress) => {
              updateOptimisticAttachment(optimisticRevisionId, pendingFile.id, (attachment) => ({
                ...attachment,
                uploadState: "uploading",
                progress,
              }));
            },
          })
            .then((uploadResult) => {
              updateOptimisticAttachment(optimisticRevisionId, pendingFile.id, (attachment) => ({
                ...attachment,
                uploadState: "uploaded",
                progress: 100,
                uploadedAt: "Uploaded. Refreshing…",
              }));
              return { pendingFile, attachmentId: uploadResult.attachmentId };
            })
            .catch((error) => {
              updateOptimisticAttachment(optimisticRevisionId, pendingFile.id, (attachment) => ({
                ...attachment,
                uploadState: "error",
                progress: attachment.progress ?? 0,
                uploadedAt: "Upload failed",
                errorMessage:
                  error instanceof Error
                    ? error.message
                    : "Unable to upload this file right now.",
              }));
              throw error;
            });
        }),
      );

      const failedUploads = uploadResults.filter(
        (result): result is PromiseRejectedResult => result.status === "rejected",
      );
      const successfulUploads = uploadResults.flatMap((result) =>
        result.status === "fulfilled" ? [result.value] : [],
      );

      if (failedUploads.length > 0) {
        const message =
          failedUploads.length === filesToUpload.length
            ? "Revision created, but all file uploads failed. Please try attaching them again."
            : `Revision created, but ${failedUploads.length} file upload${failedUploads.length === 1 ? "" : "s"} failed.`;
        setComposerError(message);
        showErrorToast("Submit Work completed with upload issues.", message);
      }

      setConfirmedComments((current) => [
        {
          id: `confirmed-revision-${revisionResult.revisionId}`,
          serverEntryId: revisionResult.revisionId,
          revisionId: revisionResult.revisionId,
          kind: "revision",
          title: revisionResult.title,
          revisionStatus: "PENDING_REVIEW",
          rejectionReason: null,
          author: currentUserDisplayName,
          role: currentUserRoleLabel,
          body: summary,
          createdAt: "Just now",
          attachments: successfulUploads.map((result) => ({
            id: result.attachmentId,
            isSubmission: false,
            originalFileName: result.pendingFile.file.name,
            fileTypeLabel: getLocalFileTypeLabel(result.pendingFile.file.name),
            mimeType: result.pendingFile.file.type || "application/octet-stream",
            fileSizeLabel: formatLocalFileSize(result.pendingFile.file.size),
            uploadedBy: currentUserDisplayName,
            uploadedAt: "Just now",
            previewPath: `/api/project-assets/${result.attachmentId}/preview`,
            downloadPath: `/api/project-assets/${result.attachmentId}/download`,
          })),
        },
        ...current,
      ]);

      setOptimisticComments((current) =>
        current.filter((entry) => entry.id !== optimisticRevisionId),
      );
      setRevisionDialogOpen(false);
      setRevisionSummary("");
      setPendingRevisionFiles([]);
      showSuccessToast("Work submitted successfully.");
      refreshHistory();
    } catch (error) {
      setOptimisticComments((current) =>
        current.filter((entry) => entry.id !== optimisticRevisionId),
      );
      const message =
        error instanceof Error ? error.message : "Unable to create the revision right now.";
      setRevisionDialogError(message);
      showErrorToast("Unable to submit work.", message);
    } finally {
      setIsUploadingRevision(false);

      if (revisionFileInputRef.current) {
        revisionFileInputRef.current.value = "";
      }
    }
  }

  async function handleRevisionReview(
    status: Extract<RevisionReviewState, "APPROVED" | "REJECTED">,
  ) {
    const activeStageId = activeStage?.id;

    if (!reviewRevisionMessage?.revisionId || !activeStageId) {
      setReviewDialogError("Submission not found.");
      return;
    }

    const revisionEntryId = getRevisionEntryId(reviewRevisionMessage);
    const rejectionReason = reviewRejectReason.trim();

    if (status === "REJECTED" && !rejectionReason) {
      setReviewDialogError("Revision reason is required.");
      return;
    }

    setReviewDialogError(null);
    setPendingRevisionReviewId(revisionEntryId);

    try {
      const result =
        status === "APPROVED"
          ? await markSubmissionCompleteAction({
              projectId: project.id,
              stageId: activeStageId,
              revisionId: reviewRevisionMessage.revisionId,
            })
          : await requestSubmissionRevisionAction({
              projectId: project.id,
              stageId: activeStageId,
              revisionId: reviewRevisionMessage.revisionId,
              reason: rejectionReason,
            });

      if ("error" in result) {
        throw new Error(result.error);
      }

      const nextStatus = result.revision.status as RevisionReviewState;
      const nextReason = result.revision.rejectionReason ?? null;

      setRevisionReviewOverrides((current) => ({
        ...current,
        [revisionEntryId]: {
          status: nextStatus,
          rejectionReason: nextReason,
        },
      }));

      setConfirmedComments((current) => {
        const nextEntries = current.map((entry) =>
          entry.kind === "revision" && getRevisionEntryId(entry) === revisionEntryId
            ? {
                ...entry,
                revisionStatus: nextStatus,
                rejectionReason: nextReason,
              }
            : entry,
        );

        if (result.revision.rejectionComment) {
          return [
            {
              id: `confirmed-comment-${result.revision.rejectionComment.id}`,
              serverEntryId: result.revision.rejectionComment.id,
              kind: "comment",
              author: currentUserDisplayName,
              role: currentUserRoleLabel,
              body: result.revision.rejectionComment.body,
              createdAt: "Just now",
            },
            ...nextEntries,
          ];
        }

        return nextEntries;
      });

      if (status === "APPROVED" && result.revision.stageCompletion) {
        applyStageCompletionLocally(activeStageId);
      }

      closeRevisionReviewDialog();
      setReviewCompleteDialogOpen(false);
      showSuccessToast(
        status === "APPROVED"
          ? result.revision.stageCompletion
            ? "Stage marked as complete."
            : "Submission approved. Complete the project to archive the final files."
          : "Revision requested.",
      );
      refreshHistory();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to review the submission right now.";
      setReviewDialogError(message);
      showErrorToast(
        status === "APPROVED"
          ? "Unable to mark stage as complete."
          : "Unable to request revision.",
        message,
      );
      setPendingRevisionReviewId(null);
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

          {isProjectCompleted ? (
            <CompletedProjectArchiveSummaryCard completionSummary={completionState} />
          ) : null}

          {isProjectCompleted && completionWorkflow ? (
            <ProjectCompletionChecklist
              projectId={project.id}
              workflow={completionWorkflow}
            />
          ) : null}

          {isProjectCompleted &&
          !completionWorkflow &&
          (isProjectOwner || isProjectExecutor) ? (
            <Card className="rounded-[20px] border border-[#dbe7dd] bg-[#f7fbf6] shadow-none">
              <CardContent className="flex flex-col gap-3 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[16px] font-[700] text-[#173120]">
                    Project completion checklist is not available yet.
                  </p>
                  <p className="mt-1 text-[13px] leading-6 text-[#5f6b62]">
                    This completed project should show Authority Approval, Copyright
                    Transfer, and Invoice steps here. Reload the page to fetch the
                    checklist.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  className="rounded-full text-[12px]"
                  onClick={refreshHistory}
                >
                  Reload Checklist
                </Button>
              </CardContent>
            </Card>
          ) : null}

          {!isProjectCompleted && canCompleteProject ? (
            <Card className="rounded-[20px] border border-[#dbe7dd] bg-[#f7fbf6] shadow-none">
              <CardContent className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[14px] font-[700] text-[#173120]">
                    Final stage approved. Complete the project to archive the final files.
                  </p>
                  <p className="mt-1 text-[12px] text-[#5f6b62]">
                    {completionState.approvedFileCount} final file
                    {completionState.approvedFileCount === 1 ? "" : "s"} ready for archive.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  className="rounded-full text-[12px]"
                  onClick={openProjectCompletionConfirm}
                >
                  Complete Project
                </Button>
              </CardContent>
            </Card>
          ) : null}

          {completionPrompt ? (
            <Card className="rounded-[18px] border border-[#dbe7dd] bg-[#f7fbf6] shadow-none">
              <CardContent className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[14px] font-[700] text-[#173120]">
                    {completionPrompt.allStagesCompleted
                      ? "All stages completed."
                      : "Stage completed. You can now move to the next stage."}
                  </p>
                  {completionPrompt.nextStageLabel && !completionPrompt.allStagesCompleted ? (
                    <p className="mt-1 text-[12px] text-[#5f6b62]">
                      Next stage: {completionPrompt.nextStageLabel}
                    </p>
                  ) : null}
                </div>
                <div className="flex gap-2">
                  {completionPrompt.nextStageId && !completionPrompt.allStagesCompleted ? (
                    <Button asChild size="sm" className="rounded-full text-[12px]">
                      <Link
                        href={`/projects/${project.id}/chat?stage=${completionPrompt.nextStageId}`}
                      >
                        Go to Next Stage
                      </Link>
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="rounded-full text-[12px]"
                    onClick={() => setCompletionPrompt(null)}
                  >
                    Close
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {displayedMessages.length === 0 ? (
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
              {!isProjectCompleted && isProjectExecutor && hasAcceptedBrief ? (
                <div className="mt-5 flex justify-center">
                  <Button
                    type="button"
                    onClick={openRevisionDialog}
                    disabled={isUploadingRevision}
                  >
                    {isUploadingRevision ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4" />
                    )}
                    Submit First Work
                  </Button>
                </div>
              ) : !isProjectCompleted && isProjectExecutor ? (
                <div className="mt-5 flex justify-center">
                  <Button
                    type="button"
                    onClick={() => {
                      setAcceptBriefError(null);
                      setAcceptBriefDialogOpen(true);
                    }}
                  >
                    Accept Brief
                  </Button>
                </div>
              ) : null}
            </Card>
          ) : null}

          {displayedMessages.map((message, index) =>
            message.kind === "revision" ? (
              (() => {
                const revisionEntryId = getRevisionEntryId(message);
                const effectiveRevisionStatus =
                  revisionReviewOverrides[revisionEntryId]?.status ??
                  message.revisionStatus ??
                  "PENDING_REVIEW";
                const effectiveRejectionReason =
                  revisionReviewOverrides[revisionEntryId]?.rejectionReason ??
                  message.rejectionReason ??
                  null;
                const revisionStatusMeta = getRevisionStatusMeta(effectiveRevisionStatus);
                const canReviewRevision =
                  !isProjectCompleted &&
                  canReviewSubmissions &&
                  effectiveRevisionStatus === "PENDING_REVIEW";

                return (
                  <div key={message.id} className="space-y-3">
                    <Card className="flex-1 rounded-[20px] border-none bg-[linear-gradient(135deg,#2f8d5d,#476f5a)] p-5 text-white shadow-[0_18px_45px_rgba(23,39,28,0.08)]">
                      <div className="grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)] xl:items-center">
                        <div className="max-w-[220px]">
                          <div className="flex flex-wrap items-center gap-2">
                            <h1 className="text-[18px] font-[700] text-[#95d867]">
                              {message.title}
                            </h1>
                            <span
                              className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-[800] uppercase tracking-[0.08em] ${revisionStatusMeta.badgeClassName}`}
                            >
                              {revisionStatusMeta.label}
                            </span>
                          </div>
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
                          {effectiveRejectionReason ? (
                            <div className="mt-3 rounded-[16px] border border-[#ffffff29] bg-[#fff2f1]/95 px-3 py-2.5 text-[11px] leading-5 text-[#7d2822]">
                              <p className="font-[700] uppercase tracking-[0.08em] text-[#bb4d49]">
                                Revision Brief
                              </p>
                              <p className="mt-1">{effectiveRejectionReason}</p>
                            </div>
                          ) : null}
                          <p className="mt-2 text-[10px] text-white/70">{message.createdAt}</p>
                        </div>

                        {message.attachments?.length ? (
                          <div className="mx-auto min-w-0 max-w-[420px]">
                            <Card className="rounded-[16px] border border-white/25 bg-[#1f5f40]/75 p-3 shadow-[0_10px_24px_rgba(13,39,27,0.28)]">
                              <p className="text-center text-[11px] font-[700] text-white">
                                Attachments
                              </p>
                              <AttachmentHistoryList
                                attachments={message.attachments}
                                actionsDisabled={isProjectCompleted}
                              />
                            </Card>
                          </div>
                        ) : null}
                      </div>
                    </Card>

                    {canReviewRevision || index === firstRevisionIndex ? (
                      <div className="flex flex-wrap gap-2">
                        {canReviewRevision ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            className="rounded-full text-[12px]"
                            disabled={pendingRevisionReviewId === revisionEntryId}
                            onClick={() => {
                              setReviewDialogError(null);
                              setReviewRejectMode(false);
                              setReviewCompleteDialogOpen(false);
                              setReviewRejectReason("");
                              setReviewRevisionId(revisionEntryId);
                            }}
                          >
                            Review Submission
                          </Button>
                        ) : null}
                        {index === firstRevisionIndex &&
                        !isProjectCompleted &&
                        isProjectExecutor &&
                        hasAcceptedBrief ? (
                          <Button
                            type="button"
                            onClick={openRevisionDialog}
                            size="sm"
                            className="rounded-full text-[12px]"
                            disabled={isUploadingRevision || isStageCompleted}
                          >
                            {isUploadingRevision ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Upload className="h-3.5 w-3.5" />
                            )}
                            Submit Work
                          </Button>
                        ) : null}
                        {index === firstRevisionIndex && isProjectOwner && !isFinalStage ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            className="rounded-full text-[12px]"
                            disabled={isStageCompleted || isMarkingStageComplete}
                            onClick={() => {
                              setStageCompleteError(null);
                              setStageCompleteDialogOpen(true);
                            }}
                          >
                            {isStageCompleted ? "Stage completed" : "Mark as complete"}
                          </Button>
                        ) : null}
                        {index === firstRevisionIndex && !isProjectCompleted ? (
                          <Button
                            type="button"
                            onClick={() => setDraft(`Replying to ${message.author}: `)}
                            size="sm"
                            variant="secondary"
                            className="rounded-full text-[12px]"
                          >
                            Add Comments
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })()
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
                  <AttachmentHistoryList
                    attachments={message.attachments}
                    compact
                    actionsDisabled={isProjectCompleted}
                  />
                ) : null}
              </Card>
            ),
          )}

          {!hasRevisionEntries && displayedMessages.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {!isProjectCompleted && isProjectExecutor && !hasAcceptedBrief ? (
                <>
                  <Button
                    type="button"
                    size="sm"
                    className="rounded-full text-[12px]"
                    onClick={() => {
                      setAcceptBriefError(null);
                      setAcceptBriefDialogOpen(true);
                    }}
                    disabled={isAcceptingBrief}
                  >
                    {isAcceptingBrief ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : null}
                    Accept Brief
                  </Button>
                  <Button
                    type="button"
                    onClick={() => setDraft(`Replying to ${currentUserDisplayName}: `)}
                    size="sm"
                    variant="secondary"
                    className="rounded-full text-[12px]"
                  >
                    Add Comments
                  </Button>
                </>
              ) : null}
              {!isProjectCompleted && isProjectExecutor && hasAcceptedBrief ? (
                <Button
                  type="button"
                  onClick={openRevisionDialog}
                  size="sm"
                  className="rounded-full text-[12px]"
                  disabled={isUploadingRevision || isStageCompleted}
                >
                  {isUploadingRevision ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Upload className="h-3.5 w-3.5" />
                  )}
                  Submit Work
                </Button>
              ) : null}
              {!isProjectCompleted && isProjectOwner && !hasAcceptedBrief ? (
                <div className="inline-flex items-center rounded-full bg-[#f4f7f4] px-3 py-2 text-[12px] font-medium text-[#5d675f]">
                  Waiting for executor to accept brief.
                </div>
              ) : null}
            </div>
          ) : null}

          {isProjectCompleted ? (
            <Card className="sticky bottom-0 rounded-[22px] border border-[#dbe7dd] bg-[#f7fbf6] p-4 backdrop-blur">
              <p className="text-[14px] font-[700] text-[#173120]">Project chat is locked.</p>
              <p className="mt-1 text-[12px] leading-6 text-[#5f6b62]">
                This project has been completed. Only final archived files and
                completion documents remain available for viewing or download.
              </p>
            </Card>
          ) : (
            <Card className="sticky bottom-0 rounded-[22px] bg-white/95 p-3 backdrop-blur">
              <input
                ref={revisionFileInputRef}
                type="file"
                multiple
                className="sr-only"
                onChange={(event) => {
                  handleRevisionFilesSelected(event.target.files);
                }}
              />
              <input
                ref={commentAttachmentInputRef}
                type="file"
                multiple
                className="sr-only"
                onChange={(event) => {
                  handleCommentFilesSelected(event.target.files);

                  if (commentAttachmentInputRef.current) {
                    commentAttachmentInputRef.current.value = "";
                  }
                }}
              />

              {pendingCommentFiles.length ? (
                <div className="mb-3 flex flex-wrap gap-2 rounded-[18px] border border-[#e2e7e2] bg-[#fbfcfa] px-3 py-2.5">
                  {pendingCommentFiles.map((pendingFile) => (
                    <div
                      key={pendingFile.id}
                      className="inline-flex items-center gap-2 rounded-full border border-[#d6dfd7] bg-white px-3 py-1.5 text-[11px] text-[#324138]"
                    >
                      {pendingFile.assetType === "STAGE_SUBMISSION" ? (
                        <span className="rounded-full bg-[#edf7ef] px-2 py-0.5 text-[9px] font-[800] uppercase tracking-[0.08em] text-[#2b8b56]">
                          Submission
                        </span>
                      ) : (
                        <span className="rounded-full bg-[#f4f7f4] px-2 py-0.5 text-[9px] font-[800] uppercase tracking-[0.08em] text-[#566259]">
                          Attachment
                        </span>
                      )}
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

              {aiStatus ? (
                <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#dbe6da] bg-[#f7fbf6] px-3 py-1.5 text-[12px] font-[600] text-[#31523f]">
                  {isListening ? (
                    <span className="relative flex size-2.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#d9645b] opacity-70" />
                      <span className="relative inline-flex size-2.5 rounded-full bg-[#d9645b]" />
                    </span>
                  ) : (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  )}
                  {aiStatus}
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
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 text-[#5083ff]"
                    aria-label="Translate message"
                    onClick={() => {
                      void handleTranslateDraft();
                    }}
                    disabled={isTranslating || isListening || isTranscribing}
                  >
                    {isTranslating ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Languages className="h-5 w-5" />
                    )}
                  </Button>
                  <ChatLanguagePicker
                    languages={SUPPORTED_CHAT_LANGUAGES}
                    selectedLanguage={selectedOutputLanguage}
                    disabled={isTranslating || isListening || isTranscribing}
                    onSelect={(language) => setSelectedOutputLanguageCode(language.code)}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className={`size-8 ${isListening ? "bg-[#fff1ef] text-[#d9645b] hover:bg-[#ffe7e3]" : "text-brand"}`}
                    aria-label={isListening ? "Stop recording" : "Start voice input"}
                    onClick={() => {
                      void handleMicrophoneToggle();
                    }}
                    disabled={isTranscribing || isTranslating}
                  >
                    {isTranscribing ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : isListening ? (
                      <Square className="h-4 w-4 fill-current" />
                    ) : (
                      <Mic className="h-5 w-5" />
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 text-brand"
                    aria-label="Attach file"
                    onClick={openCommentUploadDialog}
                  >
                    <Paperclip className="h-5 w-5" />
                  </Button>
                  <Button
                    type="button"
                    onClick={() => {
                      void handleSendComment();
                    }}
                    size="sm"
                    className="text-[12px]"
                    disabled={isSendingComment || !canSendComment}
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
          )}
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
                  <dd className="inline">{activeStage?.actualStartedAt ?? "—"}</dd>
                </div>
                <div>
                  <dt className="inline font-[700]">Stage Deadline :</dt>{" "}
                  <dd className="inline">{activeStage?.plannedDueAt ?? project.endDate}</dd>
                </div>
                <div>
                  <dt className="inline font-[700]">Status :</dt>{" "}
                  <dd className="inline">{stageExecutionStatus}</dd>
                </div>
              </dl>
              <div className="mt-5 space-y-2.5">
                {!isProjectCompleted && canCompareSubmissions ? (
                  <Button asChild size="sm" className="min-w-[170px] text-[13px]">
                    <Link href={`/projects/${project.id}/compare?stage=${activeStage?.id ?? ""}`}>
                      Compare Submissions
                    </Link>
                  </Button>
                ) : !isProjectCompleted ? (
                  <div className="space-y-1.5">
                    <Button type="button" size="sm" disabled className="min-w-[170px] text-[13px]">
                      Compare Submissions
                    </Button>
                    <p className="text-[11px] leading-4 text-[#6f786f]">
                      Upload at least two submissions to compare.
                    </p>
                  </div>
                ) : null}
                {!isProjectCompleted ? (
                  <Button asChild size="sm" className="min-w-[110px] text-[13px]">
                    <Link href="#">Brief</Link>
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <StageTimeRemainingCard
            actualStartedAt={activeStage?.actualStartedAtValue ?? null}
            stageDueAt={activeStage?.plannedDueAtValue ?? null}
          />

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-[20px] text-[#111712]">
                Project Reference Files
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {project.attachments.length > 0 ? (
                <AttachmentHistoryList
                  attachments={project.attachments}
                  compact
                  actionsDisabled={isProjectCompleted}
                />
              ) : (
                <p className="text-[13px] text-[#7a837b]">
                  No project reference files uploaded yet.
                </p>
              )}
            </CardContent>
          </Card>

          <ProjectCollaboratorsPanel
            collaborators={collaborators}
            onRemove={
              canManageCollaborators && !isProjectCompleted
                ? (collaboratorId) => removeCollaborator(collaboratorId)
                : undefined
            }
            onAdd={
              canManageCollaborators && !isProjectCompleted
                ? () => {
                    setCollaboratorDialogError(undefined);
                    setCollaboratorPickerOpen(true);
                  }
                : undefined
            }
            onParticipantTypeChange={
              canManageCollaborators && !isProjectCompleted
                ? (collaboratorId, participantType) => {
                    void handleCollaboratorParticipantTypeChange(
                      collaboratorId,
                      participantType,
                    );
                  }
                : undefined
            }
            onToggleChatVisibility={
              canManageCollaborators && !isProjectCompleted
                ? (collaboratorId, paused) =>
                    handleCollaboratorChatVisibilityToggle(collaboratorId, paused)
                : undefined
            }
            saving={collaboratorSaving}
          />
        </div>
      </div>
      <CollaboratorPickerDialog
        isOpen={collaboratorPickerOpen}
        collaborators={availableCollaboratorRecords}
        selectedIds={selectedCollaboratorIds}
        saving={collaboratorSaving}
        onToggle={toggleAssignedCollaborator}
        onClose={() => {
          setCollaboratorDialogError(undefined);
          setCollaboratorPickerOpen(false);
        }}
        onConfirm={() => {
          void applyCollaboratorsSelection();
        }}
        onInviteFallback={openCollaboratorInvite}
        confirmLabel="Apply Selection"
      />
      <CollaboratorDialog
        isOpen={collaboratorDialogOpen}
        mode="invite"
        form={collaboratorForm}
        error={collaboratorDialogError}
        saving={collaboratorSaving}
        onClose={() => {
          setCollaboratorDialogError(undefined);
          setCollaboratorDialogOpen(false);
        }}
        onSubmit={() => {
          void handleCollaboratorInvite();
        }}
        onChange={setCollaboratorFormValue}
        onPermissionChange={setCollaboratorPermissionValue}
      />
      <ConfirmationDialog
        isOpen={acceptBriefDialogOpen}
        title="Accept brief and start work?"
        description="This confirms that you have reviewed the project brief and are starting work on this stage. The stage timer will start from this moment."
        confirmLabel="Accept & Start Work"
        pending={isAcceptingBrief}
        error={acceptBriefError ?? undefined}
        onClose={() => {
          setAcceptBriefError(null);
          setAcceptBriefDialogOpen(false);
        }}
        onConfirm={() => {
          void handleAcceptBrief();
        }}
      />
      <ConfirmationDialog
        isOpen={reviewCompleteDialogOpen}
        title={
          reviewCompletionIsFinalStage
            ? "Approve final submission?"
            : "Mark stage as complete?"
        }
        description={
          reviewCompletionIsFinalStage
            ? "This will approve the submitted revision. You can then complete the project, archive the final files, and lock further chat interaction."
            : "This will mark the submitted revision as completed, complete the current stage, and make the next stage available."
        }
        confirmLabel={reviewCompletionIsFinalStage ? "Approve Submission" : "Mark as Complete"}
        pending={Boolean(pendingRevisionReviewId)}
        error={reviewDialogError ?? undefined}
        onClose={() => {
          if (pendingRevisionReviewId) {
            return;
          }

          setReviewDialogError(null);
          setReviewCompleteDialogOpen(false);
        }}
        onConfirm={() => {
          void handleRevisionReview("APPROVED");
        }}
      />
      <ConfirmationDialog
        isOpen={stageCompleteDialogOpen}
        title="Mark Stage Complete"
        description="This will mark the current stage as completed. Only the project owner can do this."
        confirmLabel="Mark as Complete"
        pending={isMarkingStageComplete}
        error={stageCompleteError ?? undefined}
        onClose={() => {
          setStageCompleteError(null);
          setStageCompleteDialogOpen(false);
        }}
        onConfirm={() => {
          void handleMarkStageComplete();
        }}
      />
      <ConfirmationDialog
        isOpen={projectCompletionConfirmOpen}
        title="Complete and archive project?"
        description="This will complete the project, archive the final files, and stop further chat interaction. Members will only be able to view or download the final archived files."
        confirmLabel="Continue"
        pending={isPreparingProjectCompletion}
        error={projectCompletionError ?? undefined}
        onClose={() => {
          if (isPreparingProjectCompletion) {
            return;
          }

          setProjectCompletionError(null);
          setProjectCompletionConfirmOpen(false);
        }}
        onConfirm={() => {
          void handlePrepareProjectCompletion();
        }}
      />
      {archivePreparation ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#112118]/45 px-4 py-8 backdrop-blur-[2px]">
          <Card className="flex h-full max-h-[88vh] w-full max-w-[920px] flex-col rounded-[28px] border border-[#e1e7e1] shadow-[0_35px_90px_rgba(11,26,18,0.22)]">
            <CardHeader className="flex-row items-start justify-between gap-4 space-y-0 p-6 sm:p-7">
              <div>
                <CardTitle className="text-[24px] font-[700] tracking-[-0.03em] text-[#111712]">
                  Final Archive Preparation
                </CardTitle>
                <p className="mt-2 text-[14px] leading-6 text-[#6a706b]">
                  Review the final files, rename them for archive storage, and choose the
                  archive category before completing the project.
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="icon"
                onClick={resetProjectCompletionFlow}
                disabled={isCompletingProject}
                className="shrink-0 border border-line"
                aria-label="Close archive preparation dialog"
              >
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="min-h-0 flex-1 overflow-y-auto px-6 pb-6 pt-0 sm:px-7 sm:pb-7">
              {archiveCompletionError ? (
                <div className="mb-5 rounded-[18px] border border-[#f0c9c7] bg-[#fff2f1] px-4 py-3 text-[13px] text-[#bb4d49]">
                  {archiveCompletionError}
                </div>
              ) : null}

              <div className="grid gap-4 rounded-[20px] border border-line bg-[#fbfcfa] p-4 sm:grid-cols-[minmax(0,1fr)_220px]">
                <div>
                  <p className="text-[11px] font-[700] uppercase tracking-[0.08em] text-[#70806f]">
                    Project
                  </p>
                  <p className="mt-1 text-[16px] font-[700] text-[#111712]">
                    {archivePreparation.projectName}
                  </p>
                  <p className="mt-1 text-[13px] text-[#687269]">
                    Final stage: {archivePreparation.finalStageName}
                  </p>
                </div>
                <div className="space-y-2">
                  <p className="text-[11px] font-[700] uppercase tracking-[0.08em] text-[#70806f]">
                    Archive Category
                  </p>
                  <Select value={archiveCategorySlug} onValueChange={setArchiveCategorySlug}>
                    <SelectTrigger className="h-11 rounded-[14px] border border-line">
                      <SelectValue placeholder="Choose archive category" />
                    </SelectTrigger>
                    <SelectContent>
                      {archivePreparation.categories.map((category) => (
                        <SelectItem key={category.slug} value={category.slug}>
                          {category.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {archivePreparation.files.map((file) => {
                  const nextFileName =
                    archiveFileNames[file.sourceAttachmentId] ?? file.defaultArchiveFileName;
                  const inlineError = archiveFileErrors[file.sourceAttachmentId];

                  return (
                    <div
                      key={file.sourceAttachmentId}
                      className="rounded-[20px] border border-[#dbe4dc] bg-white p-4 shadow-[0_10px_26px_rgba(16,26,20,0.05)]"
                    >
                      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`inline-flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-[10px] font-[800] ${getFileBadgeClass(
                                file.fileTypeLabel,
                              )}`}
                            >
                              {file.fileTypeLabel}
                            </span>
                            <p className="truncate text-[14px] font-[700] text-[#111712]">
                              {file.originalFileName}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-3 text-[12px] text-[#667168]">
                            <span>{file.fileSizeLabel}</span>
                            <span>{file.sourceLabel}</span>
                          </div>
                          <div className="flex gap-2">
                            <AssetPreviewButton
                              fileName={file.originalFileName}
                              mimeType={file.mimeType}
                              previewPath={file.previewPath}
                              downloadPath={file.downloadPath}
                              iconOnly={false}
                              triggerClassName="rounded-full border border-line px-3 text-brand"
                            />
                            <Button
                              asChild
                              type="button"
                              variant="secondary"
                              size="sm"
                              className="rounded-full text-[12px]"
                            >
                              <a href={file.downloadPath} target="_blank" rel="noreferrer">
                                <Download className="h-4 w-4" />
                                Download
                              </a>
                            </Button>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <p className="text-[12px] font-[700] uppercase tracking-[0.08em] text-[#70806f]">
                            Archive File Name
                          </p>
                          <Input
                            value={nextFileName}
                            onChange={(event) =>
                              updateArchiveFileName(
                                file.sourceAttachmentId,
                                event.target.value,
                              )
                            }
                            placeholder="Enter archive file name"
                            className={`h-11 rounded-[14px] border ${inlineError ? "border-[#df6f66]" : "border-line"}`}
                            disabled={isCompletingProject}
                          />
                          {inlineError ? (
                            <p className="text-[12px] text-[#c14f46]">{inlineError}</p>
                          ) : (
                            <p className="text-[11px] text-[#7a837b]">
                              Keep the original file extension when renaming.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={resetProjectCompletionFlow}
                  disabled={isCompletingProject}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    void handleCompleteProjectArchive();
                  }}
                  disabled={isCompletingProject}
                >
                  {isCompletingProject ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : null}
                  Complete & Archive
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
      {commentUploadDialogOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#112118]/45 px-4 py-8 backdrop-blur-[2px]">
          <Card className="w-full max-w-[560px] rounded-[28px] border border-[#e1e7e1] shadow-[0_35px_90px_rgba(11,26,18,0.22)]">
            <CardHeader className="flex-row items-start justify-between gap-4 space-y-0 p-6 sm:p-7">
              <div>
                <CardTitle className="text-[24px] font-[700] tracking-[-0.03em] text-[#111712]">
                  Upload file as
                </CardTitle>
                <p className="mt-2 text-[14px] leading-6 text-[#6a706b]">
                  Choose whether this file is part of the discussion or a design
                  submission for this stage.
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="icon"
                onClick={() => setCommentUploadDialogOpen(false)}
                className="shrink-0 border border-line"
                aria-label="Close upload type dialog"
              >
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-4 px-6 pb-6 pt-0 sm:px-7 sm:pb-7">
              <button
                type="button"
                onClick={() => setCommentUploadIntent("COMMENT_ATTACHMENT")}
                className={`w-full rounded-[22px] border px-5 py-4 text-left transition ${
                  commentUploadIntent === "COMMENT_ATTACHMENT"
                    ? "border-brand bg-[#f4fbf5] shadow-[0_10px_24px_rgba(18,35,23,0.06)]"
                    : "border-line bg-white hover:border-brand/40"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[16px] font-[700] text-[#111712]">Attachment</p>
                    <p className="mt-1 text-[13px] leading-5 text-[#697169]">
                      Use for chat, references, supporting documents, or normal
                      discussion files.
                    </p>
                  </div>
                  <div
                    className={`mt-1 h-5 w-5 rounded-full border ${
                      commentUploadIntent === "COMMENT_ATTACHMENT"
                        ? "border-brand bg-brand"
                        : "border-[#cfd8cf] bg-white"
                    }`}
                  />
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (!hasAcceptedBrief || isStageCompleted) {
                    return;
                  }

                  setCommentUploadIntent("STAGE_SUBMISSION");
                }}
                disabled={!hasAcceptedBrief || isStageCompleted}
                className={`w-full rounded-[22px] border px-5 py-4 text-left transition ${
                  commentUploadIntent === "STAGE_SUBMISSION"
                    ? "border-brand bg-[#f4fbf5] shadow-[0_10px_24px_rgba(18,35,23,0.06)]"
                    : "border-line bg-white hover:border-brand/40"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[16px] font-[700] text-[#111712]">Submission</p>
                    <p className="mt-1 text-[13px] leading-5 text-[#697169]">
                      Use for design output that will be compared with other
                      submissions in this same stage. Images only.
                    </p>
                  </div>
                  <div
                    className={`mt-1 h-5 w-5 rounded-full border ${
                      commentUploadIntent === "STAGE_SUBMISSION"
                        ? "border-brand bg-brand"
                        : "border-[#cfd8cf] bg-white"
                    }`}
                  />
                </div>
              </button>

              <div className="rounded-[18px] border border-[#e4e8e3] bg-[#fafcf9] px-4 py-3 text-[12px] text-[#657067]">
                {isStageCompleted
                  ? "This stage is completed. New submissions are locked."
                  : hasAcceptedBrief
                  ? "Submissions must be PNG, JPG, JPEG, or WebP images."
                  : "Accept the brief before submitting work files for review."}
              </div>

              <div className="flex flex-col gap-3">
                <div className="space-y-2">
                  <p className="text-[13px] font-[600] text-[#2d372f]">Choose Files</p>
                  <UploadIntentDropzone
                    intent={commentUploadIntent}
                    onFilesSelected={handleCommentFilesSelected}
                    onError={(message) => setComposerError(message)}
                  />
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setCommentUploadDialogOpen(false)}
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
      {revisionDialogOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#112118]/45 px-4 py-8 backdrop-blur-[2px]">
          <Card className="w-full max-w-[640px] rounded-[28px] border border-[#e1e7e1] shadow-[0_35px_90px_rgba(11,26,18,0.22)]">
            <CardHeader className="flex-row items-start justify-between gap-4 space-y-0 p-6 sm:p-7">
              <div>
                <CardTitle className="text-[24px] font-[700] tracking-[-0.03em] text-[#111712]">
                  Submit Work for Review
                </CardTitle>
                <p className="mt-2 text-[14px] leading-6 text-[#6a706b]">
                  Describe the work submission and attach supporting files if needed.
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="icon"
                onClick={() => {
                  setRevisionDialogError(null);
                  setRevisionDialogOpen(false);
                }}
                disabled={isUploadingRevision}
                className="shrink-0 border border-line"
                aria-label="Close revision dialog"
              >
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="px-6 pb-6 pt-0 sm:px-7 sm:pb-7">
              {revisionDialogError ? (
                <div className="mb-5 rounded-[18px] border border-[#f0c9c7] bg-[#fff2f1] px-4 py-3 text-[13px] text-[#bb4d49]">
                  {revisionDialogError}
                </div>
              ) : null}
              <div className="space-y-5">
                <div className="space-y-2">
                  <p className="text-[13px] font-[600] text-[#2d372f]">Revision Notes</p>
                  <Textarea
                    value={revisionSummary}
                    onChange={(event) => setRevisionSummary(event.target.value)}
                    placeholder="Describe the corrections required for this revision."
                    className="min-h-[140px] rounded-[18px] border border-line"
                    disabled={isUploadingRevision}
                  />
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[13px] font-[600] text-[#2d372f]">Attachments</p>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => revisionFileInputRef.current?.click()}
                      disabled={isUploadingRevision}
                    >
                      <Paperclip className="h-4 w-4" />
                      Add files
                    </Button>
                  </div>
                  {pendingRevisionFiles.length > 0 ? (
                    <div className="flex flex-wrap gap-2 rounded-[18px] border border-[#e2e7e2] bg-[#fbfcfa] px-3 py-2.5">
                      {pendingRevisionFiles.map((pendingFile) => (
                        <div
                          key={pendingFile.id}
                          className="inline-flex items-center gap-2 rounded-full border border-[#d6dfd7] bg-white px-3 py-1.5 text-[11px] text-[#324138]"
                        >
                          <span className="max-w-[220px] truncate">{pendingFile.file.name}</span>
                          <button
                            type="button"
                            onClick={() => removePendingRevisionFile(pendingFile.id)}
                            className="cursor-pointer text-[#7d847e] transition hover:text-[#27322b]"
                            aria-label={`Remove ${pendingFile.file.name}`}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-[18px] border border-dashed border-[#d8e1d8] px-4 py-5 text-[13px] text-[#7a837b]">
                      No files attached yet.
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setRevisionDialogError(null);
                      setRevisionDialogOpen(false);
                    }}
                    disabled={isUploadingRevision}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={() => {
                      void handleCreateRevision();
                    }}
                    disabled={isUploadingRevision}
                  >
                    {isUploadingRevision ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4" />
                    )}
                    Submit Work
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
      {reviewRevisionMessage ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#112118]/45 px-4 py-8 backdrop-blur-[2px]">
          <Card className="w-full max-w-[720px] rounded-[28px] border border-[#e1e7e1] shadow-[0_35px_90px_rgba(11,26,18,0.22)]">
            <CardHeader className="flex-row items-start justify-between gap-4 space-y-0 p-6 sm:p-7">
              <div>
                <CardTitle className="text-[24px] font-[700] tracking-[-0.03em] text-[#111712]">
                  Review Submission
                </CardTitle>
                <p className="mt-2 text-[14px] leading-6 text-[#6a706b]">
                  {reviewCompletionIsFinalStage
                    ? "Review the submitted revision. After approval, the project owner can complete the project and archive the final files."
                    : "Review the submitted revision and decide whether to mark this stage as complete or request another revision."}
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="icon"
                onClick={closeRevisionReviewDialog}
                disabled={Boolean(pendingRevisionReviewId)}
                className="shrink-0 border border-line"
                aria-label="Close review dialog"
              >
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-5 px-6 pb-6 pt-0 sm:px-7 sm:pb-7">
              {reviewDialogError ? (
                <div className="rounded-[18px] border border-[#f0c9c7] bg-[#fff2f1] px-4 py-3 text-[13px] text-[#bb4d49]">
                  {reviewDialogError}
                </div>
              ) : null}
              <div className="grid gap-3 rounded-[20px] border border-line bg-[#fbfcfa] p-4 sm:grid-cols-2">
                <div>
                  <p className="text-[11px] font-[700] uppercase tracking-[0.08em] text-[#70806f]">
                    Revision
                  </p>
                  <p className="mt-1 text-[15px] font-[700] text-[#111712]">
                    {reviewRevisionMessage.title}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-[700] uppercase tracking-[0.08em] text-[#70806f]">
                    Current Status
                  </p>
                  <div className="mt-1">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-[800] uppercase tracking-[0.08em] ${
                        getRevisionStatusMeta(
                          revisionReviewOverrides[reviewRevisionId ?? ""]?.status ??
                            reviewRevisionMessage.revisionStatus ??
                            "PENDING_REVIEW",
                        ).badgeClassName
                      }`}
                    >
                      {
                        getRevisionStatusMeta(
                          revisionReviewOverrides[reviewRevisionId ?? ""]?.status ??
                            reviewRevisionMessage.revisionStatus ??
                            "PENDING_REVIEW",
                        ).label
                      }
                    </span>
                  </div>
                </div>
                <div>
                  <p className="text-[11px] font-[700] uppercase tracking-[0.08em] text-[#70806f]">
                    Submitted By
                  </p>
                  <p className="mt-1 text-[14px] text-[#27322b]">
                    {reviewRevisionMessage.author}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-[700] uppercase tracking-[0.08em] text-[#70806f]">
                    Submitted At
                  </p>
                  <p className="mt-1 text-[14px] text-[#27322b]">
                    {reviewRevisionMessage.createdAt}
                  </p>
                </div>
              </div>
              {reviewRevisionMessage.attachments?.length ? (
                <div className="space-y-2">
                  <p className="text-[13px] font-[600] text-[#2d372f]">Submitted Files</p>
                  <AttachmentHistoryList
                    attachments={reviewRevisionMessage.attachments}
                    actionsDisabled={isProjectCompleted}
                  />
                </div>
              ) : null}
              {reviewRejectMode ? (
                <div className="space-y-2">
                  <p className="text-[13px] font-[600] text-[#2d372f]">
                    Revision Brief / Reason *
                  </p>
                  <Textarea
                    value={reviewRejectReason}
                    onChange={(event) => setReviewRejectReason(event.target.value)}
                    placeholder="Explain what needs to be changed for the next revision."
                    className="min-h-[120px] rounded-[18px] border border-line"
                    disabled={Boolean(pendingRevisionReviewId)}
                  />
                </div>
              ) : null}
              <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={closeRevisionReviewDialog}
                  disabled={Boolean(pendingRevisionReviewId)}
                >
                  Cancel
                </Button>
                {!reviewRejectMode ? (
                  <>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        setReviewDialogError(null);
                        setReviewRejectMode(true);
                      }}
                      disabled={Boolean(pendingRevisionReviewId)}
                    >
                      Request Revision
                    </Button>
                    <Button
                      type="button"
                      onClick={() => {
                        setReviewDialogError(null);
                        setReviewCompleteDialogOpen(true);
                      }}
                      disabled={Boolean(pendingRevisionReviewId)}
                    >
                      {reviewCompletionIsFinalStage ? "Approve Submission" : "Mark as Complete"}
                    </Button>
                  </>
                ) : (
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => {
                      void handleRevisionReview("REJECTED");
                    }}
                    disabled={
                      Boolean(pendingRevisionReviewId) || reviewRejectReason.trim().length === 0
                    }
                  >
                    {pendingRevisionReviewId ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : null}
                    Request Revision
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </section>
  );
}
