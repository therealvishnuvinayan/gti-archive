CREATE TABLE "ManualArchiveFile" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "projectName" TEXT,
    "projectCreatedBy" TEXT,
    "archiveCategorySlug" TEXT NOT NULL,
    "archiveCategoryLabel" TEXT NOT NULL,
    "tag" TEXT,
    "projectDate" TIMESTAMP(3),
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "bucket" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "status" "AttachmentStatus" NOT NULL DEFAULT 'UPLOADING',
    "uploadedById" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManualArchiveFile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ManualLibraryAsset" (
    "id" TEXT NOT NULL,
    "assetName" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "createdByName" TEXT,
    "description" TEXT,
    "category" TEXT,
    "tag" TEXT,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "bucket" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "status" "AttachmentStatus" NOT NULL DEFAULT 'UPLOADING',
    "uploadedById" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManualLibraryAsset_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ManualArchiveFile_storageKey_key" ON "ManualArchiveFile"("storageKey");
CREATE INDEX "ManualArchiveFile_archiveCategorySlug_uploadedAt_idx" ON "ManualArchiveFile"("archiveCategorySlug", "uploadedAt");
CREATE INDEX "ManualArchiveFile_uploadedById_idx" ON "ManualArchiveFile"("uploadedById");
CREATE INDEX "ManualArchiveFile_status_idx" ON "ManualArchiveFile"("status");

CREATE UNIQUE INDEX "ManualLibraryAsset_storageKey_key" ON "ManualLibraryAsset"("storageKey");
CREATE INDEX "ManualLibraryAsset_category_uploadedAt_idx" ON "ManualLibraryAsset"("category", "uploadedAt");
CREATE INDEX "ManualLibraryAsset_uploadedById_idx" ON "ManualLibraryAsset"("uploadedById");
CREATE INDEX "ManualLibraryAsset_status_idx" ON "ManualLibraryAsset"("status");

ALTER TABLE "ManualArchiveFile"
ADD CONSTRAINT "ManualArchiveFile_uploadedById_fkey"
FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ManualLibraryAsset"
ADD CONSTRAINT "ManualLibraryAsset_uploadedById_fkey"
FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
