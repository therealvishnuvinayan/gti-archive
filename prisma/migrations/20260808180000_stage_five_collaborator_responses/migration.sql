-- Keep email/in-app delivery state separate from the authenticated collaborator
-- response lifecycle, while extending the existing Stage 5 request records.
CREATE TYPE "ProjectFileChecklistRequestWorkflowStatus" AS ENUM (
  'REQUESTED',
  'ACCEPTED',
  'COMPLETED',
  'DECLINED',
  'CANCELLED'
);

ALTER TYPE "NotificationType" ADD VALUE 'CHECKLIST_INFORMATION_COMPLETED';
ALTER TYPE "NotificationType" ADD VALUE 'CHECKLIST_INFORMATION_DECLINED';

ALTER TABLE "ProjectFileChecklistRequest"
ADD COLUMN "workflowStatus" "ProjectFileChecklistRequestWorkflowStatus" NOT NULL DEFAULT 'REQUESTED',
ADD COLUMN "acceptedAt" TIMESTAMP(3),
ADD COLUMN "completedAt" TIMESTAMP(3),
ADD COLUMN "declinedAt" TIMESTAMP(3),
ADD COLUMN "declineReason" TEXT,
ADD COLUMN "respondedByUserId" TEXT;

ALTER TABLE "ProjectFileChecklistRequest"
ADD CONSTRAINT "ProjectFileChecklistRequest_respondedByUserId_fkey"
FOREIGN KEY ("respondedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "ProjectFileChecklistRequest_workflowStatus_requestedAt_idx"
ON "ProjectFileChecklistRequest"("workflowStatus", "requestedAt");

CREATE INDEX "ProjectFileChecklistRequest_respondedByUserId_idx"
ON "ProjectFileChecklistRequest"("respondedByUserId");

-- Prevent double-clicks and concurrent submissions from creating two active
-- requests for the exact same per-file checklist field and authenticated user.
CREATE UNIQUE INDEX "ProjectFileChecklistRequest_active_recipient_key"
ON "ProjectFileChecklistRequest"("checklistId", "fieldKey", "recipientUserId")
WHERE "channel" = 'IN_APP'
  AND "recipientUserId" IS NOT NULL
  AND "workflowStatus" IN ('REQUESTED', 'ACCEPTED');
