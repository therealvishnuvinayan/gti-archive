"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import {
  ArrowRight,
  ChevronRight,
  Folder,
  FolderKanban,
  MoreVertical,
  Paperclip,
  Pencil,
  Plus,
  X,
  CheckCircle2,
  Download,
} from "lucide-react";

import { ProjectAccessRealtimeGuard } from "@/components/projects/project-access-realtime-guard";
import { ProjectFlowSummaryStrip } from "@/components/projects/project-summary-strip";
import {
  createProjectConceptFolderAction,
  completeStageFourConceptsAction,
  completeStageThreeConceptsAction,
  editProjectConceptFolderAction,
} from "@/app/(dashboard)/projects/[slug]/stages/concept-actions";
import { Button } from "@/components/ui/button";
import { AssetPreviewButton } from "@/components/projects/asset-preview-button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  ProjectFormAutosaveStatus,
  useProjectFormAutosave,
} from "@/components/ui/project-form-autosave";
import { RichTextEditor, richTextToPlainText } from "@/components/ui/rich-text-editor";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  ConceptWorkflowStageKey,
  ProjectConceptFolderRecord,
} from "@/lib/project-concepts";
import type { ProjectStageShellRecord } from "@/lib/projects";
import { showErrorToast, showSuccessToast } from "@/lib/toast";

type ConceptFolder = ProjectConceptFolderRecord;
type ConceptExecutor = {
  id: string;
  name: string | null;
  email: string;
  avatarUrl: string | null;
};

type FolderDialogState =
  | { mode: "create" }
  | { mode: "edit"; folder: ConceptFolder }
  | null;

