CREATE TYPE "ProjectWorkflowStageKey" AS ENUM (
  'PROJECT_INQUIRY',
  'PROJECT_RESEARCH_AND_PLANNING',
  'CONCEPT_CREATION',
  'PROJECT_DEVELOPMENT',
  'FINAL_LAYOUT',
  'PRODUCTION_AND_HANDOVER',
  'IMPLEMENTATION_AND_SUPERVISION'
);

CREATE TYPE "ProjectWorkflowStageStatus" AS ENUM ('LOCKED', 'AVAILABLE', 'COMPLETED');
CREATE TYPE "ProjectInquiryClientOrigin" AS ENUM ('INTERNAL', 'EXTERNAL');
CREATE TYPE "ProjectInquiryPartyRole" AS ENUM ('CLIENT', 'FINAL_BENEFICIARY');
CREATE TYPE "ProjectInquiryPartySource" AS ENUM ('USER', 'MANUAL_CONTACT');
CREATE TYPE "ProjectInquiryTargetMarketKind" AS ENUM ('COUNTRY', 'REGION', 'GLOBAL');
CREATE TYPE "ProjectInquiryPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');
CREATE TYPE "ProjectInquiryAttachmentField" AS ENUM (
  'INITIAL_BRIEF',
  'BUSINESS_OBJECTIVES',
  'LEGAL_NOTES'
);

CREATE TABLE "ProjectWorkflowStage" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "stageKey" "ProjectWorkflowStageKey" NOT NULL,
  "status" "ProjectWorkflowStageStatus" NOT NULL DEFAULT 'LOCKED',
  "unlockedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ProjectWorkflowStage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ContactDirectoryEntry" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "company" TEXT,
  "position" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ContactDirectoryEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProjectInquiry" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "clientOrigin" "ProjectInquiryClientOrigin",
  "initialBrief" TEXT,
  "businessObjectives" TEXT,
  "inquiryDate" DATE,
  "deadline" DATE,
  "legalNotes" TEXT,
  "priority" "ProjectInquiryPriority",
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ProjectInquiry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProjectInquiryParty" (
  "id" TEXT NOT NULL,
  "inquiryId" TEXT NOT NULL,
  "role" "ProjectInquiryPartyRole" NOT NULL,
  "source" "ProjectInquiryPartySource" NOT NULL,
  "userId" TEXT,
  "contactId" TEXT,
  "snapshotName" TEXT NOT NULL,
  "snapshotCompany" TEXT,
  "snapshotPosition" TEXT,
  "snapshotEmail" TEXT,
  "snapshotPhone" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ProjectInquiryParty_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProjectInquiryParty_source_check" CHECK (
    ("source" = 'USER' AND "userId" IS NOT NULL AND "contactId" IS NULL)
    OR
    ("source" = 'MANUAL_CONTACT' AND "contactId" IS NOT NULL AND "userId" IS NULL)
  )
);

