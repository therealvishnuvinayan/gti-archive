"use client";

import { useEffect, useState } from "react";

type StageActivitySummaryProps = {
  projectId: string;
  stageId: string;
  fallbackSummary: string;
};

type SummaryState =
  | {
      status: "loading";
      summary: string;
    }
  | {
      status: "ready";
      summary: string;
    };

export function StageActivitySummary({
  projectId,
  stageId,
  fallbackSummary,
}: StageActivitySummaryProps) {
  const [state, setState] = useState<SummaryState>({
    status: "loading",
    summary: "Generating summary...",
  });

  useEffect(() => {
    const controller = new AbortController();

    async function loadSummary() {
      try {
        const response = await fetch(
          `/api/projects/${encodeURIComponent(projectId)}/stages/${encodeURIComponent(
            stageId,
          )}/activity-summary`,
          {
            cache: "no-store",
            signal: controller.signal,
          },
        );

        if (!response.ok) {
          throw new Error("Unable to load stage summary.");
        }

        const payload = (await response.json()) as {
          summary?: string;
        };
        const summary = payload.summary?.trim() || fallbackSummary;

        setState({
          status: "ready",
          summary,
        });
      } catch {
        if (!controller.signal.aborted) {
          setState({
            status: "ready",
            summary: fallbackSummary,
          });
        }
      }
    }

    void loadSummary();

    return () => {
      controller.abort();
    };
  }, [fallbackSummary, projectId, stageId]);

  return (
    <p
      aria-live="polite"
      className={`line-clamp-3 min-h-[60px] text-[13px] leading-5 ${
        state.status === "loading" ? "text-[#7b867e]" : "text-[#27332b]"
      }`}
    >
      {state.summary}
    </p>
  );
}
