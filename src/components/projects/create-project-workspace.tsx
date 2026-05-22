"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { Paperclip, Plus, X } from "lucide-react";

import { createProjectAction } from "@/app/projects/new/actions";
import {
  initialProjectFormState,
  type ProjectFormState,
} from "@/app/projects/new/project-form-state";
import { CalendarMonthGrid } from "@/components/calendar/calendar-month-grid";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

const currencyOptions = ["USD", "AED", "EUR", "GBP", "INR"] as const;

const projectStatusOptions = [
  { value: "ONGOING", label: "Ongoing" },
  { value: "ON_HOLD", label: "On Hold" },
  { value: "PENDING", label: "Pending" },
  { value: "COMPLETED", label: "Completed" },
] as const;

type ProjectStatusValue = (typeof projectStatusOptions)[number]["value"];

type StageForm = {
  id: string;
  name: string;
  budget: string;
  description: string;
};

type CurrencyValue = (typeof currencyOptions)[number];

type CollaboratorEntry = {
  id: string;
  name: string;
};

type MonthPickerProps = {
  label: string;
  value: Date | null;
  onSelect: (date: Date) => void;
  month: Date;
  onMonthChange: (date: Date) => void;
};

function formatDateValue(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function MonthPicker({
  label,
  value,
  onSelect,
  month,
  onMonthChange,
}: MonthPickerProps) {
  return (
    <div>
      <h3 className="mb-2 text-[16px] font-[600] text-brand">{label}</h3>
      <Card className="rounded-[20px] shadow-[0_14px_32px_rgba(22,38,29,0.06)]">
        <CardContent className="p-4">
          <CalendarMonthGrid
            month={month}
            selectedDate={value ?? month}
            onMonthChange={onMonthChange}
            onSelect={onSelect}
            compact
          />
        </CardContent>
      </Card>
    </div>
  );
}

function CreateProjectSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      disabled={pending}
      className={`mt-8 inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-full px-6 text-[15px] font-semibold text-white shadow-[0_16px_34px_rgba(34,102,70,0.2)] transition-all duration-200 ${
        pending
          ? "cursor-not-allowed bg-[linear-gradient(90deg,#5aa07a,#2c6d4b)] shadow-[0_10px_20px_rgba(34,102,70,0.14)]"
          : "cursor-pointer bg-[linear-gradient(90deg,#2f8d5d,#123f2d)] hover:-translate-y-0.5 hover:shadow-[0_20px_40px_rgba(34,102,70,0.26)]"
      }`}
    >
      {pending ? (
        <>
          <span className="inline-flex gap-1">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white [animation-delay:-0.2s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white [animation-delay:-0.1s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white" />
          </span>
          Creating...
        </>
      ) : (
        "Create Project"
      )}
    </Button>
  );
}

function formatFileSize(size: number) {
  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function CreateProjectWorkspace() {
  const [formState, formAction] = useActionState<ProjectFormState, FormData>(
    createProjectAction,
    initialProjectFormState,
  );
  const [projectName, setProjectName] = useState("");
  const [projectCategory, setProjectCategory] = useState("");
  const [projectTag, setProjectTag] = useState("");
  const [projectBudget, setProjectBudget] = useState("");
  const [projectCurrency, setProjectCurrency] = useState<CurrencyValue>("USD");
  const [projectBrief, setProjectBrief] = useState("");
  const [projectStatus, setProjectStatus] = useState<ProjectStatusValue>("ONGOING");
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [startMonth, setStartMonth] = useState(new Date());
  const [endMonth, setEndMonth] = useState(new Date());
  const [stages, setStages] = useState<StageForm[]>([
    { id: "stage-1", name: "Stage 1", budget: "", description: "" },
  ]);
  const [internalCollaborators, setInternalCollaborators] = useState<CollaboratorEntry[]>([]);
  const [externalCollaborators, setExternalCollaborators] = useState<CollaboratorEntry[]>([]);
  const [briefAttachments, setBriefAttachments] = useState<File[]>([]);

  const overview = useMemo(
    () => ({
      budget: projectBudget ? `${projectBudget} ${projectCurrency}` : "—",
      stages: stages.length,
      started: startDate ? formatDateValue(startDate) : "—",
      deadline: endDate ? formatDateValue(endDate) : "—",
      tag: projectTag || "—",
      status:
        projectStatusOptions.find((option) => option.value === projectStatus)?.label || "—",
      priority: "Medium",
    }),
    [projectBudget, projectCurrency, projectTag, projectStatus, stages.length, startDate, endDate],
  );

  function updateStage(id: string, patch: Partial<StageForm>) {
    setStages((current) =>
      current.map((stage) => (stage.id === id ? { ...stage, ...patch } : stage)),
    );
  }

  function addStage() {
    setStages((current) => [
      ...current,
      {
        id: `stage-${Date.now()}`,
        name: `Stage ${current.length + 1}`,
        budget: "",
        description: "",
      },
    ]);
  }

  function addCollaborator(group: "internal" | "external") {
    const collection = group === "internal" ? internalCollaborators : externalCollaborators;
    const next = { id: `${group}-${Date.now()}`, name: `Invite+` };

    if (group === "internal") {
      setInternalCollaborators([...collection, next]);
    } else {
      setExternalCollaborators([...collection, next]);
    }
  }

  function handleBudgetChange(value: string) {
    setProjectBudget(value.replace(/[^\d]/g, ""));
  }

  function removeBriefAttachment(name: string) {
    setBriefAttachments((current) => current.filter((file) => file.name !== name));
  }

  return (
    <form
      action={formAction}
      className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_280px]"
    >
      <input type="hidden" name="startDate" value={startDate ? formatDateValue(startDate) : ""} />
      <input type="hidden" name="endDate" value={endDate ? formatDateValue(endDate) : ""} />
      <input type="hidden" name="currency" value={projectCurrency} />
      <input type="hidden" name="status" value={projectStatus} />
      <input
        type="hidden"
        name="currentStageName"
        value={stages[0]?.name?.trim() || "Stage 1"}
      />
      <input type="hidden" name="stageCount" value={String(stages.length)} />

      <Card className="bg-surface">
        <CardHeader>
          <div className="rounded-[20px] bg-[linear-gradient(135deg,#466d58,#5e8f75)] px-6 py-4 text-white shadow-[0_18px_45px_rgba(23,39,28,0.08)]">
            <CardTitle className="text-[18px] font-[700] tracking-[-0.02em] text-white">
              Create a project
            </CardTitle>
          </div>
        </CardHeader>

        {formState.error ? (
          <p className="mt-5 rounded-2xl border border-[#f5c7c2] bg-[#fff4f3] px-4 py-3 text-[13px] font-medium text-[#ba3f31]">
            {formState.error}
          </p>
        ) : null}

        <CardContent className="space-y-6 pt-2">
          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
            <div className="space-y-4">
              <label className="block">
                <span className="mb-2 block text-[16px] font-[600] text-brand">
                  Project Name
                </span>
                <Input
                  value={projectName}
                  onChange={(event) => setProjectName(event.target.value)}
                  name="name"
                  placeholder="Enter Project Name....."
                  className="h-[42px] text-[12px]"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-[16px] font-[600] text-brand">
                  Project Category
                </span>
                <Input
                  value={projectCategory}
                  onChange={(event) => setProjectCategory(event.target.value)}
                  name="category"
                  placeholder="Enter Project Category....."
                  className="h-[42px] text-[12px]"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-[16px] font-[600] text-brand">
                  Project Budget
                </span>
                <div className="flex gap-2">
                  <Input
                    value={projectBudget}
                    onChange={(event) => handleBudgetChange(event.target.value)}
                    name="budget"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="Enter Project Budget...."
                    className="h-[42px] min-w-0 flex-1 text-[12px]"
                  />
                  <Select
                    value={projectCurrency}
                    onValueChange={(nextValue) => setProjectCurrency(nextValue as CurrencyValue)}
                  >
                    <SelectTrigger className="h-[42px] w-[108px] text-[12px] font-medium">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {currencyOptions.map((currency) => (
                        <SelectItem key={currency} value={currency}>
                          {currency}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </label>

              <label className="block">
                <span className="mb-2 block text-[16px] font-[600] text-brand">
                  Project Tag
                </span>
                <Input
                  value={projectTag}
                  onChange={(event) => setProjectTag(event.target.value)}
                  name="tag"
                  placeholder="Enter Project Tag....."
                  className="h-[42px] text-[12px]"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-[16px] font-[600] text-brand">
                  Project Status
                </span>
                <Select
                  value={projectStatus}
                  onValueChange={(nextValue) =>
                    setProjectStatus(nextValue as ProjectStatusValue)
                  }
                >
                  <SelectTrigger className="h-[42px] text-[12px] font-medium">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {projectStatusOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            </div>

            <div>
              <label className="block">
                <span className="mb-2 block text-[16px] font-[600] text-brand">
                  Project Brief
                </span>
                <div className="relative">
                  <Textarea
                    value={projectBrief}
                    onChange={(event) => setProjectBrief(event.target.value)}
                    name="description"
                    placeholder="Enter Project Brief......."
                    className="min-h-[236px] pr-12 text-[12px]"
                  />
                  <label className="absolute bottom-3 right-3 cursor-pointer text-[#b4bbb5] transition-colors hover:text-brand">
                    <input
                      type="file"
                      multiple
                      className="hidden"
                      onChange={(event) =>
                        setBriefAttachments(
                          event.target.files
                            ? Array.from(event.target.files)
                            : [],
                        )
                      }
                    />
                    <Paperclip className="h-5 w-5" />
                  </label>
                </div>
              </label>

              {briefAttachments.length > 0 ? (
                <Card className="mt-3 rounded-[16px] border border-[#dce6dd] shadow-none">
                  <CardContent className="px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[12px] font-semibold text-brand">
                        Selected Attachments
                      </p>
                      <Badge variant="secondary">{briefAttachments.length}</Badge>
                    </div>
                    <ul className="mt-2 space-y-2">
                      {briefAttachments.map((file) => (
                        <li
                          key={`${file.name}-${file.size}`}
                          className="flex items-center justify-between gap-3 rounded-[12px] bg-[#f7faf7] px-3 py-2"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-[12px] font-medium text-[#243028]">
                              {file.name}
                            </p>
                            <p className="text-[11px] text-[#7a837b]">
                              {formatFileSize(file.size)}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeBriefAttachment(file.name)}
                            className="cursor-pointer text-[#9aa49c] transition-colors hover:text-[#cf4f44]"
                            aria-label={`Remove ${file.name}`}
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-3 text-[11px] text-[#7a837b]">
                      Files are currently selected in the UI only. Backend file storage is not connected yet.
                    </p>
                  </CardContent>
                </Card>
              ) : null}
            </div>
          </div>

          <div className="grid gap-4 2xl:grid-cols-2">
          <MonthPicker
            label="Project Start Date"
            value={startDate}
            onSelect={setStartDate}
            month={startMonth}
            onMonthChange={setStartMonth}
          />
          <MonthPicker
            label="Project End Date"
            value={endDate}
            onSelect={setEndDate}
            month={endMonth}
            onMonthChange={setEndMonth}
          />
          </div>

          <div>
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-[16px] font-[600] text-brand">Project Stages</h3>
              <Button
                type="button"
                onClick={addStage}
                variant="outline"
                size="sm"
                className="text-[12px]"
              >
                <Plus className="h-4 w-4" />
                Add Stage
              </Button>
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
              {stages.map((stage, index) => (
                <Card key={stage.id} className="rounded-[18px] shadow-[0_14px_32px_rgba(22,38,29,0.06)]">
                  <CardContent className="p-4">
                    <Input
                      value={stage.name}
                      onChange={(event) =>
                        updateStage(stage.id, { name: event.target.value })
                      }
                      name="stageNames"
                      className="min-h-[38px] border-brand text-center text-[14px] font-[500] text-brand"
                    />
                    <Input
                      value={stage.budget}
                      onChange={(event) =>
                        updateStage(stage.id, {
                          budget: event.target.value.replace(/[^\d]/g, ""),
                        })
                      }
                      name="stageBudgets"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      placeholder={`Stage ${index + 1} Budget...`}
                      className="mt-3 h-[38px] bg-[#f7faf7] text-[12px]"
                    />
                    <Textarea
                      value={stage.description}
                      onChange={(event) =>
                        updateStage(stage.id, { description: event.target.value })
                      }
                      name="stageDescriptions"
                      placeholder={`Stage ${index + 1} Description...`}
                      className="mt-3 min-h-[84px] bg-[#f7faf7] text-[12px]"
                    />
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card className="border border-brand/40">
          <CardHeader className="pb-3">
          <CardTitle className="text-[21px] text-brand">
            Project Overview
          </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
          <dl className="mt-3 space-y-1.5 text-[13px] text-[#242b26]">
            <div>
              <dt className="inline font-[700]">Budget :</dt>{" "}
              <dd className="inline">{overview.budget}</dd>
            </div>
            <div>
              <dt className="inline font-[700]">Stages :</dt>{" "}
              <dd className="inline">{overview.stages}</dd>
            </div>
            <div>
              <dt className="inline font-[700]">Project Started :</dt>{" "}
              <dd className="inline">{overview.started}</dd>
            </div>
            <div>
              <dt className="inline font-[700]">Project Deadline :</dt>{" "}
              <dd className="inline">{overview.deadline}</dd>
            </div>
            <div>
              <dt className="inline font-[700]">Tag :</dt>{" "}
              <dd className="inline">{overview.tag}</dd>
            </div>
            <div>
              <dt className="inline font-[700]">Status :</dt>{" "}
              <dd className="inline">{overview.status}</dd>
            </div>
            <div>
              <dt className="inline font-[700]">Priority :</dt>{" "}
              <dd className="inline">{overview.priority}</dd>
            </div>
          </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
          <CardTitle className="text-[20px] text-[#111712]">
            Project Collaborators
          </CardTitle>
          </CardHeader>

          <CardContent className="pt-0">
          <div className="mt-1">
            <h3 className="text-[16px] font-[700] text-[#86c864]">Internal</h3>
            <div className="mt-3 space-y-2">
              {internalCollaborators.map((collaborator) => (
                <Badge
                  key={collaborator.id}
                  variant="secondary"
                  className="mr-2 bg-[#f3faf4] text-[13px] font-[500] text-brand"
                >
                  {collaborator.name}
                </Badge>
              ))}
              <Button
                type="button"
                onClick={() => addCollaborator("internal")}
                variant="ghost"
                size="sm"
                className="px-0 text-[14px] font-[600] text-brand"
              >
                Invite+
              </Button>
            </div>
          </div>

          <div className="mt-8">
            <h3 className="text-[16px] font-[700] text-[#86c864]">External</h3>
            <div className="mt-3 space-y-2">
              {externalCollaborators.map((collaborator) => (
                <Badge
                  key={collaborator.id}
                  variant="secondary"
                  className="mr-2 bg-[#f3faf4] text-[13px] font-[500] text-brand"
                >
                  {collaborator.name}
                </Badge>
              ))}
              <Button
                type="button"
                onClick={() => addCollaborator("external")}
                variant="ghost"
                size="sm"
                className="px-0 text-[14px] font-[600] text-brand"
              >
                Invite+
              </Button>
            </div>
          </div>

          <Separator className="mt-6" />
          <CreateProjectSubmitButton />
          </CardContent>
        </Card>
      </div>
    </form>
  );
}
