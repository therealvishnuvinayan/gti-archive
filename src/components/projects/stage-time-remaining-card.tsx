"use client";

import { useEffect, useMemo, useState } from "react";
import { AlarmClockCheck, CalendarDays } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type StageTimeRemainingCardProps = {
  stageStartAt?: string | null;
  stageDueAt?: string | null;
};

type CountdownState = {
  hasDeadline: boolean;
  isOverdue: boolean;
  days: string;
  hours: string;
  minutes: string;
  statusLabel: "On track" | "Due soon" | "Overdue" | "No deadline";
  helperText: string;
  progressPercent: number | null;
  progressLabel: string | null;
  deadlineLabel: string | null;
};

function formatStageDate(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

function pad(value: number) {
  return String(Math.max(0, value)).padStart(2, "0");
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function buildCountdownState(
  nowMs: number,
  stageStartAt?: string | null,
  stageDueAt?: string | null,
): CountdownState {
  const dueDate = stageDueAt ? new Date(stageDueAt) : null;
  const startDate = stageStartAt ? new Date(stageStartAt) : null;
  const dueMs = dueDate && !Number.isNaN(dueDate.getTime()) ? dueDate.getTime() : null;
  const startMs =
    startDate && !Number.isNaN(startDate.getTime()) ? startDate.getTime() : null;

  if (!dueMs) {
    return {
      hasDeadline: false,
      isOverdue: false,
      days: "—",
      hours: "—",
      minutes: "—",
      statusLabel: "No deadline",
      helperText: "No deadline set",
      progressPercent: null,
      progressLabel: null,
      deadlineLabel: null,
    };
  }

  const diffMs = dueMs - nowMs;
  const absoluteMinutes = Math.floor(Math.abs(diffMs) / (1000 * 60));
  const days = Math.floor(absoluteMinutes / (60 * 24));
  const hours = Math.floor((absoluteMinutes % (60 * 24)) / 60);
  const minutes = absoluteMinutes % 60;
  const isOverdue = diffMs < 0;
  const isDueSoon = !isOverdue && diffMs <= 24 * 60 * 60 * 1000;
  const statusLabel: CountdownState["statusLabel"] = isOverdue
    ? "Overdue"
    : isDueSoon
      ? "Due soon"
      : "On track";

  let progressPercent: number | null = null;
  let progressLabel: string | null = null;

  if (startMs && dueMs > startMs) {
    if (isOverdue) {
      progressPercent = 100;
      progressLabel = "Deadline passed";
    } else {
      const totalWindow = dueMs - startMs;
      const remainingWindow = dueMs - nowMs;
      progressPercent = clamp((remainingWindow / totalWindow) * 100, 0, 100);
      progressLabel = `${Math.round(progressPercent)}% time remaining`;
    }
  }

  return {
    hasDeadline: true,
    isOverdue,
    days: pad(days),
    hours: pad(hours),
    minutes: pad(minutes),
    statusLabel,
    helperText: isOverdue
      ? `${days > 0 ? `${days}d ` : ""}${hours}h ${minutes}m overdue`
      : `${days > 0 ? `${days}d ` : ""}${hours}h ${minutes}m remaining`,
    progressPercent,
    progressLabel,
    deadlineLabel: formatStageDate(new Date(dueMs)),
  };
}

function getStatusClasses(statusLabel: CountdownState["statusLabel"]) {
  switch (statusLabel) {
    case "Overdue":
      return {
        badge: "bg-[#fff1ef] text-[#c45d53]",
        bar: "bg-[linear-gradient(90deg,#d9645b,#bb4d49)]",
      };
    case "Due soon":
      return {
        badge: "bg-[#fff6e6] text-[#c4871e]",
        bar: "bg-[linear-gradient(90deg,#e3ae43,#d79118)]",
      };
    case "On track":
      return {
        badge: "bg-[#eef8f0] text-[#2f8d5d]",
        bar: "bg-[linear-gradient(90deg,#2f8d5d,#1f6d49)]",
      };
    default:
      return {
        badge: "bg-[#f3f5f3] text-[#738076]",
        bar: "bg-[#d9dfda]",
      };
  }
}

export function StageTimeRemainingCard({
  stageStartAt,
  stageDueAt,
}: StageTimeRemainingCardProps) {
  const [nowMs, setNowMs] = useState<number | null>(null);

  useEffect(() => {
    const syncNow = () => {
      setNowMs(Date.now());
    };

    const initialTimer = window.setTimeout(syncNow, 0);

    const timer = window.setInterval(() => {
      syncNow();
    }, 60_000);

    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, []);

  const countdown = useMemo(() => {
    if (nowMs === null) {
      const dueDate = stageDueAt ? new Date(stageDueAt) : null;
      const hasDeadline = Boolean(dueDate && !Number.isNaN(dueDate.getTime()));

      return {
        hasDeadline,
        isOverdue: false,
        days: "—",
        hours: "—",
        minutes: "—",
        statusLabel: hasDeadline ? "On track" : "No deadline",
        helperText: hasDeadline ? "Calculating remaining time…" : "No deadline set",
        progressPercent: null,
        progressLabel: null,
        deadlineLabel: hasDeadline ? formatStageDate(dueDate as Date) : null,
      } satisfies CountdownState;
    }

    return buildCountdownState(nowMs, stageStartAt, stageDueAt);
  }, [nowMs, stageDueAt, stageStartAt]);
  const statusClasses = getStatusClasses(countdown.statusLabel);

  return (
    <Card className="rounded-[20px] border border-[#dbe7dd] shadow-none">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <AlarmClockCheck className="h-5 w-5 text-brand" />
          <CardTitle className="text-[20px] text-brand">Time Remaining</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        <div className="flex items-center justify-between gap-3">
          <span
            className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-[700] ${statusClasses.badge}`}
          >
            {countdown.statusLabel}
          </span>
          <span className="text-[11px] text-[#6f786f]">{countdown.helperText}</span>
        </div>

        {countdown.hasDeadline ? (
          <>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "Days", value: countdown.days },
                { label: "Hours", value: countdown.hours },
                { label: "Minutes", value: countdown.minutes },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-[16px] border border-[#e4ebe4] bg-[#fbfcfa] px-3 py-3 text-center"
                >
                  <p className="text-[12px] font-[800] leading-none text-[#173120] sm:text-[13px]">
                    {item.value}
                  </p>
                  <p className="mt-1 text-[10px] text-[#728074]">{item.label}</p>
                </div>
              ))}
            </div>

            <div className="flex items-start gap-2 text-[12px] text-[#4f5d52]">
              <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
              <div>
                <p className="font-[600]">Due on {countdown.deadlineLabel}</p>
              </div>
            </div>

            {countdown.progressPercent !== null ? (
              <div className="space-y-1.5">
                <div className="h-2 overflow-hidden rounded-full bg-[#edf2ed]">
                  <div
                    className={`h-full rounded-full transition-[width] duration-300 ${statusClasses.bar}`}
                    style={{ width: `${countdown.progressPercent}%` }}
                  />
                </div>
                {countdown.progressLabel ? (
                  <p className="text-[11px] text-[#6f786f]">{countdown.progressLabel}</p>
                ) : null}
              </div>
            ) : null}
          </>
        ) : (
          <div className="rounded-[16px] border border-dashed border-[#d7dfd8] bg-[#fbfcfa] px-4 py-5 text-center text-[12px] text-[#728074]">
            No deadline set
          </div>
        )}
      </CardContent>
    </Card>
  );
}
