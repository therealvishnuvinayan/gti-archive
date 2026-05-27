"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  CalendarMonthGrid,
  formatCalendarDateValue,
  parseCalendarDateValue,
} from "@/components/calendar/calendar-month-grid";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const timeOptions = Array.from({ length: 48 }, (_, index) => {
  const hours = Math.floor(index / 2);
  const minutes = index % 2 === 0 ? "00" : "30";
  const suffix = hours >= 12 ? "PM" : "AM";
  const twelveHour = hours % 12 === 0 ? 12 : hours % 12;

  return {
    value: `${String(hours).padStart(2, "0")}:${minutes}`,
    label: `${twelveHour}:${minutes} ${suffix}`,
  };
});

function getTodayDateValue() {
  return formatCalendarDateValue(new Date());
}

function getDefaultTimeValue() {
  return "09:00";
}

function parseDateTimeValue(value: string) {
  if (!value || !value.includes("T")) {
    return {
      date: getTodayDateValue(),
      time: getDefaultTimeValue(),
    };
  }

  const [date, time] = value.split("T");
  return {
    date: date || getTodayDateValue(),
    time: time?.slice(0, 5) || getDefaultTimeValue(),
  };
}

function formatDisplayDateTime(value: string) {
  if (!value || !value.includes("T")) {
    return "Select date & time";
  }

  const [dateValue, timeValue] = value.split("T");
  const date = parseCalendarDateValue(dateValue);

  if (Number.isNaN(date.getTime())) {
    return "Select date & time";
  }

  const [hoursString, minutesString] = (timeValue || getDefaultTimeValue()).split(":");
  const hours = Number(hoursString);
  const minutes = minutesString ?? "00";
  const suffix = hours >= 12 ? "PM" : "AM";
  const twelveHour = hours % 12 === 0 ? 12 : hours % 12;
  const day = `${date.getDate()}`.padStart(2, "0");
  const month = `${date.getMonth() + 1}`.padStart(2, "0");

  return `${day}/${month}/${date.getFullYear()}, ${twelveHour}:${minutes} ${suffix}`;
}

type DateTimePickerProps = {
  name: string;
  value: string;
  onChange: (value: string) => void;
  minDate?: Date | null;
  maxDate?: Date | null;
};

type PickerPosition = {
  top: number;
  left: number;
  width: number;
};

export function DateTimePicker({
  name,
  value,
  onChange,
  minDate = null,
  maxDate = null,
}: DateTimePickerProps) {
  const [open, setOpen] = useState(false);
  const [{ date, time }, setDraft] = useState(() => parseDateTimeValue(value));
  const [month, setMonth] = useState(() => parseCalendarDateValue(parseDateTimeValue(value).date));
  const [position, setPosition] = useState<PickerPosition | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  function isDateOutsideBounds(candidate: Date) {
    const compareDate = new Date(candidate);
    compareDate.setHours(0, 0, 0, 0);

    if (minDate) {
      const minBoundary = new Date(minDate);
      minBoundary.setHours(0, 0, 0, 0);

      if (compareDate < minBoundary) {
        return true;
      }
    }

    if (maxDate) {
      const maxBoundary = new Date(maxDate);
      maxBoundary.setHours(0, 0, 0, 0);

      if (compareDate > maxBoundary) {
        return true;
      }
    }

    return false;
  }

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as HTMLElement | null;

      if (target?.closest('[data-slot^="select-"]')) {
        return;
      }

      if (
        !containerRef.current?.contains(event.target as Node) &&
        !panelRef.current?.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    function updatePosition() {
      const trigger = containerRef.current;

      if (!trigger) {
        return;
      }

      const triggerRect = trigger.getBoundingClientRect();
      const panelHeight = panelRef.current?.getBoundingClientRect().height ?? 430;
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;
      const desiredWidth = Math.min(320, viewportWidth - 32);
      const spaceBelow = viewportHeight - triggerRect.bottom - 16;
      const spaceAbove = triggerRect.top - 16;
      const openUpward = spaceBelow < panelHeight && spaceAbove > spaceBelow;

      const unclampedLeft = triggerRect.left;
      const maxLeft = Math.max(16, viewportWidth - desiredWidth - 16);
      const left = Math.min(Math.max(16, unclampedLeft), maxLeft);
      const top = openUpward
        ? Math.max(16, triggerRect.top - panelHeight - 10)
        : Math.min(
            viewportHeight - panelHeight - 16,
            triggerRect.bottom + 10,
          );

      setPosition({
        top,
        left,
        width: desiredWidth,
      });
    }

    updatePosition();

    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, date, time]);

  const pickerPanel =
    open && typeof document !== "undefined" && position
      ? createPortal(
          <div
            ref={panelRef}
            className="fixed z-[70]"
            style={{
              top: position.top,
              left: position.left,
              width: position.width,
              maxHeight: "calc(100vh - 32px)",
            }}
          >
            <Card className="rounded-[22px] border border-line p-4 shadow-[0_20px_50px_rgba(23,39,28,0.16)]">
              <div className="overflow-y-auto pr-1" style={{ maxHeight: "calc(100vh - 64px)" }}>
                <CalendarMonthGrid
                  month={month}
                  selectedDate={parseCalendarDateValue(date)}
                  onMonthChange={setMonth}
                  isDateDisabled={isDateOutsideBounds}
                  onSelect={(selectedDate) =>
                    !isDateOutsideBounds(selectedDate) &&
                    setDraft((current) => ({
                      ...current,
                      date: formatCalendarDateValue(selectedDate),
                    }))
                  }
                  compact
                />

                <div className="mt-4">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6f7d72]">
                    Time
                  </p>
                  <Select
                    value={time}
                    onValueChange={(nextTime) =>
                      setDraft((current) => ({ ...current, time: nextTime }))
                    }
                  >
                    <SelectTrigger className="h-10 rounded-2xl border border-line bg-white text-[13px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="z-[120]">
                      {timeOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="mt-4 flex items-center justify-between gap-3">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="px-0 text-[12px] text-brand"
                    onClick={() => {
                      const today = new Date();
                      const nextDate = formatCalendarDateValue(today);
                      setDraft({
                        date: nextDate,
                        time: getDefaultTimeValue(),
                      });
                      setMonth(today);
                    }}
                  >
                    Today
                  </Button>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-[12px] text-[#6a706b]"
                      onClick={() => setOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="text-[12px]"
                      onClick={() => {
                        onChange(`${date}T${time}`);
                        setOpen(false);
                      }}
                    >
                      Apply
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          </div>,
          document.body,
        )
      : null;

  return (
    <div ref={containerRef} className="relative">
      <input type="hidden" name={name} value={value} />
      <Button
        type="button"
        variant="secondary"
        className="mt-3 flex h-[38px] w-full justify-between rounded-2xl border border-line bg-[#f7faf7] px-4 text-left text-[12px] font-normal text-[#18211a]"
        onClick={() => {
          const parsed = parseDateTimeValue(value);
          setDraft(parsed);
          setMonth(parseCalendarDateValue(parsed.date));
          setOpen((current) => !current);
        }}
      >
        <span className="truncate">{formatDisplayDateTime(value)}</span>
      </Button>
      {pickerPanel}
    </div>
  );
}
