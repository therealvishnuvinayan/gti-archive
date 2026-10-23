-- Phase 3.1 candidate: do not apply to Neon without separate approval.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
-- CreateEnum
CREATE TYPE "UniversalTaskType" AS ENUM ('GENERAL', 'FILE_UPLOAD', 'DATA_INPUT', 'INSPECT_FILE', 'INITIAL_CONCEPT', 'FINAL_CONCEPT');

-- CreateEnum
CREATE TYPE "UniversalTaskStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'COMPLETION_REQUESTED', 'COMPLETED', 'CLOSED');

-- CreateEnum
CREATE TYPE "UniversalTaskPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- AlterEnum
ALTER TYPE "BusinessEventType" ADD VALUE 'TASK_ACTIVITY';

-- AlterTable
ALTER TABLE "SharedFile" ADD COLUMN     "taskId" TEXT;

-- AlterTable
ALTER TABLE "SharedFileReference" ADD COLUMN     "taskUploadId" TEXT;

-- AlterTable
ALTER TABLE "SharedFileProvenance" ADD COLUMN     "taskEntryId" TEXT,
ALTER COLUMN "completionEventId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "BusinessEvent" ADD COLUMN     "flexibleProjectId" TEXT,
ADD COLUMN     "taskEntryId" TEXT,
ADD COLUMN     "taskId" TEXT,
ALTER COLUMN "projectId" DROP NOT NULL,
ALTER COLUMN "decisionId" DROP NOT NULL,
ALTER COLUMN "nativeEventId" DROP NOT NULL,
ALTER COLUMN "approvalEvidenceId" DROP NOT NULL,
ALTER COLUMN "fileVersionId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "UniversalTask" (
    "id" TEXT NOT NULL,
    "type" "UniversalTaskType" NOT NULL DEFAULT 'GENERAL',
    "title" TEXT NOT NULL,
    "brief" TEXT NOT NULL,
    "context" TEXT,
    "deadline" TIMESTAMP(3) NOT NULL,
    "priority" "UniversalTaskPriority" NOT NULL DEFAULT 'NORMAL',
    "ownerId" TEXT NOT NULL,
    "executorId" TEXT NOT NULL,
    "projectId" TEXT,
    "flexibleProjectId" TEXT,
    "status" "UniversalTaskStatus" NOT NULL DEFAULT 'OPEN',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'::text),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "UniversalTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UniversalTaskSpectator" (
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "UniversalTaskSpectator_pkey" PRIMARY KEY ("taskId","userId")
);

-- CreateTable
CREATE TABLE "UniversalTaskEntry" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "commandId" TEXT NOT NULL,
    "commandHash" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "actorVersion" INTEGER NOT NULL,
    "directorOverride" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'::text),

    CONSTRAINT "UniversalTaskEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UniversalTaskUpload" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "stagingKey" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "submittedEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'::text),

    CONSTRAINT "UniversalTaskUpload_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UniversalTask_ownerId_deletedAt_deadline_idx" ON "UniversalTask"("ownerId", "deletedAt", "deadline");

-- CreateIndex
CREATE INDEX "UniversalTask_executorId_deletedAt_deadline_idx" ON "UniversalTask"("executorId", "deletedAt", "deadline");

-- CreateIndex
CREATE INDEX "UniversalTask_projectId_deletedAt_idx" ON "UniversalTask"("projectId", "deletedAt");

-- CreateIndex
CREATE INDEX "UniversalTask_flexibleProjectId_deletedAt_idx" ON "UniversalTask"("flexibleProjectId", "deletedAt");

-- CreateIndex
CREATE INDEX "UniversalTaskSpectator_userId_idx" ON "UniversalTaskSpectator"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UniversalTaskEntry_taskId_version_key" ON "UniversalTaskEntry"("taskId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "UniversalTaskEntry_actorId_commandId_key" ON "UniversalTaskEntry"("actorId", "commandId");

-- CreateIndex
CREATE UNIQUE INDEX "UniversalTaskUpload_versionId_key" ON "UniversalTaskUpload"("versionId");

-- CreateIndex
CREATE UNIQUE INDEX "UniversalTaskUpload_stagingKey_key" ON "UniversalTaskUpload"("stagingKey");

