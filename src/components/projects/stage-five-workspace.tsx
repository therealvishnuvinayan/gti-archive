"use client";

import Link from "next/link";
import { useId, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  Barcode,
  Box,
  Check,
  FileCheck2,
  FileImage,
  FileOutput,
  FileText,
  Hash,
  HeartPulse,
  ImagePlus,
  ListChecks,
  Mail,
  MapPin,
  Palette,
  Plus,
  QrCode,
  ReceiptText,
  Send,
  ShieldCheck,
  Sparkles,
  Stamp,
  ToggleLeft,
  Upload,
  X,
} from "lucide-react";

import { ProjectAccessRealtimeGuard } from "@/components/projects/project-access-realtime-guard";
import { ProjectStageSummary } from "@/components/projects/project-stage-summary";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import type { ProjectFlowRecord } from "@/lib/projects";
import { showInfoToast } from "@/lib/toast";
import { cn } from "@/lib/utils";

type ChecklistFieldKey =
  | "outputName"
  | "technicalDrawing"
  | "healthWarning"
  | "tarNicotine"
  | "compulsoryText"
  | "marketingCopy"
  | "relatedGraphics"
  | "printingTechnology"
  | "finishes"
  | "barcode"
  | "trackTrace"
  | "threeD"
  | "taxStamp"
  | "qrCode"
  | "invoice";

type ChecklistControl =
  | "text"
  | "textarea"
  | "file"
  | "multi-file"
  | "health-warning"
  | "multi-value"
  | "finishes"
  | "text-attachment";

type ChecklistDefinition = {
  key: ChecklistFieldKey;
  title: string;
  helper: string;
  control: ChecklistControl;
  placeholder?: string;
  icon: LucideIcon;
  suggestions?: string[];
};

type LocalFileRecord = {
  id: string;
  name: string;
  size: number;
};

type ParticipantOption = {
  id: string;
  name: string;
  role: string;
};

const CHECKLIST_ITEMS: ChecklistDefinition[] = [
  {
    key: "outputName",
    title: "Output Name",
    helper: "The name of the output file",
    control: "text",
    placeholder: "Enter output name",
    icon: FileOutput,
  },
  {
    key: "technicalDrawing",
    title: "Technical Drawing",
    helper: "Upload the technical drawing file",
    control: "file",
    icon: FileText,
  },
  {
    key: "healthWarning",
    title: "Health Warning",
    helper: "Add warning text, a reference file, or both",
    control: "health-warning",
    placeholder: "Enter the required health warning",
    icon: HeartPulse,
  },
  {
    key: "tarNicotine",
    title: "Tar / Nicotine",
    helper: "The required tar and nicotine information",
    control: "text",
    placeholder: "Tar: 8 mg | Nicotine: 0.7 mg",
    icon: Hash,
  },
  {
    key: "compulsoryText",
    title: "Compulsory Text",
    helper: "All mandatory text required for the pack",
    control: "textarea",
    placeholder: "Enter compulsory text",
    icon: ShieldCheck,
  },
  {
    key: "marketingCopy",
    title: "Marketing Copy",
    helper: "Add one or more lines of approved marketing copy",
    control: "textarea",
    placeholder: "Enter marketing copy",
    icon: Palette,
  },
  {
    key: "relatedGraphics",
    title: "Related Graphics",
    helper: "Add logos, illustrations, and other related graphics",
    control: "multi-file",
    icon: ImagePlus,
  },
  {
    key: "printingTechnology",
    title: "Printing Technology",
    helper: "Select or enter the required printing technologies",
    control: "multi-value",
    icon: Sparkles,
    suggestions: ["Offset Printing", "Digital Printing", "Flexographic", "Gravure"],
  },
  {
    key: "finishes",
    title: "Finishes",
    helper: "Add finishes and optional reference files",
    control: "finishes",
    icon: ToggleLeft,
    suggestions: ["Matte Lamination", "Gloss Lamination", "Spot UV", "Embossing", "Foil"],
  },
  {
    key: "barcode",
    title: "Barcode",
    helper: "Enter the barcode number",
    control: "text",
    placeholder: "Enter barcode number",
    icon: Barcode,
  },
  {
    key: "trackTrace",
    title: "Track & Trace",
    helper: "Add dimensions, location, placement, or a reference file",
    control: "text-attachment",
    placeholder: "Describe track and trace placement",
    icon: MapPin,
  },
  {
    key: "threeD",
    title: "3D's",
    helper: "Add 3D files, renders, or visualizations",
    control: "multi-file",
    icon: Box,
  },
  {
    key: "taxStamp",
    title: "Tax Stamp",
    helper: "Add tax stamp details and an optional reference",
    control: "text-attachment",
    placeholder: "Enter tax stamp requirements",
    icon: Stamp,
  },
  {
    key: "qrCode",
    title: "QR Code",
    helper: "Add the required QR code file",
    control: "file",
    icon: QrCode,
  },
  {
    key: "invoice",
    title: "Invoice",
    helper: "Add the invoice file for this project",
    control: "file",
    icon: ReceiptText,
  },
];

