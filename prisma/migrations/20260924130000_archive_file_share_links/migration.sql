CREATE TABLE "ArchiveFileShareLink" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "archivedProjectFileId" TEXT,
    "manualArchiveFileId" TEXT,
    "createdById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "lastDownloadedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArchiveFileShareLink_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ArchiveFileShareLink_single_file_check" CHECK (
      ("archivedProjectFileId" IS NOT NULL AND "manualArchiveFileId" IS NULL)
      OR
      ("archivedProjectFileId" IS NULL AND "manualArchiveFileId" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "ArchiveFileShareLink_tokenHash_key" ON "ArchiveFileShareLink"("tokenHash");
CREATE INDEX "ArchiveFileShareLink_archivedProjectFileId_idx" ON "ArchiveFileShareLink"("archivedProjectFileId");
CREATE INDEX "ArchiveFileShareLink_manualArchiveFileId_idx" ON "ArchiveFileShareLink"("manualArchiveFileId");
CREATE INDEX "ArchiveFileShareLink_createdById_idx" ON "ArchiveFileShareLink"("createdById");
CREATE INDEX "ArchiveFileShareLink_expiresAt_idx" ON "ArchiveFileShareLink"("expiresAt");

ALTER TABLE "ArchiveFileShareLink"
ADD CONSTRAINT "ArchiveFileShareLink_archivedProjectFileId_fkey"
FOREIGN KEY ("archivedProjectFileId") REFERENCES "ArchivedProjectFile"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ArchiveFileShareLink"
ADD CONSTRAINT "ArchiveFileShareLink_manualArchiveFileId_fkey"
FOREIGN KEY ("manualArchiveFileId") REFERENCES "ManualArchiveFile"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ArchiveFileShareLink"
ADD CONSTRAINT "ArchiveFileShareLink_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
