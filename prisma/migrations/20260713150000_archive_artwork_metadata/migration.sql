-- CreateTable
CREATE TABLE "ArchiveArtworkMetadata" (
    "id" TEXT NOT NULL,
    "archiveFileId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sourceAttachmentId" TEXT NOT NULL,
    "artworkId" TEXT NOT NULL,
    "titleWorkingName" TEXT NOT NULL,
    "versionRevision" TEXT NOT NULL,
    "languageMarket" TEXT NOT NULL,
    "artworkType" TEXT NOT NULL,
    "brandSubBrand" TEXT NOT NULL,
    "productSku" TEXT,
    "campaignProject" TEXT,
    "formatDimensions" TEXT,
    "colourSpace" TEXT NOT NULL,
    "resolution" TEXT,
    "fileFormats" TEXT NOT NULL,
    "printProcess" TEXT,
    "specialFinishes" TEXT,
    "creationDate" TIMESTAMP(3) NOT NULL,
    "lastModifiedDate" TIMESTAMP(3) NOT NULL,
    "goLiveOnShelfDate" TIMESTAMP(3),
    "expirySunsetDate" TIMESTAMP(3),
    "archiveStatus" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "approvedByName" TEXT NOT NULL,
    "approvedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "clientBrandOwner" TEXT NOT NULL,
    "regulatoryClearance" TEXT,
    "fontsUsed" TEXT NOT NULL,
    "imagesPhotography" TEXT NOT NULL,
    "illustrationsIcons" TEXT NOT NULL,
    "colourCodes" TEXT NOT NULL,
    "thirdPartyLogosIp" TEXT,
    "supplierPrinter" TEXT,
    "outputFilesList" TEXT,
    "printProofRef" TEXT,
    "packagingDielineRef" TEXT,
    "changeLog" TEXT NOT NULL,
    "relatedArtworks" TEXT,
    "briefSpecLink" TEXT,
    "generalNotes" TEXT,
    "archivedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArchiveArtworkMetadata_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ArchiveArtworkMetadata_archiveFileId_key" ON "ArchiveArtworkMetadata"("archiveFileId");

-- CreateIndex
CREATE INDEX "ArchiveArtworkMetadata_projectId_idx" ON "ArchiveArtworkMetadata"("projectId");

-- CreateIndex
CREATE INDEX "ArchiveArtworkMetadata_sourceAttachmentId_idx" ON "ArchiveArtworkMetadata"("sourceAttachmentId");

-- CreateIndex
CREATE INDEX "ArchiveArtworkMetadata_artworkId_idx" ON "ArchiveArtworkMetadata"("artworkId");

-- CreateIndex
CREATE INDEX "ArchiveArtworkMetadata_titleWorkingName_idx" ON "ArchiveArtworkMetadata"("titleWorkingName");

-- CreateIndex
CREATE INDEX "ArchiveArtworkMetadata_brandSubBrand_idx" ON "ArchiveArtworkMetadata"("brandSubBrand");

-- CreateIndex
CREATE INDEX "ArchiveArtworkMetadata_artworkType_idx" ON "ArchiveArtworkMetadata"("artworkType");

-- CreateIndex
CREATE INDEX "ArchiveArtworkMetadata_languageMarket_idx" ON "ArchiveArtworkMetadata"("languageMarket");

-- CreateIndex
CREATE INDEX "ArchiveArtworkMetadata_archiveStatus_idx" ON "ArchiveArtworkMetadata"("archiveStatus");

-- CreateIndex
CREATE INDEX "ArchiveArtworkMetadata_archivedById_idx" ON "ArchiveArtworkMetadata"("archivedById");

-- AddForeignKey
ALTER TABLE "ArchiveArtworkMetadata" ADD CONSTRAINT "ArchiveArtworkMetadata_archiveFileId_fkey" FOREIGN KEY ("archiveFileId") REFERENCES "ArchivedProjectFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArchiveArtworkMetadata" ADD CONSTRAINT "ArchiveArtworkMetadata_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArchiveArtworkMetadata" ADD CONSTRAINT "ArchiveArtworkMetadata_sourceAttachmentId_fkey" FOREIGN KEY ("sourceAttachmentId") REFERENCES "ProjectAttachment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArchiveArtworkMetadata" ADD CONSTRAINT "ArchiveArtworkMetadata_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArchiveArtworkMetadata" ADD CONSTRAINT "ArchiveArtworkMetadata_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArchiveArtworkMetadata" ADD CONSTRAINT "ArchiveArtworkMetadata_archivedById_fkey" FOREIGN KEY ("archivedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
