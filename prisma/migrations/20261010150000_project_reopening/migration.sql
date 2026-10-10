-- DropIndex
DROP INDEX "ProjectProductionUnit_sourceHandoffId_key";

-- DropIndex
DROP INDEX "ProjectProductionUnit_sourceChecklistId_key";

-- DropIndex
DROP INDEX "ProjectProductionUnit_projectId_sourceAttachmentId_key";

-- DropIndex
DROP INDEX "ProjectClosure_projectId_key";

-- Keep one live closure while retaining every previously issued closure.
-- Created after the reopenedAt column below.

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "workflowCycle" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "ProjectProductionUnit" ADD COLUMN     "cycle" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "retiredAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ProjectClosure" ADD COLUMN     "reopenedAt" TIMESTAMP(3);

ALTER TABLE "ProjectProductionSupervision" ADD COLUMN "resumeAfterSequence" INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX "ProjectClosure_current_key" ON "ProjectClosure" ("projectId") WHERE "reopenedAt" IS NULL;

-- CreateTable
CREATE TABLE "ProjectReopening" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "flexibleProjectId" TEXT,
    "actorId" TEXT NOT NULL,
    "targetRef" TEXT NOT NULL,
    "targetLabel" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectReopening_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectReopeningFile" (
    "reopeningId" TEXT NOT NULL,
    "attachmentId" TEXT NOT NULL,

    CONSTRAINT "ProjectReopeningFile_pkey" PRIMARY KEY ("reopeningId","attachmentId")
);

ALTER TABLE "ProjectReopening" ADD CONSTRAINT "ProjectReopening_one_project" CHECK (("projectId" IS NULL) <> ("flexibleProjectId" IS NULL));

-- CreateIndex
CREATE INDEX "ProjectReopening_projectId_createdAt_idx" ON "ProjectReopening"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "ProjectReopening_flexibleProjectId_createdAt_idx" ON "ProjectReopening"("flexibleProjectId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectProductionUnit_projectId_sourceAttachmentId_cycle_key" ON "ProjectProductionUnit"("projectId", "sourceAttachmentId", "cycle");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectProductionUnit_sourceHandoffId_cycle_key" ON "ProjectProductionUnit"("sourceHandoffId", "cycle");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectProductionUnit_sourceChecklistId_cycle_key" ON "ProjectProductionUnit"("sourceChecklistId", "cycle");

-- CreateIndex
CREATE INDEX "ProjectClosure_projectId_reopenedAt_idx" ON "ProjectClosure"("projectId", "reopenedAt");

-- AddForeignKey
ALTER TABLE "ProjectReopening" ADD CONSTRAINT "ProjectReopening_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectReopening" ADD CONSTRAINT "ProjectReopening_flexibleProjectId_fkey" FOREIGN KEY ("flexibleProjectId") REFERENCES "FlexibleProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectReopening" ADD CONSTRAINT "ProjectReopening_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectReopeningFile" ADD CONSTRAINT "ProjectReopeningFile_reopeningId_fkey" FOREIGN KEY ("reopeningId") REFERENCES "ProjectReopening"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectReopeningFile" ADD CONSTRAINT "ProjectReopeningFile_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "ProjectAttachment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
