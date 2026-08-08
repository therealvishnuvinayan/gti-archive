-- Extend the existing Stage 5 request and attachment records with secure
-- external-email token lifecycle and explicit responder/upload provenance.
CREATE TYPE "ProjectFileChecklistResponseSource" AS ENUM (
  'AUTHENTICATED_USER',
  'EXTERNAL_EMAIL'
);

CREATE TYPE "ProjectAttachmentUploadSource" AS ENUM (
  'AUTHENTICATED_USER',
  'EXTERNAL_CHECKLIST_REQUEST'
);

ALTER TABLE "ProjectFileChecklistRequest"
ADD COLUMN "responseSource" "ProjectFileChecklistResponseSource",
ADD COLUMN "externalTokenHash" TEXT,
ADD COLUMN "externalTokenExpiresAt" TIMESTAMP(3),
ADD COLUMN "externalTokenCreatedAt" TIMESTAMP(3),
ADD COLUMN "externalTokenRevokedAt" TIMESTAMP(3),
ADD COLUMN "externalOpenedAt" TIMESTAMP(3),
ADD COLUMN "externalResponderName" TEXT,
ADD COLUMN "externalResponderEmail" TEXT;

ALTER TABLE "ProjectAttachment"
ADD COLUMN "uploadSource" "ProjectAttachmentUploadSource" NOT NULL DEFAULT 'AUTHENTICATED_USER',
ADD COLUMN "externalUploaderName" TEXT,
ADD COLUMN "externalUploaderEmail" TEXT;

CREATE UNIQUE INDEX "ProjectFileChecklistRequest_externalTokenHash_key"
ON "ProjectFileChecklistRequest"("externalTokenHash");

CREATE INDEX "ProjectFileChecklistRequest_externalTokenExpiresAt_idx"
ON "ProjectFileChecklistRequest"("externalTokenExpiresAt");

CREATE INDEX "ProjectFileChecklistRequest_responseSource_idx"
ON "ProjectFileChecklistRequest"("responseSource");

CREATE INDEX "ProjectAttachment_uploadSource_idx"
ON "ProjectAttachment"("uploadSource");

-- Protect the exact per-file/field/email tuple against double-clicks and
-- concurrent dispatches while a manual-email request remains active.
CREATE UNIQUE INDEX "ProjectFileChecklistRequest_active_email_recipient_key"
ON "ProjectFileChecklistRequest"("checklistId", "fieldKey", "recipientEmail")
WHERE "channel" = 'EMAIL'
  AND "recipientEmail" IS NOT NULL
  AND "status" IN ('PENDING', 'SENT')
  AND "workflowStatus" IN ('REQUESTED', 'ACCEPTED');
