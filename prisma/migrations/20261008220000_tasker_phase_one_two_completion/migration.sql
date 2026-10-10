-- AlterTable
ALTER TABLE "FlexibleProjectAttachment" ADD COLUMN     "taskerImportId" TEXT;

-- AlterTable
ALTER TABLE "ProjectFileChecklistRequest" ADD COLUMN     "targetToken" TEXT;

-- AlterTable
ALTER TABLE "ProjectAttachment" ADD COLUMN     "taskerImportId" TEXT;

-- AlterTable
ALTER TABLE "TaskerDelivery" ADD COLUMN     "checklistRequestId" TEXT;

-- CreateTable
CREATE TABLE "ProjectFileChecklistResponse" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "submittedById" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "files" JSONB NOT NULL,
    "status" "TaskerStatus" NOT NULL DEFAULT 'IN_REVIEW',
    "reviewedById" TEXT,
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectFileChecklistResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskerFileImport" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "fileKey" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "sourceLabel" TEXT NOT NULL,
    "sourceSubmissionId" TEXT,
    "destinationId" TEXT NOT NULL,
    "destinationLabel" TEXT NOT NULL,
    "destinationAttachmentId" TEXT NOT NULL,
    "importedById" TEXT NOT NULL,
    "importedByLabel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskerFileImport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectFileChecklistResponse_requestId_createdAt_idx" ON "ProjectFileChecklistResponse"("requestId", "createdAt");

-- CreateIndex
CREATE INDEX "TaskerFileImport_familyId_createdAt_idx" ON "TaskerFileImport"("familyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FlexibleProjectAttachment_taskerImportId_key" ON "FlexibleProjectAttachment"("taskerImportId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectAttachment_taskerImportId_key" ON "ProjectAttachment"("taskerImportId");

-- AddForeignKey
ALTER TABLE "FlexibleProjectAttachment" ADD CONSTRAINT "FlexibleProjectAttachment_taskerImportId_fkey" FOREIGN KEY ("taskerImportId") REFERENCES "TaskerFileImport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectFileChecklistResponse" ADD CONSTRAINT "ProjectFileChecklistResponse_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ProjectFileChecklistRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectFileChecklistResponse" ADD CONSTRAINT "ProjectFileChecklistResponse_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectFileChecklistResponse" ADD CONSTRAINT "ProjectFileChecklistResponse_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectAttachment" ADD CONSTRAINT "ProjectAttachment_taskerImportId_fkey" FOREIGN KEY ("taskerImportId") REFERENCES "TaskerFileImport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskerFileImport" ADD CONSTRAINT "TaskerFileImport_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "TaskerFamily"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskerDelivery" ADD CONSTRAINT "TaskerDelivery_checklistRequestId_fkey" FOREIGN KEY ("checklistRequestId") REFERENCES "ProjectFileChecklistRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "TaskerDelivery" DROP CONSTRAINT "TaskerDelivery_one_target";
ALTER TABLE "TaskerDelivery" ADD CONSTRAINT "TaskerDelivery_one_target" CHECK (num_nonnulls("taskId", "conceptId", "checklistRequestId") = 1);

DROP INDEX "ProjectFileChecklistRequest_active_recipient_key";
CREATE UNIQUE INDEX "ProjectFileChecklistRequest_active_recipient_key"
ON "ProjectFileChecklistRequest" ("checklistId", "fieldKey", "recipientUserId")
WHERE "channel" = 'IN_APP' AND "workflowStatus" IN ('REQUESTED', 'ACCEPTED', 'IN_REVIEW', 'CORRECTIONS_REQUESTED');