-- CreateIndex
CREATE INDEX "UniversalTaskUpload_taskId_idx" ON "UniversalTaskUpload"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "SharedFileReference_taskUploadId_key" ON "SharedFileReference"("taskUploadId");

-- CreateIndex
CREATE UNIQUE INDEX "SharedFileProvenance_taskEntryId_versionId_key" ON "SharedFileProvenance"("taskEntryId", "versionId");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessEvent_taskEntryId_key" ON "BusinessEvent"("taskEntryId");

-- AddForeignKey
ALTER TABLE "SharedFile" ADD CONSTRAINT "SharedFile_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "UniversalTask"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "SharedFileReference" ADD CONSTRAINT "SharedFileReference_taskUploadId_fkey" FOREIGN KEY ("taskUploadId") REFERENCES "UniversalTaskUpload"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "SharedFileProvenance" ADD CONSTRAINT "SharedFileProvenance_taskEntryId_fkey" FOREIGN KEY ("taskEntryId") REFERENCES "UniversalTaskEntry"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "BusinessEvent" ADD CONSTRAINT "BusinessEvent_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "UniversalTask"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "BusinessEvent" ADD CONSTRAINT "BusinessEvent_taskEntryId_fkey" FOREIGN KEY ("taskEntryId") REFERENCES "UniversalTaskEntry"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "BusinessEvent" ADD CONSTRAINT "BusinessEvent_flexibleProjectId_fkey" FOREIGN KEY ("flexibleProjectId") REFERENCES "FlexibleProject"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "UniversalTask" ADD CONSTRAINT "UniversalTask_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "UniversalTask" ADD CONSTRAINT "UniversalTask_executorId_fkey" FOREIGN KEY ("executorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "UniversalTask" ADD CONSTRAINT "UniversalTask_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "UniversalTask" ADD CONSTRAINT "UniversalTask_flexibleProjectId_fkey" FOREIGN KEY ("flexibleProjectId") REFERENCES "FlexibleProject"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "UniversalTaskSpectator" ADD CONSTRAINT "UniversalTaskSpectator_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "UniversalTask"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "UniversalTaskSpectator" ADD CONSTRAINT "UniversalTaskSpectator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "UniversalTaskEntry" ADD CONSTRAINT "UniversalTaskEntry_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "UniversalTask"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "UniversalTaskEntry" ADD CONSTRAINT "UniversalTaskEntry_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "UniversalTaskUpload" ADD CONSTRAINT "UniversalTaskUpload_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "UniversalTask"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "UniversalTaskUpload" ADD CONSTRAINT "UniversalTaskUpload_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "SharedFileVersion"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "UniversalTaskUpload" ADD CONSTRAINT "UniversalTaskUpload_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "UniversalTaskUpload" ADD CONSTRAINT "UniversalTaskUpload_submittedEntryId_fkey" FOREIGN KEY ("submittedEntryId") REFERENCES "UniversalTaskEntry"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;


ALTER TABLE "UniversalTask" ADD CONSTRAINT "UniversalTask_values" CHECK (
 type='GENERAL' AND num_nonnulls("projectId","flexibleProjectId")=1 AND "ownerId"<>"executorId" AND version>0 AND
 length(btrim(title)) BETWEEN 1 AND 200 AND length(btrim(brief)) BETWEEN 1 AND 20000);
ALTER TABLE "UniversalTaskEntry" ADD CONSTRAINT "UniversalTaskEntry_values" CHECK (
 version>0 AND "actorVersion">0 AND "commandHash" ~ '^[a-f0-9]{64}$' AND length("commandId") BETWEEN 1 AND 128 AND
 action IN ('CREATED','EDIT','MESSAGE','SUBMIT','REQUEST_COMPLETION','APPROVE','REJECT','CLOSE','DELETE','PREPARE_UPLOAD','FINALIZE_UPLOAD') AND
 "actorRole" IN ('DIRECTOR','SENIOR_PROJECT_MANAGER','JUNIOR_PROJECT_MANAGER','DESIGNER','DIGITAL_LEAD') AND
 (action IN ('EDIT','PREPARE_UPLOAD','FINALIZE_UPLOAD') OR length(btrim(text))>0) AND jsonb_typeof(snapshot)='object');
