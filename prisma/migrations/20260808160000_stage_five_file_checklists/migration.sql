-- Stage 5 receives designated Stage 4 attachments without copying their binary
-- data. Every handoff owns one independent, persistent file checklist.
ALTER TYPE "AttachmentAssetType" ADD VALUE 'FILE_CHECKLIST_ATTACHMENT';
ALTER TYPE "NotificationType" ADD VALUE 'CHECKLIST_INFORMATION_REQUESTED';
ALTER TYPE "NotificationEntityType" ADD VALUE 'CHECKLIST_REQUEST';

CREATE TYPE "ProjectFileChecklistField" AS ENUM (
  'OUTPUT_NAME',
  'TECHNICAL_DRAWING',
  'HEALTH_WARNING',
  'TAR_NICOTINE',
  'COMPULSORY_TEXT',
  'MARKETING_COPY',
  'RELATED_GRAPHICS',
  'PRINTING_TECHNOLOGY',
  'FINISHES',
  'BARCODE',
  'TRACK_TRACE',
  'THREEDS',
  'TAX_STAMP',
  'QR_CODE',
  'INVOICE'
);

CREATE TYPE "ProjectFileChecklistItemStatus" AS ENUM (
  'PENDING',
  'REQUESTED',
  'FILLED'
);

CREATE TYPE "ProjectFileChecklistRequestChannel" AS ENUM ('IN_APP', 'EMAIL');
CREATE TYPE "ProjectFileChecklistRequestStatus" AS ENUM (
  'PENDING',
  'SENT',
  'FAILED',
  'CANCELLED'
);

CREATE TABLE "ProjectStageFileHandoff" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "sourceWorkflowStageKey" "ProjectWorkflowStageKey" NOT NULL,
  "sourceAttachmentId" TEXT NOT NULL,
  "targetWorkflowStageKey" "ProjectWorkflowStageKey" NOT NULL,
  "handedOffById" TEXT NOT NULL,
  "handedOffAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ProjectStageFileHandoff_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProjectStageFileHandoff_stage_pair_check" CHECK (
    "sourceWorkflowStageKey" = 'PROJECT_DEVELOPMENT'
    AND "targetWorkflowStageKey" = 'FINAL_LAYOUT'
  )
);

CREATE TABLE "ProjectFileChecklist" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "handoffId" TEXT NOT NULL,
  "sourceAttachmentId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ProjectFileChecklist_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProjectFileChecklistItem" (
  "id" TEXT NOT NULL,
  "checklistId" TEXT NOT NULL,
  "fieldKey" "ProjectFileChecklistField" NOT NULL,
  "value" JSONB,
  "status" "ProjectFileChecklistItemStatus" NOT NULL DEFAULT 'PENDING',
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ProjectFileChecklistItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProjectFileChecklistItemAttachment" (
  "checklistItemId" TEXT NOT NULL,
  "attachmentId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ProjectFileChecklistItemAttachment_pkey"
  PRIMARY KEY ("checklistItemId", "attachmentId")
);

