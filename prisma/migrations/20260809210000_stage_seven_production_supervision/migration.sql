-- CreateEnum
CREATE TYPE "ProductionSupervisionStatus" AS ENUM ('NOT_STARTED', 'IN_REVIEW', 'REVISIONS_NEEDED', 'SIGNED_OFF');

-- CreateEnum
CREATE TYPE "ProductionSampleRoundType" AS ENUM ('PRE_PRODUCTION_SAMPLE', 'PRODUCTION_SAMPLE', 'FINAL_MASS_PRODUCTION_SIGN_OFF', 'CUSTOM');

-- CreateEnum
CREATE TYPE "ProductionSampleRoundStatus" AS ENUM ('PENDING', 'UNDER_REVIEW', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ProductionSampleDecision" AS ENUM ('PASS', 'FAIL', 'CONDITIONAL');

-- CreateEnum
CREATE TYPE "ProductionSampleCriterion" AS ENUM ('MATERIAL_QUALITY', 'GRAPHIC_REPRODUCTION', 'SIZE', 'CONSTRUCTION', 'GRAPHIC_ELEMENTS', 'FUNCTIONALITY', 'FINISHES');

-- Extend existing enums for Stage 7 evidence and notifications.
ALTER TYPE "AttachmentAssetType" ADD VALUE 'SAMPLE_ROUND_EVIDENCE';
ALTER TYPE "NotificationEntityType" ADD VALUE 'PRODUCTION_SUPERVISION';
ALTER TYPE "NotificationEntityType" ADD VALUE 'SAMPLE_ROUND';
ALTER TYPE "NotificationType" ADD VALUE 'STAGE_SEVEN_OVERDUE';
ALTER TYPE "NotificationType" ADD VALUE 'PRODUCTION_SAMPLE_FEEDBACK';

-- CreateTable
CREATE TABLE "ProjectProductionSupervision" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "productionUnitId" TEXT NOT NULL,
    "status" "ProductionSupervisionStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "signedOffById" TEXT,
    "signedOffAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectProductionSupervision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionSampleRound" (
    "id" TEXT NOT NULL,
    "clientRequestId" TEXT,
    "projectId" TEXT NOT NULL,
    "supervisionId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "type" "ProductionSampleRoundType" NOT NULL,
    "customTypeName" TEXT,
    "submissionDueAt" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "reviewDueAt" TIMESTAMP(3) NOT NULL,
    "reviewedAt" TIMESTAMP(3),
    "revisionSignoffDueAt" TIMESTAMP(3) NOT NULL,
    "revisionSignedOffAt" TIMESTAMP(3),
    "deliveryDueAt" TIMESTAMP(3) NOT NULL,
    "deliveredAt" TIMESTAMP(3),
    "status" "ProductionSampleRoundStatus" NOT NULL DEFAULT 'PENDING',
    "overallDecision" "ProductionSampleDecision",
    "overallNotes" TEXT,
    "completedById" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionSampleRound_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProductionSampleRound_sequence_positive" CHECK ("sequence" > 0),
    CONSTRAINT "ProductionSampleRound_custom_name" CHECK (
      ("type" = 'CUSTOM' AND NULLIF(BTRIM("customTypeName"), '') IS NOT NULL)
      OR ("type" <> 'CUSTOM' AND "customTypeName" IS NULL)
    ),
    CONSTRAINT "ProductionSampleRound_deadline_order" CHECK (
      "submissionDueAt" <= "reviewDueAt"
      AND "reviewDueAt" <= "revisionSignoffDueAt"
      AND "revisionSignoffDueAt" <= "deliveryDueAt"
    )
);

-- CreateTable
CREATE TABLE "ProductionSampleEvaluation" (
    "id" TEXT NOT NULL,
    "sampleRoundId" TEXT NOT NULL,
    "criterion" "ProductionSampleCriterion" NOT NULL,
    "decision" "ProductionSampleDecision",
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionSampleEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionSampleRoundParticipant" (
    "sampleRoundId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "addedById" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductionSampleRoundParticipant_pkey" PRIMARY KEY ("sampleRoundId", "userId")
);

-- CreateTable
CREATE TABLE "ProductionSampleRoundEvidence" (
    "id" TEXT NOT NULL,
    "sampleRoundId" TEXT NOT NULL,
    "attachmentId" TEXT NOT NULL,
    "criterion" "ProductionSampleCriterion",
    "addedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductionSampleRoundEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionSampleFeedback" (
    "id" TEXT NOT NULL,
    "clientRequestId" TEXT NOT NULL,
    "sampleRoundId" TEXT NOT NULL,
    "recipientType" "ProductionApprovalRecipientType" NOT NULL,
    "recipientUserId" TEXT,
    "recipientName" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "messageSnapshot" TEXT NOT NULL,
    "status" "ProductionDispatchStatus" NOT NULL DEFAULT 'PENDING',
    "providerMessageId" TEXT,
    "sentById" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionSampleFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectClosure" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "closedById" TEXT NOT NULL,
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectClosure_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectProductionSupervision_productionUnitId_key" ON "ProjectProductionSupervision"("productionUnitId");
CREATE UNIQUE INDEX "ProjectProductionSupervision_projectId_productionUnitId_key" ON "ProjectProductionSupervision"("projectId", "productionUnitId");
CREATE INDEX "ProjectProductionSupervision_projectId_status_createdAt_idx" ON "ProjectProductionSupervision"("projectId", "status", "createdAt");
CREATE INDEX "ProjectProductionSupervision_signedOffById_idx" ON "ProjectProductionSupervision"("signedOffById");

CREATE UNIQUE INDEX "ProductionSampleRound_clientRequestId_key" ON "ProductionSampleRound"("clientRequestId");
CREATE UNIQUE INDEX "ProductionSampleRound_supervisionId_sequence_key" ON "ProductionSampleRound"("supervisionId", "sequence");
CREATE INDEX "ProductionSampleRound_projectId_status_createdAt_idx" ON "ProductionSampleRound"("projectId", "status", "createdAt");
CREATE INDEX "ProductionSampleRound_supervisionId_status_sequence_idx" ON "ProductionSampleRound"("supervisionId", "status", "sequence");
CREATE INDEX "ProductionSampleRound_completedById_idx" ON "ProductionSampleRound"("completedById");
CREATE INDEX "ProductionSampleRound_createdById_idx" ON "ProductionSampleRound"("createdById");

CREATE UNIQUE INDEX "ProductionSampleEvaluation_sampleRoundId_criterion_key" ON "ProductionSampleEvaluation"("sampleRoundId", "criterion");
CREATE INDEX "ProductionSampleEvaluation_sampleRoundId_idx" ON "ProductionSampleEvaluation"("sampleRoundId");

CREATE INDEX "ProductionSampleRoundParticipant_userId_idx" ON "ProductionSampleRoundParticipant"("userId");
CREATE INDEX "ProductionSampleRoundParticipant_addedById_idx" ON "ProductionSampleRoundParticipant"("addedById");

CREATE UNIQUE INDEX "ProductionSampleRoundEvidence_attachmentId_key" ON "ProductionSampleRoundEvidence"("attachmentId");
CREATE UNIQUE INDEX "ProductionSampleRoundEvidence_sampleRoundId_attachmentId_key" ON "ProductionSampleRoundEvidence"("sampleRoundId", "attachmentId");
CREATE INDEX "ProductionSampleRoundEvidence_sampleRoundId_criterion_creat_idx" ON "ProductionSampleRoundEvidence"("sampleRoundId", "criterion", "createdAt");
CREATE INDEX "ProductionSampleRoundEvidence_addedById_idx" ON "ProductionSampleRoundEvidence"("addedById");

CREATE UNIQUE INDEX "ProductionSampleFeedback_clientRequestId_key" ON "ProductionSampleFeedback"("clientRequestId");
CREATE INDEX "ProductionSampleFeedback_sampleRoundId_createdAt_idx" ON "ProductionSampleFeedback"("sampleRoundId", "createdAt");
CREATE INDEX "ProductionSampleFeedback_recipientUserId_idx" ON "ProductionSampleFeedback"("recipientUserId");
CREATE INDEX "ProductionSampleFeedback_sentById_idx" ON "ProductionSampleFeedback"("sentById");
CREATE INDEX "ProductionSampleFeedback_status_createdAt_idx" ON "ProductionSampleFeedback"("status", "createdAt");

CREATE UNIQUE INDEX "ProjectClosure_projectId_key" ON "ProjectClosure"("projectId");
CREATE INDEX "ProjectClosure_closedById_idx" ON "ProjectClosure"("closedById");
CREATE INDEX "ProjectClosure_closedAt_idx" ON "ProjectClosure"("closedAt");

-- AddForeignKey
ALTER TABLE "ProjectProductionSupervision" ADD CONSTRAINT "ProjectProductionSupervision_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectProductionSupervision" ADD CONSTRAINT "ProjectProductionSupervision_productionUnitId_fkey" FOREIGN KEY ("productionUnitId") REFERENCES "ProjectProductionUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectProductionSupervision" ADD CONSTRAINT "ProjectProductionSupervision_signedOffById_fkey" FOREIGN KEY ("signedOffById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProductionSampleRound" ADD CONSTRAINT "ProductionSampleRound_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductionSampleRound" ADD CONSTRAINT "ProductionSampleRound_supervisionId_fkey" FOREIGN KEY ("supervisionId") REFERENCES "ProjectProductionSupervision"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductionSampleRound" ADD CONSTRAINT "ProductionSampleRound_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductionSampleRound" ADD CONSTRAINT "ProductionSampleRound_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProductionSampleEvaluation" ADD CONSTRAINT "ProductionSampleEvaluation_sampleRoundId_fkey" FOREIGN KEY ("sampleRoundId") REFERENCES "ProductionSampleRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductionSampleRoundParticipant" ADD CONSTRAINT "ProductionSampleRoundParticipant_sampleRoundId_fkey" FOREIGN KEY ("sampleRoundId") REFERENCES "ProductionSampleRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductionSampleRoundParticipant" ADD CONSTRAINT "ProductionSampleRoundParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductionSampleRoundParticipant" ADD CONSTRAINT "ProductionSampleRoundParticipant_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProductionSampleRoundEvidence" ADD CONSTRAINT "ProductionSampleRoundEvidence_sampleRoundId_fkey" FOREIGN KEY ("sampleRoundId") REFERENCES "ProductionSampleRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductionSampleRoundEvidence" ADD CONSTRAINT "ProductionSampleRoundEvidence_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "ProjectAttachment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductionSampleRoundEvidence" ADD CONSTRAINT "ProductionSampleRoundEvidence_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProductionSampleFeedback" ADD CONSTRAINT "ProductionSampleFeedback_sampleRoundId_fkey" FOREIGN KEY ("sampleRoundId") REFERENCES "ProductionSampleRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductionSampleFeedback" ADD CONSTRAINT "ProductionSampleFeedback_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductionSampleFeedback" ADD CONSTRAINT "ProductionSampleFeedback_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProjectClosure" ADD CONSTRAINT "ProjectClosure_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectClosure" ADD CONSTRAINT "ProjectClosure_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