const CONTROL_CLASS =
  "min-h-11 rounded-[12px] border-[#dfe6df] bg-white shadow-none focus-visible:border-[#8db49a]";

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getParticipantOptions(project: ProjectFlowRecord) {
  const participants = [
    ...project.collaborators.map((collaborator) => ({
      id: collaborator.id,
      name: collaborator.name,
      role: collaborator.role,
    })),
    ...project.executors.map((executor) => ({
      id: executor.id,
      name: executor.name,
      role: "Project Executor",
    })),
  ];
  const unique = new Map<string, ParticipantOption>();

  for (const participant of participants) {
    if (!unique.has(participant.id)) unique.set(participant.id, participant);
  }

  return [...unique.values()];
}

function ChecklistStatusBadge({ filled }: { filled: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-[750]",
        filled
          ? "bg-[#e4f2e7] text-[#2e744e]"
          : "bg-[#fff3df] text-[#9a6a22]",
      )}
    >
      {filled ? <Check className="h-3 w-3" /> : null}
      {filled ? "Filled" : "Pending"}
    </span>
  );
}

function ChecklistUploadField({
  fieldLabel,
  files,
  multiple = false,
  compact = false,
  onChange,
}: {
  fieldLabel: string;
  files: LocalFileRecord[];
  multiple?: boolean;
  compact?: boolean;
  onChange: (files: LocalFileRecord[]) => void;
}) {
  const inputId = useId();

  function selectFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.currentTarget.files ?? []).map((file) => ({
      id: `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`,
      name: file.name,
      size: file.size,
    }));

    if (selected.length > 0) {
      onChange(multiple ? [...files, ...selected] : selected.slice(0, 1));
    }
    event.currentTarget.value = "";
  }

  return (
    <div className="min-w-0 space-y-2">
      <input
        id={inputId}
        type="file"
        multiple={multiple}
        className="sr-only"
        aria-label={`Choose ${fieldLabel} ${multiple ? "files" : "file"}`}
        onChange={selectFiles}
      />
      <div className="flex min-w-0 flex-wrap gap-2">
        {files.map((file) => (
          <span
            key={file.id}
            className="inline-flex max-w-full items-center gap-2 rounded-[10px] border border-[#dfe6df] bg-[#f7faf7] px-3 py-2 text-[11px] text-[#344038]"
          >
            <FileImage className="h-3.5 w-3.5 shrink-0 text-[#438060]" />
            <span className="max-w-[220px] truncate font-[650]">{file.name}</span>
            <span className="shrink-0 text-[#7c867f]">{formatFileSize(file.size)}</span>
            <button
              type="button"
              className="grid size-5 place-items-center rounded-full text-[#7d8780] hover:bg-[#e5ebe6] hover:text-[#344038]"
              aria-label={`Remove ${file.name}`}
              onClick={() => onChange(files.filter((item) => item.id !== file.id))}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <label
          htmlFor={inputId}
          className={cn(
            "inline-flex cursor-pointer items-center justify-center gap-2 rounded-[11px] border border-dashed border-[#9dbba7] bg-[#f8fcf9] font-[680] text-[#347153] transition hover:border-[#6f9f80] hover:bg-[#f0f8f2]",
            compact ? "min-h-10 px-3 text-[11px]" : "min-h-11 px-4 text-[12px]",
          )}
        >
          <Upload className="h-3.5 w-3.5" />
          {files.length > 0 && multiple ? "Add more" : multiple ? "Choose files" : "Choose file"}
        </label>
      </div>
      {files.length === 0 ? (
        <p className="text-[10px] text-[#8a948d]">Selected files remain local to this page preview.</p>
      ) : null}
    </div>
  );
}

function MultiValueChecklistInput({
  label,
  values,
  suggestions = [],
  onChange,
}: {
  label: string;
  values: string[];
  suggestions?: string[];
  onChange: (values: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const listId = useId();

  function addValue() {
    const value = draft.trim().replace(/\s+/g, " ");
    if (!value) return;
    if (!values.some((item) => item.toLocaleLowerCase() === value.toLocaleLowerCase())) {
      onChange([...values, value]);
    }
    setDraft("");
  }

  return (
    <div className="space-y-2">
      <div className="flex min-w-0 flex-wrap gap-2">
        {values.map((value) => (
          <span
            key={value}
            className="inline-flex items-center gap-2 rounded-[10px] bg-[#edf3ee] px-3 py-2 text-[11px] font-[650] text-[#405047]"
          >
            {value}
            <button
              type="button"
              className="text-[#748078] hover:text-[#29352d]"
              aria-label={`Remove ${value}`}
              onClick={() => onChange(values.filter((item) => item !== value))}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex min-w-0 gap-2">
        <Input
          list={listId}
          value={draft}
          className={CONTROL_CLASS}
          placeholder={`Select or enter ${label.toLocaleLowerCase()}`}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addValue();
            }
          }}
        />
        <datalist id={listId}>
          {suggestions.map((suggestion) => (
            <option key={suggestion} value={suggestion} />
          ))}
        </datalist>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="min-h-11 shrink-0 rounded-[11px] shadow-none"
          disabled={!draft.trim()}
          onClick={addValue}
        >
          <Plus className="h-3.5 w-3.5" />
          Add
        </Button>
      </div>
    </div>
  );
}

function ChecklistItemRow({
  item,
  filled,
  children,
  onRequest,
}: {
  item: ChecklistDefinition;
  filled: boolean;
  children: React.ReactNode;
  onRequest: () => void;
}) {
  const Icon = item.icon;

  return (
    <div className="grid gap-4 border-t border-[#e8ede8] px-4 py-5 first:border-t-0 sm:px-5 lg:px-6 xl:grid-cols-[230px_minmax(0,1fr)_86px_108px] xl:items-start xl:gap-5">
      <div className="flex min-w-0 items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-[#eef5ef] text-[#3a7556]">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h3 className="text-[13px] font-[740] text-[#253029]">{item.title}</h3>
          <p className="mt-1 text-[11px] leading-4 text-[#7b857e]">{item.helper}</p>
        </div>
      </div>
      <div className="min-w-0">{children}</div>
      <div className="flex items-center xl:min-h-11">
        <ChecklistStatusBadge filled={filled} />
      </div>
      <div className="flex items-center xl:min-h-11 xl:justify-end">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="min-w-[102px] rounded-[11px] shadow-none"
          onClick={onRequest}
        >
          <Send className="h-3.5 w-3.5" />
          Request
        </Button>
      </div>
    </div>
  );
}

function RequestInformationDialog({
  field,
  participants,
  onClose,
}: {
  field: ChecklistDefinition;
  participants: ParticipantOption[];
  onClose: () => void;
}) {
  const [recipientMode, setRecipientMode] = useState<"existing" | "email">("existing");
  const [participantId, setParticipantId] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const canPrepare =
    recipientMode === "existing" ? Boolean(participantId) : /^\S+@\S+\.\S+$/.test(email.trim());

  function prepareRequest() {
    if (!canPrepare) return;
    onClose();
    showInfoToast(
      "Request prepared.",
      "Request functionality will be connected in the next phase. Nothing was sent.",
    );
  }

  return (
    <div
      className="fixed inset-0 z-[170] flex items-center justify-center bg-[#112118]/40 px-4 py-8 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="request-information-title"
    >
      <Card className="w-full max-w-[560px] rounded-[24px] border-[#dfe6df] shadow-[0_32px_80px_rgba(14,31,20,0.22)]">
        <CardContent className="p-6 sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-[10px] font-[760] uppercase tracking-[0.12em] text-[#4c795e]">
                <Mail className="h-3.5 w-3.5" /> Request information
              </div>
              <h2
                id="request-information-title"
                className="mt-2 text-[22px] font-[760] tracking-[-0.03em] text-[#162019]"
              >
                Request {field.title}
              </h2>
              <p className="mt-1 text-[12px] leading-5 text-[#6f7a72]">
                Prepare who should provide this checklist item and add an optional note.
              </p>
            </div>
            <Button type="button" variant="secondary" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
              <span className="sr-only">Close request dialog</span>
            </Button>
          </div>

          <div className="mt-6 rounded-[14px] border border-[#e1e8e2] bg-[#f7faf7] px-4 py-3">
            <span className="text-[10px] font-[720] uppercase tracking-[0.08em] text-[#818b84]">Field</span>
            <p className="mt-1 text-[13px] font-[700] text-[#28342c]">{field.title}</p>
          </div>

          <fieldset className="mt-5">
            <legend className="text-[12px] font-[700] text-[#2d372f]">Request from</legend>
            <div className="mt-2 inline-flex w-full rounded-[12px] border border-[#dce4dd] bg-[#f4f7f4] p-1 sm:w-auto">
              <button
                type="button"
                className={cn(
                  "flex-1 rounded-[9px] px-4 py-2 text-[11px] font-[700] transition sm:flex-none",
                  recipientMode === "existing"
                    ? "bg-white text-[#276c4a] shadow-sm"
                    : "text-[#69746d]",
                )}
                aria-pressed={recipientMode === "existing"}
                onClick={() => setRecipientMode("existing")}
              >
                Existing collaborator
              </button>
              <button
                type="button"
                className={cn(
                  "flex-1 rounded-[9px] px-4 py-2 text-[11px] font-[700] transition sm:flex-none",
                  recipientMode === "email"
                    ? "bg-white text-[#276c4a] shadow-sm"
                    : "text-[#69746d]",
                )}
                aria-pressed={recipientMode === "email"}
                onClick={() => setRecipientMode("email")}
              >
                Manual email
              </button>
            </div>

            {recipientMode === "existing" ? (
              <select
                value={participantId}
                className={cn(CONTROL_CLASS, "mt-3 w-full px-4 text-[13px] text-[#344038] outline-none")}
                aria-label="Select an existing collaborator"
                onChange={(event) => setParticipantId(event.target.value)}
              >
                <option value="">Select a collaborator</option>
                {participants.map((participant) => (
                  <option key={participant.id} value={participant.id}>
                    {participant.name} — {participant.role}
                  </option>
                ))}
              </select>
            ) : (
              <Input
                type="email"
                value={email}
                className={cn(CONTROL_CLASS, "mt-3")}
                placeholder="name@example.com"
                aria-label="Manual recipient email"
                onChange={(event) => setEmail(event.target.value)}
              />
            )}
          </fieldset>

          <label className="mt-5 block space-y-2">
            <span className="text-[12px] font-[700] text-[#2d372f]">Message (optional)</span>
            <Textarea
              value={message}
              className="min-h-[112px] rounded-[14px] border-[#dfe6df] bg-white shadow-none"
              placeholder={`Please provide the ${field.title.toLocaleLowerCase()} for this project.`}
              onChange={(event) => setMessage(event.target.value)}
            />
          </label>

          <p className="mt-4 rounded-[12px] bg-[#f4f7f4] px-3 py-2 text-[10px] leading-4 text-[#748078]">
            No email or external link will be sent in this UI preview.
          </p>

          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" disabled={!canPrepare} onClick={prepareRequest}>
              <Send className="h-4 w-4" /> Prepare Request
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function StageFiveWorkspace({
  project,
  currentUserId,
}: {
  project: ProjectFlowRecord;
  currentUserId: string;
}) {
  const [textValues, setTextValues] = useState<Partial<Record<ChecklistFieldKey, string>>>({});
  const [files, setFiles] = useState<Partial<Record<ChecklistFieldKey, LocalFileRecord[]>>>({});
  const [multiValues, setMultiValues] = useState<Partial<Record<ChecklistFieldKey, string[]>>>({});
  const [healthWarningIncluded, setHealthWarningIncluded] = useState(false);
  const [requestField, setRequestField] = useState<ChecklistDefinition | null>(null);
  const participantOptions = useMemo(() => getParticipantOptions(project), [project]);

  function updateText(key: ChecklistFieldKey, value: string) {
    setTextValues((current) => ({ ...current, [key]: value }));
  }

  function updateFiles(key: ChecklistFieldKey, value: LocalFileRecord[]) {
    setFiles((current) => ({ ...current, [key]: value }));
  }

  function updateMultiValues(key: ChecklistFieldKey, value: string[]) {
    setMultiValues((current) => ({ ...current, [key]: value }));
  }

  function isFilled(item: ChecklistDefinition) {
    const hasText = Boolean(textValues[item.key]?.trim());
    const hasFiles = Boolean(files[item.key]?.length);
    const hasMultiValues = Boolean(multiValues[item.key]?.length);

    if (item.control === "health-warning") {
      return healthWarningIncluded || hasText || hasFiles;
    }
    if (item.control === "multi-value") return hasMultiValues;
    if (item.control === "finishes") return hasMultiValues || hasFiles;
    if (item.control === "file" || item.control === "multi-file") return hasFiles;
    if (item.control === "text-attachment") return hasText || hasFiles;
    return hasText;
  }

  function renderControl(item: ChecklistDefinition) {
    const value = textValues[item.key] ?? "";
    const selectedFiles = files[item.key] ?? [];
    const values = multiValues[item.key] ?? [];

    if (item.control === "text") {
      return (
        <Input
          value={value}
          className={CONTROL_CLASS}
          placeholder={item.placeholder}
          aria-label={item.title}
          onChange={(event) => updateText(item.key, event.target.value)}
        />
      );
    }

    if (item.control === "textarea") {
      return (
        <Textarea
          value={value}
          className="min-h-[76px] rounded-[12px] border-[#dfe6df] bg-white py-3 shadow-none"
          placeholder={item.placeholder}
          aria-label={item.title}
          onChange={(event) => updateText(item.key, event.target.value)}
        />
      );
    }

    if (item.control === "file" || item.control === "multi-file") {
      return (
        <ChecklistUploadField
          fieldLabel={item.title}
          files={selectedFiles}
          multiple={item.control === "multi-file"}
          onChange={(nextFiles) => updateFiles(item.key, nextFiles)}
        />
      );
    }

    if (item.control === "multi-value") {
      return (
        <MultiValueChecklistInput
          label={item.title}
          values={values}
          suggestions={item.suggestions}
          onChange={(nextValues) => updateMultiValues(item.key, nextValues)}
        />
      );
    }

    if (item.control === "finishes") {
      return (
        <div className="space-y-3">
          <MultiValueChecklistInput
            label={item.title}
            values={values}
            suggestions={item.suggestions}
            onChange={(nextValues) => updateMultiValues(item.key, nextValues)}
          />
          <ChecklistUploadField
            fieldLabel={`${item.title} reference`}
            files={selectedFiles}
            multiple
            compact
            onChange={(nextFiles) => updateFiles(item.key, nextFiles)}
          />
        </div>
      );
    }

    if (item.control === "text-attachment") {
      return (
        <div className="space-y-3">
          <Textarea
            value={value}
            className="min-h-[72px] rounded-[12px] border-[#dfe6df] bg-white py-3 shadow-none"
            placeholder={item.placeholder}
            aria-label={item.title}
            onChange={(event) => updateText(item.key, event.target.value)}
          />
          <ChecklistUploadField
            fieldLabel={`${item.title} reference`}
            files={selectedFiles}
            multiple
            compact
            onChange={(nextFiles) => updateFiles(item.key, nextFiles)}
          />
        </div>
      );
    }

    return (
      <div className="space-y-3">
        <Textarea
          value={value}
          className="min-h-[72px] rounded-[12px] border-[#dfe6df] bg-white py-3 shadow-none"
          placeholder={item.placeholder}
          aria-label={item.title}
          onChange={(event) => updateText(item.key, event.target.value)}
        />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <ChecklistUploadField
            fieldLabel={`${item.title} reference`}
            files={selectedFiles}
            compact
            onChange={(nextFiles) => updateFiles(item.key, nextFiles)}
          />
          <button
            type="button"
            role="switch"
            aria-checked={healthWarningIncluded}
            className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-[11px] border border-[#dfe6df] bg-white px-3 text-[11px] font-[680] text-[#58645c]"
            onClick={() => setHealthWarningIncluded((current) => !current)}
          >
            <span
              className={cn(
                "relative h-5 w-9 rounded-full transition",
                healthWarningIncluded ? "bg-[#39845d]" : "bg-[#d5dcd6]",
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 size-4 rounded-full bg-white shadow-sm transition",
                  healthWarningIncluded ? "left-[18px]" : "left-0.5",
                )}
              />
            </span>
            {healthWarningIncluded ? "Included" : "Not included"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <section className="mx-auto w-full max-w-[1420px] pb-6">
      <ProjectAccessRealtimeGuard projectId={project.id} currentUserId={currentUserId} />
      <Card className="overflow-hidden rounded-[26px] border-[#dfe6df] shadow-[0_20px_54px_rgba(23,39,28,0.055)]">
        <CardContent className="p-0">
          <div className="px-5 py-6 sm:px-7 sm:py-8 lg:px-9">
            <div className="flex items-center gap-2 text-[11px] font-[760] uppercase tracking-[0.13em] text-[#4d765d]">
              <FileCheck2 className="h-4 w-4" /> File Checklist
            </div>
            <h1 className="mt-3 text-[28px] font-[780] tracking-[-0.04em] text-[#111713] sm:text-[34px]">
              Stage 5 - File Checklist
            </h1>
            <p className="mt-2 text-[13px] leading-5 text-[#6f7a72]">
              Complete or request the required project information and files.
            </p>
            <ProjectStageSummary project={project} />
          </div>

          <section className="border-t border-[#e7ece7] bg-[#fbfcfb]" aria-labelledby="file-checklist-heading">
            <div className="px-4 py-5 sm:px-5 lg:px-6">
              <h2 id="file-checklist-heading" className="text-[18px] font-[750] text-[#1b261f]">
                Required information and files
              </h2>
              <p className="mt-1 text-[11px] leading-4 text-[#77827a]">
                Values and selected files are temporary in this UI preview.
              </p>
            </div>
            <div className="hidden border-t border-[#e8ede8] bg-white px-6 py-3 text-[10px] font-[740] uppercase tracking-[0.08em] text-[#7c867f] xl:grid xl:grid-cols-[230px_minmax(0,1fr)_86px_108px] xl:gap-5">
              <span>Field</span>
              <span>Information / Upload</span>
              <span>Status</span>
              <span className="text-right">Action</span>
            </div>
            <div className="bg-white">
              {CHECKLIST_ITEMS.map((item) => (
                <ChecklistItemRow
                  key={item.key}
                  item={item}
                  filled={isFilled(item)}
                  onRequest={() => setRequestField(item)}
                >
                  {renderControl(item)}
                </ChecklistItemRow>
              ))}
            </div>
          </section>

          <div className="flex flex-col-reverse gap-3 border-t border-[#e7ece7] bg-white px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-7 lg:px-9">
            <Button asChild type="button" variant="outline" className="min-w-[160px] rounded-[13px] shadow-none">
              <Link href={`/projects/${project.id}`}>
                <ListChecks className="h-4 w-4" /> All Stages
              </Link>
            </Button>
            <Button asChild type="button" className="min-w-[180px] rounded-[13px]">
              <Link href={`/projects/${project.id}/stages/6`}>
                Next Stage <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {requestField ? (
        <RequestInformationDialog
          key={requestField.key}
          field={requestField}
          participants={participantOptions}
          onClose={() => setRequestField(null)}
        />
      ) : null}
    </section>
  );
}

export function StageFiveLoadingShell() {
  return (
    <section className="mx-auto w-full max-w-[1420px] pb-6">
      <Card className="overflow-hidden rounded-[26px] border-[#dfe6df] shadow-none">
        <CardContent className="p-0">
          <div className="p-7 lg:p-9">
            <Skeleton className="h-4 w-32 rounded-full" />
            <Skeleton className="mt-4 h-10 w-full max-w-[460px] rounded-[12px]" />
            <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }, (_, index) => (
                <Skeleton key={index} className="h-[82px] rounded-[16px]" />
              ))}
            </div>
          </div>
          <div className="border-t border-[#e7ece7] bg-[#fbfcfb] p-6">
            <div className="space-y-3">
              {Array.from({ length: 7 }, (_, index) => (
                <Skeleton key={index} className="h-[82px] rounded-[16px]" />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