CREATE TABLE "ProjectFileChecklistRequest" (
  "id" TEXT NOT NULL,
  "clientRequestId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "checklistId" TEXT NOT NULL,
  "checklistItemId" TEXT NOT NULL,
  "fieldKey" "ProjectFileChecklistField" NOT NULL,
  "requestedById" TEXT NOT NULL,
  "channel" "ProjectFileChecklistRequestChannel" NOT NULL,
  "recipientUserId" TEXT,
  "recipientName" TEXT,
  "recipientEmail" TEXT,
  "message" TEXT,
  "status" "ProjectFileChecklistRequestStatus" NOT NULL DEFAULT 'PENDING',
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sentAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "failureMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ProjectFileChecklistRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProjectFileChecklistRequest_recipient_check" CHECK (
    ("channel" = 'IN_APP' AND "recipientUserId" IS NOT NULL AND "recipientEmail" IS NULL)
    OR
    ("channel" = 'EMAIL' AND "recipientUserId" IS NULL AND "recipientEmail" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "ProjectStageFileHandoff_projectId_sourceAttachmentId_targetWorkflowStageKey_key"
ON "ProjectStageFileHandoff"("projectId", "sourceAttachmentId", "targetWorkflowStageKey");
CREATE INDEX "ProjectStageFileHandoff_projectId_targetWorkflowStageKey_handedOffAt_idx"
ON "ProjectStageFileHandoff"("projectId", "targetWorkflowStageKey", "handedOffAt");
CREATE INDEX "ProjectStageFileHandoff_sourceAttachmentId_idx"
ON "ProjectStageFileHandoff"("sourceAttachmentId");
CREATE INDEX "ProjectStageFileHandoff_handedOffById_idx"
ON "ProjectStageFileHandoff"("handedOffById");

CREATE UNIQUE INDEX "ProjectFileChecklist_handoffId_key"
ON "ProjectFileChecklist"("handoffId");
CREATE UNIQUE INDEX "ProjectFileChecklist_projectId_sourceAttachmentId_key"
ON "ProjectFileChecklist"("projectId", "sourceAttachmentId");
CREATE INDEX "ProjectFileChecklist_projectId_updatedAt_idx"
ON "ProjectFileChecklist"("projectId", "updatedAt");
CREATE INDEX "ProjectFileChecklist_sourceAttachmentId_idx"
ON "ProjectFileChecklist"("sourceAttachmentId");

CREATE UNIQUE INDEX "ProjectFileChecklistItem_checklistId_fieldKey_key"
ON "ProjectFileChecklistItem"("checklistId", "fieldKey");
CREATE INDEX "ProjectFileChecklistItem_checklistId_status_idx"
ON "ProjectFileChecklistItem"("checklistId", "status");
CREATE INDEX "ProjectFileChecklistItem_updatedById_idx"
ON "ProjectFileChecklistItem"("updatedById");
CREATE INDEX "ProjectFileChecklistItemAttachment_attachmentId_idx"
ON "ProjectFileChecklistItemAttachment"("attachmentId");

CREATE UNIQUE INDEX "ProjectFileChecklistRequest_clientRequestId_key"
ON "ProjectFileChecklistRequest"("clientRequestId");
CREATE INDEX "ProjectFileChecklistRequest_projectId_requestedAt_idx"
ON "ProjectFileChecklistRequest"("projectId", "requestedAt");
CREATE INDEX "ProjectFileChecklistRequest_checklistId_fieldKey_requestedAt_idx"
ON "ProjectFileChecklistRequest"("checklistId", "fieldKey", "requestedAt");
CREATE INDEX "ProjectFileChecklistRequest_checklistItemId_requestedAt_idx"
ON "ProjectFileChecklistRequest"("checklistItemId", "requestedAt");
CREATE INDEX "ProjectFileChecklistRequest_requestedById_idx"
ON "ProjectFileChecklistRequest"("requestedById");
CREATE INDEX "ProjectFileChecklistRequest_recipientUserId_idx"
ON "ProjectFileChecklistRequest"("recipientUserId");
CREATE INDEX "ProjectFileChecklistRequest_status_requestedAt_idx"
ON "ProjectFileChecklistRequest"("status", "requestedAt");

ALTER TABLE "ProjectStageFileHandoff"
ADD CONSTRAINT "ProjectStageFileHandoff_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectStageFileHandoff"
ADD CONSTRAINT "ProjectStageFileHandoff_sourceAttachmentId_fkey"
FOREIGN KEY ("sourceAttachmentId") REFERENCES "ProjectAttachment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProjectStageFileHandoff"
ADD CONSTRAINT "ProjectStageFileHandoff_handedOffById_fkey"
FOREIGN KEY ("handedOffById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProjectFileChecklist"
ADD CONSTRAINT "ProjectFileChecklist_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectFileChecklist"
ADD CONSTRAINT "ProjectFileChecklist_handoffId_fkey"
FOREIGN KEY ("handoffId") REFERENCES "ProjectStageFileHandoff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectFileChecklist"
ADD CONSTRAINT "ProjectFileChecklist_sourceAttachmentId_fkey"
FOREIGN KEY ("sourceAttachmentId") REFERENCES "ProjectAttachment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProjectFileChecklistItem"
ADD CONSTRAINT "ProjectFileChecklistItem_checklistId_fkey"
FOREIGN KEY ("checklistId") REFERENCES "ProjectFileChecklist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectFileChecklistItem"
ADD CONSTRAINT "ProjectFileChecklistItem_updatedById_fkey"
FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProjectFileChecklistItemAttachment"
ADD CONSTRAINT "ProjectFileChecklistItemAttachment_checklistItemId_fkey"
FOREIGN KEY ("checklistItemId") REFERENCES "ProjectFileChecklistItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectFileChecklistItemAttachment"
ADD CONSTRAINT "ProjectFileChecklistItemAttachment_attachmentId_fkey"
FOREIGN KEY ("attachmentId") REFERENCES "ProjectAttachment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProjectFileChecklistRequest"
ADD CONSTRAINT "ProjectFileChecklistRequest_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectFileChecklistRequest"
ADD CONSTRAINT "ProjectFileChecklistRequest_checklistId_fkey"
FOREIGN KEY ("checklistId") REFERENCES "ProjectFileChecklist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectFileChecklistRequest"
ADD CONSTRAINT "ProjectFileChecklistRequest_checklistItemId_fkey"
FOREIGN KEY ("checklistItemId") REFERENCES "ProjectFileChecklistItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectFileChecklistRequest"
ADD CONSTRAINT "ProjectFileChecklistRequest_requestedById_fkey"
FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProjectFileChecklistRequest"
ADD CONSTRAINT "ProjectFileChecklistRequest_recipientUserId_fkey"
FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