ALTER TABLE "SharedFileReference" DROP CONSTRAINT "SharedFileReference_one_record_check";
ALTER TABLE "SharedFileReference" ADD CONSTRAINT "SharedFileReference_one_record_check" CHECK (
 num_nonnulls("projectAttachmentId","flexibleAttachmentId","archivedProjectFileId","manualArchiveFileId","manualLibraryAssetId","completionSubmissionId","completionDocumentId","taskUploadId")=1);
ALTER TABLE "SharedFileProvenance" ADD CONSTRAINT "SharedFileProvenance_native_check" CHECK (num_nonnulls("completionEventId","taskEntryId")=1);
ALTER TABLE "BusinessEvent" DROP CONSTRAINT "BusinessEvent_contract_check";
ALTER TABLE "BusinessEvent" ADD CONSTRAINT "BusinessEvent_contract_check" CHECK (
 "schemaVersion"=1 AND sequence>0 AND "actorVersion">0 AND jsonb_typeof(payload)='object' AND (
 (type::text='COMPLETION_DOCUMENT_REVIEW_DECIDED' AND "aggregateType"='COMPLETION_DOCUMENT_SUBMISSION' AND
 "actorRole" IN ('DIRECTOR','SENIOR_PROJECT_MANAGER','JUNIOR_PROJECT_MANAGER') AND operation='reviewCompletionDocument' AND
 "projectId" IS NOT NULL AND "decisionId" IS NOT NULL AND "nativeEventId" IS NOT NULL AND "approvalEvidenceId" IS NOT NULL AND "fileVersionId" IS NOT NULL AND "taskId" IS NULL AND "taskEntryId" IS NULL AND "flexibleProjectId" IS NULL)
 OR (type::text='TASK_ACTIVITY' AND "aggregateType"='UNIVERSAL_TASK' AND operation='generalTaskCommand' AND
 "actorRole" IN ('DIRECTOR','SENIOR_PROJECT_MANAGER','JUNIOR_PROJECT_MANAGER','DESIGNER','DIGITAL_LEAD') AND
 num_nonnulls("projectId","flexibleProjectId")=1 AND "taskId" IS NOT NULL AND "taskEntryId" IS NOT NULL AND
 "decisionId" IS NULL AND "nativeEventId" IS NULL AND "approvalEvidenceId" IS NULL AND "fileVersionId" IS NULL)));

-- A current V2 session is required at native task write boundaries. Transaction
-- settings are set only by the trusted resource-policy loader after authentication.
CREATE FUNCTION flux_task_actor() RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE a record;
BEGIN
 SELECT * INTO a FROM "UserAuthorization" WHERE "userId"=nullif(current_setting('flux.task_actor',true),'');
 IF a."accountStatus" IS DISTINCT FROM 'ACTIVE' OR a."businessRole" IS NULL OR NOT EXISTS (
  SELECT 1 FROM "Session" WHERE id=current_setting('flux.task_session',true) AND "userId"=a."userId" AND
  "expiresAt">clock_timestamp() AT TIME ZONE 'UTC' AND token ~ ('^v2\.'||a."authorizationVersion"||'\.[a-f0-9]{64}$')) THEN
  RAISE EXCEPTION 'Current task business session required' USING ERRCODE='23514'; END IF;
 RETURN to_jsonb(a);
