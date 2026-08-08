"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowRight,
  Check,
  Clock3,
  Download,
  Eye,
  FileText,
  GripVertical,
  Info,
  ListChecks,
  Plus,
  ShieldCheck,
  Trash2,
  Users,
  X,
} from "lucide-react";

import { ProjectAccessRealtimeGuard } from "@/components/projects/project-access-realtime-guard";
import { ProjectStageSummary } from "@/components/projects/project-stage-summary";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type { ProjectStageShellRecord } from "@/lib/projects";
import { showInfoToast } from "@/lib/toast";
import { cn } from "@/lib/utils";

type ApprovalStatus = "Pending" | "Approved" | "Rejected";

type ApprovalStep = {
  id: string;
  department: string;
  customDepartment: string;
  email: string;
  status: ApprovalStatus;
};

const DEPARTMENT_OPTIONS = [
  "Design Department",
  "Marketing",
  "Regulatory Affairs",
  "Legal",
  "Finance",
  "Production Department",
  "Quality Control",
  "Management",
  "Other",
] as const;

const INITIAL_APPROVAL_STEPS: ApprovalStep[] = [
  {
    id: "mock-design-approval",
    department: "Design Department",
    customDepartment: "",
    email: "design.head@company.com",
    status: "Pending",
  },
  {
    id: "mock-regulatory-approval",
    department: "Regulatory Affairs",
    customDepartment: "",
    email: "regulatory.manager@company.com",
    status: "Pending",
  },
  {
    id: "mock-production-approval",
    department: "Production Department",
    customDepartment: "",
    email: "production.head@company.com",
    status: "Pending",
  },
];

const CONTROL_CLASS =
  "min-h-11 rounded-[12px] border-[#dfe6df] bg-white shadow-none focus-visible:border-[#8db49a]";

function HandoverFileCard() {
  function showFilePlaceholder(action: "preview" | "download") {
    showInfoToast(
      `File ${action} is a UI preview.`,
      "The handover file is mocked and is not connected to project storage yet.",
    );
  }

  return (
    <section className="rounded-[20px] border border-[#dfe6df] bg-white p-5 shadow-[0_12px_30px_rgba(23,39,28,0.045)] sm:p-6">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#e9f4ec] text-[12px] font-[760] text-[#28714d]">
          1
        </span>
        <div>
          <h2 className="text-[17px] font-[750] text-[#1c271f]">Handover File</h2>
          <p className="mt-1 text-[12px] leading-5 text-[#727d75]">
            Select the final file or package to be handed over for approval.
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-4 rounded-[16px] border border-[#e2e8e2] bg-[#fbfcfb] p-4 sm:flex-row sm:items-center">
        <span className="grid size-11 shrink-0 place-items-center rounded-[12px] bg-[#edf5ef] text-[#347455]">
          <FileText className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-[720] text-[#27322b]">
            Final_Concept_Package.pdf
          </p>
          <p className="mt-1 text-[11px] leading-4 text-[#77827a]">
            PDF · 24.8 MB · Uploaded by Super Admin
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="rounded-[11px] shadow-none"
            onClick={() => showFilePlaceholder("preview")}
          >
            <Eye className="h-3.5 w-3.5" /> Preview
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="rounded-[11px] shadow-none"
            onClick={() => showFilePlaceholder("download")}
          >
            <Download className="h-3.5 w-3.5" /> Download
          </Button>
        </div>
      </div>
    </section>
  );
}

function ApprovalStatusBadge({ status }: { status: ApprovalStatus }) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-[750]",
        status === "Approved"
          ? "bg-[#e4f2e7] text-[#2e744e]"
          : status === "Rejected"
            ? "bg-[#fde9e6] text-[#a54b43]"
            : "bg-[#fff3df] text-[#9a6a22]",
      )}
    >
      {status === "Approved" ? (
        <Check className="h-3 w-3" />
      ) : status === "Rejected" ? (
        <X className="h-3 w-3" />
      ) : (
        <Clock3 className="h-3 w-3" />
      )}
      {status}
    </span>
  );
}

