-- CreateEnum
CREATE TYPE "ProjectProductionUnitStatus" AS ENUM ('PREPARATION', 'APPROVAL_PENDING', 'REJECTED', 'HANDOVER_READY', 'HANDED_OVER');

-- CreateEnum
CREATE TYPE "ProductionApprovalRecipientType" AS ENUM ('EXISTING_COLLABORATOR', 'EXTERNAL_EMAIL');

-- CreateEnum
CREATE TYPE "ProductionApprovalStepStatus" AS ENUM ('WAITING', 'ACTIVE', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ProductionDispatchStatus" AS ENUM ('NOT_SENT', 'PENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "ProductionHandoverRoute" AS ENUM ('PURCHASE_DEPARTMENT', 'DIRECT_VENDOR');

-- CreateEnum
CREATE TYPE "ProductionHandoverDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'PRODUCTION_APPROVAL_REQUESTED';
ALTER TYPE "NotificationType" ADD VALUE 'PRODUCTION_APPROVAL_APPROVED';
ALTER TYPE "NotificationType" ADD VALUE 'PRODUCTION_APPROVAL_REJECTED';
ALTER TYPE "NotificationType" ADD VALUE 'PRODUCTION_HANDOVER_COMPLETED';

-- AlterEnum
ALTER TYPE "NotificationEntityType" ADD VALUE 'PRODUCTION_UNIT';
ALTER TYPE "NotificationEntityType" ADD VALUE 'PRODUCTION_APPROVAL';

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN "dedupeKey" TEXT;

-- CreateTable
CREATE TABLE "ProjectProductionUnit" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sourceHandoffId" TEXT NOT NULL,
    "sourceChecklistId" TEXT NOT NULL,
    "sourceAttachmentId" TEXT NOT NULL,
    "status" "ProjectProductionUnitStatus" NOT NULL DEFAULT 'PREPARATION',
    "createdById" TEXT NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "handedOverAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectProductionUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectProductionUnitFile" (
    "id" TEXT NOT NULL,
    "productionUnitId" TEXT NOT NULL,
    "attachmentId" TEXT NOT NULL,
    "addedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectProductionUnitFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionApprovalStep" (
    "id" TEXT NOT NULL,
    "clientRequestId" TEXT,
    "productionUnitId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "isMarketingDirectorRequired" BOOLEAN NOT NULL DEFAULT false,
    "recipientType" "ProductionApprovalRecipientType",
    "recipientUserId" TEXT,
    "recipientName" TEXT,
    "recipientEmail" TEXT,
    "requestedById" TEXT,
    "sharedFieldKeys" "ProjectFileChecklistField"[] NOT NULL DEFAULT ARRAY[]::"ProjectFileChecklistField"[],
    "selectedFileIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "sharedSnapshot" JSONB,
    "message" TEXT,
    "status" "ProductionApprovalStepStatus" NOT NULL DEFAULT 'WAITING',
    "dispatchStatus" "ProductionDispatchStatus" NOT NULL DEFAULT 'NOT_SENT',
    "activatedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "failureMessage" TEXT,
    "externalTokenHash" TEXT,
    "externalTokenExpiresAt" TIMESTAMP(3),
    "externalTokenCreatedAt" TIMESTAMP(3),
    "externalTokenRevokedAt" TIMESTAMP(3),
    "externalOpenedAt" TIMESTAMP(3),
    "decidedByUserId" TEXT,
    "decisionComment" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionApprovalStep_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProductionApprovalStep_sequence_positive" CHECK ("sequence" > 0),
    CONSTRAINT "ProductionApprovalStep_marketing_director_first" CHECK (NOT "isMarketingDirectorRequired" OR "sequence" = 1)
);

-- CreateTable
CREATE TABLE "ProjectProductionHandover" (
    "id" TEXT NOT NULL,
    "clientRequestId" TEXT NOT NULL,
    "productionUnitId" TEXT NOT NULL,
    "route" "ProductionHandoverRoute" NOT NULL,
    "recipientType" "ProductionApprovalRecipientType" NOT NULL,
    "recipientUserId" TEXT,
    "recipientName" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "sharedFieldKeys" "ProjectFileChecklistField"[] NOT NULL DEFAULT ARRAY[]::"ProjectFileChecklistField"[],
    "selectedFileIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "contentSnapshot" JSONB NOT NULL,
    "note" TEXT,
    "requestedById" TEXT NOT NULL,
    "handedOverById" TEXT,
    "deliveryStatus" "ProductionHandoverDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "providerMessageId" TEXT,
    "sentAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "failureMessage" TEXT,
    "externalTokenHash" TEXT,
    "externalTokenExpiresAt" TIMESTAMP(3),
    "externalTokenCreatedAt" TIMESTAMP(3),
    "externalTokenRevokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectProductionHandover_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Notification_dedupeKey_key" ON "Notification"("dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectProductionUnit_sourceHandoffId_key" ON "ProjectProductionUnit"("sourceHandoffId");
CREATE UNIQUE INDEX "ProjectProductionUnit_sourceChecklistId_key" ON "ProjectProductionUnit"("sourceChecklistId");
CREATE UNIQUE INDEX "ProjectProductionUnit_projectId_sourceAttachmentId_key" ON "ProjectProductionUnit"("projectId", "sourceAttachmentId");
CREATE INDEX "ProjectProductionUnit_projectId_status_createdAt_idx" ON "ProjectProductionUnit"("projectId", "status", "createdAt");
CREATE INDEX "ProjectProductionUnit_sourceChecklistId_idx" ON "ProjectProductionUnit"("sourceChecklistId");
CREATE INDEX "ProjectProductionUnit_createdById_idx" ON "ProjectProductionUnit"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectProductionUnitFile_attachmentId_key" ON "ProjectProductionUnitFile"("attachmentId");
CREATE UNIQUE INDEX "ProjectProductionUnitFile_productionUnitId_attachmentId_key" ON "ProjectProductionUnitFile"("productionUnitId", "attachmentId");
CREATE INDEX "ProjectProductionUnitFile_productionUnitId_createdAt_idx" ON "ProjectProductionUnitFile"("productionUnitId", "createdAt");
CREATE INDEX "ProjectProductionUnitFile_addedById_idx" ON "ProjectProductionUnitFile"("addedById");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionApprovalStep_clientRequestId_key" ON "ProductionApprovalStep"("clientRequestId");
CREATE UNIQUE INDEX "ProductionApprovalStep_externalTokenHash_key" ON "ProductionApprovalStep"("externalTokenHash");
CREATE UNIQUE INDEX "ProductionApprovalStep_productionUnitId_sequence_key" ON "ProductionApprovalStep"("productionUnitId", "sequence");
CREATE UNIQUE INDEX "ProductionApprovalStep_required_marketing_director_key" ON "ProductionApprovalStep"("productionUnitId") WHERE "isMarketingDirectorRequired" = true;
CREATE UNIQUE INDEX "ProductionApprovalStep_one_active_key" ON "ProductionApprovalStep"("productionUnitId") WHERE "status" = 'ACTIVE';
CREATE INDEX "ProductionApprovalStep_productionUnitId_status_sequence_idx" ON "ProductionApprovalStep"("productionUnitId", "status", "sequence");
CREATE INDEX "ProductionApprovalStep_recipientUserId_status_idx" ON "ProductionApprovalStep"("recipientUserId", "status");
CREATE INDEX "ProductionApprovalStep_requestedById_idx" ON "ProductionApprovalStep"("requestedById");
CREATE INDEX "ProductionApprovalStep_dispatchStatus_status_idx" ON "ProductionApprovalStep"("dispatchStatus", "status");
CREATE INDEX "ProductionApprovalStep_decidedByUserId_idx" ON "ProductionApprovalStep"("decidedByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectProductionHandover_clientRequestId_key" ON "ProjectProductionHandover"("clientRequestId");
CREATE UNIQUE INDEX "ProjectProductionHandover_productionUnitId_key" ON "ProjectProductionHandover"("productionUnitId");
CREATE UNIQUE INDEX "ProjectProductionHandover_externalTokenHash_key" ON "ProjectProductionHandover"("externalTokenHash");
CREATE INDEX "ProjectProductionHandover_recipientUserId_idx" ON "ProjectProductionHandover"("recipientUserId");
CREATE INDEX "ProjectProductionHandover_deliveryStatus_createdAt_idx" ON "ProjectProductionHandover"("deliveryStatus", "createdAt");
CREATE INDEX "ProjectProductionHandover_requestedById_idx" ON "ProjectProductionHandover"("requestedById");
CREATE INDEX "ProjectProductionHandover_handedOverById_idx" ON "ProjectProductionHandover"("handedOverById");

-- AddForeignKey
ALTER TABLE "ProjectProductionUnit" ADD CONSTRAINT "ProjectProductionUnit_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectProductionUnit" ADD CONSTRAINT "ProjectProductionUnit_sourceHandoffId_fkey" FOREIGN KEY ("sourceHandoffId") REFERENCES "ProjectStageFileHandoff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectProductionUnit" ADD CONSTRAINT "ProjectProductionUnit_sourceChecklistId_fkey" FOREIGN KEY ("sourceChecklistId") REFERENCES "ProjectFileChecklist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectProductionUnit" ADD CONSTRAINT "ProjectProductionUnit_sourceAttachmentId_fkey" FOREIGN KEY ("sourceAttachmentId") REFERENCES "ProjectAttachment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectProductionUnit" ADD CONSTRAINT "ProjectProductionUnit_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProjectProductionUnitFile" ADD CONSTRAINT "ProjectProductionUnitFile_productionUnitId_fkey" FOREIGN KEY ("productionUnitId") REFERENCES "ProjectProductionUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectProductionUnitFile" ADD CONSTRAINT "ProjectProductionUnitFile_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "ProjectAttachment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectProductionUnitFile" ADD CONSTRAINT "ProjectProductionUnitFile_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProductionApprovalStep" ADD CONSTRAINT "ProductionApprovalStep_productionUnitId_fkey" FOREIGN KEY ("productionUnitId") REFERENCES "ProjectProductionUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductionApprovalStep" ADD CONSTRAINT "ProductionApprovalStep_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductionApprovalStep" ADD CONSTRAINT "ProductionApprovalStep_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductionApprovalStep" ADD CONSTRAINT "ProductionApprovalStep_decidedByUserId_fkey" FOREIGN KEY ("decidedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProjectProductionHandover" ADD CONSTRAINT "ProjectProductionHandover_productionUnitId_fkey" FOREIGN KEY ("productionUnitId") REFERENCES "ProjectProductionUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectProductionHandover" ADD CONSTRAINT "ProjectProductionHandover_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProjectProductionHandover" ADD CONSTRAINT "ProjectProductionHandover_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProjectProductionHandover" ADD CONSTRAINT "ProjectProductionHandover_handedOverById_fkey" FOREIGN KEY ("handedOverById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