END $$;
CREATE FUNCTION flux_task_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a record; t "UniversalTask"; r "UniversalTaskEntry";
BEGIN
 IF TG_OP='TRUNCATE' OR (TG_OP='DELETE' AND TG_TABLE_NAME<>'UniversalTaskSpectator') OR
  (TG_OP='UPDATE' AND TG_TABLE_NAME='UniversalTaskEntry') THEN RAISE EXCEPTION 'Task history is retained' USING ERRCODE='23514'; END IF;
 SELECT * INTO a FROM jsonb_to_record(flux_task_actor()) AS x("userId" text,"businessRole" text,"authorizationVersion" int);
 IF TG_TABLE_NAME='UniversalTask' THEN
  IF TG_OP='INSERT' THEN
   IF NEW."ownerId"<>a."userId" OR NEW.version<>1 OR NEW.status<>'OPEN' OR NEW."deletedAt" IS NOT NULL THEN RAISE EXCEPTION 'Real creator required' USING ERRCODE='23514'; END IF;
  ELSIF NEW.version<>OLD.version+1 OR OLD."deletedAt" IS NOT NULL OR
   (to_jsonb(NEW)-ARRAY['title','brief','context','deadline','priority','executorId','status','version','updatedAt','deletedAt']) IS DISTINCT FROM
   (to_jsonb(OLD)-ARRAY['title','brief','context','deadline','priority','executorId','status','version','updatedAt','deletedAt']) THEN
   RAISE EXCEPTION 'Versioned task update required; origin is immutable' USING ERRCODE='23514'; END IF;
 ELSIF TG_TABLE_NAME='UniversalTaskEntry' THEN
  SELECT * INTO STRICT t FROM "UniversalTask" WHERE id=NEW."taskId";
  IF NEW.version<>t.version OR NEW."actorId"<>a."userId" OR NEW."actorRole"<>a."businessRole"::text OR NEW."actorVersion"<>a."authorizationVersion" OR
   (NEW."directorOverride" AND a."businessRole"<>'DIRECTOR') THEN RAISE EXCEPTION 'Truthful task history required' USING ERRCODE='23514'; END IF;
  IF a."businessRole"<>'DIRECTOR' AND (
   (NEW.action IN ('CREATED','EDIT','APPROVE','REJECT','CLOSE','DELETE') AND a."userId"<>t."ownerId") OR
   (NEW.action IN ('SUBMIT','REQUEST_COMPLETION') AND a."userId"<>t."executorId") OR
   (NEW.action IN ('MESSAGE','PREPARE_UPLOAD','FINALIZE_UPLOAD') AND a."userId" NOT IN (t."ownerId",t."executorId"))) THEN
   RAISE EXCEPTION 'Task relationship required' USING ERRCODE='23514'; END IF;
  IF (NEW.action='REQUEST_COMPLETION' AND t.status<>'COMPLETION_REQUESTED') OR (NEW.action='APPROVE' AND t.status<>'COMPLETED') OR
   (NEW.action='CLOSE' AND t.status<>'CLOSED') OR (NEW.action='DELETE' AND t."deletedAt" IS NULL) OR
   (NEW.action IN ('SUBMIT','REJECT') AND t.status<>'IN_PROGRESS') THEN RAISE EXCEPTION 'Task outcome mismatch' USING ERRCODE='23514'; END IF;
  IF NEW.action IN ('APPROVE','REJECT') THEN
   SELECT * INTO r FROM "UniversalTaskEntry" WHERE id=NEW.snapshot->>'requestId' AND "taskId"=t.id AND action='REQUEST_COMPLETION';
   IF r.id IS NULL OR r."actorId"=NEW."actorId" OR t."executorId"=NEW."actorId" OR
    NEW.snapshot->'evidence' IS DISTINCT FROM r.snapshot THEN RAISE EXCEPTION 'Distinct review of exact request required' USING ERRCODE='23514'; END IF;
  END IF;
 ELSIF TG_TABLE_NAME='UniversalTaskUpload' THEN
  IF TG_OP='INSERT' THEN
   IF NEW."uploadedById"<>a."userId" OR NOT EXISTS (SELECT 1 FROM "SharedFileVersion" v JOIN "SharedFile" f ON f.id=v."fileId"
    WHERE v.id=NEW."versionId" AND f."taskId"=NEW."taskId" AND v."uploadedById"=NEW."uploadedById" AND v.status='UPLOADING' AND v."storageKey"<>NEW."stagingKey") THEN
    RAISE EXCEPTION 'Upload source mismatch' USING ERRCODE='23514'; END IF;
  ELSE
   IF OLD."submittedEntryId" IS NOT NULL OR NEW."submittedEntryId" IS NULL OR (to_jsonb(NEW)-'submittedEntryId') IS DISTINCT FROM (to_jsonb(OLD)-'submittedEntryId') OR
    NOT EXISTS (SELECT 1 FROM "UniversalTaskEntry" e JOIN "SharedFileVersion" v ON v.id=NEW."versionId"
     WHERE e.id=NEW."submittedEntryId" AND e."taskId"=NEW."taskId" AND e."actorId"=NEW."uploadedById" AND e.action IN ('SUBMIT','MESSAGE') AND v.status='READY'
     AND e.snapshot->'fileVersionIds' ? v.id) THEN RAISE EXCEPTION 'Immutable submitted file required' USING ERRCODE='23514'; END IF;
  END IF;
 ELSIF TG_TABLE_NAME='UniversalTaskSpectator' THEN
  SELECT * INTO STRICT t FROM "UniversalTask" WHERE id=CASE WHEN TG_OP='DELETE' THEN OLD."taskId" ELSE NEW."taskId" END;
  IF (a."businessRole"<>'DIRECTOR' AND a."userId"<>t."ownerId") OR t."deletedAt" IS NOT NULL OR t.status NOT IN ('OPEN','IN_PROGRESS') THEN RAISE EXCEPTION 'Task owner required' USING ERRCODE='23514'; END IF;
  IF TG_OP<>'DELETE' AND (NEW."userId" IN (t."ownerId",t."executorId") OR NOT EXISTS (SELECT 1 FROM "UserAuthorization" WHERE "userId"=NEW."userId" AND "accountStatus"='ACTIVE' AND "businessRole" IS NOT NULL)) THEN
   RAISE EXCEPTION 'View-only business spectator required' USING ERRCODE='23514'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['UniversalTask','UniversalTaskEntry','UniversalTaskUpload','UniversalTaskSpectator'] LOOP
 EXECUTE format('CREATE TRIGGER flux_task_guard BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION flux_task_guard()',t);
 EXECUTE format('CREATE TRIGGER flux_task_truncate BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION flux_task_guard()',t);
