"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { flushSync } from "react-dom";
import { useDropzone } from "react-dropzone";
import {
  CheckCircle2,
  Download,
  FileText,
  GitCompare,
  Info,
  Languages,
  Loader2,
  Maximize2,
  Mic,
  MoreVertical,
  Paperclip,
  Send,
  Square,
  Trash2,
  Upload,
  X,
} from "lucide-react";

import {
  acceptStageBriefAction,
  cancelStageRevisionSubmissionAction,
  completeProjectArchiveAction,
  createStageRevisionAction,
  deleteStageCommentAction,
  markSubmissionCompleteAction,
  markStageCompleteAction,
  prepareProjectCompletionAction,
  removeProjectCollaboratorAction,
  requestStageInvoiceAction,
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
import { AssetPreviewButton } from "@/components/projects/asset-preview-button";
import { AttachmentFavoriteButton } from "@/components/projects/attachment-favorite-button";
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
import {
  ProjectCollaboratorsPanel,
  ProjectExecutorsPanel,
} from "@/components/projects/project-collaborators-panel";
import { StageTimeRemainingCard } from "@/components/projects/stage-time-remaining-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useStageChatRealtime } from "@/hooks/use-stage-chat-realtime";
import type {
  ProjectArchivePreparation,
  ProjectCompletionSummary,
} from "@/lib/archives";
import type { ProjectCompletionWorkflowRecord } from "@/lib/project-completion";
import { showErrorToast, showSuccessToast } from "@/lib/toast";
import type { StageHistoryRecord } from "@/lib/project-history";
import type {
  StageChatRealtimeMessageCreatedPayload,
  StageChatRealtimeMessageDeletedPayload,
  StageChatRealtimeMessageFailedPayload,
  StageChatRealtimeMessagePendingPayload,
  StageChatRealtimeUpdatesResponse,
} from "@/lib/realtime/events";
import type {
  ProjectAttachmentRecord,
  ProjectChatEntry,
  ProjectCollaboratorRecord,
  ProjectFlowRecord,
  ProjectMentionParticipantRecord,
  ProjectStageRecord,
} from "@/lib/projects";
import type { CollaboratorRecord } from "@/lib/collaboration";
import {
  SUBMISSION_IMAGE_ALLOWED_EXTENSIONS,
  buildFileTypeNotAllowedPayload,
  formatUploadFileTypeError,
  getUploadErrorMessage,
  type UploadFileTypeErrorPayload,
} from "@/lib/upload-validation";

type ProjectChatWorkspaceProps = {
  project: ProjectFlowRecord;
  stageId?: string | null;
  history: StageHistoryRecord;
  availableCollaborators: CollaboratorRecord[];
  currentUserId: string;
  currentUserAvatarSrc?: string | null;
  canManageCollaborators: boolean;
  canManageChatVisibility: boolean;
  completionSummary: ProjectCompletionSummary;
  completionWorkflow: ProjectCompletionWorkflowRecord | null;
  deferCompletionData?: boolean;
};

type PendingFile = {
  id: string;
  file: File;
  assetType?: UploadAssetType;
};

type UploadProgressState = "pending" | "uploading" | "uploaded" | "error";
type OptimisticMessageStatus = "sending" | "uploading" | "failed";

type DisplayAttachmentRecord = ProjectAttachmentRecord & {
  uploadState?: UploadProgressState;
  progress?: number;
  errorMessage?: string;
};

type DisplayChatEntry = ProjectChatEntry & {
  attachments?: DisplayAttachmentRecord[];
  isOptimistic?: boolean;
  optimisticStatus?: OptimisticMessageStatus;
  localCreatedAtMs?: number;
  serverEntryId?: string;
};

type DeletedMessageOverride = {
  deletedAt: string;
  deletedByUserId: string | null;
  displayText: string;
};

type StageChatMessagesApiResponse =
  | {
      activeStageId: string | null;
      latestRevisionId: string | null;
      entries: ProjectChatEntry[];
      revisionCount?: number;
      nextCursor: string | null;
      hasMore: boolean;
    }
  | {
      error: string;
    };

type StageChatUpdatesApiResponse =
  | StageChatRealtimeUpdatesResponse
  | {
      error: string;
    };

type ProjectCompletionApiResponse =
  | {
      completionSummary: ProjectCompletionSummary;
      completionWorkflow: ProjectCompletionWorkflowRecord | null;
    }
  | {
      error: string;
    };

type AvailableCollaboratorsApiResponse =
  | {
      collaborators: CollaboratorRecord[];
    }
  | {
      error: string;
    };

type CreateStageCommentApiResponse =
  | {
      commentId: string;
      revisionId: string | null;
      createdAt: string;
      mentionedUserIds: string[];
      clientTempId?: string | null;
      entry?: ProjectChatEntry;
    }
  | {
      error: string;
    };

const PROJECT_ASSET_INLINE_LIMIT = 4;
const STAGE_CHAT_MESSAGE_DELETE_WINDOW_MS = 5 * 60 * 1000;
const STAGE_CHAT_PENDING_TIMEOUT_MS = 60 * 1000;
const DELETED_STAGE_CHAT_MESSAGE_TEXT = "This message was deleted";
const UPLOAD_NAVIGATION_WARNING =
  "Your upload is still running. Stay on this page until it finishes, or leave and the upload may not complete.";
const UPLOAD_NAVIGATION_HISTORY_GUARD_KEY = "__gtiUploadNavigationGuard";

type MentionToken = {
  userId: string;
  name: string;
};

type MentionDropdownState = {
  start: number;
  end: number;
  query: string;
};

type RevisionReviewState = "PENDING_REVIEW" | "APPROVED" | "REJECTED";

type RevisionReplyTarget = {
  revisionId: string;
  label: string;
};

const defaultPendingRevisionReviewMessage =
  "A revision is already pending review. Please wait for the project owner to review it.";

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
  | "STAGE_SUBMISSION"
  | "STAGE_INVOICE";
type CommentUploadIntent = "COMMENT_ATTACHMENT" | "STAGE_SUBMISSION";
const MAX_RECORDING_DURATION_MS = 60_000;
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
    onDropRejected: (fileRejections) => {
      if (intent === "STAGE_SUBMISSION") {
        const rejectedFile = fileRejections[0]?.file;

        onError(
          formatUploadFileTypeError(
            buildFileTypeNotAllowedPayload({
              fileName: rejectedFile?.name ?? "Selected file",
              mimeType: rejectedFile?.type || "application/octet-stream",
              allowedExtensions: SUBMISSION_IMAGE_ALLOWED_EXTENSIONS,
              error: "Submission file type is not allowed.",
            }),
          ),
        );
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

      <p className="mt-3 text-[14px] font-semibold text-brand">
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

function ChatAvatar({
  name,
  src,
  size = "md",
}: {
  name: string;
  src?: string | null;
  size?: "sm" | "md";
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const sizeClassName =
    size === "sm" ? "h-6 w-6 text-[10px]" : "h-7 w-7 text-[10px]";

  if (src && !imageFailed) {
    return (
      <div
        className={`grid ${sizeClassName} shrink-0 place-items-center overflow-hidden rounded-full bg-[linear-gradient(145deg,#f0dcc4,#b58257)] font-semibold text-white`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={`${name} avatar`}
          className="h-full w-full object-cover"
          onError={() => setImageFailed(true)}
        />
      </div>
    );
  }

  return (
    <div
      className={`grid ${sizeClassName} shrink-0 place-items-center rounded-full bg-[linear-gradient(145deg,#f0dcc4,#b58257)] font-semibold text-white`}
    >
      {getInitials(name)}
    </div>
  );
}

function escapeMentionPattern(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getMentionTriggerState(
  value: string,
  caretPosition: number,
): MentionDropdownState | null {
  if (caretPosition < 0 || caretPosition > value.length) {
    return null;
  }

  const textBeforeCaret = value.slice(0, caretPosition);
  const mentionStart = textBeforeCaret.lastIndexOf("@");

  if (mentionStart < 0) {
    return null;
  }

  const previousCharacter = value[mentionStart - 1];

  if (previousCharacter && !/\s/.test(previousCharacter)) {
    return null;
  }

  const query = value.slice(mentionStart + 1, caretPosition);

  if (/\s/.test(query)) {
    return null;
  }

  return {
    start: mentionStart,
    end: caretPosition,
    query,
  };
}

function resolveCommentMentionUserIds(
  body: string,
  mentions: MentionToken[],
) {
  return Array.from(
    new Set(
      mentions
        .filter((mention) =>
          new RegExp(
            `(^|\\s)@${escapeMentionPattern(mention.name)}(?=[\\s.,!?;:)]|$)`,
            "u",
          ).test(body),
        )
        .map((mention) => mention.userId),
    ),
  );
}

function renderCommentBodyWithMentions(
  body: string,
  mentions?: MentionToken[],
): ReactNode {
  if (!mentions?.length) {
    return body;
  }

  const orderedMentions = [...mentions].sort((left, right) => right.name.length - left.name.length);
  const pattern = new RegExp(
    orderedMentions
      .map((mention) => `@${escapeMentionPattern(mention.name)}`)
      .join("|"),
    "gu",
  );
  const segments: ReactNode[] = [];
  let lastIndex = 0;

  for (const match of body.matchAll(pattern)) {
    const matchIndex = match.index ?? 0;
    const matchedText = match[0];

    if (matchIndex > lastIndex) {
      segments.push(body.slice(lastIndex, matchIndex));
    }

    segments.push(
      <span
        key={`${matchedText}-${matchIndex}`}
        className="inline-block rounded-full bg-[#edf7ef] px-2 py-0.5 font-semibold leading-[1.55] text-[#2b8b56]"
      >
        {matchedText}
      </span>,
    );

    lastIndex = matchIndex + matchedText.length;
  }

  if (segments.length === 0) {
    return body;
  }

  if (lastIndex < body.length) {
    segments.push(body.slice(lastIndex));
  }

  return segments;
}

function isLegacyBriefContextMessage(entry: Pick<DisplayChatEntry, "kind" | "body">) {
  if (entry.kind !== "comment") {
    return false;
  }

  const normalizedBody = entry.body.trim().toLowerCase();

  return (
    normalizedBody.startsWith("project brief:") &&
    normalizedBody.includes("stage brief:")
  );
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

function getUploadNow() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function waitForNextPaint() {
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => resolve());
    });
  });
}

function getLocalDeleteExpiresAt(createdAtMs: number) {
  return new Date(createdAtMs + STAGE_CHAT_MESSAGE_DELETE_WINDOW_MS).toISOString();
}

function hasPendingAttachmentUpload(message: DisplayChatEntry) {
  const attachments = message.attachments as DisplayAttachmentRecord[] | undefined;

  return (
    attachments?.some(
      (attachment) =>
        attachment.uploadState === "pending" ||
        attachment.uploadState === "uploading",
    ) ?? false
  );
}

function hasInFlightAttachmentUpload(message: DisplayChatEntry) {
  return (
    message.isOptimistic === true &&
    Boolean(message.attachments?.length) &&
    message.optimisticStatus !== "failed" &&
    (message.optimisticStatus === "uploading" ||
      message.optimisticStatus === "sending" ||
      hasPendingAttachmentUpload(message))
  );
}

function hasFailedAttachmentUpload(message: DisplayChatEntry) {
  const attachments = message.attachments as DisplayAttachmentRecord[] | undefined;

  return (
    attachments?.some((attachment) => attachment.uploadState === "error") ?? false
  );
}

type PendingUploadNavigation =
  | {
      kind: "href";
      href: string;
    }
  | {
      kind: "history";
      stepsBack: number;
    };

function useUploadNavigationGuard(enabled: boolean) {
  const router = useRouter();
  const enabledRef = useRef(enabled);
  const currentUrlRef = useRef<string | null>(null);
  const historyGuardIdRef = useRef<string | null>(null);
  const historyGuardActiveRef = useRef(false);
  const [pendingNavigation, setPendingNavigation] =
    useState<PendingUploadNavigation | null>(null);

  const pushHistoryGuard = useCallback(() => {
    const currentUrl = currentUrlRef.current ?? window.location.href;
    const currentState = window.history.state;
    const baseState =
      typeof currentState === "object" && currentState !== null
        ? currentState
        : {};
    const guardId = historyGuardIdRef.current ?? crypto.randomUUID();

    historyGuardIdRef.current = guardId;
    window.history.pushState(
      {
        ...baseState,
        [UPLOAD_NAVIGATION_HISTORY_GUARD_KEY]: guardId,
      },
      "",
      currentUrl,
    );
    historyGuardActiveRef.current = true;
  }, []);

  useEffect(() => {
    enabledRef.current = enabled;
    currentUrlRef.current = window.location.href;

    if (!enabled) {
      const clearPendingNavigationTimer = window.setTimeout(() => {
        setPendingNavigation(null);

        if (historyGuardActiveRef.current) {
          historyGuardActiveRef.current = false;
          window.history.back();
        }
      }, 0);

      return () => window.clearTimeout(clearPendingNavigationTimer);
    }

    if (!historyGuardActiveRef.current) {
      pushHistoryGuard();
    }
  }, [enabled, pushHistoryGuard]);

  const cancelNavigation = useCallback(() => {
    setPendingNavigation(null);
  }, []);

  const confirmNavigation = useCallback(() => {
    const navigation = pendingNavigation;

    if (!navigation) {
      return;
    }

    enabledRef.current = false;
    setPendingNavigation(null);

    if (navigation.kind === "history") {
      historyGuardActiveRef.current = false;
      window.history.go(-navigation.stepsBack);
      return;
    }

    const nextUrl = new URL(navigation.href, window.location.href);

    if (nextUrl.origin === window.location.origin) {
      router.push(`${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
      return;
    }

    window.location.assign(nextUrl.href);
  }, [pendingNavigation, router]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    function shouldConfirmNavigation() {
      return enabledRef.current;
    }

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (!shouldConfirmNavigation()) {
        return;
      }

      event.preventDefault();
      event.returnValue = UPLOAD_NAVIGATION_WARNING;
    }

    function handleDocumentClick(event: MouseEvent) {
      if (
        !shouldConfirmNavigation() ||
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.altKey ||
        event.ctrlKey ||
        event.shiftKey
      ) {
        return;
      }

      if (!(event.target instanceof Element)) {
        return;
      }

      const anchor = event.target.closest("a[href]");

      if (!(anchor instanceof HTMLAnchorElement)) {
        return;
      }

      if (anchor.target && anchor.target !== "_self") {
        return;
      }

      const nextUrl = new URL(anchor.href, window.location.href);

      if (nextUrl.href === window.location.href) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      setPendingNavigation({
        kind: "href",
        href: nextUrl.href,
      });
    }

    function handlePopState(event: PopStateEvent) {
      if (!shouldConfirmNavigation()) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      const currentUrl = currentUrlRef.current;

      if (currentUrl) {
        pushHistoryGuard();
      }

      setPendingNavigation({
        kind: "history",
        stepsBack: 2,
      });
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("popstate", handlePopState, true);
    document.addEventListener("click", handleDocumentClick, true);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("popstate", handlePopState, true);
      document.removeEventListener("click", handleDocumentClick, true);
    };
  }, [enabled, pushHistoryGuard]);

  return {
    isNavigationDialogOpen: Boolean(pendingNavigation),
    cancelNavigation,
    confirmNavigation,
  };
}

function getCommentStatusLabel(message: DisplayChatEntry) {
  if (!message.isOptimistic) {
    return message.createdAt;
  }

  if (message.optimisticStatus === "failed" || hasFailedAttachmentUpload(message)) {
    return "Failed";
  }

  if (message.optimisticStatus === "uploading" || hasPendingAttachmentUpload(message)) {
    return "Uploading…";
  }

  if (message.optimisticStatus === "sending") {
    return "Sending…";
  }

  return message.createdAt;
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
    const startedAt = getUploadNow();

    function logS3Put(status: number | string) {
      console.info("upload:s3-put", {
        status,
        durationMs: Math.round(getUploadNow() - startedAt),
        fileSize: input.file.size,
        mimeType: input.file.type || "application/octet-stream",
        assetType: input.assetType,
      });
    }

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
      logS3Put(request.status);

      if (request.status >= 200 && request.status < 300) {
        input.onProgress?.(100);
        resolve();
        return;
      }

      reject(new Error(`Upload failed with status ${request.status}.`));
    });

    request.addEventListener("error", () => {
      logS3Put("network-error");
      reject(new Error("Upload failed due to a network error."));
    });

    request.addEventListener("abort", () => {
      logS3Put("aborted");
      reject(new Error("Upload was cancelled."));
    });

    request.send(input.file);
  });
}

function logUploadHost(uploadUrl: string) {
  try {
    console.info("upload:s3-host", new URL(uploadUrl).host);
  } catch {
    // Keep upload diagnostics best-effort only.
  }
}

function getRevisionEntryId(
  entry: Pick<DisplayChatEntry, "id" | "kind" | "revisionId" | "serverEntryId">,
) {
  if (entry.kind !== "revision") {
    return entry.id;
  }

  return entry.revisionId ?? entry.serverEntryId ?? entry.id;
}

function getRevisionLabel(entry: Pick<DisplayChatEntry, "title" | "revisionNumber">) {
  if (entry.revisionNumber) {
    return `Revision ${entry.revisionNumber}`;
  }

  return entry.title?.trim() || "Revision";
}

function buildComparisonHref(
  projectId: string,
  stageId: string | null | undefined,
  baseAttachmentId: string,
  compareAttachmentId: string,
) {
  const searchParams = new URLSearchParams();

  if (stageId) {
    searchParams.set("stage", stageId);
  }

  searchParams.set("base", baseAttachmentId);
  searchParams.set("compare", compareAttachmentId);

  return `/projects/${projectId}/compare?${searchParams.toString()}`;
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

type TimelineAlignment = "left" | "right";
type TimelineWidth = "compact" | "medium" | "submission" | "wide";

const timelineWidthClassNames: Record<TimelineWidth, string> = {
  compact: "w-full max-w-[94%] sm:max-w-[66%]",
  medium: "w-full max-w-[96%] sm:max-w-[70%]",
  submission: "w-full max-w-[96%] sm:max-w-[72%] xl:max-w-[700px]",
  wide: "w-full max-w-[98%] sm:max-w-[82%] xl:max-w-[78%]",
};

function getTimelineEntryAlignment(
  entry: Pick<DisplayChatEntry, "authorId" | "author">,
  currentUserId: string,
  currentUserDisplayName: string,
): TimelineAlignment {
  if (entry.authorId) {
    return entry.authorId === currentUserId ? "right" : "left";
  }

  return entry.author.trim() === currentUserDisplayName.trim() ? "right" : "left";
}

function getTimelineActorKey(entry: Pick<DisplayChatEntry, "authorId" | "author">) {
  return entry.authorId ?? entry.author.trim().toLowerCase();
}

function shouldGroupWithPreviousMessage(
  previousMessage: DisplayChatEntry | undefined,
  message: DisplayChatEntry,
) {
  if (
    !previousMessage ||
    previousMessage.kind === "system" ||
    message.kind === "system"
  ) {
    return false;
  }

  return getTimelineActorKey(previousMessage) === getTimelineActorKey(message);
}

function TimelineGutter({
  name,
  src,
  icon,
  hidden = false,
}: {
  name?: string;
  src?: string | null;
  icon?: ReactNode;
  hidden?: boolean;
}) {
  return (
    <div className="flex w-8 shrink-0 justify-center sm:w-9">
      {hidden ? null : icon ? (
        <div className="grid h-8 w-8 place-items-center rounded-full bg-[#e6f2e8] text-brand shadow-[0_8px_18px_rgba(18,35,23,0.08)]">
          {icon}
        </div>
      ) : (
        <ChatAvatar name={name ?? "User"} src={src} size="sm" />
      )}
    </div>
  );
}

function TimelineFrame({
  alignment = "left",
  width = "medium",
  avatarName,
  avatarSrc,
  gutterIcon,
  hideGutterContent = false,
  grouped = false,
  children,
}: {
  alignment?: TimelineAlignment;
  width?: TimelineWidth;
  avatarName?: string;
  avatarSrc?: string | null;
  gutterIcon?: ReactNode;
  hideGutterContent?: boolean;
  grouped?: boolean;
  children: ReactNode;
}) {
  const verticalSpacing = grouped ? "mt-1" : "mt-2.5";

  if (alignment === "left") {
    return (
      <div
        className={`grid w-full grid-cols-[2rem_minmax(0,1fr)] items-end gap-2.5 sm:grid-cols-[2.25rem_minmax(0,1fr)] sm:gap-3 ${verticalSpacing}`}
      >
        <TimelineGutter
          name={avatarName}
          src={avatarSrc}
          icon={gutterIcon}
          hidden={hideGutterContent}
        />
        <div className={`min-w-0 ${timelineWidthClassNames[width]}`}>{children}</div>
      </div>
    );
  }

  return (
    <div className={`flex w-full justify-end ${verticalSpacing}`}>
      <div className={`min-w-0 ${timelineWidthClassNames[width]}`}>{children}</div>
    </div>
  );
}

function getSystemActivityMeta(message: DisplayChatEntry) {
  const text = `${message.title ?? ""} ${message.body}`.toLowerCase();

  if (
    text.includes("reject") ||
    text.includes("revision requested") ||
    text.includes("failed") ||
    text.includes("cannot")
  ) {
    return {
      label: "Action required",
      Icon: Info,
      cardClassName: "border-[#f0d0cc] bg-[#fff8f6]",
      iconClassName: "bg-[#fff0ef] text-[#c14f46]",
      titleClassName: "text-[#8f3832]",
      bodyClassName: "text-[#5f403c]",
    };
  }

  if (
    text.includes("waiting") ||
    text.includes("pending") ||
    text.includes("not available")
  ) {
    return {
      label: "Waiting",
      Icon: Info,
      cardClassName: "border-[#efd9af] bg-[#fffaf0]",
      iconClassName: "bg-[#fff3d6] text-[#b77420]",
      titleClassName: "text-[#8a5718]",
      bodyClassName: "text-[#5d4a2f]",
    };
  }

  if (
    text.includes("accepted") ||
    text.includes("approved") ||
    text.includes("completed") ||
    text.includes("uploaded") ||
    text.includes("started")
  ) {
    return {
      label: "Workflow update",
      Icon: CheckCircle2,
      cardClassName: "border-[#c8e1ce] bg-[#f4fbf5]",
      iconClassName: "bg-[#e2f4e6] text-brand",
      titleClassName: "text-[#173120]",
      bodyClassName: "text-[#405044]",
    };
  }

  return {
    label: "Project update",
    Icon: Info,
    cardClassName: "border-[#d3e1ea] bg-[#f6fbff]",
    iconClassName: "bg-[#e7f3fb] text-[#3e78a6]",
    titleClassName: "text-[#253d4f]",
    bodyClassName: "text-[#435666]",
  };
}

function SystemActivityCard({
  message,
  alignment = "left",
}: {
  message: DisplayChatEntry;
  alignment?: TimelineAlignment;
}) {
  const meta = getSystemActivityMeta(message);
  const Icon = meta.Icon;

  return (
    <TimelineFrame
      alignment={alignment}
      width="medium"
      avatarName={message.author}
      avatarSrc={message.authorAvatarSrc}
      gutterIcon={<Icon className="h-4 w-4" />}
    >
      <div
        className={`w-full rounded-[18px] border px-4 py-3 shadow-[0_10px_24px_rgba(23,39,28,0.05)] ${
          alignment === "right" ? "rounded-br-[7px]" : "rounded-bl-[7px]"
        } ${meta.cardClassName}`}
      >
        <div className="flex items-start">
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <span className="rounded-full bg-white/65 px-2.5 py-1 text-[9px] font-[800] uppercase tracking-[0.08em] text-[#657269]">
                {meta.label}
              </span>
              <span className="text-[10px] font-semibold text-[#7a837b]">
                {message.createdAt}
              </span>
            </div>
            <p className={`mt-1 text-[13px] font-[800] ${meta.titleClassName}`}>
              {message.title ?? "Project activity"}
            </p>
            <p className={`mt-1 whitespace-pre-wrap break-words text-[12px] leading-5 ${meta.bodyClassName}`}>
              {message.body}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] font-semibold uppercase tracking-wide text-[#6c776e]">
              <span>{alignment === "right" ? "You" : message.author}</span>
              {alignment === "right" && message.author !== "You" ? (
                <span className="normal-case tracking-normal text-[#7a837b]">
                  {message.author}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </TimelineFrame>
  );
}

function WorkflowNoticeCard({
  title,
  body,
  alignment = "left",
}: {
  title: string;
  body: string;
  alignment?: TimelineAlignment;
}) {
  return (
    <TimelineFrame
      alignment={alignment}
      width="medium"
      gutterIcon={<Info className="h-4 w-4" />}
    >
      <div
        className={`w-full rounded-[18px] border border-[#efd9af] bg-[#fffaf0] px-4 py-3 shadow-[0_10px_24px_rgba(23,39,28,0.05)] ${
          alignment === "right" ? "rounded-br-[7px]" : "rounded-bl-[7px]"
        }`}
      >
        <div className="flex items-start">
          <div className="min-w-0">
            <p className="text-[13px] font-[800] text-[#8a5718]">{title}</p>
            <p className="mt-1 whitespace-pre-wrap break-words text-[12px] leading-5 text-[#5d4a2f]">
              {body}
            </p>
          </div>
        </div>
      </div>
    </TimelineFrame>
  );
}

function StageBriefContextCard({
  projectBriefText,
  stageBriefText,
  projectBriefAttachments,
  stageBriefAttachments,
  createdBy,
  createdAt,
  stageLabel,
  canAcceptBrief,
  isAcceptingBrief,
  onAcceptBrief,
  onOpenProjectBrief,
  onOpenStageBrief,
}: {
  projectBriefText: string;
  stageBriefText: string;
  projectBriefAttachments: DisplayAttachmentRecord[];
  stageBriefAttachments: DisplayAttachmentRecord[];
  createdBy: string;
  createdAt: string;
  stageLabel: string;
  canAcceptBrief: boolean;
  isAcceptingBrief: boolean;
  onAcceptBrief: () => void;
  onOpenProjectBrief: () => void;
  onOpenStageBrief: () => void;
}) {
  const hasProjectBrief = projectBriefText.length > 0;
  const hasStageBrief = stageBriefText.length > 0;
  const hasProjectAttachments = projectBriefAttachments.length > 0;
  const hasStageAttachments = stageBriefAttachments.length > 0;

  return (
    <TimelineFrame
      alignment="left"
      width="medium"
      gutterIcon={<FileText className="h-4 w-4" />}
    >
      <Card className="w-full overflow-hidden rounded-[20px] rounded-bl-[7px] border border-[#cfe3d2] bg-white shadow-[0_12px_30px_rgba(18,35,23,0.07)]">
        <div className="border-b border-[#e4ece5] bg-[linear-gradient(135deg,#f4fbf5,#ffffff)] px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#e4f3e7] text-brand">
              <FileText className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="rounded-full bg-[#edf7ef] px-3 py-1 text-[10px] font-[800] uppercase tracking-[0.08em] text-brand">
                  Brief
                </span>
                <span className="text-[10px] font-semibold text-[#7a837b]">
                  {createdAt}
                </span>
              </div>
              <p className="mt-1 text-[15px] font-[800] text-[#111712]">
                Review {stageLabel} brief before starting work
              </p>
              <p className="mt-1 text-[12px] leading-5 text-[#526057]">
                Created by {createdBy}
              </p>
            </div>
          </div>
        </div>

        <CardContent className="space-y-3 px-4 py-4 sm:px-5">
          <div className="grid gap-3 lg:grid-cols-2">
            <section className="min-w-0 rounded-[16px] border border-[#dfe9e0] bg-[#fbfcfa] p-3.5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] font-[800] uppercase tracking-[0.08em] text-[#607064]">
                  Project Brief
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-8 rounded-full px-3 text-[11px]"
                  onClick={onOpenProjectBrief}
                >
                  View
                </Button>
              </div>
              <div className="mt-3 max-h-32 overflow-y-auto pr-1">
                <p className="whitespace-pre-wrap break-words text-[13px] leading-5 text-[#26312a]">
                  {hasProjectBrief ? projectBriefText : "No project brief has been added."}
                </p>
              </div>
              {hasProjectAttachments ? (
                <div className="mt-3">
                  <p className="text-[10px] font-[800] uppercase tracking-[0.08em] text-[#718076]">
                    Attachments
                  </p>
                  <AttachmentHistoryList attachments={projectBriefAttachments} compact />
                </div>
              ) : null}
            </section>

            <section className="min-w-0 rounded-[16px] border border-[#dfe9e0] bg-[#fbfcfa] p-3.5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] font-[800] uppercase tracking-[0.08em] text-[#607064]">
                  Stage Brief
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-8 rounded-full px-3 text-[11px]"
                  onClick={onOpenStageBrief}
                >
                  View
                </Button>
              </div>
              <div className="mt-3 max-h-32 overflow-y-auto pr-1">
                <p className="whitespace-pre-wrap break-words text-[13px] leading-5 text-[#26312a]">
                  {hasStageBrief ? stageBriefText : "No stage brief has been added for this stage."}
                </p>
              </div>
              {hasStageAttachments ? (
                <div className="mt-3">
                  <p className="text-[10px] font-[800] uppercase tracking-[0.08em] text-[#718076]">
                    Attachments
                  </p>
                  <AttachmentHistoryList attachments={stageBriefAttachments} compact />
                </div>
              ) : null}
            </section>
          </div>

          <div className="flex flex-col gap-3 rounded-[16px] border border-[#d8e5d9] bg-[#f7fbf6] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[12px] leading-5 text-[#516058]">
              Main Executor must accept the brief before submitting work for this stage.
            </p>
            {canAcceptBrief ? (
              <Button
                type="button"
                className="shrink-0 rounded-full text-[12px]"
                onClick={onAcceptBrief}
                disabled={isAcceptingBrief}
              >
                {isAcceptingBrief ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : null}
                Accept Brief
              </Button>
            ) : (
              <span className="shrink-0 rounded-full bg-[#fff3d6] px-3 py-2 text-[11px] font-[700] text-[#8a5718]">
                Waiting for Main Executor
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </TimelineFrame>
  );
}

function AttachmentHistoryList({
  attachments,
  compact = false,
  actionsDisabled = false,
  tone = "workflow",
}: {
  attachments: DisplayAttachmentRecord[];
  compact?: boolean;
  actionsDisabled?: boolean;
  tone?: "sent" | "received" | "workflow";
}) {
  if (attachments.length === 0) {
    return null;
  }

  const attachmentCardClassName =
    tone === "sent"
      ? "border-[#c7e3ce] bg-white/78"
      : tone === "received"
        ? "border-[#e1e9e2] bg-[#fbfcfa]"
        : "border-[#e1e9e2] bg-white/92";

  return (
    <div className={compact ? "mt-3 min-w-0 max-w-full space-y-2" : "mt-3 min-w-0 max-w-full space-y-2.5"}>
      {attachments.map((attachment) => (
        (() => {
          const effectiveSubmissionStatus = attachment.isSubmission
            ? (attachment.submissionReviewStatus ?? "PENDING_REVIEW")
            : null;

          return (
            <div
              key={attachment.id}
              className={`w-full min-w-0 max-w-full overflow-hidden rounded-[14px] border px-3 py-2.5 text-[#111712] shadow-[0_10px_22px_rgba(18,35,23,0.06)] ${attachmentCardClassName} ${
                compact ? "sm:max-w-[360px]" : ""
              }`}
            >
              <div className="flex min-w-0 items-start gap-3">
                <div
                  className={`grid h-8 w-8 shrink-0 place-items-center rounded-md text-[10px] font-semibold ${getFileBadgeClass(
                    attachment.fileTypeLabel,
                  )}`}
                >
                  {attachment.fileTypeLabel}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <p className="min-w-0 max-w-full flex-1 truncate text-[12px] font-semibold text-[#111712]">
                      {attachment.originalFileName}
                    </p>
                    {attachment.uploadState ? (
                      <span
                        className={`inline-flex shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide leading-none ${
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
                      <span className="inline-flex shrink-0 whitespace-nowrap rounded-full bg-[#edf7ef] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide leading-none text-[#2b8b56]">
                        {attachment.submissionNumber
                          ? `Submission ${attachment.submissionNumber}`
                          : "Submission"}
                      </span>
                    ) : null}
                    {attachment.isSubmission && !attachment.uploadState ? (
                      <span
                        className={`inline-flex shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide leading-none ${
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
                          ? `${attachment.fileSizeLabel} · Uploaded`
                          : attachment.uploadState === "pending"
                            ? `${attachment.fileSizeLabel} · Waiting to upload`
                            : `${attachment.fileSizeLabel} · ${attachment.progress ?? 0}% uploaded`
                      : `${attachment.fileSizeLabel} · Uploaded by ${attachment.uploadedBy}`}
                  </p>
                  {!attachment.uploadState ? (
                    <p className="text-[10px] leading-4 text-[#89928b]">
                      {attachment.uploadedAt}
                    </p>
                  ) : null}
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
                  <div className="flex shrink-0 items-center gap-1">
                    <AssetPreviewButton
                      fileName={attachment.originalFileName}
                      mimeType={attachment.mimeType}
                      previewPath={attachment.previewPath}
                      downloadPath={attachment.downloadPath}
                      triggerClassName="size-8 rounded-full text-brand"
                    />
                    <AttachmentFavoriteButton
                      attachmentId={attachment.id}
                      initialIsFavorited={attachment.isFavoritedByCurrentUser}
                      className="size-8 rounded-full text-[#7a847d] hover:bg-[#fff4f5]"
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

function BriefDialog({
  isOpen,
  labelledById,
  title,
  heading,
  context,
  body,
  emptyMessage,
  attachmentsTitle,
  attachments,
  onClose,
}: {
  isOpen: boolean;
  labelledById: string;
  title: string;
  heading: string;
  context?: string;
  body: string;
  emptyMessage: string;
  attachmentsTitle: string;
  attachments: DisplayAttachmentRecord[];
  onClose: () => void;
}) {
  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#112118]/45 px-4 py-8 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledById}
    >
      <Card className="flex max-h-[88vh] w-full max-w-[720px] flex-col rounded-[28px] border border-[#e1e7e1] shadow-[0_35px_90px_rgba(11,26,18,0.22)]">
        <CardHeader className="flex-row items-start justify-between gap-4 space-y-0 p-6 sm:p-7">
          <div>
            <CardTitle
              id={labelledById}
              className="text-[24px] font-semibold tracking-tight text-[#111712]"
            >
              {title}
            </CardTitle>
            <p className="mt-2 text-[14px] font-semibold text-[#111712]">
              {heading}
            </p>
            {context ? (
              <p className="mt-1 text-[13px] leading-5 text-[#6a706b]">
                {context}
              </p>
            ) : null}
          </div>
          <Button
            type="button"
            variant="secondary"
            size="icon"
            onClick={onClose}
            className="shrink-0 border border-line"
            aria-label={`Close ${title.toLowerCase()}`}
          >
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 overflow-y-auto px-6 pb-6 pt-0 sm:px-7 sm:pb-7">
          {body ? (
            <section className="rounded-[20px] border border-line bg-[#fbfcfa] p-4">
              <p className="whitespace-pre-wrap text-[14px] leading-6 text-[#253028]">
                {body}
              </p>
            </section>
          ) : (
            <div className="rounded-[20px] border border-line bg-[#fbfcfa] px-4 py-5 text-[14px] leading-6 text-[#6a706b]">
              {emptyMessage}
            </div>
          )}

          <section className="mt-5 rounded-[20px] border border-line bg-white p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#70806f]">
              {attachmentsTitle}
            </p>
            {attachments.length > 0 ? (
              <AttachmentHistoryList attachments={attachments} compact />
            ) : (
              <p className="mt-2 text-[13px] leading-5 text-[#7a837b]">
                No attachments available.
              </p>
            )}
          </section>
        </CardContent>
      </Card>
    </div>
  );
}

function getFileNameDisplayParts(fileName: string) {
  const safeFileName = fileName.trim() || "Untitled file";
  const dotIndex = safeFileName.lastIndexOf(".");

  if (dotIndex <= 0 || dotIndex === safeFileName.length - 1) {
    return {
      stem: safeFileName,
      extension: "",
    };
  }

  return {
    stem: safeFileName.slice(0, dotIndex),
    extension: safeFileName.slice(dotIndex),
  };
}

function ProjectAssetCard({
  attachment,
  actionsDisabled = false,
  favoriteOverrides,
  onFavoriteChange,
}: {
  attachment: DisplayAttachmentRecord;
  actionsDisabled?: boolean;
  favoriteOverrides?: Record<string, boolean>;
  onFavoriteChange?: (attachmentId: string, isFavorited: boolean) => void;
}) {
  const { stem, extension } = getFileNameDisplayParts(attachment.originalFileName);
  const uploadedBy = attachment.uploadedBy.trim() || "Unknown user";
  const canShowActions =
    !actionsDisabled && Boolean(attachment.previewPath && attachment.downloadPath);
  const isFavorited =
    favoriteOverrides?.[attachment.id] ?? attachment.isFavoritedByCurrentUser;

  return (
    <article className="group flex aspect-square min-h-[150px] min-w-0 flex-col overflow-hidden rounded-[18px] border border-[#dce6dd] bg-[#fbfcfa] p-3 shadow-[0_8px_20px_rgba(18,35,23,0.04)] transition duration-200 hover:-translate-y-0.5 hover:border-brand/35 hover:bg-white hover:shadow-[0_16px_34px_rgba(18,35,23,0.09)]">
      <div className="min-w-0">
        <div
          className="flex min-w-0 items-baseline text-[12px] font-[800] leading-4 text-[#111712]"
          title={attachment.originalFileName}
        >
          <span className="min-w-0 truncate">{stem}</span>
          {extension ? <span className="shrink-0">{extension}</span> : null}
        </div>
        <p className="mt-1 truncate text-[11px] font-[600] leading-4 text-[#667168]">
          Uploaded by {uploadedBy}
        </p>
      </div>

      <div className="mt-3 min-w-0 space-y-1.5">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span
            className={`inline-flex h-6 max-w-full shrink-0 items-center justify-center rounded-md px-2 text-[9px] font-[800] uppercase leading-none ${getFileBadgeClass(
              attachment.fileTypeLabel,
            )}`}
          >
            {attachment.fileTypeLabel}
          </span>
          <span className="truncate text-[10px] font-[600] leading-4 text-[#7a837b]">
            {attachment.fileSizeLabel}
          </span>
        </div>
        <p className="truncate text-[10px] leading-4 text-[#89928b]">
          {attachment.uploadedAt}
        </p>
      </div>

      {canShowActions ? (
        <div className="mt-auto flex items-center justify-end gap-1 border-t border-[#e4ebe5] pt-2.5">
          <AssetPreviewButton
            fileName={attachment.originalFileName}
            mimeType={attachment.mimeType}
            previewPath={attachment.previewPath}
            downloadPath={attachment.downloadPath}
            triggerClassName="size-8 rounded-full text-brand hover:bg-[#eef7ef]"
          />
          <AttachmentFavoriteButton
            key={`${attachment.id}-${isFavorited ? "favorited" : "not-favorited"}`}
            attachmentId={attachment.id}
            initialIsFavorited={isFavorited}
            className="size-8 rounded-full text-[#7a847d] hover:bg-[#fff4f5]"
            onChange={(nextState) => onFavoriteChange?.(attachment.id, nextState)}
          />
          <Button
            asChild
            variant="ghost"
            size="icon"
            className="size-8 rounded-full text-brand hover:bg-[#eef7ef]"
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
    </article>
  );
}

function ProjectAssetGrid({
  attachments,
  actionsDisabled = false,
  variant = "inline",
  favoriteOverrides,
  onFavoriteChange,
}: {
  attachments: DisplayAttachmentRecord[];
  actionsDisabled?: boolean;
  variant?: "inline" | "modal";
  favoriteOverrides?: Record<string, boolean>;
  onFavoriteChange?: (attachmentId: string, isFavorited: boolean) => void;
}) {
  const gridClassName =
    variant === "modal"
      ? "grid grid-cols-[repeat(auto-fill,minmax(156px,1fr))] gap-3"
      : "grid grid-cols-2 gap-2.5";

  return (
    <div className={gridClassName}>
      {attachments.map((attachment) => (
        <ProjectAssetCard
          key={attachment.id}
          attachment={attachment}
          actionsDisabled={actionsDisabled}
          favoriteOverrides={favoriteOverrides}
          onFavoriteChange={onFavoriteChange}
        />
      ))}
    </div>
  );
}

function ProjectAssetsModal({
  isOpen,
  attachments,
  actionsDisabled = false,
  favoriteOverrides,
  onFavoriteChange,
  onClose,
}: {
  isOpen: boolean;
  attachments: DisplayAttachmentRecord[];
  actionsDisabled?: boolean;
  favoriteOverrides?: Record<string, boolean>;
  onFavoriteChange?: (attachmentId: string, isFavorited: boolean) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  const assetCountLabel = `${attachments.length} ${
    attachments.length === 1 ? "asset" : "assets"
  }`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#112118]/45 px-4 py-8 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="project-assets-modal-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <Card className="flex h-full max-h-[88vh] w-full max-w-[860px] flex-col rounded-[28px] border border-[#e1e7e1] shadow-[0_35px_90px_rgba(11,26,18,0.22)]">
        <CardHeader className="flex-row items-start justify-between gap-4 space-y-0 p-6 sm:p-7">
          <div className="min-w-0">
            <CardTitle
              id="project-assets-modal-title"
              className="text-[24px] font-semibold tracking-tight text-[#111712]"
            >
              Project Assets
            </CardTitle>
            <p className="mt-2 text-[13px] font-[600] text-[#6a706b]">
              {assetCountLabel}
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="icon"
            onClick={onClose}
            className="shrink-0 border border-line"
            aria-label="Close project assets"
          >
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 overflow-y-auto px-6 pb-6 pt-0 sm:px-7 sm:pb-7">
          <ProjectAssetGrid
            attachments={attachments}
            actionsDisabled={actionsDisabled}
            variant="modal"
            favoriteOverrides={favoriteOverrides}
            onFavoriteChange={onFavoriteChange}
          />
        </CardContent>
      </Card>
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
  onUploadStart?: (file: File) => void;
}): Promise<{ attachmentId: string; uploadedFile: File }> {
  const uploadFile = input.file;

  input.onUploadStart?.(uploadFile);

  const uploadUrlStartedAt = getUploadNow();
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
      originalFileName: uploadFile.name,
      mimeType: uploadFile.type || "application/octet-stream",
      fileSize: uploadFile.size,
      assetType: input.assetType,
    }),
  });
  console.info("upload:upload-url", {
    status: requestUploadResponse.status,
    durationMs: Math.round(getUploadNow() - uploadUrlStartedAt),
    fileSize: uploadFile.size,
    mimeType: uploadFile.type || "application/octet-stream",
    assetType: input.assetType,
  });

  const uploadPayload = (await requestUploadResponse.json()) as {
    error?: string;
    attachmentId?: string;
    uploadUrl?: string;
  } & Partial<UploadFileTypeErrorPayload>;

  if (!requestUploadResponse.ok || !uploadPayload.attachmentId || !uploadPayload.uploadUrl) {
    throw new Error(getUploadErrorMessage(uploadPayload, "Unable to prepare the upload."));
  }

  logUploadHost(uploadPayload.uploadUrl);

  try {
    await uploadFileToS3WithProgress({
      uploadUrl: uploadPayload.uploadUrl,
      file: uploadFile,
      fileIndex: input.fileIndex,
      fileCount: input.fileCount,
      assetType: input.assetType,
      onProgress: input.onProgress,
    });

    const completionStartedAt = getUploadNow();
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
    console.info("upload:complete", {
      status: completionResponse.status,
      durationMs: Math.round(getUploadNow() - completionStartedAt),
      fileSize: uploadFile.size,
      mimeType: uploadFile.type || "application/octet-stream",
      assetType: input.assetType,
    });

    const completionPayload = (await completionResponse.json()) as {
      error?: string;
    } & Partial<UploadFileTypeErrorPayload>;

    if (!completionResponse.ok) {
      throw new Error(
        getUploadErrorMessage(completionPayload, "Unable to finalise the upload."),
      );
    }

    return {
      attachmentId: uploadPayload.attachmentId,
      uploadedFile: uploadFile,
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

async function completePreparedAttachmentUpload(input: {
  attachmentId: string;
  projectId: string;
  file: File;
  assetType: UploadAssetType;
}) {
  const completionStartedAt = getUploadNow();
  const completionResponse = await fetch(
    "/api/project-assets/chat-comment-upload/complete",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        attachmentId: input.attachmentId,
        projectId: input.projectId,
      }),
    },
  );
  console.info("upload:complete", {
    status: completionResponse.status,
    durationMs: Math.round(getUploadNow() - completionStartedAt),
    fileSize: input.file.size,
    mimeType: input.file.type || "application/octet-stream",
    assetType: input.assetType,
  });

  const completionPayload = (await completionResponse.json()) as {
    error?: string;
  } & Partial<UploadFileTypeErrorPayload>;

  if (!completionResponse.ok) {
    throw new Error(
      getUploadErrorMessage(completionPayload, "Unable to finalise the upload."),
    );
  }
}

async function cancelPreparedCommentUpload(input: {
  commentId: string;
  projectId: string;
}) {
  const response = await fetch("/api/project-assets/chat-comment-upload/cancel", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
  const payload = (await response.json()) as { error?: string };

  if (!response.ok) {
    throw new Error(payload.error || "Unable to cancel the upload.");
  }
}

async function finalizePreparedCommentUpload(input: {
  commentId: string;
  projectId: string;
}) {
  const response = await fetch("/api/project-assets/chat-comment-upload/finalize", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
  const payload = (await response.json()) as { error?: string };

  if (!response.ok) {
    throw new Error(payload.error || "Unable to finalize the upload.");
  }
}

type PreparedPendingUpload = {
  pendingFile: PendingFile;
  uploadFile: File;
};

type ChatCommentUploadPrepareResponse =
  | ({ error?: string } & Partial<UploadFileTypeErrorPayload>)
  | {
      commentId: string;
      revisionId: string | null;
      mentionedUserIds: string[];
      uploads: Array<{
        clientId?: string;
        attachmentId: string;
        fileName: string;
        uploadUrl: string;
        storageKey: string;
      }>;
    };

export function ProjectChatWorkspace({
  project,
  stageId,
  history,
  availableCollaborators,
  currentUserId,
  currentUserAvatarSrc,
  canManageCollaborators,
  canManageChatVisibility,
  completionSummary,
  completionWorkflow,
  deferCompletionData = false,
}: ProjectChatWorkspaceProps) {
  const router = useRouter();
  const [collaborators, setCollaborators] = useState<ProjectCollaboratorRecord[]>(
    project.collaborators,
  );
  const [executors, setExecutors] = useState(project.executors);
  const [availableCollaboratorRecords, setAvailableCollaboratorRecords] =
    useState<CollaboratorRecord[]>(availableCollaborators);
  const [draft, setDraft] = useState("");
  const [replyingToRevision, setReplyingToRevision] =
    useState<RevisionReplyTarget | null>(null);
  const [selectedMentionTokens, setSelectedMentionTokens] = useState<MentionToken[]>([]);
  const [draftSelectionStart, setDraftSelectionStart] = useState(0);
  const [activeMentionIndex, setActiveMentionIndex] = useState(0);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [pendingCommentFiles, setPendingCommentFiles] = useState<PendingFile[]>([]);
  const [expandedMessageEditorOpen, setExpandedMessageEditorOpen] = useState(false);
  const [loadedHistoryEntries, setLoadedHistoryEntries] = useState<ProjectChatEntry[]>(
    history.entries,
  );
  const [olderMessagesCursor, setOlderMessagesCursor] = useState<string | null>(
    history.nextCursor ?? null,
  );
  const [hasEarlierMessages, setHasEarlierMessages] = useState(
    Boolean(history.hasMore && history.nextCursor),
  );
  const [isLoadingEarlierMessages, setIsLoadingEarlierMessages] = useState(false);
  const [olderMessagesError, setOlderMessagesError] = useState<string | null>(null);
  const [stageRevisionCount, setStageRevisionCount] = useState(
    history.revisionCount ?? history.entries.filter((entry) => entry.kind === "revision").length,
  );
  const [optimisticComments, setOptimisticComments] = useState<DisplayChatEntry[]>([]);
  const [confirmedComments, setConfirmedComments] = useState<DisplayChatEntry[]>([]);
  const [deletedMessageOverrides, setDeletedMessageOverrides] = useState<
    Record<string, DeletedMessageOverride>
  >({});
  const [deleteMessageTarget, setDeleteMessageTarget] =
    useState<DisplayChatEntry | null>(null);
  const [deleteMessageError, setDeleteMessageError] = useState<string | null>(null);
  const [isDeletingMessage, setIsDeletingMessage] = useState(false);
  const [deleteMenuNow, setDeleteMenuNow] = useState(() => Date.now());
  const [pendingRevisionReviewId, setPendingRevisionReviewId] = useState<string | null>(null);
  const [revisionReviewOverrides, setRevisionReviewOverrides] = useState<
    Record<
      string,
      {
        status: RevisionReviewState;
        rejectionReason: string | null;
        reviewedBy?: string | null;
        reviewedAt?: string | null;
      }
    >
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
  const [isUploadingStageInvoice, setIsUploadingStageInvoice] = useState(false);
  const [stageInvoiceError, setStageInvoiceError] = useState<string | null>(null);
  const [invoiceRequestDialogOpen, setInvoiceRequestDialogOpen] = useState(false);
  const [invoiceRequestRecipientId, setInvoiceRequestRecipientId] = useState("");
  const [invoiceRequestNote, setInvoiceRequestNote] = useState(
    "Please upload the invoice for this completed stage.",
  );
  const [invoiceRequestError, setInvoiceRequestError] = useState<string | null>(null);
  const [isRequestingStageInvoice, setIsRequestingStageInvoice] = useState(false);
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
  const [projectBriefDialogOpen, setProjectBriefDialogOpen] = useState(false);
  const [stageBriefDialogOpen, setStageBriefDialogOpen] = useState(false);
  const [projectAssetsModalOpen, setProjectAssetsModalOpen] = useState(false);
  const [projectAssetFavoriteOverrides, setProjectAssetFavoriteOverrides] = useState<
    Record<string, boolean>
  >({});
  const [acceptBriefError, setAcceptBriefError] = useState<string | null>(null);
  const [isAcceptingBrief, setIsAcceptingBrief] = useState(false);
  const [stageCardOverrides, setStageCardOverrides] = useState<
    Record<
      string,
      {
        actualStartedAt: string;
        actualStartedAtValue: string | null;
        startedByName?: string | null;
        status?: ProjectStageRecord["status"];
        invoiceAttachment?: ProjectStageRecord["invoiceAttachment"];
        invoiceRequest?: ProjectStageRecord["invoiceRequest"];
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
  const [draftCollaboratorIds, setDraftCollaboratorIds] = useState<string[]>([]);
  const [collaboratorDialogOpen, setCollaboratorDialogOpen] = useState(false);
  const [collaboratorSaving, setCollaboratorSaving] = useState(false);
  const [collaboratorDialogError, setCollaboratorDialogError] = useState<string>();
  const [completionOverrides, setCompletionOverrides] =
    useState<Partial<ProjectCompletionSummary> | null>(null);
  const [completionData, setCompletionData] = useState<{
    summary: ProjectCompletionSummary;
    workflow: ProjectCompletionWorkflowRecord | null;
  }>({
    summary: completionSummary,
    workflow: completionWorkflow,
  });
  const [isCompletionDataLoading, setIsCompletionDataLoading] =
    useState(deferCompletionData);
  const [projectCompletionConfirmOpen, setProjectCompletionConfirmOpen] = useState(false);
  const [projectCompletionError, setProjectCompletionError] = useState<string | null>(null);
  const [isPreparingProjectCompletion, setIsPreparingProjectCompletion] = useState(false);
  const [archivePreparation, setArchivePreparation] =
    useState<ProjectArchivePreparation | null>(null);
  const [archiveFileNames, setArchiveFileNames] = useState<Record<string, string>>({});
  const [archiveFileErrors, setArchiveFileErrors] = useState<Record<string, string>>({});
  const [archiveCategoryId, setArchiveCategoryId] = useState<string>("");
  const [archiveCompletionError, setArchiveCompletionError] = useState<string | null>(null);
  const [isCompletingProject, setIsCompletingProject] = useState(false);
  const [, startRefresh] = useTransition();
  const revisionFileInputRef = useRef<HTMLInputElement | null>(null);
  const commentAttachmentInputRef = useRef<HTMLInputElement | null>(null);
  const stageInvoiceInputRef = useRef<HTMLInputElement | null>(null);
  const draftInputRef = useRef<HTMLTextAreaElement | null>(null);
  const expandedDraftInputRef = useRef<HTMLTextAreaElement | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);
  const mentionDropdownRef = useRef<HTMLDivElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimeoutRef = useRef<number | null>(null);
  const [collaboratorForm, setCollaboratorForm] = useState<CollaboratorForm>({
    name: "",
    email: "",
    type: "GTI_INTERNAL_CLIENT",
  });
  const [isNearChatBottom, setIsNearChatBottom] = useState(true);
  const [newRealtimeMessageCount, setNewRealtimeMessageCount] = useState(0);
  const [realtimeWatermark, setRealtimeWatermark] = useState<string | null>(null);
  const confirmedClientTempIdsRef = useRef<Set<string>>(new Set());
  const failedClientTempIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setDeleteMenuNow(Date.now());
    }, 15_000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setLoadedHistoryEntries(history.entries);
    setOlderMessagesCursor(history.nextCursor ?? null);
    setHasEarlierMessages(Boolean(history.hasMore && history.nextCursor));
    setStageRevisionCount(
      history.revisionCount ??
        history.entries.filter((entry) => entry.kind === "revision").length,
    );
    setOlderMessagesError(null);
    setRealtimeWatermark(null);
    setNewRealtimeMessageCount(0);
    setIsNearChatBottom(true);
    confirmedClientTempIdsRef.current.clear();
    failedClientTempIdsRef.current.clear();
  }, [
    history.activeStageId,
    history.entries,
    history.hasMore,
    history.nextCursor,
    history.revisionCount,
  ]);

  useEffect(() => {
    const input = draftInputRef.current;

    if (!input) {
      return;
    }

    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 168)}px`;
    input.style.overflowY = input.scrollHeight > 168 ? "auto" : "hidden";
  }, [draft]);

  useEffect(() => {
    if (!expandedMessageEditorOpen) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const input = expandedDraftInputRef.current;
      input?.focus();
      input?.setSelectionRange(input.value.length, input.value.length);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [expandedMessageEditorOpen]);

  function handleProjectAssetFavoriteChange(
    attachmentId: string,
    isFavorited: boolean,
  ) {
    setProjectAssetFavoriteOverrides((current) => ({
      ...current,
      [attachmentId]: isFavorited,
    }));
  }

  const messages = loadedHistoryEntries;
  const completionState = completionOverrides
    ? { ...completionData.summary, ...completionOverrides }
    : completionData.summary;
  const effectiveCompletionWorkflow = completionData.workflow;
  const inlineProjectAssets = project.attachments.slice(0, PROJECT_ASSET_INLINE_LIMIT);
  const hasMoreProjectAssets =
    project.attachments.length > PROJECT_ASSET_INLINE_LIMIT;
  const stageCards = useMemo(
    () =>
      project.stageCards.map((stage) => {
        const override = stageCardOverrides[stage.id];

        return override
          ? {
              ...stage,
              actualStartedAt: override.actualStartedAt,
              actualStartedAtValue: override.actualStartedAtValue,
              startedByName: override.startedByName ?? stage.startedByName,
              status: override.status ?? stage.status,
              invoiceAttachment:
                override.invoiceAttachment === undefined
                  ? stage.invoiceAttachment
                  : override.invoiceAttachment,
              invoiceRequest:
                override.invoiceRequest === undefined
                  ? stage.invoiceRequest
                  : override.invoiceRequest,
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
              attachment.uploadState === "pending" ||
              attachment.uploadState === "uploading",
          ) ?? false
        );
      }),
    [optimisticComments, serverMessageIds],
  );
  const isUploadNavigationGuardEnabled = useMemo(
    () =>
      isUploadingRevision ||
      isUploadingStageInvoice ||
      optimisticComments.some(hasInFlightAttachmentUpload),
    [isUploadingRevision, isUploadingStageInvoice, optimisticComments],
  );
  const uploadNavigationGuard = useUploadNavigationGuard(isUploadNavigationGuardEnabled);
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
    () => {
      const localMessages = [
        ...visibleOptimisticComments,
        ...visibleConfirmedComments,
      ].sort(
        (left, right) =>
          (left.localCreatedAtMs ?? 0) - (right.localCreatedAtMs ?? 0),
      );
      const combinedMessages: DisplayChatEntry[] = [
        ...messages.filter(
          (message) => !serverEntryIdsWithLocalOverrides.has(message.id),
        ),
        ...localMessages,
      ];

      return combinedMessages
        .map((message) => {
          const serverMessageId = message.serverEntryId ?? message.id;
          const deletedOverride = deletedMessageOverrides[serverMessageId];

          if (!deletedOverride) {
            return message;
          }

          return {
            ...message,
            body: deletedOverride.displayText,
            deletedAt: deletedOverride.deletedAt,
            deletedByUserId: deletedOverride.deletedByUserId,
            canDeleteUntil: null,
            mentions: [],
            attachments: [],
          };
        })
        .filter((message) => !isLegacyBriefContextMessage(message));
    },
    [
      deletedMessageOverrides,
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
  const revisionMessages = useMemo(
    () => displayedMessages.filter((entry) => entry.kind === "revision"),
    [displayedMessages],
  );
  const latestRevisionMessage = revisionMessages.at(-1) ?? null;
  const latestRevisionEntryId = latestRevisionMessage
    ? getRevisionEntryId(latestRevisionMessage)
    : null;
  const latestRevisionStatus = latestRevisionMessage
    ? revisionReviewOverrides[getRevisionEntryId(latestRevisionMessage)]?.status ??
      latestRevisionMessage.revisionStatus ??
      "PENDING_REVIEW"
    : null;
  const latestRevisionLabel = latestRevisionMessage
    ? getRevisionLabel(latestRevisionMessage)
    : null;
  const hasPendingRevisionReview = latestRevisionStatus === "PENDING_REVIEW";
  const pendingRevisionReviewMessage =
    hasPendingRevisionReview && latestRevisionMessage
      ? `${latestRevisionLabel} is already pending review. Please wait for the project owner to review it.`
      : defaultPendingRevisionReviewMessage;
  const revisionLabelById = useMemo(() => {
    const labels = new Map<string, string>();

    revisionMessages.forEach((entry) => {
      labels.set(getRevisionEntryId(entry), getRevisionLabel(entry));
    });

    return labels;
  }, [revisionMessages]);

  const activeStage = useMemo<ProjectStageRecord | undefined>(() => {
    if (!stageId) {
      return (
        stageCards.find((stage) => stage.id === project.currentStageId) ??
        stageCards[0]
      );
    }

    return stageCards.find((stage) => stage.id === stageId) ?? stageCards[0];
  }, [project.currentStageId, stageCards, stageId]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    setCompletionData({
      summary: completionSummary,
      workflow: completionWorkflow,
    });

    if (!deferCompletionData) {
      setIsCompletionDataLoading(false);
      return () => controller.abort();
    }

    setIsCompletionDataLoading(true);

    const query = activeStage?.id
      ? `?stage=${encodeURIComponent(activeStage.id)}`
      : "";

    fetch(`/api/projects/${encodeURIComponent(project.id)}/completion${query}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json()) as ProjectCompletionApiResponse;

        if (!response.ok || "error" in payload) {
          throw new Error(
            "error" in payload
              ? payload.error
              : "Unable to load project completion details.",
          );
        }

        if (!cancelled) {
          setCompletionData({
            summary: payload.completionSummary,
            workflow: payload.completionWorkflow,
          });
        }
      })
      .catch((error) => {
        if (
          cancelled ||
          (error instanceof DOMException && error.name === "AbortError")
        ) {
          return;
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsCompletionDataLoading(false);
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    activeStage?.id,
    completionSummary,
    completionWorkflow,
    deferCompletionData,
    project.id,
  ]);

  const committedCollaboratorIds = useMemo(
    () =>
      collaborators
        .filter((collaborator) => collaborator.access !== "owner")
        .map((collaborator) => collaborator.id),
    [collaborators],
  );
  const selectedCollaboratorIds = collaboratorPickerOpen
    ? draftCollaboratorIds
    : committedCollaboratorIds;
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
  const stageInvoiceAttachment = activeStage?.invoiceAttachment ?? null;
  const isProjectExecutor = useMemo(
    () =>
      project.executors.some((executor) => executor.id === currentUserId),
    [currentUserId, project.executors],
  );
  const isMainProjectExecutor = useMemo(
    () =>
      project.executors.some(
        (executor) =>
          executor.id === currentUserId && executor.role === "MAIN_EXECUTOR",
      ),
    [currentUserId, project.executors],
  );
  const canSubmitWorkAsMainExecutor = isMainProjectExecutor && !isProjectOwner;
  const stageInvoiceRequired = Boolean(activeStage?.invoiceRequired);
  const stageInvoiceRequest = activeStage?.invoiceRequest ?? null;
  const stageInvoiceMissing =
    stageInvoiceRequired && !stageInvoiceAttachment && !isStageCompleted && !isProjectCompleted;
  const isRequestedStageInvoiceUploader =
    Boolean(stageInvoiceRequest) && stageInvoiceRequest?.requestedFromId === currentUserId;
  const canUploadStageInvoice =
    Boolean(activeStage?.id) &&
    stageInvoiceRequired &&
    !stageInvoiceAttachment &&
    isRequestedStageInvoiceUploader &&
    !isStageCompleted &&
    !isProjectCompleted;
  const canRequestStageInvoice = isProjectOwner && stageInvoiceMissing;
  const invoiceRequestCandidates = useMemo(() => {
    const candidates = [
      ...project.executors.map((executor) => ({
        id: executor.id,
        name: executor.name,
        email: executor.email,
        role: executor.role === "MAIN_EXECUTOR" ? "Main Executor" : "Executor",
        rank: executor.role === "MAIN_EXECUTOR" ? 0 : 1,
      })),
      ...project.collaborators
        .filter((collaborator) => collaborator.group === "external")
        .map((collaborator) => ({
          id: collaborator.id,
          name: collaborator.name,
          email: collaborator.email,
          role: collaborator.role || "External Collaborator",
          rank: 2,
        })),
    ].filter((candidate) => candidate.id !== project.ownerId);

    return candidates
      .filter(
        (candidate, index, current) =>
          current.findIndex((item) => item.id === candidate.id) === index,
      )
      .sort((left, right) => left.rank - right.rank || left.name.localeCompare(right.name));
  }, [project.collaborators, project.executors, project.ownerId]);
  const hasAcceptedBrief = Boolean(activeStage?.actualStartedAtValue);
  const canSubmitNewRevision =
    canSubmitWorkAsMainExecutor &&
    hasAcceptedBrief &&
    activeStage?.status !== "pending" &&
    !isStageCompleted &&
    !isProjectCompleted &&
    !hasPendingRevisionReview;
  const submitWorkDisabledReason = !canSubmitWorkAsMainExecutor
    ? null
    : !activeStage
      ? "No active stage selected."
      : isStageCompleted
        ? "Stage is completed."
        : isProjectCompleted
          ? "Project is completed."
          : activeStage.status === "pending"
            ? "Stage is pending."
            : !hasAcceptedBrief
              ? "Waiting for main executor to accept brief."
              : hasPendingRevisionReview
                ? pendingRevisionReviewMessage
                : null;
  const showSubmitWorkAction =
    canSubmitWorkAsMainExecutor && Boolean(activeStage) && !isProjectCompleted;
  const projectBriefText = project.description.trim();
  const stageBriefText = activeStage?.description.trim() ?? "";
  const projectBriefAttachments = project.attachments;
  const stageBriefAttachments = activeStage?.briefAttachments ?? [];
  const canReviewSubmissions = project.ownerId === currentUserId;
  const hasRevisionEntries = displayedMessages.some((message) => message.kind === "revision");
  const hasBriefAcceptedSystemMessage = displayedMessages.some(
    (message) =>
      message.kind === "system" &&
      (message.title ?? "").toLowerCase() === "brief accepted",
  );
  const hasAcceptedBriefInTimeline =
    hasAcceptedBrief || hasBriefAcceptedSystemMessage;
  const showBriefAcceptancePrompt = !hasAcceptedBriefInTimeline;
  const hasBriefContext =
    projectBriefText.length > 0 ||
    stageBriefText.length > 0 ||
    projectBriefAttachments.length > 0 ||
    stageBriefAttachments.length > 0;
  const canAcceptCurrentStageBrief =
    Boolean(activeStage) &&
    isMainProjectExecutor &&
    !isProjectCompleted &&
    !isStageCompleted &&
    activeStage?.status !== "pending" &&
    showBriefAcceptancePrompt;
  const showBriefContextCard =
    Boolean(activeStage) &&
    showBriefAcceptancePrompt &&
    hasBriefContext &&
    !isProjectCompleted &&
    !isStageCompleted &&
    activeStage?.status !== "pending";
  const stageExecutionStatus = isStageCompleted
    ? "Completed"
    : hasAcceptedBriefInTimeline
      ? "In progress"
      : "Waiting for Main Executor to accept brief";
  const stageStartSystemMessage = useMemo<DisplayChatEntry | null>(() => {
    if (!activeStage?.actualStartedAtValue || hasBriefAcceptedSystemMessage) {
      return null;
    }

    const actorName = activeStage.startedByName ?? "Main Executor";

    return {
      id: `stage-started-${activeStage.id}`,
      kind: "system",
      title: "Brief accepted",
      author: actorName,
      role: "Main Executor",
      body: `${actorName} accepted the project and stage brief and started work on this stage.`,
      createdAt: activeStage.actualStartedAt,
    };
  }, [activeStage, hasBriefAcceptedSystemMessage]);
  const selectedOutputLanguage =
    getSupportedLanguageByCode(selectedOutputLanguageCode) ?? DEFAULT_CHAT_LANGUAGE;
  const currentUserDisplayName = useMemo(() => {
    const executor = project.executors.find(
      (candidate) => candidate.id === currentUserId,
    );

    if (executor) {
      return executor.name;
    }

    const collaborator = project.collaborators.find(
      (candidate) => candidate.id === currentUserId,
    );

    return collaborator?.name || "You";
  }, [currentUserId, project.collaborators, project.executors]);
  const currentUserDisplayCode = useMemo(
    () => getInitials(currentUserDisplayName),
    [currentUserDisplayName],
  );
  const currentUserRoleLabel = useMemo(() => {
    const executor = project.executors.find(
      (candidate) => candidate.id === currentUserId,
    );

    if (executor) {
      return executor.roleLabel;
    }

    const collaborator = project.collaborators.find(
      (candidate) => candidate.id === currentUserId,
    );

    if (!collaborator) {
      return "Internal Team";
    }

    return collaborator.group === "external" ? "External Collaborator" : "Internal Team";
  }, [currentUserId, project.collaborators, project.executors]);
  const getParticipantRoleLabel = useCallback(
    (userId: string) => {
      if (userId === currentUserId) {
        return currentUserRoleLabel;
      }

      const executor = project.executors.find((candidate) => candidate.id === userId);

      if (executor) {
        return executor.roleLabel;
      }

      const collaborator = project.collaborators.find(
        (candidate) => candidate.id === userId,
      );

      if (!collaborator) {
        return "Stage Chat";
      }

      return collaborator.group === "external"
        ? "External Collaborator"
        : "Internal Team";
    },
    [currentUserId, currentUserRoleLabel, project.collaborators, project.executors],
  );
  const hasLocalOrConfirmedRealtimeMessage = useCallback(
    (clientTempId: string) => {
      if (
        confirmedClientTempIdsRef.current.has(clientTempId) ||
        failedClientTempIdsRef.current.has(clientTempId)
      ) {
        return true;
      }

      return (
        loadedHistoryEntries.some((entry) => entry.id === clientTempId) ||
        optimisticComments.some(
          (entry) => entry.id === clientTempId || entry.serverEntryId === clientTempId,
        ) ||
        confirmedComments.some(
          (entry) => entry.id === clientTempId || entry.serverEntryId === clientTempId,
        )
      );
    },
    [confirmedComments, loadedHistoryEntries, optimisticComments],
  );
  const buildPendingRealtimeEntry = useCallback(
    (payload: StageChatRealtimeMessagePendingPayload): DisplayChatEntry => {
      const createdAtMs = Date.parse(payload.createdAt);

      return {
        id: payload.clientTempId,
        kind: "comment",
        author: payload.senderDisplayName.trim() || payload.senderDisplayCode || "User",
        authorId: payload.senderId,
        authorAvatarSrc: null,
        role: getParticipantRoleLabel(payload.senderId),
        body: payload.body,
        mentions: [],
        createdAt: "Sending…",
        isOptimistic: true,
        optimisticStatus: "sending",
        localCreatedAtMs: Number.isFinite(createdAtMs) ? createdAtMs : Date.now(),
        attachments: [],
      };
    },
    [getParticipantRoleLabel],
  );
  const markStalePendingTextMessages = useCallback(() => {
    const cutoff = Date.now() - STAGE_CHAT_PENDING_TIMEOUT_MS;

    setOptimisticComments((current) =>
      current.map((entry) => {
        const isPendingTextComment =
          entry.kind === "comment" &&
          entry.optimisticStatus === "sending" &&
          !entry.serverEntryId &&
          (entry.attachments?.length ?? 0) === 0;

        if (!isPendingTextComment || (entry.localCreatedAtMs ?? Date.now()) >= cutoff) {
          return entry;
        }

        failedClientTempIdsRef.current.add(entry.id);

        return {
          ...entry,
          createdAt: "Failed",
          optimisticStatus: "failed",
        };
      }),
    );
  }, []);
  const scrollToChatBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    chatBottomRef.current?.scrollIntoView({ block: "end", behavior });
  }, []);
  const handleChatScroll = useCallback(() => {
    const container = chatScrollRef.current;

    if (!container) {
      return;
    }

    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    const nextIsNearBottom = distanceFromBottom < 160;
    setIsNearChatBottom(nextIsNearBottom);

    if (nextIsNearBottom) {
      setNewRealtimeMessageCount(0);
    }
  }, []);
  const mergeServerChatEntry = useCallback(
    (
      entry: ProjectChatEntry,
      options: { clientTempId?: string | null; countAsNew?: boolean } = {},
    ) => {
      if (options.clientTempId) {
        confirmedClientTempIdsRef.current.add(options.clientTempId);
        failedClientTempIdsRef.current.delete(options.clientTempId);
      }

      setLoadedHistoryEntries((current) => {
        const existingIndex = current.findIndex((candidate) => candidate.id === entry.id);

        if (existingIndex >= 0) {
          const next = [...current];
          next[existingIndex] = {
            ...current[existingIndex],
            ...entry,
          };
          return next;
        }

        return [...current, entry];
      });
      setOptimisticComments((current) =>
        current.filter(
          (candidate) =>
            candidate.id !== options.clientTempId &&
            candidate.serverEntryId !== entry.id,
        ),
      );
      setConfirmedComments((current) =>
        current.filter((candidate) => candidate.serverEntryId !== entry.id),
      );

      if (entry.deletedAt) {
        setDeletedMessageOverrides((current) => ({
          ...current,
          [entry.id]: {
            deletedAt: entry.deletedAt ?? new Date().toISOString(),
            deletedByUserId: entry.deletedByUserId ?? null,
            displayText: DELETED_STAGE_CHAT_MESSAGE_TEXT,
          },
        }));
      }

      if (options.countAsNew && !isNearChatBottom && entry.authorId !== currentUserId) {
        setNewRealtimeMessageCount((current) => current + 1);
      }
    },
    [currentUserId, isNearChatBottom],
  );
  const applyRealtimeDeletedMessage = useCallback(
    (payload: StageChatRealtimeMessageDeletedPayload) => {
      setDeletedMessageOverrides((current) => ({
        ...current,
        [payload.commentId]: {
          deletedAt: payload.deletedAt,
          deletedByUserId: payload.deletedByUserId,
          displayText: DELETED_STAGE_CHAT_MESSAGE_TEXT,
        },
      }));
      setLoadedHistoryEntries((current) =>
        current.map((entry) =>
          entry.id === payload.commentId
            ? {
                ...entry,
                body: DELETED_STAGE_CHAT_MESSAGE_TEXT,
                deletedAt: payload.deletedAt,
                deletedByUserId: payload.deletedByUserId,
                canDeleteUntil: null,
                mentions: [],
                attachments: [],
              }
            : entry,
        ),
      );
      setOptimisticComments((current) =>
        current.filter((entry) => entry.serverEntryId !== payload.commentId),
      );
      setConfirmedComments((current) =>
        current.filter((entry) => entry.serverEntryId !== payload.commentId),
      );
    },
    [],
  );
  const handleRealtimeMessagePending = useCallback(
    (payload: StageChatRealtimeMessagePendingPayload) => {
      if (payload.projectId !== project.id || payload.stageId !== activeStage?.id) {
        return;
      }

      if (hasLocalOrConfirmedRealtimeMessage(payload.clientTempId)) {
        return;
      }

      const pendingEntry = buildPendingRealtimeEntry(payload);

      setOptimisticComments((current) => {
        if (
          current.some(
            (entry) =>
              entry.id === payload.clientTempId ||
              entry.serverEntryId === payload.clientTempId,
          ) ||
          confirmedClientTempIdsRef.current.has(payload.clientTempId) ||
          failedClientTempIdsRef.current.has(payload.clientTempId)
        ) {
          return current;
        }

        return [...current, pendingEntry];
      });

      if (payload.senderId !== currentUserId && !isNearChatBottom) {
        setNewRealtimeMessageCount((current) => current + 1);
      }
    },
    [
      activeStage?.id,
      buildPendingRealtimeEntry,
      currentUserId,
      hasLocalOrConfirmedRealtimeMessage,
      isNearChatBottom,
      project.id,
    ],
  );
  const handleRealtimeMessageCreated = useCallback(
    (payload: StageChatRealtimeMessageCreatedPayload) => {
      if (payload.projectId !== project.id || payload.stageId !== activeStage?.id) {
        return;
      }

      mergeServerChatEntry(payload.entry, {
        clientTempId: payload.clientTempId,
        countAsNew: true,
      });
      setRealtimeWatermark(payload.createdAt);
    },
    [activeStage?.id, mergeServerChatEntry, project.id],
  );
  const handleRealtimeMessageFailed = useCallback(
    (payload: StageChatRealtimeMessageFailedPayload) => {
      if (payload.projectId !== project.id || payload.stageId !== activeStage?.id) {
        return;
      }

      if (confirmedClientTempIdsRef.current.has(payload.clientTempId)) {
        return;
      }

      failedClientTempIdsRef.current.add(payload.clientTempId);

      setOptimisticComments((current) =>
        current.map((entry) => {
          if (
            entry.id !== payload.clientTempId ||
            entry.serverEntryId ||
            entry.authorId !== payload.senderId
          ) {
            return entry;
          }

          return {
            ...entry,
            body:
              payload.senderId === currentUserId
                ? entry.body
                : "Message failed to send.",
            createdAt: "Failed",
            optimisticStatus: "failed",
          };
        }),
      );
    },
    [activeStage?.id, currentUserId, project.id],
  );
  const handleRealtimeMessageDeleted = useCallback(
    (payload: StageChatRealtimeMessageDeletedPayload) => {
      if (payload.projectId !== project.id || payload.stageId !== activeStage?.id) {
        return;
      }

      applyRealtimeDeletedMessage(payload);
      setRealtimeWatermark(payload.deletedAt);
    },
    [activeStage?.id, applyRealtimeDeletedMessage, project.id],
  );
  const reconcileStageChat = useCallback(async () => {
    const activeStageId = activeStage?.id;

    if (!activeStageId) {
      return;
    }

    const params = new URLSearchParams({
      limit: "50",
    });

    if (realtimeWatermark) {
      params.set("after", realtimeWatermark);
    }

    const response = await fetch(
      `/api/projects/${encodeURIComponent(project.id)}/stages/${encodeURIComponent(
        activeStageId,
      )}/chat/updates?${params.toString()}`,
      {
        cache: "no-store",
      },
    );
    const payload = (await response.json()) as StageChatUpdatesApiResponse;

    if (!response.ok || "error" in payload) {
      throw new Error(
        "error" in payload ? payload.error : "Unable to load chat updates.",
      );
    }

    payload.entries.forEach((entry) => {
      mergeServerChatEntry(entry, { countAsNew: false });
    });
    markStalePendingTextMessages();
    setRealtimeWatermark(payload.watermark);
  }, [
    activeStage?.id,
    markStalePendingTextMessages,
    mergeServerChatEntry,
    project.id,
    realtimeWatermark,
  ]);
  const mentionableParticipants = useMemo<ProjectMentionParticipantRecord[]>(
    () =>
      project.mentionParticipants.filter(
        (participant) =>
          participant.id !== currentUserId && !participant.chatVisibilityPaused,
      ),
    [currentUserId, project.mentionParticipants],
  );
  const {
    realtimeEnabled,
    connectionState: realtimeConnectionState,
    onlineUsers,
    typingUsers,
    notifyTypingActivity,
    publishTypingStopped,
    publishPendingMessage,
    publishFailedMessage,
  } = useStageChatRealtime({
    projectId: project.id,
    stageId: activeStage?.id,
    currentUserId,
    currentUserDisplayName,
    currentUserDisplayCode,
    onMessagePending: handleRealtimeMessagePending,
    onMessageCreated: handleRealtimeMessageCreated,
    onMessageFailed: handleRealtimeMessageFailed,
    onMessageDeleted: handleRealtimeMessageDeleted,
    onReconcile: reconcileStageChat,
  });
  const typingIndicatorText = useMemo(() => {
    if (typingUsers.length === 0) {
      return null;
    }

    if (typingUsers.length === 1) {
      return `${typingUsers[0].displayName} is typing...`;
    }

    if (typingUsers.length === 2) {
      return `${typingUsers[0].displayName} and ${typingUsers[1].displayName} are typing...`;
    }

    return `${typingUsers[0].displayName} and ${typingUsers.length - 1} others are typing...`;
  }, [typingUsers]);
  const realtimeStatusLabel = useMemo(() => {
    if (!realtimeEnabled) {
      return "Realtime disabled";
    }

    if (realtimeConnectionState === "connected") {
      return "Live";
    }

    if (
      realtimeConnectionState === "failed" ||
      realtimeConnectionState === "closed" ||
      realtimeConnectionState === "suspended"
    ) {
      return "Live chat unavailable";
    }

    return "Connecting live chat";
  }, [realtimeConnectionState, realtimeEnabled]);
  const mentionTriggerState = useMemo(
    () => getMentionTriggerState(draft, draftSelectionStart),
    [draft, draftSelectionStart],
  );
  const mentionSuggestions = useMemo(() => {
    if (!mentionTriggerState) {
      return [];
    }

    const query = mentionTriggerState.query.trim().toLowerCase();

    return mentionableParticipants.filter((participant) => {
      if (!query) {
        return true;
      }

      return (
        participant.name.toLowerCase().includes(query) ||
        participant.email?.toLowerCase().includes(query)
      );
    });
  }, [mentionTriggerState, mentionableParticipants]);
  const mentionDropdownOpen = mentionSuggestions.length > 0 && Boolean(mentionTriggerState);
  const safeActiveMentionIndex =
    mentionDropdownOpen && mentionSuggestions.length > 0
      ? Math.min(activeMentionIndex, mentionSuggestions.length - 1)
      : 0;
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
  const canReviewLatestRevision =
    Boolean(latestRevisionMessage) &&
    !isProjectCompleted &&
    canReviewSubmissions &&
    latestRevisionStatus === "PENDING_REVIEW";
  const canMarkLatestRevisionComplete =
    Boolean(latestRevisionMessage) &&
    isProjectOwner &&
    !isFinalStage &&
    !isProjectCompleted;
  const showLatestRevisionActionBar =
    Boolean(latestRevisionMessage) && !isProjectCompleted;

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (isNearChatBottom) {
        scrollToChatBottom("auto");
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [
    activeStage?.id,
    displayedMessages,
    stageStartSystemMessage,
    pendingCommentFiles.length,
    replyingToRevision?.revisionId,
    composerError,
    aiStatus,
    typingIndicatorText,
    isNearChatBottom,
    scrollToChatBottom,
  ]);

  useEffect(() => {
    if (!mentionDropdownOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!mentionDropdownRef.current?.contains(event.target as Node)) {
        setActiveMentionIndex(0);
        setDraftSelectionStart(-1);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [mentionDropdownOpen]);

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
    setExecutors((current) =>
      current.map((executor) => {
        const updatedExecutor = updatedCollaborators.find(
          (collaborator) => collaborator.id === executor.id,
        );

        return updatedExecutor
          ? {
              ...executor,
              chatVisibilityPaused: updatedExecutor.chatVisibilityPaused,
            }
          : executor;
      }),
    );
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

  function openCollaboratorInvite() {
    setCollaboratorPickerOpen(false);
    setDraftCollaboratorIds([]);
    setCollaboratorForm({
      name: "",
      email: "",
      type: "GTI_INTERNAL_CLIENT",
    });
    setCollaboratorDialogError(undefined);
    setCollaboratorDialogOpen(true);
  }

  async function openCollaboratorPicker() {
    setCollaboratorDialogError(undefined);
    setDraftCollaboratorIds(committedCollaboratorIds);
    setCollaboratorSaving(true);

    try {
      const response = await fetch(
        `/api/projects/${encodeURIComponent(project.id)}/collaborators/available`,
        {
          cache: "no-store",
        },
      );
      const payload = (await response.json()) as AvailableCollaboratorsApiResponse;

      if (!response.ok || "error" in payload) {
        throw new Error(
          "error" in payload ? payload.error : "Unable to load collaborators.",
        );
      }

      setAvailableCollaboratorRecords(payload.collaborators);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to load collaborators right now.";
      setCollaboratorDialogError(message);
      showErrorToast("Unable to load collaborators.", message);
      return;
    } finally {
      setCollaboratorSaving(false);
    }

    setCollaboratorPickerOpen(true);
  }

  function toggleAssignedCollaborator(collaboratorId: string) {
    const availableCollaborator = availableCollaboratorRecords.find(
      (collaborator) => collaborator.id === collaboratorId,
    );

    if (!availableCollaborator) {
      return;
    }

    setDraftCollaboratorIds((current) => {
      const exists = current.includes(collaboratorId);

      if (exists) {
        return current.filter((id) => id !== collaboratorId);
      }

      return [...current, collaboratorId];
    });
  }

  function buildCollaboratorSelection(selectedIds: string[]) {
    const committedCollaboratorMap = new Map(
      collaborators
        .filter((collaborator) => collaborator.access !== "owner")
        .map((collaborator) => [collaborator.id, collaborator] as const),
    );
    const availableCollaboratorMap = new Map(
      availableCollaboratorRecords.map((collaborator) => [collaborator.id, collaborator] as const),
    );

    return selectedIds.reduce<ProjectCollaboratorRecord[]>((selection, collaboratorId) => {
      const committedCollaborator = committedCollaboratorMap.get(collaboratorId);

      if (committedCollaborator) {
        selection.push(committedCollaborator);
        return selection;
      }

      const availableCollaborator = availableCollaboratorMap.get(collaboratorId);

      if (!availableCollaborator) {
        return selection;
      }

      const group = availableCollaborator.typeGroup;
      selection.push({
        id: availableCollaborator.id,
        name: availableCollaborator.name,
        email: availableCollaborator.email,
        role: group === "external" ? "External Collaborator" : "Collaborator",
        group,
        participantType: availableCollaborator.type,
        chatVisibilityPaused: false,
        access: "view",
        removable: true,
      });

      return selection;
    }, []);
  }

  async function applyCollaboratorsSelection() {
    setCollaboratorSaving(true);
    setCollaboratorDialogError(undefined);

    const nextCollaborators = buildCollaboratorSelection(draftCollaboratorIds);

    try {
      const result = await saveProjectCollaboratorsAction(
        project.id,
        nextCollaborators.map((collaborator) => ({
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
      setDraftCollaboratorIds([]);
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
          participantType: inviteResult.collaborator.type,
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

  function refreshHistory() {
    startRefresh(() => {
      router.refresh();
    });
  }

  async function loadEarlierMessages() {
    const activeStageId = activeStage?.id;

    if (!activeStageId || !olderMessagesCursor || isLoadingEarlierMessages) {
      return;
    }

    setIsLoadingEarlierMessages(true);
    setOlderMessagesError(null);

    try {
      const params = new URLSearchParams({
        cursor: olderMessagesCursor,
        limit: "30",
      });
      const response = await fetch(
        `/api/projects/${encodeURIComponent(project.id)}/stages/${encodeURIComponent(
          activeStageId,
        )}/chat/messages?${params.toString()}`,
        {
          cache: "no-store",
        },
      );
      const payload = (await response.json()) as StageChatMessagesApiResponse;

      if (!response.ok || "error" in payload) {
        throw new Error(
          "error" in payload ? payload.error : "Unable to load earlier messages.",
        );
      }

      setLoadedHistoryEntries((current) => {
        const currentIds = new Set(current.map((entry) => entry.id));
        const earlierEntries = payload.entries.filter(
          (entry) => !currentIds.has(entry.id),
        );

        return [...earlierEntries, ...current];
      });
      setOlderMessagesCursor(payload.nextCursor);
      setHasEarlierMessages(Boolean(payload.hasMore && payload.nextCursor));
      if (typeof payload.revisionCount === "number") {
        setStageRevisionCount(payload.revisionCount);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to load earlier messages.";
      setOlderMessagesError(message);
    } finally {
      setIsLoadingEarlierMessages(false);
    }
  }

  function resetDraftComposerHeight() {
    const input = draftInputRef.current;

    if (!input) {
      return;
    }

    input.style.height = "auto";
    input.style.overflowY = "hidden";
  }

  function getServerCommentId(message: DisplayChatEntry) {
    return message.serverEntryId ?? (message.isOptimistic ? null : message.id);
  }

  function canDeleteMessage(message: DisplayChatEntry, isCurrentUserMessage: boolean) {
    if (
      message.kind !== "comment" ||
      !isCurrentUserMessage ||
      message.deletedAt ||
      message.isOptimistic
    ) {
      return false;
    }

    if (!getServerCommentId(message) || !message.canDeleteUntil) {
      return false;
    }

    const deleteUntilMs = Date.parse(message.canDeleteUntil);

    return Number.isFinite(deleteUntilMs) && deleteMenuNow <= deleteUntilMs;
  }

  function openDeleteMessageDialog(message: DisplayChatEntry) {
    setDeleteMessageTarget(message);
    setDeleteMessageError(null);
  }

  async function handleConfirmDeleteMessage() {
    const target = deleteMessageTarget;
    const activeStageId = activeStage?.id;
    const commentId = target ? getServerCommentId(target) : null;

    if (!target || !commentId || !activeStageId) {
      setDeleteMessageError("This message could not be resolved.");
      return;
    }

    const deletedAt = new Date().toISOString();

    setIsDeletingMessage(true);
    setDeleteMessageError(null);
    setDeletedMessageOverrides((current) => ({
      ...current,
      [commentId]: {
        deletedAt,
        deletedByUserId: currentUserId,
        displayText: DELETED_STAGE_CHAT_MESSAGE_TEXT,
      },
    }));

    try {
      const result = await deleteStageCommentAction({
        projectId: project.id,
        stageId: activeStageId,
        commentId,
      });

      if ("error" in result) {
        throw new Error(result.error);
      }

      setDeletedMessageOverrides((current) => ({
        ...current,
        [commentId]: {
          deletedAt: result.deletedAt,
          deletedByUserId: result.deletedByUserId,
          displayText: result.displayText,
        },
      }));
      setDeleteMessageTarget(null);
      showSuccessToast("Message deleted.");
    } catch (error) {
      setDeletedMessageOverrides((current) => {
        const next = { ...current };
        delete next[commentId];
        return next;
      });

      const message =
        error instanceof Error ? error.message : "Unable to delete the message right now.";
      setDeleteMessageError(message);
      showErrorToast("Unable to delete message.", message);
    } finally {
      setIsDeletingMessage(false);
    }
  }

  function resetProjectCompletionFlow() {
    setProjectCompletionError(null);
    setArchiveCompletionError(null);
    setArchivePreparation(null);
    setArchiveFileNames({});
    setArchiveFileErrors({});
    setArchiveCategoryId("");
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
      setArchiveCategoryId(result.preparation.selectedCategoryId);
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

    if (!archiveCategoryId) {
      setArchiveCompletionError("Choose an archive category before continuing.");
      return;
    }

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
        archiveCategoryId,
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
          projectId: project.id,
          stageId: activeStage?.id ?? project.currentStageId ?? undefined,
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
      formData.append("projectId", project.id);
      formData.append("stageId", activeStage?.id ?? project.currentStageId ?? "");

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
    if (!canSubmitWorkAsMainExecutor) {
      const message = "Only a Main Executor can submit work for review.";
      setComposerError(message);
      showErrorToast("Unable to submit work.", message);
      return;
    }

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

    if (hasPendingRevisionReview) {
      setComposerError(pendingRevisionReviewMessage);
      showErrorToast("Unable to submit work.", pendingRevisionReviewMessage);
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
              startedByName:
                current[completedStageId]?.startedByName ?? completedStage.startedByName,
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
              startedByName:
                current[nextStage.id]?.startedByName ?? nextStage.startedByName,
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
          startedByName: currentUserDisplayName,
          status: "in-progress",
        },
      }));
      setConfirmedComments((current) => [
        ...current,
        {
          id: `confirmed-comment-${result.result.activityComment.id}`,
          serverEntryId: result.result.activityComment.id,
          kind: "system",
          title: "Brief accepted",
          author: currentUserDisplayName,
          authorId: currentUserId,
          authorAvatarSrc: currentUserAvatarSrc,
          role: currentUserRoleLabel,
          body: result.result.activityComment.body,
          createdAt: "Just now",
          localCreatedAtMs: Date.now(),
        },
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

    const selectedAssetType: CommentUploadIntent = "COMMENT_ATTACHMENT";

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

  function startRevisionReply(message: DisplayChatEntry) {
    const revisionId = message.revisionId ?? getRevisionEntryId(message);
    const label = getRevisionLabel(message);

    setReplyingToRevision({ revisionId, label });
    setComposerError(null);

    window.requestAnimationFrame(() => {
      draftInputRef.current?.focus();
    });
  }

  function handleSelectMention(participant: ProjectMentionParticipantRecord) {
    if (!mentionTriggerState) {
      return;
    }

    const mentionText = `@${participant.name}`;
    const textBeforeMention = draft.slice(0, mentionTriggerState.start);
    const textAfterMention = draft.slice(mentionTriggerState.end);
    const needsTrailingSpace =
      textAfterMention.length === 0 || !textAfterMention.startsWith(" ");
    const nextDraft = `${textBeforeMention}${mentionText}${needsTrailingSpace ? " " : ""}${textAfterMention}`;
    const nextCursorPosition =
      textBeforeMention.length + mentionText.length + (needsTrailingSpace ? 1 : 0);

    setDraft(nextDraft);
    setSelectedMentionTokens((current) => {
      const nextToken = {
        userId: participant.id,
        name: participant.name,
      };

      return current.some((token) => token.userId === participant.id)
        ? current
        : [...current, nextToken];
    });
    setActiveMentionIndex(0);
    setDraftSelectionStart(nextCursorPosition);

    window.requestAnimationFrame(() => {
      draftInputRef.current?.focus();
      draftInputRef.current?.setSelectionRange(nextCursorPosition, nextCursorPosition);
    });
  }

  async function preparePendingUploadFile(
    optimisticCommentId: string,
    pendingFile: PendingFile,
  ): Promise<PreparedPendingUpload> {
    const uploadFile = pendingFile.file;

    updateOptimisticAttachment(optimisticCommentId, pendingFile.id, (attachment) => ({
      ...attachment,
      originalFileName: uploadFile.name,
      fileTypeLabel: getLocalFileTypeLabel(uploadFile.name),
      mimeType: uploadFile.type || "application/octet-stream",
      fileSizeLabel: formatLocalFileSize(uploadFile.size),
      uploadState: "uploading",
      progress: 0,
      uploadedAt: "Uploading…",
    }));

    return {
      pendingFile,
      uploadFile,
    };
  }

  async function handleSendComment() {
    const body = draft.trim();
    const activeStageId = activeStage?.id;
    const mentionedUserIds = resolveCommentMentionUserIds(body, selectedMentionTokens);
    const revisionReplyTarget = replyingToRevision;
    const commentRevisionId = revisionReplyTarget?.revisionId ?? null;

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
    const localCreatedAtMs = Date.now();
    const filesToUpload = [...pendingCommentFiles];
    const hasPendingFiles = filesToUpload.length > 0;
    const startingSubmissionNumber =
      getStageSubmissionAttachments(displayedMessages).filter(
        (attachment) =>
          !("uploadState" in attachment) || attachment.uploadState === "uploaded",
      ).length + 1;

    const optimisticComment: DisplayChatEntry = {
      id: optimisticCommentId,
      kind: "comment",
      revisionId: commentRevisionId ?? undefined,
      author: currentUserDisplayName,
      authorId: currentUserId,
      authorAvatarSrc: currentUserAvatarSrc,
      role: currentUserRoleLabel,
      body: body || "Attachment uploaded.",
      mentions: selectedMentionTokens.filter((mention) =>
        mentionedUserIds.includes(mention.userId),
      ),
      createdAt: hasPendingFiles ? "Uploading…" : "Sending…",
      isOptimistic: true,
      optimisticStatus: hasPendingFiles ? "uploading" : "sending",
      localCreatedAtMs,
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
        isFavoritedByCurrentUser: false,
        uploadState: "pending",
        progress: 0,
      })),
    };

    if (hasPendingFiles) {
      flushSync(() => {
        setOptimisticComments((current) => [...current, optimisticComment]);
        setDraft("");
        setReplyingToRevision(null);
        setSelectedMentionTokens([]);
        setDraftSelectionStart(0);
        setPendingCommentFiles([]);
        setIsSendingComment(false);
      });
      resetDraftComposerHeight();
      publishTypingStopped();
    } else {
      flushSync(() => {
        setOptimisticComments((current) => [...current, optimisticComment]);
        setDraft("");
        setReplyingToRevision(null);
        setSelectedMentionTokens([]);
        setDraftSelectionStart(0);
        setPendingCommentFiles([]);
      });
      resetDraftComposerHeight();
      publishTypingStopped();
      void publishPendingMessage({
        projectId: project.id,
        stageId: activeStageId,
        clientTempId: optimisticCommentId,
        senderId: currentUserId,
        senderDisplayName: currentUserDisplayName,
        senderDisplayCode: currentUserDisplayCode,
        body,
        createdAt: new Date(localCreatedAtMs).toISOString(),
        state: "pending",
      });
    }

    try {
      if (hasPendingFiles) {
        const uploadMentionTokens = selectedMentionTokens.filter((mention) =>
          mentionedUserIds.includes(mention.userId),
        );

        void (async () => {
          await waitForNextPaint();

          try {
            const preparedFiles = await Promise.all(
              filesToUpload.map((pendingFile) =>
                preparePendingUploadFile(optimisticCommentId, pendingFile),
              ),
            );
            const prepareStartedAt = getUploadNow();
            const prepareResponse = await fetch("/api/project-assets/chat-comment-upload", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                projectId: project.id,
                stageId: activeStageId,
                revisionId: commentRevisionId,
                body,
                allowEmptyBody: true,
                mentionedUserIds,
                files: preparedFiles.map(({ pendingFile, uploadFile }) => ({
                  clientId: pendingFile.id,
                  originalFileName: uploadFile.name,
                  mimeType: uploadFile.type || "application/octet-stream",
                  fileSize: uploadFile.size,
                  assetType: pendingFile.assetType ?? "COMMENT_ATTACHMENT",
                })),
              }),
            });
            console.info("upload:chat-comment-upload", {
              status: prepareResponse.status,
              durationMs: Math.round(getUploadNow() - prepareStartedAt),
              fileCount: preparedFiles.length,
            });

            const preparePayload =
              (await prepareResponse.json()) as ChatCommentUploadPrepareResponse;

            if (
              !prepareResponse.ok ||
              "error" in preparePayload ||
              !("commentId" in preparePayload)
            ) {
              throw new Error(
                getUploadErrorMessage(preparePayload, "Unable to prepare the upload."),
              );
            }

            updateOptimisticComment(optimisticCommentId, (entry) => ({
              ...entry,
              serverEntryId: preparePayload.commentId,
            }));

            const uploadByClientId = new Map(
              preparePayload.uploads.map((upload) => [upload.clientId, upload]),
            );
            const uploadResults = await Promise.allSettled(
              preparedFiles.map(({ pendingFile, uploadFile }, index) => {
                const upload = uploadByClientId.get(pendingFile.id);

                if (!upload?.attachmentId || !upload.uploadUrl) {
                  return Promise.reject(new Error("Upload target was not prepared."));
                }

                logUploadHost(upload.uploadUrl);

                return uploadFileToS3WithProgress({
                  uploadUrl: upload.uploadUrl,
                  file: uploadFile,
                  fileIndex: index + 1,
                  fileCount: preparedFiles.length,
                  assetType: pendingFile.assetType ?? "COMMENT_ATTACHMENT",
                  onProgress: (progress) => {
                    updateOptimisticAttachment(optimisticCommentId, pendingFile.id, (attachment) => ({
                      ...attachment,
                      uploadState: "uploading",
                      progress,
                    }));
                  },
                })
                  .then(() => {
                    updateOptimisticAttachment(optimisticCommentId, pendingFile.id, (attachment) => ({
                      ...attachment,
                      uploadState: "uploaded",
                      progress: 100,
                      uploadedAt: "Uploaded",
                    }));

                    return {
                      pendingFile,
                      attachmentId: upload.attachmentId,
                      uploadedFile: uploadFile,
                    };
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
              .flatMap((result) => (result.status === "fulfilled" ? [result.value] : []))
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
              await cancelPreparedCommentUpload({
                commentId: preparePayload.commentId,
                projectId: project.id,
              }).catch(() => undefined);
              setOptimisticComments((current) =>
                current.filter((entry) => entry.id !== optimisticCommentId),
              );
              setDraft(body);
              setReplyingToRevision(revisionReplyTarget);
              setSelectedMentionTokens(selectedMentionTokens);
              setDraftSelectionStart(body.length);
              setPendingCommentFiles(filesToUpload);
              setIsSendingComment(false);

              const message =
                "Comment was not sent because one or more file uploads failed. Please try again.";
              setComposerError(message);
              showErrorToast("Attachment upload failed.", message);
              return;
            }

            const completionResults = await Promise.allSettled(
              successfulUploads.map((result) =>
                completePreparedAttachmentUpload({
                  attachmentId: result.attachmentId,
                  projectId: project.id,
                  file: result.uploadedFile,
                  assetType: result.pendingFile.assetType ?? "COMMENT_ATTACHMENT",
                }),
              ),
            );
            const failedCompletions = completionResults.filter(
              (result): result is PromiseRejectedResult => result.status === "rejected",
            );

            if (failedCompletions.length > 0) {
              await cancelPreparedCommentUpload({
                commentId: preparePayload.commentId,
                projectId: project.id,
              }).catch(() => undefined);
              setOptimisticComments((current) =>
                current.filter((entry) => entry.id !== optimisticCommentId),
              );
              setDraft(body);
              setReplyingToRevision(revisionReplyTarget);
              setSelectedMentionTokens(selectedMentionTokens);
              setDraftSelectionStart(body.length);
              setPendingCommentFiles(filesToUpload);
              setIsSendingComment(false);

              const message =
                "Comment was not sent because the upload could not be finalized. Please try again.";
              setComposerError(message);
              showErrorToast("Attachment upload failed.", message);
              return;
            }

            updateOptimisticComment(optimisticCommentId, (entry) => ({
              ...entry,
              createdAt: "Sending…",
              optimisticStatus: "sending",
            }));

            try {
              await finalizePreparedCommentUpload({
                commentId: preparePayload.commentId,
                projectId: project.id,
              });
            } catch (error) {
              await cancelPreparedCommentUpload({
                commentId: preparePayload.commentId,
                projectId: project.id,
              }).catch(() => undefined);
              setOptimisticComments((current) =>
                current.filter((entry) => entry.id !== optimisticCommentId),
              );
              setDraft(body);
              setReplyingToRevision(revisionReplyTarget);
              setSelectedMentionTokens(selectedMentionTokens);
              setDraftSelectionStart(body.length);
              setPendingCommentFiles(filesToUpload);
              setIsSendingComment(false);

              throw error;
            }

            setConfirmedComments((current) => [
              ...current,
              {
                id: `confirmed-comment-${preparePayload.commentId}`,
                serverEntryId: preparePayload.commentId,
                revisionId: preparePayload.revisionId ?? undefined,
                kind: "comment",
                author: currentUserDisplayName,
                authorId: currentUserId,
                authorAvatarSrc: currentUserAvatarSrc,
                role: currentUserRoleLabel,
                body: body || "Attachment uploaded.",
                mentions: uploadMentionTokens,
                createdAt: "Just now",
                canDeleteUntil: getLocalDeleteExpiresAt(localCreatedAtMs),
                localCreatedAtMs,
                attachments: successfulUploads.map((result) => ({
                  id: result.attachmentId,
                  isSubmission: result.pendingFile.assetType === "STAGE_SUBMISSION",
                  submissionNumber: result.submissionNumber,
                  originalFileName: result.uploadedFile.name,
                  fileTypeLabel: getLocalFileTypeLabel(result.uploadedFile.name),
                  mimeType: result.uploadedFile.type || "application/octet-stream",
                  fileSizeLabel: formatLocalFileSize(result.uploadedFile.size),
                  uploadedBy: currentUserDisplayName,
                  uploadedAt: "Just now",
                  previewPath: `/api/project-assets/${result.attachmentId}/preview`,
                  downloadPath: `/api/project-assets/${result.attachmentId}/download`,
                  isFavoritedByCurrentUser: false,
                  submissionReviewStatus:
                    result.pendingFile.assetType === "STAGE_SUBMISSION"
                      ? "PENDING_REVIEW"
                      : null,
                })),
              },
            ]);
            setOptimisticComments((current) =>
              current.filter((entry) => entry.id !== optimisticCommentId),
            );
            setIsSendingComment(false);
          } catch (error) {
            filesToUpload.forEach((pendingFile) => {
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
            });

            const message =
              error instanceof Error ? error.message : "Unable to send the comment right now.";
            setOptimisticComments((current) =>
              current.filter((entry) => entry.id !== optimisticCommentId),
            );
            setDraft(body);
            setReplyingToRevision(revisionReplyTarget);
            setSelectedMentionTokens(selectedMentionTokens);
            setDraftSelectionStart(body.length);
            setPendingCommentFiles(filesToUpload);
            setIsSendingComment(false);
            setComposerError(message);
            showErrorToast("Unable to send comment.", message);
          }
        })();

        return;
      }

      const commentResponse = await fetch(
        `/api/projects/${encodeURIComponent(project.id)}/stages/${encodeURIComponent(
          activeStageId,
        )}/chat/comments`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            revisionId: commentRevisionId,
            body,
            mentionedUserIds,
            clientTempId: optimisticCommentId,
          }),
        },
      );
      const commentResult =
        (await commentResponse.json()) as CreateStageCommentApiResponse;

      if (!commentResponse.ok || "error" in commentResult) {
        throw new Error(
          "error" in commentResult
            ? commentResult.error
            : "Unable to send the comment right now.",
        );
      }

      if (commentResult.entry) {
        mergeServerChatEntry(commentResult.entry, {
          clientTempId: commentResult.clientTempId ?? optimisticCommentId,
          countAsNew: false,
        });
      } else {
        updateOptimisticComment(optimisticCommentId, (entry) => ({
          ...entry,
          serverEntryId: commentResult.commentId,
        }));

        setConfirmedComments((current) => [
          ...current,
          {
            id: `confirmed-comment-${commentResult.commentId}`,
            serverEntryId: commentResult.commentId,
            revisionId: commentResult.revisionId ?? undefined,
            kind: "comment",
            author: currentUserDisplayName,
            authorId: currentUserId,
            authorAvatarSrc: currentUserAvatarSrc,
            role: currentUserRoleLabel,
            body: body || "Attachment uploaded.",
            mentions: selectedMentionTokens.filter((mention) =>
              mentionedUserIds.includes(mention.userId),
            ),
            createdAt: "Just now",
            canDeleteUntil: getLocalDeleteExpiresAt(localCreatedAtMs),
            localCreatedAtMs,
            attachments: [],
          },
        ]);
        setOptimisticComments((current) =>
          current.filter((entry) => entry.id !== optimisticCommentId),
        );
      }
      setIsSendingComment(false);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to send the comment right now.";
      if (!hasPendingFiles) {
        failedClientTempIdsRef.current.add(optimisticCommentId);
        updateOptimisticComment(optimisticCommentId, (entry) => ({
          ...entry,
          createdAt: "Failed",
          optimisticStatus: "failed",
        }));
        void publishFailedMessage({
          projectId: project.id,
          stageId: activeStageId,
          clientTempId: optimisticCommentId,
          senderId: currentUserId,
          failedAt: new Date().toISOString(),
          state: "failed",
          reason: "save_failed",
        });
      } else {
        setOptimisticComments((current) =>
          current.filter((entry) => entry.id !== optimisticCommentId),
        );
        setDraft(body);
        setReplyingToRevision(revisionReplyTarget);
        setSelectedMentionTokens(selectedMentionTokens);
        setDraftSelectionStart(body.length);
      }
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

    if (hasPendingRevisionReview) {
      setRevisionDialogError(pendingRevisionReviewMessage);
      return;
    }

    if (!canSubmitWorkAsMainExecutor) {
      setRevisionDialogError("Only a Main Executor can submit work for review.");
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
    const localCreatedAtMs = Date.now();
    const filesToUpload = [...pendingRevisionFiles];

    setOptimisticComments((current) => [
      ...current,
      {
        id: optimisticRevisionId,
        kind: "revision",
        title: "Submitting work…",
        revisionStatus: "PENDING_REVIEW",
        rejectionReason: null,
        author: currentUserDisplayName,
        authorId: currentUserId,
        authorAvatarSrc: currentUserAvatarSrc,
        role: currentUserRoleLabel,
        body: summary,
        createdAt: "Uploading…",
        isOptimistic: true,
        localCreatedAtMs,
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
          isFavoritedByCurrentUser: false,
          uploadState: "pending",
          progress: 0,
        })),
      },
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
        revisionNumber: revisionResult.revisionNumber,
        serverEntryId: revisionResult.revisionId,
      }));

      const uploadResults = await Promise.allSettled(
        filesToUpload.map((pendingFile) => {
          return uploadAssetFile({
            file: pendingFile.file,
            projectId: project.id,
            stageId: activeStageId,
            revisionId: revisionResult.revisionId,
            assetType: "REVISION_ORIGINAL",
            onUploadStart: (uploadFile) => {
              updateOptimisticAttachment(optimisticRevisionId, pendingFile.id, (attachment) => ({
                ...attachment,
                originalFileName: uploadFile.name,
                fileTypeLabel: getLocalFileTypeLabel(uploadFile.name),
                mimeType: uploadFile.type || "application/octet-stream",
                fileSizeLabel: formatLocalFileSize(uploadFile.size),
                uploadState: "uploading",
                progress: 0,
                uploadedAt: "Uploading…",
              }));
            },
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
                uploadedAt: "Uploaded",
              }));
              return {
                pendingFile,
                attachmentId: uploadResult.attachmentId,
                uploadedFile: uploadResult.uploadedFile,
              };
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
        const cancelResult = await cancelStageRevisionSubmissionAction({
          projectId: project.id,
          stageId: activeStageId,
          revisionId: revisionResult.revisionId,
        });

        if ("error" in cancelResult) {
          throw new Error(cancelResult.error);
        }

        throw new Error(
          "Revision was not created because one or more file uploads failed. Please try again.",
        );
      }

      setConfirmedComments((current) => [
        ...current,
        {
          id: `confirmed-revision-${revisionResult.revisionId}`,
          serverEntryId: revisionResult.revisionId,
          revisionId: revisionResult.revisionId,
          kind: "revision",
          title: revisionResult.title,
          revisionNumber: revisionResult.revisionNumber,
          revisionStatus: "PENDING_REVIEW",
          rejectionReason: null,
          author: currentUserDisplayName,
          authorId: currentUserId,
          authorAvatarSrc: currentUserAvatarSrc,
          role: currentUserRoleLabel,
          body: summary,
          createdAt: "Just now",
          localCreatedAtMs,
          attachments: successfulUploads.map((result) => ({
            id: result.attachmentId,
            isSubmission: false,
            originalFileName: result.uploadedFile.name,
            fileTypeLabel: getLocalFileTypeLabel(result.uploadedFile.name),
            mimeType: result.uploadedFile.type || "application/octet-stream",
            fileSizeLabel: formatLocalFileSize(result.uploadedFile.size),
            uploadedBy: currentUserDisplayName,
            uploadedAt: "Just now",
            previewPath: `/api/project-assets/${result.attachmentId}/preview`,
            downloadPath: `/api/project-assets/${result.attachmentId}/download`,
            isFavoritedByCurrentUser: false,
          })),
        },
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

  function openInvoiceRequestDialog() {
    setInvoiceRequestError(null);
    setStageInvoiceError(null);
    setInvoiceRequestRecipientId(
      stageInvoiceRequest?.requestedFromId ?? invoiceRequestCandidates[0]?.id ?? "",
    );
    setInvoiceRequestNote(
      stageInvoiceRequest?.note ?? "Please upload the invoice for this completed stage.",
    );
    setInvoiceRequestDialogOpen(true);
  }

  async function handleRequestStageInvoice() {
    const activeStageId = activeStage?.id;

    if (!activeStageId) {
      setInvoiceRequestError("This project does not have an active stage.");
      return;
    }

    if (!canRequestStageInvoice) {
      setInvoiceRequestError("Invoice request is not available for this stage.");
      return;
    }

    if (!invoiceRequestRecipientId) {
      setInvoiceRequestError("Choose who should upload the invoice.");
      return;
    }

    setInvoiceRequestError(null);
    setIsRequestingStageInvoice(true);

    try {
      const result = await requestStageInvoiceAction({
        projectId: project.id,
        stageId: activeStageId,
        requestedFromId: invoiceRequestRecipientId,
        note: invoiceRequestNote,
      });

      if ("error" in result) {
        throw new Error(result.error);
      }

      const request = result.request;
      const nextInvoiceRequest: ProjectStageRecord["invoiceRequest"] = {
        id: request.id,
        requestedById: currentUserId,
        requestedByName: request.requestedByName,
        requestedFromId: request.requestedFromId,
        requestedFromName: request.requestedFromName,
        note: request.note,
        requestedAt: "Just now",
        fulfilledAt: null,
      };
      const stageName = activeStage?.label ?? "this stage";

      setStageCardOverrides((current) => ({
        ...current,
        [activeStageId]: {
          actualStartedAt:
            current[activeStageId]?.actualStartedAt ??
            activeStage?.actualStartedAt ??
            "—",
          actualStartedAtValue:
            current[activeStageId]?.actualStartedAtValue ??
            activeStage?.actualStartedAtValue ??
            null,
          startedByName:
            current[activeStageId]?.startedByName ?? activeStage?.startedByName,
          status: current[activeStageId]?.status ?? activeStage?.status,
          invoiceAttachment:
            current[activeStageId]?.invoiceAttachment ?? activeStage?.invoiceAttachment ?? null,
          invoiceRequest: nextInvoiceRequest,
        },
      }));
      setConfirmedComments((current) => [
        ...current,
        {
          id: `confirmed-invoice-request-${request.id}`,
          serverEntryId: request.commentId,
          kind: "system",
          title: "Invoice requested",
          author: currentUserDisplayName,
          authorId: currentUserId,
          authorAvatarSrc: currentUserAvatarSrc,
          role: currentUserRoleLabel,
          body: `${currentUserDisplayName} requested invoice from ${request.requestedFromName} for ${stageName}.`,
          createdAt: "Just now",
          localCreatedAtMs: Date.now(),
        },
      ]);
      setInvoiceRequestDialogOpen(false);
      showSuccessToast("Invoice request sent in-app.");
      refreshHistory();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to request the invoice right now.";
      setInvoiceRequestError(message);
      showErrorToast("Unable to request invoice.", message);
    } finally {
      setIsRequestingStageInvoice(false);
    }
  }

  function openStageInvoiceUpload() {
    setStageInvoiceError(null);
    setReviewDialogError(null);
    setStageCompleteError(null);

    if (!canUploadStageInvoice) {
      const message = stageInvoiceRequired
        ? "Only the requested invoice recipient can upload the invoice for this stage."
        : "Invoice is not required for this stage.";
      setStageInvoiceError(message);
      showErrorToast("Unable to upload invoice.", message);
      return;
    }

    stageInvoiceInputRef.current?.click();
  }

  async function handleStageInvoiceSelected(files: FileList | null) {
    const invoiceFile = Array.from(files ?? [])[0] ?? null;
    const activeStageId = activeStage?.id;

    if (stageInvoiceInputRef.current) {
      stageInvoiceInputRef.current.value = "";
    }

    if (!invoiceFile) {
      return;
    }

    if (!activeStageId) {
      const message = "This project does not have an active stage.";
      setStageInvoiceError(message);
      showErrorToast("Unable to upload invoice.", message);
      return;
    }

    if (!canUploadStageInvoice) {
      const message = stageInvoiceRequired
        ? "Only the requested invoice recipient can upload the invoice for this stage."
        : "Invoice is not required for this stage.";
      setStageInvoiceError(message);
      showErrorToast("Unable to upload invoice.", message);
      return;
    }

    setStageInvoiceError(null);
    setIsUploadingStageInvoice(true);

    try {
      const result = await uploadAssetFile({
        file: invoiceFile,
        projectId: project.id,
        stageId: activeStageId,
        assetType: "STAGE_INVOICE",
      });
      const invoiceAttachment: ProjectAttachmentRecord = {
        id: result.attachmentId,
        isSubmission: false,
        originalFileName: result.uploadedFile.name,
        fileTypeLabel: getLocalFileTypeLabel(result.uploadedFile.name),
        mimeType: result.uploadedFile.type || "application/octet-stream",
        fileSizeLabel: formatLocalFileSize(result.uploadedFile.size),
        uploadedBy: currentUserDisplayName,
        uploadedAt: "Just now",
        previewPath: `/api/project-assets/${result.attachmentId}/preview`,
        downloadPath: `/api/project-assets/${result.attachmentId}/download`,
        isFavoritedByCurrentUser: false,
      };
      const stageName = activeStage?.label ?? "this stage";

      setStageCardOverrides((current) => {
        const existingInvoiceRequest =
          current[activeStageId]?.invoiceRequest ?? activeStage?.invoiceRequest ?? null;

        return {
          ...current,
          [activeStageId]: {
            actualStartedAt:
              current[activeStageId]?.actualStartedAt ??
              activeStage?.actualStartedAt ??
              "—",
            actualStartedAtValue:
              current[activeStageId]?.actualStartedAtValue ??
              activeStage?.actualStartedAtValue ??
              null,
            startedByName:
              current[activeStageId]?.startedByName ?? activeStage?.startedByName,
            status: current[activeStageId]?.status ?? activeStage?.status,
            invoiceAttachment,
            invoiceRequest: existingInvoiceRequest
              ? {
                  ...existingInvoiceRequest,
                  fulfilledAt: "Just now",
                }
              : null,
          },
        };
      });
      setConfirmedComments((current) => [
        ...current,
        {
          id: `confirmed-invoice-${result.attachmentId}`,
          kind: "system",
          title: "Invoice uploaded",
          author: currentUserDisplayName,
          authorId: currentUserId,
          authorAvatarSrc: currentUserAvatarSrc,
          role: currentUserRoleLabel,
          body: `${currentUserDisplayName} uploaded invoice for ${stageName}.`,
          createdAt: "Just now",
          localCreatedAtMs: Date.now(),
        },
      ]);
      showSuccessToast("Invoice uploaded.");
      refreshHistory();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to upload the invoice right now.";
      setStageInvoiceError(message);
      showErrorToast("Unable to upload invoice.", message);
    } finally {
      setIsUploadingStageInvoice(false);
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
    const reviewRevisionLabel = getRevisionLabel(reviewRevisionMessage);
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
      const reviewedBy = result.revision.reviewedBy ?? currentUserDisplayName;
      const reviewedAt = "Just now";
      const localCreatedAtMs = Date.now();

      setRevisionReviewOverrides((current) => ({
        ...current,
        [revisionEntryId]: {
          status: nextStatus,
          rejectionReason: nextReason,
          reviewedBy,
          reviewedAt,
        },
      }));

      setConfirmedComments((current) => {
        const nextEntries = current.map((entry) =>
          entry.kind === "revision" && getRevisionEntryId(entry) === revisionEntryId
            ? {
                ...entry,
                revisionStatus: nextStatus,
                rejectionReason: nextReason,
                reviewedBy,
                reviewedAt,
              }
            : entry,
        );

        if (result.revision.rejectionComment) {
          return [
            ...nextEntries,
            {
              id: `confirmed-comment-${result.revision.rejectionComment.id}`,
              serverEntryId: result.revision.rejectionComment.id,
              revisionId: reviewRevisionMessage.revisionId,
              kind: "system",
              title: "Revision requested",
              author: currentUserDisplayName,
              authorId: currentUserId,
              authorAvatarSrc: currentUserAvatarSrc,
              role: currentUserRoleLabel,
              body: `${currentUserDisplayName} requested a revision for ${reviewRevisionLabel}.`,
              createdAt: "Just now",
              localCreatedAtMs,
            },
          ];
        }

        if (status === "APPROVED") {
          const systemTitle = result.revision.stageCompletion
            ? "Stage completed"
            : "Submission completed";
          const systemBody = result.revision.stageCompletion
            ? `${currentUserDisplayName} completed this stage after approving ${reviewRevisionLabel}.`
            : `${currentUserDisplayName} marked ${reviewRevisionLabel} as completed.`;

          return [
            ...nextEntries,
            {
              id: `confirmed-system-${revisionEntryId}-${nextStatus}`,
              revisionId: reviewRevisionMessage.revisionId,
              kind: "system",
              title: systemTitle,
              author: currentUserDisplayName,
              authorId: currentUserId,
              authorAvatarSrc: currentUserAvatarSrc,
              role: currentUserRoleLabel,
              body: systemBody,
              createdAt: "Just now",
              localCreatedAtMs,
            },
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
            : "Submission approved."
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
    <section className="min-h-0 xl:h-[calc(100dvh-12rem)] xl:min-h-[620px] xl:overflow-hidden">
      <div className="grid min-h-0 gap-4 xl:h-full xl:grid-cols-[minmax(0,1fr)_280px] 2xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex h-[calc(100dvh-12rem)] min-h-[520px] min-w-0 flex-col overflow-hidden xl:h-full xl:min-h-0">
          <div
            ref={chatScrollRef}
            onScroll={handleChatScroll}
            className="no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-[28px] border border-[#e1e9e2] bg-[#f4f8f3] px-3 pb-6 pt-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] sm:px-5"
          >
            <div className="mx-auto flex w-full max-w-[980px] flex-col gap-2.5 pb-6">
              <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[12px] font-semibold text-[#5f6b62]">
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className={`size-2 rounded-full ${
                      realtimeEnabled && realtimeConnectionState === "connected"
                        ? "bg-[#2f8d5d]"
                        : "bg-[#b7c0b8]"
                    }`}
                    aria-hidden="true"
                  />
                  <span>{realtimeStatusLabel}</span>
                </div>
                {onlineUsers.length > 0 ? (
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="flex -space-x-2">
                      {onlineUsers.slice(0, 4).map((user) => (
                        <span
                          key={user.userId}
                          className="grid size-7 place-items-center rounded-full border-2 border-[#f4f8f3] bg-[#e8f3eb] text-[10px] font-[800] text-[#2f6f4b]"
                          title={user.displayName}
                        >
                          {user.displayCode}
                        </span>
                      ))}
                    </div>
                    <span>{onlineUsers.length} online</span>
                  </div>
                ) : null}
              </div>
          {isProjectCompleted ? (
            <CompletedProjectArchiveSummaryCard completionSummary={completionState} />
          ) : null}

          {isProjectCompleted && effectiveCompletionWorkflow ? (
            <ProjectCompletionChecklist
              projectId={project.id}
              workflow={effectiveCompletionWorkflow}
            />
          ) : null}

          {isProjectCompleted && isCompletionDataLoading ? (
            <Card className="rounded-[20px] border border-[#dbe7dd] bg-[#f7fbf6] shadow-none">
              <CardContent className="flex items-center gap-2 px-5 py-4 text-[13px] font-semibold text-[#5f6b62]">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading completion details...
              </CardContent>
            </Card>
          ) : null}

          {isProjectCompleted &&
          !effectiveCompletionWorkflow &&
          !isCompletionDataLoading &&
          (isProjectOwner || isProjectExecutor) ? (
            <Card className="rounded-[20px] border border-[#dbe7dd] bg-[#f7fbf6] shadow-none">
              <CardContent className="flex flex-col gap-3 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[16px] font-semibold text-[#173120]">
                    Project completion checklist is not available yet.
                  </p>
                  <p className="mt-1 text-[13px] leading-6 text-[#5f6b62]">
                    This completed project should show Authority Approval, Copyright
                    Transfer, and Final Invoice steps here. Reload the page to fetch the
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
                  <p className="text-[14px] font-semibold text-[#173120]">
                    All stages completed. Complete the project to archive the final files.
                  </p>
                  <p className="mt-1 text-[12px] text-[#5f6b62]">
                    {completionState.approvedFileCount} final file
                    {completionState.approvedFileCount === 1 ? "" : "s"} ready for final archive.
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

          {!isProjectCompleted &&
          isProjectOwner &&
          isFinalStage &&
          !completionState.allStagesCompleted ? (
            <Card className="rounded-[20px] border border-[#f0c9c7] bg-[#fff7f6] shadow-none">
              <CardContent className="px-5 py-4">
                <p className="text-[14px] font-semibold text-[#9f3f39]">
                  Project cannot be completed yet.
                </p>
                <p className="mt-1 text-[12px] leading-5 text-[#7c514d]">
                  Complete all stages before final project completion.
                </p>
                {completionState.incompleteStages.length > 0 ? (
                  <ul className="mt-3 space-y-1 text-[12px] text-[#7c514d]">
                    {completionState.incompleteStages.map((stage) => (
                      <li key={stage.id}>
                        {stage.name} — {stage.status}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {completionPrompt ? (
            <Card className="rounded-[18px] border border-[#dbe7dd] bg-[#f7fbf6] shadow-none">
              <CardContent className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[14px] font-semibold text-[#173120]">
                    {completionPrompt.allStagesCompleted
                      ? "All stages completed. Final project completion is now available."
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

          {hasEarlierMessages ? (
            <div className="flex justify-center py-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="rounded-full border border-[#dbe7dd] bg-white text-[12px]"
                onClick={() => {
                  void loadEarlierMessages();
                }}
                disabled={isLoadingEarlierMessages}
              >
                {isLoadingEarlierMessages ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : null}
                Load earlier messages
              </Button>
            </div>
          ) : null}

          {olderMessagesError ? (
            <div className="mx-auto max-w-[520px] rounded-[16px] border border-[#f0d4d2] bg-[#fff5f4] px-4 py-3 text-center text-[12px] font-semibold text-[#a64038]">
              {olderMessagesError}
            </div>
          ) : null}

          {stageStartSystemMessage ? (
            <SystemActivityCard
              message={stageStartSystemMessage}
              alignment={getTimelineEntryAlignment(
                stageStartSystemMessage,
                currentUserId,
                currentUserDisplayName,
              )}
            />
          ) : null}

          {showBriefContextCard && activeStage ? (
            <StageBriefContextCard
              projectBriefText={projectBriefText}
              stageBriefText={stageBriefText}
              projectBriefAttachments={projectBriefAttachments}
              stageBriefAttachments={stageBriefAttachments}
              createdBy={project.createdBy}
              createdAt={project.createdOn}
              stageLabel={activeStage.label}
              canAcceptBrief={canAcceptCurrentStageBrief}
              isAcceptingBrief={isAcceptingBrief}
              onAcceptBrief={() => {
                setAcceptBriefError(null);
                setAcceptBriefDialogOpen(true);
              }}
              onOpenProjectBrief={() => setProjectBriefDialogOpen(true)}
              onOpenStageBrief={() => setStageBriefDialogOpen(true)}
            />
          ) : null}

          {displayedMessages.length === 0 ? (
            <Card className="border border-dashed border-[#d8e1d8] px-6 py-10 text-center">
              <CardTitle className="text-[20px] font-semibold tracking-tight">
                {activeStage?.label ?? "Stage"} History
              </CardTitle>
              <p className="mt-2 text-[14px] text-[#6e776f]">
                No revisions or comments have been added to this stage yet.
              </p>
              <p className="mt-1 text-[13px] text-[#8a938c]">
                {showBriefContextCard
                  ? "Accept the brief above before submitting the first revision."
                  : "Upload the first revision to start the proof and archive trail."}
              </p>
              {!showBriefContextCard &&
                !isProjectCompleted &&
                !isStageCompleted &&
                isMainProjectExecutor &&
                showBriefAcceptancePrompt ? (
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
              ) : !isProjectCompleted && showBriefAcceptancePrompt ? (
                <div className="mt-5">
                  <WorkflowNoticeCard
                    title="Waiting for Main Executor"
                    body="Waiting for Main Executor to accept brief."
                  />
                </div>
              ) : null}
            </Card>
          ) : null}

          {displayedMessages.map((message) =>
            message.kind === "system" ? (
              <SystemActivityCard
                key={message.id}
                message={message}
                alignment={getTimelineEntryAlignment(
                  message,
                  currentUserId,
                  currentUserDisplayName,
                )}
              />
            ) : message.kind === "revision" ? (
              (() => {
                const revisionAlignment = getTimelineEntryAlignment(
                  message,
                  currentUserId,
                  currentUserDisplayName,
                );
                const revisionEntryId = getRevisionEntryId(message);
                const reviewOverride = revisionReviewOverrides[revisionEntryId];
                const effectiveRevisionStatus =
                  reviewOverride?.status ??
                  message.revisionStatus ??
                  "PENDING_REVIEW";
                const effectiveRejectionReason =
                  reviewOverride?.rejectionReason ??
                  message.rejectionReason ??
                  null;
                const effectiveReviewedBy =
                  reviewOverride?.reviewedBy ?? message.reviewedBy ?? null;
                const effectiveReviewedAt =
                  reviewOverride?.reviewedAt ?? message.reviewedAt ?? null;
                const revisionStatusMeta = getRevisionStatusMeta(effectiveRevisionStatus);
                const revisionLabel = getRevisionLabel(message);

                return (
                  <TimelineFrame
                    key={message.id}
                    alignment={revisionAlignment}
                    width="submission"
                    avatarName={message.author}
                    avatarSrc={message.authorAvatarSrc}
                  >
                    <Card
                      className={`min-w-0 overflow-hidden rounded-[22px] border border-[#cfe3d2] bg-white shadow-[0_12px_30px_rgba(18,35,23,0.07)] ${
                        revisionAlignment === "right" ? "rounded-br-[8px]" : "rounded-bl-[8px]"
                      }`}
                    >
                      <div className="space-y-3.5 bg-[linear-gradient(135deg,#f8fbf7,#ffffff)] px-4 py-4 sm:px-5">
                        <div className="flex min-w-0 items-start gap-3">
                          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#e4f3e7] text-brand">
                            <Upload className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                              <span className="rounded-full bg-[#edf7ef] px-2.5 py-1 text-[9px] font-[800] uppercase tracking-[0.08em] text-brand">
                                Work submitted
                              </span>
                              <span
                                className={`inline-flex rounded-full px-2.5 py-1 text-[9px] font-semibold uppercase tracking-wide ${revisionStatusMeta.badgeClassName}`}
                              >
                                {revisionStatusMeta.label}
                              </span>
                              <span className="ml-auto min-w-fit text-[11px] font-semibold text-[#7a837b]">
                                {message.createdAt}
                              </span>
                            </div>
                            <h2 className="mt-2 text-[16px] font-[800] tracking-tight text-[#173120]">
                              {revisionLabel}
                            </h2>
                            <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-semibold text-[#6f786f]">
                              <span>
                                Submitted by {revisionAlignment === "right" ? "You" : message.author}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span>{message.role}</span>
                            </div>
                          </div>
                        </div>

                        <div className="min-w-0 rounded-[16px] border border-[#e3ece4] bg-white/78 px-3.5 py-3">
                          <p className="text-[10px] font-[800] uppercase tracking-[0.08em] text-[#657269]">
                            Revision note
                          </p>
                          <p className="mt-1.5 whitespace-pre-wrap break-words text-[13px] leading-5 text-[#253028]">
                            {message.body}
                          </p>
                        </div>

                        {effectiveRejectionReason ? (
                          <div className="rounded-[16px] border border-[#f0d0cc] bg-[#fff8f6] px-3.5 py-3 text-[#6f2721]">
                            <p className="text-[12px] font-[800] text-[#a73831]">
                              Revision requested
                            </p>
                            <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-[#b7655d]">
                              {effectiveReviewedBy
                                ? `Requested by ${effectiveReviewedBy}${
                                    effectiveReviewedAt ? ` · ${effectiveReviewedAt}` : ""
                                  }`
                                : "Requested by Project Owner"}
                            </p>
                            <p className="mt-2 whitespace-pre-wrap break-words text-[12px] font-semibold leading-5">
                              {effectiveRejectionReason}
                            </p>
                          </div>
                        ) : null}

                        {message.attachments?.length ? (
                          <div className="min-w-0 rounded-[16px] border border-[#e1e9e2] bg-[#f8fbf8] p-3">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-[11px] font-[800] uppercase tracking-[0.08em] text-[#657269]">
                                Submitted files
                              </p>
                              <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-[#6f786f]">
                                {message.attachments.length}
                              </span>
                            </div>
                            <AttachmentHistoryList
                              attachments={message.attachments}
                              actionsDisabled={isProjectCompleted}
                              tone={revisionAlignment === "right" ? "sent" : "received"}
                            />
                          </div>
                        ) : null}
                      </div>
                    </Card>
                  </TimelineFrame>
                );
              })()
            ) : message.kind === "comparison" ? (
              (() => {
                const comparison = message.comparison;

                if (!comparison) {
                  return null;
                }

                const comparisonAlignment = getTimelineEntryAlignment(
                  message,
                  currentUserId,
                  currentUserDisplayName,
                );
                const comparisonHref = buildComparisonHref(
                  project.id,
                  activeStage?.id,
                  comparison.baseAttachmentId,
                  comparison.compareAttachmentId,
                );

                return (
                  <TimelineFrame
                    key={message.id}
                    alignment={comparisonAlignment}
                    width="medium"
                    avatarName={message.author}
                    avatarSrc={message.authorAvatarSrc}
                  >
                    <Card
                      className={`w-full overflow-hidden rounded-[22px] border border-[#d3e1ea] bg-[linear-gradient(135deg,#f7fbff,#ffffff)] p-4 shadow-[0_12px_30px_rgba(18,35,23,0.06)] ${
                        comparisonAlignment === "right" ? "rounded-br-[8px]" : "rounded-bl-[8px]"
                      }`}
                    >
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e7f3fb] px-3 py-1 text-[10px] font-[800] uppercase tracking-[0.08em] text-[#3e78a6]">
                              <GitCompare className="h-3.5 w-3.5" />
                              Comparison submitted
                            </span>
                            <span className="text-[11px] font-[600] text-[#7a837b]">
                              {message.createdAt}
                            </span>
                          </div>
                          <div className="mt-3 flex items-center gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-[13px] font-[700] text-[#111712]">
                                {comparisonAlignment === "right" ? "You" : message.author}
                              </p>
                              <p className="truncate text-[10px] text-[#7a837b]">
                                {message.role}
                              </p>
                            </div>
                          </div>
                          <p className="mt-3 whitespace-pre-wrap break-words text-[13px] leading-[1.55] text-[#253029]">
                            {message.body}
                          </p>
                          <div className="mt-4 grid gap-2 lg:grid-cols-2">
                            {[
                              {
                                label: "Base",
                                submission: comparison.baseSubmissionLabel,
                                fileName: comparison.baseFileName,
                              },
                              {
                                label: "Compare",
                                submission: comparison.compareSubmissionLabel,
                                fileName: comparison.compareFileName,
                              },
                            ].map((item) => (
                              <div
                                key={item.label}
                                className="min-w-0 rounded-[16px] border border-[#dbe8ef] bg-white px-3 py-2.5"
                              >
                                <p className="text-[10px] font-[800] uppercase tracking-[0.08em] text-[#668092]">
                                  {item.label} · {item.submission}
                                </p>
                                <p className="mt-1 truncate text-[12px] font-[700] text-[#1b241e]">
                                  {item.fileName}
                                </p>
                              </div>
                            ))}
                          </div>
                          <p className="mt-3 text-[10px] font-[600] uppercase tracking-[0.08em] text-[#7a837b]">
                            Pinned at {comparison.xPercent.toFixed(1)}%,{" "}
                            {comparison.yPercent.toFixed(1)}%
                          </p>
                        </div>
                        <Button
                          asChild
                          type="button"
                          size="sm"
                          className="shrink-0 rounded-full text-[12px]"
                        >
                          <Link href={comparisonHref}>View Comparison</Link>
                        </Button>
                      </div>
                    </Card>
                  </TimelineFrame>
                );
              })()
            ) : (
              (() => {
                const linkedRevisionLabel = message.revisionId
                  ? revisionLabelById.get(message.revisionId) ?? "Revision"
                  : null;
                const isCurrentUserMessage =
                  getTimelineEntryAlignment(
                    message,
                    currentUserId,
                    currentUserDisplayName,
                  ) === "right";
                const isDeletedMessage = Boolean(message.deletedAt);
                const showDeleteMessageAction = canDeleteMessage(
                  message,
                  isCurrentUserMessage,
                );
                const previousMessageIndex = displayedMessages.findIndex(
                  (entry) => entry.id === message.id,
                ) - 1;
                const isGroupedWithPrevious =
                  !isCurrentUserMessage &&
                  shouldGroupWithPreviousMessage(
                    displayedMessages[previousMessageIndex],
                    message,
                  );
                const hasAttachments =
                  !isDeletedMessage && Boolean(message.attachments?.length);
                const hasSubmissionAttachment =
                  !isDeletedMessage &&
                  (message.attachments?.some((attachment) => attachment.isSubmission) ??
                    false);
                const attachmentLabel = hasSubmissionAttachment
                  ? "Submission uploaded"
                  : "Attachment uploaded";
                const bubbleClassName = linkedRevisionLabel
                  ? isCurrentUserMessage
                    ? "rounded-[18px] rounded-br-[6px] border border-[#abd7b6] bg-[#f1fbf3] p-2.5 shadow-[0_10px_24px_rgba(19,28,22,0.06)]"
                    : "rounded-[18px] rounded-bl-[6px] border border-[#d7e5d9] bg-white p-2.5 shadow-[0_10px_24px_rgba(19,28,22,0.05)]"
                  : isCurrentUserMessage
                    ? "rounded-[18px] rounded-br-[6px] border border-[#c3e2cb] bg-[#edf8ef] p-3 shadow-[0_10px_24px_rgba(19,28,22,0.06)]"
                    : "rounded-[18px] rounded-bl-[6px] border border-[#e2e9e2] bg-white p-3 shadow-[0_10px_24px_rgba(19,28,22,0.05)]";

                return (
                  <TimelineFrame
                    key={message.id}
                    alignment={isCurrentUserMessage ? "right" : "left"}
                    width="compact"
                    avatarName={message.author}
                    avatarSrc={message.authorAvatarSrc}
                    hideGutterContent={isGroupedWithPrevious}
                    grouped={isGroupedWithPrevious}
                  >
                    <Card
                      className={`relative min-w-0 ${bubbleClassName}`}
                      style={showDeleteMessageAction ? { paddingRight: "2.75rem" } : undefined}
                    >
                      {showDeleteMessageAction ? (
                        <div className="absolute right-2 top-2 z-10">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="size-7 shrink-0 border border-[#d9e5db] bg-white/90 text-[#58675d] shadow-[0_8px_18px_rgba(18,35,23,0.08)] hover:bg-white hover:text-[#173120]"
                                aria-label="Message actions"
                              >
                                <MoreVertical className="h-3.5 w-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="min-w-[11rem]">
                              <DropdownMenuItem
                                variant="destructive"
                                onSelect={() => openDeleteMessageDialog(message)}
                              >
                                <Trash2 className="h-4 w-4" />
                                Delete message
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      ) : null}
                      {linkedRevisionLabel ? (
                        <div className="mb-2 flex min-w-0 flex-wrap items-center gap-2">
                          <span
                            className={`rounded-full px-2.5 py-1 text-[9px] font-[800] uppercase tracking-[0.08em] ${
                              isCurrentUserMessage
                                ? "bg-white/78 text-brand"
                                : "bg-[#edf7ef] text-brand"
                            }`}
                          >
                            {linkedRevisionLabel}
                          </span>
                          <span className="text-[11px] font-[800] text-[#253028]">
                            Comment on revision
                          </span>
                        </div>
                      ) : null}
                      {hasAttachments && !linkedRevisionLabel ? (
                        <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-white/75 px-2.5 py-1 text-[10px] font-[800] uppercase tracking-[0.08em] text-brand">
                          <Paperclip className="h-3.5 w-3.5" />
                          {attachmentLabel}
                        </div>
                      ) : null}
                      <div
                        className={`flex min-w-0 items-center gap-2 ${
                          isCurrentUserMessage ? "justify-end" : ""
                        }`}
                      >
                        {isCurrentUserMessage ? (
                          <span className="text-[10px] font-semibold text-[#5d7463]">
                            You
                          </span>
                        ) : (
                          <div className="min-w-0">
                            <p className="truncate text-[12px] font-semibold text-[#111712]">
                              {message.author}
                            </p>
                            <p className="truncate text-[10px] text-[#8acb74]">
                              {message.role}
                            </p>
                          </div>
                        )}
                        <span
                          className={`shrink-0 text-[10px] ${
                            isCurrentUserMessage
                              ? "text-[#6f806f]"
                              : "ml-auto text-[#7d847e]"
                          }`}
                        >
                          {getCommentStatusLabel(message)}
                        </span>
                      </div>
                      {isDeletedMessage ? (
                        <p className="mt-2 inline-flex items-center gap-1.5 whitespace-pre-wrap break-words text-[13px] italic leading-5 text-[#7b877f]">
                          <Trash2 className="h-3.5 w-3.5 shrink-0" />
                          {DELETED_STAGE_CHAT_MESSAGE_TEXT}
                        </p>
                      ) : (
                        <p
                          className={`mt-2 whitespace-pre-wrap break-words text-[13px] leading-5 ${
                            isCurrentUserMessage ? "text-[#173120]" : "text-[#111712]"
                          }`}
                        >
                          {renderCommentBodyWithMentions(message.body, message.mentions)}
                        </p>
                      )}
                      {!isDeletedMessage && message.attachments?.length ? (
                        <AttachmentHistoryList
                          attachments={message.attachments}
                          compact
                          actionsDisabled={isProjectCompleted}
                          tone={isCurrentUserMessage ? "sent" : "received"}
                        />
                      ) : null}
                    </Card>
                  </TimelineFrame>
                );
              })()
            ),
          )}

          {!hasRevisionEntries &&
          displayedMessages.length > 0 &&
          !isProjectCompleted &&
          !isStageCompleted &&
          showBriefAcceptancePrompt &&
          !showBriefContextCard ? (
            <div className="flex flex-wrap gap-2">
              {isMainProjectExecutor ? (
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
                </>
              ) : null}
              {!isMainProjectExecutor ? (
                <div className="w-full">
                  <WorkflowNoticeCard
                    title="Waiting for Main Executor"
                    body="Waiting for Main Executor to accept brief."
                  />
                </div>
              ) : null}
            </div>
          ) : null}
          {typingIndicatorText ? (
            <div className="mx-auto mb-2 mt-1 flex w-full max-w-[520px] items-center justify-center gap-2 rounded-full border border-[#dbe7dd] bg-white/88 px-4 py-2 text-[12px] font-semibold text-[#587062] shadow-[0_10px_24px_rgba(18,35,23,0.06)]">
              <span className="flex items-center gap-1" aria-hidden="true">
                <span className="size-1.5 rounded-full bg-[#6f9d7d] animate-pulse" />
                <span className="size-1.5 rounded-full bg-[#6f9d7d] animate-pulse [animation-delay:120ms]" />
                <span className="size-1.5 rounded-full bg-[#6f9d7d] animate-pulse [animation-delay:240ms]" />
              </span>
              {typingIndicatorText}
            </div>
          ) : null}
          {newRealtimeMessageCount > 0 ? (
            <div className="sticky bottom-2 z-20 flex justify-center">
              <Button
                type="button"
                size="sm"
                className="rounded-full text-[12px] shadow-[0_12px_28px_rgba(31,115,74,0.18)]"
                onClick={() => {
                  setNewRealtimeMessageCount(0);
                  setIsNearChatBottom(true);
                  scrollToChatBottom();
                }}
              >
                {newRealtimeMessageCount === 1
                  ? "New message"
                  : `${newRealtimeMessageCount} new messages`}
              </Button>
            </div>
          ) : null}
              <div ref={chatBottomRef} />
            </div>
          </div>

          {showLatestRevisionActionBar && latestRevisionMessage ? (
            <Card className="mx-auto mt-2 w-full max-w-[980px] shrink-0 rounded-[22px] border border-[#dfe8df] bg-white/95 px-4 py-3 shadow-[0_14px_34px_rgba(18,35,23,0.08)] backdrop-blur">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-[11px] font-[800] uppercase tracking-[0.08em] text-[#657269]">
                    Latest revision actions
                  </p>
                  <p className="mt-1 truncate text-[13px] font-semibold text-[#173120]">
                    {latestRevisionLabel} ·{" "}
                    {getRevisionStatusMeta(latestRevisionStatus ?? "PENDING_REVIEW").label}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {canReviewLatestRevision && latestRevisionEntryId ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="rounded-full text-[12px]"
                      disabled={pendingRevisionReviewId === latestRevisionEntryId}
                      onClick={() => {
                        setReviewDialogError(null);
                        setReviewRejectMode(false);
                        setReviewCompleteDialogOpen(false);
                        setReviewRejectReason("");
                        setReviewRevisionId(latestRevisionEntryId);
                      }}
                    >
                      Review Submission
                    </Button>
                  ) : null}
                  {canMarkLatestRevisionComplete ? (
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
                  <Button
                    type="button"
                    onClick={() => startRevisionReply(latestRevisionMessage)}
                    size="sm"
                    variant="secondary"
                    className="rounded-full text-[12px]"
                  >
                    Add Comments
                  </Button>
                </div>
              </div>
            </Card>
          ) : null}

          {isProjectCompleted ? (
            <Card className="mx-auto mt-2 w-full max-w-[980px] shrink-0 rounded-[22px] border border-[#dbe7dd] bg-[#f7fbf6] p-4 backdrop-blur">
              <p className="text-[14px] font-semibold text-[#173120]">Project chat is locked.</p>
              <p className="mt-1 text-[12px] leading-6 text-[#5f6b62]">
                This project has been completed. Only final archived files and
                completion documents remain available for viewing or download.
              </p>
            </Card>
          ) : (
            <Card className="mx-auto mt-2 w-full max-w-[980px] shrink-0 rounded-[26px] border border-[#dfe8df] bg-white/95 p-3 shadow-[0_14px_34px_rgba(18,35,23,0.08)] backdrop-blur">
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
              <input
                ref={stageInvoiceInputRef}
                type="file"
                className="sr-only"
                onChange={(event) => {
                  void handleStageInvoiceSelected(event.target.files);
                }}
              />

              {replyingToRevision ? (
                <div className="mb-3 flex flex-wrap items-center gap-2 rounded-[18px] border border-[#cfe3d2] bg-[#f7fbf6] px-3 py-2.5 text-[12px] text-[#304138]">
                  <span className="font-semibold text-brand">
                    Reply to {replyingToRevision.label}
                  </span>
                  <span className="text-[#66736a]">
                    This comment will stay linked to the revision.
                  </span>
                  <button
                    type="button"
                    onClick={() => setReplyingToRevision(null)}
                    className="ml-auto inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-full text-[#6d776f] transition hover:bg-white hover:text-[#27322b]"
                    aria-label="Clear revision reply context"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : null}

              {pendingCommentFiles.length ? (
                <div className="mb-3 flex flex-wrap gap-2 rounded-[18px] border border-[#e2e7e2] bg-[#fbfcfa] px-3 py-2.5">
                  {pendingCommentFiles.map((pendingFile) => (
                    <div
                      key={pendingFile.id}
                      className="inline-flex items-center gap-2 rounded-full border border-[#d6dfd7] bg-white px-3 py-1.5 text-[11px] text-[#324138]"
                    >
                      {pendingFile.assetType === "STAGE_SUBMISSION" ? (
                        <span className="rounded-full bg-[#edf7ef] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[#2b8b56]">
                          Submission
                        </span>
                      ) : (
                        <span className="rounded-full bg-[#f4f7f4] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[#566259]">
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
                <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#dbe6da] bg-[#f7fbf6] px-3 py-1.5 text-[12px] font-semibold text-[#31523f]">
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

              {composerError ? (
                <div className="mb-3 rounded-[18px] border border-[#f0d4d2] bg-[#fff5f4] px-4 py-3 text-[13px] text-[#bd554f]">
                  {composerError}
                </div>
              ) : null}

              <div
                ref={mentionDropdownRef}
                className="relative flex min-w-0 flex-col gap-2.5 rounded-[22px] border border-[#dde6dd] bg-[#fbfcfa] px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] sm:px-4"
              >
                <Textarea
                  ref={draftInputRef}
                  value={draft}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    setDraft(nextValue);
                    setDraftSelectionStart(event.target.selectionStart ?? event.target.value.length);
                    if (nextValue.trim()) {
                      notifyTypingActivity();
                    } else {
                      publishTypingStopped();
                    }
                  }}
                  onClick={(event) => {
                    setDraftSelectionStart(event.currentTarget.selectionStart ?? draft.length);
                  }}
                  onBlur={() => {
                    setDraftSelectionStart(-1);
                    publishTypingStopped();
                  }}
                  onKeyUp={(event) => {
                    setDraftSelectionStart(event.currentTarget.selectionStart ?? draft.length);
                  }}
                  onKeyDown={(event) => {
                    if (!mentionDropdownOpen) {
                      return;
                    }

                    if (event.key === "ArrowDown") {
                      event.preventDefault();
                      setActiveMentionIndex((current) =>
                        current + 1 >= mentionSuggestions.length ? 0 : current + 1,
                      );
                      return;
                    }

                    if (event.key === "ArrowUp") {
                      event.preventDefault();
                      setActiveMentionIndex((current) =>
                        current - 1 < 0 ? mentionSuggestions.length - 1 : current - 1,
                      );
                      return;
                    }

                    if (event.key === "Enter") {
                      const activeMention = mentionSuggestions[safeActiveMentionIndex];

                      if (activeMention) {
                        event.preventDefault();
                        handleSelectMention(activeMention);
                      }

                      return;
                    }

                    if (event.key === "Escape") {
                      event.preventDefault();
                      setActiveMentionIndex(0);
                      setDraftSelectionStart(-1);
                    }
                  }}
                  placeholder="Add a comment or upload files for this stage revision history."
                  rows={1}
                  className="box-border max-h-[168px] min-h-[58px] w-full resize-none overflow-y-hidden rounded-[16px] border border-transparent bg-white/70 px-3.5 py-3.5 text-[14px] leading-[22px] text-[#29322c] shadow-none outline-none placeholder:text-[#9aa39b] focus-visible:ring-0"
                />
                {mentionDropdownOpen ? (
                  <div className="absolute bottom-[calc(100%+10px)] left-0 right-0 z-20 overflow-hidden rounded-[22px] border border-[#dbe7dd] bg-white shadow-[0_18px_45px_rgba(23,39,28,0.12)]">
                    <div className="border-b border-[#eef2ee] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-[#6a756d]">
                      Mention collaborators
                    </div>
                    <div className="max-h-[260px] overflow-y-auto py-1.5">
                      {mentionSuggestions.map((participant, index) => {
                        const isActive = index === safeActiveMentionIndex;

                        return (
                          <button
                            key={participant.id}
                            type="button"
                            onMouseDown={(event) => {
                              event.preventDefault();
                              handleSelectMention(participant);
                            }}
                            className={`flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition ${
                              isActive ? "bg-[#f4fbf5]" : "hover:bg-[#f8fbf8]"
                            }`}
                          >
                            <div className="grid h-10 w-10 place-items-center rounded-full bg-[linear-gradient(145deg,#f0dcc4,#b58257)] text-[12px] font-semibold text-white">
                              {getInitials(participant.name)}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[14px] font-semibold text-[#173120]">
                                {participant.name}
                              </p>
                              <p className="truncate text-[12px] text-[#68736a]">
                                {participant.email || participant.role}
                              </p>
                            </div>
                            <span className="rounded-full bg-[#edf7ef] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-[#2b8b56]">
                              {participant.role}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
                <div className="flex w-full min-w-0 flex-wrap items-center justify-end gap-1.5 border-t border-[#e5ece5] pt-2 sm:gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 text-[#607064]"
                    aria-label="Expand message editor"
                    title="Expand message editor"
                    onClick={() => setExpandedMessageEditorOpen(true)}
                  >
                    <Maximize2 className="h-4.5 w-4.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 rounded-full px-2.5 text-[11px] font-[700] text-[#5083ff]"
                    aria-label="Text Translation"
                    title="Text Translation"
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
                    <span>Text Translation</span>
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
                    className="rounded-full px-4 text-[12px]"
                    disabled={isSendingComment || !canSendComment}
                  >
                    {isSendingComment ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Send className="h-3.5 w-3.5" />
                    )}
                    Send
                  </Button>
                </div>
              </div>
            </Card>
          )}
        </div>

        <aside className="no-scrollbar max-h-[calc(100dvh-12rem)] min-w-0 space-y-4 overflow-y-auto overscroll-contain pr-1 xl:h-full xl:max-h-none xl:min-h-0">
          <Card className="rounded-[20px] border border-brand/40">
            <CardHeader className="pb-3">
              <CardTitle className="text-[20px] font-semibold tracking-tight text-brand">
                Stage Overview
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <dl className="space-y-1.5 text-[13px] text-[#242b26]">
                <div>
                  <dt className="inline font-semibold">Execution Type :</dt>{" "}
                  <dd className="inline">{project.executionTypeLabel}</dd>
                </div>
                <div>
                  <dt className="inline font-semibold">Budget :</dt>{" "}
                  <dd className="inline">{activeStage?.budget ?? project.budget}</dd>
                </div>
                <div>
                  <dt className="inline font-semibold">Revisions :</dt>{" "}
                  <dd className="inline">{stageRevisionCount}</dd>
                </div>
                <div>
                  <dt className="inline font-semibold">Started At :</dt>{" "}
                  <dd className="inline">{activeStage?.actualStartedAt ?? "—"}</dd>
                </div>
                <div>
                  <dt className="inline font-semibold">Started By :</dt>{" "}
                  <dd className="inline">{activeStage?.startedByName ?? "—"}</dd>
                </div>
                <div>
                  <dt className="inline font-semibold">Stage Deadline :</dt>{" "}
                  <dd className="inline">{activeStage?.plannedDueAt ?? project.endDate}</dd>
                </div>
                <div>
                  <dt className="inline font-semibold">Status :</dt>{" "}
                  <dd className="inline">{stageExecutionStatus}</dd>
                </div>
              </dl>
              <div className="mt-5 space-y-2.5">
                {canUploadStageInvoice ? (
                  <div className="space-y-1.5">
                    <Button
                      type="button"
                      size="sm"
                      onClick={openStageInvoiceUpload}
                      disabled={isUploadingStageInvoice}
                      className="min-w-[170px] text-[13px]"
                    >
                      {isUploadingStageInvoice ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4" />
                      )}
                      Upload Invoice
                    </Button>
                    <p className="text-[11px] leading-4 text-[#6f786f]">
                      Invoice requested by {stageInvoiceRequest?.requestedByName ?? "Project Owner"}.
                    </p>
                  </div>
                ) : null}
                {showSubmitWorkAction ? (
                  <div className="space-y-1.5">
                    <Button
                      type="button"
                      size="sm"
                      onClick={openRevisionDialog}
                      disabled={!canSubmitNewRevision || isUploadingRevision}
                      className="min-w-[170px] text-[13px]"
                    >
                      {isUploadingRevision ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4" />
                      )}
                      Submit Work
                    </Button>
                    {submitWorkDisabledReason ? (
                      <p className="text-[11px] leading-4 text-[#6f786f]">
                        {submitWorkDisabledReason}
                      </p>
                    ) : null}
                  </div>
                ) : null}
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
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setProjectBriefDialogOpen(true)}
                    className="min-w-[132px] text-[13px]"
                  >
                    <FileText className="h-4 w-4" />
                    Project Brief
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => setStageBriefDialogOpen(true)}
                    disabled={!activeStage}
                    className="min-w-[120px] text-[13px]"
                  >
                    <FileText className="h-4 w-4" />
                    Stage Brief
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-[20px] font-semibold tracking-tight text-[#111712]">
                Stage Invoice
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {activeStage?.invoiceRequired === false ? (
                <p className="text-[13px] leading-5 text-[#6f786f]">
                  {project.executionType === "INTERNAL"
                    ? "Not required for internal execution."
                    : "Invoice not required for this stage."}
                </p>
              ) : stageInvoiceAttachment ? (
                <AttachmentHistoryList
                  attachments={[stageInvoiceAttachment]}
                  compact
                />
              ) : stageInvoiceRequest ? (
                <div className="space-y-3">
                  <p className="text-[13px] leading-5 text-[#6f786f]">
                    {canUploadStageInvoice ? "Invoice requested by " : "Invoice requested from "}
                    <span className="font-semibold text-[#26342c]">
                      {canUploadStageInvoice
                        ? stageInvoiceRequest.requestedByName
                        : stageInvoiceRequest.requestedFromName}
                    </span>
                    .
                  </p>
                  {stageInvoiceRequest.note ? (
                    <p className="rounded-[14px] border border-[#dfe8df] bg-[#fbfcfa] px-3 py-2 text-[12px] leading-5 text-[#5f6b62]">
                      {stageInvoiceRequest.note}
                    </p>
                  ) : null}
                  {!canUploadStageInvoice ? (
                    <p className="text-[12px] leading-5 text-[#7b837d]">
                      Waiting for invoice upload.
                    </p>
                  ) : null}
                </div>
              ) : canRequestStageInvoice ? (
                <div className="space-y-3">
                  <p className="text-[13px] leading-5 text-[#6f786f]">
                    This external stage requires an invoice before completion. Request
                    the invoice from the executor/vendor who performed the work.
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    className="text-[13px]"
                    onClick={openInvoiceRequestDialog}
                  >
                    Request Invoice
                  </Button>
                </div>
              ) : (
                <p className="text-[13px] leading-5 text-[#6f786f]">
                  Stage invoice is required before completion. Waiting for invoice request.
                </p>
              )}
              {stageInvoiceError ? (
                <p className="mt-3 rounded-[14px] border border-[#f3c6c2] bg-[#fff5f3] px-3 py-2 text-[12px] leading-5 text-[#a64038]">
                  {stageInvoiceError}
                </p>
              ) : null}
            </CardContent>
          </Card>

          <StageTimeRemainingCard
            actualStartedAt={activeStage?.actualStartedAtValue ?? null}
            stageDueAt={activeStage?.plannedDueAtValue ?? null}
          />

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-[20px] font-semibold tracking-tight text-[#111712]">
                Project Assets
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {project.attachments.length > 0 ? (
                <div className="space-y-3">
                  <ProjectAssetGrid
                    attachments={inlineProjectAssets}
                    actionsDisabled={isProjectCompleted}
                    favoriteOverrides={projectAssetFavoriteOverrides}
                    onFavoriteChange={handleProjectAssetFavoriteChange}
                  />
                  {hasMoreProjectAssets ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="w-full rounded-full border border-line text-[12px]"
                      onClick={() => setProjectAssetsModalOpen(true)}
                    >
                      View More
                      <span className="text-[11px] text-[#6d776f]">
                        {project.attachments.length} assets
                      </span>
                    </Button>
                  ) : null}
                </div>
              ) : (
                <div className="rounded-[16px] border border-dashed border-[#d7ded7] bg-[#fbfcfa] px-4 py-5 text-center text-[13px] text-[#6e776f]">
                  No project assets uploaded yet.
                </div>
              )}
            </CardContent>
          </Card>

          <ProjectExecutorsPanel
            executors={executors}
            currentUserId={currentUserId}
            onToggleChatVisibility={
              canManageChatVisibility && !isProjectCompleted
                ? (executorId, paused) =>
                    handleCollaboratorChatVisibilityToggle(executorId, paused)
                : undefined
            }
            saving={collaboratorSaving}
          />

          <ProjectCollaboratorsPanel
            collaborators={collaborators}
            currentUserId={currentUserId}
            onRemove={
              canManageCollaborators && !isProjectCompleted
                ? (collaboratorId) => removeCollaborator(collaboratorId)
                : undefined
            }
            onAdd={
              canManageCollaborators && !isProjectCompleted
                ? () => {
                    void openCollaboratorPicker();
                  }
                : undefined
            }
            onToggleChatVisibility={
              canManageChatVisibility && !isProjectCompleted
                ? (collaboratorId, paused) =>
                    handleCollaboratorChatVisibilityToggle(collaboratorId, paused)
                : undefined
            }
            saving={collaboratorSaving}
          />
        </aside>
      </div>
      {expandedMessageEditorOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#112118]/45 px-4 py-8 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="expanded-message-editor-title"
        >
          <Card className="flex max-h-[calc(100dvh-4rem)] w-full max-w-[760px] flex-col rounded-[28px] border border-[#e1e7e1] shadow-[0_35px_90px_rgba(11,26,18,0.22)]">
            <CardHeader className="flex-row items-start justify-between gap-4 space-y-0 p-6 sm:p-7">
              <div className="min-w-0">
                <CardTitle
                  id="expanded-message-editor-title"
                  className="text-[24px] font-semibold tracking-tight text-[#111712]"
                >
                  Write message
                </CardTitle>
                <p className="mt-2 text-[14px] leading-6 text-[#6a706b]">
                  Compose a longer stage message before sending.
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="icon"
                onClick={() => {
                  publishTypingStopped();
                  setExpandedMessageEditorOpen(false);
                }}
                disabled={isSendingComment}
                className="shrink-0 border border-line"
                aria-label="Close expanded message editor"
              >
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col px-6 pb-6 pt-0 sm:px-7 sm:pb-7">
              <Textarea
                ref={expandedDraftInputRef}
                value={draft}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  setDraft(nextValue);
                  setDraftSelectionStart(event.target.selectionStart ?? event.target.value.length);
                  if (nextValue.trim()) {
                    notifyTypingActivity();
                  } else {
                    publishTypingStopped();
                  }
                }}
                onClick={(event) => {
                  setDraftSelectionStart(event.currentTarget.selectionStart ?? draft.length);
                }}
                onBlur={() => {
                  publishTypingStopped();
                }}
                onKeyUp={(event) => {
                  setDraftSelectionStart(event.currentTarget.selectionStart ?? draft.length);
                }}
                placeholder="Add a comment or upload files for this stage revision history."
                className="box-border min-h-[340px] flex-1 resize-none rounded-[22px] border border-[#dfe8df] bg-[#fbfcfa] px-4 py-4 text-[15px] leading-6 text-[#29322c] shadow-inner outline-none placeholder:text-[#9aa39b] focus-visible:ring-3 focus-visible:ring-brand/15"
                disabled={isSendingComment}
              />
              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-[12px] font-semibold text-[#7a847c]">
                  {draft.length.toLocaleString()} characters
                </p>
                <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      publishTypingStopped();
                      setExpandedMessageEditorOpen(false);
                    }}
                    disabled={isSendingComment}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={async () => {
                      await handleSendComment();
                      setExpandedMessageEditorOpen(false);
                    }}
                    disabled={isSendingComment || !canSendComment}
                  >
                    {isSendingComment ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    Send
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
      <ProjectAssetsModal
        isOpen={projectAssetsModalOpen}
        attachments={project.attachments}
        actionsDisabled={isProjectCompleted}
        favoriteOverrides={projectAssetFavoriteOverrides}
        onFavoriteChange={handleProjectAssetFavoriteChange}
        onClose={() => setProjectAssetsModalOpen(false)}
      />
      <CollaboratorPickerDialog
        isOpen={collaboratorPickerOpen}
        collaborators={availableCollaboratorRecords}
        selectedIds={selectedCollaboratorIds}
        saving={collaboratorSaving}
        onToggle={toggleAssignedCollaborator}
        onClose={() => {
          setCollaboratorDialogError(undefined);
          setDraftCollaboratorIds([]);
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
      />
      <ConfirmationDialog
        isOpen={uploadNavigationGuard.isNavigationDialogOpen}
        title="Upload in progress"
        description={UPLOAD_NAVIGATION_WARNING}
        confirmLabel="Leave Page"
        cancelLabel="Stay"
        onClose={uploadNavigationGuard.cancelNavigation}
        onConfirm={uploadNavigationGuard.confirmNavigation}
      />
      <ConfirmationDialog
        isOpen={acceptBriefDialogOpen}
        title="Accept brief and start work?"
        description="This confirms that you have reviewed the Project Brief and Stage Brief and are starting work on this stage. The stage timer will start from this moment."
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
          stageInvoiceMissing
            ? "Invoice required"
            : reviewCompletionIsFinalStage
            ? "Approve final submission?"
            : "Mark stage as complete?"
        }
        description={
          stageInvoiceMissing
            ? stageInvoiceRequest
              ? "Invoice is required before completing this stage. Waiting for the requested executor/vendor to upload it."
              : "Invoice is required before completing this stage. Request invoice from the executor."
            : reviewCompletionIsFinalStage
            ? "This will approve the submitted revision and complete the final stage. Project completion and final archive happen after all stages are complete."
            : "This will mark the submitted revision as completed, complete the current stage, and make the next stage available."
        }
        confirmLabel={
          stageInvoiceMissing
            ? canRequestStageInvoice && !stageInvoiceRequest
              ? "Request Invoice"
              : "Waiting for Invoice"
            : reviewCompletionIsFinalStage
            ? "Approve Submission"
            : "Mark as Complete"
        }
        pending={stageInvoiceMissing ? false : Boolean(pendingRevisionReviewId)}
        confirmDisabled={stageInvoiceMissing && (!canRequestStageInvoice || Boolean(stageInvoiceRequest))}
        error={(stageInvoiceMissing ? stageInvoiceError : reviewDialogError) ?? undefined}
        onClose={() => {
          if (pendingRevisionReviewId) {
            return;
          }

          setReviewDialogError(null);
          setReviewCompleteDialogOpen(false);
        }}
        onConfirm={() => {
          if (stageInvoiceMissing) {
            if (canRequestStageInvoice && !stageInvoiceRequest) {
              openInvoiceRequestDialog();
            }
            return;
          }

          void handleRevisionReview("APPROVED");
        }}
      />
      <ConfirmationDialog
        isOpen={stageCompleteDialogOpen}
        title={stageInvoiceMissing ? "Invoice required" : "Mark Stage Complete"}
        description={
          stageInvoiceMissing
            ? stageInvoiceRequest
              ? "Invoice is required before completing this stage. Waiting for the requested executor/vendor to upload it."
              : "Invoice is required before completing this stage. Request invoice from the executor."
            : "This will mark the current stage as completed. Only the project owner can do this."
        }
        confirmLabel={
          stageInvoiceMissing
            ? canRequestStageInvoice && !stageInvoiceRequest
              ? "Request Invoice"
              : "Waiting for Invoice"
            : "Mark as Complete"
        }
        pending={stageInvoiceMissing ? false : isMarkingStageComplete}
        confirmDisabled={stageInvoiceMissing && (!canRequestStageInvoice || Boolean(stageInvoiceRequest))}
        error={(stageInvoiceMissing ? stageInvoiceError : stageCompleteError) ?? undefined}
        onClose={() => {
          setStageCompleteError(null);
          setStageCompleteDialogOpen(false);
        }}
        onConfirm={() => {
          if (stageInvoiceMissing) {
            if (canRequestStageInvoice && !stageInvoiceRequest) {
              openInvoiceRequestDialog();
            }
            return;
          }

          void handleMarkStageComplete();
        }}
      />
      <ConfirmationDialog
        isOpen={projectCompletionConfirmOpen}
        title="Complete Project?"
        description="All stages must be completed first. This will archive the selected final files and stop further chat interaction. Stage invoices stay in stage history and Library."
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
      <ConfirmationDialog
        isOpen={Boolean(deleteMessageTarget)}
        title="Delete message?"
        description="Delete this message? Others will see that a message was deleted."
        confirmLabel="Delete message"
        tone="destructive"
        pending={isDeletingMessage}
        error={deleteMessageError ?? undefined}
        onClose={() => {
          if (isDeletingMessage) {
            return;
          }

          setDeleteMessageError(null);
          setDeleteMessageTarget(null);
        }}
        onConfirm={() => {
          void handleConfirmDeleteMessage();
        }}
      />
      <BriefDialog
        isOpen={projectBriefDialogOpen}
        labelledById="project-brief-title"
        title="Project Brief"
        heading={project.title}
        context={activeStage ? `Current stage: ${activeStage.label}` : undefined}
        body={projectBriefText}
        emptyMessage="No project brief has been added."
        attachmentsTitle="Project Brief Attachments"
        attachments={projectBriefAttachments}
        onClose={() => setProjectBriefDialogOpen(false)}
      />
      <BriefDialog
        isOpen={stageBriefDialogOpen}
        labelledById="stage-brief-title"
        title="Stage Brief"
        heading={activeStage?.label ?? "Current stage"}
        context={project.title}
        body={stageBriefText}
        emptyMessage="No stage brief has been added for this stage."
        attachmentsTitle="Stage Brief Attachments"
        attachments={stageBriefAttachments}
        onClose={() => setStageBriefDialogOpen(false)}
      />
      {archivePreparation ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#112118]/45 px-4 py-8 backdrop-blur-[2px]">
          <Card className="flex h-full max-h-[88vh] w-full max-w-[920px] flex-col rounded-[28px] border border-[#e1e7e1] shadow-[0_35px_90px_rgba(11,26,18,0.22)]">
            <CardHeader className="flex-row items-start justify-between gap-4 space-y-0 p-6 sm:p-7">
              <div>
                <CardTitle className="text-[24px] font-semibold tracking-tight text-[#111712]">
                  Final Archive Files
                </CardTitle>
                <p className="mt-2 text-[14px] leading-6 text-[#6a706b]">
                  Review only the final files, rename them for archive storage, and choose the
                  archive category before completing the project. Working files remain in logs,
                  Library, and stage history.
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
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[#70806f]">
                    Project
                  </p>
                  <p className="mt-1 text-[16px] font-semibold text-[#111712]">
                    {archivePreparation.projectName}
                  </p>
                  <p className="mt-1 text-[13px] text-[#687269]">
                    Final stage: {archivePreparation.finalStageName}
                  </p>
                </div>
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[#70806f]">
                    Archive Category
                  </p>
                  <Select value={archiveCategoryId} onValueChange={setArchiveCategoryId}>
                    <SelectTrigger className="h-11 rounded-[14px] border border-line">
                      <SelectValue placeholder="Choose archive category" />
                    </SelectTrigger>
                    <SelectContent>
                      {archivePreparation.categories.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.parentName
                            ? `${category.parentName} / ${category.name}`
                            : category.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {archivePreparation.categories.length === 0 ? (
                    <p className="text-[12px] font-[600] text-[#bb4d49]">
                      No active archive categories are available.
                    </p>
                  ) : null}
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
                              className={`inline-flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-[10px] font-semibold ${getFileBadgeClass(
                                file.fileTypeLabel,
                              )}`}
                            >
                              {file.fileTypeLabel}
                            </span>
                            <p className="truncate text-[14px] font-semibold text-[#111712]">
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
                          <p className="text-[12px] font-semibold uppercase tracking-wide text-[#70806f]">
                            Final Archive File Name
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
                  Complete Project
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
                <CardTitle className="text-[24px] font-semibold tracking-tight text-[#111712]">
                  Upload attachment
                </CardTitle>
                <p className="mt-2 text-[14px] leading-6 text-[#6a706b]">
                  Attach discussion files here. Use Submit Work to send files for review.
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
              <div className="w-full rounded-[22px] border border-brand bg-[#f4fbf5] px-5 py-4 text-left shadow-[0_10px_24px_rgba(18,35,23,0.06)]">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[16px] font-semibold text-[#111712]">Attachment</p>
                    <p className="mt-1 text-[13px] leading-5 text-[#697169]">
                      Use for chat, references, supporting documents, or normal
                      discussion files.
                    </p>
                  </div>
                  <div className="mt-1 h-5 w-5 rounded-full border border-brand bg-brand" />
                </div>
              </div>

              <div className="rounded-[18px] border border-[#e4e8e3] bg-[#fafcf9] px-4 py-3 text-[12px] text-[#657067]">
                Use Submit Work to send files for review.
              </div>

              <div className="flex flex-col gap-3">
                <div className="space-y-2">
                  <p className="text-[13px] font-semibold text-[#2d372f]">Choose Files</p>
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
      {invoiceRequestDialogOpen ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#112118]/45 px-4 py-8 backdrop-blur-[2px]">
          <Card className="w-full max-w-[600px] rounded-[28px] border border-[#e1e7e1] shadow-[0_35px_90px_rgba(11,26,18,0.22)]">
            <CardHeader className="flex-row items-start justify-between gap-4 space-y-0 p-6 sm:p-7">
              <div>
                <CardTitle className="text-[24px] font-semibold tracking-tight text-[#111712]">
                  Request Invoice
                </CardTitle>
                <p className="mt-2 text-[14px] leading-6 text-[#6a706b]">
                  Send an in-app request to the executor or vendor responsible for this stage.
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="icon"
                onClick={() => {
                  setInvoiceRequestError(null);
                  setInvoiceRequestDialogOpen(false);
                }}
                disabled={isRequestingStageInvoice}
                className="shrink-0 border border-line"
                aria-label="Close invoice request dialog"
              >
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-5 px-6 pb-6 pt-0 sm:px-7 sm:pb-7">
              {invoiceRequestError ? (
                <div className="rounded-[18px] border border-[#f0c9c7] bg-[#fff2f1] px-4 py-3 text-[13px] text-[#bb4d49]">
                  {invoiceRequestError}
                </div>
              ) : null}
              <div className="space-y-2">
                <p className="text-[13px] font-semibold text-[#2d372f]">
                  Invoice requested from *
                </p>
                <Select
                  value={invoiceRequestRecipientId}
                  onValueChange={setInvoiceRequestRecipientId}
                  disabled={isRequestingStageInvoice}
                >
                  <SelectTrigger className="h-12 rounded-[16px] border border-line">
                    <SelectValue placeholder="Choose executor or vendor" />
                  </SelectTrigger>
                  <SelectContent>
                    {invoiceRequestCandidates.map((candidate) => (
                      <SelectItem key={candidate.id} value={candidate.id}>
                        {candidate.name} · {candidate.role}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {invoiceRequestCandidates.length === 0 ? (
                  <p className="text-[12px] leading-5 text-[#a64038]">
                    Add an executor or external collaborator before requesting an invoice.
                  </p>
                ) : null}
              </div>
              <div className="space-y-2">
                <p className="text-[13px] font-semibold text-[#2d372f]">
                  Optional message
                </p>
                <Textarea
                  value={invoiceRequestNote}
                  onChange={(event) => setInvoiceRequestNote(event.target.value)}
                  placeholder="Please upload the invoice for this completed stage."
                  className="min-h-[110px] rounded-[18px] border border-line"
                  disabled={isRequestingStageInvoice}
                />
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setInvoiceRequestError(null);
                    setInvoiceRequestDialogOpen(false);
                  }}
                  disabled={isRequestingStageInvoice}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    void handleRequestStageInvoice();
                  }}
                  disabled={isRequestingStageInvoice || invoiceRequestCandidates.length === 0}
                >
                  {isRequestingStageInvoice ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : null}
                  Send Invoice Request
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
                <CardTitle className="text-[24px] font-semibold tracking-tight text-[#111712]">
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
                  <p className="text-[13px] font-semibold text-[#2d372f]">Revision Notes</p>
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
                    <p className="text-[13px] font-semibold text-[#2d372f]">Attachments</p>
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
                    disabled={isUploadingRevision || !canSubmitNewRevision}
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
                <CardTitle className="text-[24px] font-semibold tracking-tight text-[#111712]">
                  Review Submission
                </CardTitle>
                <p className="mt-2 text-[14px] leading-6 text-[#6a706b]">
                  {reviewCompletionIsFinalStage
                    ? "Review the submitted revision. Approval completes the final stage; project completion and final archive are handled after all stages are complete."
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
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[#70806f]">
                    Revision
                  </p>
                  <p className="mt-1 text-[15px] font-semibold text-[#111712]">
                    {reviewRevisionMessage.title}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[#70806f]">
                    Current Status
                  </p>
                  <div className="mt-1">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${
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
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[#70806f]">
                    Submitted By
                  </p>
                  <p className="mt-1 text-[14px] text-[#27322b]">
                    {reviewRevisionMessage.author}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[#70806f]">
                    Submitted At
                  </p>
                  <p className="mt-1 text-[14px] text-[#27322b]">
                    {reviewRevisionMessage.createdAt}
                  </p>
                </div>
              </div>
              {reviewRevisionMessage.attachments?.length ? (
                <div className="space-y-2">
                  <p className="text-[13px] font-semibold text-[#2d372f]">Submitted Files</p>
                  <AttachmentHistoryList
                    attachments={reviewRevisionMessage.attachments}
                    actionsDisabled={isProjectCompleted}
                  />
                </div>
              ) : null}
              {stageInvoiceRequired ? (
                <div className="rounded-[20px] border border-[#dfe8df] bg-[#fbfcfa] p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#70806f]">
                        Stage Invoice
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${
                            stageInvoiceAttachment
                              ? "bg-[#edf7ef] text-[#2b8b56]"
                              : stageInvoiceRequest
                                ? "bg-[#eef6ff] text-[#2f6f9f]"
                              : "bg-[#fff8eb] text-[#b77420]"
                          }`}
                        >
                          Required ·{" "}
                          {stageInvoiceAttachment
                            ? "Uploaded"
                            : stageInvoiceRequest
                              ? "Requested"
                              : "Missing"}
                        </span>
                      </div>
                      <p className="mt-2 text-[13px] leading-5 text-[#5f6b62]">
                        {stageInvoiceAttachment
                          ? "The stage invoice is uploaded. This submission can be completed."
                          : stageInvoiceRequest
                            ? `Waiting for invoice from ${stageInvoiceRequest.requestedFromName}.`
                            : "This external stage requires an invoice before completion. Request the invoice from the executor/vendor who performed the work."}
                      </p>
                    </div>
                    {!stageInvoiceAttachment && !stageInvoiceRequest && canRequestStageInvoice ? (
                      <Button
                        type="button"
                        size="sm"
                        onClick={openInvoiceRequestDialog}
                        className="shrink-0"
                      >
                        Request Invoice
                      </Button>
                    ) : !stageInvoiceAttachment && stageInvoiceRequest && isProjectOwner ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={openInvoiceRequestDialog}
                        className="shrink-0"
                      >
                        Request Invoice
                      </Button>
                    ) : !stageInvoiceAttachment && canUploadStageInvoice ? (
                      <Button
                        type="button"
                        size="sm"
                        onClick={openStageInvoiceUpload}
                        disabled={isUploadingStageInvoice}
                        className="shrink-0"
                      >
                        {isUploadingStageInvoice ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Upload className="h-4 w-4" />
                        )}
                        Upload Invoice
                      </Button>
                    ) : null}
                  </div>
                  {stageInvoiceRequest && !stageInvoiceAttachment ? (
                    <div className="mt-3 rounded-[14px] border border-[#d9e6ef] bg-[#f6fbff] px-3 py-2 text-[12px] leading-5 text-[#3e5e73]">
                      <p>
                        Requested by {stageInvoiceRequest.requestedByName} on{" "}
                        {stageInvoiceRequest.requestedAt}.
                      </p>
                      {stageInvoiceRequest.note ? (
                        <p className="mt-1 font-semibold">{stageInvoiceRequest.note}</p>
                      ) : null}
                    </div>
                  ) : null}
                  {stageInvoiceAttachment ? (
                    <div className="mt-3">
                      <AttachmentHistoryList
                        attachments={[stageInvoiceAttachment]}
                        compact
                        actionsDisabled={isProjectCompleted}
                      />
                    </div>
                  ) : !canUploadStageInvoice ? (
                    <p className="mt-3 rounded-[14px] border border-[#efd9af] bg-[#fffaf0] px-3 py-2 text-[12px] leading-5 text-[#775a2e]">
                      {isProjectOwner
                        ? "Request the invoice from an executor/vendor. The invoice must be uploaded by the selected recipient."
                        : "Only the requested invoice recipient can upload the invoice."}
                    </p>
                  ) : null}
                  {stageInvoiceError ? (
                    <p className="mt-3 rounded-[14px] border border-[#f3c6c2] bg-[#fff5f3] px-3 py-2 text-[12px] leading-5 text-[#a64038]">
                      {stageInvoiceError}
                    </p>
                  ) : null}
                </div>
              ) : null}
              {reviewRejectMode ? (
                <div className="space-y-2">
                  <p className="text-[13px] font-semibold text-[#2d372f]">
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
                      disabled={Boolean(pendingRevisionReviewId) || stageInvoiceMissing}
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
