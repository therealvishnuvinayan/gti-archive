CREATE TABLE "AssetTag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssetTag_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProjectAttachmentAssetTagAssignment" (
    "attachmentId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectAttachmentAssetTagAssignment_pkey" PRIMARY KEY ("attachmentId","tagId")
);

CREATE TABLE "ManualArchiveFileAssetTagAssignment" (
    "archiveFileId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManualArchiveFileAssetTagAssignment_pkey" PRIMARY KEY ("archiveFileId","tagId")
);

CREATE TABLE "ManualLibraryAssetTagAssignment" (
    "assetId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManualLibraryAssetTagAssignment_pkey" PRIMARY KEY ("assetId","tagId")
);

CREATE UNIQUE INDEX "AssetTag_name_key" ON "AssetTag"("name");
CREATE INDEX "ProjectAttachmentAssetTagAssignment_tagId_idx" ON "ProjectAttachmentAssetTagAssignment"("tagId");
CREATE INDEX "ManualArchiveFileAssetTagAssignment_tagId_idx" ON "ManualArchiveFileAssetTagAssignment"("tagId");
CREATE INDEX "ManualLibraryAssetTagAssignment_tagId_idx" ON "ManualLibraryAssetTagAssignment"("tagId");

ALTER TABLE "ProjectAttachmentAssetTagAssignment"
ADD CONSTRAINT "ProjectAttachmentAssetTagAssignment_attachmentId_fkey"
FOREIGN KEY ("attachmentId") REFERENCES "ProjectAttachment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectAttachmentAssetTagAssignment"
ADD CONSTRAINT "ProjectAttachmentAssetTagAssignment_tagId_fkey"
FOREIGN KEY ("tagId") REFERENCES "AssetTag"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ManualArchiveFileAssetTagAssignment"
ADD CONSTRAINT "ManualArchiveFileAssetTagAssignment_archiveFileId_fkey"
FOREIGN KEY ("archiveFileId") REFERENCES "ManualArchiveFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ManualArchiveFileAssetTagAssignment"
ADD CONSTRAINT "ManualArchiveFileAssetTagAssignment_tagId_fkey"
FOREIGN KEY ("tagId") REFERENCES "AssetTag"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ManualLibraryAssetTagAssignment"
ADD CONSTRAINT "ManualLibraryAssetTagAssignment_assetId_fkey"
FOREIGN KEY ("assetId") REFERENCES "ManualLibraryAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ManualLibraryAssetTagAssignment"
ADD CONSTRAINT "ManualLibraryAssetTagAssignment_tagId_fkey"
FOREIGN KEY ("tagId") REFERENCES "AssetTag"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ManualArchiveFile" DROP COLUMN "tag";
ALTER TABLE "ManualLibraryAsset" DROP COLUMN "tag";
