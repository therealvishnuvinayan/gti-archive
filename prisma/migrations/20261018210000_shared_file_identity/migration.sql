-- Phase 2.1 additive candidate. Apply to Neon only after separate approval.
BEGIN;
-- CreateEnum
CREATE TYPE "SharedFileVersionStatus" AS ENUM ('UPLOADING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "SharedFileChecksumEvidence" AS ENUM ('UNKNOWN', 'S3_FULL_OBJECT_SHA256');

-- CreateEnum
CREATE TYPE "SharedFileReferenceRole" AS ENUM ('SOURCE', 'REFERENCE', 'ACCEPTED_EVIDENCE');

-- CreateTable
CREATE TABLE "SharedFile" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "flexibleProjectId" TEXT,
    "stageId" TEXT,
    "conceptFolderId" TEXT,
    "milestoneId" TEXT,
    "completionWorkflowId" TEXT,
    "completionDocumentType" "ProjectCompletionDocumentType",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SharedFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SharedFileVersion" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "status" "SharedFileVersionStatus" NOT NULL DEFAULT 'UPLOADING',
    "uploadedById" TEXT,
    "externalUploaderEmail" TEXT,
    "uploaderUnknown" BOOLEAN NOT NULL DEFAULT false,
    "originalFileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "bucket" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "objectVersionId" TEXT,
    "objectETag" TEXT,
    "checksumSha256" TEXT,
    "checksumEvidence" "SharedFileChecksumEvidence" NOT NULL DEFAULT 'UNKNOWN',
    "applicationSealed" BOOLEAN NOT NULL DEFAULT false,
    "observedAt" TIMESTAMP(3),
    "finalizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SharedFileVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SharedFileReference" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "role" "SharedFileReferenceRole" NOT NULL,
    "projectAttachmentId" TEXT,
    "flexibleAttachmentId" TEXT,
    "archivedProjectFileId" TEXT,
    "manualArchiveFileId" TEXT,
    "manualLibraryAssetId" TEXT,
    "completionSubmissionId" TEXT,
    "completionDocumentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SharedFileReference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SharedFileProvenance" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "completionEventId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SharedFileProvenance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SharedFile_projectId_idx" ON "SharedFile"("projectId");

-- CreateIndex
CREATE INDEX "SharedFile_flexibleProjectId_idx" ON "SharedFile"("flexibleProjectId");

-- CreateIndex
CREATE UNIQUE INDEX "SharedFile_completionWorkflowId_completionDocumentType_key" ON "SharedFile"("completionWorkflowId", "completionDocumentType");

-- CreateIndex
CREATE INDEX "SharedFileVersion_bucket_storageKey_idx" ON "SharedFileVersion"("bucket", "storageKey");

-- CreateIndex
CREATE INDEX "SharedFileVersion_uploadedById_idx" ON "SharedFileVersion"("uploadedById");

-- CreateIndex
CREATE UNIQUE INDEX "SharedFileVersion_fileId_number_key" ON "SharedFileVersion"("fileId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "SharedFileReference_projectAttachmentId_key" ON "SharedFileReference"("projectAttachmentId");

-- CreateIndex
CREATE UNIQUE INDEX "SharedFileReference_flexibleAttachmentId_key" ON "SharedFileReference"("flexibleAttachmentId");

-- CreateIndex
CREATE UNIQUE INDEX "SharedFileReference_archivedProjectFileId_key" ON "SharedFileReference"("archivedProjectFileId");

-- CreateIndex
CREATE UNIQUE INDEX "SharedFileReference_manualArchiveFileId_key" ON "SharedFileReference"("manualArchiveFileId");

-- CreateIndex
CREATE UNIQUE INDEX "SharedFileReference_manualLibraryAssetId_key" ON "SharedFileReference"("manualLibraryAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "SharedFileReference_completionSubmissionId_key" ON "SharedFileReference"("completionSubmissionId");

-- CreateIndex
CREATE UNIQUE INDEX "SharedFileReference_completionDocumentId_key" ON "SharedFileReference"("completionDocumentId");

-- CreateIndex
CREATE INDEX "SharedFileReference_versionId_idx" ON "SharedFileReference"("versionId");

-- CreateIndex
CREATE UNIQUE INDEX "SharedFileProvenance_completionEventId_key" ON "SharedFileProvenance"("completionEventId");

-- CreateIndex
CREATE INDEX "SharedFileProvenance_versionId_idx" ON "SharedFileProvenance"("versionId");

-- AddForeignKey
ALTER TABLE "SharedFile" ADD CONSTRAINT "SharedFile_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "SharedFile" ADD CONSTRAINT "SharedFile_flexibleProjectId_fkey" FOREIGN KEY ("flexibleProjectId") REFERENCES "FlexibleProject"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "SharedFile" ADD CONSTRAINT "SharedFile_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "ProjectStage"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "SharedFile" ADD CONSTRAINT "SharedFile_conceptFolderId_fkey" FOREIGN KEY ("conceptFolderId") REFERENCES "ProjectConceptFolder"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "SharedFile" ADD CONSTRAINT "SharedFile_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "FlexibleMilestone"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "SharedFile" ADD CONSTRAINT "SharedFile_completionWorkflowId_fkey" FOREIGN KEY ("completionWorkflowId") REFERENCES "ProjectCompletionWorkflow"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "SharedFileVersion" ADD CONSTRAINT "SharedFileVersion_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "SharedFile"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "SharedFileVersion" ADD CONSTRAINT "SharedFileVersion_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "SharedFileReference" ADD CONSTRAINT "SharedFileReference_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "SharedFileVersion"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "SharedFileReference" ADD CONSTRAINT "SharedFileReference_projectAttachmentId_fkey" FOREIGN KEY ("projectAttachmentId") REFERENCES "ProjectAttachment"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "SharedFileReference" ADD CONSTRAINT "SharedFileReference_flexibleAttachmentId_fkey" FOREIGN KEY ("flexibleAttachmentId") REFERENCES "FlexibleProjectAttachment"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "SharedFileReference" ADD CONSTRAINT "SharedFileReference_archivedProjectFileId_fkey" FOREIGN KEY ("archivedProjectFileId") REFERENCES "ArchivedProjectFile"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "SharedFileReference" ADD CONSTRAINT "SharedFileReference_manualArchiveFileId_fkey" FOREIGN KEY ("manualArchiveFileId") REFERENCES "ManualArchiveFile"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "SharedFileReference" ADD CONSTRAINT "SharedFileReference_manualLibraryAssetId_fkey" FOREIGN KEY ("manualLibraryAssetId") REFERENCES "ManualLibraryAsset"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "SharedFileReference" ADD CONSTRAINT "SharedFileReference_completionSubmissionId_fkey" FOREIGN KEY ("completionSubmissionId") REFERENCES "CompletionDocumentSubmission"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "SharedFileReference" ADD CONSTRAINT "SharedFileReference_completionDocumentId_fkey" FOREIGN KEY ("completionDocumentId") REFERENCES "ProjectCompletionDocument"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "SharedFileProvenance" ADD CONSTRAINT "SharedFileProvenance_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "SharedFileVersion"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "SharedFileProvenance" ADD CONSTRAINT "SharedFileProvenance_completionEventId_fkey" FOREIGN KEY ("completionEventId") REFERENCES "CompletionDocumentEvent"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;


CREATE UNIQUE INDEX "SharedFileReference_one_source_per_version" ON "SharedFileReference" ("versionId") WHERE role = 'SOURCE';

-- No historical records are backfilled or classified as content-verified.
ALTER TABLE "SharedFile" ADD CONSTRAINT "SharedFile_origin_check" CHECK (
  num_nonnulls("projectId", "flexibleProjectId") <= 1 AND
  (("completionWorkflowId" IS NULL) = ("completionDocumentType" IS NULL)) AND
  ("stageId" IS NULL OR "projectId" IS NOT NULL) AND
  ("conceptFolderId" IS NULL OR "projectId" IS NOT NULL) AND
  ("completionWorkflowId" IS NULL OR "projectId" IS NOT NULL) AND
  ("milestoneId" IS NULL OR "flexibleProjectId" IS NOT NULL)
);
ALTER TABLE "SharedFileVersion" ADD CONSTRAINT "SharedFileVersion_values_check" CHECK (
  "number" > 0 AND "fileSize" > 0 AND length(btrim("bucket")) > 0 AND length(btrim("storageKey")) > 0 AND
  length(btrim("mimeType")) > 0 AND length(btrim("originalFileName")) > 0 AND
  num_nonnulls("uploadedById", "externalUploaderEmail") + "uploaderUnknown"::int = 1 AND
  ("externalUploaderEmail" IS NULL OR length(btrim("externalUploaderEmail")) > 0) AND
  ("objectVersionId" IS NULL OR (length(btrim("objectVersionId")) > 0 AND "objectVersionId" <> 'null')) AND
  (("checksumEvidence" = 'UNKNOWN' AND "checksumSha256" IS NULL) OR
   ("checksumEvidence" = 'S3_FULL_OBJECT_SHA256' AND "checksumSha256" IS NOT NULL AND "checksumSha256" ~ '^[A-Za-z0-9+/]{43}=$')) AND
  (("status" = 'READY' AND "observedAt" IS NOT NULL AND "finalizedAt" IS NOT NULL AND "objectETag" IS NOT NULL AND length(btrim("objectETag")) > 0) OR
   ("status" = 'UPLOADING' AND "observedAt" IS NULL AND "finalizedAt" IS NULL AND "objectETag" IS NULL AND "objectVersionId" IS NULL AND "checksumSha256" IS NULL) OR
   ("status" = 'FAILED' AND "finalizedAt" IS NOT NULL AND "observedAt" IS NULL AND "objectETag" IS NULL AND "objectVersionId" IS NULL AND "checksumSha256" IS NULL))
);
ALTER TABLE "SharedFileReference" ADD CONSTRAINT "SharedFileReference_one_record_check" CHECK (
  num_nonnulls("projectAttachmentId", "flexibleAttachmentId", "archivedProjectFileId", "manualArchiveFileId",
    "manualLibraryAssetId", "completionSubmissionId", "completionDocumentId") = 1
);

CREATE FUNCTION flux_shared_file_origin_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'Shared file origin is immutable' USING ERRCODE = '23514'; END IF;
  IF NEW."stageId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "ProjectStage" WHERE id = NEW."stageId" AND "projectId" = NEW."projectId") THEN
    RAISE EXCEPTION 'Shared file stage/project mismatch' USING ERRCODE = '23514'; END IF;
  IF NEW."conceptFolderId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "ProjectConceptFolder" WHERE id = NEW."conceptFolderId" AND "projectId" = NEW."projectId") THEN
    RAISE EXCEPTION 'Shared file task/project mismatch' USING ERRCODE = '23514'; END IF;
  IF NEW."milestoneId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "FlexibleMilestone" WHERE id = NEW."milestoneId" AND "projectId" = NEW."flexibleProjectId") THEN
    RAISE EXCEPTION 'Shared file milestone/project mismatch' USING ERRCODE = '23514'; END IF;
  IF NEW."completionWorkflowId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "ProjectCompletionWorkflow" WHERE id = NEW."completionWorkflowId" AND "projectId" = NEW."projectId") THEN
    RAISE EXCEPTION 'Shared file workflow/project mismatch' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "SharedFile_origin_guard" BEFORE INSERT OR UPDATE OR DELETE ON "SharedFile"
  FOR EACH ROW EXECUTE FUNCTION flux_shared_file_origin_guard();

CREATE FUNCTION flux_shared_file_version_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Shared file versions are retained' USING ERRCODE = '23514'; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'UPLOADING' THEN RAISE EXCEPTION 'File version must start as an upload intent' USING ERRCODE = '23514'; END IF;
    RETURN NEW;
  END IF;
  IF OLD.status <> 'UPLOADING' OR NEW.status NOT IN ('READY', 'FAILED') OR
    (to_jsonb(NEW) - ARRAY['status','objectVersionId','objectETag','checksumSha256','checksumEvidence','observedAt','finalizedAt']) IS DISTINCT FROM
    (to_jsonb(OLD) - ARRAY['status','objectVersionId','objectETag','checksumSha256','checksumEvidence','observedAt','finalizedAt']) THEN
    RAISE EXCEPTION 'Final file versions and upload attribution are immutable' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "SharedFileReference" WHERE "versionId" = NEW.id AND role = 'SOURCE') THEN
    RAISE EXCEPTION 'File version requires a source reference' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "SharedFileVersion_guard" BEFORE INSERT OR UPDATE OR DELETE ON "SharedFileVersion"
  FOR EACH ROW EXECUTE FUNCTION flux_shared_file_version_guard();

CREATE FUNCTION flux_shared_file_reference_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v "SharedFileVersion"; f "SharedFile"; source jsonb; source_project text; source_flexible text;
BEGIN
  IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'File version references are immutable' USING ERRCODE = '23514'; END IF;
  SELECT * INTO STRICT v FROM "SharedFileVersion" WHERE id = NEW."versionId";
  SELECT * INTO STRICT f FROM "SharedFile" WHERE id = v."fileId";
  IF NEW."projectAttachmentId" IS NOT NULL THEN SELECT to_jsonb(t) INTO source FROM "ProjectAttachment" t WHERE id = NEW."projectAttachmentId";
  ELSIF NEW."flexibleAttachmentId" IS NOT NULL THEN SELECT to_jsonb(t) INTO source FROM "FlexibleProjectAttachment" t WHERE id = NEW."flexibleAttachmentId";
  ELSIF NEW."archivedProjectFileId" IS NOT NULL THEN SELECT to_jsonb(t) INTO source FROM "ArchivedProjectFile" t WHERE id = NEW."archivedProjectFileId";
  ELSIF NEW."manualArchiveFileId" IS NOT NULL THEN SELECT to_jsonb(t) INTO source FROM "ManualArchiveFile" t WHERE id = NEW."manualArchiveFileId";
  ELSIF NEW."manualLibraryAssetId" IS NOT NULL THEN SELECT to_jsonb(t) INTO source FROM "ManualLibraryAsset" t WHERE id = NEW."manualLibraryAssetId";
  ELSIF NEW."completionSubmissionId" IS NOT NULL THEN SELECT to_jsonb(t) INTO source FROM "CompletionDocumentSubmission" t WHERE id = NEW."completionSubmissionId";
  ELSIF NEW."completionDocumentId" IS NOT NULL THEN SELECT to_jsonb(t) INTO source FROM "ProjectCompletionDocument" t WHERE id = NEW."completionDocumentId";
  END IF;
  IF source IS NULL THEN RAISE EXCEPTION 'File reference source missing' USING ERRCODE = '23503'; END IF;
  IF NEW."flexibleAttachmentId" IS NOT NULL THEN source_flexible := source->>'projectId'; ELSE source_project := source->>'projectId'; END IF;
  IF f."projectId" IS DISTINCT FROM source_project OR f."flexibleProjectId" IS DISTINCT FROM source_flexible OR
    v.bucket IS DISTINCT FROM source->>'bucket' OR v."storageKey" IS DISTINCT FROM source->>'storageKey' OR
    v."fileSize" IS DISTINCT FROM (source->>'fileSize')::int OR v."mimeType" IS DISTINCT FROM source->>'mimeType' THEN
    RAISE EXCEPTION 'File reference origin/object mismatch' USING ERRCODE = '23514'; END IF;
  IF NEW."completionSubmissionId" IS NOT NULL AND (NEW.role <> 'SOURCE' OR
    f."completionWorkflowId" IS DISTINCT FROM source->>'workflowId' OR f."completionDocumentType"::text IS DISTINCT FROM source->>'type' OR
    v."uploadedById" IS DISTINCT FROM source->>'submittedById' OR v."externalUploaderEmail" IS DISTINCT FROM source->>'externalSubmitterEmail' OR v."uploaderUnknown") THEN
    RAISE EXCEPTION 'Completion source attribution mismatch' USING ERRCODE = '23514'; END IF;
  IF NEW.role = 'SOURCE' AND NEW."completionSubmissionId" IS NULL THEN
    IF NEW."archivedProjectFileId" IS NOT NULL OR NEW."completionDocumentId" IS NOT NULL THEN
      RAISE EXCEPTION 'Published/accepted records reference an original source' USING ERRCODE = '23514'; END IF;
    IF NEW."projectAttachmentId" IS NOT NULL AND source->>'uploadSource' <> 'AUTHENTICATED_USER' THEN
      IF v."uploadedById" IS NOT NULL OR v."externalUploaderEmail" IS DISTINCT FROM source->>'externalUploaderEmail' OR
        v."uploaderUnknown" IS DISTINCT FROM (source->>'externalUploaderEmail' IS NULL) THEN
        RAISE EXCEPTION 'External source uploader mismatch' USING ERRCODE = '23514'; END IF;
    ELSIF v."uploadedById" IS DISTINCT FROM source->>'uploadedById' OR v."externalUploaderEmail" IS NOT NULL OR v."uploaderUnknown" THEN
      RAISE EXCEPTION 'Source uploader mismatch' USING ERRCODE = '23514';
    END IF;
    IF NEW."projectAttachmentId" IS NOT NULL AND f."stageId" IS DISTINCT FROM source->>'stageId' THEN
      RAISE EXCEPTION 'Source stage mismatch' USING ERRCODE = '23514'; END IF;
    IF NEW."flexibleAttachmentId" IS NOT NULL AND f."milestoneId" IS DISTINCT FROM source->>'milestoneId' THEN
      RAISE EXCEPTION 'Source milestone mismatch' USING ERRCODE = '23514'; END IF;
  END IF;
  IF NEW."completionDocumentId" IS NOT NULL AND (NEW.role <> 'ACCEPTED_EVIDENCE' OR v.status <> 'READY' OR
    NOT EXISTS (SELECT 1 FROM "SharedFileReference" r JOIN "CompletionDocumentSubmission" s ON s.id = r."completionSubmissionId"
      WHERE r."versionId" = v.id AND s.id = source->>'submissionId' AND s.status = 'ACCEPTED' AND s."objectETag" = v."objectETag")) THEN
    RAISE EXCEPTION 'Accepted document must reference its exact submitted version' USING ERRCODE = '23514'; END IF;
  IF NEW.role = 'ACCEPTED_EVIDENCE' AND NEW."completionDocumentId" IS NULL THEN
    RAISE EXCEPTION 'Unsupported approval reference adapter' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "SharedFileReference_guard" BEFORE INSERT OR UPDATE OR DELETE ON "SharedFileReference"
  FOR EACH ROW EXECUTE FUNCTION flux_shared_file_reference_guard();

CREATE FUNCTION flux_shared_file_provenance_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'File provenance is immutable' USING ERRCODE = '23514'; END IF;
  IF NOT EXISTS (SELECT 1 FROM "CompletionDocumentEvent" e
    JOIN "SharedFileReference" r ON r."completionSubmissionId" = e."submissionId"
    JOIN "SharedFileVersion" v ON v.id = r."versionId"
    WHERE e.id = NEW."completionEventId" AND v.id = NEW."versionId" AND
      ((e.action = 'UPLOAD_PREPARED' AND v.status = 'UPLOADING') OR
       (e.action = 'UPLOAD_FAILED' AND v.status = 'FAILED') OR
       (e.action IN ('DOCUMENT_SUBMITTED','DOCUMENT_ACCEPTED','DOCUMENT_REJECTED') AND v.status = 'READY'))) THEN
    RAISE EXCEPTION 'File provenance must reference a matching native event/version' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "SharedFileProvenance_guard" BEFORE INSERT OR UPDATE OR DELETE ON "SharedFileProvenance"
  FOR EACH ROW EXECUTE FUNCTION flux_shared_file_provenance_guard();
COMMIT;
