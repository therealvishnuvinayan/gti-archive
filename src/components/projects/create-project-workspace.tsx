"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Paperclip, Plus } from "lucide-react";

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
  const monthTitle = month.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
  const days = buildMonthGrid(month);

  return (
    <div>
      <h3 className="mb-2 text-[16px] font-[600] text-brand">{label}</h3>
      <div className="rounded-[16px] bg-white p-4 shadow-[0_14px_32px_rgba(22,38,29,0.06)]">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[11px] font-[700] text-[#202822]">{monthTitle}</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() =>
                onMonthChange(new Date(month.getFullYear(), month.getMonth() - 1, 1))
              }
              className="text-brand"
              aria-label={`Previous month for ${label}`}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() =>
                onMonthChange(new Date(month.getFullYear(), month.getMonth() + 1, 1))
              }
              className="text-brand"
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
                className={`mx-auto grid h-5 w-5 place-items-center rounded-full ${
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

export function CreateProjectWorkspace() {
  const [projectName, setProjectName] = useState("");
  const [projectCategory, setProjectCategory] = useState("");
  const [projectBudget, setProjectBudget] = useState("");
  const [projectBrief, setProjectBrief] = useState("");
  const [startDate, setStartDate] = useState<Date | null>(new Date(2025, 3, 14));
  const [endDate, setEndDate] = useState<Date | null>(new Date(2025, 4, 14));
  const [startMonth, setStartMonth] = useState(new Date(2025, 3, 1));
  const [endMonth, setEndMonth] = useState(new Date(2025, 4, 1));
  const [stages, setStages] = useState<StageForm[]>([
    { id: "stage-1", name: "Stage 1", budget: "" },
  ]);
  const [internalCollaborators, setInternalCollaborators] = useState<CollaboratorEntry[]>([]);
  const [externalCollaborators, setExternalCollaborators] = useState<CollaboratorEntry[]>([]);

  const overview = useMemo(
    () => ({
      budget: projectBudget || "",
      stages: stages.length,
      started: startDate ? formatDateValue(startDate) : "",
      deadline: endDate ? formatDateValue(endDate) : "",
      tag: projectCategory || "",
      priority: "Medium",
    }),
    [projectBudget, projectCategory, stages.length, startDate, endDate],
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

  return (
    <section className="space-y-6">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_250px]">
        <div className="rounded-[20px] bg-[linear-gradient(135deg,#466d58,#5e8f75)] px-6 py-4 text-white shadow-[0_18px_45px_rgba(23,39,28,0.08)]">
          <h1 className="text-[18px] font-[700] tracking-[-0.02em]">Create a project</h1>
        </div>

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
              <dt className="inline font-[700]">Priority :</dt>{" "}
              <dd className="inline">{overview.priority}</dd>
            </div>
          </dl>
        </aside>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_250px]">
        <section className="rounded-[20px] bg-surface p-6 shadow-[0_18px_45px_rgba(23,39,28,0.05)]">
          <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
            <div className="space-y-4">
              <label className="block">
                <span className="mb-2 block text-[16px] font-[600] text-brand">
                  Project Name
                </span>
                <input
                  value={projectName}
                  onChange={(event) => setProjectName(event.target.value)}
                  placeholder="Enter Project Name....."
                  className="h-[34px] w-full rounded-full bg-white px-4 text-[12px] text-[#29322c] outline-none"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-[16px] font-[600] text-brand">
                  Project Category
                </span>
                <input
                  value={projectCategory}
                  onChange={(event) => setProjectCategory(event.target.value)}
                  placeholder="Enter Project Category....."
                  className="h-[34px] w-full rounded-full bg-white px-4 text-[12px] text-[#29322c] outline-none"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-[16px] font-[600] text-brand">
                  Project Budget
                </span>
                <input
                  value={projectBudget}
                  onChange={(event) => setProjectBudget(event.target.value)}
                  placeholder="Enter Project Budget in USD...."
                  className="h-[34px] w-full rounded-full bg-white px-4 text-[12px] text-[#29322c] outline-none"
                />
              </label>
            </div>

            <label className="block">
              <span className="mb-2 block text-[16px] font-[600] text-brand">
                Project Brief
              </span>
              <div className="relative h-full min-h-[164px] rounded-[18px] bg-white">
                <textarea
                  value={projectBrief}
                  onChange={(event) => setProjectBrief(event.target.value)}
                  placeholder="Enter Project Brief......."
                  className="h-full min-h-[164px] w-full resize-none rounded-[18px] bg-transparent px-4 py-4 text-[12px] text-[#29322c] outline-none"
                />
                <Paperclip className="absolute bottom-3 right-3 h-5 w-5 text-[#b4bbb5]" />
              </div>
            </label>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
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
            <h3 className="mb-3 text-[16px] font-[600] text-brand">Project Stages</h3>
            <div className="space-y-3">
              {stages.map((stage, index) => (
                <div key={stage.id} className="max-w-[290px]">
                  <div className="flex items-center gap-3">
                    <div className="inline-flex min-h-[34px] min-w-[114px] items-center justify-center rounded-full border border-brand bg-white px-5 text-[14px] font-[500] text-brand">
                      {stage.name || `Stage ${index + 1}`}
                    </div>
                    {index === stages.length - 1 ? (
                      <button
                        type="button"
                        onClick={addStage}
                        className="text-brand"
                        aria-label="Add stage"
                      >
                        <Plus className="h-5 w-5" />
                      </button>
                    ) : null}
                  </div>
                  <input
                    value={stage.budget}
                    onChange={(event) =>
                      updateStage(stage.id, { budget: event.target.value })
                    }
                    placeholder={`Stage ${index + 1} Budget...`}
                    className="mt-2 h-[32px] w-full rounded-full bg-white px-4 text-[11px] text-[#29322c] outline-none"
                  />
                </div>
              ))}
            </div>
          </div>
        </section>

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
                className="text-[14px] font-[600] text-brand"
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
                className="text-[14px] font-[600] text-brand"
              >
                Invite+
              </button>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
