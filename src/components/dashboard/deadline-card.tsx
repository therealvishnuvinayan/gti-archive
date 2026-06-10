"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, ChevronLeft, ChevronRight } from "lucide-react";

import type { DashboardDeadlineRecord } from "@/lib/dashboard";

type DeadlineCardProps = {
  title: string;
  deadlines: DashboardDeadlineRecord[];
  actionLabel?: string;
  emptyMessage?: string;
};

export function DeadlineCard({
  title,
  deadlines,
  actionLabel = "Open Project",
  emptyMessage = "No upcoming deadlines.",
}: DeadlineCardProps) {
  const [requestedIndex, setRequestedIndex] = useState(0);
  const activeIndex = Math.min(requestedIndex, Math.max(deadlines.length - 1, 0));
  const activeDeadline = deadlines[activeIndex];
  const hasMultipleDeadlines = deadlines.length > 1;

  function showPreviousDeadline() {
    setRequestedIndex((current) => Math.max(current - 1, 0));
  }

  function showNextDeadline() {
    setRequestedIndex((current) => Math.min(current + 1, deadlines.length - 1));
  }

  return (
    <article className="relative flex h-full min-h-[300px] min-w-0 flex-col overflow-hidden rounded-[24px] bg-[#07130e] p-5 text-white shadow-[0_20px_55px_rgba(7,19,14,0.28)] sm:p-6">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(92,165,123,0.32),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(44,124,82,0.46),transparent_30%),linear-gradient(145deg,#0a1610,#08110d_55%,#040807)]" />
      <div className="absolute -left-10 top-8 h-40 w-40 rounded-full border border-white/10" />
      <div className="absolute -right-12 bottom-10 h-44 w-44 rounded-full border border-brand/30" />
      <div className="absolute inset-x-4 bottom-14 h-24 rounded-full bg-[radial-gradient(circle,rgba(59,138,94,0.65),transparent_60%)] blur-2xl" />

      <div className="relative flex min-h-0 flex-1 flex-col">
        <div className="mb-6 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[17px] font-extrabold leading-none">{title}</h2>
            {activeDeadline ? (
              <p className="mt-2 truncate text-[14px] text-white/85">{activeDeadline.project}</p>
            ) : null}
          </div>
          {activeDeadline ? (
            <Link
              href={activeDeadline.actionHref}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/40 bg-white/5 text-white backdrop-blur-sm transition-colors hover:bg-white/15"
              aria-label={`${title} details`}
              title={`${title} details`}
            >
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          ) : null}
        </div>

        {activeDeadline ? (
          <div className="flex min-h-0 flex-1 flex-col justify-between gap-4">
            <p
              className={`text-center text-[32px] font-bold leading-tight ${
                activeDeadline.overdue ? "text-[#ffb9a8]" : ""
              }`}
            >
              {activeDeadline.timeLabel}
            </p>
            {activeDeadline.detail ? (
              <p className="line-clamp-2 text-center text-[14px] leading-5 text-white/80">
                {activeDeadline.detail}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <button
                  type="button"
                  onClick={showPreviousDeadline}
                  disabled={!hasMultipleDeadlines || activeIndex === 0}
                  className="grid h-9 w-9 place-items-center rounded-full border border-white/25 bg-white/5 text-white transition hover:-translate-y-0.5 hover:border-white/45 hover:bg-white/15 disabled:translate-y-0 disabled:cursor-not-allowed disabled:border-white/15 disabled:bg-white/5 disabled:opacity-40"
                  aria-label="Previous deadline"
                  title="Previous deadline"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={showNextDeadline}
                  disabled={!hasMultipleDeadlines || activeIndex === deadlines.length - 1}
                  className="grid h-9 w-9 place-items-center rounded-full border border-white/25 bg-white/5 text-white transition hover:-translate-y-0.5 hover:border-white/45 hover:bg-white/15 disabled:translate-y-0 disabled:cursor-not-allowed disabled:border-white/15 disabled:bg-white/5 disabled:opacity-40"
                  aria-label="Next deadline"
                  title="Next deadline"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
                {hasMultipleDeadlines ? (
                  <span className="text-[12px] font-semibold text-white/72">
                    {activeIndex + 1} of {deadlines.length}
                  </span>
                ) : null}
              </div>

              <Link
                href={activeDeadline.actionHref}
                className="inline-flex min-h-[42px] min-w-[132px] flex-1 items-center justify-center rounded-full bg-white px-5 text-[14px] font-semibold text-[#101612] transition-transform hover:-translate-y-0.5 sm:flex-none"
                title={actionLabel}
              >
                {actionLabel}
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 place-items-center rounded-[18px] border border-dashed border-white/18 bg-white/[0.04] px-4 py-6 text-center">
            <p className="text-[14px] leading-6 text-white/78">{emptyMessage}</p>
          </div>
        )}
      </div>
    </article>
  );
}
