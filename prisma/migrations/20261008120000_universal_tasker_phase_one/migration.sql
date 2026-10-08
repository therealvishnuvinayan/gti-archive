-- CreateEnum
CREATE TYPE "TaskerKind" AS ENUM ('FIELD_INPUT', 'FILE_REQUEST', 'GENERAL');

-- CreateEnum
CREATE TYPE "TaskerStatus" AS ENUM ('ASSIGNED', 'IN_PROGRESS', 'IN_REVIEW', 'CORRECTIONS_REQUESTED', 'COMPLETED', 'REJECTED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'TASKER_UPDATED';

-- AlterEnum
ALTER TYPE "NotificationEntityType" ADD VALUE 'TASKER_TASK';

-- AlterTable
ALTER TABLE "ProjectFormDraft" ADD COLUMN     "taskerRevision" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "TaskerTask" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "flexibleProjectId" TEXT,
    "kind" "TaskerKind" NOT NULL,
    "status" "TaskerStatus" NOT NULL DEFAULT 'ASSIGNED',
    "title" TEXT NOT NULL,
    "brief" TEXT NOT NULL,
    "stageRef" TEXT,
    "ownerId" TEXT NOT NULL,
    "assigneeId" TEXT NOT NULL,
    "coOwnerId" TEXT,
    "targetId" TEXT,
    "targetDefinition" JSONB,
    "targetSnapshot" JSONB,
    "activeTargetKey" TEXT,
    "destinationId" TEXT,
    "dueAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "deletedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskerTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskerParticipant" (
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskerParticipant_pkey" PRIMARY KEY ("taskId","userId")
);

-- CreateTable
CREATE TABLE "TaskerSubmission" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "submittedById" TEXT NOT NULL,
    "value" JSONB,
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskerSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskerFile" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "submissionId" TEXT,
    "uploadedById" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "bucket" TEXT NOT NULL,
    "uploadKey" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "status" "AttachmentStatus" NOT NULL DEFAULT 'UPLOADING',
    "publishedId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskerFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskerEvent" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskerEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskerDelivery" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseToken" TEXT,
    "sentAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskerDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskerFieldChange" (
    "consumedAt" TIMESTAMP(3),
    "id" SERIAL NOT NULL,
    "projectId" TEXT NOT NULL,
    "formKey" TEXT NOT NULL,
    "path" TEXT[],
    "value" JSONB NOT NULL,
    "taskId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskerFieldChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TaskerTask_activeTargetKey_key" ON "TaskerTask"("activeTargetKey");

-- CreateIndex
CREATE INDEX "TaskerTask_projectId_updatedAt_idx" ON "TaskerTask"("projectId", "updatedAt");

-- CreateIndex
CREATE INDEX "TaskerTask_flexibleProjectId_updatedAt_idx" ON "TaskerTask"("flexibleProjectId", "updatedAt");

-- CreateIndex
CREATE INDEX "TaskerTask_ownerId_status_updatedAt_idx" ON "TaskerTask"("ownerId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "TaskerTask_assigneeId_status_dueAt_idx" ON "TaskerTask"("assigneeId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "TaskerTask_coOwnerId_updatedAt_idx" ON "TaskerTask"("coOwnerId", "updatedAt");

-- CreateIndex
CREATE INDEX "TaskerParticipant_userId_idx" ON "TaskerParticipant"("userId");

-- CreateIndex
CREATE INDEX "TaskerSubmission_taskId_createdAt_idx" ON "TaskerSubmission"("taskId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TaskerFile_uploadKey_key" ON "TaskerFile"("uploadKey");

-- CreateIndex
CREATE UNIQUE INDEX "TaskerFile_storageKey_key" ON "TaskerFile"("storageKey");

-- CreateIndex
CREATE INDEX "TaskerFile_taskId_createdAt_idx" ON "TaskerFile"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX "TaskerEvent_taskId_createdAt_idx" ON "TaskerEvent"("taskId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TaskerDelivery_dedupeKey_key" ON "TaskerDelivery"("dedupeKey");

-- CreateIndex
CREATE INDEX "TaskerDelivery_sentAt_availableAt_idx" ON "TaskerDelivery"("sentAt", "availableAt");

-- CreateIndex
CREATE INDEX "TaskerFieldChange_projectId_formKey_id_idx" ON "TaskerFieldChange"("projectId", "formKey", "id");

-- AddForeignKey
ALTER TABLE "TaskerTask" ADD CONSTRAINT "TaskerTask_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskerTask" ADD CONSTRAINT "TaskerTask_flexibleProjectId_fkey" FOREIGN KEY ("flexibleProjectId") REFERENCES "FlexibleProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskerTask" ADD CONSTRAINT "TaskerTask_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskerTask" ADD CONSTRAINT "TaskerTask_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskerTask" ADD CONSTRAINT "TaskerTask_coOwnerId_fkey" FOREIGN KEY ("coOwnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskerParticipant" ADD CONSTRAINT "TaskerParticipant_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "TaskerTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskerParticipant" ADD CONSTRAINT "TaskerParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskerSubmission" ADD CONSTRAINT "TaskerSubmission_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "TaskerTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskerSubmission" ADD CONSTRAINT "TaskerSubmission_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskerFile" ADD CONSTRAINT "TaskerFile_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "TaskerTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskerFile" ADD CONSTRAINT "TaskerFile_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "TaskerSubmission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskerFile" ADD CONSTRAINT "TaskerFile_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskerEvent" ADD CONSTRAINT "TaskerEvent_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "TaskerTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskerEvent" ADD CONSTRAINT "TaskerEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskerDelivery" ADD CONSTRAINT "TaskerDelivery_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "TaskerTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskerDelivery" ADD CONSTRAINT "TaskerDelivery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskerFieldChange" ADD CONSTRAINT "TaskerFieldChange_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- One concrete project per task. Field requests reserve their target until terminal.
ALTER TABLE "TaskerTask" ADD CONSTRAINT "TaskerTask_one_project" CHECK (num_nonnulls("projectId", "flexibleProjectId") = 1);
ALTER TABLE "TaskerTask" ADD CONSTRAINT "TaskerTask_field_target" CHECK (("kind" = 'FIELD_INPUT') = ("targetId" IS NOT NULL));
ALTER TABLE "TaskerTask" ADD CONSTRAINT "TaskerTask_active_target" CHECK (("kind" = 'FIELD_INPUT' AND "deletedAt" IS NULL AND "status" NOT IN ('COMPLETED', 'REJECTED', 'CANCELLED')) = ("activeTargetKey" IS NOT NULL));
ALTER TABLE "TaskerTask" ADD CONSTRAINT "TaskerTask_file_destination" CHECK (("kind" = 'FILE_REQUEST') = ("destinationId" IS NOT NULL));