function ConceptDetailsDialog({
  projectId,
  stageKey,
  state,
  executors,
  defaultName,
  defaultAssignedExecutorId,
  onClose,
  onSubmit,
}: {
  projectId: string;
  stageKey: ConceptWorkflowStageKey;
  state: Exclude<FolderDialogState, null>;
  executors: ConceptExecutor[];
  defaultName: string;
  defaultAssignedExecutorId?: string | null;
  onClose: () => void;
  onSubmit: (input: {
    name: string;
    assignedExecutorId: string;
    brief: string;
    files: File[];
  }, clearDraft: () => Promise<void>) => void;
}) {
  const [name, setName] = useState(
    state.mode === "edit" ? state.folder.name : defaultName,
  );
  const [assignedExecutorId, setAssignedExecutorId] = useState(
    state.mode === "edit"
      ? state.folder.assignedExecutorId ?? ""
      : defaultAssignedExecutorId?.trim() ||
          (executors.length === 1 ? executors[0]?.id ?? "" : ""),
  );
  const [brief, setBrief] = useState(
    state.mode === "edit" ? state.folder.brief ?? "" : "",
  );
  const [files, setFiles] = useState<File[]>([]);
  const [existingAttachments, setExistingAttachments] = useState(
    state.mode === "edit" ? state.folder.briefAttachments : [],
  );
  const detailsLocked = state.mode === "edit" && Boolean(state.folder.actualStartedAt);
  const autosave = useProjectFormAutosave({
    projectId,
    formKey: `concept-details:${stageKey}:${state.mode === "edit" ? state.folder.id : "create"}`,
    value: { name, assignedExecutorId, brief },
    enabled: !detailsLocked,
    onRestore: (draft) => {
      setName(draft.name);
      setAssignedExecutorId(draft.assignedExecutorId);
      setBrief(draft.brief);
    },
  });
  const attachmentInputId = useId();
  const cleanName = name.trim().replace(/\s+/g, " ");
  const cleanBrief = richTextToPlainText(brief);
  const assignmentLocked =
    detailsLocked && state.mode === "edit" && Boolean(state.folder.assignedExecutorId);
  const canSubmit =
    Boolean(cleanName) &&
    Boolean(assignedExecutorId) &&
    Boolean(cleanBrief);
  const closeWithAutosave = () => {
    void autosave.flush().finally(onClose);
  };

  return (
    <div
      className="fixed inset-0 z-[160] flex items-center justify-center overflow-hidden bg-[#112118]/35 p-3 backdrop-blur-[2px] sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="concept-folder-dialog-title"
    >
      <Card className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-[540px] flex-col overflow-hidden rounded-[24px] border-[#dfe6df] shadow-[0_32px_80px_rgba(14,31,20,0.2)] sm:max-h-[calc(100dvh-2.5rem)]">
        <CardContent className="flex min-h-0 flex-1 flex-col p-0">
          <div className="flex shrink-0 items-start justify-between gap-4 border-b border-[#e5ebe6] px-5 py-4 sm:px-6 sm:py-5">
            <div>
              <h2
                id="concept-folder-dialog-title"
                className="text-[21px] font-[760] tracking-[-0.03em] text-[#162019]"
              >
                {state.mode === "create" ? "Create Concept" : "Edit Concept"}
              </h2>
              <p className="mt-1 text-[12px] leading-5 text-[#6f7a72]">
                Assign one project executor and keep the concept brief with its tasker.
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              onClick={closeWithAutosave}
              aria-label="Close folder dialog"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">
            <div className="grid gap-5">
              <label className="block space-y-2">
                <span className="text-[12px] font-[700] text-[#2d372f]">Concept Name *</span>
                <Input
                  autoFocus
                  value={name}
                  maxLength={120}
                  placeholder="e.g., Concept 2"
                  className="h-12 rounded-[14px] border-[#cfdad1] bg-[#fbfdfb] px-4 shadow-none focus-visible:border-[#46906a]"
                  onChange={(event) => setName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") closeWithAutosave();
                  }}
                />
              </label>

              <label className="block space-y-2">
                <span className="text-[12px] font-[700] text-[#2d372f]">Assigned Executor *</span>
                <Select
                  value={assignedExecutorId}
                  onValueChange={setAssignedExecutorId}
                  disabled={
                    assignmentLocked ||
                    (state.mode === "create" && executors.length === 1)
                  }
                >
                  <SelectTrigger className="h-12 rounded-[14px] border-[#cfdad1] bg-[#fbfdfb] px-4 shadow-none focus-visible:border-[#46906a]">
                    <SelectValue placeholder="Select a project executor" />
                  </SelectTrigger>
                  <SelectContent className="z-[180]">
                    {executors.map((executor) => (
                      <SelectItem key={executor.id} value={executor.id}>
                        <span className="flex items-center gap-2">
                          <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#e7f2ea] text-[10px] font-[760] text-[#2f8057]">
                            {(executor.name?.trim() || executor.email).slice(0, 1).toUpperCase()}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate">{executor.name?.trim() || executor.email}</span>
                            <span className="block truncate text-[10px] text-[#7a857d]">{executor.email}</span>
                          </span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="block text-[11px] leading-4 text-[#748078]">
                  {state.mode === "create" && executors.length === 1
                    ? "Automatically assigned because this project has one executor."
                    : "Choose the project executor responsible for this concept."}
                </span>
              </label>

              <div className="block space-y-2">
                <span className="text-[12px] font-[700] text-[#2d372f]">Concept Brief *</span>
                <RichTextEditor
                  value={brief}
                  onChange={setBrief}
                  disabled={detailsLocked}
                  placeholder="Describe the direction, requirements, and expected outcome."
                  minHeightClassName="min-h-[112px]"
                  ariaLabel="Concept brief"
                  required
                  error={!cleanBrief}
                />
                {!cleanBrief ? (
                  <span className="block text-[11px] font-[600] text-[#b84e48]">
                    Concept Brief is required.
                  </span>
                ) : null}
              </div>

              <div className="space-y-2">
                <span className="block text-[12px] font-[700] text-[#2d372f]">Brief Attachments</span>
                <Input
                  id={attachmentInputId}
                  type="file"
                  multiple
                  disabled={detailsLocked}
                  className="sr-only"
                  onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
                />
                <label
                  htmlFor={attachmentInputId}
                  aria-disabled={detailsLocked}
                  className={`flex min-h-[76px] items-center gap-3 rounded-[14px] border border-dashed border-[#b9c9bc] bg-[#f8fbf8] px-4 py-3 transition ${detailsLocked ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:border-[#65a47d] hover:bg-[#f3f9f5]"}`}
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-[#e7f2ea] text-[#2f8057]">
                    <Paperclip className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-[700] text-[#2b3730]">
                      {files.length ? `${files.length} ${files.length === 1 ? "file" : "files"} selected` : "Choose files"}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-[#7a857d]">Attach concept references or supporting documents.</span>
                  </span>
                  <span className="shrink-0 rounded-full border border-[#cfdad1] bg-white px-3 py-1.5 text-[11px] font-[700] text-[#356d4e]">Browse</span>
                </label>

                {files.length ? (
                  <div className="flex flex-wrap gap-2" aria-label="Selected brief attachments">
                    {files.map((file, index) => (
                      <span key={`${file.name}-${file.lastModified}-${index}`} className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-[#d8e2da] bg-[#f3f7f3] py-1.5 pl-3 pr-2 text-[11px] text-[#526057]">
                        <span className="max-w-[260px] truncate">{file.name}</span>
                        <button type="button" aria-label={`Remove ${file.name}`} onClick={() => setFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))}>
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                ) : null}

                {state.mode === "edit" && existingAttachments.length ? (
                  <div className="flex flex-wrap gap-2" aria-label="Existing brief attachments">
                    {existingAttachments.map((file) => (
                      <span key={file.id} className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-[#d8e2da] bg-[#edf4ee] py-1.5 pl-3 pr-2 text-[11px] text-[#526057]">
                        <span className="max-w-[260px] truncate">{file.name}</span>
                        {!detailsLocked ? (
                          <button
                            type="button"
                            aria-label={`Remove ${file.name}`}
                            onClick={async () => {
                              const response = await fetch(`/api/project-assets/${file.id}`, {
                                method: "DELETE",
                              });
                              const payload = (await response.json()) as { error?: string };
                              if (!response.ok) {
                                showErrorToast(payload.error || "Unable to remove the attachment.");
                                return;
                              }
                              setExistingAttachments((current) =>
                                current.filter((attachment) => attachment.id !== file.id),
                              );
                            }}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        ) : null}
                      </span>
                    ))}
                  </div>
                ) : null}
                {detailsLocked ? (
                  <p className="text-[11px] text-[#8a6b36]">
                    {assignmentLocked
                      ? "Executor, brief, and brief attachments are locked because work has started."
                      : "Assign this legacy concept before executor access can begin. Brief and attachments stay locked."}
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 flex-col-reverse gap-3 border-t border-[#e5ebe6] bg-white px-5 py-4 sm:flex-row sm:items-center sm:px-6">
            <Button type="button" className="w-full sm:w-auto" variant="secondary" onClick={closeWithAutosave}>
              Cancel
            </Button>
            {!detailsLocked ? <ProjectFormAutosaveStatus status={autosave.status} savedAt={autosave.savedAt} restoredAt={autosave.restoredAt} onRetry={() => void autosave.retry()} className="sm:mr-auto" /> : null}
            <Button
              type="button"
              className="w-full sm:w-auto"
              disabled={!canSubmit}
              onClick={() =>
                onSubmit(
                  {
                    name: cleanName,
                    assignedExecutorId,
                    brief,
                    files,
                  },
                  autosave.clearDraft,
                )
              }
            >
              {state.mode === "create" ? "Create Concept" : "Save Changes"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

async function uploadConceptBriefAttachment(input: {
  projectId: string;
  taskerStageId?: string | null;
  file: File;
}) {
  const prepareResponse = await fetch("/api/project-assets/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      projectId: input.projectId,
      stageId: input.taskerStageId ?? null,
      revisionId: null,
      commentId: null,
      originalFileName: input.file.name,
      mimeType: input.file.type || "application/octet-stream",
      fileSize: input.file.size,
      assetType: "GENERAL_PROJECT_ASSET",
    }),
  });
  const prepared = (await prepareResponse.json()) as {
    error?: string;
    attachmentId?: string;
    uploadUrl?: string;
  };

  if (!prepareResponse.ok || !prepared.attachmentId || !prepared.uploadUrl) {
    throw new Error(prepared.error || "Unable to prepare the brief attachment upload.");
  }

  try {
    const uploadResponse = await fetch(prepared.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": input.file.type || "application/octet-stream" },
      body: input.file,
    });
    if (!uploadResponse.ok) {
      throw new Error(`Upload failed with status ${uploadResponse.status}.`);
    }

    const completeResponse = await fetch("/api/project-assets/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        attachmentId: prepared.attachmentId,
        projectId: input.projectId,
      }),
    });
    const completed = (await completeResponse.json()) as { error?: string };
    if (!completeResponse.ok) {
      throw new Error(completed.error || "Unable to finalize the brief attachment.");
    }

    return prepared.attachmentId;
  } catch (error) {
    await fetch("/api/project-assets/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        attachmentId: prepared.attachmentId,
        projectId: input.projectId,
        failed: true,
      }),
    }).catch(() => undefined);
    throw error;
  }
}

async function discardConceptBriefAttachments(attachmentIds: string[]) {
  await Promise.allSettled(
    attachmentIds.map((attachmentId) =>
      fetch(`/api/project-assets/${attachmentId}`, { method: "DELETE" }),
    ),
  );
}

export function ConceptStageWorkspace({
  stageNumber,
  stageTitle,
  stageKey,
  project,
  currentUserId,
  initialFolders,
  canManageConcepts,
  canCompleteStage,
  stageWorkflowStatus,
  completionConcepts,
  executors,
  selectedExecutorId,
  showChrome = true,
}: {
  stageNumber: 3 | 4;
  stageTitle: string;
  stageKey: ConceptWorkflowStageKey;
  project: ProjectStageShellRecord;
  currentUserId: string;
  initialFolders: ProjectConceptFolderRecord[];
  canManageConcepts: boolean;
  canCompleteStage: boolean;
  stageWorkflowStatus: "LOCKED" | "AVAILABLE" | "COMPLETED" | null;
  completionConcepts: Array<{
    id: string;
    name: string;
    isApproved: boolean;
  }>;
  executors: ConceptExecutor[];
  selectedExecutorId: string | null;
  showChrome?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isCompleting, startCompletionTransition] = useTransition();
  const [folders, setFolders] = useState<ConceptFolder[]>(initialFolders);
  const [dialog, setDialog] = useState<FolderDialogState>(null);
  const [completionDialogOpen, setCompletionDialogOpen] = useState(false);
  const [completionError, setCompletionError] = useState<string | null>(null);
  const managementLocked = stageWorkflowStatus === "COMPLETED";
  const approvedConceptCount = completionConcepts.filter(
    (concept) => concept.isApproved,
  ).length;
  const unapprovedConcepts = completionConcepts.filter(
    (concept) => !concept.isApproved,
  );
  const allConceptsApproved =
    completionConcepts.length > 0 && unapprovedConcepts.length === 0;
  const isEmptyStageThree = stageNumber === 3 && completionConcepts.length === 0;
  const stageCompletionReady =
    stageNumber === 3 ? isEmptyStageThree || allConceptsApproved : allConceptsApproved;

  function completeCurrentStage() {
    if (!canCompleteStage) {
      setCompletionError(
        `Only the Project Owner or Super Admin can complete Stage ${stageNumber}.`,
      );
      return;
    }

    if (stageNumber === 3 && !isEmptyStageThree && !allConceptsApproved) {
      setCompletionError(
        unapprovedConcepts.length > 0
          ? `Every Stage 3 concept must have an Approved Concept before completion. Pending: ${unapprovedConcepts.map((concept) => concept.name).join(", ")}.`
          : "Approve every created Stage 3 concept before continuing.",
      );
      return;
    }

    if (stageNumber === 4 && !allConceptsApproved) {
      setCompletionError(
        "Every Stage 4 concept must receive Final Approval before Stage 4 can be completed.",
      );
      return;
    }

    setCompletionError(null);
    startCompletionTransition(async () => {
      const result =
        stageNumber === 3
          ? await completeStageThreeConceptsAction({ projectId: project.id })
          : await completeStageFourConceptsAction({ projectId: project.id });

      if ("error" in result) {
        setCompletionError(result.error);
        return;
      }

      setCompletionDialogOpen(false);
      if (stageNumber === 3 && "approvedCount" in result) {
        showSuccessToast(
          result.skipped
            ? "Stage 3 skipped. Stage 4 is now available."
            : `Stage 3 completed with ${result.approvedCount} approved concept${result.approvedCount === 1 ? "" : "s"}. Stage 4 is now available.`,
        );
        router.push(`/projects/${project.id}/stages/4`);
      } else if (stageNumber === 4 && "finalApprovedCount" in result) {
        showSuccessToast(
          `Stage 4 completed. ${result.finalApprovedCount} final approved file${result.finalApprovedCount === 1 ? "" : "s"} moved to Stage 5.`,
        );
        router.push(`/projects/${project.id}/stages/5`);
      }
      router.refresh();
    });
  }

  function submitConceptDetails(input: {
    name: string;
    assignedExecutorId: string;
    brief: string;
    files: File[];
  }, clearDraft: () => Promise<void>) {
    if (!dialog) return;

    if (!input.brief.trim()) {
      showErrorToast("Concept Brief is required.");
      return;
    }

    const submittedDialog = dialog;
    startTransition(async () => {
      let taskerStageId: string;

      if (submittedDialog.mode === "edit") {
        const result = await editProjectConceptFolderAction({
          projectId: project.id,
          stageKey,
          folderId: submittedDialog.folder.id,
          name: input.name,
          assignedExecutorId: input.assignedExecutorId,
          brief: input.brief,
        });

        if ("error" in result) {
          showErrorToast(result.error ?? "Unable to edit the concept.");
          return;
        }

        taskerStageId = submittedDialog.folder.taskerStageId;
        const assignedExecutor =
          executors.find((executor) => executor.id === input.assignedExecutorId) ?? null;
        setFolders((current) =>
          current.map((folder) =>
            folder.id === result.folder.id
              ? {
                  ...folder,
                  name: result.folder.name,
                  assignedExecutorId: input.assignedExecutorId,
                  assignedExecutor,
                  brief: input.brief.trim() || null,
                }
              : folder,
          ),
        );
      } else {
        const uploadResults = await Promise.allSettled(
          input.files.map((file) =>
            uploadConceptBriefAttachment({
              projectId: project.id,
              taskerStageId: null,
              file,
            }),
          ),
        );
        const briefAttachmentIds = uploadResults.flatMap((result) =>
          result.status === "fulfilled" ? [result.value] : [],
        );
        const failedFiles = input.files.filter(
          (_file, index) => uploadResults[index]?.status === "rejected",
        );

        if (failedFiles.length > 0) {
          await discardConceptBriefAttachments(briefAttachmentIds);
          showErrorToast(
            "Concept was not created.",
            `Brief attachment upload failed: ${failedFiles.map((file) => file.name).join(", ")}`,
          );
          return;
        }

        const result = await createProjectConceptFolderAction({
          projectId: project.id,
          stageKey,
          name: input.name,
          assignedExecutorId: input.assignedExecutorId,
          brief: input.brief,
          briefAttachmentIds,
        });

        if ("error" in result) {
          await discardConceptBriefAttachments(briefAttachmentIds);
          showErrorToast(result.error ?? "Unable to create the concept folder.");
          return;
        }

        taskerStageId = result.folder.taskerStageId;
        setFolders((current) => [...current, result.folder]);
        await clearDraft().catch(() => undefined);
        setDialog(null);
        router.refresh();
        showSuccessToast("Concept created.");
        return;
      }

      const uploadResults = await Promise.allSettled(
        input.files.map((file) =>
          uploadConceptBriefAttachment({
            projectId: project.id,
            taskerStageId,
            file,
          }),
        ),
      );
      const failedFiles = input.files.filter(
        (_file, index) => uploadResults[index]?.status === "rejected",
      );

      await clearDraft().catch(() => undefined);
      setDialog(null);
      router.refresh();
      if (failedFiles.length) {
        showErrorToast(
          "Concept saved, but some attachments failed.",
          `Retry: ${failedFiles.map((file) => file.name).join(", ")}`,
        );
      } else {
        showSuccessToast("Concept updated.");
      }
    });
  }

  return (
    <section className="mx-auto w-full max-w-[1420px] pb-8">
      {showChrome ? (
        <ProjectAccessRealtimeGuard projectId={project.id} currentUserId={currentUserId} />
      ) : null}

      {showChrome ? <header>
        <div className="flex items-center gap-2 text-[11px] font-[780] uppercase tracking-[0.12em] text-[#2f8057]">
          <FolderKanban className="h-4 w-4" />
          Concept Workspace
        </div>
        <h1 className="mt-4 text-[30px] font-[790] leading-[1.12] tracking-[-0.045em] text-[#111713] sm:text-[38px]">
          Stage {stageNumber} - {stageTitle}
        </h1>
        <p className="mt-3 text-[14px] leading-6 text-[#68736b]">
          Create and manage concept folders.
        </p>
      </header> : null}

      {showChrome ? <ProjectFlowSummaryStrip project={project} /> : null}

      <section
        id="concept-folders"
        className="mt-6 scroll-mt-4 border-t border-[#dfe6df] pt-6"
        aria-labelledby="concept-folders-heading"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-[#eaf4ed] text-[#2e8057]">
              <Folder className="h-5 w-5" />
            </span>
            <div>
              <h2
                id="concept-folders-heading"
                className="text-[20px] font-[760] tracking-[-0.025em] text-[#18211b]"
              >
                Concept Folders
              </h2>
              <p className="mt-1 text-[13px] leading-5 text-[#707a73]">
                Manage your concept folders.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            {canManageConcepts && executors.length > 1 ? (
              <label className="min-w-[220px] space-y-1.5">
                <span className="text-[11px] font-[720] uppercase tracking-[0.08em] text-[#748078]">
                  Viewing Executor
                </span>
                <Select
                  value={selectedExecutorId ?? "all"}
                  onValueChange={(value) => {
                    const query = value === "all" ? "" : `?executor=${encodeURIComponent(value)}`;
                    router.replace(`/projects/${project.id}/stages/${stageNumber}${query}`);
                  }}
                >
                  <SelectTrigger className="rounded-[12px] border border-[#dfe6df] bg-white">
                    <SelectValue placeholder="All Executors" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Executors</SelectItem>
                    {executors.map((executor) => (
                      <SelectItem key={executor.id} value={executor.id}>
                        {executor.name?.trim() || executor.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            ) : null}
            {stageNumber === 3 && managementLocked ? (
              <span className="inline-flex h-11 items-center gap-2 rounded-[12px] bg-[#e7f5eb] px-4 text-[12px] font-[760] text-[#247247]">
                <CheckCircle2 className="h-4 w-4" /> Stage 3 Completed
              </span>
            ) : null}
            {stageNumber === 3 && managementLocked ? (
              <Button
                asChild
                type="button"
                className="h-11 rounded-[12px] px-5 font-[720]"
              >
                <Link href={`/projects/${project.id}/stages/4`}>
                  Go to Stage 4
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            ) : null}
            {stageNumber === 4 && managementLocked ? (
              <span className="inline-flex h-11 items-center gap-2 rounded-[12px] bg-[#e7f5eb] px-4 text-[12px] font-[760] text-[#247247]">
                <CheckCircle2 className="h-4 w-4" /> Stage 4 Completed
              </span>
            ) : null}
            {stageNumber === 4 && managementLocked ? (
              <Button
                asChild
                type="button"
                className="h-11 rounded-[12px] px-5 font-[720]"
              >
                <Link href={`/projects/${project.id}/stages/5`}>
                  Go to Stage 5
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            ) : null}
            {canCompleteStage && !managementLocked && stageCompletionReady ? (
              <Button
                type="button"
                className="h-11 rounded-[12px] px-5 font-[720]"
                disabled={isCompleting}
                onClick={() => {
                  setCompletionError(null);
                  setCompletionDialogOpen(true);
                }}
              >
                <CheckCircle2 className="h-4 w-4" />
                {stageNumber === 3
                  ? isEmptyStageThree
                    ? "Skip Stage 3"
                    : "Continue to Stage 4"
                  : "Continue to Stage 5"}
              </Button>
            ) : null}
            {canManageConcepts && !managementLocked ? (
              <Button
                type="button"
                variant="outline"
                className="h-11 rounded-[12px] border-[#39835d] bg-white px-5 font-[720] text-[#27704b] hover:bg-[#f1f8f3]"
                disabled={isPending || executors.length === 0}
                onClick={() => setDialog({ mode: "create" })}
              >
                <Plus className="h-4 w-4" />
                Create Concept
              </Button>
            ) : null}
          </div>
        </div>

        {folders.length === 0 ? (
          <div className="mt-6 rounded-[20px] border border-dashed border-[#cfdacf] bg-[#f8faf8] px-6 py-10 text-center">
            <p className="text-[16px] font-[740] text-[#273129]">No concepts yet</p>
            <p className="mt-1 text-[12px] text-[#748078]">
              {stageNumber === 3 && canManageConcepts
                ? "Create the first concept when the name, executor, and brief are ready."
                : stageNumber === 4 && canManageConcepts
                  ? "Create a final-concept folder, then optionally import an approved Stage 3 concept from its chat."
                  : "No concepts are available in this stage."}
            </p>
          </div>
        ) : <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {folders.map((folder) => (
            <Card
              key={folder.id}
              className="relative min-w-0 rounded-[20px] border-[#dfe6df] shadow-[0_12px_30px_rgba(23,39,28,0.05)] transition hover:-translate-y-0.5 hover:border-[#bdd4c4] hover:shadow-[0_18px_38px_rgba(28,75,48,0.08)]"
            >
              <Link
                href={`/projects/${project.id}/stages/${stageNumber}/concepts/${folder.id}`}
                className="absolute inset-0 rounded-[20px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2f8057] focus-visible:ring-offset-2"
                aria-label={`Open ${folder.name}`}
              />
              <CardContent className="flex min-h-[126px] items-center gap-4 p-5">
                <span className="grid size-12 shrink-0 place-items-center rounded-[14px] bg-[#e7f2ea] text-[#30845a]">
                  <Folder className="h-7 w-7 fill-current" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-[740] text-[#202a23]">{folder.name}</span>
                  {canManageConcepts ? (
                    <span className="mt-1 block truncate text-[11px] text-[#748078]">
                      Assigned to: {folder.assignedExecutor?.name || folder.assignedExecutor?.email || "Unassigned"}
                    </span>
                  ) : null}
                  {stageNumber === 3 ? (
                    <span
                      className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-[9px] font-[800] uppercase tracking-[0.07em] ${
                        folder.approvedAttachment
                          ? "bg-[#e7f5eb] text-[#247247]"
                          : folder.latestRevisionStatus === "REJECTED"
                            ? "bg-[#fff0ef] text-[#b94d45]"
                            : "bg-[#fff3d6] text-[#8a5718]"
                      }`}
                    >
                      {folder.approvedAttachment
                        ? "Approved Concept"
                        : folder.latestRevisionStatus === "REJECTED"
                          ? "Changes Requested"
                          : "Not Approved"}
                    </span>
                  ) : null}
                  {stageNumber === 4 ? (
                    <span
                      className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-[9px] font-[800] uppercase tracking-[0.07em] ${
                        folder.approvedAttachment
                          ? "bg-[#e7f5eb] text-[#247247]"
                          : folder.latestRevisionStatus === "REJECTED"
                            ? "bg-[#fff0ef] text-[#b94d45]"
                            : "bg-[#fff3d6] text-[#8a5718]"
                      }`}
                    >
                      {folder.approvedAttachment
                        ? "Final Approved"
                        : folder.latestRevisionStatus === "REJECTED"
                          ? "Changes Requested"
                          : "In Progress"}
                    </span>
                  ) : null}
                  {stageNumber === 4 && folder.startingReference ? (
                    <span className="relative z-10 mt-3 block rounded-[12px] border border-[#dbe7dd] bg-[#f7fbf7] p-2.5">
                      <span className="block text-[9px] font-[800] uppercase tracking-[0.08em] text-[#5f7566]">
                        Starting Reference
                      </span>
                      <span className="mt-1 flex min-w-0 items-center gap-1">
                        <span className="min-w-0 flex-1 truncate text-[10px] font-[650] text-[#344138]">
                          {folder.startingReference.name}
                        </span>
                        <AssetPreviewButton
                          fileName={folder.startingReference.name}
                          mimeType={folder.startingReference.mimeType}
                          previewPath={folder.startingReference.previewPath}
                          downloadPath={folder.startingReference.downloadPath}
                          triggerClassName="size-7 rounded-full text-brand"
                        />
                        <Button
                          asChild
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-7 rounded-full text-brand"
                        >
                          <a
                            href={folder.startingReference.downloadPath}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={`Download ${folder.startingReference.name}`}
                          >
                            <Download className="h-3.5 w-3.5" />
                          </a>
                        </Button>
                      </span>
                    </span>
                  ) : null}
                </span>
                {canManageConcepts && !managementLocked ? <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="relative z-10 size-8 shrink-0 text-[#758078]"
                      aria-label={`Folder actions for ${folder.name}`}
                    >
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onSelect={() =>
                        setDialog({
                          mode: "edit",
                          folder,
                        })
                      }
                    >
                      <Pencil className="h-4 w-4" />
                      Edit Concept
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu> : null}
                <ChevronRight className="h-4 w-4 shrink-0 text-[#8b958e]" aria-hidden="true" />
              </CardContent>
            </Card>
          ))}
        </div>}
      </section>

      {dialog ? (
        <ConceptDetailsDialog
          key={dialog.mode === "edit" ? dialog.folder.id : "create"}
          state={dialog}
          projectId={project.id}
          stageKey={stageKey}
          executors={executors}
          defaultName={folders.length === 0 ? "Concept 1" : `Concept ${folders.length + 1}`}
          defaultAssignedExecutorId={selectedExecutorId}
          onClose={() => setDialog(null)}
          onSubmit={submitConceptDetails}
        />
      ) : null}

      <ConfirmationDialog
        isOpen={
          canCompleteStage &&
          completionDialogOpen &&
          stageCompletionReady
        }
        title={
          stageNumber === 3
            ? isEmptyStageThree
              ? "Skip Stage 3?"
              : "Continue to Stage 4?"
            : "Continue to Stage 5?"
        }
        description={
          stageNumber === 3
            ? isEmptyStageThree
              ? "No Stage 3 concepts have been created. Continue directly to Stage 4 only when an initial concept already exists outside this stage."
              : unapprovedConcepts.length > 0
                ? `Every Stage 3 concept must have an Approved Concept before completion. Pending: ${unapprovedConcepts.map((concept) => concept.name).join(", ")}.`
                : `Stage 3 will be closed with ${approvedConceptCount} approved concept${approvedConceptCount === 1 ? "" : "s"}. Stage 4 will open without automatically creating any folders.`
            : approvedConceptCount === 0
              ? "At least one concept must have a Final Approved File before Stage 4 can be completed."
              : unapprovedConcepts.length > 0
                ? `Every Stage 4 concept must receive Final Approval before completion. Pending: ${unapprovedConcepts.map((concept) => concept.name).join(", ")}.`
                : `${approvedConceptCount} final approved file${approvedConceptCount === 1 ? "" : "s"} will continue to Stage 5, and Stage 4 concept management will be locked.`
        }
        confirmLabel={
          stageNumber === 3
            ? isEmptyStageThree
              ? "Skip and Continue"
              : "Continue to Stage 4"
            : "Continue to Stage 5"
        }
        cancelLabel="Cancel"
        pending={isCompleting}
        confirmDisabled={!stageCompletionReady}
        error={completionError ?? undefined}
        onConfirm={completeCurrentStage}
        onClose={() => {
          if (isCompleting) return;
          setCompletionDialogOpen(false);
          setCompletionError(null);
        }}
      />
    </section>
  );
}

export function ConceptStageLoadingShell() {
  return (
    <div className="mx-auto w-full max-w-[1420px] animate-pulse space-y-7 pb-8">
      <div className="space-y-3">
        <div className="h-4 w-44 rounded-full bg-[#e8eee8]" />
        <div className="h-11 w-80 max-w-full rounded-[14px] bg-[#e8eee8]" />
        <div className="h-5 w-64 rounded-full bg-[#eef2ee]" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-[126px] rounded-[20px] bg-[#edf2ed]" />
        ))}
      </div>
      <div className="border-t border-[#e4e9e4] pt-7">
        <div className="h-12 w-56 rounded-[14px] bg-[#e8eee8]" />
        <div className="mt-6 h-[126px] max-w-[440px] rounded-[20px] bg-[#edf2ed]" />
      </div>
    </div>
  );
}
