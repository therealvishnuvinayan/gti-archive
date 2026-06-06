import type { ProjectAttachmentRecord, ProjectChatEntry } from "@/lib/projects";

const comparableSubmissionExtensions = new Set(["png", "jpg", "jpeg", "webp"]);
const comparableSubmissionMimeTypes = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);

export type ComparisonCommentRecord = {
  id: string;
  xPercent: number;
  yPercent: number;
  body: string;
  author: string;
  role: string;
  createdAt: string;
};

function hasComparableSubmissionType(attachment: ProjectAttachmentRecord) {
  const extension = attachment.originalFileName.split(".").at(-1)?.toLowerCase() ?? "";

  return (
    comparableSubmissionMimeTypes.has(attachment.mimeType.toLowerCase()) ||
    comparableSubmissionExtensions.has(extension)
  );
}

export function isComparableStageSubmissionAttachment(
  attachment: ProjectAttachmentRecord,
) {
  return attachment.isSubmission && hasComparableSubmissionType(attachment);
}

export function getStageSubmissionAttachments(
  entries: ProjectChatEntry[],
): ProjectAttachmentRecord[] {
  const submissions = entries.flatMap((entry) =>
    (entry.attachments ?? []).filter(
      (attachment) =>
        isComparableStageSubmissionAttachment(attachment) ||
        (entry.kind === "revision" && hasComparableSubmissionType(attachment)),
    ),
  );

  return submissions
    .filter(
      (attachment, index, current) =>
        current.findIndex((candidate) => candidate.id === attachment.id) === index,
    )
    .sort((left, right) => {
      const sequenceDifference =
        (left.submissionNumber ?? Number.MAX_SAFE_INTEGER) -
        (right.submissionNumber ?? Number.MAX_SAFE_INTEGER);

      return sequenceDifference !== 0
        ? sequenceDifference
        : left.originalFileName.localeCompare(right.originalFileName);
    });
}

export function normalizeComparisonPairIds(
  baseAttachmentId: string,
  compareAttachmentId: string,
) {
  return [baseAttachmentId, compareAttachmentId].sort(
    (left, right) => left.localeCompare(right),
  ) as [string, string];
}

export function resolveComparisonSelection(
  submissions: ProjectAttachmentRecord[],
  preferredBaseId?: string | null,
  preferredCompareId?: string | null,
) {
  if (submissions.length === 0) {
    return {
      baseSubmission: null,
      compareSubmission: null,
    };
  }

  const baseSubmission =
    submissions.find((submission) => submission.id === preferredBaseId) ?? submissions[0];

  const compareCandidates = submissions.filter(
    (submission) => submission.id !== baseSubmission.id,
  );
  const compareSubmission =
    compareCandidates.find((submission) => submission.id === preferredCompareId) ??
    compareCandidates.at(-1) ??
    null;

  return {
    baseSubmission,
    compareSubmission,
  };
}
