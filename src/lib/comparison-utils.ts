import type { ProjectAttachmentRecord, ProjectChatEntry } from "@/lib/projects";
import { isAllowedStageSubmissionFile } from "@/lib/upload-validation";

export type ComparisonCommentRecord = {
  id: string;
  isCaption: boolean;
  captionAttachmentId: string | null;
  comparisonOpacity: number | null;
  xPercent: number;
  yPercent: number;
  body: string;
  author: string;
  role: string;
  createdAt: string;
};

export type SubmissionCaptionRecord = {
  id: string;
  attachmentId: string;
  attachmentFileName: string;
  isReadOnly: boolean;
  xPercent: number;
  yPercent: number;
  body: string;
  author: string;
  role: string;
  createdAt: string;
};

export const stageSubmissionCaptionHelpText =
  "Formal stage submissions must be PNG. Only valid PNG stage submissions can be compared or captioned.";

function hasComparableSubmissionType(
  attachment: ProjectAttachmentRecord,
  projectCategory?: string | null,
) {
  return isAllowedStageSubmissionFile({
    fileName: attachment.originalFileName,
    mimeType: attachment.mimeType,
    projectCategory,
  });
}

export function isComparableStageSubmissionAttachment(
  attachment: ProjectAttachmentRecord,
  projectCategory?: string | null,
) {
  return (
    (attachment.assetType === "STAGE_SUBMISSION" ||
      attachment.assetType === "REVISION_ORIGINAL") &&
    hasComparableSubmissionType(attachment, projectCategory)
  );
}

export function isCaptionableStageSubmissionAttachment(
  attachment: ProjectAttachmentRecord,
  projectCategory?: string | null,
) {
  return (
    isComparableStageSubmissionAttachment(attachment, projectCategory) &&
    attachment.mimeType.toLowerCase() === "image/png"
  );
}

export function getStageSubmissionAttachments(
  entries: ProjectChatEntry[],
  projectCategory?: string | null,
): ProjectAttachmentRecord[] {
  const submissions = entries.flatMap((entry) =>
    (entry.attachments ?? []).filter(
      (attachment) =>
        isComparableStageSubmissionAttachment(attachment, projectCategory) ||
        (entry.kind === "revision" &&
          Boolean(attachment.submissionNumber) &&
          hasComparableSubmissionType(attachment, projectCategory)),
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
  if (submissions.length < 2) {
    return {
      baseSubmission: submissions[0] ?? null,
      compareSubmission: null,
    };
  }

  const latestSubmission = submissions.at(-1) ?? null;
  const previousSubmission = submissions.at(-2) ?? submissions[0] ?? null;
  const preferredBaseSubmission =
    submissions.find((submission) => submission.id === preferredBaseId) ?? null;
  const preferredCompareSubmission =
    submissions.find((submission) => submission.id === preferredCompareId) ?? null;

  if (
    preferredBaseSubmission &&
    preferredCompareSubmission &&
    preferredBaseSubmission.id !== preferredCompareSubmission.id
  ) {
    return {
      baseSubmission: preferredBaseSubmission,
      compareSubmission: preferredCompareSubmission,
    };
  }

  if (preferredCompareSubmission) {
    const preferredCompareIndex = submissions.findIndex(
      (submission) => submission.id === preferredCompareSubmission.id,
    );
    const fallbackBaseSubmission =
      submissions[preferredCompareIndex - 1] ??
      submissions.find((submission) => submission.id !== preferredCompareSubmission.id) ??
      null;

    return {
      baseSubmission: fallbackBaseSubmission,
      compareSubmission: preferredCompareSubmission,
    };
  }

  if (preferredBaseSubmission) {
    const fallbackCompareSubmission =
      submissions
        .slice()
        .reverse()
        .find((submission) => submission.id !== preferredBaseSubmission.id) ?? null;

    return {
      baseSubmission: preferredBaseSubmission,
      compareSubmission: fallbackCompareSubmission,
    };
  }

  return {
    baseSubmission: previousSubmission,
    compareSubmission: latestSubmission,
  };
}
