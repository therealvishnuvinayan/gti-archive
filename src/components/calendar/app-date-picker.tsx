"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, X } from "lucide-react";

import {
  CalendarMonthGrid,
  formatCalendarDateValue,
  parseCalendarDateValue,
} from "@/components/calendar/calendar-month-grid";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type AppDatePickerProps = {
  id?: string;
  name?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  clearable?: boolean;
  className?: string;
  triggerClassName?: string;
  minDate?: Date | null;
  maxDate?: Date | null;
};

type PickerPosition = {
  top: number;
  left: number;
  width: number;
};

function getDatePickerMonth(value: string) {
  if (!value) {
    return new Date();
  }

  const date = parseCalendarDateValue(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function formatDateDisplay(value: string, placeholder: string) {
  if (!value) {
    return placeholder;
  }

  const date = parseCalendarDateValue(value);

  if (Number.isNaN(date.getTime())) {
    return placeholder;
  }

  const day = `${date.getDate()}`.padStart(2, "0");
  const month = `${date.getMonth() + 1}`.padStart(2, "0");

  return `${day}/${month}/${date.getFullYear()}`;
}

function isDateOutsideBounds(candidate: Date, minDate?: Date | null, maxDate?: Date | null) {
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

export function AppDatePicker({
  id,
  name,
  value,
  onChange,
  placeholder = "Select date",
  disabled = false,
  required = false,
  clearable = true,
  className,
  triggerClassName,
  minDate = null,
  maxDate = null,
}: AppDatePickerProps) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => getDatePickerMonth(value));
  const [position, setPosition] = useState<PickerPosition | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const selectedDate = value ? getDatePickerMonth(value) : new Date(Number.NaN);

  useEffect(() => {
    if (!open) {
      return;
    }

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
  }, [open]);

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
      const panelHeight = panelRef.current?.getBoundingClientRect().height ?? 360;
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;
      const desiredWidth = Math.min(320, viewportWidth - 32);
      const spaceBelow = viewportHeight - triggerRect.bottom - 16;
      const spaceAbove = triggerRect.top - 16;
      const openUpward = spaceBelow < panelHeight && spaceAbove > spaceBelow;
      const maxLeft = Math.max(16, viewportWidth - desiredWidth - 16);
      const left = Math.min(Math.max(16, triggerRect.left), maxLeft);
      const top = openUpward
        ? Math.max(16, triggerRect.top - panelHeight - 10)
        : Math.max(16, Math.min(viewportHeight - panelHeight - 16, triggerRect.bottom + 10));

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
  }, [open, value]);

  const pickerPanel =
    open && typeof document !== "undefined" && position
      ? createPortal(
          <div
            ref={panelRef}
            className="fixed z-[140]"
            style={{
              top: position.top,
              left: position.left,
              width: position.width,
              maxHeight: "calc(100vh - 32px)",
            }}
          >
            <Card className="rounded-[22px] border border-line p-4 shadow-[0_20px_50px_rgba(23,39,28,0.16)]">
              <CalendarMonthGrid
                month={month}
                selectedDate={selectedDate}
                onMonthChange={setMonth}
                isDateDisabled={(date) => isDateOutsideBounds(date, minDate, maxDate)}
                onSelect={(date) => {
                  if (isDateOutsideBounds(date, minDate, maxDate)) {
                    return;
                  }

                  onChange(formatCalendarDateValue(date));
                  setMonth(date);
                  setOpen(false);
                }}
                compact
              />
              <div className="mt-4 flex items-center justify-between gap-3">
                {clearable ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="px-0 text-[12px] text-[#6a706b]"
                    onClick={() => {
                      onChange("");
                      setOpen(false);
                    }}
                  >
                    <X className="h-3.5 w-3.5" />
                    Clear
                  </Button>
                ) : (
                  <span />
                )}
                <Button
                  type="button"
                  size="sm"
                  className="text-[12px]"
                  onClick={() => {
                    const today = new Date();

                    if (isDateOutsideBounds(today, minDate, maxDate)) {
                      return;
                    }

                    onChange(formatCalendarDateValue(today));
                    setMonth(today);
                    setOpen(false);
                  }}
                >
                  Today
                </Button>
              </div>
            </Card>
          </div>,
          document.body,
        )
      : null;

  return (
    <div ref={containerRef} className={className}>
      {name ? <input type="hidden" name={name} value={value} /> : null}
      <Button
        id={id}
        type="button"
        variant="secondary"
        onClick={() => {
          const nextMonth = getDatePickerMonth(value);
          setMonth(nextMonth);
          setOpen((current) => !current);
        }}
        disabled={disabled}
        aria-required={required}
        className={
          triggerClassName ??
          "h-11 w-full justify-between rounded-2xl border border-line bg-white px-4 text-left text-[14px] font-normal text-[#18211a] shadow-none hover:bg-white"
        }
      >
        <span className={value ? "truncate text-[#18211a]" : "truncate text-[#9aa39b]"}>
          {formatDateDisplay(value, placeholder)}
        </span>
        <CalendarDays className="h-4 w-4 shrink-0 text-brand" />
      </Button>
      {pickerPanel}
    </div>
  );
}
