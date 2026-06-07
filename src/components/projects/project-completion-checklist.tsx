"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type ReactNode } from "react";
import { Download, Loader2, Lock, Upload } from "lucide-react";

import {
  configureProjectCompletionWorkflowAction,
  markProjectInvoiceNotRequiredAction,
  prepareAuthorityApprovalRequestAction,
  prepareCopyrightTransferRequestAction,
} from "@/app/(dashboard)/projects/actions";
import { AssetPreviewButton } from "@/components/projects/asset-preview-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { ProjectCompletionSummary } from "@/lib/archives";
import type {
  ProjectCompletionArchivedFileOption,
  ProjectCompletionDocumentRecord,
  ProjectCompletionWorkflowRecord,
} from "@/lib/project-completion";
import { showErrorToast, showSuccessToast } from "@/lib/toast";

const COMPLETION_DOCUMENT_TYPES = {
  approval: "AUTHORITY_APPROVAL_PROOF",
  copyright: "COPYRIGHT_TRANSFER",
  invoice: "INVOICE",
} as const;

const completionDocumentAccept = ".pdf,.png,.jpg,.jpeg,.webp";

type CompletionDocumentTypeValue =
  (typeof COMPLETION_DOCUMENT_TYPES)[keyof typeof COMPLETION_DOCUMENT_TYPES];

type CompletedProjectArchiveSummaryCardProps = {
  completionSummary: ProjectCompletionSummary;
};

type ProjectCompletionChecklistProps = {
  projectId: string;
  workflow: ProjectCompletionWorkflowRecord | null;
};

function getFileBadgeClass(label: string) {
  switch (label) {
    case "PDF":
      return "bg-[#fff6f4] text-[#d94a41] border border-[#f2d7d3]";
    case "PNG":
    case "JPG":
    case "JPEG":
    case "WEBP":
      return "bg-[#edf7ef] text-[#2b8b56]";
    default:
      return "bg-[#f4f7f4] text-[#566259]";
  }
}

function getStepStatusMeta(
  step: "approval" | "copyright" | "invoice",
  workflow: ProjectCompletionWorkflowRecord,
) {
  const required =
    step === "approval"
      ? workflow.approvalRequired
      : step === "copyright"
        ? workflow.copyrightRequired
        : true;
  const status =
    step === "approval"
      ? workflow.approvalStatus
      : step === "copyright"
        ? workflow.copyrightStatus
        : workflow.invoiceStatus;

  if (required === false || status === "NOT_REQUIRED") {
    return {
      label: "Not required",
      className: "bg-[#f4f7f4] text-[#5f6b62]",
    };
  }

  if (status === "COMPLETED") {
    return {
      label: "Completed",
      className: "bg-[#edf7ef] text-[#2b8b56]",
    };
  }

  if (status === "PENDING") {
    return {
      label:
        step === "approval"
          ? "Pending Approval"
          : step === "copyright"
            ? "Pending Signature"
            : "Pending",
      className: "bg-[#fff7ea] text-[#b77420]",
    };
  }

  if (required === true) {
    return {
      label: "Required",
      className: "bg-[#edf2ff] text-[#4760c7]",
    };
  }

  return {
    label: "Not started",
    className: "bg-[#f4f7f4] text-[#5f6b62]",
  };
}

async function uploadCompletionDocument(input: {
  file: File;
  projectId: string;
  documentType: CompletionDocumentTypeValue;
}) {
  const uploadRequest = await fetch("/api/project-completion-documents/upload-url", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      projectId: input.projectId,
      documentType: input.documentType,
      originalFileName: input.file.name,
      mimeType: input.file.type || "application/octet-stream",
      fileSize: input.file.size,
    }),
  });

  const uploadPayload = (await uploadRequest.json()) as {
    error?: string;
    uploadUrl?: string;
    storageKey?: string;
  };

  if (!uploadRequest.ok || !uploadPayload.uploadUrl || !uploadPayload.storageKey) {
    throw new Error(uploadPayload.error || "Unable to prepare the completion document upload.");
  }

  try {
    const putResponse = await fetch(uploadPayload.uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": input.file.type || "application/octet-stream",
      },
      body: input.file,
    });

    if (!putResponse.ok) {
      throw new Error("Unable to upload the selected file.");
    }

    const completionResponse = await fetch("/api/project-completion-documents/complete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        projectId: input.projectId,
        documentType: input.documentType,
        originalFileName: input.file.name,
        mimeType: input.file.type || "application/octet-stream",
        fileSize: input.file.size,
        storageKey: uploadPayload.storageKey,
      }),
    });

    const completionPayload = (await completionResponse.json()) as { error?: string };

    if (!completionResponse.ok) {
      throw new Error(completionPayload.error || "Unable to finalise the uploaded file.");
    }
  } catch (error) {
    await fetch("/api/project-completion-documents/complete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        projectId: input.projectId,
        documentType: input.documentType,
        originalFileName: input.file.name,
        mimeType: input.file.type || "application/octet-stream",
        fileSize: input.file.size,
        storageKey: uploadPayload.storageKey,
        failed: true,
      }),
    }).catch(() => undefined);

    throw error;
  }
}

