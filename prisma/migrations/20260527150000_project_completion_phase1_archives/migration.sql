-- CreateEnum
CREATE TYPE "ArchiveRecordStatus" AS ENUM ('COMPLETED', 'ARCHIVED');

-- AlterTable
ALTER TABLE "Project"
ADD COLUMN "archivedAt" TIMESTAMP(3),
ADD COLUMN "completedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ProjectStage"
ADD COLUMN "completedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ProjectArchive" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "finalStageId" TEXT NOT NULL,
    "archivedById" TEXT NOT NULL,
    "projectName" TEXT NOT NULL,
    "projectCategory" TEXT NOT NULL,
    "projectTag" TEXT,
    "archiveCategorySlug" TEXT NOT NULL,
    "archiveCategoryLabel" TEXT NOT NULL,
    "status" "ArchiveRecordStatus" NOT NULL DEFAULT 'ARCHIVED',
    "archivedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectArchive_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArchivedProjectFile" (
    "id" TEXT NOT NULL,
    "archiveId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sourceAttachmentId" TEXT NOT NULL,
    "sourceRevisionId" TEXT,
    "finalArchiveFileName" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "bucket" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "archivedById" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArchivedProjectFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectArchive_projectId_key" ON "ProjectArchive"("projectId");

-- CreateIndex
CREATE INDEX "ProjectArchive_archiveCategorySlug_archivedAt_idx" ON "ProjectArchive"("archiveCategorySlug", "archivedAt");

-- CreateIndex
CREATE INDEX "ProjectArchive_archivedById_idx" ON "ProjectArchive"("archivedById");

-- CreateIndex
CREATE UNIQUE INDEX "ArchivedProjectFile_archiveId_finalArchiveFileName_key" ON "ArchivedProjectFile"("archiveId", "finalArchiveFileName");

-- CreateIndex
CREATE UNIQUE INDEX "ArchivedProjectFile_archiveId_sourceAttachmentId_key" ON "ArchivedProjectFile"("archiveId", "sourceAttachmentId");

-- CreateIndex
CREATE INDEX "ArchivedProjectFile_projectId_archivedAt_idx" ON "ArchivedProjectFile"("projectId", "archivedAt");

-- CreateIndex
CREATE INDEX "ArchivedProjectFile_sourceAttachmentId_idx" ON "ArchivedProjectFile"("sourceAttachmentId");

-- CreateIndex
CREATE INDEX "ArchivedProjectFile_sourceRevisionId_idx" ON "ArchivedProjectFile"("sourceRevisionId");

-- CreateIndex
CREATE INDEX "ArchivedProjectFile_archivedById_idx" ON "ArchivedProjectFile"("archivedById");

-- AddForeignKey
ALTER TABLE "ProjectArchive" ADD CONSTRAINT "ProjectArchive_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectArchive" ADD CONSTRAINT "ProjectArchive_finalStageId_fkey" FOREIGN KEY ("finalStageId") REFERENCES "ProjectStage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectArchive" ADD CONSTRAINT "ProjectArchive_archivedById_fkey" FOREIGN KEY ("archivedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArchivedProjectFile" ADD CONSTRAINT "ArchivedProjectFile_archiveId_fkey" FOREIGN KEY ("archiveId") REFERENCES "ProjectArchive"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArchivedProjectFile" ADD CONSTRAINT "ArchivedProjectFile_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArchivedProjectFile" ADD CONSTRAINT "ArchivedProjectFile_sourceAttachmentId_fkey" FOREIGN KEY ("sourceAttachmentId") REFERENCES "ProjectAttachment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArchivedProjectFile" ADD CONSTRAINT "ArchivedProjectFile_sourceRevisionId_fkey" FOREIGN KEY ("sourceRevisionId") REFERENCES "ProjectRevision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArchivedProjectFile" ADD CONSTRAINT "ArchivedProjectFile_archivedById_fkey" FOREIGN KEY ("archivedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
