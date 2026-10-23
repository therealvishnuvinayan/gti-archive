-- Phase 6.1 candidate only. No old rows are relocated or rewritten.
BEGIN;
-- CreateTable
CREATE TABLE "ArchiveFolder" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "parentId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "icon" TEXT NOT NULL DEFAULT 'folder',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArchiveFolder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArchiveFilePlacement" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "folderId" TEXT,
    "archivedProjectFileId" TEXT,
    "manualArchiveFileId" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArchiveFilePlacement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArchiveOrganizationCommand" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "request" JSONB NOT NULL,
    "categoryId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "before" JSONB NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArchiveOrganizationCommand_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ArchiveFolder_categoryId_parentId_idx" ON "ArchiveFolder"("categoryId", "parentId");

-- CreateIndex
CREATE UNIQUE INDEX "ArchiveFolder_id_categoryId_key" ON "ArchiveFolder"("id", "categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "ArchiveFilePlacement_archivedProjectFileId_key" ON "ArchiveFilePlacement"("archivedProjectFileId");

-- CreateIndex
CREATE UNIQUE INDEX "ArchiveFilePlacement_manualArchiveFileId_key" ON "ArchiveFilePlacement"("manualArchiveFileId");

-- CreateIndex
CREATE INDEX "ArchiveFilePlacement_categoryId_folderId_idx" ON "ArchiveFilePlacement"("categoryId", "folderId");

-- CreateIndex
CREATE INDEX "ArchiveOrganizationCommand_categoryId_createdAt_idx" ON "ArchiveOrganizationCommand"("categoryId", "createdAt");

-- AddForeignKey
ALTER TABLE "ArchiveFolder" ADD CONSTRAINT "ArchiveFolder_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ArchiveCategory"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ArchiveFolder" ADD CONSTRAINT "ArchiveFolder_parentId_categoryId_fkey" FOREIGN KEY ("parentId", "categoryId") REFERENCES "ArchiveFolder"("id", "categoryId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ArchiveFilePlacement" ADD CONSTRAINT "ArchiveFilePlacement_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ArchiveCategory"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ArchiveFilePlacement" ADD CONSTRAINT "ArchiveFilePlacement_folderId_categoryId_fkey" FOREIGN KEY ("folderId", "categoryId") REFERENCES "ArchiveFolder"("id", "categoryId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ArchiveFilePlacement" ADD CONSTRAINT "ArchiveFilePlacement_archivedProjectFileId_fkey" FOREIGN KEY ("archivedProjectFileId") REFERENCES "ArchivedProjectFile"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ArchiveFilePlacement" ADD CONSTRAINT "ArchiveFilePlacement_manualArchiveFileId_fkey" FOREIGN KEY ("manualArchiveFileId") REFERENCES "ManualArchiveFile"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ArchiveOrganizationCommand" ADD CONSTRAINT "ArchiveOrganizationCommand_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- PostgreSQL 14-compatible: root and nested sibling names are case-insensitively unique.
CREATE UNIQUE INDEX "ArchiveFolder_sibling_name_key" ON "ArchiveFolder" ("categoryId", COALESCE("parentId", ''), lower(btrim(name)));
ALTER TABLE "ArchiveFolder" ADD CONSTRAINT "ArchiveFolder_metadata_check" CHECK (
  length(btrim(name)) BETWEEN 1 AND 120 AND name = btrim(name) AND name !~ '[[:cntrl:]/\\]' AND
  length(description) <= 2000 AND revision > 0 AND
  icon IN ('folder','archive','box','images','file-stack','play','scroll-text','shapes'));
ALTER TABLE "ArchiveFilePlacement" ADD CONSTRAINT "ArchiveFilePlacement_target_check" CHECK (
  num_nonnulls("archivedProjectFileId", "manualArchiveFileId") = 1 AND revision > 0 AND
  id = CASE WHEN "archivedProjectFileId" IS NOT NULL THEN 'project:' || "archivedProjectFileId" ELSE 'manual:' || "manualArchiveFileId" END);

CREATE FUNCTION flux_archive_folder_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE ancestors text[]; depth integer; subtree_depth integer;
BEGIN
  -- Serializable predicate conflicts close concurrent A→B/B→A write skew.
  IF current_setting('transaction_isolation') <> 'serializable' THEN
    RAISE EXCEPTION 'Archive organization requires Serializable isolation';
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.id <> OLD.id OR NEW."categoryId" <> OLD."categoryId" OR NEW.revision <> OLD.revision + 1) THEN
    RAISE EXCEPTION 'Archive folder identity/scope is immutable; revision must advance';
  END IF;
  WITH RECURSIVE path AS (
    SELECT id, "parentId", ARRAY[id] AS seen FROM "ArchiveFolder" WHERE id = NEW."parentId"
    UNION ALL
    SELECT f.id, f."parentId", p.seen || f.id FROM "ArchiveFolder" f JOIN path p ON f.id = p."parentId"
    WHERE NOT f.id = ANY(p.seen) AND cardinality(p.seen) <= 64
  ) SELECT array_agg(id), max(cardinality(seen)) INTO ancestors, depth FROM path;
  IF NEW.id = NEW."parentId" OR NEW.id = ANY(ancestors) OR depth >= 64 THEN
    RAISE EXCEPTION 'Archive folder cycle or maximum depth exceeded';
  END IF;
  WITH RECURSIVE subtree AS (
    SELECT id, 1 AS depth FROM "ArchiveFolder" WHERE id = NEW.id
    UNION ALL SELECT f.id, s.depth + 1 FROM "ArchiveFolder" f JOIN subtree s ON f."parentId" = s.id WHERE s.depth <= 64
  ) SELECT max(subtree.depth) INTO subtree_depth FROM subtree;
  IF COALESCE(depth, 0) + COALESCE(subtree_depth, 1) > 64 THEN
    RAISE EXCEPTION 'Archive folder subtree exceeds maximum depth';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER flux_archive_folder_guard BEFORE INSERT OR UPDATE ON "ArchiveFolder" FOR EACH ROW EXECUTE FUNCTION flux_archive_folder_guard();

CREATE FUNCTION flux_archive_placement_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source_category text;
BEGIN
  IF current_setting('transaction_isolation') <> 'serializable' THEN
    RAISE EXCEPTION 'Archive organization requires Serializable isolation';
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.id <> OLD.id OR NEW."categoryId" <> OLD."categoryId" OR
    NEW."archivedProjectFileId" IS DISTINCT FROM OLD."archivedProjectFileId" OR
    NEW."manualArchiveFileId" IS DISTINCT FROM OLD."manualArchiveFileId" OR NEW.revision <> OLD.revision + 1) THEN
    RAISE EXCEPTION 'Archive file organization cannot change source identity or scope';
  END IF;
  IF NEW."archivedProjectFileId" IS NOT NULL THEN
    SELECT a."archiveCategoryId" INTO source_category FROM "ArchivedProjectFile" f
      JOIN "ProjectArchive" a ON a.id = f."archiveId" JOIN "ProjectAttachment" s ON s.id = f."sourceAttachmentId"
      WHERE f.id = NEW."archivedProjectFileId" AND f."projectId" = a."projectId" AND s."projectId" = f."projectId"
      AND s.status = 'READY' AND s.bucket = f.bucket AND s."storageKey" = f."storageKey"
      AND s."revisionId" IS NOT DISTINCT FROM f."sourceRevisionId";
  ELSE
    SELECT "archiveCategoryId" INTO source_category FROM "ManualArchiveFile" WHERE id = NEW."manualArchiveFileId" AND status = 'READY';
  END IF;
  IF source_category IS DISTINCT FROM NEW."categoryId" THEN RAISE EXCEPTION 'Invalid Archive placement source category'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER flux_archive_placement_guard BEFORE INSERT OR UPDATE ON "ArchiveFilePlacement" FOR EACH ROW EXECUTE FUNCTION flux_archive_placement_guard();

CREATE FUNCTION flux_archive_command_retained() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Archive organization command history must be retained'; END $$;
CREATE TRIGGER flux_archive_command_retained BEFORE UPDATE OR DELETE OR TRUNCATE ON "ArchiveOrganizationCommand" FOR EACH STATEMENT EXECUTE FUNCTION flux_archive_command_retained();
COMMIT;
