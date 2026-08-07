"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowRight,
  BriefcaseBusiness,
  ChevronDown,
  FileText,
  FolderKanban,
  ListChecks,
  Paperclip,
  Search,
  UserRound,
  Users,
  X,
} from "lucide-react";

import { AppDatePicker } from "@/components/calendar/app-date-picker";
import { ProjectAccessRealtimeGuard } from "@/components/projects/project-access-realtime-guard";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import type { ProjectFlowRecord } from "@/lib/projects";

type StageOneWorkspaceProps = {
  project: ProjectFlowRecord;
  currentUserId: string;
};

function getTodayDateValue() {
  const today = new Date();
  const year = today.getFullYear();
  const month = `${today.getMonth() + 1}`.padStart(2, "0");
  const day = `${today.getDate()}`.padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function StageOneFormField({
  label,
  required = false,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <label className="mb-2 block text-[13px] font-[720] text-[#202923]">
        {label}
        {required ? <span className="ml-1 text-[#bd4d48]">*</span> : null}
      </label>
      {children}
    </div>
  );
}

function ManualAction({ label = "Add manually" }: { label?: string }) {
  return (
    <button
      type="button"
      title={`${label} will be connected in a later implementation phase.`}
      className="mt-2 text-[12px] font-[650] text-[#2d7b51] transition hover:text-[#185d3a]"
    >
      {label}
    </button>
  );
}

function SearchSelectField({
  ariaLabel,
  placeholder,
}: {
  ariaLabel: string;
  placeholder: string;
}) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#859087]" />
      <Input
        aria-label={ariaLabel}
        role="combobox"
        aria-expanded="false"
        placeholder={placeholder}
        className="h-12 rounded-[14px] border-[#dce3dc] bg-white pl-11 pr-11 shadow-none"
      />
      <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#59645d]" />
    </div>
  );
}

function MultiEntryInput({
  ariaLabel,
  initialValues,
  placeholder,
}: {
  ariaLabel: string;
  initialValues: string[];
  placeholder: string;
}) {
  const [values, setValues] = useState(initialValues);
  const [draft, setDraft] = useState("");

  function addDraftValue() {
    const nextValue = draft.trim();

    if (!nextValue || values.some((value) => value.toLowerCase() === nextValue.toLowerCase())) {
      setDraft("");
      return;
    }

    setValues((current) => [...current, nextValue]);
    setDraft("");
  }

  return (
    <div className="flex min-h-12 flex-wrap items-center gap-2 rounded-[14px] border border-[#dce3dc] bg-white px-2.5 py-2 focus-within:ring-3 focus-within:ring-brand/15">
      {values.map((value) => (
        <span
          key={value}
          className="inline-flex items-center gap-1.5 rounded-[9px] bg-[#f0f4f0] px-2.5 py-1.5 text-[11px] font-[650] text-[#38443c]"
        >
          {value}
          <button
            type="button"
            aria-label={`Remove ${value}`}
            onClick={() => setValues((current) => current.filter((item) => item !== value))}
            className="rounded-full text-[#7d8880] transition hover:text-[#2d6949]"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        aria-label={ariaLabel}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={addDraftValue}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === ",") {
            event.preventDefault();
            addDraftValue();
          }
        }}
        placeholder={placeholder}
        className="h-7 min-w-[150px] flex-1 bg-transparent px-1 text-[13px] text-[#29322c] outline-none placeholder:text-[#9aa39b]"
      />
      <ChevronDown className="h-4 w-4 shrink-0 text-[#59645d]" />
    </div>
  );
}

function AttachmentTextarea({
  ariaLabel,
  placeholder,
}: {
  ariaLabel: string;
  placeholder: string;
}) {
  return (
    <div className="relative">
      <Textarea
        aria-label={ariaLabel}
        placeholder={placeholder}
        className="min-h-[104px] resize-none rounded-[14px] border-[#dce3dc] bg-white pb-10 pr-12 shadow-none"
      />
      <button
        type="button"
        aria-label={`Attach a file to ${ariaLabel}`}
        title="Attachments will be connected in a later implementation phase."
        className="absolute bottom-3 right-3 grid size-8 place-items-center rounded-full text-[#6f7b73] transition hover:bg-[#eef5ef] hover:text-brand"
      >
        <Paperclip className="h-[18px] w-[18px]" />
      </button>
    </div>
  );
}

