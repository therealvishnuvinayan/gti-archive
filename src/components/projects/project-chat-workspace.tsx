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
  createStageCommentAction,
  createStageRevisionAction,
  markStageCompleteAction,
} from "@/app/(dashboard)/projects/actions";
import { saveCollaboratorAction } from "@/app/(dashboard)/collaboration/actions";
import { saveProjectCollaboratorsAction } from "@/app/(dashboard)/projects/actions";
import {
  DEFAULT_CHAT_LANGUAGE,
  SUPPORTED_CHAT_LANGUAGES,
  getSupportedLanguageByCode,
} from "@/lib/ai/languages";
import { AssetPreviewButton } from "@/components/projects/asset-preview-button";
import { ChatLanguagePicker } from "@/components/projects/chat-language-picker";
import {
  CollaboratorDialog,
  type CollaboratorForm,
} from "@/components/collaboration/collaborator-dialog";
import { CollaboratorPickerDialog } from "@/components/collaboration/collaborator-picker-dialog";
import { ProjectCollaboratorsPanel } from "@/components/projects/project-collaborators-panel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { StageHistoryRecord } from "@/lib/project-history";
import type {
  ProjectAttachmentRecord,
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
};

type PendingFile = {
  id: string;
  file: File;
  assetType?: UploadAssetType;
};

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
              <div className="flex items-center gap-2">
                <p className="truncate text-[12px] font-[700] text-[#111712]">
                  {attachment.originalFileName}
                </p>
                {attachment.isSubmission ? (
                  <span className="inline-flex shrink-0 whitespace-nowrap rounded-full bg-[#edf7ef] px-2 py-0.5 text-[9px] font-[800] uppercase tracking-[0.08em] leading-none text-[#2b8b56]">
                    {attachment.submissionNumber
                      ? `Submission ${attachment.submissionNumber}`
                      : "Submission"}
                  </span>
                ) : null}
              </div>
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

