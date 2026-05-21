"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { ChevronLeft, ChevronRight, Paperclip, Plus, X } from "lucide-react";

import { createProjectAction } from "@/app/projects/new/actions";
import {
  initialProjectFormState,
  type ProjectFormState,
} from "@/app/projects/new/project-form-state";

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
};

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

const monthNames = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

function formatDateValue(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfWeek(date: Date) {
  const copy = new Date(date);
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function buildMonthGrid(month: Date) {
  const start = new Date(month.getFullYear(), month.getMonth(), 1);
  const end = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const gridStart = startOfWeek(start);
  const gridEnd = addDays(startOfWeek(end), 6);
  const days: Date[] = [];

  for (let current = new Date(gridStart); current <= gridEnd; current = addDays(current, 1)) {
    days.push(new Date(current));
  }

  return days;
}

function isSameDay(left: Date | null, right: Date) {
  if (!left) {
    return false;
  }

  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function MonthPicker({
  label,
  value,
  onSelect,
  month,
  onMonthChange,
}: MonthPickerProps) {
  const yearOptions = Array.from({ length: 11 }, (_, index) => 2021 + index);
  const days = buildMonthGrid(month);

  return (
    <div>
      <h3 className="mb-2 text-[16px] font-[600] text-brand">{label}</h3>
      <div className="rounded-[16px] bg-white p-4 shadow-[0_14px_32px_rgba(22,38,29,0.06)]">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <select
              value={month.getMonth()}
              onChange={(event) =>
                onMonthChange(
                  new Date(
                    month.getFullYear(),
                    Number(event.target.value),
                    1,
                  ),
                )
              }
              className="rounded-full border border-[#e3e8e2] bg-[#fbfcfa] px-3 py-1 text-[11px] font-[700] text-[#202822] outline-none"
            >
              {monthNames.map((monthName, index) => (
                <option key={monthName} value={index}>
                  {monthName}
                </option>
              ))}
            </select>
            <select
              value={month.getFullYear()}
              onChange={(event) =>
                onMonthChange(
                  new Date(
                    Number(event.target.value),
                    month.getMonth(),
                    1,
                  ),
                )
              }
              className="rounded-full border border-[#e3e8e2] bg-[#fbfcfa] px-3 py-1 text-[11px] font-[700] text-[#202822] outline-none"
            >
              {yearOptions.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() =>
                onMonthChange(new Date(month.getFullYear(), month.getMonth() - 1, 1))
              }
              className="cursor-pointer text-brand"
              aria-label={`Previous month for ${label}`}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() =>
                onMonthChange(new Date(month.getFullYear(), month.getMonth() + 1, 1))
              }
              className="cursor-pointer text-brand"
              aria-label={`Next month for ${label}`}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-y-2 text-center text-[8px] font-[700] uppercase text-[#6f776f]">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
            <span key={day}>{day}</span>
          ))}
        </div>

        <div className="mt-3 grid grid-cols-7 gap-y-2 text-center text-[10px]">
          {days.map((day) => {
            const active = isSameDay(value, day);
            const inMonth = day.getMonth() === month.getMonth();

            return (
              <button
                key={day.toISOString()}
                type="button"
                onClick={() => onSelect(day)}
                className={`mx-auto grid h-5 w-5 cursor-pointer place-items-center rounded-full ${
                  active
                    ? "bg-[#d8d3ff] text-[#7158f7]"
                    : inMonth
                      ? "text-[#1f2621] hover:bg-[#eef1ea]"
                      : "text-[#b7bcb7]"
                }`}
              >
                {day.getDate()}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CreateProjectSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
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
    </button>
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
  const [projectBrief, setProjectBrief] = useState("");
  const [projectStatus, setProjectStatus] = useState<ProjectStatusValue>("ONGOING");
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [startMonth, setStartMonth] = useState(new Date());
  const [endMonth, setEndMonth] = useState(new Date());
  const [stages, setStages] = useState<StageForm[]>([
    { id: "stage-1", name: "Stage 1", budget: "" },
  ]);
  const [internalCollaborators, setInternalCollaborators] = useState<CollaboratorEntry[]>([]);
  const [externalCollaborators, setExternalCollaborators] = useState<CollaboratorEntry[]>([]);
  const [briefAttachments, setBriefAttachments] = useState<File[]>([]);

  const overview = useMemo(
    () => ({
      budget: projectBudget ? `${projectBudget} USD` : "—",
      stages: stages.length,
      started: startDate ? formatDateValue(startDate) : "—",
      deadline: endDate ? formatDateValue(endDate) : "—",
      tag: projectTag || "—",
      status:
        projectStatusOptions.find((option) => option.value === projectStatus)?.label || "—",
      priority: "Medium",
    }),
    [projectBudget, projectTag, projectStatus, stages.length, startDate, endDate],
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
      <input type="hidden" name="status" value={projectStatus} />
      <input
        type="hidden"
        name="currentStageName"
        value={stages[0]?.name?.trim() || "Stage 1"}
      />
      <input type="hidden" name="stageCount" value={String(stages.length)} />

      <section className="rounded-[20px] bg-surface p-6 shadow-[0_18px_45px_rgba(23,39,28,0.05)]">
        <div className="rounded-[20px] bg-[linear-gradient(135deg,#466d58,#5e8f75)] px-6 py-4 text-white shadow-[0_18px_45px_rgba(23,39,28,0.08)]">
          <h1 className="text-[18px] font-[700] tracking-[-0.02em]">Create a project</h1>
        </div>

        {formState.error ? (
          <p className="mt-5 rounded-2xl border border-[#f5c7c2] bg-[#fff4f3] px-4 py-3 text-[13px] font-medium text-[#ba3f31]">
            {formState.error}
          </p>
        ) : null}

        <div className="mt-6 grid items-start gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <div className="space-y-4">
            <label className="block">
              <span className="mb-2 block text-[16px] font-[600] text-brand">
                Project Name
              </span>
              <input
                value={projectName}
                onChange={(event) => setProjectName(event.target.value)}
                name="name"
                placeholder="Enter Project Name....."
                className="h-[34px] w-full rounded-full bg-white px-4 text-[12px] text-[#29322c] outline-none transition-shadow duration-200 focus:shadow-[0_0_0_3px_rgba(43,128,85,0.14)]"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-[16px] font-[600] text-brand">
                Project Category
              </span>
              <input
                value={projectCategory}
                onChange={(event) => setProjectCategory(event.target.value)}
                name="category"
                placeholder="Enter Project Category....."
                className="h-[34px] w-full rounded-full bg-white px-4 text-[12px] text-[#29322c] outline-none transition-shadow duration-200 focus:shadow-[0_0_0_3px_rgba(43,128,85,0.14)]"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-[16px] font-[600] text-brand">
                Project Budget
              </span>
              <input
                value={projectBudget}
                onChange={(event) => handleBudgetChange(event.target.value)}
                name="budget"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="Enter Project Budget in USD...."
                className="h-[34px] w-full rounded-full bg-white px-4 text-[12px] text-[#29322c] outline-none transition-shadow duration-200 focus:shadow-[0_0_0_3px_rgba(43,128,85,0.14)]"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-[16px] font-[600] text-brand">
                Project Tag
              </span>
              <input
                value={projectTag}
                onChange={(event) => setProjectTag(event.target.value)}
                name="tag"
                placeholder="Enter Project Tag....."
                className="h-[34px] w-full rounded-full bg-white px-4 text-[12px] text-[#29322c] outline-none transition-shadow duration-200 focus:shadow-[0_0_0_3px_rgba(43,128,85,0.14)]"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-[16px] font-[600] text-brand">
                Project Status
              </span>
              <select
                value={projectStatus}
                onChange={(event) =>
                  setProjectStatus(event.target.value as ProjectStatusValue)
                }
                className="h-[34px] w-full rounded-full bg-white px-4 text-[12px] font-medium text-[#29322c] outline-none transition-shadow duration-200 focus:shadow-[0_0_0_3px_rgba(43,128,85,0.14)]"
              >
                {projectStatusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div>
            <label className="block">
              <span className="mb-2 block text-[16px] font-[600] text-brand">
                Project Brief
              </span>
              <div className="relative rounded-[18px] bg-white">
                <textarea
                  value={projectBrief}
                  onChange={(event) => setProjectBrief(event.target.value)}
                  name="description"
                  placeholder="Enter Project Brief......."
                  className="min-h-[236px] w-full resize-none rounded-[18px] bg-transparent px-4 py-4 pr-12 text-[12px] text-[#29322c] outline-none transition-shadow duration-200 focus:shadow-[0_0_0_3px_rgba(43,128,85,0.14)]"
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
              <div className="mt-3 rounded-[16px] border border-[#dce6dd] bg-white px-4 py-3">
                <p className="text-[12px] font-semibold text-brand">
                  Selected Attachments
                </p>
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
                <p className="mt-2 text-[11px] text-[#7a837b]">
                  Files are currently selected in the UI only. Backend file storage is not connected yet.
                </p>
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-6 grid gap-4 2xl:grid-cols-2">
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

        <div className="mt-6">
          <div className="flex items-center justify-between gap-4">
            <h3 className="text-[16px] font-[600] text-brand">Project Stages</h3>
            <button
              type="button"
              onClick={addStage}
              className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-brand/30 bg-white px-3 py-1.5 text-[12px] font-semibold text-brand transition-colors hover:bg-[#f3faf4]"
            >
              <Plus className="h-4 w-4" />
              Add Stage
            </button>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {stages.map((stage, index) => (
              <div key={stage.id} className="rounded-[18px] bg-white p-4 shadow-[0_14px_32px_rgba(22,38,29,0.06)]">
                <input
                  value={stage.name}
                  onChange={(event) =>
                    updateStage(stage.id, { name: event.target.value })
                  }
                  name="stageNames"
                  className="inline-flex min-h-[38px] w-full rounded-full border border-brand bg-white px-5 text-center text-[14px] font-[500] text-brand outline-none"
                />
                <input
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
                  className="mt-3 h-[34px] w-full rounded-full bg-[#f7faf7] px-4 text-[12px] text-[#29322c] outline-none"
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="space-y-4">
        <aside className="rounded-[20px] border border-brand/40 bg-white p-5 shadow-[0_18px_45px_rgba(23,39,28,0.05)]">
          <h2 className="text-[21px] font-[700] tracking-[-0.03em] text-brand">
            Project Overview
          </h2>
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
        </aside>
        <aside className="rounded-[20px] bg-white p-5 shadow-[0_18px_45px_rgba(23,39,28,0.05)]">
          <h2 className="text-[20px] font-[700] tracking-[-0.03em] text-[#111712]">
            Project Collaborators
          </h2>

          <div className="mt-5">
            <h3 className="text-[16px] font-[700] text-[#86c864]">Internal</h3>
            <div className="mt-3 space-y-2">
              {internalCollaborators.map((collaborator) => (
                <div key={collaborator.id} className="text-[14px] font-[500] text-brand">
                  {collaborator.name}
                </div>
              ))}
              <button
                type="button"
                onClick={() => addCollaborator("internal")}
                className="cursor-pointer text-[14px] font-[600] text-brand"
              >
                Invite+
              </button>
            </div>
          </div>

          <div className="mt-8">
            <h3 className="text-[16px] font-[700] text-[#86c864]">External</h3>
            <div className="mt-3 space-y-2">
              {externalCollaborators.map((collaborator) => (
                <div key={collaborator.id} className="text-[14px] font-[500] text-brand">
                  {collaborator.name}
                </div>
              ))}
              <button
                type="button"
                onClick={() => addCollaborator("external")}
                className="cursor-pointer text-[14px] font-[600] text-brand"
              >
                Invite+
              </button>
            </div>
          </div>

          <CreateProjectSubmitButton />
        </aside>
      </div>
    </form>
  );
}
