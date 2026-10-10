-- AlterTable
ALTER TABLE "TaskerTask" ADD COLUMN     "parentFamilyId" TEXT,
ADD COLUMN     "sisterNumber" INTEGER;

-- AlterTable
ALTER TABLE "TaskerDelivery" ADD COLUMN     "conceptId" TEXT,
ALTER COLUMN "taskId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "TaskerFamily" (
    "projectId" TEXT,
    "flexibleProjectId" TEXT,
    "id" TEXT NOT NULL,
    "originalTaskId" TEXT,
    "originalConceptId" TEXT,
    "nextSisterNumber" INTEGER NOT NULL DEFAULT 1,
    "version" INTEGER NOT NULL DEFAULT 0,
    "finalFileKey" TEXT,
    "cycleDecision" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskerFamily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskerFamilyEvent" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "fileKey" TEXT,
    "version" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskerFamilyEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TaskerFamily_originalTaskId_key" ON "TaskerFamily"("originalTaskId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskerFamily_originalConceptId_key" ON "TaskerFamily"("originalConceptId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskerFamilyEvent_familyId_version_key" ON "TaskerFamilyEvent"("familyId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "TaskerTask_parentFamilyId_sisterNumber_key" ON "TaskerTask"("parentFamilyId", "sisterNumber");

-- AddForeignKey
ALTER TABLE "TaskerTask" ADD CONSTRAINT "TaskerTask_parentFamilyId_fkey" FOREIGN KEY ("parentFamilyId") REFERENCES "TaskerFamily"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskerFamily" ADD CONSTRAINT "TaskerFamily_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskerFamily" ADD CONSTRAINT "TaskerFamily_flexibleProjectId_fkey" FOREIGN KEY ("flexibleProjectId") REFERENCES "FlexibleProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskerFamily" ADD CONSTRAINT "TaskerFamily_originalTaskId_fkey" FOREIGN KEY ("originalTaskId") REFERENCES "TaskerTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskerFamily" ADD CONSTRAINT "TaskerFamily_originalConceptId_fkey" FOREIGN KEY ("originalConceptId") REFERENCES "ProjectConceptFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskerFamilyEvent" ADD CONSTRAINT "TaskerFamilyEvent_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "TaskerFamily"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskerFamilyEvent" ADD CONSTRAINT "TaskerFamilyEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskerDelivery" ADD CONSTRAINT "TaskerDelivery_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "ProjectConceptFolder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- An explicit deletion may remove the original while preserving its child tasks.
ALTER TABLE "TaskerFamily" ADD CONSTRAINT "TaskerFamily_one_original" CHECK (num_nonnulls("originalTaskId", "originalConceptId") <= 1);
ALTER TABLE "TaskerFamily" ADD CONSTRAINT "TaskerFamily_one_project" CHECK (num_nonnulls("projectId", "flexibleProjectId") = 1);
ALTER TABLE "TaskerTask" ADD CONSTRAINT "TaskerTask_sister_number" CHECK (("parentFamilyId" IS NULL AND "sisterNumber" IS NULL) OR ("parentFamilyId" IS NOT NULL AND "sisterNumber" IS NOT NULL AND "sisterNumber" > 0));
ALTER TABLE "TaskerDelivery" ADD CONSTRAINT "TaskerDelivery_one_target" CHECK (num_nonnulls("taskId", "conceptId") = 1);
ALTER TABLE "TaskerFamily" ADD CONSTRAINT "TaskerFamily_cycle_decision" CHECK ("cycleDecision" IS NULL OR "cycleDecision" IN ('PENDING', 'REQUIRED', 'NOT_REQUIRED'));
