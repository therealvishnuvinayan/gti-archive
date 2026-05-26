CREATE TYPE "SubmissionReviewStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED');

ALTER TABLE "ProjectAttachment"
ADD COLUMN "reviewNote" TEXT,
ADD COLUMN "reviewedAt" TIMESTAMP(3),
ADD COLUMN "reviewedById" TEXT,
ADD COLUMN "submissionReviewStatus" "SubmissionReviewStatus";

CREATE INDEX "ProjectAttachment_reviewedById_idx" ON "ProjectAttachment"("reviewedById");
CREATE INDEX "ProjectAttachment_submissionReviewStatus_idx" ON "ProjectAttachment"("submissionReviewStatus");

ALTER TABLE "ProjectAttachment"
ADD CONSTRAINT "ProjectAttachment_reviewedById_fkey"
FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
