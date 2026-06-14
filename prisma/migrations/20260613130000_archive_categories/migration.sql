CREATE TABLE "ArchiveCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "iconUrl" TEXT,
    "iconKey" TEXT,
    "color" TEXT,
    "parentId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArchiveCategory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ArchiveCategory_slug_key" ON "ArchiveCategory"("slug");
CREATE INDEX "ArchiveCategory_slug_idx" ON "ArchiveCategory"("slug");
CREATE INDEX "ArchiveCategory_parentId_idx" ON "ArchiveCategory"("parentId");
CREATE INDEX "ArchiveCategory_isActive_sortOrder_idx" ON "ArchiveCategory"("isActive", "sortOrder");

ALTER TABLE "ArchiveCategory"
ADD CONSTRAINT "ArchiveCategory_parentId_fkey"
FOREIGN KEY ("parentId") REFERENCES "ArchiveCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "ArchiveCategory" ("id", "name", "slug", "iconKey", "sortOrder", "isActive", "isSystem", "createdAt", "updatedAt")
VALUES
  ('archive_category_artworks', 'Artworks', 'artworks', 'shapes', 10, true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('archive_category_promotions', 'Promotions', 'promotions', 'sparkles', 20, true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('archive_category_advertisements', 'Advertisements', 'advertisements', 'megaphone', 30, true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('archive_category_website_data', 'Website Data', 'website-data', 'panel-top', 40, true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('archive_category_revisions', 'Revisions', 'revisions', 'file-stack', 50, true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('archive_category_product_renders', 'Product Renders', 'product-renders', 'images', 60, true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('archive_category_3d_assets', '3D Assets', '3d-assets', 'box', 70, true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('archive_category_videos', 'Videos', 'videos', 'play', 80, true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('archive_category_documents', 'Documents', 'documents', 'scroll-text', 90, true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('archive_category_health_warnings', 'Health Warnings', 'health-warnings', 'shield-alert', 100, true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('archive_category_catalogues_flyers', 'Catalogues/Flyers', 'catalogues-flyers', 'newspaper', 110, true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('archive_category_exhibition_materials', 'Exhibition Materials', 'exhibition-materials', 'badge-check', 120, true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

ALTER TABLE "ProjectArchive" ADD COLUMN "archiveCategoryId" TEXT;
ALTER TABLE "ManualArchiveFile" ADD COLUMN "archiveCategoryId" TEXT;

ALTER TABLE "ProjectArchive"
ADD CONSTRAINT "ProjectArchive_archiveCategoryId_fkey"
FOREIGN KEY ("archiveCategoryId") REFERENCES "ArchiveCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ManualArchiveFile"
ADD CONSTRAINT "ManualArchiveFile_archiveCategoryId_fkey"
FOREIGN KEY ("archiveCategoryId") REFERENCES "ArchiveCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "ProjectArchive_archiveCategoryId_archivedAt_idx" ON "ProjectArchive"("archiveCategoryId", "archivedAt");
CREATE INDEX "ManualArchiveFile_archiveCategoryId_uploadedAt_idx" ON "ManualArchiveFile"("archiveCategoryId", "uploadedAt");

DROP INDEX IF EXISTS "ProjectArchive_archiveCategorySlug_archivedAt_idx";
DROP INDEX IF EXISTS "ManualArchiveFile_archiveCategorySlug_uploadedAt_idx";

ALTER TABLE "ProjectArchive" DROP COLUMN "archiveCategorySlug";
ALTER TABLE "ProjectArchive" DROP COLUMN "archiveCategoryLabel";
ALTER TABLE "ManualArchiveFile" DROP COLUMN "archiveCategorySlug";
ALTER TABLE "ManualArchiveFile" DROP COLUMN "archiveCategoryLabel";