function StageOneSummaryItem({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-[#f0f6f1] text-[#377253]">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-[650] text-[#778179]">{label}</p>
        <p className="mt-0.5 truncate text-[13px] font-[680] text-[#273129]" title={value}>
          {value}
        </p>
      </div>
    </div>
  );
}

export function StageOneProjectSummary({ project }: { project: ProjectFlowRecord }) {
  const owner = project.collaborators.find(
    (collaborator) => collaborator.role === "Project Owner",
  );
  const coOwners = project.collaborators
    .filter((collaborator) => collaborator.role === "Project Co-Owner")
    .map((collaborator) => collaborator.name);
  const executors = project.executors.map((executor) => executor.name);
  const restrictedLabel = project.canViewParticipants ? "None" : "Restricted";

  return (
    <Card className="mt-6 rounded-[20px] border-[#dfe6df] shadow-[0_12px_30px_rgba(23,39,28,0.04)]">
      <CardContent className="grid gap-5 px-5 py-5 sm:grid-cols-2 lg:grid-cols-4 lg:px-6">
        <StageOneSummaryItem
          icon={<FolderKanban className="h-[18px] w-[18px]" />}
          label="Project Name"
          value={project.title}
        />
        <StageOneSummaryItem
          icon={<UserRound className="h-[18px] w-[18px]" />}
          label="Project Owner"
          value={owner?.name ?? (project.ownerId ? "Restricted" : "Not assigned")}
        />
        <StageOneSummaryItem
          icon={<Users className="h-[18px] w-[18px]" />}
          label="Project Co-Owners"
          value={coOwners.length > 0 ? coOwners.join(", ") : restrictedLabel}
        />
        <StageOneSummaryItem
          icon={<BriefcaseBusiness className="h-[18px] w-[18px]" />}
          label="Project Executors"
          value={executors.length > 0 ? executors.join(", ") : restrictedLabel}
        />
      </CardContent>
    </Card>
  );
}

export function StageOneWorkspace({ project, currentUserId }: StageOneWorkspaceProps) {
  const [projectType, setProjectType] = useState<"external" | "internal">("external");
  const [date, setDate] = useState(getTodayDateValue);
  const [deadline, setDeadline] = useState("");
  const [priority, setPriority] = useState("");

  return (
    <section className="mx-auto w-full max-w-[1420px] pb-6">
      <ProjectAccessRealtimeGuard projectId={project.id} currentUserId={currentUserId} />

      <div className="flex items-center gap-2 text-[12px] font-[750] uppercase tracking-[0.12em] text-[#4d765d]">
        <FileText className="h-4 w-4" />
        Project Inquiry
      </div>
      <h1 className="mt-3 text-[30px] font-[780] tracking-[-0.04em] text-[#111713] sm:text-[36px]">
        Stage 1 - Project Inquiry
      </h1>

      <StageOneProjectSummary project={project} />

      <Card className="mt-6 rounded-[22px] border-[#dde5de] shadow-[0_18px_44px_rgba(23,39,28,0.055)]">
        <CardContent className="px-5 py-6 sm:px-7 sm:py-7 lg:px-8">
          <form onSubmit={(event) => event.preventDefault()}>
            <div className="grid gap-x-10 gap-y-6 lg:grid-cols-2">
              <StageOneFormField label="Client Name" required>
                <SearchSelectField
                  ariaLabel="Client name"
                  placeholder="Search or select client"
                />
                <ManualAction />
              </StageOneFormField>

              <StageOneFormField label="External / Internal">
                <div
                  role="group"
                  aria-label="External or internal project"
                  className="grid h-12 grid-cols-2 overflow-hidden rounded-[14px] border border-[#dce3dc] bg-white p-1"
                >
                  {(["external", "internal"] as const).map((option) => {
                    const selected = projectType === option;

                    return (
                      <button
                        key={option}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setProjectType(option)}
                        className={`rounded-[10px] text-[13px] font-[680] capitalize transition ${
                          selected
                            ? "bg-[linear-gradient(90deg,#2f8d5d,#1a6341)] text-white shadow-[0_8px_18px_rgba(35,113,73,0.16)]"
                            : "text-[#5e6961] hover:bg-[#f3f7f3]"
                        }`}
                      >
                        {option}
                      </button>
                    );
                  })}
                </div>
              </StageOneFormField>

              <StageOneFormField label="Final Beneficiary" required>
                <SearchSelectField
                  ariaLabel="Final beneficiary"
                  placeholder="Search or select beneficiary"
                />
                <ManualAction />
              </StageOneFormField>

              <StageOneFormField label="Target Market">
                <MultiEntryInput
                  ariaLabel="Add target market"
                  initialValues={["UAE", "GCC"]}
                  placeholder="Countries or regions"
                />
                <ManualAction />
              </StageOneFormField>

              <StageOneFormField label="Initial Brief">
                <AttachmentTextarea
                  ariaLabel="Initial brief"
                  placeholder="Provide an overview or background of the project"
                />
              </StageOneFormField>

              <StageOneFormField label="Key Business Objectives">
                <AttachmentTextarea
                  ariaLabel="Key business objectives"
                  placeholder="Outline the key goals and objectives of this project"
                />
              </StageOneFormField>

              <StageOneFormField label="Collaborators">
                <SearchSelectField
                  ariaLabel="Collaborators"
                  placeholder="Search or select collaborators"
                />
                <ManualAction />
              </StageOneFormField>

              <StageOneFormField label="Deliverables">
                <MultiEntryInput
                  ariaLabel="Add deliverable"
                  initialValues={["Packaging Artwork", "Signature Artwork"]}
                  placeholder="Add deliverables"
                />
                <ManualAction label="Add more" />
              </StageOneFormField>

              <StageOneFormField label="Date">
                <AppDatePicker
                  value={date}
                  onChange={setDate}
                  placeholder="Select date"
                  triggerClassName="h-12 w-full justify-between rounded-[14px] border border-[#dce3dc] bg-white px-4 text-left text-[13px] font-normal text-[#263029] shadow-none hover:bg-white"
                />
              </StageOneFormField>

              <StageOneFormField label="Deadline">
                <AppDatePicker
                  value={deadline}
                  onChange={setDeadline}
                  placeholder="Select deadline"
                  triggerClassName="h-12 w-full justify-between rounded-[14px] border border-[#dce3dc] bg-white px-4 text-left text-[13px] font-normal text-[#263029] shadow-none hover:bg-white"
                />
              </StageOneFormField>

              <StageOneFormField label="Legal Notes">
                <AttachmentTextarea
                  ariaLabel="Legal notes"
                  placeholder="Add any legal requirements or special considerations"
                />
              </StageOneFormField>

              <StageOneFormField label="Priority">
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger className="h-12 rounded-[14px] border-[#dce3dc] bg-white px-4 shadow-none">
                    <SelectValue placeholder="Select priority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </StageOneFormField>
            </div>

            <div className="mt-8 flex flex-col gap-3 border-t border-[#edf1ed] pt-6 sm:flex-row sm:items-center">
              <Button
                type="button"
                title="Stage progression will be connected after the Stage 1 backend is implemented."
                className="min-w-[170px] rounded-[13px]"
              >
                Next Stage
                <ArrowRight className="h-4 w-4" />
              </Button>
              <Button
                asChild
                type="button"
                variant="outline"
                className="min-w-[150px] rounded-[13px] shadow-none"
              >
                <Link href={`/projects/${project.id}`}>
                  <ListChecks className="h-4 w-4" />
                  All Stages
                </Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </section>
  );
}

export function StageOneLoadingShell() {
  return (
    <section className="mx-auto w-full max-w-[1420px] pb-6">
      <Skeleton className="h-4 w-32 rounded-full" />
      <Skeleton className="mt-4 h-10 w-full max-w-[460px] rounded-[12px]" />
      <Skeleton className="mt-6 h-[96px] w-full rounded-[20px]" />
      <Card className="mt-6 rounded-[22px] border-[#dde5de] shadow-none">
        <CardContent className="grid gap-x-10 gap-y-6 px-5 py-6 sm:px-7 lg:grid-cols-2 lg:px-8">
          {Array.from({ length: 12 }).map((_, index) => (
            <div key={index}>
              <Skeleton className="h-3.5 w-32 rounded-full" />
              <Skeleton
                className={`mt-2 w-full rounded-[14px] ${
                  index === 4 || index === 5 || index === 10 ? "h-[104px]" : "h-12"
                }`}
              />
            </div>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}
