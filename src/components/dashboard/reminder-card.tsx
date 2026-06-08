"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, ChevronLeft, ChevronRight } from "lucide-react";

import type { DashboardReminderRecord } from "@/lib/dashboard";

type ReminderCardProps = {
  title: string;
  reminders: DashboardReminderRecord[];
  detailHref?: string;
  emptyMessage?: string;
};

export function ReminderCard({
  title,
  reminders,
  detailHref,
  emptyMessage = "No reminders right now.",
}: ReminderCardProps) {
  const [requestedIndex, setRequestedIndex] = useState(0);
  const activeIndex = Math.min(requestedIndex, Math.max(reminders.length - 1, 0));
  const activeReminder = reminders[activeIndex];
  const hasMultipleReminders = reminders.length > 1;

  function showPreviousReminder() {
    setRequestedIndex((current) => Math.max(current - 1, 0));
  }

  function showNextReminder() {
    setRequestedIndex((current) => Math.min(current + 1, reminders.length - 1));
  }

  return (
    <article className="min-w-0 rounded-[24px] bg-card p-5 shadow-[0_18px_45px_rgba(23,39,28,0.08)] transition-shadow hover:shadow-[0_22px_52px_rgba(23,39,28,0.12)] sm:p-6">
      <div className="mb-5 flex min-w-0 items-start justify-between gap-3">
        <h2 className="min-w-0 truncate text-[17px] font-extrabold leading-none tracking-[-0.02em] text-[#111712]">
          {title}
        </h2>
        {detailHref ? (
          <Link
            href={detailHref}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[#1e241f] bg-white text-[#111712] transition-colors hover:bg-brand-soft"
            aria-label={`${title} details`}
            title={`${title} details`}
          >
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        ) : null}
      </div>

      {activeReminder ? (
        <div className="space-y-4 rounded-[18px] border border-transparent p-1 transition-colors hover:border-[#d8e6d8] hover:bg-[#f5faf5]">
          <div className="min-w-0">
            <div className="mb-3 flex min-w-0 flex-wrap items-center gap-2">
              <span className="rounded-full bg-[#eaf4ec] px-2.5 py-1 text-[11px] font-[800] uppercase tracking-[0.08em] text-[#2b8055]">
                Reminder
              </span>
              {activeReminder.statusLabel ? (
                <span className="rounded-full bg-[#fff2dc] px-2.5 py-1 text-[11px] font-[800] uppercase tracking-[0.08em] text-[#9a5b00]">
                  {activeReminder.statusLabel}
                </span>
              ) : null}
            </div>

            <p className="line-clamp-2 text-[20px] font-bold leading-[1.12] tracking-[-0.03em] text-[#236e4c]">
              {activeReminder.headline}
            </p>
            <p className="mt-2 text-[13px] font-semibold leading-5 text-[#46534a]">
              {activeReminder.dateTimeLabel}
            </p>
            {activeReminder.detail ? (
              <p className="mt-1 line-clamp-2 text-[13px] leading-5 text-[#667168]">
                {activeReminder.detail}
              </p>
            ) : null}
            {activeReminder.context ? (
              <p className="mt-1 truncate text-[12px] leading-5 text-[#7c867e]">
                {activeReminder.context}
              </p>
            ) : null}
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={showPreviousReminder}
                disabled={!hasMultipleReminders || activeIndex === 0}
                className="grid h-9 w-9 place-items-center rounded-full border border-[#d6e2d6] bg-white text-[#23472f] transition-colors hover:bg-brand-soft disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Previous reminder"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={showNextReminder}
                disabled={!hasMultipleReminders || activeIndex === reminders.length - 1}
                className="grid h-9 w-9 place-items-center rounded-full border border-[#d6e2d6] bg-white text-[#23472f] transition-colors hover:bg-brand-soft disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Next reminder"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              {hasMultipleReminders ? (
                <span className="text-[12px] font-semibold text-[#667168]">
                  {activeIndex + 1} of {reminders.length}
                </span>
              ) : null}
            </div>

            <Link
              href={activeReminder.actionHref}
              className="inline-flex min-h-[40px] shrink-0 items-center justify-center rounded-full bg-[linear-gradient(90deg,#3b9b69,#13422f)] px-4 text-[13px] font-semibold text-white shadow-[0_10px_22px_rgba(35,110,76,0.18)] transition hover:-translate-y-0.5 hover:shadow-[0_14px_28px_rgba(35,110,76,0.24)]"
              title={activeReminder.actionLabel}
            >
              {activeReminder.actionLabel}
            </Link>
          </div>
        </div>
      ) : (
        <div className="rounded-[18px] border border-[#e1e9e1] bg-white/55 px-4 py-5">
          <p className="text-[14px] leading-6 text-[#758077]">{emptyMessage}</p>
        </div>
      )}
    </article>
  );
}
