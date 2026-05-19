"use client";

import { X } from "lucide-react";

export type CalendarType = "Projects" | "Events" | "Reminders" | "Payments";
export type EventTone = "green" | "purple" | "blue" | "amber";

export type CalendarFormState = {
  title: string;
  details: string;
  date: string;
  start: string;
  end: string;
  calendar: CalendarType;
  tone: EventTone;
};

type EventDialogProps = {
  form: CalendarFormState;
  isOpen: boolean;
  title: string;
  onChange: <K extends keyof CalendarFormState>(
    field: K,
    value: CalendarFormState[K],
  ) => void;
  onClose: () => void;
  onSubmit: () => void;
};

const calendarOptions: CalendarType[] = [
  "Projects",
  "Events",
  "Reminders",
  "Payments",
];

const toneOptions: Array<{ tone: EventTone; label: string; swatch: string }> = [
  { tone: "green", label: "Green", swatch: "bg-[#50b848]" },
  { tone: "purple", label: "Purple", swatch: "bg-[#8f4bf6]" },
  { tone: "blue", label: "Blue", swatch: "bg-[#37a0ff]" },
  { tone: "amber", label: "Amber", swatch: "bg-[#f3a11a]" },
];

export function EventDialog({
  form,
  isOpen,
  title,
  onChange,
  onClose,
  onSubmit,
}: EventDialogProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#112118]/45 px-4 py-8">
      <div className="w-full max-w-[520px] rounded-[28px] bg-white p-6 shadow-[0_35px_90px_rgba(11,26,18,0.22)]">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[24px] font-[700] tracking-[-0.03em] text-[#111712]">
              {title}
            </h2>
            <p className="mt-1 text-[14px] text-[#6a706b]">
              Create a calendar item for the selected date and time.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-10 w-10 place-items-center rounded-full border border-line text-[#253029]"
            aria-label="Close event dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="sm:col-span-2">
            <span className="mb-2 block text-[13px] font-[600] text-[#2d372f]">
              Title
            </span>
            <input
              value={form.title}
              onChange={(event) => onChange("title", event.target.value)}
              className="h-12 w-full rounded-2xl border border-line px-4 text-[15px] text-[#18211a] outline-none transition-colors focus:border-brand"
              placeholder="Design review"
            />
          </label>

          <label>
            <span className="mb-2 block text-[13px] font-[600] text-[#2d372f]">
              Date
            </span>
            <input
              type="date"
              value={form.date}
              onChange={(event) => onChange("date", event.target.value)}
              className="h-12 w-full rounded-2xl border border-line px-4 text-[15px] text-[#18211a] outline-none transition-colors focus:border-brand"
            />
          </label>

          <label>
            <span className="mb-2 block text-[13px] font-[600] text-[#2d372f]">
              Calendar
            </span>
            <select
              value={form.calendar}
              onChange={(event) =>
                onChange("calendar", event.target.value as CalendarType)
              }
              className="h-12 w-full rounded-2xl border border-line px-4 text-[15px] text-[#18211a] outline-none transition-colors focus:border-brand"
            >
              {calendarOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className="mb-2 block text-[13px] font-[600] text-[#2d372f]">
              Start
            </span>
            <input
              type="time"
              value={form.start}
              onChange={(event) => onChange("start", event.target.value)}
              className="h-12 w-full rounded-2xl border border-line px-4 text-[15px] text-[#18211a] outline-none transition-colors focus:border-brand"
            />
          </label>

          <label>
            <span className="mb-2 block text-[13px] font-[600] text-[#2d372f]">
              End
            </span>
            <input
              type="time"
              value={form.end}
              onChange={(event) => onChange("end", event.target.value)}
              className="h-12 w-full rounded-2xl border border-line px-4 text-[15px] text-[#18211a] outline-none transition-colors focus:border-brand"
            />
          </label>

          <label className="sm:col-span-2">
            <span className="mb-2 block text-[13px] font-[600] text-[#2d372f]">
              Details
            </span>
            <textarea
              value={form.details}
              onChange={(event) => onChange("details", event.target.value)}
              className="min-h-[96px] w-full rounded-2xl border border-line px-4 py-3 text-[15px] text-[#18211a] outline-none transition-colors focus:border-brand"
              placeholder="Optional notes, location, or attendees"
            />
          </label>
        </div>

        <div className="mt-5">
          <span className="mb-2 block text-[13px] font-[600] text-[#2d372f]">
            Color
          </span>
          <div className="flex flex-wrap gap-2">
            {toneOptions.map((option) => {
              const active = form.tone === option.tone;

              return (
                <button
                  key={option.tone}
                  type="button"
                  onClick={() => onChange("tone", option.tone)}
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-[13px] font-[600] transition-colors ${
                    active
                      ? "border-brand bg-brand-soft text-brand"
                      : "border-line text-[#566059]"
                  }`}
                >
                  <span className={`h-3 w-3 rounded-full ${option.swatch}`} />
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-[48px] items-center justify-center rounded-full border border-line px-6 text-[15px] font-[600] text-[#2f3a32]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSubmit}
            className="inline-flex min-h-[48px] items-center justify-center rounded-full bg-[linear-gradient(90deg,#2f8d5d,#123f2d)] px-7 text-[15px] font-[600] text-white"
          >
            Save Event
          </button>
        </div>
      </div>
    </div>
  );
}