CREATE TABLE "ProjectInquiryTargetMarket" (
  "id" TEXT NOT NULL,
  "inquiryId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "normalizedLabel" TEXT NOT NULL,
  "kind" "ProjectInquiryTargetMarketKind" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ProjectInquiryTargetMarket_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProjectInquiryDeliverable" (
  "id" TEXT NOT NULL,
  "inquiryId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "normalizedLabel" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ProjectInquiryDeliverable_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProjectInquiryAttachment" (
  "inquiryId" TEXT NOT NULL,
  "attachmentId" TEXT NOT NULL,
  "field" "ProjectInquiryAttachmentField" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ProjectInquiryAttachment_pkey" PRIMARY KEY ("inquiryId", "attachmentId")
);

CREATE UNIQUE INDEX "ProjectWorkflowStage_projectId_stageKey_key"
ON "ProjectWorkflowStage"("projectId", "stageKey");
CREATE INDEX "ProjectWorkflowStage_projectId_status_idx"
ON "ProjectWorkflowStage"("projectId", "status");
CREATE INDEX "ProjectWorkflowStage_stageKey_status_idx"
ON "ProjectWorkflowStage"("stageKey", "status");

CREATE INDEX "ContactDirectoryEntry_name_idx" ON "ContactDirectoryEntry"("name");
CREATE INDEX "ContactDirectoryEntry_email_idx" ON "ContactDirectoryEntry"("email");
CREATE INDEX "ContactDirectoryEntry_createdById_idx" ON "ContactDirectoryEntry"("createdById");

CREATE UNIQUE INDEX "ProjectInquiry_projectId_key" ON "ProjectInquiry"("projectId");
CREATE INDEX "ProjectInquiry_createdAt_idx" ON "ProjectInquiry"("createdAt");

CREATE UNIQUE INDEX "ProjectInquiryParty_inquiryId_role_key"
ON "ProjectInquiryParty"("inquiryId", "role");
CREATE INDEX "ProjectInquiryParty_userId_idx" ON "ProjectInquiryParty"("userId");
CREATE INDEX "ProjectInquiryParty_contactId_idx" ON "ProjectInquiryParty"("contactId");

CREATE UNIQUE INDEX "ProjectInquiryTargetMarket_inquiryId_normalizedLabel_key"
ON "ProjectInquiryTargetMarket"("inquiryId", "normalizedLabel");
CREATE INDEX "ProjectInquiryTargetMarket_normalizedLabel_idx"
ON "ProjectInquiryTargetMarket"("normalizedLabel");

CREATE UNIQUE INDEX "ProjectInquiryDeliverable_inquiryId_normalizedLabel_key"
ON "ProjectInquiryDeliverable"("inquiryId", "normalizedLabel");
CREATE INDEX "ProjectInquiryDeliverable_normalizedLabel_idx"
ON "ProjectInquiryDeliverable"("normalizedLabel");

CREATE UNIQUE INDEX "ProjectInquiryAttachment_attachmentId_key"
ON "ProjectInquiryAttachment"("attachmentId");
CREATE INDEX "ProjectInquiryAttachment_inquiryId_field_idx"
ON "ProjectInquiryAttachment"("inquiryId", "field");

ALTER TABLE "ProjectWorkflowStage"
ADD CONSTRAINT "ProjectWorkflowStage_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ContactDirectoryEntry"
ADD CONSTRAINT "ContactDirectoryEntry_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProjectInquiry"
ADD CONSTRAINT "ProjectInquiry_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectInquiryParty"
ADD CONSTRAINT "ProjectInquiryParty_inquiryId_fkey"
FOREIGN KEY ("inquiryId") REFERENCES "ProjectInquiry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectInquiryParty"
ADD CONSTRAINT "ProjectInquiryParty_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProjectInquiryParty"
ADD CONSTRAINT "ProjectInquiryParty_contactId_fkey"
FOREIGN KEY ("contactId") REFERENCES "ContactDirectoryEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProjectInquiryTargetMarket"
ADD CONSTRAINT "ProjectInquiryTargetMarket_inquiryId_fkey"
FOREIGN KEY ("inquiryId") REFERENCES "ProjectInquiry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectInquiryDeliverable"
ADD CONSTRAINT "ProjectInquiryDeliverable_inquiryId_fkey"
FOREIGN KEY ("inquiryId") REFERENCES "ProjectInquiry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectInquiryAttachment"
ADD CONSTRAINT "ProjectInquiryAttachment_inquiryId_fkey"
FOREIGN KEY ("inquiryId") REFERENCES "ProjectInquiry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectInquiryAttachment"
ADD CONSTRAINT "ProjectInquiryAttachment_attachmentId_fkey"
FOREIGN KEY ("attachmentId") REFERENCES "ProjectAttachment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Initialize the fixed V2 workflow for every current project without touching legacy ProjectStage.
INSERT INTO "ProjectWorkflowStage" (
  "id",
  "projectId",
  "stageKey",
  "status",
  "unlockedAt",
  "completedAt",
  "createdAt",
  "updatedAt"
)
SELECT
  'workflow:' || project."id" || ':' || stage."stageKey",
  project."id",
  stage."stageKey"::"ProjectWorkflowStageKey",
  CASE
    WHEN stage."stageKey" = 'PROJECT_INQUIRY'
      THEN 'AVAILABLE'::"ProjectWorkflowStageStatus"
    ELSE 'LOCKED'::"ProjectWorkflowStageStatus"
  END,
  CASE WHEN stage."stageKey" = 'PROJECT_INQUIRY' THEN project."createdAt" ELSE NULL END,
  NULL,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Project" AS project
CROSS JOIN (
  VALUES
    ('PROJECT_INQUIRY'),
    ('PROJECT_RESEARCH_AND_PLANNING'),
    ('CONCEPT_CREATION'),
    ('PROJECT_DEVELOPMENT'),
    ('FINAL_LAYOUT'),
    ('PRODUCTION_AND_HANDOVER'),
    ('IMPLEMENTATION_AND_SUPERVISION')
) AS stage("stageKey")
ON CONFLICT ("projectId", "stageKey") DO NOTHING;
