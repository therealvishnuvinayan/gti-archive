"use client";

/* eslint-disable @next/next/no-img-element */

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import {
  ProductionApprovalRecipientType,
  ProductionSampleCriterion,
  ProductionSampleDecision,
  ProductionSampleRoundStatus,
  ProductionSampleRoundType,
  ProductionSupervisionStatus,
} from "@prisma/client";
import {
  AlertTriangle,
  Boxes,
  CalendarClock,
  Check,
  CheckCircle2,
  CircleDot,
  Clock3,
  FileImage,
  FileStack,
  Info,
  Mail,
  PackageCheck,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
  Upload,
  Video,
  X,
} from "lucide-react";

import {
  addProductionSampleEvidenceAction,
  addProductionSampleParticipantAction,
  closeStageSevenProjectAction,
  completeProductionSampleMilestoneAction,
  completeProductionSampleRoundAction,
  createProductionSampleRoundAction,
  getStageSevenFeedbackDraftAction,
  removeProductionSampleEvidenceAction,
  removeProductionSampleParticipantAction,
  sendStageSevenFeedbackAction,
  signOffProductionUnitAction,
  updateProductionSampleEvaluationAction,
  updateProductionSampleRoundDecisionAction,
} from "@/app/(dashboard)/projects/[slug]/stages/7/actions";
import { ProjectAccessRealtimeGuard } from "@/components/projects/project-access-realtime-guard";
import { ProjectStageSummary } from "@/components/projects/project-stage-summary";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import type { ProjectStageShellRecord } from "@/lib/projects";
import type {
  StageSevenMilestone,
  StageSevenWorkspaceData,
} from "@/lib/stage-seven";
import { uploadStageSevenEvidence } from "@/lib/stage-seven-upload-client";
import { showErrorToast, showSuccessToast } from "@/lib/toast";
import { cn } from "@/lib/utils";

type Unit = StageSevenWorkspaceData["units"][number];
type Round = Unit["rounds"][number];

const CRITERION_LABELS: Record<ProductionSampleCriterion, string> = {
  MATERIAL_QUALITY: "Material Quality",
  GRAPHIC_REPRODUCTION: "Graphic Reproduction",
  SIZE: "Size",
  CONSTRUCTION: "Construction",
  GRAPHIC_ELEMENTS: "Graphic Elements",
  FUNCTIONALITY: "Functionality",
  FINISHES: "Finishes",
};

const ROUND_TYPE_LABELS: Record<ProductionSampleRoundType, string> = {
  PRE_PRODUCTION_SAMPLE: "Pre-Production Sample",
  PRODUCTION_SAMPLE: "Production Sample",
  FINAL_MASS_PRODUCTION_SIGN_OFF: "Final Mass-Production Sign-off",
  CUSTOM: "Custom",
};

const MILESTONE_LABELS: Record<
  StageSevenMilestone,
  { label: string; action: string; complete: string }
> = {
  SUBMISSION: { label: "Submission", action: "Mark Submitted", complete: "Submitted" },
  REVIEW: { label: "Review", action: "Mark Reviewed", complete: "Reviewed" },
  REVISION_SIGNOFF: {
    label: "Revision / Sign-off",
    action: "Mark Sign-off Complete",
    complete: "Sign-off complete",
  },
  DELIVERY: { label: "Delivery", action: "Mark Delivered", complete: "Delivered" },
};

const UNIT_STATUS_STYLES: Record<ProductionSupervisionStatus, string> = {
  NOT_STARTED: "border-[#dfe5df] bg-[#f5f7f5] text-[#68736b]",
  IN_REVIEW: "border-[#cfe2d4] bg-[#eaf5ed] text-[#2f7751]",
  REVISIONS_NEEDED: "border-[#f1dcb7] bg-[#fff5e5] text-[#a46818]",
  SIGNED_OFF: "border-[#cfe2d4] bg-[#e8f5ec] text-[#256b46]",
};

const ROUND_STATUS_STYLES: Record<ProductionSampleRoundStatus, string> = {
  PENDING: "border-[#d9e6f7] bg-[#edf5ff] text-[#3c6da8]",
  UNDER_REVIEW: "border-[#cfe2d4] bg-[#eaf5ed] text-[#2f7751]",
  COMPLETED: "border-[#d8e2f4] bg-[#edf3ff] text-[#476da9]",
};

const DECISION_STYLES: Record<ProductionSampleDecision, string> = {
  PASS: "border-[#cde3d3] bg-[#e9f6ed] text-[#257049]",
  FAIL: "border-[#f2cbc6] bg-[#fff0ee] text-[#b44338]",
  CONDITIONAL: "border-[#f1dbb2] bg-[#fff4df] text-[#a66613]",
};

function labelEnum(value: string) {
  return value
    .toLocaleLowerCase("en-US")
    .split("_")
    .map((part) => part.charAt(0).toLocaleUpperCase("en-US") + part.slice(1))
    .join(" ");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase("en-US"))
    .join("");
}

function UnitStatusBadge({ status }: { status: ProductionSupervisionStatus }) {
  return (
    <span
      className={cn(
        "inline-flex w-fit rounded-full border px-2.5 py-1 text-[9px] font-[780] tracking-[0.03em]",
        UNIT_STATUS_STYLES[status],
      )}
    >
      {labelEnum(status)}
    </span>
  );
}

function RoundStatusBadge({ status }: { status: ProductionSampleRoundStatus }) {
  return (
    <span
      className={cn(
        "inline-flex w-fit rounded-full border px-2.5 py-1 text-[9px] font-[780] tracking-[0.03em]",
        ROUND_STATUS_STYLES[status],
      )}
    >
      {labelEnum(status)}
    </span>
  );
}

function DecisionBadge({ decision }: { decision: ProductionSampleDecision | null }) {
  return decision ? (
    <span
      className={cn(
        "inline-flex w-fit rounded-full border px-2.5 py-1 text-[9px] font-[780]",
        DECISION_STYLES[decision],
      )}
    >
      {labelEnum(decision)}
    </span>
  ) : (
    <span className="inline-flex rounded-full border border-[#dce4ec] bg-[#f3f6f9] px-2.5 py-1 text-[9px] font-[780] text-[#66727d]">
      Pending
    </span>
  );
}

function ModalShell({
  title,
  eyebrow,
  children,
  onClose,
  maxWidth = "max-w-[680px]",
}: {
  title: string;
  eyebrow: string;
  children: React.ReactNode;
  onClose: () => void;
  maxWidth?: string;
}) {
  return (
    <div
      className="fixed inset-0 z-[170] flex items-start justify-center overflow-y-auto bg-[#112118]/45 px-4 py-6 backdrop-blur-[2px] sm:items-center"
      role="dialog"
      aria-modal="true"
    >
      <Card className={cn("w-full rounded-[24px] border-[#dfe6df] shadow-[0_32px_80px_rgba(14,31,20,.22)]", maxWidth)}>
        <CardContent className="p-6 sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-[760] uppercase tracking-[.12em] text-[#4c795e]">{eyebrow}</p>
              <h2 className="mt-2 text-[22px] font-[760] text-[#162019]">{title}</h2>
            </div>
            <Button type="button" variant="secondary" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          {children}
        </CardContent>
      </Card>
    </div>
  );
}

