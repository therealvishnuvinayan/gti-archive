import { createHash } from "node:crypto";
import { unstable_cache } from "next/cache";

import {
  MAX_STAGE_SUMMARY_CONTEXT_CHARACTERS,
  summarizeStageActivityWithOpenAI,
} from "@/lib/ai/openai";
import {
  PROJECTS_CACHE_TAG,
  type ProjectChatEntry,
  type ProjectStageRecord,
} from "@/lib/projects";

const MAX_SUMMARY_CHARACTERS = 220;
const MAX_ENTRY_BODY_CHARACTERS = 280;
const MAX_CONTEXT_ENTRIES = 18;

function normalizeInlineText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  const truncated = value.slice(0, maxLength - 3).trimEnd();
  return `${truncated}...`;
}

export function getStageActivityFallback(
  stage: Pick<ProjectStageRecord, "status">,
) {
  if (stage.status === "pending") {
    return "This stage is ready to begin.";
  }

  return "No stage activity yet.";
}

function buildAttachmentSummary(entry: ProjectChatEntry) {
  const attachments = entry.attachments ?? [];

  if (attachments.length === 0) {
    return "";
  }

  const attachmentLabels = attachments.slice(0, 4).map((attachment) => {
    const parts = [attachment.originalFileName];

    if (attachment.isSubmission) {
      parts.push("submission");
    }

    if (attachment.submissionReviewStatus) {
      parts.push(attachment.submissionReviewStatus.toLowerCase().replaceAll("_", " "));
    }

    return parts.join(" ");
  });

  const remainingCount = attachments.length - attachmentLabels.length;
  return `Attachments: ${attachmentLabels.join(", ")}${
    remainingCount > 0 ? `, +${remainingCount} more` : ""
  }.`;
}

function buildEntryLine(entry: ProjectChatEntry) {
  const body = truncateText(
    normalizeInlineText(entry.body),
    MAX_ENTRY_BODY_CHARACTERS,
  );
  const details = [
    entry.kind,
    entry.title,
    entry.revisionNumber ? `Revision ${entry.revisionNumber}` : "",
    entry.revisionStatus
      ? `status ${entry.revisionStatus.toLowerCase().replaceAll("_", " ")}`
      : "",
    entry.rejectionReason
      ? `rejection note ${normalizeInlineText(entry.rejectionReason)}`
      : "",
    body,
    buildAttachmentSummary(entry),
    entry.comparison
      ? `Compared ${entry.comparison.baseFileName} with ${entry.comparison.compareFileName}.`
      : "",
  ].filter(Boolean);

  return `- ${entry.createdAt}: ${details.join(" | ")}`;
}

function buildStageActivityContext(entries: ProjectChatEntry[]) {
  const lines = entries.slice(-MAX_CONTEXT_ENTRIES).map(buildEntryLine);
  const context = lines.join("\n");

  return truncateText(context, MAX_STAGE_SUMMARY_CONTEXT_CHARACTERS);
}

function buildHistorySignature(entries: ProjectChatEntry[]) {
  const payload = entries.map((entry) => ({
    id: entry.id,
    kind: entry.kind,
    title: entry.title ?? null,
    body: entry.body,
    revisionStatus: entry.revisionStatus ?? null,
    rejectionReason: entry.rejectionReason ?? null,
    createdAt: entry.createdAt,
    attachments: (entry.attachments ?? []).map((attachment) => ({
      id: attachment.id,
      name: attachment.originalFileName,
      submissionReviewStatus: attachment.submissionReviewStatus ?? null,
    })),
    comparison: entry.comparison
      ? {
          baseAttachmentId: entry.comparison.baseAttachmentId,
          compareAttachmentId: entry.comparison.compareAttachmentId,
          body: entry.body,
        }
      : null,
  }));

  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function normalizeSummary(summary: string, fallback: string) {
  const normalized = normalizeInlineText(summary);

  if (!normalized) {
    return fallback;
  }

  return truncateText(normalized, MAX_SUMMARY_CHARACTERS);
}

export async function generateOrFetchStageActivitySummary(input: {
  userId: string;
  projectId: string;
  stage: Pick<ProjectStageRecord, "id" | "name" | "status" | "statusLabel">;
  entries: ProjectChatEntry[];
}) {
  const fallback = getStageActivityFallback(input.stage);

  if (input.entries.length === 0) {
    return fallback;
  }

  const context = buildStageActivityContext(input.entries);

  if (!context) {
    return fallback;
  }

  const signature = buildHistorySignature(input.entries);
  const getCachedSummary = unstable_cache(
    async () => {
      const summary = await summarizeStageActivityWithOpenAI({
        stageName: input.stage.name,
        stageStatus: input.stage.statusLabel,
        context,
      });

      return normalizeSummary(summary, fallback);
    },
    [
      "stage-activity-summary",
      input.userId,
      input.projectId,
      input.stage.id,
      signature,
    ],
    {
      revalidate: 600,
      tags: [PROJECTS_CACHE_TAG],
    },
  );

  try {
    return await getCachedSummary();
  } catch {
    return fallback;
  }
}
