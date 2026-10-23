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

-- AlterEnum
ALTER TYPE "BusinessEventType" ADD VALUE 'ARCHIVE_VERIFICATION_DECIDED';

-- CreateTable
CREATE TABLE "ArchiveVerificationDecision" (
    "id" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "sourceKind" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "projectId" TEXT,
    "sourceRevisionId" TEXT,
    "action" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "previousId" TEXT,
    "actorId" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "actorVersion" INTEGER NOT NULL,
    "sessionId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "commandId" TEXT NOT NULL,
    "commandHash" TEXT NOT NULL,
    "storageEvidence" JSONB NOT NULL,
    "eventId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArchiveVerificationDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetainedArchiveSource" (
    "id" TEXT NOT NULL,
    "manualSourceId" TEXT,
    "projectSourceId" TEXT,
    "sourceSnapshot" JSONB NOT NULL,
    "referenceSnapshot" JSONB NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorVersion" INTEGER NOT NULL,
    "sessionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetainedArchiveSource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ArchiveVerificationDecision_previousId_key" ON "ArchiveVerificationDecision"("previousId");

-- CreateIndex
CREATE UNIQUE INDEX "ArchiveVerificationDecision_eventId_key" ON "ArchiveVerificationDecision"("eventId");

-- CreateIndex
CREATE INDEX "ArchiveVerificationDecision_sourceKind_sourceId_versionId_idx" ON "ArchiveVerificationDecision"("sourceKind", "sourceId", "versionId");

-- CreateIndex
CREATE UNIQUE INDEX "ArchiveVerificationDecision_referenceId_sequence_key" ON "ArchiveVerificationDecision"("referenceId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "ArchiveVerificationDecision_actorId_commandId_key" ON "ArchiveVerificationDecision"("actorId", "commandId");

-- CreateIndex
CREATE UNIQUE INDEX "RetainedArchiveSource_manualSourceId_key" ON "RetainedArchiveSource"("manualSourceId");

-- CreateIndex
CREATE UNIQUE INDEX "RetainedArchiveSource_projectSourceId_key" ON "RetainedArchiveSource"("projectSourceId");

-- AddForeignKey
ALTER TABLE "ArchiveVerificationDecision" ADD CONSTRAINT "ArchiveVerificationDecision_referenceId_fkey" FOREIGN KEY ("referenceId") REFERENCES "SharedFileReference"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ArchiveVerificationDecision" ADD CONSTRAINT "ArchiveVerificationDecision_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "SharedFileVersion"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ArchiveVerificationDecision" ADD CONSTRAINT "ArchiveVerificationDecision_previousId_fkey" FOREIGN KEY ("previousId") REFERENCES "ArchiveVerificationDecision"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ArchiveVerificationDecision" ADD CONSTRAINT "ArchiveVerificationDecision_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ArchiveVerificationDecision" ADD CONSTRAINT "ArchiveVerificationDecision_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "BusinessEvent"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RetainedArchiveSource" ADD CONSTRAINT "RetainedArchiveSource_id_fkey" FOREIGN KEY ("id") REFERENCES "SharedFileReference"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RetainedArchiveSource" ADD CONSTRAINT "RetainedArchiveSource_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- Phase 6.2. No existing rows are adopted or changed.
ALTER TABLE "ArchiveVerificationDecision" ALTER CONSTRAINT "ArchiveVerificationDecision_eventId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "ArchiveVerificationDecision" ADD CONSTRAINT "ArchiveVerificationDecision_values_check" CHECK (
 action IN ('VERIFY','REVOKE') AND "sourceKind" IN ('manual','project') AND sequence > 0 AND "actorVersion">0 AND
 "actorRole" IN ('DIRECTOR','DIGITAL_LEAD') AND length(btrim(reason)) BETWEEN 1 AND 2000 AND
 length("commandId") BETWEEN 1 AND 128 AND "commandHash" ~ '^[a-f0-9]{64}$' AND "eventId"='archive-review:'||id AND jsonb_typeof("storageEvidence")='object');
ALTER TABLE "RetainedArchiveSource" ADD CONSTRAINT "RetainedArchiveSource_typed_check" CHECK (num_nonnulls("manualSourceId","projectSourceId")=1);

CREATE FUNCTION flux_archive_review_source(rid text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE r "SharedFileReference"; v "SharedFileVersion"; f "SharedFile"; src jsonb; cat text; pid text; rev text; kind text;
BEGIN
 SELECT * INTO STRICT r FROM "SharedFileReference" WHERE id=rid;
 SELECT * INTO STRICT v FROM "SharedFileVersion" WHERE id=r."versionId";
 SELECT * INTO STRICT f FROM "SharedFile" WHERE id=v."fileId";
 IF r."manualArchiveFileId" IS NOT NULL THEN
  SELECT to_jsonb(m),m."archiveCategoryId" INTO src,cat FROM "ManualArchiveFile" m WHERE m.id=r."manualArchiveFileId" AND m.status='READY'; kind:='manual';
 ELSIF r."archivedProjectFileId" IS NOT NULL THEN
  SELECT to_jsonb(a),p."archiveCategoryId",a."projectId",a."sourceRevisionId" INTO src,cat,pid,rev FROM "ArchivedProjectFile" a
   JOIN "ProjectArchive" p ON p.id=a."archiveId" AND p."projectId"=a."projectId"
   JOIN "ProjectAttachment" s ON s.id=a."sourceAttachmentId" AND s."projectId"=a."projectId" AND s.status='READY' AND s.bucket=a.bucket AND s."storageKey"=a."storageKey" AND s."revisionId" IS NOT DISTINCT FROM a."sourceRevisionId"
   WHERE a.id=r."archivedProjectFileId" AND (s."submissionReviewStatus" IS NULL OR s."submissionReviewStatus"='APPROVED') AND (s."revisionId" IS NULL OR EXISTS(SELECT 1 FROM "ProjectRevision" rv WHERE rv.id=s."revisionId" AND rv.status='APPROVED')); kind:='project';
 END IF;
 IF src IS NULL OR NOT EXISTS(SELECT 1 FROM "ArchiveCategory" WHERE id=cat AND "isActive") OR v.status<>'READY' OR
  v."objectETag" IS NULL OR (v."objectVersionId" IS NULL AND NOT v."applicationSealed") OR
  v.bucket IS DISTINCT FROM src->>'bucket' OR v."storageKey" IS DISTINCT FROM src->>'storageKey' OR v."fileSize" IS DISTINCT FROM (src->>'fileSize')::int OR v."mimeType" IS DISTINCT FROM src->>'mimeType' OR
  f."projectId" IS DISTINCT FROM pid OR f."flexibleProjectId" IS NOT NULL OR f."runtimeStageId" IS NOT NULL THEN RETURN NULL; END IF;
 RETURN jsonb_build_object('sourceKind',kind,'sourceId',src->>'id','categoryId',cat,'projectId',pid,'sourceRevisionId',rev);
END $$;

CREATE FUNCTION flux_archive_review_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source jsonb; v "SharedFileVersion"; previous "ArchiveVerificationDecision"; r "SharedFileReference";
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Archive review history is immutable and retained' USING ERRCODE='23514'; END IF;
 IF current_setting('transaction_isolation')<>'serializable' OR NEW."actorId" IS DISTINCT FROM current_setting('flux.archive_review_actor',true) OR
  NEW."sessionId" IS DISTINCT FROM current_setting('flux.archive_review_session',true) OR current_setting('flux.archive_review_confirmed',true) IS DISTINCT FROM 'true' OR
  NOT coalesce(flux_workflow_actor_current(NEW."actorId",NEW."actorRole",NEW."actorVersion",NEW."sessionId"),false) OR
  (NEW.action='REVOKE' AND NEW."actorRole"<>'DIRECTOR') THEN RAISE EXCEPTION 'Current authorized Archive reviewer required' USING ERRCODE='23514'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('archive-review:'||NEW."referenceId",0));
 source:=flux_archive_review_source(NEW."referenceId");
 SELECT * INTO STRICT r FROM "SharedFileReference" WHERE id=NEW."referenceId";
 SELECT * INTO STRICT v FROM "SharedFileVersion" WHERE id=r."versionId";
 IF source IS NULL OR NEW."versionId"<>v.id OR source IS DISTINCT FROM jsonb_build_object('sourceKind',NEW."sourceKind",'sourceId',NEW."sourceId",'categoryId',NEW."categoryId",'projectId',NEW."projectId",'sourceRevisionId',NEW."sourceRevisionId") THEN RAISE EXCEPTION 'Exact eligible Archive source and version required' USING ERRCODE='23514'; END IF;
 IF NEW."actorRole"='DIGITAL_LEAD' AND (NOT EXISTS(SELECT 1 FROM "UserArchiveAssetAccess" WHERE "userId"=NEW."actorId" AND ("manualArchiveFileId"=r."manualArchiveFileId" OR "archivedProjectFileId"=r."archivedProjectFileId")) OR
  (EXISTS(SELECT 1 FROM "ArchiveCategoryAccess" WHERE "archiveCategoryId"=NEW."categoryId") AND NOT EXISTS(SELECT 1 FROM "ArchiveCategoryAccess" WHERE "archiveCategoryId"=NEW."categoryId" AND "userId"=NEW."actorId"))) THEN RAISE EXCEPTION 'Explicit file and category grant required' USING ERRCODE='23514'; END IF;
 SELECT * INTO previous FROM "ArchiveVerificationDecision" WHERE "referenceId"=NEW."referenceId" ORDER BY sequence DESC LIMIT 1;
 IF NEW.sequence<>coalesce(previous.sequence,0)+1 OR NEW."previousId" IS DISTINCT FROM previous.id OR
  (NEW.action='VERIFY' AND previous.action='VERIFY') OR (NEW.action='REVOKE' AND previous.action IS DISTINCT FROM 'VERIFY') THEN RAISE EXCEPTION 'Stale or invalid Archive review transition' USING ERRCODE='23514'; END IF;
 IF NEW.action='VERIFY' THEN
  IF NEW."storageEvidence" - 'observedAt' IS DISTINCT FROM jsonb_build_object('bucket',v.bucket,'storageKey',v."storageKey",'objectVersionId',v."objectVersionId",'objectETag',v."objectETag",'checksumSha256',v."checksumSha256",'checksumEvidence',v."checksumEvidence",'fileSize',v."fileSize",'mimeType',v."mimeType") OR
   NOT (NEW."storageEvidence" ? 'observedAt') OR (NEW."storageEvidence"->>'observedAt')::timestamptz NOT BETWEEN clock_timestamp()-interval '5 minutes' AND clock_timestamp()+interval '5 seconds' THEN RAISE EXCEPTION 'Current exact storage observation required' USING ERRCODE='23514'; END IF;
 ELSIF NEW."storageEvidence" IS DISTINCT FROM previous."storageEvidence" THEN RAISE EXCEPTION 'Revocation must retain original observation' USING ERRCODE='23514'; END IF;
 NEW."createdAt":=clock_timestamp();
 RETURN NEW;
END $$;
CREATE TRIGGER flux_archive_review_guard BEFORE INSERT OR UPDATE OR DELETE ON "ArchiveVerificationDecision" FOR EACH ROW EXECUTE FUNCTION flux_archive_review_guard();
CREATE TRIGGER flux_archive_review_truncate BEFORE TRUNCATE ON "ArchiveVerificationDecision" FOR EACH STATEMENT EXECUTE FUNCTION flux_archive_review_guard();

CREATE FUNCTION flux_emit_archive_review_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO "BusinessEvent" (id,type,"schemaVersion","aggregateType","aggregateId",sequence,"actorId","actorRole","actorVersion",operation,"fileVersionId","correlationId","causationId","idempotencyKey","occurredAt",payload)
 VALUES(NEW."eventId",'ARCHIVE_VERIFICATION_DECIDED',1,'ARCHIVE_FILE_VERSION',NEW."referenceId",NEW.sequence,NEW."actorId",NEW."actorRole",NEW."actorVersion",'archiveVerificationCommand',NEW."versionId",NEW."referenceId",NEW.id,NEW."eventId",NEW."createdAt",jsonb_build_object('action',NEW.action));
 INSERT INTO "EventOutbox" ("eventId","consumerKey") VALUES (NEW."eventId",'internal.audit.v1');
 RETURN NEW;
END $$;
CREATE TRIGGER flux_emit_archive_review_event AFTER INSERT ON "ArchiveVerificationDecision" FOR EACH ROW EXECUTE FUNCTION flux_emit_archive_review_event();

-- Extend the existing check and guard without duplicating/weakening any existing
-- producer branch. PostgreSQL's stored definition is used, not historical SQL edits.
DO $migration$
DECLARE definition text; existing_check text;
BEGIN
 SELECT pg_get_constraintdef(oid) INTO STRICT existing_check FROM pg_constraint WHERE conrelid='"BusinessEvent"'::regclass AND conname='BusinessEvent_contract_check';
 EXECUTE 'ALTER TABLE "BusinessEvent" DROP CONSTRAINT "BusinessEvent_contract_check"';
 EXECUTE 'ALTER TABLE "BusinessEvent" ADD CONSTRAINT "BusinessEvent_contract_check" CHECK ('||substring(existing_check FROM 7)||$check$ OR
 (type::text='ARCHIVE_VERIFICATION_DECIDED' AND "schemaVersion"=1 AND "aggregateType"='ARCHIVE_FILE_VERSION' AND operation='archiveVerificationCommand' AND sequence>0 AND "actorVersion">0 AND "actorRole" IN ('DIRECTOR','DIGITAL_LEAD') AND "fileVersionId" IS NOT NULL AND num_nonnulls("projectId","flexibleProjectId","taskId","taskEntryId","decisionId","nativeEventId","approvalEvidenceId")=0))$check$;
 SELECT pg_get_functiondef('flux_event_write_guard()'::regprocedure) INTO definition;
 definition:=regexp_replace(definition,E'BEGIN\n',$branch$BEGIN
 IF TG_TABLE_NAME='BusinessEvent' THEN
 IF TG_OP='INSERT' AND NEW.type::text='ARCHIVE_VERIFICATION_DECIDED' THEN
  IF pg_trigger_depth()<>2 OR NOT EXISTS(SELECT 1 FROM "ArchiveVerificationDecision" a WHERE NEW.id=a."eventId" AND NEW."aggregateId"=a."referenceId" AND NEW.sequence=a.sequence AND NEW."actorId"=a."actorId" AND NEW."actorRole"=a."actorRole" AND NEW."actorVersion"=a."actorVersion" AND NEW."occurredAt"=a."createdAt" AND NEW."fileVersionId"=a."versionId" AND NEW."causationId"=a.id AND NEW."correlationId"=a."referenceId" AND NEW."idempotencyKey"=NEW.id AND NEW.payload=jsonb_build_object('action',a.action)) THEN RAISE EXCEPTION 'Exact native Archive review event required' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END IF;
 END IF;
$branch$);
 EXECUTE definition;
END $migration$;

CREATE FUNCTION flux_archive_source_retention() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE ref "SharedFileReference"; uid text; sid text; av int;
BEGIN
 IF TG_OP='INSERT' THEN
  IF EXISTS(SELECT 1 FROM "RetainedArchiveSource" WHERE (TG_TABLE_NAME='ManualArchiveFile' AND "manualSourceId"=NEW.id) OR (TG_TABLE_NAME='ArchivedProjectFile' AND "projectSourceId"=NEW.id)) THEN RAISE EXCEPTION 'Retired Archive identity cannot be reused' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END IF;
 SELECT * INTO ref FROM "SharedFileReference" WHERE (TG_TABLE_NAME='ManualArchiveFile' AND "manualArchiveFileId"=OLD.id) OR (TG_TABLE_NAME='ArchivedProjectFile' AND "archivedProjectFileId"=OLD.id);
 IF ref.id IS NULL THEN RETURN OLD; END IF;
 uid:=current_setting('flux.archive_delete_actor',true); sid:=current_setting('flux.archive_delete_session',true);
 SELECT "authorizationVersion" INTO av FROM "UserAuthorization" WHERE "userId"=uid;
 IF current_setting('transaction_isolation')<>'serializable' OR NOT coalesce(flux_workflow_actor_current(uid,'DIRECTOR',av,sid),false) OR current_setting('flux.archive_delete_id',true) IS DISTINCT FROM OLD.id THEN RAISE EXCEPTION 'Existing Director deletion boundary required' USING ERRCODE='23514'; END IF;
 INSERT INTO "RetainedArchiveSource" (id,"manualSourceId","projectSourceId","sourceSnapshot","referenceSnapshot","actorId","actorVersion","sessionId") VALUES(ref.id,ref."manualArchiveFileId",ref."archivedProjectFileId",to_jsonb(OLD),to_jsonb(ref),uid,av,sid);
 UPDATE "SharedFileReference" SET "manualArchiveFileId"=NULL,"archivedProjectFileId"=NULL WHERE id=ref.id;
 RETURN OLD;
END $$;
CREATE TRIGGER flux_archive_source_retention BEFORE INSERT OR DELETE ON "ManualArchiveFile" FOR EACH ROW EXECUTE FUNCTION flux_archive_source_retention();
CREATE TRIGGER flux_archive_source_retention BEFORE INSERT OR DELETE ON "ArchivedProjectFile" FOR EACH ROW EXECUTE FUNCTION flux_archive_source_retention();
CREATE FUNCTION flux_archive_retention_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP<>'INSERT' OR pg_trigger_depth()<>2 OR NEW."actorId" IS DISTINCT FROM current_setting('flux.archive_delete_actor',true) OR NEW."sessionId" IS DISTINCT FROM current_setting('flux.archive_delete_session',true) OR NOT coalesce(flux_workflow_actor_current(NEW."actorId",'DIRECTOR',NEW."actorVersion",NEW."sessionId"),false) THEN RAISE EXCEPTION 'Archive tombstones are retained native deletion evidence' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER flux_archive_retention_guard BEFORE INSERT OR UPDATE OR DELETE ON "RetainedArchiveSource" FOR EACH ROW EXECUTE FUNCTION flux_archive_retention_guard();
CREATE TRIGGER flux_archive_retention_truncate BEFORE TRUNCATE ON "RetainedArchiveSource" FOR EACH STATEMENT EXECUTE FUNCTION flux_archive_retention_guard();
DO $migration$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('flux_shared_file_reference_guard()'::regprocedure) INTO definition;
 definition:=regexp_replace(definition,E'BEGIN\n',$branch$BEGIN
 IF TG_OP='UPDATE' AND pg_trigger_depth()=2 AND NEW."manualArchiveFileId" IS NULL AND NEW."archivedProjectFileId" IS NULL AND
  (to_jsonb(NEW)-ARRAY['manualArchiveFileId','archivedProjectFileId'])=(to_jsonb(OLD)-ARRAY['manualArchiveFileId','archivedProjectFileId']) AND
  EXISTS(SELECT 1 FROM "RetainedArchiveSource" r WHERE r.id=OLD.id AND r."referenceSnapshot"=to_jsonb(OLD) AND r."actorId"=current_setting('flux.archive_delete_actor',true) AND r."sessionId"=current_setting('flux.archive_delete_session',true) AND coalesce(r."manualSourceId",r."projectSourceId")=current_setting('flux.archive_delete_id',true)) THEN RETURN NEW; END IF;
$branch$);
 EXECUTE definition;
END $migration$;

-- AlterEnum
ALTER TYPE "BusinessEventType" ADD VALUE 'ARCHIVE_ACCESS_DECIDED';

-- CreateTable
CREATE TABLE "ArchiveGrantScope" (
    "grantId" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,

    CONSTRAINT "ArchiveGrantScope_pkey" PRIMARY KEY ("grantId")
);

-- CreateTable
CREATE TABLE "ArchiveAccessDecision" (
    "id" TEXT NOT NULL,
    "sourceKind" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "grantId" TEXT NOT NULL,
    "referenceId" TEXT,
    "versionId" TEXT,
    "sourceSnapshot" JSONB NOT NULL,
    "action" TEXT NOT NULL,
    "capability" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "sequence" INTEGER NOT NULL,
    "previousId" TEXT,
    "actorId" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "actorVersion" INTEGER NOT NULL,
    "sessionId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "commandId" TEXT NOT NULL,
    "commandHash" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArchiveAccessDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ArchiveGrantScope_decisionId_key" ON "ArchiveGrantScope"("decisionId");

-- CreateIndex
CREATE UNIQUE INDEX "ArchiveAccessDecision_previousId_key" ON "ArchiveAccessDecision"("previousId");

-- CreateIndex
CREATE UNIQUE INDEX "ArchiveAccessDecision_eventId_key" ON "ArchiveAccessDecision"("eventId");

-- CreateIndex
CREATE INDEX "ArchiveAccessDecision_sourceKind_sourceId_createdAt_idx" ON "ArchiveAccessDecision"("sourceKind", "sourceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ArchiveAccessDecision_source_recipient_sequence_key" ON "ArchiveAccessDecision"("sourceKind", "sourceId", "recipientId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "ArchiveAccessDecision_actorId_commandId_key" ON "ArchiveAccessDecision"("actorId", "commandId");

-- AddForeignKey
ALTER TABLE "ArchiveGrantScope" ADD CONSTRAINT "ArchiveGrantScope_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "UserArchiveAssetAccess"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ArchiveGrantScope" ADD CONSTRAINT "ArchiveGrantScope_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "ArchiveAccessDecision"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ArchiveAccessDecision" ADD CONSTRAINT "ArchiveAccessDecision_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ArchiveAccessDecision" ADD CONSTRAINT "ArchiveAccessDecision_referenceId_fkey" FOREIGN KEY ("referenceId") REFERENCES "SharedFileReference"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ArchiveAccessDecision" ADD CONSTRAINT "ArchiveAccessDecision_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "SharedFileVersion"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ArchiveAccessDecision" ADD CONSTRAINT "ArchiveAccessDecision_previousId_fkey" FOREIGN KEY ("previousId") REFERENCES "ArchiveAccessDecision"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ArchiveAccessDecision" ADD CONSTRAINT "ArchiveAccessDecision_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ArchiveAccessDecision" ADD CONSTRAINT "ArchiveAccessDecision_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "BusinessEvent"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- Phase 6.3: no changes to existing grants. New decisions narrow native grants.
ALTER TABLE "ArchiveAccessDecision" ALTER CONSTRAINT "ArchiveAccessDecision_eventId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "ArchiveAccessDecision" ADD CONSTRAINT "ArchiveAccessDecision_values_check" CHECK (
 action IN ('GRANT','REVOKE') AND "sourceKind" IN ('manual','project') AND sequence>0 AND "actorVersion">0 AND
 "actorRole" IN ('DIRECTOR','SENIOR_PROJECT_MANAGER') AND capability='PREVIEW_DOWNLOAD' AND
 length(btrim(reason)) BETWEEN 1 AND 2000 AND length("commandId") BETWEEN 1 AND 128 AND
 "commandHash" ~ '^[a-f0-9]{64}$' AND "eventId"='archive-access:'||id AND
 num_nonnulls("referenceId","versionId") IN (0,2) AND jsonb_typeof("sourceSnapshot")='object');

-- Genuine native identity, with a version only when a genuine immutable reference
-- exists. Organization/name changes are deliberately absent from this snapshot.
CREATE FUNCTION flux_archive_access_source(kind text, sid text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE src jsonb; cat text; pid text; rev text; r "SharedFileReference"; v "SharedFileVersion"; f "SharedFile";
BEGIN
 IF kind='manual' THEN
  SELECT to_jsonb(m),m."archiveCategoryId" INTO src,cat FROM "ManualArchiveFile" m WHERE m.id=sid AND m.status='READY';
  SELECT * INTO r FROM "SharedFileReference" WHERE "manualArchiveFileId"=sid;
 ELSIF kind='project' THEN
  SELECT to_jsonb(a),p."archiveCategoryId",a."projectId",a."sourceRevisionId" INTO src,cat,pid,rev FROM "ArchivedProjectFile" a
   JOIN "ProjectArchive" p ON p.id=a."archiveId" AND p."projectId"=a."projectId"
   JOIN "ProjectAttachment" s ON s.id=a."sourceAttachmentId" AND s."projectId"=a."projectId" AND s.status='READY' AND s.bucket=a.bucket AND s."storageKey"=a."storageKey" AND s."revisionId" IS NOT DISTINCT FROM a."sourceRevisionId" WHERE a.id=sid;
  SELECT * INTO r FROM "SharedFileReference" WHERE "archivedProjectFileId"=sid;
 END IF;
 IF src IS NULL OR NOT EXISTS(SELECT 1 FROM "ArchiveCategory" WHERE id=cat AND "isActive") THEN RETURN NULL; END IF;
 IF r.id IS NOT NULL THEN
  SELECT * INTO STRICT v FROM "SharedFileVersion" WHERE id=r."versionId";
  SELECT * INTO STRICT f FROM "SharedFile" WHERE id=v."fileId";
  IF v.status<>'READY' OR v."objectETag" IS NULL OR (v."objectVersionId" IS NULL AND NOT v."applicationSealed") OR
   v.bucket IS DISTINCT FROM src->>'bucket' OR v."storageKey" IS DISTINCT FROM src->>'storageKey' OR v."fileSize" IS DISTINCT FROM (src->>'fileSize')::int OR v."mimeType" IS DISTINCT FROM src->>'mimeType' OR
   f."projectId" IS DISTINCT FROM pid OR f."flexibleProjectId" IS NOT NULL OR f."runtimeStageId" IS NOT NULL THEN RETURN NULL; END IF;
 END IF;
 RETURN jsonb_build_object('sourceKind',kind,'sourceId',sid,'categoryId',cat,'projectId',pid,'sourceRevisionId',rev,
  'bucket',src->>'bucket','storageKey',src->>'storageKey','fileSize',src->'fileSize','mimeType',src->>'mimeType','referenceId',r.id,'versionId',r."versionId");
END $$;

CREATE FUNCTION flux_archive_grant_effective(gid text, purpose text DEFAULT 'download') RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE g "UserArchiveAssetAccess"; d "ArchiveAccessDecision";
BEGIN
 SELECT * INTO g FROM "UserArchiveAssetAccess" WHERE id=gid;
 IF g.id IS NULL THEN RETURN false; END IF;
 SELECT a.* INTO d FROM "ArchiveGrantScope" s JOIN "ArchiveAccessDecision" a ON a.id=s."decisionId" WHERE s."grantId"=gid;
 IF d.id IS NULL THEN RETURN true; END IF; -- reviewed native semantics retained
 RETURN purpose='download' AND d.action='GRANT' AND g."userId"=d."recipientId" AND g."grantedById"=d."actorId" AND
  (d."expiresAt" IS NULL OR d."expiresAt">(clock_timestamp() AT TIME ZONE 'UTC')) AND
  ((d."sourceKind"='manual' AND g."manualArchiveFileId"=d."sourceId" AND g."archivedProjectFileId" IS NULL) OR
   (d."sourceKind"='project' AND g."archivedProjectFileId"=d."sourceId" AND g."manualArchiveFileId" IS NULL)) AND
  coalesce(d."sourceSnapshot"=flux_archive_access_source(d."sourceKind",d."sourceId"),false);
END $$;

CREATE FUNCTION flux_archive_access_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE src jsonb; previous "ArchiveAccessDecision"; g "UserArchiveAssetAccess";
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Archive access history is immutable and retained' USING ERRCODE='23514'; END IF;
 IF current_setting('transaction_isolation')<>'serializable' OR NEW."actorId" IS DISTINCT FROM current_setting('flux.archive_access_actor',true) OR
  NEW."sessionId" IS DISTINCT FROM current_setting('flux.archive_access_session',true) OR current_setting('flux.archive_access_confirmed',true) IS DISTINCT FROM 'true' OR
  NOT coalesce(flux_workflow_actor_current(NEW."actorId",NEW."actorRole",NEW."actorVersion",NEW."sessionId"),false) THEN RAISE EXCEPTION 'Current authorized sharing manager required' USING ERRCODE='23514'; END IF;
 LOCK TABLE "ArchiveCategory", "ArchiveCategoryAccess", "UserArchiveAssetAccess" IN SHARE ROW EXCLUSIVE MODE;
 PERFORM 1 FROM "UserAuthorization" WHERE "userId"=NEW."recipientId" FOR SHARE;
 PERFORM pg_advisory_xact_lock(hashtextextended('archive-access:'||NEW."sourceKind"||':'||NEW."sourceId",0));
 src:=flux_archive_access_source(NEW."sourceKind",NEW."sourceId");
 IF src IS NULL OR NEW."sourceSnapshot" IS DISTINCT FROM src OR NEW."categoryId" IS DISTINCT FROM src->>'categoryId' OR NEW."referenceId" IS DISTINCT FROM src->>'referenceId' OR NEW."versionId" IS DISTINCT FROM src->>'versionId' THEN RAISE EXCEPTION 'Exact authorized native source required' USING ERRCODE='23514'; END IF;
 IF NEW.action='GRANT' AND (NOT EXISTS(SELECT 1 FROM "UserAuthorization" WHERE "userId"=NEW."recipientId" AND "accountStatus"='ACTIVE' AND "businessRole" IN ('DESIGNER','DIGITAL_LEAD')) OR
  (EXISTS(SELECT 1 FROM "ArchiveCategoryAccess" WHERE "archiveCategoryId"=NEW."categoryId") AND NOT EXISTS(SELECT 1 FROM "ArchiveCategoryAccess" WHERE "archiveCategoryId"=NEW."categoryId" AND "userId"=NEW."recipientId")) OR
  (NEW."expiresAt" IS NOT NULL AND (NEW."expiresAt"<=(clock_timestamp() AT TIME ZONE 'UTC') OR NEW."expiresAt">(clock_timestamp() AT TIME ZONE 'UTC')+interval '90 days'))) THEN RAISE EXCEPTION 'Eligible recipient, category and bounded expiry required' USING ERRCODE='23514'; END IF;
 SELECT * INTO previous FROM "ArchiveAccessDecision" WHERE "sourceKind"=NEW."sourceKind" AND "sourceId"=NEW."sourceId" AND "recipientId"=NEW."recipientId" ORDER BY sequence DESC LIMIT 1;
 IF NEW.sequence<>coalesce(previous.sequence,0)+1 OR NEW."previousId" IS DISTINCT FROM previous.id THEN RAISE EXCEPTION 'Stale Archive access command' USING ERRCODE='23514'; END IF;
 SELECT * INTO g FROM "UserArchiveAssetAccess" WHERE "userId"=NEW."recipientId" AND ((NEW."sourceKind"='manual' AND "manualArchiveFileId"=NEW."sourceId") OR (NEW."sourceKind"='project' AND "archivedProjectFileId"=NEW."sourceId"));
 IF (NEW.action='GRANT' AND g.id IS NOT NULL) OR (NEW.action='REVOKE' AND g.id IS DISTINCT FROM NEW."grantId") OR (NEW.action='REVOKE' AND NEW."expiresAt" IS NOT NULL) THEN RAISE EXCEPTION 'Native grant changed; refresh access' USING ERRCODE='23514'; END IF;
 NEW."createdAt":=(clock_timestamp() AT TIME ZONE 'UTC'); RETURN NEW;
END $$;
CREATE TRIGGER flux_archive_access_guard BEFORE INSERT OR UPDATE OR DELETE ON "ArchiveAccessDecision" FOR EACH ROW EXECUTE FUNCTION flux_archive_access_guard();
CREATE TRIGGER flux_archive_access_truncate BEFORE TRUNCATE ON "ArchiveAccessDecision" FOR EACH STATEMENT EXECUTE FUNCTION flux_archive_access_guard();

-- Untouched native grants keep their legacy writer. Once a pair has audit
-- history it can only be changed by a new confirmed decision (even flag-off).
CREATE FUNCTION flux_archive_native_grant_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE g "UserArchiveAssetAccess"; d "ArchiveAccessDecision"; uid text; sid text; av int;
BEGIN
 IF TG_OP='TRUNCATE' THEN RAISE EXCEPTION 'Native grants cannot be truncated' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' THEN g:=NEW; ELSE g:=OLD; END IF;
 IF NOT EXISTS(SELECT 1 FROM "ArchiveAccessDecision" WHERE "recipientId"=g."userId" AND (("sourceKind"='manual' AND "sourceId"=g."manualArchiveFileId") OR ("sourceKind"='project' AND "sourceId"=g."archivedProjectFileId"))) THEN
  IF TG_OP='UPDATE' AND EXISTS(SELECT 1 FROM "ArchiveAccessDecision" WHERE "recipientId"=NEW."userId" AND (("sourceKind"='manual' AND "sourceId"=NEW."manualArchiveFileId") OR ("sourceKind"='project' AND "sourceId"=NEW."archivedProjectFileId"))) THEN RAISE EXCEPTION 'Cannot replace audited grant identity' USING ERRCODE='23514'; END IF;
  RETURN coalesce(NEW,OLD);
 END IF;
 SELECT * INTO d FROM "ArchiveAccessDecision" WHERE id=current_setting('flux.archive_access_decision',true);
 IF pg_trigger_depth()=2 AND TG_OP IN ('INSERT','DELETE') AND d."grantId"=g.id AND d."recipientId"=g."userId" AND
  d."actorId"=current_setting('flux.archive_access_actor',true) AND d."sessionId"=current_setting('flux.archive_access_session',true) AND
  ((TG_OP='INSERT' AND d.action='GRANT' AND g."grantedById"=d."actorId") OR (TG_OP='DELETE' AND d.action='REVOKE')) AND
  ((d."sourceKind"='manual' AND g."manualArchiveFileId"=d."sourceId" AND g."archivedProjectFileId" IS NULL) OR (d."sourceKind"='project' AND g."archivedProjectFileId"=d."sourceId" AND g."manualArchiveFileId" IS NULL)) THEN RETURN coalesce(NEW,OLD); END IF;
 uid:=current_setting('flux.archive_delete_actor',true); sid:=current_setting('flux.archive_delete_session',true);
 SELECT "authorizationVersion" INTO av FROM "UserAuthorization" WHERE "userId"=uid;
 IF TG_OP='DELETE' AND pg_trigger_depth()>1 AND coalesce(flux_workflow_actor_current(uid,'DIRECTOR',av,sid),false) AND
  current_setting('flux.archive_delete_id',true)=coalesce(g."manualArchiveFileId",g."archivedProjectFileId") AND
  NOT EXISTS(SELECT 1 FROM "ManualArchiveFile" WHERE id=g."manualArchiveFileId") AND NOT EXISTS(SELECT 1 FROM "ArchivedProjectFile" WHERE id=g."archivedProjectFileId") THEN RETURN OLD; END IF;
 RAISE EXCEPTION 'Audited grant requires confirmed native decision' USING ERRCODE='23514';
END $$;
CREATE TRIGGER flux_archive_native_grant_guard BEFORE INSERT OR UPDATE OR DELETE ON "UserArchiveAssetAccess" FOR EACH ROW EXECUTE FUNCTION flux_archive_native_grant_guard();
CREATE TRIGGER flux_archive_native_grant_truncate BEFORE TRUNCATE ON "UserArchiveAssetAccess" FOR EACH STATEMENT EXECUTE FUNCTION flux_archive_native_grant_guard();

CREATE FUNCTION flux_archive_scope_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF pg_trigger_depth()=2 AND NEW."decisionId"=current_setting('flux.archive_access_decision',true) AND EXISTS(SELECT 1 FROM "ArchiveAccessDecision" d JOIN "UserArchiveAssetAccess" g ON g.id=d."grantId" WHERE d.id=NEW."decisionId" AND g.id=NEW."grantId" AND d.action='GRANT' AND d."actorId"=current_setting('flux.archive_access_actor',true)) THEN RETURN NEW; END IF;
 ELSIF TG_OP='DELETE' THEN
  -- Only cascading deletion of the guarded native row can remove its scope.
  IF pg_trigger_depth()>1 AND NOT EXISTS(SELECT 1 FROM "UserArchiveAssetAccess" WHERE id=OLD."grantId") THEN RETURN OLD; END IF;
 END IF;
 RAISE EXCEPTION 'Archive grant scope is immutable' USING ERRCODE='23514';
END $$;
CREATE TRIGGER flux_archive_scope_guard BEFORE INSERT OR UPDATE OR DELETE ON "ArchiveGrantScope" FOR EACH ROW EXECUTE FUNCTION flux_archive_scope_guard();
CREATE TRIGGER flux_archive_scope_truncate BEFORE TRUNCATE ON "ArchiveGrantScope" FOR EACH STATEMENT EXECUTE FUNCTION flux_archive_scope_guard();

CREATE FUNCTION flux_apply_archive_access() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM set_config('flux.archive_access_decision',NEW.id,true);
 IF NEW.action='GRANT' THEN
  INSERT INTO "UserArchiveAssetAccess" (id,"userId","manualArchiveFileId","archivedProjectFileId","grantedById","createdAt","updatedAt") VALUES(NEW."grantId",NEW."recipientId",CASE WHEN NEW."sourceKind"='manual' THEN NEW."sourceId" END,CASE WHEN NEW."sourceKind"='project' THEN NEW."sourceId" END,NEW."actorId",NEW."createdAt",NEW."createdAt");
  INSERT INTO "ArchiveGrantScope" ("grantId","decisionId") VALUES(NEW."grantId",NEW.id);
 ELSE DELETE FROM "UserArchiveAssetAccess" WHERE id=NEW."grantId"; END IF;
 INSERT INTO "BusinessEvent" (id,type,"schemaVersion","aggregateType","aggregateId",sequence,"actorId","actorRole","actorVersion",operation,"fileVersionId","correlationId","causationId","idempotencyKey","occurredAt",payload)
 VALUES(NEW."eventId",'ARCHIVE_ACCESS_DECIDED',1,'ARCHIVE_ACCESS',jsonb_build_array(NEW."sourceKind",NEW."sourceId",NEW."recipientId")::text,NEW.sequence,NEW."actorId",NEW."actorRole",NEW."actorVersion",'archiveAccessCommand',NEW."versionId",NEW."sourceId",NEW.id,NEW."eventId",NEW."createdAt",jsonb_build_object('action',NEW.action,'recipientId',NEW."recipientId"));
 INSERT INTO "EventOutbox" ("eventId","consumerKey") VALUES(NEW."eventId",'internal.audit.v1');
 RETURN NEW;
END $$;
CREATE TRIGGER flux_apply_archive_access AFTER INSERT ON "ArchiveAccessDecision" FOR EACH ROW EXECUTE FUNCTION flux_apply_archive_access();

DO $migration$
DECLARE definition text; existing_check text;
BEGIN
 SELECT pg_get_constraintdef(oid) INTO STRICT existing_check FROM pg_constraint WHERE conrelid='"BusinessEvent"'::regclass AND conname='BusinessEvent_contract_check';
 EXECUTE 'ALTER TABLE "BusinessEvent" DROP CONSTRAINT "BusinessEvent_contract_check"';
 EXECUTE 'ALTER TABLE "BusinessEvent" ADD CONSTRAINT "BusinessEvent_contract_check" CHECK ('||substring(existing_check FROM 7)||$check$ OR
 (type::text='ARCHIVE_ACCESS_DECIDED' AND "schemaVersion"=1 AND "aggregateType"='ARCHIVE_ACCESS' AND operation='archiveAccessCommand' AND sequence>0 AND "actorVersion">0 AND "actorRole" IN ('DIRECTOR','SENIOR_PROJECT_MANAGER') AND num_nonnulls("projectId","flexibleProjectId","taskId","taskEntryId","decisionId","nativeEventId","approvalEvidenceId")=0))$check$;
 SELECT pg_get_functiondef('flux_event_write_guard()'::regprocedure) INTO definition;
 definition:=regexp_replace(definition,E'BEGIN\n',$branch$BEGIN
 IF TG_TABLE_NAME='BusinessEvent' THEN
 IF TG_OP='INSERT' AND NEW.type::text='ARCHIVE_ACCESS_DECIDED' THEN
  IF pg_trigger_depth()<>2 OR NOT EXISTS(SELECT 1 FROM "ArchiveAccessDecision" a WHERE NEW.id=a."eventId" AND NEW."aggregateId"=jsonb_build_array(a."sourceKind",a."sourceId",a."recipientId")::text AND NEW.sequence=a.sequence AND NEW."actorId"=a."actorId" AND NEW."actorRole"=a."actorRole" AND NEW."actorVersion"=a."actorVersion" AND NEW."occurredAt"=a."createdAt" AND NEW."fileVersionId" IS NOT DISTINCT FROM a."versionId" AND NEW."causationId"=a.id AND NEW."correlationId"=a."sourceId" AND NEW."idempotencyKey"=NEW.id AND NEW.payload=jsonb_build_object('action',a.action,'recipientId',a."recipientId")) THEN RAISE EXCEPTION 'Exact native Archive access event required' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END IF;
 END IF;
$branch$);
 EXECUTE definition;
 -- Narrow grants never delegate verification, including direct SQL review writes.
 SELECT pg_get_functiondef('flux_archive_review_guard()'::regprocedure) INTO definition;
 definition:=replace(definition,'FROM "UserArchiveAssetAccess" WHERE "userId"=NEW."actorId"','FROM "UserArchiveAssetAccess" WHERE flux_archive_grant_effective(id,''verify'') AND "userId"=NEW."actorId"');
 EXECUTE definition;
 SELECT pg_get_functiondef('flux_archive_source_retention()'::regprocedure) INTO definition;
 definition:=replace(definition,'IF TG_OP=''INSERT'' THEN','IF TG_OP=''INSERT'' THEN
  IF EXISTS(SELECT 1 FROM "ArchiveAccessDecision" WHERE "sourceId"=NEW.id AND "sourceKind"=CASE WHEN TG_TABLE_NAME=''ManualArchiveFile'' THEN ''manual'' ELSE ''project'' END) THEN RAISE EXCEPTION ''Audited Archive identity cannot be reused'' USING ERRCODE=''23514''; END IF;');
 EXECUTE definition;
END $migration$;

COMMIT;