function NewRoundDialog({
  projectId,
  unit,
  onClose,
  onCreated,
}: {
  projectId: string;
  unit: Unit;
  onClose: () => void;
  onCreated: (roundId: string) => void;
}) {
  const [pending, startPending] = useTransition();
  const requestId = useRef(crypto.randomUUID());
  const [type, setType] = useState<ProductionSampleRoundType>(
    ProductionSampleRoundType.PRE_PRODUCTION_SAMPLE,
  );
  const [customTypeName, setCustomTypeName] = useState("");
  const [submissionDueAt, setSubmissionDueAt] = useState("");
  const [reviewDueAt, setReviewDueAt] = useState("");
  const [revisionSignoffDueAt, setRevisionSignoffDueAt] = useState("");
  const [deliveryDueAt, setDeliveryDueAt] = useState("");
  const [initialNotes, setInitialNotes] = useState("");

  const ready =
    submissionDueAt &&
    reviewDueAt &&
    revisionSignoffDueAt &&
    deliveryDueAt &&
    (type !== ProductionSampleRoundType.CUSTOM || customTypeName.trim());

  function create() {
    if (!ready || pending) return;
    startPending(async () => {
      const result = await createProductionSampleRoundAction({
        projectId,
        productionUnitId: unit.id,
        clientRequestId: requestId.current,
        type,
        customTypeName,
        initialNotes,
        submissionDueAt: new Date(submissionDueAt).toISOString(),
        reviewDueAt: new Date(reviewDueAt).toISOString(),
        revisionSignoffDueAt: new Date(revisionSignoffDueAt).toISOString(),
        deliveryDueAt: new Date(deliveryDueAt).toISOString(),
      });
      if ("error" in result) {
        showErrorToast("Unable to create sample round.", result.error);
        return;
      }
      showSuccessToast("Sample round created.");
      onCreated(result.id);
      onClose();
    });
  }

  return (
    <ModalShell title="New Sample Round" eyebrow={unit.name} onClose={onClose}>
      <label className="mt-6 block space-y-2">
        <span className="text-[12px] font-[720] text-[#2d372f]">Sample Type</span>
        <Select value={type} onValueChange={(value) => setType(value as ProductionSampleRoundType)}>
          <SelectTrigger className="rounded-[12px] border-[#dfe6df] bg-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="z-[190]">
            {Object.values(ProductionSampleRoundType).map((value) => (
              <SelectItem key={value} value={value}>{ROUND_TYPE_LABELS[value]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      {type === ProductionSampleRoundType.CUSTOM ? (
        <label className="mt-4 block space-y-2">
          <span className="text-[12px] font-[720] text-[#2d372f]">Custom round name</span>
          <Input value={customTypeName} maxLength={120} onChange={(event) => setCustomTypeName(event.target.value)} />
        </label>
      ) : null}
      <fieldset className="mt-5">
        <legend className="text-[12px] font-[720] text-[#2d372f]">Deadlines</legend>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {[
            ["Submission", submissionDueAt, setSubmissionDueAt],
            ["Review", reviewDueAt, setReviewDueAt],
            ["Revision / Sign-off", revisionSignoffDueAt, setRevisionSignoffDueAt],
            ["Delivery", deliveryDueAt, setDeliveryDueAt],
          ].map(([label, value, setter]) => (
            <label key={label as string} className="space-y-1.5">
              <span className="text-[10px] font-[680] text-[#657168]">{label as string}</span>
              <Input
                type="datetime-local"
                value={value as string}
                onChange={(event) => (setter as (value: string) => void)(event.target.value)}
              />
            </label>
          ))}
        </div>
      </fieldset>
      <label className="mt-5 block space-y-2">
        <span className="text-[12px] font-[720] text-[#2d372f]">Initial Notes (optional)</span>
        <Textarea value={initialNotes} maxLength={8000} onChange={(event) => setInitialNotes(event.target.value)} />
      </label>
      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" disabled={pending} onClick={onClose}>Cancel</Button>
        <Button type="button" disabled={!ready || pending} onClick={create}>
          <Plus className="h-4 w-4" /> {pending ? "Creating..." : "Create Sample Round"}
        </Button>
      </div>
    </ModalShell>
  );
}

function ParticipantsDialog({
  projectId,
  unit,
  round,
  participants,
  onClose,
  onSaved,
}: {
  projectId: string;
  unit: Unit;
  round: Round;
  participants: StageSevenWorkspaceData["participants"];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [pending, startPending] = useTransition();
  const assignedIds = new Set(round.participants.map((participant) => participant.id));
  const [participantUserId, setParticipantUserId] = useState(
    participants.find((participant) => !assignedIds.has(participant.id))?.id ?? "",
  );

  function add() {
    if (!participantUserId || pending) return;
    startPending(async () => {
      const result = await addProductionSampleParticipantAction({
        projectId,
        productionUnitId: unit.id,
        sampleRoundId: round.id,
        participantUserId,
      });
      if ("error" in result) {
        showErrorToast("Unable to add participant.", result.error);
        return;
      }
      showSuccessToast("Review participant added.");
      onSaved();
      onClose();
    });
  }

  return (
    <ModalShell title="Participants in Review" eyebrow={`Round ${round.sequence}`} onClose={onClose} maxWidth="max-w-[560px]">
      <div className="mt-6 space-y-3">
        {round.participants.length ? round.participants.map((participant) => (
          <div key={participant.id} className="flex items-center gap-3 rounded-[13px] border border-[#e0e6e0] bg-[#fafbfa] p-3">
            <span className="grid size-8 place-items-center rounded-full bg-[#e4f1e7] text-[9px] font-[780] text-[#2f7350]">{initials(participant.name)}</span>
            <div className="min-w-0 flex-1"><p className="truncate text-[11px] font-[720]">{participant.name}</p><p className="truncate text-[9px] text-[#7a867d]">{participant.role}</p></div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Remove ${participant.name}`}
              disabled={pending}
              onClick={() => startPending(async () => {
                const result = await removeProductionSampleParticipantAction({
                  projectId,
                  productionUnitId: unit.id,
                  sampleRoundId: round.id,
                  participantUserId: participant.id,
                });
                if ("error" in result) {
                  showErrorToast("Unable to remove participant.", result.error);
                  return;
                }
                showSuccessToast("Review participant removed.");
                onSaved();
                onClose();
              })}
            ><Trash2 className="h-4 w-4 text-[#aa4e45]" /></Button>
          </div>
        )) : <p className="text-[11px] text-[#7c867f]">No review participants selected.</p>}
      </div>
      <div className="mt-5 flex gap-3">
        <Select value={participantUserId} onValueChange={setParticipantUserId}>
          <SelectTrigger className="flex-1 rounded-[12px] border-[#dfe6df]"><SelectValue placeholder="Select project participant" /></SelectTrigger>
          <SelectContent className="z-[190]">
            {participants.filter((participant) => !assignedIds.has(participant.id)).map((participant) => (
              <SelectItem key={participant.id} value={participant.id}>{participant.name} — {participant.role}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="button" disabled={!participantUserId || pending} onClick={add}><Plus className="h-4 w-4" /> Add</Button>
      </div>
    </ModalShell>
  );
}

function EvidenceDialog({
  projectId,
  unit,
  round,
  onClose,
  onSaved,
}: {
  projectId: string;
  unit: Unit;
  round: Round;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [pending, startPending] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [criterion, setCriterion] = useState("GENERAL");
  const [progress, setProgress] = useState(0);

  function upload() {
    if (!files.length || pending) return;
    startPending(async () => {
      let uploaded = 0;
      const failures: string[] = [];
      for (const [index, file] of files.entries()) {
        try {
          const attachment = await uploadStageSevenEvidence(projectId, file, (fileProgress) => {
            setProgress(Math.round(((index + fileProgress / 100) / files.length) * 100));
          });
          const result = await addProductionSampleEvidenceAction({
            projectId,
            productionUnitId: unit.id,
            sampleRoundId: round.id,
            attachmentId: attachment.id,
            criterion: criterion === "GENERAL" ? null : criterion as ProductionSampleCriterion,
          });
          if ("error" in result) throw new Error(result.error);
          uploaded += 1;
        } catch (error) {
          failures.push(`${file.name}: ${error instanceof Error ? error.message : "Upload failed."}`);
        }
      }
      if (uploaded) {
        showSuccessToast(`${uploaded} evidence ${uploaded === 1 ? "file" : "files"} added.`);
        onSaved();
      }
      if (failures.length) {
        showErrorToast("Some evidence files were not added.", failures.join(" "));
        setFiles(files.filter((file) => failures.some((failure) => failure.startsWith(`${file.name}:`))));
        setProgress(0);
        return;
      }
      onClose();
    });
  }

  return (
    <ModalShell title="Add Evidence" eyebrow={`Round ${round.sequence}`} onClose={onClose} maxWidth="max-w-[600px]">
      <label className="mt-6 block space-y-2">
        <span className="text-[12px] font-[720] text-[#2d372f]">Related To</span>
        <Select value={criterion} onValueChange={setCriterion}>
          <SelectTrigger className="rounded-[12px] border-[#dfe6df]"><SelectValue /></SelectTrigger>
          <SelectContent className="z-[190]">
            <SelectItem value="GENERAL">General Round Evidence</SelectItem>
            {Object.values(ProductionSampleCriterion).map((value) => (
              <SelectItem key={value} value={value}>{CRITERION_LABELS[value]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*,video/*"
        className="hidden"
        onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
      />
      <button
        type="button"
        className="mt-5 flex min-h-28 w-full flex-col items-center justify-center rounded-[15px] border border-dashed border-[#a9c6b2] bg-[#f7fbf8] text-[#397454]"
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="h-5 w-5" />
        <span className="mt-2 text-[11px] font-[720]">Choose photos or videos</span>
        <span className="mt-1 text-[9px] text-[#758179]">Multiple files are supported.</span>
      </button>
      {files.length ? <div className="mt-3 space-y-1 text-[10px] text-[#59665e]">{files.map((file) => <p key={`${file.name}-${file.size}`} className="truncate">{file.name}</p>)}</div> : null}
      {pending ? (
        <div className="mt-4">
          <div className="h-2 overflow-hidden rounded-full bg-[#e8eee9]"><div className="h-full bg-[#32815a] transition-all" style={{ width: `${progress}%` }} /></div>
          <p className="mt-1 text-right text-[9px] font-[700] text-[#4c765d]">{progress}%</p>
        </div>
      ) : null}
      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" disabled={pending} onClick={onClose}>Cancel</Button>
        <Button type="button" disabled={!files.length || pending} onClick={upload}>{pending ? "Uploading..." : "Add Evidence"}</Button>
      </div>
    </ModalShell>
  );
}

function FeedbackDialog({
  projectId,
  unit,
  round,
  participants,
  onClose,
  onSaved,
}: {
  projectId: string;
  unit: Unit;
  round: Round;
  participants: StageSevenWorkspaceData["participants"];
  onClose: () => void;
  onSaved: () => void;
}) {
  const requestId = useRef(crypto.randomUUID());
  const [pending, startPending] = useTransition();
  const [recipientType, setRecipientType] = useState<ProductionApprovalRecipientType>(ProductionApprovalRecipientType.EXISTING_COLLABORATOR);
  const [recipientUserId, setRecipientUserId] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [selectedEvidenceIds, setSelectedEvidenceIds] = useState(round.evidence.map((item) => item.id));
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [draftLoaded, setDraftLoaded] = useState(false);

  function generate() {
    startPending(async () => {
      const result = await getStageSevenFeedbackDraftAction({
        projectId,
        productionUnitId: unit.id,
        sampleRoundId: round.id,
        selectedEvidenceIds,
      });
      if ("error" in result) {
        showErrorToast("Unable to generate feedback.", result.error);
        return;
      }
      setSubject(result.subject);
      setMessage(result.text);
      if (result.suggestedRecipient) {
        setRecipientType(ProductionApprovalRecipientType.EXTERNAL_EMAIL);
        setRecipientName(result.suggestedRecipient.name);
        setRecipientEmail(result.suggestedRecipient.email);
      }
      setDraftLoaded(true);
    });
  }

  function send() {
    if (!draftLoaded || pending) return;
    startPending(async () => {
      const result = await sendStageSevenFeedbackAction({
        projectId,
        productionUnitId: unit.id,
        sampleRoundId: round.id,
        clientRequestId: requestId.current,
        recipientType,
        ...(recipientType === ProductionApprovalRecipientType.EXISTING_COLLABORATOR
          ? { recipientUserId }
          : { recipientName, recipientEmail }),
        selectedEvidenceIds,
        subject,
        message,
      });
      if ("error" in result) {
        showErrorToast("Unable to send feedback.", result.error);
        return;
      }
      showSuccessToast(result.duplicate ? "Feedback was already sent." : "Feedback email sent.");
      onSaved();
      onClose();
    });
  }

  const recipientReady = recipientType === ProductionApprovalRecipientType.EXISTING_COLLABORATOR
    ? Boolean(recipientUserId)
    : Boolean(recipientName.trim() && /^\S+@\S+\.\S+$/.test(recipientEmail));

  return (
    <ModalShell title="Generate Feedback Email" eyebrow={`${unit.name} · Round ${round.sequence}`} onClose={onClose} maxWidth="max-w-[780px]">
      <div className="mt-6 flex flex-wrap gap-3">
        {[
          [ProductionApprovalRecipientType.EXISTING_COLLABORATOR, "Existing Project User"],
          [ProductionApprovalRecipientType.EXTERNAL_EMAIL, "External Email"],
        ].map(([value, label]) => (
          <label key={value} className="flex items-center gap-2 rounded-[11px] border border-[#dfe6df] px-3 py-2 text-[11px] font-[650]">
            <input type="radio" checked={recipientType === value} onChange={() => setRecipientType(value as ProductionApprovalRecipientType)} /> {label}
          </label>
        ))}
      </div>
      {recipientType === ProductionApprovalRecipientType.EXISTING_COLLABORATOR ? (
        <Select value={recipientUserId} onValueChange={setRecipientUserId}>
          <SelectTrigger className="mt-3 rounded-[12px] border-[#dfe6df]"><SelectValue placeholder="Select recipient" /></SelectTrigger>
          <SelectContent className="z-[190]">{participants.map((participant) => <SelectItem key={participant.id} value={participant.id}>{participant.name} — {participant.role}</SelectItem>)}</SelectContent>
        </Select>
      ) : (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Input value={recipientName} placeholder="Recipient name" onChange={(event) => setRecipientName(event.target.value)} />
          <Input type="email" value={recipientEmail} placeholder="recipient@example.com" onChange={(event) => setRecipientEmail(event.target.value)} />
        </div>
      )}
      {round.evidence.length ? (
        <fieldset className="mt-5 rounded-[14px] border border-[#e1e8e2] bg-[#fafcfa] p-4">
          <legend className="px-1 text-[11px] font-[720]">Evidence links</legend>
          <div className="grid gap-2 sm:grid-cols-2">{round.evidence.map((item) => <label key={item.id} className="flex min-w-0 items-center gap-2 text-[10px]"><input type="checkbox" checked={selectedEvidenceIds.includes(item.id)} onChange={() => setSelectedEvidenceIds((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id])} /><span className="truncate">{item.name}</span></label>)}</div>
        </fieldset>
      ) : null}
      {!draftLoaded ? (
        <div className="mt-6"><Button type="button" disabled={pending} onClick={generate}><Mail className="h-4 w-4" /> {pending ? "Generating..." : "Generate Preview"}</Button></div>
      ) : (
        <div className="mt-5 space-y-4">
          <label className="block space-y-2"><span className="text-[12px] font-[720]">Subject</span><Input value={subject} maxLength={300} onChange={(event) => setSubject(event.target.value)} /></label>
          <label className="block space-y-2"><span className="text-[12px] font-[720]">Message</span><Textarea value={message} maxLength={20000} className="min-h-[280px] font-mono text-[10px] leading-4" onChange={(event) => setMessage(event.target.value)} /></label>
          <p className="text-[9px] leading-4 text-[#748078]">Selected evidence is shared through time-limited secure links, never permanent public storage URLs.</p>
        </div>
      )}
      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" disabled={pending} onClick={onClose}>Cancel</Button>
        {draftLoaded ? <Button type="button" disabled={!recipientReady || !subject.trim() || !message.trim() || pending} onClick={send}><Mail className="h-4 w-4" /> {pending ? "Sending..." : "Send Feedback"}</Button> : null}
      </div>
    </ModalShell>
  );
}

function ProductionUnitSwitcher({
  units,
  selectedUnitId,
  onSelect,
}: {
  units: Unit[];
  selectedUnitId: string;
  onSelect: (unitId: string) => void;
}) {
  return (
    <section aria-labelledby="stage-seven-units-heading">
      <div className="mb-3 flex items-center gap-2">
        <h2 id="stage-seven-units-heading" className="text-[11px] font-[780] uppercase tracking-[0.11em] text-[#657168]">Production Units</h2>
        <Info className="h-3.5 w-3.5 text-[#96a098]" aria-label="Each Production Unit is supervised independently." />
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1 lg:grid lg:grid-cols-4 lg:overflow-visible">
        {units.map((unit) => {
          const selected = unit.id === selectedUnitId;
          return (
            <button
              key={unit.id}
              type="button"
              aria-pressed={selected}
              className={cn(
                "flex min-w-[220px] items-center gap-3 rounded-[16px] border bg-white p-3 text-left shadow-[0_8px_22px_rgba(23,39,28,0.035)] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4b9068]/40 lg:min-w-0",
                selected ? "border-[#70a383] bg-[#f3faf5] shadow-[0_12px_26px_rgba(42,112,73,0.09)]" : "border-[#dfe6df] hover:border-[#b7cbbd] hover:bg-[#fbfdfb]",
              )}
              onClick={() => onSelect(unit.id)}
            >
              <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-[12px] bg-[#edf5ef] text-[#347455]">
                {unit.sourceMimeType.startsWith("image/") ? (
                  <img src={`/api/project-assets/${unit.sourceAttachmentId}/preview`} alt="" className="h-full w-full object-cover" />
                ) : <FileImage className="h-5 w-5" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] font-[740] text-[#253028]" title={unit.name}>{unit.name}</span>
                <span className="mt-1.5 block"><UnitStatusBadge status={unit.status} /></span>
              </span>
              {selected ? <CheckCircle2 className="h-4 w-4 shrink-0 text-[#2f8057]" /> : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function StageSevenSummary({ data }: { data: StageSevenWorkspaceData }) {
  const metrics = [
    { label: "Production Units", value: data.summary.totalUnits, icon: Boxes, tone: "bg-[#edf5ef] text-[#347153]" },
    { label: "Active Sample Rounds", value: data.summary.activeRounds, icon: Clock3, tone: "bg-[#edf5ef] text-[#347153]" },
    { label: "Overdue Deadlines", value: data.summary.overdueMilestones, icon: CalendarClock, tone: "bg-[#fff0ee] text-[#b9473d]" },
    { label: "Signed Off", value: data.summary.signedOffUnits, icon: CheckCircle2, tone: "bg-[#edf3ff] text-[#486fa7]" },
  ];
  return (
    <section aria-label="Stage 7 status summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map(({ label, value, icon: Icon, tone }) => (
        <article key={label} className="flex items-center gap-3 rounded-[15px] border border-[#e0e7e0] bg-white px-4 py-3 shadow-[0_8px_22px_rgba(23,39,28,0.03)]">
          <span className={cn("grid size-9 shrink-0 place-items-center rounded-[11px]", tone)}><Icon className="h-4 w-4" /></span>
          <span><strong className="block text-[19px] font-[780] leading-none text-[#1d2821]">{value}</strong><span className="mt-1 block text-[10px] font-[650] text-[#748078]">{label}</span></span>
        </article>
      ))}
    </section>
  );
}

function DeadlineTimeline({ round }: { round: Round }) {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-2">
      {round.deadlines.map((deadline) => (
        <div key={deadline.milestone} className="min-w-0">
          <p className="truncate text-[8px] font-[760] uppercase tracking-[0.06em] text-[#879188]">{MILESTONE_LABELS[deadline.milestone].label}</p>
          <p className="mt-0.5 truncate text-[10px] font-[680] text-[#39443c]">{formatDate(deadline.dueAt)}</p>
          {deadline.overdue ? <p className="mt-0.5 text-[9px] font-[620] text-[#c04b40]">Overdue</p> : deadline.completedAt ? <p className="mt-0.5 text-[9px] font-[620] text-[#347153]">Completed</p> : null}
        </div>
      ))}
    </div>
  );
}

function SampleRoundsList({
  unit,
  selectedRoundId,
  mutable,
  onSelectRound,
  onCreateRound,
}: {
  unit: Unit;
  selectedRoundId: string | null;
  mutable: boolean;
  onSelectRound: (roundId: string) => void;
  onCreateRound: () => void;
}) {
  return (
    <section className="min-w-0 rounded-[18px] border border-[#dfe6df] bg-white shadow-[0_10px_28px_rgba(23,39,28,0.035)]" aria-labelledby="sample-rounds-heading">
      <div className="flex flex-col gap-3 border-b border-[#e6ebe6] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div><h2 id="sample-rounds-heading" className="text-[15px] font-[760] text-[#1f2a22]">Sample Rounds — {unit.name}</h2><p className="mt-1 text-[10px] text-[#7c867f]">Rounds may repeat until the Production Unit is ready for final sign-off.</p></div>
        {mutable ? <Button type="button" size="sm" className="self-start rounded-[11px]" onClick={onCreateRound}><Plus className="h-3.5 w-3.5" /> New Sample Round</Button> : null}
      </div>
      {unit.rounds.length ? (
        <div>
          <div className="hidden grid-cols-[minmax(120px,1fr)_minmax(150px,1.3fr)_72px_100px_48px] gap-3 border-b border-[#edf0ed] bg-[#fafbfa] px-4 py-2.5 text-[8px] font-[760] uppercase tracking-[0.065em] text-[#7d8780] lg:grid lg:px-5"><span>Round / Type</span><span>Timeline</span><span>Decision</span><span>Status</span><span className="text-right">Action</span></div>
          <div className="divide-y divide-[#e9ede9]">
            {unit.rounds.map((round) => {
              const selected = round.id === selectedRoundId;
              return (
                <article key={round.id} className={cn("grid gap-4 px-4 py-4 transition lg:grid-cols-[minmax(120px,1fr)_minmax(150px,1.3fr)_72px_100px_48px] lg:items-center lg:gap-3 lg:px-5", selected ? "bg-[#f4faf5]" : "hover:bg-[#fbfcfb]")}>
                  <div className="flex min-w-0 items-start gap-3"><span className={cn("grid size-8 shrink-0 place-items-center rounded-full border text-[11px] font-[780]", selected ? "border-[#86b395] bg-[#e7f4ea] text-[#2d744d]" : "border-[#dce4dd] bg-[#f7f9f7] text-[#68746b]")}>{round.sequence}</span><div className="min-w-0"><p className="text-[9px] font-[760] uppercase tracking-[0.06em] text-[#849087]">Round {round.sequence}</p><h3 className="mt-1 text-[11px] font-[700] leading-4 text-[#29342c]">{round.type === ProductionSampleRoundType.CUSTOM ? round.customTypeName : ROUND_TYPE_LABELS[round.type]}</h3></div></div>
                  <DeadlineTimeline round={round} />
                  <div><span className="mb-1 block text-[8px] font-[760] uppercase text-[#8a948d] lg:hidden">Decision</span><DecisionBadge decision={round.overallDecision} /></div>
                  <div><span className="mb-1 block text-[8px] font-[760] uppercase text-[#8a948d] lg:hidden">Status</span><RoundStatusBadge status={round.status} /></div>
                  <Button type="button" size="sm" variant={selected ? "secondary" : "ghost"} className="min-h-8 justify-self-start rounded-[10px] px-3 text-[10px] lg:justify-self-end" onClick={() => onSelectRound(round.id)}>{selected ? "Selected" : "View"}</Button>
                </article>
              );
            })}
          </div>
          <p className="border-t border-[#edf0ed] px-5 py-3 text-center text-[9px] text-[#8a948d]">Showing {unit.rounds.length} sample {unit.rounds.length === 1 ? "round" : "rounds"}</p>
        </div>
      ) : (
        <div className="grid min-h-[250px] place-items-center px-6 py-12 text-center"><div><CircleDot className="mx-auto h-8 w-8 text-[#aab3ac]" /><h3 className="mt-3 text-[13px] font-[720] text-[#344038]">No sample rounds yet.</h3><p className="mt-1 text-[10px] text-[#849087]">Create the first round when supervision begins for {unit.name}.</p></div></div>
      )}
    </section>
  );
}

function SampleRoundDetails({
  projectId,
  unit,
  round,
  data,
  mutable,
  onRefresh,
  onOpenParticipants,
  onOpenEvidence,
  onOpenFeedback,
  onCompleteRound,
}: {
  projectId: string;
  unit: Unit;
  round: Round | null;
  data: StageSevenWorkspaceData;
  mutable: boolean;
  onRefresh: () => void;
  onOpenParticipants: () => void;
  onOpenEvidence: () => void;
  onOpenFeedback: () => void;
  onCompleteRound: () => void;
}) {
  const [pending, startPending] = useTransition();
  const [decision, setDecision] = useState<ProductionSampleDecision | null>(round?.overallDecision ?? null);
  const [notes, setNotes] = useState(round?.overallNotes ?? "");
  const [evaluations, setEvaluations] = useState(() => new Map(round?.evaluations.map((item) => [item.criterion, { decision: item.decision, comment: item.comment ?? "" }]) ?? []));

  if (!round) {
    return (
      <aside className="grid min-h-[350px] place-items-center rounded-[18px] border border-[#dfe6df] bg-white px-6 py-12 text-center shadow-[0_10px_28px_rgba(23,39,28,0.035)]"><div><FileStack className="mx-auto h-9 w-9 text-[#a8b1aa]" /><h2 className="mt-3 text-[14px] font-[740] text-[#303b33]">No round selected</h2><p className="mt-1 max-w-[300px] text-[10px] leading-4 text-[#849087]">Create a Sample Round for {unit.name} to see milestones, evaluation criteria, participants, and evidence here.</p></div></aside>
    );
  }

  const editable = mutable && round.status !== ProductionSampleRoundStatus.COMPLETED;
  const roundId = round.id;
  const roundEvaluations = round.evaluations;

  function saveProgress() {
    if (!editable || pending) return;
    startPending(async () => {
      const results = await Promise.all([
        updateProductionSampleRoundDecisionAction({
          projectId,
          productionUnitId: unit.id,
          sampleRoundId: roundId,
          decision,
          notes,
        }),
        ...roundEvaluations.map((evaluation) => {
          const value = evaluations.get(evaluation.criterion) ?? evaluation;
          return updateProductionSampleEvaluationAction({
            projectId,
            productionUnitId: unit.id,
            sampleRoundId: roundId,
            criterion: evaluation.criterion,
            decision: value.decision,
            comment: value.comment,
          });
        }),
      ]);
      const failure = results.find((result) => "error" in result);
      if (failure && "error" in failure) {
        showErrorToast("Unable to save review progress.", failure.error);
        return;
      }
      showSuccessToast("Review progress saved.");
      onRefresh();
    });
  }

  function completeMilestone(milestone: StageSevenMilestone) {
    startPending(async () => {
      const result = await completeProductionSampleMilestoneAction({
        projectId,
        productionUnitId: unit.id,
        sampleRoundId: roundId,
        milestone,
      });
      if ("error" in result) {
        showErrorToast("Unable to update milestone.", result.error);
        return;
      }
      showSuccessToast(`${MILESTONE_LABELS[milestone].complete}.`);
      onRefresh();
    });
  }

  function removeEvidence(evidenceId: string) {
    startPending(async () => {
      const result = await removeProductionSampleEvidenceAction({
        projectId,
        productionUnitId: unit.id,
        sampleRoundId: roundId,
        evidenceId,
      });
      if ("error" in result) {
        showErrorToast("Unable to remove evidence.", result.error);
        return;
      }
      showSuccessToast("Evidence removed from the sample round.");
      onRefresh();
    });
  }

  return (
    <aside className="min-w-0 rounded-[18px] border border-[#dfe6df] bg-white shadow-[0_10px_28px_rgba(23,39,28,0.035)]" aria-labelledby="selected-round-heading">
      <div className="border-b border-[#e5ebe5] px-4 py-4 sm:px-5">
        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-[9px] font-[760] uppercase tracking-[0.08em] text-[#7d8780]">Selected Round Details</p><h2 id="selected-round-heading" className="mt-1.5 text-[15px] font-[760] leading-5 text-[#1f2a22]">{round.type === ProductionSampleRoundType.CUSTOM ? round.customTypeName : ROUND_TYPE_LABELS[round.type]} – Round {round.sequence}</h2></div><RoundStatusBadge status={round.status} /></div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          {round.deadlines.map((deadline, index) => {
            const milestone = MILESTONE_LABELS[deadline.milestone];
            const previousComplete = index === 0 || Boolean(round.deadlines[index - 1]?.completedAt);
            return (
              <div key={deadline.milestone} className={cn("rounded-[11px] border px-3 py-2.5", deadline.overdue ? "border-[#efcbc5] bg-[#fff6f4]" : "border-[#e2e8e2] bg-[#fafcfa]")}>
                <p className="text-[8px] font-[760] uppercase tracking-[0.06em] text-[#7f8a82]">{milestone.label}</p>
                <p className={cn("mt-1 text-[10px] font-[680]", deadline.overdue ? "text-[#b8473e]" : "text-[#39443c]")}>Due {formatDate(deadline.dueAt)}</p>
                {deadline.completedAt ? <p className="mt-1.5 text-[9px] font-[720] text-[#2d7650]"><Check className="mr-1 inline h-3 w-3" />{milestone.complete} {formatDate(deadline.completedAt)}</p> : editable ? <Button type="button" variant="ghost" size="sm" className="mt-1.5 h-7 px-2 text-[8px]" disabled={pending || !previousComplete} onClick={() => completeMilestone(deadline.milestone)}>{milestone.action}</Button> : <p className="mt-1.5 text-[9px] text-[#8a948d]">Not completed</p>}
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-5 px-4 py-4 sm:px-5">
        <section>
          <h3 className="text-[10px] font-[760] uppercase tracking-[0.075em] text-[#657168]">Overall Decision</h3>
          <div className="mt-2 grid grid-cols-3 rounded-[11px] border border-[#dce4dd] bg-[#f8faf8] p-1">
            {Object.values(ProductionSampleDecision).map((value) => <button key={value} type="button" disabled={!editable} aria-pressed={decision === value} className={cn("rounded-[8px] px-2 py-2 text-[9px] font-[760] transition disabled:cursor-not-allowed", decision === value ? value === ProductionSampleDecision.PASS ? "bg-[#dff1e4] text-[#256b46] shadow-sm" : value === ProductionSampleDecision.FAIL ? "bg-[#fde5e2] text-[#af4037] shadow-sm" : "bg-[#ffedcc] text-[#9d6315] shadow-sm" : "text-[#78837b] hover:bg-white")} onClick={() => setDecision(value)}>{labelEnum(value)}</button>)}
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between gap-3"><h3 className="text-[10px] font-[760] uppercase tracking-[0.075em] text-[#657168]">Participants in Review</h3>{editable ? <button type="button" className="inline-flex items-center gap-1 rounded-full border border-[#d8e2d9] px-2.5 py-1 text-[9px] font-[720] text-[#397454]" onClick={onOpenParticipants}><Plus className="h-3 w-3" /> Manage</button> : null}</div>
          <div className="mt-2 flex flex-wrap gap-2">{round.participants.length ? round.participants.map((participant) => <span key={participant.id} title={`${participant.name} — ${participant.role}`} className="inline-flex items-center gap-1.5 rounded-full border border-[#e0e6e0] bg-[#fafbfa] py-1 pl-1 pr-2.5 text-[9px] font-[680] text-[#465149]"><span className="grid size-6 place-items-center rounded-full bg-[#e4f1e7] text-[8px] font-[780] text-[#2f7350]">{initials(participant.name)}</span>{participant.name}</span>) : <span className="text-[10px] text-[#8a948d]">No review participants selected.</span>}</div>
        </section>

        <section aria-labelledby="evaluation-criteria-heading">
          <h3 id="evaluation-criteria-heading" className="text-[10px] font-[760] uppercase tracking-[0.075em] text-[#657168]">Evaluation Criteria</h3>
          <div className="mt-2 overflow-hidden rounded-[13px] border border-[#e1e7e1]">
            <div className="hidden grid-cols-[minmax(100px,0.9fr)_auto_minmax(95px,0.85fr)] gap-2 bg-[#f7f9f7] px-3 py-2 text-[8px] font-[760] uppercase tracking-[0.06em] text-[#818b83] sm:grid"><span>Criterion</span><span>Assessment</span><span>Comment</span></div>
            <div className="divide-y divide-[#e7ece7] bg-white">
              {round.evaluations.map((evaluation) => {
                const current = evaluations.get(evaluation.criterion) ?? { decision: evaluation.decision, comment: evaluation.comment ?? "" };
                return <div key={evaluation.criterion} className="grid gap-2 px-3 py-2.5 sm:grid-cols-[minmax(100px,0.9fr)_auto_minmax(95px,0.85fr)] sm:items-center"><span className="text-[10px] font-[680] text-[#354038]">{CRITERION_LABELS[evaluation.criterion]}</span><div className="inline-flex w-fit rounded-[9px] border border-[#dde5de] bg-[#f8faf8] p-0.5">{Object.values(ProductionSampleDecision).map((value) => <button key={value} type="button" disabled={!editable} aria-pressed={current.decision === value} className={cn("rounded-[7px] px-2 py-1 text-[8px] font-[760] transition disabled:cursor-not-allowed", current.decision === value ? value === ProductionSampleDecision.PASS ? "bg-[#dff1e4] text-[#256b46]" : value === ProductionSampleDecision.FAIL ? "bg-[#fde5e2] text-[#af4037]" : "bg-[#ffedcc] text-[#9d6315]" : "text-[#7c867f] hover:bg-white")} onClick={() => setEvaluations((existing) => new Map(existing).set(evaluation.criterion, { ...current, decision: value }))}>{labelEnum(value)}</button>)}</div><Input disabled={!editable} value={current.comment} aria-label={`${CRITERION_LABELS[evaluation.criterion]} comment`} className="h-8 min-h-8 rounded-[9px] px-2.5 text-[9px] shadow-none" placeholder="Optional comment" onChange={(event) => setEvaluations((existing) => new Map(existing).set(evaluation.criterion, { ...current, comment: event.target.value }))} /></div>;
              })}
            </div>
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between gap-3"><h3 className="text-[10px] font-[760] uppercase tracking-[0.075em] text-[#657168]">Evidence</h3>{editable ? <button type="button" className="inline-flex items-center gap-1 rounded-full border border-[#d8e2d9] px-2.5 py-1 text-[9px] font-[720] text-[#397454]" onClick={onOpenEvidence}><Plus className="h-3 w-3" /> Add Evidence</button> : null}</div>
          <div className="mt-2 flex flex-wrap gap-2">{round.evidence.length ? round.evidence.map((item) => <article key={item.id} className="relative w-[78px] overflow-hidden rounded-[10px] border border-[#dce4dc] bg-[#f4f7f4]"><a href={item.previewPath} target="_blank" rel="noreferrer" className="grid h-14 place-items-center overflow-hidden">{item.mimeType.startsWith("image/") ? <img src={item.previewPath} alt={item.name} className="h-full w-full object-cover" /> : <Video className="h-5 w-5 text-[#52705c]" />}</a><div className="flex items-center gap-1 px-1.5 py-1"><span className="min-w-0 flex-1 truncate text-[7px] font-[680]">{item.name}</span>{editable ? <button type="button" disabled={pending} aria-label={`Remove ${item.name}`} onClick={() => removeEvidence(item.id)}><Trash2 className="h-2.5 w-2.5 text-[#a84d44]" /></button> : null}</div>{item.criterion ? <p className="truncate border-t px-1.5 py-1 text-[6px] text-[#748078]">{CRITERION_LABELS[item.criterion]}</p> : null}</article>) : <span className="text-[10px] text-[#8a948d]">No evidence added.</span>}</div>
        </section>

        <section><h3 className="text-[10px] font-[760] uppercase tracking-[0.075em] text-[#657168]">Overall Review Notes</h3><Textarea disabled={!editable} value={notes} className="mt-2 min-h-[76px] rounded-[12px] bg-[#fbfcfb] px-3 py-2.5 text-[10px] leading-4 shadow-none" placeholder="Add an overall note for this sample round" onChange={(event) => setNotes(event.target.value)} /></section>
      </div>

      <div className="grid gap-2 border-t border-[#e5ebe5] bg-[#fafbfa] px-4 py-4 sm:grid-cols-2 sm:px-5">
        {data.canManage && !data.stageCompleted ? <Button type="button" variant="outline" size="sm" className="rounded-[11px]" onClick={onOpenFeedback}><Mail className="h-3.5 w-3.5" /> Generate Feedback Email</Button> : null}
        {editable ? <Button type="button" variant="outline" size="sm" className="rounded-[11px]" disabled={pending} onClick={saveProgress}><Save className="h-3.5 w-3.5" /> {pending ? "Saving..." : "Save Progress"}</Button> : null}
        {editable ? <Button type="button" size="sm" className="rounded-[11px] sm:col-span-2" onClick={onCompleteRound}><Check className="h-3.5 w-3.5" /> Mark Round Complete</Button> : null}
      </div>
    </aside>
  );
}

export function StageSevenWorkspace({
  project,
  currentUserId,
  data,
}: {
  project: ProjectStageShellRecord;
  currentUserId: string;
  data: StageSevenWorkspaceData;
}) {
  const router = useRouter();
  const [pending, startPending] = useTransition();
  const [dialog, setDialog] = useState<"round" | "participants" | "evidence" | "feedback" | null>(null);
  const [confirm, setConfirm] = useState<"round" | "unit" | "project" | null>(null);
  const selectedUnit = data.units.find((unit) => unit.id === data.selectedUnitId) ?? data.units[0] ?? null;
  const selectedRound = selectedUnit?.rounds.find((round) => round.id === data.selectedRoundId) ?? selectedUnit?.rounds.at(-1) ?? null;
  const selectedCounts = useMemo(() => selectedUnit ? {
    completed: selectedUnit.rounds.filter((round) => round.status === ProductionSampleRoundStatus.COMPLETED).length,
    underReview: selectedUnit.rounds.filter((round) => round.status === ProductionSampleRoundStatus.UNDER_REVIEW).length,
    pending: selectedUnit.rounds.filter((round) => round.status === ProductionSampleRoundStatus.PENDING).length,
  } : { completed: 0, underReview: 0, pending: 0 }, [selectedUnit]);
  const mutableUnit = Boolean(
    selectedUnit &&
    data.canManage &&
    !data.stageCompleted &&
    selectedUnit.status !== ProductionSupervisionStatus.SIGNED_OFF,
  );
  const latestCompleted = selectedUnit?.rounds.filter((round) => round.status === ProductionSampleRoundStatus.COMPLETED).at(-1);
  const canSignOff = Boolean(
    mutableUnit &&
    latestCompleted?.overallDecision === ProductionSampleDecision.PASS,
  );
  const remainingUnits = data.units.filter((unit) => unit.status !== ProductionSupervisionStatus.SIGNED_OFF);
  const hasActiveRounds = data.units.some((unit) => unit.rounds.some((round) => round.status !== ProductionSampleRoundStatus.COMPLETED));
  const canClose = data.canManage && !data.stageCompleted && data.units.length > 0 && !remainingUnits.length && !hasActiveRounds;
  const headerStatus = data.stageCompleted ? "COMPLETED" : data.units.some((unit) => unit.rounds.length) ? "IN PROGRESS" : "AVAILABLE";

  function select(unitId: string, roundId?: string | null) {
    const params = new URLSearchParams({ unit: unitId });
    if (roundId) params.set("round", roundId);
    router.push(`/projects/${project.id}/stages/7?${params.toString()}`, { scroll: false });
  }

  function refresh() {
    router.refresh();
  }

  function completeRound() {
    if (!selectedUnit || !selectedRound) return;
    startPending(async () => {
      const result = await completeProductionSampleRoundAction({ projectId: project.id, productionUnitId: selectedUnit.id, sampleRoundId: selectedRound.id });
      if ("error" in result) {
        showErrorToast("Unable to complete sample round.", result.error);
        return;
      }
      showSuccessToast(result.duplicate ? "Sample round was already complete." : "Sample round completed.");
      setConfirm(null);
      refresh();
    });
  }

  function signOff() {
    if (!selectedUnit) return;
    startPending(async () => {
      const result = await signOffProductionUnitAction({ projectId: project.id, productionUnitId: selectedUnit.id });
      if ("error" in result) {
        showErrorToast("Unable to sign off Production Unit.", result.error);
        return;
      }
      showSuccessToast(result.duplicate ? "Production Unit was already signed off." : "Production Unit signed off.");
      setConfirm(null);
      refresh();
    });
  }

  function closeProject() {
    startPending(async () => {
      const result = await closeStageSevenProjectAction({ projectId: project.id });
      if ("error" in result) {
        showErrorToast("Unable to close project.", result.error);
        return;
      }
      showSuccessToast(result.duplicate ? "Project was already closed." : "Project closed. Archiving remains separate.");
      setConfirm(null);
      refresh();
    });
  }

  return (
    <section className="mx-auto w-full max-w-[1420px] pb-6">
      <ProjectAccessRealtimeGuard projectId={project.id} currentUserId={currentUserId} />
      <Card className="overflow-hidden rounded-[26px] border-[#dfe6df] shadow-[0_20px_54px_rgba(23,39,28,0.055)]">
        <CardContent className="p-0">
          <div className="px-5 py-6 sm:px-7 sm:py-8 lg:px-9">
            <div className="flex items-center gap-2 text-[11px] font-[760] uppercase tracking-[0.13em] text-[#4d765d]"><ShieldCheck className="h-4 w-4" /> Implementation &amp; Supervision</div>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><h1 className="text-[28px] font-[780] tracking-[-0.04em] text-[#111713] sm:text-[34px]">Stage 7 – Implementation &amp; Supervision</h1><Badge variant="secondary" className="w-fit border-[#cfe0d3] bg-[#eaf4ed] px-3 py-1.5 text-[10px] text-[#2f7751]">{headerStatus}</Badge></div>
            <p className="mt-2 text-[13px] leading-5 text-[#6f7a72]">Supervise production through sample rounds until final sign-off.</p>
            <ProjectStageSummary project={project} />
          </div>

          <div className="space-y-5 border-t border-[#e7ece7] bg-[#fbfcfb] px-5 py-6 sm:px-7 lg:px-9 lg:py-7">
            {!data.units.length ? (
              <div className="grid min-h-[360px] place-items-center rounded-[18px] border border-[#dfe6df] bg-white p-8 text-center"><div><PackageCheck className="mx-auto h-9 w-9 text-[#a7b2a9]" /><h2 className="mt-3 text-[15px] font-[740] text-[#303b33]">No handed-over Production Units are available.</h2><p className="mt-1 text-[10px] text-[#849087]">Stage 7 uses completed Stage 6 handovers and does not create units independently.</p></div></div>
            ) : selectedUnit ? (
              <>
                <ProductionUnitSwitcher units={data.units} selectedUnitId={selectedUnit.id} onSelect={(unitId) => select(unitId)} />
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[12px] border border-[#e0e7e0] bg-white px-4 py-2.5 text-[10px] text-[#667269]"><strong className="text-[#2e3a31]">{selectedUnit.name}</strong><span>{selectedUnit.rounds.length} Sample {selectedUnit.rounds.length === 1 ? "Round" : "Rounds"}</span><span>{selectedCounts.completed} Completed</span><span>{selectedCounts.underReview} Under Review</span><span>{selectedCounts.pending} Pending</span>{canSignOff ? <Button type="button" size="sm" className="ml-auto h-8 rounded-[10px] text-[9px]" onClick={() => setConfirm("unit")}><PackageCheck className="h-3.5 w-3.5" /> Sign Off Production Unit</Button> : null}</div>
                <StageSevenSummary data={data} />
                <div className="grid min-w-0 gap-5 min-[1360px]:grid-cols-[minmax(0,1.65fr)_minmax(380px,0.95fr)] min-[1360px]:items-start">
                  <SampleRoundsList unit={selectedUnit} selectedRoundId={selectedRound?.id ?? null} mutable={mutableUnit} onCreateRound={() => setDialog("round")} onSelectRound={(roundId) => select(selectedUnit.id, roundId)} />
                  <SampleRoundDetails key={selectedRound?.id ?? "none"} projectId={project.id} unit={selectedUnit} round={selectedRound} data={data} mutable={mutableUnit} onRefresh={refresh} onOpenParticipants={() => setDialog("participants")} onOpenEvidence={() => setDialog("evidence")} onOpenFeedback={() => setDialog("feedback")} onCompleteRound={() => setConfirm("round")} />
                </div>
                {data.summary.overdueMilestones ? <div className="flex items-start gap-2 rounded-[13px] border border-[#ead6ae] bg-[#fff9ed] px-4 py-3 text-[10px] leading-4 text-[#795c2b]"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#b37a21]" /><span><strong>{data.summary.overdueMilestones} uncompleted {data.summary.overdueMilestones === 1 ? "milestone is" : "milestones are"} overdue.</strong> Project Owner and Co-Owners receive a single deduplicated alert per overdue milestone from the secured deadline processor.</span></div> : null}
              </>
            ) : null}
          </div>

          <div className="flex flex-col gap-4 border-t border-[#e7ece7] bg-white px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-7 lg:px-9">
            <div className="flex items-start gap-2"><Info className="mt-0.5 h-4 w-4 shrink-0 text-[#4f8062]" /><div><p className="text-[11px] font-[720] text-[#354138]">Project closure is manual once every Production Unit is signed off.</p><p className="mt-0.5 text-[9px] text-[#849087]">Closing completes Stage 7. Archiving remains a separate action.</p></div></div>
            {data.stageCompleted ? <Badge className="bg-[#e4f2e7] text-[#2e744e]">Project Closed</Badge> : data.canManage ? <Button type="button" variant="outline" className="rounded-[12px] border-[#d96a60] text-[#b9433a] hover:bg-[#fff3f1]" onClick={() => {
              if (!canClose) {
                const detail = remainingUnits.length ? ` Remaining: ${remainingUnits.map((unit) => unit.name).join(", ")}.` : hasActiveRounds ? " Complete all active sample rounds first." : "";
                showErrorToast("All Production Units must be signed off before the project can be closed.", detail);
                return;
              }
              setConfirm("project");
            }}><X className="h-4 w-4" /> Close Project</Button> : null}
          </div>
        </CardContent>
      </Card>

      {dialog === "round" && selectedUnit ? <NewRoundDialog projectId={project.id} unit={selectedUnit} onClose={() => setDialog(null)} onCreated={(roundId) => select(selectedUnit.id, roundId)} /> : null}
      {dialog === "participants" && selectedUnit && selectedRound ? <ParticipantsDialog projectId={project.id} unit={selectedUnit} round={selectedRound} participants={data.participants} onClose={() => setDialog(null)} onSaved={refresh} /> : null}
      {dialog === "evidence" && selectedUnit && selectedRound ? <EvidenceDialog projectId={project.id} unit={selectedUnit} round={selectedRound} onClose={() => setDialog(null)} onSaved={refresh} /> : null}
      {dialog === "feedback" && selectedUnit && selectedRound ? <FeedbackDialog projectId={project.id} unit={selectedUnit} round={selectedRound} participants={data.participants} onClose={() => setDialog(null)} onSaved={refresh} /> : null}

      <ConfirmationDialog isOpen={confirm === "round"} title="Complete Sample Round?" description="This locks milestones, evaluations, participants, and evidence as audit history. The Production Unit is not signed off automatically." confirmLabel="Mark Round Complete" pending={pending} onConfirm={completeRound} onClose={() => setConfirm(null)} />
      <ConfirmationDialog isOpen={confirm === "unit"} title={`Sign off ${selectedUnit?.name ?? "Production Unit"}?`} description="This confirms that production supervision for this Production Unit is complete." confirmLabel="Sign Off" pending={pending} onConfirm={signOff} onClose={() => setConfirm(null)} />
      <ConfirmationDialog isOpen={confirm === "project"} title="Close Project?" description="All Production Units have been signed off. Closing the project will complete Stage 7. Archiving is a separate action." confirmLabel="Close Project" tone="destructive" pending={pending} onConfirm={closeProject} onClose={() => setConfirm(null)} />
    </section>
  );
}

export function StageSevenLoadingShell() {
  return (
    <section className="mx-auto w-full max-w-[1420px] pb-6">
      <Card className="overflow-hidden rounded-[26px] border-[#dfe6df] shadow-none">
        <CardContent className="p-0">
          <div className="p-7 lg:p-9"><Skeleton className="h-4 w-48 rounded-full" /><Skeleton className="mt-4 h-10 w-full max-w-[680px] rounded-[12px]" /><Skeleton className="mt-6 h-[86px] rounded-[18px]" /></div>
          <div className="space-y-5 border-t border-[#e7ece7] bg-[#fbfcfb] p-6 lg:p-9"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-[76px] rounded-[16px]" />)}</div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-[66px] rounded-[15px]" />)}</div><div className="grid gap-5 min-[1360px]:grid-cols-[minmax(0,1.65fr)_minmax(380px,0.95fr)]"><Skeleton className="h-[520px] rounded-[18px]" /><Skeleton className="h-[720px] rounded-[18px]" /></div></div>
        </CardContent>
      </Card>
    </section>
  );
}