function RevisionAttachmentTypeSummary({
  attachments,
}: {
  attachments: ProjectAttachmentRecord[];
}) {
  const groupedAttachments = attachments.reduce<
    Array<{ label: string; count: number; isSubmission: boolean }>
  >((groups, attachment) => {
    const existing = groups.find(
      (group) =>
        group.label === attachment.fileTypeLabel &&
        group.isSubmission === attachment.isSubmission,
    );

    if (existing) {
      existing.count += 1;
      return groups;
    }

    groups.push({
      label: attachment.fileTypeLabel,
      count: 1,
      isSubmission: attachment.isSubmission,
    });

    return groups;
  }, []);

  if (groupedAttachments.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 rounded-[14px] border border-white/15 bg-white/8 px-4 py-3">
      <div className="flex flex-wrap items-center justify-center gap-3">
        {groupedAttachments.map((group) => (
          <div
            key={`${group.label}-${group.isSubmission ? "submission" : "attachment"}`}
            className={`relative inline-flex h-12 min-w-12 items-center justify-center rounded-[10px] border px-3 py-2 shadow-[0_8px_20px_rgba(13,39,27,0.18)] ${getFileBadgeClass(
              group.label,
            )}`}
          >
            <span className="text-[13px] font-[800] leading-none">{group.label}</span>
            {group.isSubmission ? (
              <span className="absolute -left-1.5 -top-1.5 rounded-full bg-[#eaf6ec] px-1.5 py-0.5 text-[8px] font-[800] uppercase leading-none text-[#1f7a4b]">
                S
              </span>
            ) : null}
            {group.count > 1 ? (
              <span className="absolute -right-1.5 -top-1.5 rounded-full bg-white/95 px-1.5 py-0.5 text-[9px] font-[800] leading-none text-[#1f5f40]">
                {group.count}
              </span>
            ) : null}
          </div>
        ))}
      </div>
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
  availableCollaborators,
  currentUserId,
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
  const [pendingRevisionFiles, setPendingRevisionFiles] = useState<PendingFile[]>([]);
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
  const [collaboratorPickerOpen, setCollaboratorPickerOpen] = useState(false);
  const [collaboratorDialogOpen, setCollaboratorDialogOpen] = useState(false);
  const [collaboratorSaving, setCollaboratorSaving] = useState(false);
  const [collaboratorDialogError, setCollaboratorDialogError] = useState<string>();
  const [, startRefresh] = useTransition();
  const revisionFileInputRef = useRef<HTMLInputElement | null>(null);
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
  const stageSubmissions = useMemo(
    () => getStageSubmissionAttachments(messages),
    [messages],
  );
  const canCompareSubmissions = stageSubmissions.length >= 2;

  const activeStage = useMemo<ProjectStageRecord | undefined>(() => {
    if (!stageId) {
      return (
        project.stageCards.find((stage) => stage.id === project.currentStageId) ??
        project.stageCards[0]
      );
    }

    return project.stageCards.find((stage) => stage.id === stageId) ?? project.stageCards[0];
  }, [project.currentStageId, project.stageCards, stageId]);
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
  const isStageCompleted = activeStage?.status === "completed";
  const selectedOutputLanguage =
    getSupportedLanguageByCode(selectedOutputLanguageCode) ?? DEFAULT_CHAT_LANGUAGE;

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

  function removeCollaborator(id: string) {
    setCollaborators((current) => current.filter((collaborator) => collaborator.id !== id));
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
          .map((collaborator) => collaborator.id),
      );

      if ("error" in result) {
        setCollaboratorDialogError(result.error);
        return;
      }

      setCollaborators((current) => {
        const owner = current.find((collaborator) => collaborator.access === "owner");
        return owner ? [owner, ...result.collaborators] : result.collaborators;
      });
      setCollaboratorPickerOpen(false);
      setCollaboratorDialogError(undefined);
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
        return;
      }

      setAvailableCollaboratorRecords((current) => [
        ...current,
        inviteResult.collaborator,
      ]);

      const saveResult = await saveProjectCollaboratorsAction(project.id, [
        ...selectedCollaboratorIds,
        inviteResult.collaborator.id,
      ]);

      if ("error" in saveResult) {
        setCollaboratorDialogError(saveResult.error);
        return;
      }

      setCollaborators((current) => {
        const owner = current.find((collaborator) => collaborator.access === "owner");
        return owner ? [owner, ...saveResult.collaborators] : saveResult.collaborators;
      });
      setCollaboratorDialogOpen(false);
    } catch (error) {
      setCollaboratorDialogError(
        error instanceof Error
          ? error.message
          : "Unable to save the collaborator right now. Please try again.",
      );
    } finally {
      setCollaboratorSaving(false);
    }
  }

  function refreshHistory() {
    startRefresh(() => {
      router.refresh();
    });
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

  async function handleCreateRevision() {
    const activeStageId = activeStage?.id;
    const summary = revisionSummary.trim();

    if (!activeStageId) {
      setRevisionDialogError("This project does not have an active stage to upload into.");
      return;
    }

    if (!summary) {
      setRevisionDialogError("Enter the revision details before creating it.");
      return;
    }

    setRevisionDialogError(null);
    setIsUploadingRevision(true);

    try {
      const revisionResult = await createStageRevisionAction({
        projectId: project.id,
        stageId: activeStageId,
        summary,
      });

      if ("error" in revisionResult) {
        throw new Error(revisionResult.error);
      }

      for (const pendingFile of pendingRevisionFiles) {
        await uploadAssetFile({
          file: pendingFile.file,
          projectId: project.id,
          stageId: activeStageId,
          revisionId: revisionResult.revisionId,
          assetType: "REVISION_ORIGINAL",
        });
      }

      setRevisionDialogOpen(false);
      setRevisionSummary("");
      setPendingRevisionFiles([]);
      refreshHistory();
    } catch (error) {
      setRevisionDialogError(
        error instanceof Error ? error.message : "Unable to create the revision right now.",
      );
    } finally {
      setIsUploadingRevision(false);

      if (revisionFileInputRef.current) {
        revisionFileInputRef.current.value = "";
      }
    }
  }

  async function handleMarkStageComplete() {
    const activeStageId = activeStage?.id;

    if (!activeStageId) {
      setStageCompleteError("This project does not have an active stage.");
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
        return;
      }

      setStageCompleteDialogOpen(false);
      refreshHistory();
    } finally {
      setIsMarkingStageComplete(false);
    }
  }

  function openCommentUploadDialog() {
    setComposerError(null);
    setCommentUploadIntent("COMMENT_ATTACHMENT");
    setCommentUploadDialogOpen(true);
  }

  function handleCommentFilesSelected(files: File[] | FileList | null) {
    const selectedFiles = Array.isArray(files) ? files : Array.from(files ?? []);

    if (selectedFiles.length === 0) {
      return;
    }

    if (commentUploadIntent === "STAGE_SUBMISSION") {
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
        assetType: commentUploadIntent,
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
          assetType: pendingFile.assetType ?? "COMMENT_ATTACHMENT",
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
                  onClick={openRevisionDialog}
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
              <div key={message.id} className="space-y-3">
                <Card className="flex-1 rounded-[20px] border-none bg-[linear-gradient(135deg,#2f8d5d,#476f5a)] p-5 text-white shadow-[0_18px_45px_rgba(23,39,28,0.08)]">
                  <div className="grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)] xl:items-center">
                    <div className="max-w-[220px]">
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
                      <Card className="mx-auto min-w-0 max-w-[360px] rounded-[16px] border border-white/25 bg-[#1f5f40]/75 p-3 shadow-[0_10px_24px_rgba(13,39,27,0.28)]">
                        <p className="text-center text-[11px] font-[700]">Attachments</p>
                        <RevisionAttachmentTypeSummary attachments={message.attachments} />
                      </Card>
                    ) : null}
                  </div>
                </Card>

                {index === messages.findIndex((entry) => entry.kind === "revision") ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      onClick={openRevisionDialog}
                      size="sm"
                      className="rounded-full text-[12px]"
                      disabled={isUploadingRevision}
                    >
                      {isUploadingRevision ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Upload className="h-3.5 w-3.5" />
                      )}
                      Create Revision
                    </Button>
                    {isProjectOwner ? (
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
                      onClick={() => setDraft(`Replying to ${message.author}: `)}
                      size="sm"
                      variant="secondary"
                      className="rounded-full text-[12px]"
                    >
                      Add Comments
                    </Button>
                  </div>
                ) : null}
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
              className="sr-only"
              onChange={(event) => {
                handleRevisionFilesSelected(event.target.files);
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
              <div className="mt-5 space-y-2.5">
                {canCompareSubmissions ? (
                  <Button asChild size="sm" className="min-w-[170px] text-[13px]">
                    <Link href={`/projects/${project.id}/compare?stage=${activeStage?.id ?? ""}`}>
                      Compare Submissions
                    </Link>
                  </Button>
                ) : (
                  <div className="space-y-1.5">
                    <Button type="button" size="sm" disabled className="min-w-[170px] text-[13px]">
                      Compare Submissions
                    </Button>
                    <p className="text-[11px] leading-4 text-[#6f786f]">
                      Upload at least two submissions to compare.
                    </p>
                  </div>
                )}
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
            onAdd={() => {
              setCollaboratorDialogError(undefined);
              setCollaboratorPickerOpen(true);
            }}
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
                onClick={() => setCommentUploadIntent("STAGE_SUBMISSION")}
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
                Submissions must be PNG, JPG, JPEG, or WebP images.
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
                  Create Revision
                </CardTitle>
                <p className="mt-2 text-[14px] leading-6 text-[#6a706b]">
                  Describe the required changes and attach supporting files if needed.
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
                    Create Revision
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </section>
  );
}