function ApprovalChainRow({
  step,
  index,
  onChange,
  onRemove,
}: {
  step: ApprovalStep;
  index: number;
  onChange: (step: ApprovalStep) => void;
  onRemove: () => void;
}) {
  return (
    <div className="grid gap-4 border-t border-[#e8ede8] px-4 py-5 first:border-t-0 sm:px-5 lg:px-6 xl:grid-cols-[62px_minmax(190px,0.9fr)_minmax(240px,1.2fr)_100px_42px] xl:items-start xl:gap-4">
      <div className="flex items-center gap-2 xl:min-h-11">
        <GripVertical className="hidden h-4 w-4 text-[#b1bab3] xl:block" aria-hidden="true" />
        <span className="grid size-9 shrink-0 place-items-center rounded-[10px] border border-[#dfe6df] bg-[#f8faf8] text-[12px] font-[740] text-[#4b5a51]">
          {index + 1}
        </span>
        <span className="text-[10px] font-[720] uppercase tracking-[0.08em] text-[#7d8780] xl:hidden">
          Approval step
        </span>
      </div>

      <label className="min-w-0 space-y-1.5">
        <span className="text-[10px] font-[720] uppercase tracking-[0.07em] text-[#7c867f] xl:hidden">
          Department / Role
        </span>
        <select
          value={step.department}
          className={cn(CONTROL_CLASS, "w-full px-3 text-[12px] text-[#344038] outline-none")}
          aria-label={`Department or role for approval step ${index + 1}`}
          onChange={(event) =>
            onChange({
              ...step,
              department: event.target.value,
              customDepartment:
                event.target.value === "Other" ? step.customDepartment : "",
            })
          }
        >
          <option value="">Select department or role</option>
          {DEPARTMENT_OPTIONS.map((department) => (
            <option key={department} value={department}>
              {department}
            </option>
          ))}
        </select>
        {step.department === "Other" ? (
          <Input
            value={step.customDepartment}
            className={CONTROL_CLASS}
            placeholder="Enter department or role"
            aria-label={`Custom department or role for approval step ${index + 1}`}
            onChange={(event) => onChange({ ...step, customDepartment: event.target.value })}
          />
        ) : null}
      </label>

      <label className="min-w-0 space-y-1.5">
        <span className="text-[10px] font-[720] uppercase tracking-[0.07em] text-[#7c867f] xl:hidden">
          Approver Email
        </span>
        <Input
          type="email"
          value={step.email}
          className={CONTROL_CLASS}
          placeholder="approver@company.com"
          aria-label={`Approver email for step ${index + 1}`}
          onChange={(event) => onChange({ ...step, email: event.target.value })}
        />
      </label>

      <div className="flex items-center xl:min-h-11">
        <ApprovalStatusBadge status={step.status} />
      </div>

      <div className="flex items-center xl:min-h-11 xl:justify-end">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-9 text-[#7c867f] hover:bg-[#f9ecea] hover:text-[#ac4b43]"
          aria-label={`Remove approval step ${index + 1}`}
          onClick={onRemove}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function ApprovalOverview({ steps }: { steps: ApprovalStep[] }) {
  const approved = steps.filter((step) => step.status === "Approved").length;
  const pending = steps.filter((step) => step.status === "Pending").length;
  const rejected = steps.filter((step) => step.status === "Rejected").length;
  const overview = [
    { label: "Total Approvers", value: steps.length, icon: Users, tone: "green" },
    { label: "Approved", value: `${approved} / ${steps.length}`, icon: Check, tone: "green" },
    { label: "Pending", value: pending, icon: Clock3, tone: "amber" },
    { label: "Rejected", value: rejected, icon: X, tone: "red" },
  ] as const;

  return (
    <section aria-labelledby="approval-overview-heading">
      <h2 id="approval-overview-heading" className="text-[14px] font-[740] text-[#253029]">
        Approval Overview
      </h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {overview.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.label}
              className="flex items-center gap-3 rounded-[14px] border border-[#e3e9e3] bg-[#fbfcfb] px-4 py-3"
            >
              <span
                className={cn(
                  "grid size-9 shrink-0 place-items-center rounded-[10px]",
                  item.tone === "amber"
                    ? "bg-[#fff3df] text-[#9b6a20]"
                    : item.tone === "red"
                      ? "bg-[#fdebe8] text-[#aa4e45]"
                      : "bg-[#e9f4ec] text-[#347455]",
                )}
              >
                <Icon className="h-4 w-4" />
              </span>
              <span>
                <strong className="block text-[15px] font-[760] text-[#26312a]">{item.value}</strong>
                <span className="text-[10px] text-[#78837b]">{item.label}</span>
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ApprovalChain({
  steps,
  onChange,
}: {
  steps: ApprovalStep[];
  onChange: (steps: ApprovalStep[]) => void;
}) {
  function addApprover() {
    onChange([
      ...steps,
      {
        id: crypto.randomUUID(),
        department: "",
        customDepartment: "",
        email: "",
        status: "Pending",
      },
    ]);
  }

  return (
    <section className="overflow-hidden rounded-[20px] border border-[#dfe6df] bg-white shadow-[0_12px_30px_rgba(23,39,28,0.045)]">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#e9f4ec] text-[12px] font-[760] text-[#28714d]">
            2
          </span>
          <div>
            <h2 className="text-[17px] font-[750] text-[#1c271f]">Approval Chain</h2>
            <p className="mt-1 text-[12px] leading-5 text-[#727d75]">
              Add approvers in the order they should review and approve.
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start rounded-[11px] shadow-none"
          onClick={addApprover}
        >
          <Plus className="h-4 w-4" /> Add Approver
        </Button>
      </div>

      <div className="hidden border-t border-[#e8ede8] bg-[#fbfcfb] px-6 py-3 text-[10px] font-[740] uppercase tracking-[0.08em] text-[#7c867f] xl:grid xl:grid-cols-[62px_minmax(190px,0.9fr)_minmax(240px,1.2fr)_100px_42px] xl:gap-4">
        <span>Step</span>
        <span>Department / Role</span>
        <span>Approver Email</span>
        <span>Status</span>
        <span className="sr-only">Actions</span>
      </div>

      <div className="border-t border-[#e8ede8]">
        {steps.length > 0 ? (
          steps.map((step, index) => (
            <ApprovalChainRow
              key={step.id}
              step={step}
              index={index}
              onChange={(nextStep) =>
                onChange(steps.map((item) => (item.id === step.id ? nextStep : item)))
              }
              onRemove={() => onChange(steps.filter((item) => item.id !== step.id))}
            />
          ))
        ) : (
          <div className="px-6 py-10 text-center">
            <p className="text-[13px] font-[680] text-[#4d5a52]">No approvers in this chain.</p>
            <p className="mt-1 text-[11px] text-[#7c867f]">Use Add Approver to create the first local step.</p>
          </div>
        )}
      </div>

      <div className="border-t border-[#dce6dd] bg-[#f7faf7] px-5 py-4 sm:px-6">
        <div className="flex items-start gap-2 text-[11px] leading-5 text-[#5f6e64]">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#40785b]" />
          <span>
            Future workflow: approvers will receive an email with a secure link to review the handover file.
            No email or link is created in this UI preview.
          </span>
        </div>
      </div>
    </section>
  );
}

export function StageSixWorkspace({
  project,
  currentUserId,
}: {
  project: ProjectStageShellRecord;
  currentUserId: string;
}) {
  const [approvalSteps, setApprovalSteps] = useState<ApprovalStep[]>(
    INITIAL_APPROVAL_STEPS,
  );
  const totalApprovers = useMemo(() => approvalSteps.length, [approvalSteps]);

  return (
    <section className="mx-auto w-full max-w-[1420px] pb-6">
      <ProjectAccessRealtimeGuard projectId={project.id} currentUserId={currentUserId} />
      <Card className="overflow-hidden rounded-[26px] border-[#dfe6df] shadow-[0_20px_54px_rgba(23,39,28,0.055)]">
        <CardContent className="p-0">
          <div className="px-5 py-6 sm:px-7 sm:py-8 lg:px-9">
            <div className="flex items-center gap-2 text-[11px] font-[760] uppercase tracking-[0.13em] text-[#4d765d]">
              <ShieldCheck className="h-4 w-4" /> Handover &amp; Approval
            </div>
            <h1 className="mt-3 text-[28px] font-[780] tracking-[-0.04em] text-[#111713] sm:text-[34px]">
              Stage 6 - Handover &amp; Approval
            </h1>
            <p className="mt-2 text-[13px] leading-5 text-[#6f7a72]">
              Configure the handover file and approval chain.
            </p>
            <ProjectStageSummary project={project} />
          </div>

          <div className="space-y-5 border-t border-[#e7ece7] bg-[#fbfcfb] px-5 py-6 sm:px-7 lg:px-9 lg:py-7">
            <HandoverFileCard />
            <div className="rounded-[20px] border border-[#dfe6df] bg-white p-5 shadow-[0_12px_30px_rgba(23,39,28,0.045)] sm:p-6">
              <ApprovalOverview steps={approvalSteps} />
              <p className="sr-only" aria-live="polite">
                {totalApprovers} total approvers
              </p>
            </div>
            <ApprovalChain steps={approvalSteps} onChange={setApprovalSteps} />
          </div>

          <div className="flex flex-col-reverse gap-3 border-t border-[#e7ece7] bg-white px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-7 lg:px-9">
            <Button asChild type="button" variant="outline" className="min-w-[160px] rounded-[13px] shadow-none">
              <Link href={`/projects/${project.id}`}>
                <ListChecks className="h-4 w-4" /> All Stages
              </Link>
            </Button>
            <Button asChild type="button" className="min-w-[180px] rounded-[13px]">
              <Link href={`/projects/${project.id}/stages/7`}>
                Next Stage <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

export function StageSixLoadingShell() {
  return (
    <section className="mx-auto w-full max-w-[1420px] pb-6">
      <Card className="overflow-hidden rounded-[26px] border-[#dfe6df] shadow-none">
        <CardContent className="p-0">
          <div className="p-7 lg:p-9">
            <Skeleton className="h-4 w-40 rounded-full" />
            <Skeleton className="mt-4 h-10 w-full max-w-[520px] rounded-[12px]" />
            <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }, (_, index) => (
                <Skeleton key={index} className="h-[82px] rounded-[16px]" />
              ))}
            </div>
          </div>
          <div className="space-y-4 border-t border-[#e7ece7] bg-[#fbfcfb] p-6">
            <Skeleton className="h-[150px] rounded-[20px]" />
            <Skeleton className="h-[110px] rounded-[20px]" />
            <Skeleton className="h-[310px] rounded-[20px]" />
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
