"use client";

import { useEffect, useMemo, useState } from "react";
import { AlarmClock } from "lucide-react";

import { cn } from "@/lib/utils";

function formatDeadline(deadline: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(deadline);
}

function formatDuration(milliseconds: number) {
  const totalSeconds = Math.floor(Math.abs(milliseconds) / 1_000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  }

  return `${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
}

export function ConceptDeadlineTimer({ deadline }: { deadline?: string | null }) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const updateNow = () => setNow(Date.now());
    const initialTimer = window.setTimeout(updateNow, 0);
    const interval = window.setInterval(updateNow, 1_000);

    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(interval);
    };
  }, []);

  const state = useMemo(() => {
    const parsedDeadline = deadline ? new Date(deadline) : null;
    const deadlineMs =
      parsedDeadline && !Number.isNaN(parsedDeadline.getTime())
        ? parsedDeadline.getTime()
        : null;

    if (!parsedDeadline || deadlineMs === null) {
      return {
        label: "Deadline not set",
        dateLabel: null,
        overdue: false,
        dueSoon: false,
      };
    }

    const difference = now === null ? null : deadlineMs - now;
    const overdue = difference !== null && difference < 0;
    const dueSoon =
      difference !== null && difference >= 0 && difference <= 24 * 60 * 60 * 1_000;

    return {
      label:
        difference === null
          ? "Calculating…"
          : overdue
            ? `Overdue by ${formatDuration(difference)}`
            : `${formatDuration(difference)} remaining`,
      dateLabel: formatDeadline(parsedDeadline),
      overdue,
      dueSoon,
    };
  }, [deadline, now]);

  return (
    <div
      className={cn(
        "flex min-h-12 w-full shrink-0 items-center gap-2.5 rounded-[12px] border px-3 py-2 lg:w-auto lg:min-w-[210px]",
        state.overdue
          ? "border-[#efcbc5] bg-[#fff5f3] text-[#ae433b]"
          : state.dueSoon
            ? "border-[#efdcae] bg-[#fff9eb] text-[#9a6718]"
            : "border-[#cfe2d3] bg-[#f1f8f3] text-[#276f4a]",
      )}
      role="timer"
      aria-label={`Concept deadline: ${state.label}`}
    >
      <AlarmClock className="h-4 w-4 shrink-0" />
      <div className="min-w-0">
        <p className="text-[8px] font-[800] uppercase tracking-[0.08em] opacity-75">
          Concept deadline
        </p>
        <p className="truncate text-[11px] font-[800]">{state.label}</p>
        {state.dateLabel ? (
          <p className="truncate text-[9px] font-[650] opacity-75">Due {state.dateLabel}</p>
        ) : null}
      </div>
    </div>
  );
}
