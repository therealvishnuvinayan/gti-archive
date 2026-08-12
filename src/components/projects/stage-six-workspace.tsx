"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  ProductionApprovalRecipientType,
  ProductionApprovalStepStatus,
  ProductionDispatchStatus,
  ProductionHandoverRoute,
  ProjectProductionUnitStatus,
} from "@prisma/client";
import {
  AlertTriangle,
  Archive,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Check,
  Clock3,
  Download,
  Eye,
  FileCheck2,
  FileImage,
  FileText,
  ListChecks,
  Loader2,
  PackageCheck,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from "lucide-react";

import {
  addProductionApproverAction,
  addProductionUnitFileAction,
  completeStageSixAction,
  configureMarketingDirectorAction,
  handoverProductionUnitAction,
  removeProductionApproverAction,
  removeProductionUnitFileAction,
  reorderProductionApproverAction,
  prepareStageSixArchiveAction,
  retryProductionApprovalDispatchAction,
  saveStageSixArchiveAction,
} from "@/app/(dashboard)/projects/[slug]/stages/6/actions";
import {
  ArchiveMetadataIdentificationStep,
  ArchiveMetadataReviewList,
  ArchiveMetadataTechnicalStep,
} from "@/components/archives/archive-artwork-metadata-form";
import { AssetPreviewButton } from "@/components/projects/asset-preview-button";
import { ProjectAccessRealtimeGuard } from "@/components/projects/project-access-realtime-guard";
import { ProjectStageSummary } from "@/components/projects/project-stage-summary";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { getArchiveFileNameValidationError } from "@/lib/archive-file-name";
import type { ProjectStageShellRecord } from "@/lib/projects";
import type { StageSixArchivePreparation } from "@/lib/archives";
import {
  archiveProjectWizardSteps,
  getArchiveArtworkMetadataMissingCount,
  getArchiveArtworkMetadataMissingGroups,
  type ArchiveArtworkMetadataDraft,
} from "@/lib/archive-artwork-metadata";
import {
  STAGE_FIVE_FIELD_DEFINITIONS,
} from "@/lib/stage-five-fields";
import type {
  ProductionFileRecord,
  StageSixUnitRecord,
  StageSixWorkspaceData,
} from "@/lib/stage-six";
import { STAGE_SIX_FIRST_APPROVER } from "@/lib/stage-six-constants";
import { uploadProductionFile } from "@/lib/stage-six-upload-client";
import { showErrorToast, showSuccessToast } from "@/lib/toast";
import { cn } from "@/lib/utils";

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function valueText(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "Not provided";
  const record = value as { text?: unknown; values?: unknown; included?: unknown };
  const parts = [
    typeof record.text === "string" ? record.text : "",
    Array.isArray(record.values)
      ? record.values.filter((item): item is string => typeof item === "string").join(", ")
      : "",
    record.included === true ? "Included" : "",
  ].filter(Boolean);
  return parts.join(" · ") || "Not provided";
}

function statusLabel(status: ProjectProductionUnitStatus) {
  switch (status) {
    case ProjectProductionUnitStatus.PREPARATION:
      return "Preparation";
    case ProjectProductionUnitStatus.APPROVAL_PENDING:
      return "Pending Approval";
    case ProjectProductionUnitStatus.REJECTED:
      return "Rejected";
    case ProjectProductionUnitStatus.HANDOVER_READY:
      return "Approved";
    case ProjectProductionUnitStatus.HANDED_OVER:
      return "Handed Over";
  }
}

function unitStatusClass(status: ProjectProductionUnitStatus) {
  if (status === ProjectProductionUnitStatus.REJECTED) return "bg-[#fde9e6] text-[#a54b43]";
  if (
    status === ProjectProductionUnitStatus.HANDOVER_READY ||
    status === ProjectProductionUnitStatus.HANDED_OVER
  ) {
    return "bg-[#e4f2e7] text-[#2e744e]";
  }
  return "bg-[#fff3df] text-[#94651f]";
}

function FileIcon({ file }: { file: ProductionFileRecord }) {
  return file.mimeType.startsWith("image/") ? (
    <FileImage className="h-5 w-5" />
  ) : (
    <FileText className="h-5 w-5" />
  );
}

function FileActions({ file, pathPrefix = "/api/project-assets" }: { file: ProductionFileRecord; pathPrefix?: string }) {
  return (
    <div className="flex gap-2">
      <Button asChild type="button" variant="secondary" size="sm" className="rounded-[10px] shadow-none">
        <a href={`${pathPrefix}/${file.id}/preview`} target="_blank" rel="noreferrer">
          <Eye className="h-3.5 w-3.5" /> Preview
        </a>
      </Button>
      <Button asChild type="button" variant="secondary" size="sm" className="rounded-[10px] shadow-none">
        <a href={`${pathPrefix}/${file.id}/download`}>
          <Download className="h-3.5 w-3.5" /> Download
        </a>
      </Button>
    </div>
  );
}

function UnitSwitcher({
  units,
  activeUnitId,
  onSelect,
}: {
  units: StageSixUnitRecord[];
  activeUnitId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <section aria-label="Production Units" className="overflow-x-auto pb-2">
      <div className="flex min-w-max gap-3 lg:min-w-0 lg:flex-wrap">
        {units.map((unit) => (
          <button
            key={unit.id}
            type="button"
            aria-pressed={unit.id === activeUnitId}
            onClick={() => onSelect(unit.id)}
            className={cn(
              "flex w-[230px] items-center gap-3 rounded-[16px] border bg-white p-3 text-left transition",
              unit.id === activeUnitId
                ? "border-[#72a184] shadow-[0_10px_26px_rgba(35,93,59,.12)] ring-2 ring-[#dfeee4]"
                : "border-[#dfe6df] hover:border-[#b9cbbd]",
            )}
          >
            <span className="grid size-11 shrink-0 place-items-center rounded-[12px] bg-[#edf5ef] text-[#347455]">
              <FileIcon file={unit.sourceFile} />
            </span>
            <span className="min-w-0">
              <strong className="block truncate text-[12px] font-[720] text-[#27322b]">{unit.name}</strong>
              <span className={cn("mt-1 inline-flex rounded-full px-2 py-0.5 text-[9px] font-[740]", unitStatusClass(unit.status))}>
                {statusLabel(unit.status)}
              </span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function StageSummary({ data }: { data: StageSixWorkspaceData }) {
  const items = [
    ["Production Units", data.summary.total],
    ["Approved", data.summary.approved],
    ["Pending Approval", data.summary.pending],
    ["Rejected", data.summary.rejected],
    ["Handed Over", data.summary.handedOver],
  ] as const;
  return (
    <div className="mt-5 flex flex-wrap gap-2" aria-label="Stage 6 status summary">
      {items.map(([label, value]) => (
        <span key={label} className="rounded-full border border-[#dfe6df] bg-[#f8faf8] px-3 py-1.5 text-[10px] text-[#68746c]">
          <strong className="mr-1 font-[780] text-[#26312a]">{value}</strong> {label}
        </span>
      ))}
    </div>
  );
}

function FilesSection({
  projectId,
  unit,
  canManage,
  onRefresh,
}: {
  projectId: string;
  unit: StageSixUnitRecord;
  canManage: boolean;
  onRefresh: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [productionFiles, setProductionFiles] = useState(unit.productionFiles);
  const [removingFileId, setRemovingFileId] = useState<string | null>(null);
  const mutable =
    unit.status === ProjectProductionUnitStatus.PREPARATION ||
    unit.status === ProjectProductionUnitStatus.REJECTED;

  async function upload(files: FileList | null) {
    const file = files?.[0];
    if (!file || uploading) return;
    setUploading(true);
    try {
      const uploaded = await uploadProductionFile(projectId, file);
      const associated = await addProductionUnitFileAction({
        projectId,
        productionUnitId: unit.id,
        attachmentId: uploaded.id,
      });
      if ("error" in associated) throw new Error(associated.error);
      setProductionFiles((current) => [
        ...current.filter((item) => item.id !== uploaded.id),
        { ...uploaded, isSource: false },
      ]);
      showSuccessToast("Production file added.");
      onRefresh();
    } catch (error) {
      showErrorToast("Unable to add production file.", error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function removeFile(file: ProductionFileRecord) {
    if (removingFileId) return;
    setRemovingFileId(file.id);
    try {
      const result = await removeProductionUnitFileAction({
        projectId,
        productionUnitId: unit.id,
        attachmentId: file.id,
      });
      if ("error" in result) return showErrorToast("Unable to remove file.", result.error);
      setProductionFiles((current) => current.filter((item) => item.id !== file.id));
      showSuccessToast("Production file removed from this unit.");
      onRefresh();
    } finally {
      setRemovingFileId(null);
    }
  }

  return (
    <section className="rounded-[20px] border border-[#dfe6df] bg-white p-5 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-[17px] font-[750] text-[#1c271f]">Production Files</h2>
          <p className="mt-1 text-[11px] text-[#727d75]">The Stage 5 source remains referenced; add production-specific files as needed.</p>
        </div>
        {canManage && mutable ? (
          <>
            <input ref={inputRef} type="file" className="hidden" onChange={(event) => upload(event.target.files)} />
            <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => inputRef.current?.click()}>
              <Upload className="h-4 w-4" /> {uploading ? "Uploading..." : "Add Production File"}
            </Button>
          </>
        ) : null}
      </div>
      <div className="mt-4 space-y-3">
        {[unit.sourceFile, ...productionFiles].map((file) => (
          <div key={file.id} className="flex flex-col gap-3 rounded-[14px] border border-[#e2e8e2] bg-[#fbfcfb] p-4 sm:flex-row sm:items-center">
            <span className="grid size-10 shrink-0 place-items-center rounded-[11px] bg-[#edf5ef] text-[#347455]"><FileIcon file={file} /></span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-[720] text-[#27322b]">{file.name}</p>
              <p className="mt-1 text-[10px] text-[#77827a]">{file.isSource ? "Stage 5 source" : "Production file"} · {formatFileSize(file.size)}</p>
            </div>
            <FileActions file={file} />
            {canManage && mutable && !file.isSource ? (
              <Button type="button" variant="ghost" size="icon" disabled={removingFileId === file.id} aria-label={`Remove ${file.name}`} onClick={() => removeFile(file)}>
                <Trash2 className="h-4 w-4 text-[#aa4e45]" />
              </Button>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function ProductionDetails({ unit }: { unit: StageSixUnitRecord }) {
  return (
    <section className="rounded-[20px] border border-[#dfe6df] bg-white p-5 sm:p-6">
      <h2 className="text-[17px] font-[750] text-[#1c271f]">Production Details</h2>
      <p className="mt-1 text-[11px] text-[#727d75]">Live Stage 5 checklist information for this Production Unit.</p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {unit.checklist.map((field) => (
          <article key={field.key} className="flex min-w-0 flex-col overflow-hidden rounded-[14px] border border-[#e3e9e3] bg-[#fbfcfb] px-4 py-3">
            <h3 className="text-[10px] font-[760] uppercase tracking-[.07em] text-[#708078]">{field.label}</h3>
            <p className={cn("mt-2 min-h-5 whitespace-pre-wrap [overflow-wrap:anywhere] text-[12px] leading-5", valueText(field.value) === "Not provided" ? "italic text-[#89938c]" : "text-[#344038]")}>{valueText(field.value)}</p>
            {field.attachments.length ? (
              <div className="mt-2 grid min-w-0 gap-2">
                {field.attachments.map((file) => (
                  <a
                    key={file.id}
                    href={`/api/project-assets/${file.id}/download`}
                    title={file.name}
                    className="block w-fit min-w-0 max-w-full overflow-hidden rounded-full bg-[#eaf4ed] px-2.5 py-1 text-[9px] font-[680] text-[#2e744e]"
                  >
                    <span className="block min-w-0 max-w-full truncate">{file.name}</span>
                  </a>
                ))}
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

type ApproverDialogMode = "marketing-director" | "additional";

function ApproverDialog({
  mode,
  projectId,
  unit,
  participants,
  onClose,
  onSaved,
}: {
  mode: ApproverDialogMode;
  projectId: string;
  unit: StageSixUnitRecord;
  participants: StageSixWorkspaceData["participants"];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [pending, startPending] = useTransition();
  const requestId = useRef(crypto.randomUUID());
  const fixedFirstApprover = mode === "marketing-director";
  const [recipientType, setRecipientType] = useState<ProductionApprovalRecipientType>(
    fixedFirstApprover
      ? ProductionApprovalRecipientType.EXTERNAL_EMAIL
      : ProductionApprovalRecipientType.EXISTING_COLLABORATOR,
  );
  const [recipientUserId, setRecipientUserId] = useState("");
  const [recipientName, setRecipientName] = useState(
    fixedFirstApprover ? STAGE_SIX_FIRST_APPROVER.name : "",
  );
  const [recipientEmail, setRecipientEmail] = useState(
    fixedFirstApprover ? STAGE_SIX_FIRST_APPROVER.email : "",
  );
  const [fieldKeys, setFieldKeys] = useState<string[]>([]);
  const availableFiles = [unit.sourceFile, ...unit.productionFiles];
  const [fileIds, setFileIds] = useState<string[]>(availableFiles.map((file) => file.id));
  const [message, setMessage] = useState("");
  const allSelected = fieldKeys.length === STAGE_FIVE_FIELD_DEFINITIONS.length && fileIds.length === availableFiles.length;
  const recipientReady = recipientType === ProductionApprovalRecipientType.EXISTING_COLLABORATOR
    ? Boolean(recipientUserId)
    : /^\S+@\S+\.\S+$/.test(recipientEmail.trim());
  const canSubmit =
    recipientReady &&
    (fieldKeys.length > 0 || fileIds.length > 0) &&
    (mode !== "marketing-director" || fileIds.length > 0);

  function toggle(list: string[], value: string, setter: (value: string[]) => void) {
    setter(list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
  }

  function save() {
    if (!canSubmit || pending) return;
    startPending(async () => {
      const payload = {
        clientRequestId: requestId.current,
        projectId,
        productionUnitId: unit.id,
        recipientType,
        ...(recipientType === ProductionApprovalRecipientType.EXISTING_COLLABORATOR
          ? { recipientUserId }
          : { recipientName, recipientEmail }),
        sharedFieldKeys: fieldKeys as never[],
        selectedFileIds: fileIds,
        message,
      };
      const result = mode === "marketing-director"
        ? await configureMarketingDirectorAction(payload)
        : await addProductionApproverAction(payload);
      if ("error" in result) {
        showErrorToast("Unable to save approver.", result.error);
        return;
      }
      showSuccessToast(mode === "marketing-director" ? "Marketing Director approval requested." : "Approver added to the waiting chain.");
      onSaved();
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-[170] flex items-center justify-center overflow-hidden bg-[#112118]/45 p-3 backdrop-blur-[2px] sm:p-5" role="dialog" aria-modal="true" aria-labelledby="add-approver-title">
      <Card className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-[720px] flex-col overflow-hidden rounded-[24px] border-[#dfe6df] shadow-[0_32px_80px_rgba(14,31,20,.22)] sm:max-h-[calc(100dvh-2.5rem)]">
        <CardContent className="flex min-h-0 flex-1 flex-col p-0">
          <div className="flex shrink-0 items-start justify-between gap-4 border-b border-[#e7ece8] px-5 py-4 sm:px-6 sm:py-5">
            <div>
              <p className="text-[10px] font-[760] uppercase tracking-[.12em] text-[#4c795e]">Approval Chain</p>
              <h2 id="add-approver-title" className="mt-1.5 text-[20px] font-[760] text-[#162019] sm:text-[22px]">{mode === "marketing-director" ? "Assign Marketing Director" : "Add Approver"}</h2>
              {mode === "marketing-director" ? <p className="mt-1 text-[11px] font-[700] text-[#9a6a22]">Marketing Director — Required</p> : null}
            </div>
            <Button type="button" variant="secondary" size="icon" aria-label="Close approval request" onClick={onClose}><X className="h-4 w-4" /></Button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6 sm:py-5">
            {fixedFirstApprover ? (
              <div className="rounded-[14px] border border-[#cfe1d4] bg-[#f4faf5] px-4 py-3">
                <p className="text-[10px] font-[760] uppercase tracking-[.08em] text-[#55725f]">
                  Fixed first approver
                </p>
                <p className="mt-1 text-[13px] font-[740] text-[#243229]">
                  {STAGE_SIX_FIRST_APPROVER.name}
                </p>
                <p className="mt-0.5 text-[11px] text-[#607068]">
                  {STAGE_SIX_FIRST_APPROVER.email}
                </p>
              </div>
            ) : (
            <fieldset>
              <legend className="text-[12px] font-[720] text-[#2d372f]">Recipient Type</legend>
              <div className="mt-2 flex flex-wrap gap-3">
                {[
                  [ProductionApprovalRecipientType.EXISTING_COLLABORATOR, "Existing Collaborator"],
                  [ProductionApprovalRecipientType.EXTERNAL_EMAIL, "External Email"],
                ].map(([value, label]) => (
                  <label key={value} className="flex items-center gap-2 rounded-[11px] border border-[#dfe6df] bg-white px-3 py-2 text-[11px] font-[650] text-[#455149]">
                    <input type="radio" checked={recipientType === value} onChange={() => setRecipientType(value as ProductionApprovalRecipientType)} /> {label}
                  </label>
                ))}
              </div>
            </fieldset>
            )}

            {!fixedFirstApprover && recipientType === ProductionApprovalRecipientType.EXISTING_COLLABORATOR ? (
              <Select value={recipientUserId} onValueChange={setRecipientUserId}>
                <SelectTrigger className="mt-3 h-11 w-full rounded-[12px] border-[#dfe6df] bg-white" aria-label="Select project collaborator"><SelectValue placeholder="Search/select project collaborator" /></SelectTrigger>
                <SelectContent className="z-[190]">{participants.map((participant) => <SelectItem key={participant.id} value={participant.id}>{participant.name} — {participant.role}</SelectItem>)}</SelectContent>
              </Select>
            ) : !fixedFirstApprover ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="space-y-1.5">
                  <span className="text-[11px] font-[700] text-[#3f4b43]">Name</span>
                  <Input value={recipientName} placeholder="Enter recipient name" className="rounded-[12px] border-[#c8d5cb] bg-[#fbfdfb] shadow-none focus-visible:border-[#46906a] focus-visible:ring-[#46906a]/15" onChange={(event) => setRecipientName(event.target.value)} />
                </label>
                <label className="space-y-1.5">
                  <span className="text-[11px] font-[700] text-[#3f4b43]">Email</span>
                  <Input type="email" value={recipientEmail} placeholder="name@example.com" className="rounded-[12px] border-[#c8d5cb] bg-[#fbfdfb] shadow-none focus-visible:border-[#46906a] focus-visible:ring-[#46906a]/15" onChange={(event) => setRecipientEmail(event.target.value)} />
                </label>
              </div>
            ) : null}

            <div className="mt-5 flex items-center justify-between gap-3">
              <h3 className="text-[12px] font-[720] text-[#2d372f]">Information to share</h3>
              <button type="button" className="text-[10px] font-[740] text-[#28714d]" onClick={() => {
                setFieldKeys(allSelected ? [] : STAGE_FIVE_FIELD_DEFINITIONS.map((field) => field.key));
                setFileIds(allSelected ? [] : availableFiles.map((file) => file.id));
              }}>{allSelected ? "Clear All" : "Select All"}</button>
            </div>
            <div className="mt-3 rounded-[14px] border border-[#e1e8e2] bg-[#fafcfa] p-4">
              <p className="text-[10px] font-[760] uppercase tracking-[.07em] text-[#78837b]">Production Files</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {availableFiles.map((file) => (
                  <label key={file.id} className="flex min-w-0 items-center gap-2 text-[11px] text-[#455149]">
                    <input type="checkbox" checked={fileIds.includes(file.id)} onChange={() => toggle(fileIds, file.id, setFileIds)} />
                    <span className="truncate">{file.name}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="mt-3 grid gap-2 rounded-[14px] border border-[#e1e8e2] bg-[#fafcfa] p-4 sm:grid-cols-2">
              {STAGE_FIVE_FIELD_DEFINITIONS.map((field) => (
                <label key={field.key} className="flex items-center gap-2 text-[11px] text-[#455149]">
                  <input type="checkbox" checked={fieldKeys.includes(field.key)} onChange={() => toggle(fieldKeys, field.key, setFieldKeys)} /> {field.title}
                </label>
              ))}
            </div>
            <label className="mt-4 block space-y-2">
              <span className="text-[12px] font-[720] text-[#2d372f]">Optional Message</span>
              <Textarea
                value={message}
                placeholder="Add context or instructions for the approver (optional)."
                className="h-24 min-h-20 max-h-36 resize-y rounded-[14px] border-[#c8d5cb] bg-[#fbfdfb] px-4 py-3 shadow-none focus-visible:border-[#46906a] focus-visible:ring-[#46906a]/15"
                onChange={(event) => setMessage(event.target.value)}
              />
            </label>
          </div>

          <div className="flex shrink-0 flex-col-reverse gap-3 border-t border-[#e7ece8] bg-white px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
            <Button type="button" className="w-full sm:w-auto" variant="secondary" disabled={pending} onClick={onClose}>Cancel</Button>
            <Button type="button" className="w-full sm:w-auto" disabled={!canSubmit || pending} onClick={save}><Plus className="h-4 w-4" /> {pending ? "Saving..." : mode === "marketing-director" ? "Assign & Request Approval" : "Add Approver"}</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ApprovalBadge({ status, dispatch }: { status: ProductionApprovalStepStatus; dispatch: ProductionDispatchStatus }) {
  const label = status === ProductionApprovalStepStatus.ACTIVE
    ? dispatch === ProductionDispatchStatus.FAILED ? "Delivery Failed" : "Pending"
    : status === ProductionApprovalStepStatus.WAITING ? "Waiting" : status === ProductionApprovalStepStatus.APPROVED ? "Approved" : "Rejected";
  return <span className={cn("inline-flex rounded-full px-2.5 py-1 text-[9px] font-[750]", label === "Approved" ? "bg-[#e4f2e7] text-[#2e744e]" : label === "Rejected" || label === "Delivery Failed" ? "bg-[#fde9e6] text-[#a54b43]" : "bg-[#fff3df] text-[#94651f]")}>{label}</span>;
}

function ApprovalSection({
  projectId,
  unit,
  canManage,
  onOpenDialog,
  onRefresh,
}: {
  projectId: string;
  unit: StageSixUnitRecord;
  canManage: boolean;
  onOpenDialog: (mode: ApproverDialogMode) => void;
  onRefresh: () => void;
}) {
  const approved = unit.approvalSteps.filter((step) => step.status === ProductionApprovalStepStatus.APPROVED).length;
  const rejected = unit.approvalSteps.filter((step) => step.status === ProductionApprovalStepStatus.REJECTED).length;
  const pending = unit.approvalSteps.filter((step) => step.status === ProductionApprovalStepStatus.ACTIVE).length;
  const chainIsEditable =
    unit.status === ProjectProductionUnitStatus.PREPARATION ||
    unit.status === ProjectProductionUnitStatus.APPROVAL_PENDING;
  const [stepToRemoveId, setStepToRemoveId] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [removing, startRemoving] = useTransition();
  const stepToRemove = unit.approvalSteps.find((step) => step.id === stepToRemoveId);

  function remove() {
    if (!stepToRemoveId || removing) return;
    setRemoveError(null);
    startRemoving(async () => {
      const result = await removeProductionApproverAction({
        projectId,
        productionUnitId: unit.id,
        stepId: stepToRemoveId,
      });
      if ("error" in result) {
        const message = result.error ?? "Unable to remove this approver.";
        setRemoveError(message);
        showErrorToast("Unable to remove approver.", message);
        return;
      }
      showSuccessToast(
        "Approver removed.",
        "dispatchError" in result
          ? `The next approval is ready, but its email failed: ${result.dispatchError}`
          : undefined,
      );
      setStepToRemoveId(null);
      onRefresh();
    });
  }

  async function retry(stepId: string) {
    const result = await retryProductionApprovalDispatchAction({ projectId, stepId });
    if ("error" in result) return showErrorToast("Unable to resend approval.", result.error);
    showSuccessToast("Approval email resent.");
    onRefresh();
  }

  async function reorder(stepId: string, direction: "UP" | "DOWN") {
    const result = await reorderProductionApproverAction({
      projectId,
      productionUnitId: unit.id,
      stepId,
      direction,
    });
    if ("error" in result) return showErrorToast("Unable to reorder approver.", result.error);
    if (!result.moved) return;
    showSuccessToast("Approval order updated.");
    onRefresh();
  }

  const reorderableSteps = unit.approvalSteps.filter(
    (step) =>
      step.sequence > 1 &&
      !step.isMarketingDirectorRequired &&
      step.status === ProductionApprovalStepStatus.WAITING,
  );

  return (
    <section className="overflow-hidden rounded-[20px] border border-[#dfe6df] bg-white">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
        <div>
          <h2 className="text-[17px] font-[750] text-[#1c271f]">Approval Chain</h2>
          <p className="mt-1 text-[11px] text-[#727d75]">Strictly sequential and scoped independently to this Production Unit.</p>
        </div>
        {canManage && chainIsEditable ? <Button type="button" variant="outline" size="sm" onClick={() => onOpenDialog("additional")}><Plus className="h-4 w-4" /> Add Approver</Button> : null}
      </div>
      <div className="grid grid-cols-2 gap-2 border-y border-[#e8ede8] bg-[#fbfcfb] p-4 sm:grid-cols-4">
        {[["Total Approvers", unit.approvalSteps.length], ["Approved", approved], ["Pending", pending], ["Rejected", rejected]].map(([label, value]) => <div key={label} className="rounded-[11px] bg-white px-3 py-2"><strong className="block text-[14px] text-[#26312a]">{value}</strong><span className="text-[9px] text-[#78837b]">{label}</span></div>)}
      </div>
      <div>
        {unit.approvalSteps.map((step) => (
          <div key={step.id} className="grid gap-3 border-b border-[#e8ede8] px-5 py-4 last:border-b-0 sm:grid-cols-[44px_minmax(0,1fr)_auto_auto] sm:items-center">
            <span className="grid size-9 place-items-center rounded-[10px] border border-[#dfe6df] bg-[#f8faf8] text-[12px] font-[740]">{step.sequence}</span>
            <div className="min-w-0">
              <p className="truncate text-[12px] font-[720] text-[#27322b]">{step.isMarketingDirectorRequired ? "Marketing Director — Required" : step.recipientName}</p>
              <p className="mt-1 truncate text-[10px] text-[#77827a]">{step.recipientType ? `${step.recipientName}${step.recipientEmail ? ` · ${step.recipientEmail}` : ""}` : "Recipient not assigned"}</p>
              {step.failureMessage ? <p className="mt-1 text-[10px] text-[#a54b43]">{step.failureMessage}</p> : null}
              {step.decisionComment ? <p className="mt-1 text-[10px] italic text-[#657168]">“{step.decisionComment}”</p> : null}
            </div>
            <ApprovalBadge status={step.status} dispatch={step.dispatchStatus} />
            <div className="flex justify-end gap-1">
              {step.reviewHref ? <Button asChild type="button" size="sm"><Link href={step.reviewHref}><ShieldCheck className="h-3.5 w-3.5" /> Review Approval</Link></Button> : null}
              {canManage && step.sequence === 1 && !step.isConfigured && chainIsEditable ? <Button type="button" size="sm" onClick={() => onOpenDialog("marketing-director")}><ShieldCheck className="h-3.5 w-3.5" /> Assign</Button> : null}
              {canManage && step.dispatchStatus === ProductionDispatchStatus.FAILED && step.status === ProductionApprovalStepStatus.ACTIVE ? <Button type="button" variant="outline" size="sm" onClick={() => retry(step.id)}><RefreshCw className="h-3.5 w-3.5" /> Retry</Button> : null}
              {canManage && reorderableSteps.some((candidate) => candidate.id === step.id) ? (
                <>
                  <Button type="button" variant="ghost" size="icon" aria-label={`Move approval step ${step.sequence} up`} disabled={reorderableSteps[0]?.id === step.id} onClick={() => reorder(step.id, "UP")}><ArrowUp className="h-4 w-4" /></Button>
                  <Button type="button" variant="ghost" size="icon" aria-label={`Move approval step ${step.sequence} down`} disabled={reorderableSteps.at(-1)?.id === step.id} onClick={() => reorder(step.id, "DOWN")}><ArrowDown className="h-4 w-4" /></Button>
                </>
              ) : null}
              {canManage && chainIsEditable && !step.isMarketingDirectorRequired && (step.status === ProductionApprovalStepStatus.WAITING || step.status === ProductionApprovalStepStatus.ACTIVE) ? <Button type="button" variant="ghost" size="icon" aria-label={`Remove approval step ${step.sequence}`} title="Remove approver" onClick={() => { setRemoveError(null); setStepToRemoveId(step.id); }}><Trash2 className="h-4 w-4 text-[#aa4e45]" /></Button> : null}
            </div>
          </div>
        ))}
      </div>
      {unit.status === ProjectProductionUnitStatus.REJECTED ? (
        <div className="flex gap-2 border-t border-[#f0d5d1] bg-[#fff7f5] px-5 py-4 text-[11px] leading-5 text-[#9b5149]"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />The chain stopped at rejection. Prior approvals are preserved. Restart Approval Chain is intentionally deferred.</div>
      ) : null}
      <ConfirmationDialog
        isOpen={Boolean(stepToRemove)}
        title="Remove approver?"
        description={stepToRemove ? `Remove ${stepToRemove.recipientName} from this approval chain? The remaining approval order will be updated automatically.` : ""}
        confirmLabel="Remove approver"
        tone="destructive"
        pending={removing}
        error={removeError ?? undefined}
        onConfirm={remove}
        onClose={() => {
          if (removing) return;
          setStepToRemoveId(null);
          setRemoveError(null);
        }}
      />
    </section>
  );
}

function HandoverDialog({
  projectId,
  unit,
  participants,
  onClose,
  onSaved,
}: {
  projectId: string;
  unit: StageSixUnitRecord;
  participants: StageSixWorkspaceData["participants"];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [pending, startPending] = useTransition();
  const requestId = useRef(crypto.randomUUID());
  const [route, setRoute] = useState<ProductionHandoverRoute>(ProductionHandoverRoute.PURCHASE_DEPARTMENT);
  const [recipientUserId, setRecipientUserId] = useState("");
  const [company, setCompany] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [fieldKeys, setFieldKeys] = useState<string[]>([]);
  const approvedFileIds = new Set(
    unit.approvalSteps
      .filter((step) => step.status === ProductionApprovalStepStatus.APPROVED)
      .flatMap((step) => step.selectedFileIds),
  );
  const files = [unit.sourceFile, ...unit.productionFiles].filter((file) =>
    approvedFileIds.has(file.id),
  );
  const [fileIds, setFileIds] = useState(files.map((file) => file.id));
  const [note, setNote] = useState("");
  const isInternal = route === ProductionHandoverRoute.PURCHASE_DEPARTMENT;
  const effectiveRecipientType = isInternal
    ? ProductionApprovalRecipientType.EXISTING_COLLABORATOR
    : ProductionApprovalRecipientType.EXTERNAL_EMAIL;
  const recipientReady = isInternal
    ? Boolean(recipientUserId)
    : Boolean(company.trim() && contactName.trim() && /^\S+@\S+\.\S+$/.test(email.trim()) && /^\+[\d\s().-]{8,}$/.test(phone.trim()));

  function toggle(list: string[], value: string, setter: (next: string[]) => void) {
    setter(list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
  }

  function sendHandover() {
    if (!recipientReady || !fileIds.length || pending) return;
    startPending(async () => {
      const result = await handoverProductionUnitAction({
        clientRequestId: requestId.current,
        projectId,
        productionUnitId: unit.id,
        route,
        recipientType: effectiveRecipientType,
        ...(isInternal
          ? { recipientUserId }
          : {
              recipientCompany: company,
              recipientName: contactName,
              recipientEmail: email,
              recipientPhone: phone,
            }),
        sharedFieldKeys: fieldKeys as never[],
        selectedFileIds: fileIds,
        note,
      });
      if ("error" in result) {
        showErrorToast("Handover delivery failed.", result.error ?? "Delivery failed.");
        return;
      }
      showSuccessToast("Production Unit handed over successfully.");
      onSaved();
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-[170] flex items-start justify-center overflow-y-auto bg-[#112118]/45 p-3 backdrop-blur-[2px] sm:items-center sm:p-5" role="dialog" aria-modal="true" aria-labelledby="production-handover-dialog-title">
      <Card className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-[700px] flex-col overflow-hidden rounded-[24px] border-[#dfe6df] p-0 sm:max-h-[calc(100dvh-2.5rem)]">
        <div className="flex shrink-0 items-start justify-between border-b border-[#e7ece8] px-6 py-5 sm:px-7">
          <div><p className="text-[10px] font-[760] uppercase tracking-[.12em] text-[#4c795e]">Approved Unit</p><h2 id="production-handover-dialog-title" className="mt-2 text-[22px] font-[760]">Production Handover</h2></div>
          <Button type="button" variant="secondary" size="icon" onClick={onClose} aria-label="Close production handover dialog"><X className="h-4 w-4" /></Button>
        </div>
        <CardContent className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5 sm:px-7">
            <p className="text-[12px] font-[720] text-[#2d372f]">Who receives this optional handover?</p>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <button type="button" onClick={() => setRoute(ProductionHandoverRoute.PURCHASE_DEPARTMENT)} className={cn("rounded-[14px] border p-4 text-left", isInternal ? "border-[#72a184] bg-[#f1f8f3]" : "border-[#dfe6df]")}><strong className="block text-[12px] font-[740]">Internal</strong><span className="mt-1 block text-[10px] leading-4 text-[#6f7a72]">Select an existing project participant, such as Purchasing.</span></button>
          <button type="button" onClick={() => setRoute(ProductionHandoverRoute.DIRECT_VENDOR)} className={cn("rounded-[14px] border p-4 text-left", !isInternal ? "border-[#72a184] bg-[#f1f8f3]" : "border-[#dfe6df]")}><strong className="block text-[12px] font-[740]">External</strong><span className="mt-1 block text-[10px] leading-4 text-[#6f7a72]">Send securely to a vendor or other external company.</span></button>
        </div>
        {isInternal ? <Select value={recipientUserId} onValueChange={setRecipientUserId}><SelectTrigger className="mt-3 h-11 rounded-[12px] border-[#c8d5cb] bg-[#fbfdfb] focus:border-[#46906a] focus:ring-[#46906a]/15"><SelectValue placeholder="Select internal recipient" /></SelectTrigger><SelectContent className="z-[190]">{participants.map((participant) => <SelectItem key={participant.id} value={participant.id}>{participant.name} — {participant.role}</SelectItem>)}</SelectContent></Select> : <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="space-y-1.5"><span className="text-[11px] font-[700] text-[#3f4b43]">Company name</span><Input value={company} placeholder="Enter company name" className="rounded-[12px] border-[#c8d5cb] bg-[#fbfdfb] shadow-none focus-visible:border-[#46906a] focus-visible:ring-[#46906a]/15" onChange={(event) => setCompany(event.target.value)} /></label>
          <label className="space-y-1.5"><span className="text-[11px] font-[700] text-[#3f4b43]">Contact name</span><Input value={contactName} placeholder="Enter contact name" className="rounded-[12px] border-[#c8d5cb] bg-[#fbfdfb] shadow-none focus-visible:border-[#46906a] focus-visible:ring-[#46906a]/15" onChange={(event) => setContactName(event.target.value)} /></label>
          <label className="space-y-1.5"><span className="text-[11px] font-[700] text-[#3f4b43]">Email</span><Input type="email" value={email} placeholder="contact@company.com" className="rounded-[12px] border-[#c8d5cb] bg-[#fbfdfb] shadow-none focus-visible:border-[#46906a] focus-visible:ring-[#46906a]/15" onChange={(event) => setEmail(event.target.value)} /></label>
          <label className="space-y-1.5"><span className="text-[11px] font-[700] text-[#3f4b43]">Phone</span><Input type="tel" value={phone} placeholder="e.g. +971 50 123 4567" className="rounded-[12px] border-[#c8d5cb] bg-[#fbfdfb] shadow-none focus-visible:border-[#46906a] focus-visible:ring-[#46906a]/15" onChange={(event) => setPhone(event.target.value)} /><span className="block text-[9px] text-[#77827a]">Include the international country code.</span></label>
        </div>}
        <h3 className="mt-6 text-[12px] font-[720]">Approved production files</h3>
        <div className="mt-2 grid gap-2 rounded-[14px] border border-[#e1e8e2] bg-[#fafcfa] p-4 sm:grid-cols-2">{files.map((file) => <label key={file.id} className="flex min-w-0 items-center gap-2 text-[11px]"><input type="checkbox" checked={fileIds.includes(file.id)} onChange={() => toggle(fileIds, file.id, setFileIds)} /><span className="truncate">{file.name}</span></label>)}</div>
        <div className="mt-3 flex items-center justify-between"><h3 className="text-[12px] font-[720]">Relevant technical information</h3><button type="button" className="text-[10px] font-[740] text-[#28714d]" onClick={() => setFieldKeys(fieldKeys.length === STAGE_FIVE_FIELD_DEFINITIONS.length ? [] : STAGE_FIVE_FIELD_DEFINITIONS.map((field) => field.key))}>Select All</button></div>
        <div className="mt-2 grid gap-2 rounded-[14px] border border-[#e1e8e2] bg-[#fafcfa] p-4 sm:grid-cols-2">{STAGE_FIVE_FIELD_DEFINITIONS.map((field) => <label key={field.key} className="flex items-center gap-2 text-[11px]"><input type="checkbox" checked={fieldKeys.includes(field.key)} onChange={() => toggle(fieldKeys, field.key, setFieldKeys)} />{field.title}</label>)}</div>
            <label className="mt-4 block space-y-2"><span className="text-[12px] font-[720]">Optional handover note</span><Textarea value={note} className="min-h-[90px]" onChange={(event) => setNote(event.target.value)} /></label>
        </CardContent>
        <CardFooter className="shrink-0 flex-col items-stretch border-t border-[#e7ece8] bg-white px-6 py-4 sm:px-7">
          <p className="text-[10px] leading-4 text-[#748078]">The recipient receives a time-limited secure link. Files are not exposed through permanent public storage URLs.</p>
          <div className="mt-3 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><Button type="button" variant="secondary" className="w-full sm:w-auto" disabled={pending} onClick={onClose}>Cancel</Button><Button type="button" className="w-full sm:w-auto" disabled={!recipientReady || !fileIds.length || pending} onClick={sendHandover}><Send className="h-4 w-4" />{pending ? "Sending..." : "Send Handover"}</Button></div>
        </CardFooter>
      </Card>
    </div>
  );
}

function HandoverSection({ unit, canManage, onOpen }: { unit: StageSixUnitRecord; canManage: boolean; onOpen: () => void }) {
  return (
    <section className="rounded-[20px] border border-[#dfe6df] bg-white p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div><div className="flex items-center gap-2"><h2 className="text-[17px] font-[750] text-[#1c271f]">Production Handover</h2><span className="rounded-full bg-[#f0f3f0] px-2 py-0.5 text-[9px] font-[740] uppercase tracking-[.06em] text-[#6d786f]">Optional</span></div><p className="mt-1 text-[11px] text-[#727d75]">After final approval, optionally send the production package internally or externally.</p></div>
        {canManage && unit.status === ProjectProductionUnitStatus.HANDOVER_READY ? <Button type="button" onClick={onOpen}><PackageCheck className="h-4 w-4" /> Send Optional Handover</Button> : null}
      </div>
      {unit.handover ? <div className={cn("mt-4 rounded-[14px] border px-4 py-3 text-[11px]", unit.handover.deliveryStatus === "FAILED" ? "border-[#f0c9c7] bg-[#fff2f1] text-[#9b5149]" : "border-[#d8e6dc] bg-[#f3f8f4] text-[#41604c]")}><strong>{unit.handover.route === ProductionHandoverRoute.PURCHASE_DEPARTMENT ? "Internal" : "External"}</strong>{unit.handover.recipientCompany ? ` · ${unit.handover.recipientCompany}` : ""} · {unit.handover.recipientName} · {unit.handover.recipientEmail}{unit.handover.recipientPhone ? ` · ${unit.handover.recipientPhone}` : ""}{unit.handover.failureMessage ? <p className="mt-1">{unit.handover.failureMessage}</p> : null}</div> : null}
      {unit.status === ProjectProductionUnitStatus.HANDED_OVER ? <p className="mt-4 flex items-center gap-2 text-[11px] font-[700] text-[#2e744e]"><Check className="h-4 w-4" /> Handed over successfully.</p> : unit.status !== ProjectProductionUnitStatus.HANDOVER_READY ? <p className="mt-4 flex items-center gap-2 text-[11px] text-[#8a7452]"><Clock3 className="h-4 w-4" /> Complete this unit’s approval chain first.</p> : null}
    </section>
  );
}

type ArchiveWizardStep = 0 | 1 | 2 | 3;

function StageSixArchiveDialog({
  preparation,
  projectId,
  onClose,
  onSaved,
}: {
  preparation: StageSixArchivePreparation;
  projectId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [step, setStep] = useState<ArchiveWizardStep>(0);
  const [categoryId, setCategoryId] = useState(preparation.selectedCategoryId);
  const [fileNames, setFileNames] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      preparation.files.map((file) => [file.sourceAttachmentId, file.defaultArchiveFileName]),
    ),
  );
  const [metadata, setMetadata] = useState<Record<string, ArchiveArtworkMetadataDraft>>(() =>
    Object.fromEntries(
      preparation.files.map((file) => [file.sourceAttachmentId, file.metadataDraft]),
    ),
  );
  const [error, setError] = useState("");
  const [saving, startSaving] = useTransition();

  const fileErrors = useMemo(
    () =>
      Object.fromEntries(
        preparation.files.map((file) => {
          const otherNames = preparation.files
            .filter((candidate) => candidate.sourceAttachmentId !== file.sourceAttachmentId)
            .map(
              (candidate) =>
                fileNames[candidate.sourceAttachmentId] ?? candidate.defaultArchiveFileName,
            );
          return [
            file.sourceAttachmentId,
            getArchiveFileNameValidationError(
              file.originalFileName,
              fileNames[file.sourceAttachmentId] ?? file.defaultArchiveFileName,
              otherNames,
            ),
          ];
        }),
      ) as Record<string, string | null>,
    [fileNames, preparation.files],
  );
  const metadataFiles = preparation.files.map((file) => ({
    id: file.sourceAttachmentId,
    originalFileName: file.originalFileName,
    metadata: metadata[file.sourceAttachmentId] ?? file.metadataDraft,
  }));
  const missingMetadataCount = metadataFiles.reduce(
    (count, file) => count + getArchiveArtworkMetadataMissingCount(file.metadata),
    0,
  );
  const canContinueFiles =
    Boolean(categoryId) && !Object.values(fileErrors).some(Boolean);
  const canSave = canContinueFiles && missingMetadataCount === 0;

  function updateMetadata(
    fileId: string,
    field: keyof ArchiveArtworkMetadataDraft,
    value: string,
  ) {
    setMetadata((current) => ({
      ...current,
      [fileId]: {
        ...(current[fileId] ?? preparation.files.find((file) => file.sourceAttachmentId === fileId)!.metadataDraft),
        [field]: value,
      },
    }));
  }

  function applyProjectMetadataToAll() {
    const firstFile = metadataFiles[0];
    if (!firstFile) return;
    const source = firstFile.metadata;
    const sharedFields: Array<keyof ArchiveArtworkMetadataDraft> = [
      "languageMarket", "artworkType", "brandSubBrand", "productSku", "campaignProject",
      "colourSpace", "printProcess", "specialFinishes", "archiveStatus", "clientBrandOwner",
      "regulatoryClearance", "fontsUsed", "imagesPhotography", "illustrationsIcons",
      "colourCodes", "thirdPartyLogosIp", "supplierPrinter", "printProofRef",
      "packagingDielineRef", "relatedArtworks", "briefSpecLink", "generalNotes",
    ];
    setMetadata((current) =>
      Object.fromEntries(
        preparation.files.map((file) => {
          const next = { ...(current[file.sourceAttachmentId] ?? file.metadataDraft) };
          sharedFields.forEach((field) => { next[field] = source[field]; });
          return [file.sourceAttachmentId, next];
        }),
      ),
    );
  }

  function save() {
    if (!canSave) {
      if (!canContinueFiles) {
        setError("Choose an archive category and fix the archive file names.");
        setStep(0);
        return;
      }
      const firstIncomplete = metadataFiles.find(
        (file) => getArchiveArtworkMetadataMissingGroups(file.metadata).length > 0,
      );
      setError(
        firstIncomplete
          ? `Complete the required metadata for ${firstIncomplete.originalFileName}.`
          : "Complete the required archive metadata.",
      );
      setStep(1);
      return;
    }

    setError("");
    startSaving(async () => {
      const result = await saveStageSixArchiveAction({
        projectId,
        archiveCategoryId: categoryId,
        files: preparation.files.map((file) => ({
          sourceAttachmentId: file.sourceAttachmentId,
          finalArchiveFileName: fileNames[file.sourceAttachmentId] ?? file.defaultArchiveFileName,
          artworkMetadata: metadata[file.sourceAttachmentId] ?? file.metadataDraft,
        })),
      });
      if ("error" in result) {
        setError(result.error ?? "Unable to save the Stage 6 archive.");
        return;
      }
      showSuccessToast("Final files saved to Archives. Stage 7 remains active.");
      onSaved();
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-[180] flex items-center justify-center overflow-hidden bg-[#112118]/45 px-3 py-4 backdrop-blur-[2px] sm:px-5 sm:py-6" role="dialog" aria-modal="true" aria-labelledby="stage-six-archive-title">
      <Card className="flex max-h-[calc(100dvh-2rem)] w-full max-w-[1080px] flex-col overflow-hidden rounded-[28px] border-[#e1e7e1] shadow-[0_35px_90px_rgba(11,26,18,.22)] sm:max-h-[calc(100dvh-3rem)]">
        <CardHeader className="shrink-0 flex-row items-start justify-between gap-4 border-b border-[#e4eae5] p-5 sm:p-7">
          <div>
            <CardTitle id="stage-six-archive-title" className="text-[22px] font-[760] tracking-tight text-[#111712]">Save Final Files to Archives</CardTitle>
            <p className="mt-2 text-[13px] leading-5 text-[#687269]">Save an archive snapshot now. This does not complete the project or stop Stage 7.</p>
          </div>
          <Button type="button" variant="secondary" size="icon" onClick={onClose} disabled={saving} aria-label="Close archive dialog"><X className="h-4 w-4" /></Button>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-7 sm:py-6">
          {error ? <div className="mb-4 rounded-[14px] border border-[#f0c9c7] bg-[#fff2f1] px-4 py-3 text-[12px] text-[#aa463f]">{error}</div> : null}
          <div className="grid gap-2 sm:grid-cols-4">
            {archiveProjectWizardSteps.map((label, index) => (
              <button key={label} type="button" disabled={saving} onClick={() => setStep(index as ArchiveWizardStep)} className={cn("rounded-[14px] border px-3 py-3 text-left", step === index ? "border-[#72a184] bg-[#eef8f0] text-[#173120]" : "border-[#dce6dd] bg-white text-[#687269]")}>
                <span className="block text-[9px] font-[800] uppercase tracking-[.08em]">Step {index + 1}</span>
                <span className="mt-1 block text-[12px] font-[800]">{label}</span>
              </button>
            ))}
          </div>

          {step === 0 ? <div className="mt-5 space-y-4">
            <div className="grid gap-4 rounded-[18px] border border-[#dfe6df] bg-[#fbfcfa] p-4 sm:grid-cols-[minmax(0,1fr)_260px]">
              <div><p className="text-[10px] font-[800] uppercase tracking-[.08em] text-[#70806f]">Project</p><p className="mt-1 text-[16px] font-[750]">{preparation.projectName}</p><p className="mt-1 text-[12px] text-[#687269]">Source: Stage 6 approved production files</p></div>
              <div className="space-y-2"><p className="text-[10px] font-[800] uppercase tracking-[.08em] text-[#70806f]">Archive Category *</p><Select value={categoryId} onValueChange={setCategoryId} disabled={saving}><SelectTrigger className="h-11 rounded-[12px]"><SelectValue placeholder="Choose archive category" /></SelectTrigger><SelectContent>{preparation.categories.map((category) => <SelectItem key={category.id} value={category.id}>{category.parentName ? `${category.parentName} / ${category.name}` : category.name}</SelectItem>)}</SelectContent></Select></div>
            </div>
            {preparation.files.map((file) => <div key={file.sourceAttachmentId} className="grid gap-4 rounded-[18px] border border-[#dfe6df] bg-white p-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,.8fr)]"><div className="min-w-0"><p className="truncate text-[13px] font-[750]">{file.originalFileName}</p><p className="mt-1 text-[11px] text-[#687269]">{file.fileSizeLabel} · {file.sourceLabel}</p><div className="mt-3 flex gap-2"><AssetPreviewButton fileName={file.originalFileName} mimeType={file.mimeType} previewPath={file.previewPath} downloadPath={file.downloadPath} iconOnly={false} triggerClassName="rounded-full" /><Button asChild type="button" variant="secondary" size="sm" className="rounded-full"><a href={file.downloadPath}><Download className="h-4 w-4" />Download</a></Button></div></div><label className="space-y-2"><span className="text-[10px] font-[800] uppercase tracking-[.08em] text-[#70806f]">Final Archive File Name *</span><Input value={fileNames[file.sourceAttachmentId] ?? file.defaultArchiveFileName} onChange={(event) => setFileNames((current) => ({ ...current, [file.sourceAttachmentId]: event.target.value }))} disabled={saving} className={cn("h-11 rounded-[12px]", fileErrors[file.sourceAttachmentId] && "border-[#df6f66]")} />{fileErrors[file.sourceAttachmentId] ? <span className="block text-[11px] text-[#bd4a43]">{fileErrors[file.sourceAttachmentId]}</span> : <span className="block text-[10px] text-[#77827a]">Keep the original extension.</span>}</label></div>)}
          </div> : null}

          {step === 1 ? <div className="mt-5"><ArchiveMetadataIdentificationStep files={metadataFiles} onChange={updateMetadata} onApplyToAll={applyProjectMetadataToAll} disabled={saving} description="Complete Artwork Legend identification for each Stage 6 final file." /></div> : null}
          {step === 2 ? <div className="mt-5"><ArchiveMetadataTechnicalStep files={metadataFiles} onChange={updateMetadata} disabled={saving} /></div> : null}
          {step === 3 ? <div className="mt-5"><ArchiveMetadataReviewList files={metadataFiles} getFinalFileName={(file) => fileNames[file.id] ?? file.originalFileName} onEditMetadata={() => setStep(1)} missingMetadataCount={missingMetadataCount} fileCountLabel={`${preparation.files.length} final file${preparation.files.length === 1 ? "" : "s"}`} /></div> : null}
        </CardContent>
        <CardFooter className="shrink-0 flex-col gap-3 border-t border-[#e4eae5] bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
          <p className="text-[11px] leading-5 text-[#687269]">The files become available in Archives while the project continues to Stage 7.</p>
          <div className="flex w-full flex-wrap justify-end gap-2 sm:w-auto"><Button type="button" variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>{step > 0 ? <Button type="button" variant="secondary" onClick={() => setStep((current) => Math.max(0, current - 1) as ArchiveWizardStep)} disabled={saving}>Previous</Button> : null}{step < 3 ? <Button type="button" onClick={() => setStep((current) => Math.min(3, current + 1) as ArchiveWizardStep)} disabled={saving || (step === 0 && !canContinueFiles)}>Next</Button> : <Button type="button" onClick={save} disabled={saving || !canSave}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />}Save to Archives</Button>}</div>
        </CardFooter>
      </Card>
    </div>
  );
}

export function StageSixWorkspace({
  project,
  currentUserId,
  pageData,
  initialUnitId,
}: {
  project: ProjectStageShellRecord;
  currentUserId: string;
  pageData: StageSixWorkspaceData;
  initialUnitId?: string;
}) {
  const router = useRouter();
  const firstUnitId = pageData.units[0]?.id ?? "";
  const [activeUnitId, setActiveUnitId] = useState(pageData.units.some((unit) => unit.id === initialUnitId) ? initialUnitId ?? firstUnitId : firstUnitId);
  const [approverDialog, setApproverDialog] = useState<ApproverDialogMode | null>(null);
  const [handoverDialog, setHandoverDialog] = useState(false);
  const [completionDialog, setCompletionDialog] = useState(false);
  const [completionError, setCompletionError] = useState("");
  const [archivePreparation, setArchivePreparation] = useState<StageSixArchivePreparation | null>(null);
  const [archiveError, setArchiveError] = useState("");
  const [preparingArchive, startPreparingArchive] = useTransition();
  const [completing, startCompleting] = useTransition();
  const activeUnit = useMemo(() => pageData.units.find((unit) => unit.id === activeUnitId) ?? pageData.units[0], [activeUnitId, pageData.units]);

  useEffect(() => {
    const refreshVisiblePage = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const intervalId = window.setInterval(refreshVisiblePage, 15_000);
    window.addEventListener("focus", refreshVisiblePage);
    document.addEventListener("visibilitychange", refreshVisiblePage);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshVisiblePage);
      document.removeEventListener("visibilitychange", refreshVisiblePage);
    };
  }, [router]);

  function refresh() { router.refresh(); }
  function selectUnit(id: string) {
    setActiveUnitId(id);
    router.replace(`/projects/${project.id}/stages/6?unit=${encodeURIComponent(id)}`, { scroll: false });
  }
  function complete() {
    setCompletionError("");
    startCompleting(async () => {
      const result = await completeStageSixAction({ projectId: project.id });
      if ("error" in result) {
        setCompletionError(result.error ?? "Unable to complete Stage 6.");
        return;
      }
      setCompletionDialog(false);
      showSuccessToast("Stage 6 completed. Save the final files to Archives or continue to Stage 7.");
      router.refresh();
    });
  }
  function openArchiveDialog() {
    setArchiveError("");
    startPreparingArchive(async () => {
      const result = await prepareStageSixArchiveAction({ projectId: project.id });
      if ("error" in result) {
        const message = result.error ?? "Unable to prepare the Stage 6 archive.";
        setArchiveError(message);
        showErrorToast("Unable to prepare the archive.", message);
        return;
      }
      setArchivePreparation(result.preparation);
    });
  }

  return (
    <section className="mx-auto w-full max-w-[1420px] pb-6">
      <ProjectAccessRealtimeGuard projectId={project.id} currentUserId={currentUserId} />
      <Card className="overflow-hidden rounded-[26px] border-[#dfe6df] shadow-[0_20px_54px_rgba(23,39,28,.055)]"><CardContent className="p-0">
        <div className="px-5 py-6 sm:px-7 sm:py-8 lg:px-9">
          <div className="flex items-center gap-2 text-[11px] font-[760] uppercase tracking-[.13em] text-[#4d765d]"><ShieldCheck className="h-4 w-4" /> Production &amp; Handover</div>
          <h1 className="mt-3 text-[28px] font-[780] tracking-[-.04em] text-[#111713] sm:text-[34px]">Stage 6 - Production &amp; Handover</h1>
          <p className="mt-2 text-[13px] leading-5 text-[#6f7a72]">Manage production files, sequential yes/no approvals, and final delivery per Production Unit.</p>
          <ProjectStageSummary project={project} />
          <StageSummary data={pageData} />
          {pageData.units.length ? <div className="mt-5"><UnitSwitcher units={pageData.units} activeUnitId={activeUnit?.id ?? ""} onSelect={selectUnit} /></div> : null}
        </div>

        {activeUnit ? (
          <div className="space-y-5 border-t border-[#e7ece7] bg-[#fbfcfb] px-5 py-6 sm:px-7 lg:px-9 lg:py-7">
            <FilesSection
              key={`${activeUnit.id}:${activeUnit.productionFiles.map((file) => file.id).join(",")}`}
              projectId={project.id}
              unit={activeUnit}
              canManage={pageData.canManage}
              onRefresh={refresh}
            />
            <ProductionDetails unit={activeUnit} />
            <ApprovalSection projectId={project.id} unit={activeUnit} canManage={pageData.canManage} onOpenDialog={setApproverDialog} onRefresh={refresh} />
            <HandoverSection unit={activeUnit} canManage={pageData.canManage} onOpen={() => setHandoverDialog(true)} />
          </div>
        ) : (
          <div className="border-t border-[#e7ece7] bg-[#fbfcfb] px-6 py-16 text-center"><FileCheck2 className="mx-auto h-8 w-8 text-[#4d765d]" /><h2 className="mt-4 text-[17px] font-[740]">No Production Units yet</h2><p className="mt-2 text-[12px] text-[#77827a]">Complete Stage 5 to create one unit per final file.</p></div>
        )}

        <div className="flex flex-col-reverse gap-3 border-t border-[#e7ece7] bg-white px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-7 lg:px-9">
          <Button asChild type="button" variant="outline" className="min-w-[160px]"><Link href={`/projects/${project.id}`}><ListChecks className="h-4 w-4" /> All Stages</Link></Button>
          {pageData.stageCompleted ? (
            <div className="flex flex-col items-stretch gap-2 sm:items-end">
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
                {pageData.canManage ? (
                  <Button
                    type="button"
                    variant="secondary"
                    className="min-w-[180px]"
                    disabled={preparingArchive}
                    onClick={openArchiveDialog}
                  >
                    {preparingArchive ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Archive className="h-4 w-4" />
                    )}
                    {pageData.savedArchive ? "Update Saved Archive" : "Save to Archives"}
                  </Button>
                ) : null}
                {pageData.savedArchive && pageData.canManage ? (
                  <Button
                    asChild
                    type="button"
                    variant="secondary"
                    className="min-w-[180px]"
                  >
                    <Link href={`/archives/${pageData.savedArchive.archiveCategorySlug}`}>
                      <Archive className="h-4 w-4" /> Open Saved Archive
                    </Link>
                  </Button>
                ) : null}
                <Button asChild type="button" className="min-w-[180px]">
                  <Link href={`/projects/${project.id}/stages/7`}>
                    Next Stage <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
              {pageData.savedArchive ? (
                <p className="text-[10px] font-[700] text-[#2e744e]">
                  {pageData.savedArchive.fileCount} final file
                  {pageData.savedArchive.fileCount === 1 ? "" : "s"} saved in{" "}
                  {pageData.savedArchive.archiveCategoryLabel}. Stage 7 remains active.
                </p>
              ) : archiveError ? (
                <p className="max-w-[440px] text-right text-[10px] text-[#b84e48]">
                  {archiveError}
                </p>
              ) : (
                <p className="text-[10px] text-[#687269]">
                  Archiving saves a snapshot and does not complete the project.
                </p>
              )}
            </div>
          ) : pageData.canManage ? (
            <div className="text-right">
              <Button
                type="button"
                className="min-w-[180px]"
                disabled={!pageData.units.length || pageData.summary.approved !== pageData.summary.total}
                onClick={() => {
                  setCompletionError("");
                  setCompletionDialog(true);
                }}
              >
                <Check className="h-4 w-4" /> Complete Stage 6
              </Button>
              {pageData.summary.approved !== pageData.summary.total ? (
                <p className="mt-2 text-[10px] text-[#8a7452]">
                  Every Production Unit must complete its approval chain. Handover is optional.
                </p>
              ) : null}
            </div>
          ) : (
            <p className="text-[11px] text-[#77827a]">Owner or Co-Owner management required.</p>
          )}
        </div>
      </CardContent></Card>

      {activeUnit && approverDialog ? <ApproverDialog mode={approverDialog} projectId={project.id} unit={activeUnit} participants={pageData.participants} onClose={() => setApproverDialog(null)} onSaved={refresh} /> : null}
      {activeUnit && handoverDialog ? <HandoverDialog projectId={project.id} unit={activeUnit} participants={pageData.participants} onClose={() => setHandoverDialog(false)} onSaved={refresh} /> : null}
      {archivePreparation ? <StageSixArchiveDialog preparation={archivePreparation} projectId={project.id} onClose={() => setArchivePreparation(null)} onSaved={refresh} /> : null}
      <ConfirmationDialog isOpen={completionDialog} title="Complete Stage 6" description="All Production Units have completed approval. Complete Stage 6 and unlock Stage 7? Optional handovers can be skipped." confirmLabel="Complete Stage 6" pending={completing} error={completionError || undefined} onConfirm={complete} onClose={() => { if (!completing) setCompletionDialog(false); }} />
    </section>
  );
}

export function StageSixLoadingShell() {
  return <section className="mx-auto w-full max-w-[1420px] pb-6"><Card className="overflow-hidden rounded-[26px] border-[#dfe6df] shadow-none"><CardContent className="p-0"><div className="p-7 lg:p-9"><Skeleton className="h-4 w-40 rounded-full" /><Skeleton className="mt-4 h-10 w-full max-w-[520px] rounded-[12px]" /><div className="mt-6 flex gap-3">{Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-[72px] w-[230px] rounded-[16px]" />)}</div></div><div className="space-y-4 border-t border-[#e7ece7] bg-[#fbfcfb] p-6"><Skeleton className="h-[180px] rounded-[20px]" /><Skeleton className="h-[240px] rounded-[20px]" /><Skeleton className="h-[280px] rounded-[20px]" /></div></CardContent></Card></section>;
}