END LOOP; END $$;
CREATE FUNCTION flux_task_consistency() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE t "UniversalTask";
BEGIN
 SELECT * INTO STRICT t FROM "UniversalTask" WHERE id=NEW.id;
 IF NOT EXISTS (SELECT 1 FROM "UniversalTaskEntry" WHERE "taskId"=t.id AND version=t.version) OR
  (SELECT count(*) FROM "UniversalTaskEntry" WHERE "taskId"=t.id)<>t.version OR
  EXISTS (SELECT 1 FROM "UniversalTaskSpectator" WHERE "taskId"=t.id AND "userId" IN (t."ownerId",t."executorId")) THEN
  RAISE EXCEPTION 'Atomic task history required' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER flux_task_consistency AFTER INSERT OR UPDATE ON "UniversalTask" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION flux_task_consistency();

CREATE FUNCTION flux_emit_task_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE t "UniversalTask"; eid text;
BEGIN
 SELECT * INTO STRICT t FROM "UniversalTask" WHERE id=NEW."taskId";
 eid:='task:'||NEW.id;
 INSERT INTO "BusinessEvent" (id,type,"schemaVersion","aggregateType","aggregateId",sequence,"projectId","flexibleProjectId","taskId","taskEntryId","actorId","actorRole","actorVersion",operation,"correlationId","causationId","idempotencyKey","occurredAt",payload)
 VALUES (eid,'TASK_ACTIVITY',1,'UNIVERSAL_TASK',t.id,NEW.version,t."projectId",t."flexibleProjectId",t.id,NEW.id,NEW."actorId",NEW."actorRole",NEW."actorVersion",'generalTaskCommand',t.id,NEW.id,eid,NEW."createdAt",
 jsonb_build_object('action',NEW.action,'status',t.status,'directorOverride',NEW."directorOverride"));
 INSERT INTO "EventOutbox" ("eventId","consumerKey") VALUES (eid,'internal.audit.v1');
 RETURN NEW;
END $$;
CREATE TRIGGER flux_emit_task_event AFTER INSERT ON "UniversalTaskEntry" FOR EACH ROW EXECUTE FUNCTION flux_emit_task_event();

CREATE OR REPLACE FUNCTION flux_shared_file_origin_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
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
  IF NEW."taskId" IS NOT NULL AND (num_nonnulls(NEW."stageId",NEW."conceptFolderId",NEW."milestoneId",NEW."completionWorkflowId")<>0 OR
 NOT EXISTS (SELECT 1 FROM "UniversalTask" t WHERE t.id=NEW."taskId" AND t."projectId" IS NOT DISTINCT FROM NEW."projectId" AND t."flexibleProjectId" IS NOT DISTINCT FROM NEW."flexibleProjectId")) THEN
 RAISE EXCEPTION 'Task file origin mismatch' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION flux_shared_file_reference_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v "SharedFileVersion"; f "SharedFile"; source jsonb; source_project text; source_flexible text;
