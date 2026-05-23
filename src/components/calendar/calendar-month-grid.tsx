"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const weekdayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
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

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfWeek(date: Date) {
  const copy = new Date(date);
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function getWeeksForMonth(anchor: Date) {
  const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  const gridStart = startOfWeek(start);
  const gridEnd = addDays(startOfWeek(end), 6);
  const days: Date[] = [];

  for (let current = new Date(gridStart); current <= gridEnd; current = addDays(current, 1)) {
    days.push(new Date(current));
  }

  const weeks: Date[][] = [];
  for (let index = 0; index < days.length; index += 7) {
    weeks.push(days.slice(index, index + 7));
  }

  return weeks;
}

export function getCalendarMonthWeeks(anchor: Date) {
  return getWeeksForMonth(anchor);
}

export function isSameCalendarDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

export function formatCalendarDateValue(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseCalendarDateValue(value: string) {
  return new Date(`${value}T00:00:00`);
}

type CalendarMonthGridProps = {
  month: Date;
  selectedDate: Date;
  onMonthChange: (date: Date) => void;
  onSelect: (date: Date) => void;
  markerDates?: Set<string>;
  compact?: boolean;
  className?: string;
};

export function CalendarMonthGrid({
  month,
  selectedDate,
  onMonthChange,
  onSelect,
  markerDates,
  compact = false,
  className,
}: CalendarMonthGridProps) {
  const weeks = getWeeksForMonth(month);
  const yearOptions = Array.from({ length: 21 }, (_, index) => month.getFullYear() - 10 + index);
  const compactSelectClassName =
    "h-7 min-w-0 border-none bg-transparent pl-0 pr-3 text-[11px] font-[700] text-[#111712] shadow-none focus-visible:ring-0 [&_svg]:h-3 [&_svg]:w-3";

  return (
    <div className={cn(compact ? "space-y-3" : "space-y-4", className)}>
      <div
        className={cn(
          "flex items-center justify-between gap-2",
          compact && "justify-start gap-1.5",
        )}
      >
        <div
          className={cn(
            "flex min-w-0 flex-1 items-center gap-2",
            compact && "min-w-fit flex-none gap-1.5",
          )}
        >
          <Select
            value={String(month.getMonth())}
            onValueChange={(value) =>
              onMonthChange(new Date(month.getFullYear(), Number(value), 1))
            }
          >
            <SelectTrigger
              className={cn(
                "border-none bg-transparent px-0 font-[700] text-[#111712] shadow-none focus-visible:ring-0",
                compact
                  ? cn(compactSelectClassName, "w-[72px] flex-none")
                  : "h-9 w-[138px] text-[16px]",
              )}
            >
              <SelectValue>{monthNames[month.getMonth()]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {monthNames.map((monthName, index) => (
                <SelectItem key={monthName} value={String(index)}>
                  {monthName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={String(month.getFullYear())}
            onValueChange={(value) =>
              onMonthChange(new Date(Number(value), month.getMonth(), 1))
            }
          >
            <SelectTrigger
              className={cn(
                "border-none bg-transparent px-0 font-[700] text-[#111712] shadow-none focus-visible:ring-0",
                compact
                  ? cn(compactSelectClassName, "w-[84px] flex-none")
                  : "h-9 w-[92px] text-[16px]",
              )}
            >
              <SelectValue>{month.getFullYear()}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {yearOptions.map((year) => (
                <SelectItem key={year} value={String(year)}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className={cn("flex shrink-0 items-center gap-1", compact && "ml-auto gap-0")}>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn("text-brand", compact ? "size-6 p-0" : "size-8")}
            onClick={() => onMonthChange(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
            aria-label="Previous month"
          >
            <ChevronLeft className={compact ? "h-3 w-3" : "h-4 w-4"} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn("text-brand", compact ? "size-6 p-0" : "size-8")}
            onClick={() => onMonthChange(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
            aria-label="Next month"
          >
            <ChevronRight className={compact ? "h-3 w-3" : "h-4 w-4"} />
          </Button>
        </div>
      </div>

      <div
        className={cn(
          "grid grid-cols-7 text-center font-[700] uppercase tracking-[0.08em] text-[#7c847d]",
          compact ? "gap-y-1.5 text-[8px]" : "gap-y-3 text-[9px]",
        )}
      >
        {weekdayLabels.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>

      <div
        className={cn(
          "grid grid-cols-7 text-center",
          compact ? "gap-y-1.5 text-[12px]" : "gap-y-3 text-[13px]",
        )}
      >
        {weeks.flat().map((date) => {
          const inMonth = date.getMonth() === month.getMonth();
          const active = isSameCalendarDay(date, selectedDate);
          const hasMarker = markerDates?.has(formatCalendarDateValue(date));

          return (
            <button
              key={date.toISOString()}
              type="button"
              onClick={() => onSelect(date)}
              className={cn(
                "relative mx-auto grid place-items-center rounded-lg transition-colors",
                compact ? "h-7 w-7" : "h-8 w-8",
                active
                  ? "bg-[#dff0ff] text-brand"
                  : inMonth
                    ? "text-[#2c342e] hover:bg-[#eef2ea]"
                    : "text-[#b0b5b1]",
              )}
            >
              {date.getDate()}
              {hasMarker ? (
                <span className="absolute -bottom-0.5 h-1.5 w-1.5 rounded-full bg-brand" />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