function ArchiveFileList({
  files,
}: {
  files: Array<
    Pick<
      ProjectCompletionArchivedFileOption,
      | "id"
      | "finalArchiveFileName"
      | "originalFileName"
      | "fileTypeLabel"
      | "mimeType"
      | "fileSizeLabel"
      | "sourceLabel"
      | "previewPath"
      | "downloadPath"
    >
  >;
}) {
  if (files.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 space-y-2.5">
      {files.map((file) => (
        <div
          key={file.id}
          className="rounded-[16px] border border-[#d7e5d9] bg-white px-3 py-3 text-[#111712] shadow-[0_10px_22px_rgba(18,35,23,0.06)]"
        >
          <div className="flex items-start gap-3">
            <div
              className={`grid h-9 min-w-9 place-items-center rounded-md text-[10px] font-[800] ${getFileBadgeClass(
                file.fileTypeLabel,
              )}`}
            >
              {file.fileTypeLabel}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-[12px] font-[700] text-[#111712]">
                  {file.finalArchiveFileName}
                </p>
                <span className="inline-flex rounded-full bg-[#edf7ef] px-2 py-0.5 text-[9px] font-[800] uppercase tracking-[0.08em] text-[#2b8b56]">
                  Archived
                </span>
              </div>
              <p className="mt-0.5 text-[10px] leading-4 text-[#6c756e]">
                {file.fileSizeLabel} · {file.sourceLabel}
              </p>
              <p className="text-[10px] leading-4 text-[#89928b]">
                Original: {file.originalFileName}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <AssetPreviewButton
                fileName={file.finalArchiveFileName}
                mimeType={file.mimeType}
                previewPath={file.previewPath}
                downloadPath={file.downloadPath}
                triggerClassName="size-8 rounded-full text-brand"
              />
              <Button
                asChild
                variant="ghost"
                size="icon"
                className="size-8 rounded-full text-brand"
              >
                <a href={file.downloadPath} target="_blank" rel="noreferrer">
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

function CompletionDocumentList({
  documents,
}: {
  documents: ProjectCompletionDocumentRecord[];
}) {
  if (documents.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2.5">
      {documents.map((document) => (
        <div
          key={document.id}
          className="rounded-[16px] border border-[#d7e5d9] bg-white px-3 py-3 shadow-[0_10px_22px_rgba(18,35,23,0.06)]"
        >
          <div className="flex items-start gap-3">
            <div
              className={`grid h-9 min-w-9 place-items-center rounded-md text-[10px] font-[800] ${getFileBadgeClass(
                document.fileTypeLabel,
              )}`}
            >
              {document.fileTypeLabel}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-[12px] font-[700] text-[#111712]">
                  {document.archiveFileName}
                </p>
                <span className="inline-flex rounded-full bg-[#edf2ff] px-2 py-0.5 text-[9px] font-[800] uppercase tracking-[0.08em] text-[#4760c7]">
                  {document.typeLabel}
                </span>
              </div>
              <p className="mt-0.5 text-[10px] leading-4 text-[#6c756e]">
                {document.fileSizeLabel} · Uploaded by {document.uploadedBy}
              </p>
              <p className="text-[10px] leading-4 text-[#89928b]">
                {document.uploadedAt}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <AssetPreviewButton
                fileName={document.archiveFileName}
                mimeType={document.mimeType}
                previewPath={document.previewPath}
                downloadPath={document.downloadPath}
                triggerClassName="size-8 rounded-full text-brand"
              />
              <Button
                asChild
                variant="ghost"
                size="icon"
                className="size-8 rounded-full text-brand"
              >
                <a href={document.downloadPath} target="_blank" rel="noreferrer">
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

function ChoiceButton({
  active,
  disabled = false,
  children,
  onClick,
}: {
  active: boolean;
  disabled?: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-[16px] border px-4 py-3 text-left text-[13px] transition ${
        active
          ? "border-brand bg-[#eef7ef] text-[#173120] shadow-[0_10px_24px_rgba(18,35,23,0.06)]"
          : "border-[#d9e2da] bg-white text-[#4a564d] hover:border-brand/40"
      } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
    >
      {children}
    </button>
  );
}

function FileSelectionList({
  files,
  selectedIds,
  disabled,
  onToggle,
}: {
  files: ProjectCompletionArchivedFileOption[];
  selectedIds: string[];
  disabled?: boolean;
  onToggle: (fileId: string) => void;
}) {
  return (
    <div className="space-y-2">
      {files.map((file) => {
        const checked = selectedIds.includes(file.id);

        return (
          <div
            key={file.id}
            className={`flex items-start gap-3 rounded-[16px] border px-3 py-3 ${
              checked ? "border-brand/45 bg-[#f7fbf6]" : "border-[#dde5de] bg-white"
            } ${disabled ? "cursor-not-allowed opacity-70" : "cursor-pointer"}`}
          >
            <input
              type="checkbox"
              checked={checked}
              disabled={disabled}
              onChange={() => onToggle(file.id)}
              className="mt-0.5 h-4 w-4 rounded border-[#cad5cb] text-brand"
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-[12px] font-[700] text-[#111712]">
                  {file.finalArchiveFileName}
                </p>
                <span className="rounded-full bg-[#f4f7f4] px-2 py-0.5 text-[9px] font-[800] uppercase tracking-[0.08em] text-[#566259]">
                  {file.fileTypeLabel}
                </span>
              </div>
              <p className="mt-1 text-[10px] leading-4 text-[#6c756e]">
                {file.fileSizeLabel} · {file.sourceLabel}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <AssetPreviewButton
                fileName={file.finalArchiveFileName}
                mimeType={file.mimeType}
                previewPath={file.previewPath}
                downloadPath={file.downloadPath}
                triggerClassName="size-8 rounded-full text-brand"
              />
              <Button
                asChild
                variant="ghost"
                size="icon"
                className="size-8 rounded-full text-brand"
              >
                <a href={file.downloadPath} target="_blank" rel="noreferrer">
                  <Download className="h-4 w-4" />
                </a>
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function CompletedProjectArchiveSummaryCard({
  completionSummary,
}: CompletedProjectArchiveSummaryCardProps) {
  if (!completionSummary.isCompleted) {
    return null;
  }

  return (
    <Card className="rounded-[20px] border border-[#dbe7dd] bg-[#f7fbf6] shadow-none">
      <CardContent className="px-5 py-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[16px] font-[700] text-[#173120]">
              This project has been completed.
            </p>
            <p className="mt-1 text-[13px] leading-6 text-[#5f6b62]">
              Only final archived files and completion documents can be viewed or downloaded.
            </p>
            {completionSummary.archivedAt ? (
              <p className="mt-1 text-[12px] text-[#6e7a70]">
                Archived on {completionSummary.archivedAt}
                {completionSummary.archiveCategoryLabel
                  ? ` in ${completionSummary.archiveCategoryLabel}.`
                  : "."}
              </p>
            ) : null}
          </div>
          {completionSummary.archiveCategorySlug ? (
            <Button asChild size="sm" className="rounded-full text-[12px]">
              <Link href={`/archives/${completionSummary.archiveCategorySlug}`}>Open Archive</Link>
            </Button>
          ) : null}
        </div>

        {completionSummary.archivedFiles.length > 0 ? (
          <div className="mt-4">
            <p className="text-[12px] font-[700] uppercase tracking-[0.08em] text-[#617062]">
              Final Archived Files
            </p>
            <ArchiveFileList files={completionSummary.archivedFiles} />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function ProjectCompletionChecklist({
  projectId,
  workflow,
}: ProjectCompletionChecklistProps) {
  if (!workflow) {
    return null;
  }

  const workflowKey = JSON.stringify([
    workflow.workflowId,
    workflow.approvalRequired,
    workflow.approvalStatus,
    workflow.approvalContactUserId,
    workflow.approvalSelectedArchivedFileIds,
    workflow.copyrightRequired,
    workflow.copyrightStatus,
    workflow.copyrightContactUserId,
    workflow.invoiceStatus,
    workflow.documents.map((document) => document.id),
  ]);

  return (
    <ProjectCompletionChecklistBody
      key={workflowKey}
      projectId={projectId}
      workflow={workflow}
    />
  );
}

function getInitialApprovalContactUserId(workflow: ProjectCompletionWorkflowRecord) {
  return workflow.approvalContactUserId ?? workflow.availableContacts[0]?.id ?? "";
}

function getInitialApprovalSelectedFileIds(workflow: ProjectCompletionWorkflowRecord) {
  if (workflow.approvalSelectedArchivedFileIds.length > 0) {
    return workflow.approvalSelectedArchivedFileIds;
  }

  if (
    workflow.canManage &&
    workflow.approvalRequired === true &&
    workflow.approvalStatus === "NOT_STARTED"
  ) {
    return workflow.finalArchivedFiles.map((file) => file.id);
  }

  return [];
}

function getInitialCopyrightContactUserId(workflow: ProjectCompletionWorkflowRecord) {
  return workflow.copyrightContactUserId ?? workflow.availableContacts[0]?.id ?? "";
}

function ProjectCompletionChecklistBody({
  projectId,
  workflow,
}: {
  projectId: string;
  workflow: ProjectCompletionWorkflowRecord;
}) {
  const router = useRouter();
  const [workflowState, setWorkflowState] = useState<ProjectCompletionWorkflowRecord>(workflow);
  const [approvalRequired, setApprovalRequired] = useState<boolean>(
    workflow.approvalRequired ?? false,
  );
  const [copyrightRequired, setCopyrightRequired] = useState<boolean>(
    workflow.copyrightRequired ?? false,
  );
  const [approvalContactUserId, setApprovalContactUserId] = useState<string>(
    getInitialApprovalContactUserId(workflow),
  );
  const [approvalSelectedFileIds, setApprovalSelectedFileIds] = useState<string[]>(
    getInitialApprovalSelectedFileIds(workflow),
  );
  const [approvalNote, setApprovalNote] = useState(workflow.approvalNote ?? "");
  const [copyrightContactUserId, setCopyrightContactUserId] = useState<string>(
    getInitialCopyrightContactUserId(workflow),
  );
  const [copyrightNote, setCopyrightNote] = useState(workflow.copyrightNote ?? "");
  const [pendingAction, setPendingAction] = useState<
    "requirements" | "approval" | "copyright" | "invoice" | null
  >(null);
  const [uploadingDocumentType, setUploadingDocumentType] =
    useState<CompletionDocumentTypeValue | null>(null);
  const [workflowError, setWorkflowError] = useState<string | null>(null);
  const [, startRefresh] = useTransition();
  const approvalProofInputRef = useRef<HTMLInputElement | null>(null);
  const copyrightInputRef = useRef<HTMLInputElement | null>(null);
  const invoiceInputRef = useRef<HTMLInputElement | null>(null);

  const approvalStatusMeta = getStepStatusMeta("approval", workflowState);
  const copyrightStatusMeta = getStepStatusMeta("copyright", workflowState);
  const invoiceStatusMeta = getStepStatusMeta("invoice", workflowState);

  function refreshPage() {
    startRefresh(() => {
      router.refresh();
    });
  }

  function applyWorkflowUpdate(nextWorkflow: ProjectCompletionWorkflowRecord) {
    setWorkflowError(null);
    setWorkflowState(nextWorkflow);
    setApprovalRequired(nextWorkflow.approvalRequired ?? false);
    setCopyrightRequired(nextWorkflow.copyrightRequired ?? false);
    setApprovalContactUserId(getInitialApprovalContactUserId(nextWorkflow));
    setApprovalSelectedFileIds(getInitialApprovalSelectedFileIds(nextWorkflow));
    setApprovalNote(nextWorkflow.approvalNote ?? "");
    setCopyrightContactUserId(getInitialCopyrightContactUserId(nextWorkflow));
    setCopyrightNote(nextWorkflow.copyrightNote ?? "");
    refreshPage();
  }

  function toggleApprovalSelectedFile(fileId: string) {
    setApprovalSelectedFileIds((current) =>
      current.includes(fileId)
        ? current.filter((candidate) => candidate !== fileId)
        : [...current, fileId],
    );
  }

  async function handleSaveRequirements() {
    setWorkflowError(null);
    setPendingAction("requirements");

    try {
      const result = await configureProjectCompletionWorkflowAction({
        projectId,
        approvalRequired,
        copyrightRequired,
      });

      if ("error" in result) {
        throw new Error(result.error);
      }

      applyWorkflowUpdate(result.workflow);
      showSuccessToast("Project completion checklist updated.");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to update the project completion checklist right now.";
      setWorkflowError(message);
      showErrorToast("Unable to update the checklist.", message);
    } finally {
      setPendingAction(null);
    }
  }

  async function handlePrepareApprovalRequest() {
    if (!approvalContactUserId) {
      const message = "Select an approval contact before preparing the request.";
      setWorkflowError(message);
      showErrorToast("Approval contact required.", message);
      return;
    }

    if (approvalSelectedFileIds.length === 0) {
      const message = "Select at least one final archived file for authority approval.";
      setWorkflowError(message);
      showErrorToast("Approval files required.", message);
      return;
    }

    setWorkflowError(null);
    setPendingAction("approval");

    try {
      const result = await prepareAuthorityApprovalRequestAction({
        projectId,
        contactUserId: approvalContactUserId,
        selectedArchivedFileIds: approvalSelectedFileIds,
        note: approvalNote,
      });

      if ("error" in result) {
        throw new Error(result.error);
      }

      applyWorkflowUpdate(result.workflow);
      showSuccessToast("Approval request prepared.");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to prepare the authority approval request right now.";
      setWorkflowError(message);
      showErrorToast("Unable to prepare approval request.", message);
    } finally {
      setPendingAction(null);
    }
  }

  async function handlePrepareCopyrightTransfer() {
    if (!copyrightContactUserId) {
      const message = "Select a copyright contact before preparing the request.";
      setWorkflowError(message);
      showErrorToast("Copyright contact required.", message);
      return;
    }

    setWorkflowError(null);
    setPendingAction("copyright");

    try {
      const result = await prepareCopyrightTransferRequestAction({
        projectId,
        contactUserId: copyrightContactUserId,
        note: copyrightNote,
      });

      if ("error" in result) {
        throw new Error(result.error);
      }

      applyWorkflowUpdate(result.workflow);
      showSuccessToast("Copyright transfer request prepared.");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to prepare the copyright transfer request right now.";
      setWorkflowError(message);
      showErrorToast("Unable to prepare copyright transfer.", message);
    } finally {
      setPendingAction(null);
    }
  }

  async function handleMarkInvoiceNotRequired() {
    setWorkflowError(null);
    setPendingAction("invoice");

    try {
      const result = await markProjectInvoiceNotRequiredAction({
        projectId,
      });

      if ("error" in result) {
        throw new Error(result.error);
      }

      applyWorkflowUpdate(result.workflow);
      showSuccessToast("Final invoice marked as not required.");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to mark final invoice as not required right now.";
      setWorkflowError(message);
      showErrorToast("Unable to update final invoice step.", message);
    } finally {
      setPendingAction(null);
    }
  }

  async function handleDocumentUpload(
    documentType: CompletionDocumentTypeValue,
    files: FileList | null,
  ) {
    const file = files?.[0];

    if (!file) {
      return;
    }

    setWorkflowError(null);
    setUploadingDocumentType(documentType);

    try {
      await uploadCompletionDocument({
        file,
        projectId,
        documentType,
      });

      refreshPage();

      const label =
        documentType === COMPLETION_DOCUMENT_TYPES.approval
          ? "Authority approval completed."
          : documentType === COMPLETION_DOCUMENT_TYPES.copyright
            ? "Copyright transfer completed."
            : "Final invoice uploaded.";

      showSuccessToast(label);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to upload the completion document right now.";
      setWorkflowError(message);
      showErrorToast("Unable to upload completion document.", message);
    } finally {
      setUploadingDocumentType(null);

      if (approvalProofInputRef.current) {
        approvalProofInputRef.current.value = "";
      }

      if (copyrightInputRef.current) {
        copyrightInputRef.current.value = "";
      }

      if (invoiceInputRef.current) {
        invoiceInputRef.current.value = "";
      }
    }
  }

  return (
    <Card className="rounded-[20px] border border-[#dbe7dd] bg-white shadow-none">
      <input
        ref={approvalProofInputRef}
        type="file"
        accept={completionDocumentAccept}
        className="sr-only"
        onChange={(event) => {
          void handleDocumentUpload(COMPLETION_DOCUMENT_TYPES.approval, event.target.files);
        }}
      />
      <input
        ref={copyrightInputRef}
        type="file"
        accept={completionDocumentAccept}
        className="sr-only"
        onChange={(event) => {
          void handleDocumentUpload(COMPLETION_DOCUMENT_TYPES.copyright, event.target.files);
        }}
      />
      <input
        ref={invoiceInputRef}
        type="file"
        accept={completionDocumentAccept}
        className="sr-only"
        onChange={(event) => {
          void handleDocumentUpload(COMPLETION_DOCUMENT_TYPES.invoice, event.target.files);
        }}
      />

      <CardHeader className="space-y-3 pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-[22px] text-[#173120]">Project Completion</CardTitle>
            <p className="mt-1 text-[13px] leading-6 text-[#5f6b62]">
              Before closing the project fully, confirm whether this project requires
              authority approval, copyright transfer, and final invoicing. Stage invoices
              are handled on each stage.
            </p>
          </div>
          <div className="rounded-full bg-[#f7fbf6] px-3 py-1.5 text-[11px] font-[700] uppercase tracking-[0.08em] text-[#5f6b62]">
            Owner-Controlled
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {[
            { title: "Authority Approval", meta: approvalStatusMeta },
            { title: "Copyright Transfer", meta: copyrightStatusMeta },
            { title: "Final Invoice", meta: invoiceStatusMeta },
          ].map((item) => (
            <div
              key={item.title}
              className="rounded-[18px] border border-[#dce6dd] bg-[#fbfcfa] px-4 py-3"
            >
              <p className="text-[13px] font-[700] text-[#173120]">{item.title}</p>
              <span
                className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-[10px] font-[800] uppercase tracking-[0.08em] ${item.meta.className}`}
              >
                {item.meta.label}
              </span>
            </div>
          ))}
        </div>
      </CardHeader>

      <CardContent className="space-y-5 pt-0">
        {workflowError ? (
          <div className="rounded-[18px] border border-[#f0c9c7] bg-[#fff2f1] px-4 py-3 text-[13px] text-[#bb4d49]">
            {workflowError}
          </div>
        ) : null}

        {workflowState.needsInitialConfiguration ? (
          <div className="rounded-[20px] border border-[#dbe7dd] bg-[#f7fbf6] p-4">
            <p className="text-[16px] font-[700] text-[#173120]">
              Project completion checklist
            </p>
            <p className="mt-1 text-[13px] leading-6 text-[#5f6b62]">
              Before closing the project fully, confirm whether this project requires
              authority approval, copyright transfer, and a final invoice.
            </p>

            {workflowState.canManage ? (
              <div className="mt-4 space-y-4">
                <div>
                  <p className="text-[12px] font-[700] uppercase tracking-[0.08em] text-[#617062]">
                    Does this project require authority/client approval?
                  </p>
                  <div className="mt-2 grid gap-2 md:grid-cols-2">
                    <ChoiceButton
                      active={approvalRequired}
                      disabled={pendingAction === "requirements"}
                      onClick={() => setApprovalRequired(true)}
                    >
                      Yes, send for approval
                    </ChoiceButton>
                    <ChoiceButton
                      active={!approvalRequired}
                      disabled={pendingAction === "requirements"}
                      onClick={() => setApprovalRequired(false)}
                    >
                      No, approval not required
                    </ChoiceButton>
                  </div>
                </div>

                <div>
                  <p className="text-[12px] font-[700] uppercase tracking-[0.08em] text-[#617062]">
                    Does this project require copyright transfer?
                  </p>
                  <div className="mt-2 grid gap-2 md:grid-cols-2">
                    <ChoiceButton
                      active={copyrightRequired}
                      disabled={pendingAction === "requirements"}
                      onClick={() => setCopyrightRequired(true)}
                    >
                      Copyright transfer required
                    </ChoiceButton>
                    <ChoiceButton
                      active={!copyrightRequired}
                      disabled={pendingAction === "requirements"}
                      onClick={() => setCopyrightRequired(false)}
                    >
                      No copyright transfer required
                    </ChoiceButton>
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button
                    type="button"
                    className="rounded-full text-[12px]"
                    disabled={pendingAction === "requirements"}
                    onClick={() => {
                      void handleSaveRequirements();
                    }}
                  >
                    {pendingAction === "requirements" ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : null}
                    Save Checklist Requirements
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-[16px] border border-[#dce6dd] bg-white px-4 py-4 text-[13px] text-[#5f6b62]">
                The project owner needs to confirm the completion checklist requirements
                before the remaining steps can continue.
              </div>
            )}
          </div>
        ) : null}

        <div className="rounded-[20px] border border-[#dce6dd] bg-[#fbfcfa] p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-[16px] font-[700] text-[#173120]">Authority Approval</p>
              <p className="mt-1 text-[13px] leading-6 text-[#5f6b62]">
                Approval request prepared. Email/notification sending will be connected
                later.
              </p>
            </div>
            <span
              className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-[800] uppercase tracking-[0.08em] ${approvalStatusMeta.className}`}
            >
              {approvalStatusMeta.label}
            </span>
          </div>

          {workflowState.approvalRequired === false ? (
            <p className="mt-4 text-[13px] text-[#5f6b62]">
              Authority approval is marked as not required for this project.
            </p>
          ) : workflowState.approvalRequired === true &&
            workflowState.approvalStatus === "NOT_STARTED" ? (
            workflowState.canManage ? (
              <div className="mt-4 space-y-4">
                <div>
                  <p className="text-[12px] font-[700] uppercase tracking-[0.08em] text-[#617062]">
                    Approval Contact
                  </p>
                  <Select
                    value={approvalContactUserId}
                    onValueChange={setApprovalContactUserId}
                  >
                    <SelectTrigger className="mt-2 h-[42px] rounded-[14px] border-[#d6e1d7]">
                      <SelectValue placeholder="Choose contact" />
                    </SelectTrigger>
                    <SelectContent>
                      {workflowState.availableContacts.map((contact) => (
                        <SelectItem key={contact.id} value={contact.id}>
                          {contact.name} · {contact.roleLabel}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="mt-2 text-[11px] text-[#728074]">
                    Need another approval contact? Add them to the project collaborators
                    first, then return here.
                  </p>
                </div>

                <div>
                  <p className="text-[12px] font-[700] uppercase tracking-[0.08em] text-[#617062]">
                    Final Files For Approval
                  </p>
                  <div className="mt-2">
                    <FileSelectionList
                      files={workflowState.finalArchivedFiles}
                      selectedIds={approvalSelectedFileIds}
                      disabled={pendingAction === "approval"}
                      onToggle={toggleApprovalSelectedFile}
                    />
                  </div>
                </div>

                <div>
                  <p className="text-[12px] font-[700] uppercase tracking-[0.08em] text-[#617062]">
                    Optional Note
                  </p>
                  <Textarea
                    value={approvalNote}
                    onChange={(event) => setApprovalNote(event.target.value)}
                    placeholder="Add any approval note or message."
                    className="mt-2 min-h-[110px] rounded-[16px] border-[#d6e1d7]"
                  />
                </div>

                <div className="flex justify-end">
                  <Button
                    type="button"
                    className="rounded-full text-[12px]"
                    disabled={pendingAction === "approval"}
                    onClick={() => {
                      void handlePrepareApprovalRequest();
                    }}
                  >
                    {pendingAction === "approval" ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : null}
                    Mark Approval Request Prepared
                  </Button>
                </div>
              </div>
            ) : (
              <p className="mt-4 text-[13px] text-[#5f6b62]">
                The project owner needs to prepare the authority approval request.
              </p>
            )
          ) : workflowState.approvalStatus === "PENDING" ? (
            <div className="mt-4 space-y-4">
              <div className="rounded-[16px] border border-[#dce6dd] bg-white px-4 py-4">
                <p className="text-[13px] font-[700] text-[#173120]">
                  Pending Approval
                </p>
                <p className="mt-1 text-[12px] leading-6 text-[#5f6b62]">
                  Approval request prepared
                  {workflowState.approvalRequestedAt
                    ? ` on ${workflowState.approvalRequestedAt}.`
                    : "."}
                </p>
                {workflowState.approvalContactName ? (
                  <p className="mt-1 text-[12px] text-[#5f6b62]">
                    Contact: {workflowState.approvalContactName}
                  </p>
                ) : null}
                {workflowState.approvalNote ? (
                  <p className="mt-2 text-[12px] text-[#5f6b62]">
                    Note: {workflowState.approvalNote}
                  </p>
                ) : null}
              </div>

              {workflowState.approvalSelectedFiles.length > 0 ? (
                <div>
                  <p className="text-[12px] font-[700] uppercase tracking-[0.08em] text-[#617062]">
                    Selected Final Files
                  </p>
                  <ArchiveFileList files={workflowState.approvalSelectedFiles} />
                </div>
              ) : null}

              {workflowState.canManage ? (
                <div className="flex justify-end">
                  <Button
                    type="button"
                    className="rounded-full text-[12px]"
                    disabled={uploadingDocumentType === COMPLETION_DOCUMENT_TYPES.approval}
                    onClick={() => approvalProofInputRef.current?.click()}
                  >
                    {uploadingDocumentType === COMPLETION_DOCUMENT_TYPES.approval ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Upload className="h-3.5 w-3.5" />
                    )}
                    Upload Approval Proof
                  </Button>
                </div>
              ) : null}
            </div>
          ) : workflowState.approvalStatus === "COMPLETED" &&
            workflowState.approvalProofDocument ? (
            <div className="mt-4 space-y-3">
              <p className="text-[13px] text-[#2b8b56]">
                Authority Approval Completed
                {workflowState.approvalCompletedAt
                  ? ` on ${workflowState.approvalCompletedAt}.`
                  : "."}
              </p>
              <CompletionDocumentList documents={[workflowState.approvalProofDocument]} />
            </div>
          ) : (
            <p className="mt-4 text-[13px] text-[#5f6b62]">
              Configure whether authority approval is required to continue.
            </p>
          )}
        </div>

        <div className="rounded-[20px] border border-[#dce6dd] bg-[#fbfcfa] p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-[16px] font-[700] text-[#173120]">Copyright Transfer</p>
              <p className="mt-1 text-[13px] leading-6 text-[#5f6b62]">
                Signed copyright documents can be uploaded here once they are received
                back.
              </p>
            </div>
            <span
              className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-[800] uppercase tracking-[0.08em] ${copyrightStatusMeta.className}`}
            >
              {copyrightStatusMeta.label}
            </span>
          </div>

          {!workflowState.isCopyrightUnlocked ? (
            <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-3 py-2 text-[12px] text-[#5f6b62]">
              <Lock className="h-3.5 w-3.5" />
              Complete or skip authority approval before continuing.
            </div>
          ) : workflowState.copyrightRequired === false ? (
            <p className="mt-4 text-[13px] text-[#5f6b62]">
              Copyright transfer is marked as not required for this project.
            </p>
          ) : workflowState.copyrightRequired === true &&
            workflowState.copyrightStatus === "NOT_STARTED" ? (
            workflowState.canManage ? (
              <div className="mt-4 space-y-4">
                <div>
                  <p className="text-[12px] font-[700] uppercase tracking-[0.08em] text-[#617062]">
                    Copyright Contact
                  </p>
                  <Select
                    value={copyrightContactUserId}
                    onValueChange={setCopyrightContactUserId}
                  >
                    <SelectTrigger className="mt-2 h-[42px] rounded-[14px] border-[#d6e1d7]">
                      <SelectValue placeholder="Choose contact" />
                    </SelectTrigger>
                    <SelectContent>
                      {workflowState.availableContacts.map((contact) => (
                        <SelectItem key={contact.id} value={contact.id}>
                          {contact.name} · {contact.roleLabel}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <p className="text-[12px] font-[700] uppercase tracking-[0.08em] text-[#617062]">
                    Optional Note
                  </p>
                  <Textarea
                    value={copyrightNote}
                    onChange={(event) => setCopyrightNote(event.target.value)}
                    placeholder="Add any copyright transfer note."
                    className="mt-2 min-h-[110px] rounded-[16px] border-[#d6e1d7]"
                  />
                </div>

                <div className="flex justify-end">
                  <Button
                    type="button"
                    className="rounded-full text-[12px]"
                    disabled={pendingAction === "copyright"}
                    onClick={() => {
                      void handlePrepareCopyrightTransfer();
                    }}
                  >
                    {pendingAction === "copyright" ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : null}
                    Mark Copyright Request Prepared
                  </Button>
                </div>
              </div>
            ) : (
              <p className="mt-4 text-[13px] text-[#5f6b62]">
                The project owner needs to prepare the copyright transfer request.
              </p>
            )
          ) : workflowState.copyrightStatus === "PENDING" ? (
            <div className="mt-4 space-y-4">
              <div className="rounded-[16px] border border-[#dce6dd] bg-white px-4 py-4">
                <p className="text-[13px] font-[700] text-[#173120]">
                  Pending Signature
                </p>
                <p className="mt-1 text-[12px] leading-6 text-[#5f6b62]">
                  Copyright transfer request prepared
                  {workflowState.copyrightRequestedAt
                    ? ` on ${workflowState.copyrightRequestedAt}.`
                    : "."}
                </p>
                {workflowState.copyrightContactName ? (
                  <p className="mt-1 text-[12px] text-[#5f6b62]">
                    Contact: {workflowState.copyrightContactName}
                  </p>
                ) : null}
                {workflowState.copyrightNote ? (
                  <p className="mt-2 text-[12px] text-[#5f6b62]">
                    Note: {workflowState.copyrightNote}
                  </p>
                ) : null}
              </div>

              {workflowState.canManage ? (
                <div className="flex justify-end">
                  <Button
                    type="button"
                    className="rounded-full text-[12px]"
                    disabled={uploadingDocumentType === COMPLETION_DOCUMENT_TYPES.copyright}
                    onClick={() => copyrightInputRef.current?.click()}
                  >
                    {uploadingDocumentType === COMPLETION_DOCUMENT_TYPES.copyright ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Upload className="h-3.5 w-3.5" />
                    )}
                    Upload Signed Copyright Document
                  </Button>
                </div>
              ) : null}
            </div>
          ) : workflowState.copyrightStatus === "COMPLETED" &&
            workflowState.copyrightTransferDocument ? (
            <div className="mt-4 space-y-3">
              <p className="text-[13px] text-[#2b8b56]">
                Copyright Transfer Completed
                {workflowState.copyrightCompletedAt
                  ? ` on ${workflowState.copyrightCompletedAt}.`
                  : "."}
              </p>
              <CompletionDocumentList documents={[workflowState.copyrightTransferDocument]} />
            </div>
          ) : (
            <p className="mt-4 text-[13px] text-[#5f6b62]">
              Configure whether copyright transfer is required to continue.
            </p>
          )}
        </div>

        <div className="rounded-[20px] border border-[#dce6dd] bg-[#fbfcfa] p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-[16px] font-[700] text-[#173120]">Final Invoice</p>
              <p className="mt-1 text-[13px] leading-6 text-[#5f6b62]">
                Stage invoices are handled per stage. This final invoice belongs to
                the project completion package and unlocks after authority approval
                and copyright transfer are completed or marked not required.
              </p>
            </div>
            <span
              className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-[800] uppercase tracking-[0.08em] ${invoiceStatusMeta.className}`}
            >
              {invoiceStatusMeta.label}
            </span>
          </div>

          {!workflowState.isInvoiceUnlocked ? (
            <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-3 py-2 text-[12px] text-[#5f6b62]">
              <Lock className="h-3.5 w-3.5" />
              Final invoice is locked until the previous steps are completed or skipped.
            </div>
          ) : workflowState.invoiceStatus === "NOT_REQUIRED" ? (
            <p className="mt-4 text-[13px] text-[#5f6b62]">
              Final invoice is marked as not required for this project.
            </p>
          ) : workflowState.invoiceDocument ? (
            <div className="mt-4 space-y-3">
              <p className="text-[13px] text-[#2b8b56]">
                Final Invoice Completed
                {workflowState.invoiceCompletedAt
                  ? ` on ${workflowState.invoiceCompletedAt}.`
                  : "."}
              </p>
              <CompletionDocumentList documents={[workflowState.invoiceDocument]} />
            </div>
          ) : workflowState.canUploadInvoice || workflowState.canManage ? (
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:justify-end">
              {workflowState.canManage ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="rounded-full text-[12px]"
                  disabled={
                    pendingAction === "invoice" ||
                    uploadingDocumentType === COMPLETION_DOCUMENT_TYPES.invoice
                  }
                  onClick={handleMarkInvoiceNotRequired}
                >
                  {pendingAction === "invoice" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : null}
                  Mark Final Invoice Not Required
                </Button>
              ) : null}
              {workflowState.canUploadInvoice ? (
                <Button
                  type="button"
                  className="rounded-full text-[12px]"
                  disabled={
                    pendingAction === "invoice" ||
                    uploadingDocumentType === COMPLETION_DOCUMENT_TYPES.invoice
                  }
                  onClick={() => invoiceInputRef.current?.click()}
                >
                  {uploadingDocumentType === COMPLETION_DOCUMENT_TYPES.invoice ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Upload className="h-3.5 w-3.5" />
                  )}
                  Upload Final Invoice
                </Button>
              ) : null}
            </div>
          ) : (
            <p className="mt-4 text-[13px] text-[#5f6b62]">
              The project owner or executor can upload the final invoice once this step is
              unlocked.
            </p>
          )}
        </div>

        {workflowState.documents.length > 0 ? (
          <div className="rounded-[20px] border border-[#dce6dd] bg-[#fbfcfa] p-4">
            <p className="text-[16px] font-[700] text-[#173120]">Completion Documents</p>
            <p className="mt-1 text-[13px] leading-6 text-[#5f6b62]">
              These completion files are also available in the Documents archive category.
            </p>
            <div className="mt-4">
              <CompletionDocumentList documents={workflowState.documents} />
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