BEGIN
  IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'File version references are immutable' USING ERRCODE = '23514'; END IF;
  SELECT * INTO STRICT v FROM "SharedFileVersion" WHERE id = NEW."versionId";
  SELECT * INTO STRICT f FROM "SharedFile" WHERE id = v."fileId";
  IF NEW."taskUploadId" IS NOT NULL THEN
   IF NEW.role<>'SOURCE' OR NOT EXISTS (SELECT 1 FROM "UniversalTaskUpload" u WHERE u.id=NEW."taskUploadId" AND u."versionId"=v.id AND u."taskId"=f."taskId" AND u."uploadedById"=v."uploadedById") THEN
    RAISE EXCEPTION 'Exact task upload source required' USING ERRCODE='23514'; END IF;
   RETURN NEW;
  END IF;
  IF f."taskId" IS NOT NULL THEN RAISE EXCEPTION 'Task files cannot be published by another adapter' USING ERRCODE='23514'; END IF;
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
CREATE OR REPLACE FUNCTION flux_shared_file_provenance_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'File provenance is immutable' USING ERRCODE = '23514'; END IF;
  IF NEW."taskEntryId" IS NOT NULL THEN
   IF NOT EXISTS (SELECT 1 FROM "UniversalTaskEntry" e JOIN "UniversalTaskUpload" u ON u."taskId"=e."taskId" JOIN "SharedFileVersion" v ON v.id=u."versionId"
    WHERE e.id=NEW."taskEntryId" AND v.id=NEW."versionId" AND e.snapshot->'fileVersionIds' ? v.id AND
    ((e.action='PREPARE_UPLOAD' AND v.status='UPLOADING') OR (e.action IN ('FINALIZE_UPLOAD','MESSAGE','SUBMIT','REQUEST_COMPLETION') AND v.status='READY'))) THEN
    RAISE EXCEPTION 'Exact task event/version required' USING ERRCODE='23514'; END IF;
   RETURN NEW;
  END IF;
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
CREATE OR REPLACE FUNCTION flux_event_write_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE te "UniversalTaskEntry"; tt "UniversalTask"; d "ApprovalDecision"; r "ApprovalRequest"; e "ApprovalEvidence"; v "SharedFileVersion"; o "EventOutbox";
BEGIN
  IF TG_OP IN ('DELETE','TRUNCATE') OR (TG_OP='UPDATE' AND TG_TABLE_NAME<>'EventOutbox') THEN
    RAISE EXCEPTION 'Shared event history is retained and immutable' USING ERRCODE='23514'; END IF;
  IF TG_TABLE_NAME='BusinessEvent' THEN
    IF NEW.type::text='TASK_ACTIVITY' THEN
     SELECT * INTO STRICT te FROM "UniversalTaskEntry" WHERE id=NEW."taskEntryId";
     SELECT * INTO STRICT tt FROM "UniversalTask" WHERE id=te."taskId";
     IF pg_trigger_depth()<>2 OR NEW.id IS DISTINCT FROM 'task:'||te.id OR NEW."idempotencyKey"<>NEW.id OR
      NEW."taskId" IS DISTINCT FROM tt.id OR NEW."aggregateId"<>tt.id OR NEW.sequence<>te.version OR
      NEW."actorId"<>te."actorId" OR NEW."actorRole"<>te."actorRole" OR NEW."actorVersion"<>te."actorVersion" OR
      NEW."projectId" IS DISTINCT FROM tt."projectId" OR NEW."flexibleProjectId" IS DISTINCT FROM tt."flexibleProjectId" OR
      NEW."occurredAt"<>te."createdAt" OR NEW."correlationId"<>tt.id OR NEW."causationId"<>te.id OR
      NEW.payload IS DISTINCT FROM jsonb_build_object('action',te.action,'status',tt.status,'directorOverride',te."directorOverride") THEN
      RAISE EXCEPTION 'Exact native task event required' USING ERRCODE='23514'; END IF;
     RETURN NEW;
    END IF;
    -- No generic INSERT/backfill path, even for callers holding a business role.
    IF pg_trigger_depth()<>2 THEN RAISE EXCEPTION 'Native decision trigger required' USING ERRCODE='23514'; END IF;
    SELECT * INTO STRICT d FROM "ApprovalDecision" WHERE id=NEW."decisionId";
    SELECT * INTO STRICT r FROM "ApprovalRequest" WHERE id=d."requestId";
    SELECT * INTO STRICT e FROM "ApprovalEvidence" WHERE "requestId"=r.id;
    SELECT * INTO STRICT v FROM "SharedFileVersion" WHERE id=e."fileVersionId";
    IF NEW.id IS DISTINCT FROM 'review:'||d.id OR NEW."idempotencyKey" IS DISTINCT FROM NEW.id OR
      NEW."nativeEventId" IS DISTINCT FROM d."nativeEventId" OR NEW."nativeEventId" IS DISTINCT FROM current_setting('flux.shared_event_native',true) OR
      NEW."actorId" IS DISTINCT FROM d."actorId" OR NEW."actorRole" IS DISTINCT FROM d."actorRole" OR NEW."actorVersion" IS DISTINCT FROM d."actorVersion" OR
      NEW."projectId" IS DISTINCT FROM r."projectId" OR NEW."aggregateId" IS DISTINCT FROM r."completionSubmissionId" OR NEW.sequence<>d."expectedRevision"+1 OR
      NEW."approvalEvidenceId" IS DISTINCT FROM e.id OR NEW."fileVersionId" IS DISTINCT FROM v.id OR NEW."occurredAt" IS DISTINCT FROM d."decidedAt" OR
      NEW."correlationId" IS DISTINCT FROM r.id OR NEW."causationId" IS DISTINCT FROM d."nativeEventId" OR
      NEW.payload IS DISTINCT FROM jsonb_build_object('outcome',d.outcome,'documentType',r."subjectSnapshot"->>'type','requestId',r.id,'evidenceHash',d."evidenceHash",'checksumEvidence',v."checksumEvidence") THEN
      RAISE EXCEPTION 'Event must match exact native decision and evidence' USING ERRCODE='23514'; END IF;
  ELSIF TG_TABLE_NAME='EventOutbox' AND TG_OP='INSERT' THEN
    IF pg_trigger_depth()<>2 OR NEW.state<>'PENDING' OR NEW.attempts<>0 OR NEW."lastErrorCode" IS NOT NULL THEN
      RAISE EXCEPTION 'Native event outbox required' USING ERRCODE='23514'; END IF;
  ELSE
    IF current_setting('flux.event_worker',true) IS DISTINCT FROM 'internal.audit.v1' THEN
      RAISE EXCEPTION 'Internal event worker required' USING ERRCODE='23514'; END IF;
    IF TG_TABLE_NAME='EventOutbox' THEN
      IF NEW."eventId"<>OLD."eventId" OR NEW."consumerKey"<>OLD."consumerKey" OR OLD.state IN ('DELIVERED','FAILED') OR
        NEW.attempts NOT BETWEEN OLD.attempts AND OLD.attempts+1 OR
        (NEW.state='PROCESSING' AND NEW.attempts<>OLD.attempts+1) OR
        (NEW.state<>'PROCESSING' AND NEW.attempts<>OLD.attempts) OR
        (OLD.state='PENDING' AND NEW.state<>'PROCESSING') THEN
        RAISE EXCEPTION 'Invalid event delivery transition' USING ERRCODE='23514'; END IF;
    ELSE
      SELECT * INTO o FROM "EventOutbox" WHERE "eventId"=NEW."eventId";
      IF o.state IS DISTINCT FROM 'PROCESSING' THEN RAISE EXCEPTION 'Active event claim required' USING ERRCODE='23514'; END IF;
      IF TG_TABLE_NAME='EventDeliveryAttempt' THEN
        IF NEW.attempt<>o.attempts OR
          (NEW.outcome<>'CLAIMED' AND NOT EXISTS (SELECT 1 FROM "EventDeliveryAttempt" WHERE "eventId"=NEW."eventId" AND attempt=NEW.attempt AND outcome='CLAIMED')) OR
          EXISTS (SELECT 1 FROM "EventDeliveryAttempt" WHERE "eventId"=NEW."eventId" AND attempt=NEW.attempt AND outcome<>'CLAIMED') OR
          (NEW.outcome IN ('CLAIMED','SUCCEEDED') AND NEW."errorCode" IS NOT NULL) OR
          (NEW.outcome IN ('RETRY','DEAD','EXPIRED') AND NEW."errorCode" IS NULL) THEN
          RAISE EXCEPTION 'Attempt must match active claim and one terminal outcome' USING ERRCODE='23514'; END IF;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
COMMIT;
