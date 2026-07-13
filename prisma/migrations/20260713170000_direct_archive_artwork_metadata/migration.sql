-- Allow direct/manual archive uploads to store the same Artwork Legend metadata
-- used by project final archive files.
CREATE TYPE "ArchiveArtworkMetadataSourceType" AS ENUM ('PROJECT_FINAL_FILE', 'DIRECT_UPLOAD');

ALTER TABLE "ArchiveArtworkMetadata"
  ADD COLUMN "sourceType" "ArchiveArtworkMetadataSourceType" NOT NULL DEFAULT 'PROJECT_FINAL_FILE',
  ADD COLUMN "manualArchiveFileId" TEXT,
  ALTER COLUMN "archiveFileId" DROP NOT NULL,
  ALTER COLUMN "projectId" DROP NOT NULL,
  ALTER COLUMN "sourceAttachmentId" DROP NOT NULL;

CREATE UNIQUE INDEX "ArchiveArtworkMetadata_manualArchiveFileId_key" ON "ArchiveArtworkMetadata"("manualArchiveFileId");
CREATE INDEX "ArchiveArtworkMetadata_manualArchiveFileId_idx" ON "ArchiveArtworkMetadata"("manualArchiveFileId");

ALTER TABLE "ArchiveArtworkMetadata"
  ADD CONSTRAINT "ArchiveArtworkMetadata_manualArchiveFileId_fkey"
  FOREIGN KEY ("manualArchiveFileId") REFERENCES "ManualArchiveFile"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
