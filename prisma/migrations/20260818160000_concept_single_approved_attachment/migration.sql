-- A concept has one designated approved attachment. Older approval logic copied the
-- approved status to every formal file in the selected revision, which made sibling
-- files appear approved too. Keep only the folder's designated attachment approved.
UPDATE "ProjectAttachment" AS attachment
SET
  "submissionReviewStatus" = 'PENDING_REVIEW',
  "reviewedById" = NULL,
  "reviewedAt" = NULL,
  "reviewNote" = NULL,
  "updatedAt" = CURRENT_TIMESTAMP
FROM "ProjectConceptFolder" AS concept
WHERE concept."approvedAttachmentId" IS NOT NULL
  AND attachment."projectId" = concept."projectId"
  AND attachment."stageId" = concept."taskerStageId"
  AND attachment."id" <> concept."approvedAttachmentId"
  AND attachment."status" = 'READY'
  AND attachment."assetType" IN ('STAGE_SUBMISSION', 'REVISION_ORIGINAL')
  AND attachment."submissionReviewStatus" = 'APPROVED';

-- If an approval was replaced with a file from another revision, retain only the
-- revision containing the currently designated attachment as approved.
UPDATE "ProjectRevision" AS revision
SET
  "status" = 'PENDING_REVIEW',
  "reviewedById" = NULL,
  "reviewedAt" = NULL,
  "rejectionReason" = NULL,
  "updatedAt" = CURRENT_TIMESTAMP
FROM "ProjectConceptFolder" AS concept
JOIN "ProjectAttachment" AS approved_attachment
  ON approved_attachment."id" = concept."approvedAttachmentId"
WHERE revision."projectId" = concept."projectId"
  AND revision."stageId" = concept."taskerStageId"
  AND revision."id" <> approved_attachment."revisionId"
  AND revision."status" = 'APPROVED';
