"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

import {
  CalendarMonthGrid,
  formatCalendarDateValue,
  parseCalendarDateValue,
} from "@/components/calendar/calendar-month-grid";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

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
  error?: string;
  isOpen: boolean;
  pending?: boolean;
  submitLabel?: string;
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

const timeOptions = Array.from({ length: 48 }, (_, index) => {
  const hours = Math.floor(index / 2);
  const minutes = index % 2 === 0 ? "00" : "30";
  return `${String(hours).padStart(2, "0")}:${minutes}`;
});

function formatDisplayDate(value: string) {
  const date = parseCalendarDateValue(value);
  const day = `${date.getDate()}`.padStart(2, "0");
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  return `${day}/${month}/${date.getFullYear()}`;
}

function CalendarDateField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedDate = parseCalendarDateValue(value);
  const [month, setMonth] = useState(() => selectedDate);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as HTMLElement | null;

      if (target?.closest('[data-slot="select-content"]')) {
        return;
      }

      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <Button
        type="button"
        variant="secondary"
        className="h-12 w-full justify-between rounded-2xl border border-line px-4 text-[15px] font-normal text-[#18211a]"
        onClick={() => {
          setMonth(selectedDate);
          setOpen((current) => !current);
        }}
      >
        {formatDisplayDate(value)}
      </Button>
      {open ? (
        <Card className="absolute left-0 top-[calc(100%+10px)] z-20 w-[320px] rounded-[22px] border border-line p-4 shadow-[0_20px_50px_rgba(23,39,28,0.16)]">
          <CalendarMonthGrid
            month={month}
            selectedDate={selectedDate}
            onMonthChange={setMonth}
            onSelect={(date) => {
              onChange(formatCalendarDateValue(date));
              setMonth(date);
              setOpen(false);
            }}
            compact
          />
          <div className="mt-3 flex items-center justify-between">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="px-0 text-[12px] text-brand"
              onClick={() => {
                const today = new Date();
                onChange(formatCalendarDateValue(today));
                setMonth(today);
                setOpen(false);
              }}
            >
              Today
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="px-0 text-[12px] text-[#6a706b]"
              onClick={() => setOpen(false)}
            >
              Close
            </Button>
          </div>
        </Card>
      ) : null}
    </div>
  );
}

export function EventDialog({
  form,
  error,
  isOpen,
  pending = false,
  submitLabel = "Save Event",
  title,
  onChange,
  onClose,
  onSubmit,
}: EventDialogProps) {
  const startOptions = timeOptions;
  const endOptions = timeOptions.filter((option) => option > form.start);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#112118]/45 px-4 py-8">
      <Card className="w-full max-w-[520px] rounded-[28px] p-0 shadow-[0_35px_90px_rgba(11,26,18,0.22)]">
        <CardHeader className="flex-row items-start justify-between gap-4 pb-0">
          <div>
            <CardTitle className="text-[24px]">
              {title}
            </CardTitle>
            <p className="mt-1 text-[14px] text-[#6a706b]">
              Create a calendar item for the selected date and time.
            </p>
          </div>
          <Button
            type="button"
            onClick={onClose}
            variant="secondary"
            size="icon"
            className="border border-line text-[#253029]"
            aria-label="Close event dialog"
          >
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>

        <CardContent className="p-6 pt-5">
          {error ? (
            <div className="mb-5 rounded-[18px] border border-[#f1c7c1] bg-[#fff4f2] px-4 py-3 text-[13px] font-medium text-[#c05243]">
              {error}
            </div>
          ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="sm:col-span-2">
            <span className="mb-2 block text-[13px] font-[600] text-[#2d372f]">
              Title
            </span>
            <Input
              value={form.title}
              onChange={(event) => onChange("title", event.target.value)}
              className="h-12 rounded-2xl border-line text-[15px] text-[#18211a]"
              placeholder="Design review"
            />
          </label>

          <label>
            <span className="mb-2 block text-[13px] font-[600] text-[#2d372f]">
              Date
            </span>
            <CalendarDateField value={form.date} onChange={(value) => onChange("date", value)} />
          </label>

          <label>
            <span className="mb-2 block text-[13px] font-[600] text-[#2d372f]">
              Calendar
            </span>
            <Select
              value={form.calendar}
              onValueChange={(value) => onChange("calendar", value as CalendarType)}
            >
              <SelectTrigger className="h-12 rounded-2xl border border-line text-[15px] text-[#18211a]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {calendarOptions.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <label>
            <span className="mb-2 block text-[13px] font-[600] text-[#2d372f]">
              Start
            </span>
            <Select value={form.start} onValueChange={(value) => onChange("start", value)}>
              <SelectTrigger className="h-12 rounded-2xl border border-line text-[15px] text-[#18211a]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {startOptions.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <label>
            <span className="mb-2 block text-[13px] font-[600] text-[#2d372f]">
              End
            </span>
            <Select value={form.end} onValueChange={(value) => onChange("end", value)}>
              <SelectTrigger className="h-12 rounded-2xl border border-line text-[15px] text-[#18211a]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {endOptions.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <label className="sm:col-span-2">
            <span className="mb-2 block text-[13px] font-[600] text-[#2d372f]">
              Details
            </span>
            <Textarea
              value={form.details}
              onChange={(event) => onChange("details", event.target.value)}
              className="min-h-[96px] rounded-2xl border border-line text-[15px] text-[#18211a]"
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
                  } cursor-pointer`}
                >
                  <span className={`h-3 w-3 rounded-full ${option.swatch}`} />
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <Button
            type="button"
            onClick={onClose}
            variant="secondary"
            size="lg"
            className="border border-line px-6 text-[15px] text-[#2f3a32]"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={onSubmit}
            disabled={pending}
            size="lg"
            className={`px-7 text-[15px] ${
              pending
                ? "cursor-not-allowed bg-[linear-gradient(90deg,#6ca989,#397453)]"
                : ""
            }`}
          >
            {pending ? "Saving..." : submitLabel}
          </Button>
        </div>
        </CardContent>
      </Card>
    </div>
  );
}
