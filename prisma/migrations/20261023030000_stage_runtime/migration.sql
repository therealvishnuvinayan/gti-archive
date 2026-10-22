-- Phase 4.3: isolated runtime projects. No conversion, seed, backfill or worker activation.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
-- AlterEnum
ALTER TYPE "ApprovalSubjectType" ADD VALUE 'RUNTIME_STAGE';

-- AlterEnum
ALTER TYPE "ApprovalStepEligibility" ADD VALUE 'RUNTIME_STAGE_REVIEWER';

-- AlterEnum
ALTER TYPE "BusinessEventType" ADD VALUE 'RUNTIME_ACTIVITY';

-- AlterTable
ALTER TABLE "SharedFile" ADD COLUMN     "runtimeStageId" TEXT;

-- AlterTable
ALTER TABLE "SharedFileReference" ADD COLUMN     "runtimeSubmissionId" TEXT;

-- CreateTable
CREATE TABLE "RuntimeProject" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "publishedVersionId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "definitionHash" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'ACTIVE',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RuntimeProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RuntimeParticipant" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "addedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RuntimeParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RuntimeStage" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "definitionStageId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "configuration" JSONB NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "evidenceRevision" INTEGER NOT NULL DEFAULT 0,
    "values" JSONB NOT NULL,
    "checklist" JSONB NOT NULL,
    "completedById" TEXT,
    "completedAt" TIMESTAMP(3),
    "completionSnapshot" JSONB,

    CONSTRAINT "RuntimeStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RuntimeFileSubmission" (
    "id" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "capabilityId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "supersedesId" TEXT,
    "submittedById" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'UPLOADING',
    "stagingKey" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reason" TEXT,
    "failureCode" TEXT,

    CONSTRAINT "RuntimeFileSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RuntimeApprovalSubmission" (
    "id" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "capabilityId" TEXT NOT NULL,
    "evidenceRevision" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "snapshotHash" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "actorVersion" INTEGER NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL,
    "approvalRequestId" TEXT NOT NULL,

    CONSTRAINT "RuntimeApprovalSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RuntimeActivity" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "stageId" TEXT,
    "sequence" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "actorVersion" INTEGER NOT NULL,
    "sessionId" TEXT NOT NULL,
    "commandId" TEXT NOT NULL,
    "commandHash" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "eventId" TEXT NOT NULL,

    CONSTRAINT "RuntimeActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RuntimeProject_ownerId_createdAt_id_idx" ON "RuntimeProject"("ownerId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "RuntimeParticipant_projectId_userId_key" ON "RuntimeParticipant"("projectId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "RuntimeStage_projectId_definitionStageId_key" ON "RuntimeStage"("projectId", "definitionStageId");

-- CreateIndex
CREATE UNIQUE INDEX "RuntimeStage_projectId_position_key" ON "RuntimeStage"("projectId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "RuntimeFileSubmission_versionId_key" ON "RuntimeFileSubmission"("versionId");

-- CreateIndex
CREATE UNIQUE INDEX "RuntimeFileSubmission_supersedesId_key" ON "RuntimeFileSubmission"("supersedesId");

-- CreateIndex
CREATE INDEX "RuntimeFileSubmission_stageId_capabilityId_idx" ON "RuntimeFileSubmission"("stageId", "capabilityId");

-- CreateIndex
CREATE UNIQUE INDEX "RuntimeApprovalSubmission_approvalRequestId_key" ON "RuntimeApprovalSubmission"("approvalRequestId");

-- CreateIndex
CREATE INDEX "RuntimeApprovalSubmission_stageId_capabilityId_requestedAt_idx" ON "RuntimeApprovalSubmission"("stageId", "capabilityId", "requestedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RuntimeActivity_eventId_key" ON "RuntimeActivity"("eventId");

-- CreateIndex
CREATE INDEX "RuntimeActivity_stageId_sequence_idx" ON "RuntimeActivity"("stageId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "RuntimeActivity_actorId_commandId_key" ON "RuntimeActivity"("actorId", "commandId");

-- CreateIndex
CREATE UNIQUE INDEX "RuntimeActivity_projectId_sequence_key" ON "RuntimeActivity"("projectId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "SharedFileReference_runtimeSubmissionId_key" ON "SharedFileReference"("runtimeSubmissionId");

-- AddForeignKey
ALTER TABLE "SharedFile" ADD CONSTRAINT "SharedFile_runtimeStageId_fkey" FOREIGN KEY ("runtimeStageId") REFERENCES "RuntimeStage"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "SharedFileReference" ADD CONSTRAINT "SharedFileReference_runtimeSubmissionId_fkey" FOREIGN KEY ("runtimeSubmissionId") REFERENCES "RuntimeFileSubmission"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RuntimeProject" ADD CONSTRAINT "RuntimeProject_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RuntimeProject" ADD CONSTRAINT "RuntimeProject_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RuntimeProject" ADD CONSTRAINT "RuntimeProject_publishedVersionId_fkey" FOREIGN KEY ("publishedVersionId") REFERENCES "PublishedWorkflowVersion"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RuntimeParticipant" ADD CONSTRAINT "RuntimeParticipant_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "RuntimeProject"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RuntimeParticipant" ADD CONSTRAINT "RuntimeParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RuntimeParticipant" ADD CONSTRAINT "RuntimeParticipant_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RuntimeStage" ADD CONSTRAINT "RuntimeStage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "RuntimeProject"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RuntimeStage" ADD CONSTRAINT "RuntimeStage_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RuntimeFileSubmission" ADD CONSTRAINT "RuntimeFileSubmission_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "RuntimeStage"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RuntimeFileSubmission" ADD CONSTRAINT "RuntimeFileSubmission_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "SharedFileVersion"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RuntimeFileSubmission" ADD CONSTRAINT "RuntimeFileSubmission_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "RuntimeFileSubmission"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RuntimeFileSubmission" ADD CONSTRAINT "RuntimeFileSubmission_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RuntimeFileSubmission" ADD CONSTRAINT "RuntimeFileSubmission_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RuntimeApprovalSubmission" ADD CONSTRAINT "RuntimeApprovalSubmission_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "RuntimeStage"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RuntimeApprovalSubmission" ADD CONSTRAINT "RuntimeApprovalSubmission_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RuntimeApprovalSubmission" ADD CONSTRAINT "RuntimeApprovalSubmission_approvalRequestId_fkey" FOREIGN KEY ("approvalRequestId") REFERENCES "ApprovalRequest"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RuntimeActivity" ADD CONSTRAINT "RuntimeActivity_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "RuntimeProject"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RuntimeActivity" ADD CONSTRAINT "RuntimeActivity_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "RuntimeStage"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RuntimeActivity" ADD CONSTRAINT "RuntimeActivity_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RuntimeActivity" ADD CONSTRAINT "RuntimeActivity_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "BusinessEvent"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "RuntimeActivity" ALTER CONSTRAINT "RuntimeActivity_eventId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "RuntimeApprovalSubmission" ALTER CONSTRAINT "RuntimeApprovalSubmission_approvalRequestId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "RuntimeProject" ADD CONSTRAINT "RuntimeProject_shape" CHECK (state='ACTIVE' AND revision>0 AND "versionNumber">0 AND "definitionHash" ~ '^[a-f0-9]{64}$' AND length(btrim(title)) BETWEEN 1 AND 160 AND length(description)<=4000);
ALTER TABLE "RuntimeParticipant" ADD CONSTRAINT "RuntimeParticipant_shape" CHECK (role IN ('CO_OWNER','EXECUTOR'));
ALTER TABLE "RuntimeStage" ADD CONSTRAINT "RuntimeStage_shape" CHECK (position>=0 AND revision>=0 AND "evidenceRevision" BETWEEN 0 AND revision AND state IN ('AVAILABLE','IN_PROGRESS','COMPLETED') AND jsonb_typeof(configuration)='object' AND jsonb_typeof(values)='object' AND jsonb_typeof(checklist)='object' AND ((state='COMPLETED' AND num_nonnulls("completedById","completedAt","completionSnapshot")=3) OR (state<>'COMPLETED' AND num_nonnulls("completedById","completedAt","completionSnapshot")=0)));
ALTER TABLE "RuntimeFileSubmission" ADD CONSTRAINT "RuntimeFileSubmission_shape" CHECK (state IN ('UPLOADING','FAILED','SUBMITTED','ACCEPTED','REJECTED') AND "expiresAt">"createdAt" AND ((state IN ('ACCEPTED','REJECTED') AND num_nonnulls("reviewedById","reviewedAt",reason)=3 AND length(btrim(reason)) BETWEEN 1 AND 2000) OR (state NOT IN ('ACCEPTED','REJECTED') AND num_nonnulls("reviewedById","reviewedAt",reason)=0)) AND ((state IN ('SUBMITTED','ACCEPTED','REJECTED'))=("submittedAt" IS NOT NULL)) AND ((state='FAILED')=("failureCode" IS NOT NULL)));
ALTER TABLE "RuntimeApprovalSubmission" ADD CONSTRAINT "RuntimeApprovalSubmission_shape" CHECK ("evidenceRevision">=0 AND "actorVersion">0 AND "snapshotHash" ~ '^[a-f0-9]{64}$' AND jsonb_typeof(snapshot)='object');
ALTER TABLE "RuntimeActivity" ADD CONSTRAINT "RuntimeActivity_shape" CHECK (sequence>0 AND "actorVersion">0 AND "commandHash" ~ '^[a-f0-9]{64}$' AND "commandId" ~ '^[a-f0-9-]{36}$' AND jsonb_typeof(snapshot)='object' AND jsonb_typeof(result)='object' AND "actorRole" IN ('DIRECTOR','SENIOR_PROJECT_MANAGER','JUNIOR_PROJECT_MANAGER') AND action IN ('CREATED','FIELDS','CHECKLIST','UPLOAD_PREPARED','FILE_SUBMITTED','UPLOAD_FAILED','FILE_DECIDED','APPROVAL_SUBMITTED','APPROVAL_DECIDED','COMPLETED'));
ALTER TABLE "SharedFile" ADD CONSTRAINT "SharedFile_runtime_origin" CHECK ("runtimeStageId" IS NULL OR num_nonnulls("projectId","flexibleProjectId","taskId","stageId","conceptFolderId","milestoneId","completionWorkflowId","completionDocumentType")=0);
ALTER TABLE "SharedFileReference" DROP CONSTRAINT "SharedFileReference_one_record_check";
ALTER TABLE "SharedFileReference" ADD CONSTRAINT "SharedFileReference_one_record_check" CHECK (num_nonnulls("projectAttachmentId","flexibleAttachmentId","archivedProjectFileId","manualArchiveFileId","manualLibraryAssetId","completionSubmissionId","completionDocumentId","taskUploadId","runtimeSubmissionId")=1);

CREATE FUNCTION flux_runtime_authorized(pid text, uid text) RETURNS boolean LANGUAGE plpgsql STABLE AS $$
BEGIN
 RETURN EXISTS(SELECT 1 FROM "UserAuthorization" a JOIN "RuntimeProject" p ON p.id=pid WHERE a."userId"=uid AND a."accountStatus"='ACTIVE' AND
 (a."businessRole"::text='DIRECTOR' OR (a."businessRole"::text IN ('SENIOR_PROJECT_MANAGER','JUNIOR_PROJECT_MANAGER') AND (p."ownerId"=uid OR EXISTS(SELECT 1 FROM "RuntimeParticipant" rp WHERE rp."projectId"=pid AND rp."userId"=uid AND rp.role='CO_OWNER')))));
END $$;
CREATE FUNCTION flux_runtime_ready(sid text, skip_approvals boolean DEFAULT false) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE s "RuntimeStage"; b jsonb; f jsonb; i jsonb; v jsonb; n int; bad int;
BEGIN
 SELECT * INTO STRICT s FROM "RuntimeStage" WHERE id=sid;
 FOR i IN SELECT * FROM jsonb_array_elements(s.configuration->'gates') LOOP
  IF i->>'type'='PRECEDING_STAGE' AND NOT EXISTS(SELECT 1 FROM "RuntimeStage" WHERE "projectId"=s."projectId" AND "definitionStageId"=i->>'stageId' AND state='COMPLETED') THEN RETURN false; END IF;
 END LOOP;
 FOR b IN SELECT * FROM jsonb_array_elements(s.configuration->'capabilities') LOOP
  IF b->>'type'='INFORMATION' THEN
   FOR f IN SELECT * FROM jsonb_array_elements(b->'fields') LOOP
    v:=s.values->(f->>'id')->'value';
    IF (f->>'required')::boolean AND (v IS NULL OR v='null'::jsonb OR btrim(v#>>'{}')='') THEN RETURN false; END IF;
   END LOOP;
  ELSIF b->>'type'='CHECKLIST' THEN
   FOR i IN SELECT * FROM jsonb_array_elements(b->'items') LOOP
    v:=s.checklist->(i->>'id');
    IF (i->>'required')::boolean AND (v IS NULL OR v->>'complete'<>'true' OR nullif(v->>'actorId','') IS NULL OR
      (i->>'evidence'='TEXT' AND coalesce(btrim(v->>'text'),'')='') OR
      (i->>'evidence'='SHARED_FILE_VERSION' AND NOT EXISTS(SELECT 1 FROM "RuntimeFileSubmission" x JOIN "SharedFileVersion" fv ON fv.id=x."versionId"
       WHERE x."stageId"=sid AND x."versionId"=v->>'versionId' AND fv.status='READY' AND x.state IN ('SUBMITTED','ACCEPTED') AND NOT EXISTS(SELECT 1 FROM "RuntimeFileSubmission" n WHERE n."supersedesId"=x.id) AND
       EXISTS(SELECT 1 FROM jsonb_array_elements(s.configuration->'capabilities') cb WHERE cb->>'id'=x."capabilityId" AND (cb->>'acceptance'='NONE' OR x.state='ACCEPTED'))))) THEN RETURN false; END IF;
   END LOOP;
  ELSIF b->>'type'='FILE_REQUIREMENT' THEN
   SELECT count(*),count(*) FILTER(WHERE fv.status<>'READY' OR NOT fv."applicationSealed" OR fv."objectETag" IS NULL OR
      (b->>'acceptance'='NONE' AND x.state NOT IN ('SUBMITTED','ACCEPTED')) OR (b->>'acceptance'<>'NONE' AND x.state<>'ACCEPTED')) INTO n,bad
    FROM "RuntimeFileSubmission" x JOIN "SharedFileVersion" fv ON fv.id=x."versionId" WHERE x."stageId"=sid AND x."capabilityId"=b->>'id' AND NOT EXISTS(SELECT 1 FROM "RuntimeFileSubmission" next WHERE next."supersedesId"=x.id);
   IF ((b->>'required')::boolean OR n>0) AND (n<(b->>'minFiles')::int OR n>(b->>'maxFiles')::int OR bad>0) THEN RETURN false; END IF;
  ELSIF b->>'type'='APPROVAL' AND NOT skip_approvals AND (b->>'gatesProgression')::boolean THEN
   IF NOT EXISTS(SELECT 1 FROM "RuntimeApprovalSubmission" a JOIN "ApprovalRequest" r ON r.id=a."approvalRequestId" WHERE a."stageId"=sid AND a."capabilityId"=b->>'id' AND a."evidenceRevision"=s."evidenceRevision" AND r.state='APPROVED') THEN RETURN false; END IF;
  END IF;
 END LOOP;
 RETURN true;
END $$;
CREATE FUNCTION flux_runtime_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE pid text; uid text; sid text; role_name text; av int; p "RuntimeProject"; s "RuntimeStage"; pv "PublishedWorkflowVersion"; v "SharedFileVersion"; old_file "RuntimeFileSubmission"; b jsonb; f jsonb; item jsonb; val jsonb; key text; n int;
BEGIN
 IF TG_OP IN ('DELETE','TRUNCATE') THEN RAISE EXCEPTION 'Runtime history is retained' USING ERRCODE='23514'; END IF;
 uid:=current_setting('flux.runtime_actor',true); sid:=current_setting('flux.runtime_session',true);
 SELECT "businessRole"::text,"authorizationVersion" INTO role_name,av FROM "UserAuthorization" WHERE "userId"=uid;
 IF NOT coalesce(flux_workflow_actor_current(uid,role_name,av,sid),false) OR role_name NOT IN ('DIRECTOR','SENIOR_PROJECT_MANAGER','JUNIOR_PROJECT_MANAGER') THEN RAISE EXCEPTION 'Current runtime session required' USING ERRCODE='23514'; END IF;
 IF TG_TABLE_NAME='RuntimeProject' THEN
  IF TG_OP='INSERT' THEN
   SELECT * INTO STRICT pv FROM "PublishedWorkflowVersion" WHERE id=NEW."publishedVersionId";
   IF role_name<>'DIRECTOR' OR NEW."createdById"<>uid OR NEW.revision<>1 OR NEW."workflowId"<>pv."workflowId" OR NEW."versionNumber"<>pv.number OR NEW."definitionHash"<>pv."configurationHash" OR
    NOT EXISTS(SELECT 1 FROM "UserAuthorization" WHERE "userId"=NEW."ownerId" AND "accountStatus"='ACTIVE' AND "businessRole"::text IN ('DIRECTOR','SENIOR_PROJECT_MANAGER','JUNIOR_PROJECT_MANAGER')) THEN RAISE EXCEPTION 'Director creation requires exact published identity and real Owner' USING ERRCODE='23514'; END IF;
  ELSE
   IF (to_jsonb(NEW)-'revision') IS DISTINCT FROM (to_jsonb(OLD)-'revision') OR NEW.revision<>OLD.revision+1 OR NOT flux_runtime_authorized(NEW.id,uid) THEN RAISE EXCEPTION 'Runtime identity ownership and binding are immutable' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
 END IF;
 IF TG_TABLE_NAME IN ('RuntimeParticipant','RuntimeStage','RuntimeActivity') THEN pid:=NEW."projectId";
 ELSE SELECT "projectId" INTO STRICT pid FROM "RuntimeStage" WHERE id=NEW."stageId"; END IF;
 SELECT * INTO STRICT p FROM "RuntimeProject" WHERE id=pid FOR UPDATE;
 IF NOT flux_runtime_authorized(pid,uid) THEN RAISE EXCEPTION 'Runtime resource denied' USING ERRCODE='23514'; END IF;
 IF TG_TABLE_NAME='RuntimeParticipant' THEN
  IF TG_OP<>'INSERT' OR p.revision<>1 OR role_name<>'DIRECTOR' OR NEW."addedById"<>uid OR NEW."userId"=p."ownerId" OR NOT EXISTS(SELECT 1 FROM "UserAuthorization" WHERE "userId"=NEW."userId" AND "accountStatus"='ACTIVE' AND "businessRole" IS NOT NULL AND (NEW.role='EXECUTOR' OR "businessRole"::text IN ('DIRECTOR','SENIOR_PROJECT_MANAGER','JUNIOR_PROJECT_MANAGER'))) THEN RAISE EXCEPTION 'Initial genuine participants only' USING ERRCODE='23514'; END IF;
 ELSIF TG_TABLE_NAME='RuntimeStage' THEN
  IF TG_OP='INSERT' THEN
   SELECT * INTO STRICT pv FROM "PublishedWorkflowVersion" WHERE id=p."publishedVersionId";
   IF p.revision<>1 OR role_name<>'DIRECTOR' OR NEW.revision<>0 OR NEW."evidenceRevision"<>0 OR NEW.state<>'AVAILABLE' OR NEW.configuration IS DISTINCT FROM pv.definition->'stages'->NEW.position OR NEW."definitionStageId"<>NEW.configuration->>'id' THEN RAISE EXCEPTION 'Runtime stage must bind exact immutable definition' USING ERRCODE='23514'; END IF;
  ELSE
   IF OLD.state='COMPLETED' OR (to_jsonb(NEW)-ARRAY['state','revision','evidenceRevision','values','checklist','completedById','completedAt','completionSnapshot']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','revision','evidenceRevision','values','checklist','completedById','completedAt','completionSnapshot']) OR NEW.revision<>OLD.revision+1 OR NEW."evidenceRevision" NOT IN (OLD."evidenceRevision",OLD."evidenceRevision"+1) THEN RAISE EXCEPTION 'Completed stages and definition identity are immutable' USING ERRCODE='23514'; END IF;
   IF (NEW.values<>OLD.values OR NEW.checklist<>OLD.checklist) AND NEW."evidenceRevision"<>OLD."evidenceRevision"+1 THEN RAISE EXCEPTION 'Evidence changes require fresh revision' USING ERRCODE='23514'; END IF;
   IF NEW.state='COMPLETED' AND (NEW."completedById"<>uid OR NOT flux_runtime_ready(NEW.id)) THEN RAISE EXCEPTION 'Completion requires exact ready evidence and real actor' USING ERRCODE='23514'; END IF;
  END IF;
  -- Only approved stable fields exist; read-only blocks retain published defaults.
  SELECT count(*) INTO n FROM jsonb_array_elements(NEW.configuration->'capabilities') cb CROSS JOIN LATERAL jsonb_array_elements(coalesce(cb->'fields','[]')) fld;
  IF (SELECT count(*) FROM jsonb_object_keys(NEW.values))<>n THEN RAISE EXCEPTION 'Exact runtime field identity required' USING ERRCODE='23514'; END IF;
  FOR b IN SELECT * FROM jsonb_array_elements(NEW.configuration->'capabilities') LOOP
   IF b->>'type'='INFORMATION' THEN FOR f IN SELECT * FROM jsonb_array_elements(b->'fields') LOOP
    val:=NEW.values->(f->>'id'); IF val IS NULL OR (val-ARRAY['value','actorId','at'])<>'{}'::jsonb THEN RAISE EXCEPTION 'Unknown runtime field shape' USING ERRCODE='23514'; END IF;
    IF f->>'type'='READ_ONLY' AND val->'value' IS DISTINCT FROM f->'defaultValue' THEN RAISE EXCEPTION 'Read-only field cannot change' USING ERRCODE='23514'; END IF;
    IF TG_OP='UPDATE' AND val IS DISTINCT FROM OLD.values->(f->>'id') AND (val->>'actorId' IS DISTINCT FROM uid OR val->>'at' IS NULL) THEN RAISE EXCEPTION 'Field changes require actual actor' USING ERRCODE='23514'; END IF;
    IF val->'value'<>'null'::jsonb AND f->>'type'<>'READ_ONLY' THEN
     IF f->>'type'='NUMBER' THEN
      IF jsonb_typeof(val->'value')<>'number' OR abs((val->>'value')::numeric)>1e12 OR (f->>'min' IS NOT NULL AND (val->>'value')::numeric<(f->>'min')::numeric) OR (f->>'max' IS NOT NULL AND (val->>'value')::numeric>(f->>'max')::numeric) THEN RAISE EXCEPTION 'Invalid runtime number' USING ERRCODE='23514'; END IF;
     ELSE
      IF jsonb_typeof(val->'value')<>'string' OR length(val->>'value')>10000 OR (f->>'type'='SHORT_TEXT' AND length(val->>'value')>500) OR (f->>'min' IS NOT NULL AND length(val->>'value')<(f->>'min')::int) OR (f->>'max' IS NOT NULL AND length(val->>'value')>(f->>'max')::int) THEN RAISE EXCEPTION 'Invalid runtime text' USING ERRCODE='23514'; END IF;
      IF f->>'type'='SELECT' AND NOT (f->'options' @> jsonb_build_array(val->>'value')) THEN RAISE EXCEPTION 'Unapproved select option' USING ERRCODE='23514'; END IF;
      IF f->>'type'='DATE' AND ((val->>'value') !~ '^\d{4}-\d{2}-\d{2}$' OR to_char((val->>'value')::date,'YYYY-MM-DD')<>val->>'value') THEN RAISE EXCEPTION 'Invalid date' USING ERRCODE='23514'; END IF;
     END IF;
    END IF;
   END LOOP; END IF;
  END LOOP;
  FOR key,val IN SELECT * FROM jsonb_each(NEW.checklist) LOOP
   SELECT ci INTO item FROM jsonb_array_elements(NEW.configuration->'capabilities') cb CROSS JOIN LATERAL jsonb_array_elements(coalesce(cb->'items','[]')) ci WHERE ci->>'id'=key;
   IF item IS NULL OR jsonb_typeof(val->'complete')<>'boolean' OR (val-ARRAY['complete','text','versionId','actorId','at'])<>'{}'::jsonb OR length(val->>'text')>2000 OR (TG_OP='UPDATE' AND val IS DISTINCT FROM OLD.checklist->key AND val->>'actorId' IS DISTINCT FROM uid) OR
    (item->>'evidence'<>'TEXT' AND val->>'text'<>'') OR (item->>'evidence'<>'SHARED_FILE_VERSION' AND val->>'versionId' IS NOT NULL) OR (val->>'complete'='true' AND item->>'evidence'='TEXT' AND coalesce(btrim(val->>'text'),'')='') OR
    (val->>'versionId' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "RuntimeFileSubmission" WHERE "stageId"=NEW.id AND "versionId"=val->>'versionId' AND state IN ('SUBMITTED','ACCEPTED'))) THEN RAISE EXCEPTION 'Checklist identity evidence or actor mismatch' USING ERRCODE='23514'; END IF;
  END LOOP;
 ELSIF TG_TABLE_NAME='RuntimeFileSubmission' THEN
  SELECT * INTO STRICT s FROM "RuntimeStage" WHERE id=NEW."stageId";
  SELECT * INTO STRICT v FROM "SharedFileVersion" WHERE id=NEW."versionId";
  SELECT cb INTO b FROM jsonb_array_elements(s.configuration->'capabilities') cb WHERE cb->>'id'=NEW."capabilityId" AND cb->>'type'='FILE_REQUIREMENT';
  IF s.state='COMPLETED' OR b IS NULL OR NOT EXISTS(SELECT 1 FROM "SharedFile" WHERE id=v."fileId" AND "runtimeStageId"=s.id) OR v."uploadedById"<>NEW."submittedById" THEN RAISE EXCEPTION 'Exact stage file source required' USING ERRCODE='23514'; END IF;
  IF TG_OP='INSERT' THEN
   IF NEW.state<>'UPLOADING' OR NEW."submittedById"<>uid OR v.status<>'UPLOADING' OR NOT v."applicationSealed" THEN RAISE EXCEPTION 'Attributed runtime upload intent required' USING ERRCODE='23514'; END IF;
   IF NEW."supersedesId" IS NOT NULL THEN
    SELECT * INTO STRICT old_file FROM "RuntimeFileSubmission" WHERE id=NEW."supersedesId";
    IF old_file."stageId"<>NEW."stageId" OR old_file."capabilityId"<>NEW."capabilityId" OR old_file.state='UPLOADING' OR (SELECT "fileId" FROM "SharedFileVersion" WHERE id=old_file."versionId")<>v."fileId" THEN RAISE EXCEPTION 'File revisions cannot cross boundaries' USING ERRCODE='23514'; END IF;
   END IF;
  ELSE
   IF (to_jsonb(NEW)-ARRAY['state','submittedAt','reviewedById','reviewedAt','reason','failureCode']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','submittedAt','reviewedById','reviewedAt','reason','failureCode']) OR EXISTS(SELECT 1 FROM "RuntimeFileSubmission" WHERE "supersedesId"=NEW.id) THEN RAISE EXCEPTION 'File source and history are retained' USING ERRCODE='23514'; END IF;
   IF OLD.state='UPLOADING' THEN
    IF uid<>OLD."submittedById" OR NEW.state NOT IN ('SUBMITTED','FAILED') OR v.status::text<>(CASE NEW.state WHEN 'FAILED' THEN 'FAILED' ELSE 'READY' END) THEN RAISE EXCEPTION 'Only uploader finalizes exact version' USING ERRCODE='23514'; END IF;
   ELSIF OLD.state='SUBMITTED' THEN
    IF NEW.state NOT IN ('ACCEPTED','REJECTED') OR NEW."reviewedById"<>uid OR uid=NEW."submittedById" OR b->>'acceptance'='NONE' OR (b->>'acceptance'='OWNER' AND uid<>p."ownerId") THEN RAISE EXCEPTION 'Independent configured file reviewer required' USING ERRCODE='23514'; END IF;
   ELSE RAISE EXCEPTION 'Decided file history is immutable' USING ERRCODE='23514'; END IF;
  END IF;
 ELSIF TG_TABLE_NAME='RuntimeApprovalSubmission' THEN
  SELECT * INTO STRICT s FROM "RuntimeStage" WHERE id=NEW."stageId";
  SELECT cb INTO b FROM jsonb_array_elements(s.configuration->'capabilities') cb WHERE cb->>'id'=NEW."capabilityId" AND cb->>'type'='APPROVAL';
  IF TG_OP<>'INSERT' OR s.state='COMPLETED' OR b IS NULL OR NEW."requestedById"<>uid OR NEW."actorVersion"<>av OR NEW."evidenceRevision"<>s."evidenceRevision" OR NOT flux_runtime_ready(s.id,true) OR NEW.snapshot->>'stageId'<>s.id OR NEW.snapshot->'values' IS DISTINCT FROM s.values OR NEW.snapshot->'checklist' IS DISTINCT FROM s.checklist THEN RAISE EXCEPTION 'Approval binds exact ready runtime evidence' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM "RuntimeApprovalSubmission" WHERE "stageId"=s.id AND "capabilityId"=NEW."capabilityId" AND "evidenceRevision">=NEW."evidenceRevision") THEN RAISE EXCEPTION 'Correct evidence before resubmission' USING ERRCODE='23514'; END IF;
 ELSIF TG_TABLE_NAME='RuntimeActivity' THEN
  IF TG_OP<>'INSERT' OR NEW."actorId"<>uid OR NEW."actorRole"<>role_name OR NEW."actorVersion"<>av OR NEW."sessionId"<>sid OR NEW.sequence<>p.revision OR NEW."eventId"<>'runtime:'||NEW.id OR ((NEW.action='CREATED') IS DISTINCT FROM (NEW."stageId" IS NULL)) THEN RAISE EXCEPTION 'Immutable runtime activity requires genuine actor' USING ERRCODE='23514'; END IF;
  IF NEW."stageId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "RuntimeStage" WHERE id=NEW."stageId" AND "projectId"=pid AND NEW.snapshot->>'state'=state AND (NEW.snapshot->>'revision')::int=revision AND NEW.snapshot->'values'=values AND NEW.snapshot->'checklist'=checklist) THEN RAISE EXCEPTION 'History must retain actual stage projection' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;

CREATE FUNCTION flux_runtime_consistency() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE pid text; p "RuntimeProject"; s "RuntimeStage"; n int; last_row "RuntimeActivity"; initial "RuntimeActivity"; current_files jsonb;
BEGIN
 IF TG_TABLE_NAME='RuntimeProject' THEN pid:=NEW.id;
 ELSIF TG_TABLE_NAME IN ('RuntimeParticipant','RuntimeStage','RuntimeActivity') THEN pid:=NEW."projectId";
 ELSE SELECT "projectId" INTO STRICT pid FROM "RuntimeStage" WHERE id=NEW."stageId"; END IF;
 SELECT * INTO STRICT p FROM "RuntimeProject" WHERE id=pid;
 SELECT count(*) INTO n FROM "RuntimeActivity" WHERE "projectId"=pid;
 IF n<>p.revision OR (SELECT max(sequence) FROM "RuntimeActivity" WHERE "projectId"=pid)<>n OR NOT EXISTS(SELECT 1 FROM "RuntimeActivity" WHERE "projectId"=pid AND sequence=1 AND action='CREATED' AND "actorId"=p."createdById") OR
 (SELECT count(*) FROM "RuntimeStage" WHERE "projectId"=pid)<>(SELECT jsonb_array_length(definition->'stages') FROM "PublishedWorkflowVersion" WHERE id=p."publishedVersionId") THEN RAISE EXCEPTION 'Complete contiguous runtime and initial stages required' USING ERRCODE='23514'; END IF;
 SELECT * INTO STRICT initial FROM "RuntimeActivity" WHERE "projectId"=pid AND sequence=1;
 IF initial.snapshot->>'ownerId'<>p."ownerId" OR initial.snapshot->>'publishedVersionId'<>p."publishedVersionId" OR initial.snapshot->>'definitionHash'<>p."definitionHash" OR
 ARRAY(SELECT "userId" FROM "RuntimeParticipant" WHERE "projectId"=pid AND role='CO_OWNER' ORDER BY "userId") IS DISTINCT FROM ARRAY(SELECT jsonb_array_elements_text(initial.snapshot->'coOwnerIds') ORDER BY 1) OR
 ARRAY(SELECT "userId" FROM "RuntimeParticipant" WHERE "projectId"=pid AND role='EXECUTOR' ORDER BY "userId") IS DISTINCT FROM ARRAY(SELECT jsonb_array_elements_text(initial.snapshot->'executorIds') ORDER BY 1) THEN RAISE EXCEPTION 'Initial ownership and participants require exact immutable attribution' USING ERRCODE='23514'; END IF;
 FOR s IN SELECT * FROM "RuntimeStage" WHERE "projectId"=pid LOOP
  SELECT count(*) INTO n FROM "RuntimeActivity" WHERE "stageId"=s.id;
  IF n<>s.revision THEN RAISE EXCEPTION 'Each stage mutation requires retained history' USING ERRCODE='23514'; END IF;
  IF n>0 THEN
   SELECT * INTO STRICT last_row FROM "RuntimeActivity" WHERE "stageId"=s.id ORDER BY sequence DESC LIMIT 1;
   IF last_row.snapshot->'values' IS DISTINCT FROM s.values OR last_row.snapshot->'checklist' IS DISTINCT FROM s.checklist OR last_row.snapshot->>'state'<>s.state OR (last_row.snapshot->>'revision')::int<>s.revision OR (last_row.snapshot->>'evidenceRevision')::int<>s."evidenceRevision" THEN RAISE EXCEPTION 'Runtime projection must match immutable history' USING ERRCODE='23514'; END IF;
  END IF;
  IF n>0 THEN
   SELECT coalesce(jsonb_agg(jsonb_build_object('submissionId',f.id,'capabilityId',f."capabilityId",'versionId',f."versionId",'state',f.state,'submittedById',f."submittedById",'reviewedById',f."reviewedById")),'[]'::jsonb) INTO current_files FROM "RuntimeFileSubmission" f WHERE f."stageId"=s.id AND NOT EXISTS(SELECT 1 FROM "RuntimeFileSubmission" newer WHERE newer."supersedesId"=f.id);
   IF NOT ((last_row.snapshot->'files') @> current_files AND current_files @> (last_row.snapshot->'files')) OR jsonb_array_length(last_row.snapshot->'files')<>jsonb_array_length(current_files) OR last_row.snapshot->'completion' IS DISTINCT FROM coalesce(s."completionSnapshot",'null'::jsonb) THEN RAISE EXCEPTION 'File projection and completed evidence require immutable activity' USING ERRCODE='23514'; END IF;
  ELSIF EXISTS(SELECT 1 FROM "RuntimeFileSubmission" WHERE "stageId"=s.id) THEN RAISE EXCEPTION 'File submission requires stage activity' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM "RuntimeApprovalSubmission" a JOIN "ApprovalRequest" r ON r.id=a."approvalRequestId" WHERE a."stageId"=s.id AND a."evidenceRevision"<>s."evidenceRevision" AND r.state='PENDING') THEN RAISE EXCEPTION 'Changed evidence must supersede pending approvals' USING ERRCODE='23514'; END IF;
 END LOOP;
 RETURN NULL;
END $$;
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['RuntimeProject','RuntimeParticipant','RuntimeStage','RuntimeFileSubmission','RuntimeApprovalSubmission','RuntimeActivity'] LOOP
 EXECUTE format('CREATE TRIGGER flux_runtime_guard BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION flux_runtime_guard()',t);
 EXECUTE format('CREATE TRIGGER flux_runtime_truncate BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION flux_runtime_guard()',t);
 EXECUTE format('CREATE CONSTRAINT TRIGGER flux_runtime_consistency AFTER INSERT OR UPDATE ON %I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION flux_runtime_consistency()',t);
END LOOP; END $$;

CREATE FUNCTION flux_emit_runtime_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO "BusinessEvent" (id,type,"schemaVersion","aggregateType","aggregateId",sequence,"actorId","actorRole","actorVersion",operation,"correlationId","causationId","idempotencyKey","occurredAt",payload)
 VALUES(NEW."eventId",'RUNTIME_ACTIVITY',1,'RUNTIME_PROJECT',NEW."projectId",NEW.sequence,NEW."actorId",NEW."actorRole",NEW."actorVersion",'runtimeStageCommand',NEW."projectId",NEW.id,NEW."eventId",NEW."createdAt",jsonb_build_object('action',NEW.action,'stageId',NEW."stageId"));
 INSERT INTO "EventOutbox" ("eventId","consumerKey") VALUES(NEW."eventId",'internal.audit.v1');
 RETURN NEW;
END $$;
CREATE TRIGGER flux_emit_runtime_event AFTER INSERT ON "RuntimeActivity" FOR EACH ROW EXECUTE FUNCTION flux_emit_runtime_event();
ALTER TABLE "ApprovalStep" DROP CONSTRAINT "ApprovalStep_position_check";
ALTER TABLE "ApprovalStep" ADD CONSTRAINT "ApprovalStep_position_check" CHECK (position BETWEEN 1 AND CASE WHEN eligibility::text='RUNTIME_STAGE_REVIEWER' THEN 12 ELSE 8 END);
CREATE FUNCTION flux_runtime_approval_write(t text, op text, value jsonb, old_value jsonb) RETURNS void LANGUAGE plpgsql AS $$
DECLARE rid text; r "ApprovalRequest"; a "RuntimeApprovalSubmission"; s "RuntimeStage"; p "RuntimeProject"; st "ApprovalStep"; d "ApprovalDecision"; uid text; b jsonb; configured jsonb; actual_role text; permitted boolean; pos int;
BEGIN
 rid:=CASE WHEN t='ApprovalRequest' THEN value->>'id' ELSE value->>'requestId' END;
 SELECT * INTO STRICT a FROM "RuntimeApprovalSubmission" WHERE "approvalRequestId"=rid;
 SELECT * INTO STRICT s FROM "RuntimeStage" WHERE id=a."stageId";
 SELECT * INTO STRICT p FROM "RuntimeProject" WHERE id=s."projectId";
 SELECT cb INTO STRICT b FROM jsonb_array_elements(s.configuration->'capabilities') cb WHERE cb->>'id'=a."capabilityId" AND cb->>'type'='APPROVAL';
 uid:=current_setting('flux.runtime_actor',true);
 IF NOT flux_runtime_authorized(p.id,uid) OR s.state='COMPLETED' THEN RAISE EXCEPTION 'Runtime approval resource denied' USING ERRCODE='23514'; END IF;
 IF t='ApprovalRequest' THEN
  IF op='INSERT' THEN
   IF value->>'state'<>'PENDING' OR value->>'revision'<>'0' OR value->>'currentStep'<>'1' OR value->>'subjectId'<>s.id OR value->>'subjectVersion'<>a.id OR value->>'requestedById'<>a."requestedById" OR (value->>'requestedAt')::timestamp<>a."requestedAt" OR
    value->'subjectSnapshot' IS DISTINCT FROM a.snapshot OR value->'policySnapshot' IS DISTINCT FROM jsonb_build_object('key','runtime-stage.ordered.v1','capabilityId',a."capabilityId",'steps',b->'steps','independentReview',true) THEN RAISE EXCEPTION 'Exact native runtime request snapshot required' USING ERRCODE='23514'; END IF;
  ELSE
   IF old_value->>'state'<>'PENDING' OR (value->>'revision')::int<>(old_value->>'revision')::int+1 OR (value-ARRAY['state','revision','currentStep','supersededAt','supersessionReason']) IS DISTINCT FROM (old_value-ARRAY['state','revision','currentStep','supersededAt','supersessionReason']) THEN RAISE EXCEPTION 'Runtime request identity is sealed' USING ERRCODE='23514'; END IF;
   IF value->>'state'='SUPERSEDED' AND value->>'supersessionReason'<>'Runtime evidence changed; submit a fresh review.' THEN RAISE EXCEPTION 'Native supersession required' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN;
 END IF;
 SELECT * INTO STRICT r FROM "ApprovalRequest" WHERE id=rid FOR UPDATE;
 IF op<>'INSERT' THEN RAISE EXCEPTION 'Runtime approval evidence retained' USING ERRCODE='23514'; END IF;
 IF t='ApprovalStep' THEN
  IF r.revision<>0 OR r.state<>'PENDING' OR value->>'eligibility'<>'RUNTIME_STAGE_REVIEWER' OR (value->>'position')::int NOT BETWEEN 1 AND jsonb_array_length(b->'steps') THEN RAISE EXCEPTION 'Exact configured steps required' USING ERRCODE='23514'; END IF;
 ELSIF t='ApprovalEvidence' THEN
  IF r.revision<>0 OR r.state<>'PENDING' OR NOT EXISTS(SELECT 1 FROM "RuntimeFileSubmission" x JOIN "SharedFileVersion" v ON v.id=x."versionId" WHERE x."stageId"=s.id AND x."versionId"=value->>'fileVersionId' AND v.status='READY' AND x.state IN ('SUBMITTED','ACCEPTED') AND NOT EXISTS(SELECT 1 FROM "RuntimeFileSubmission" n WHERE n."supersedesId"=x.id) AND value->'snapshot'=jsonb_build_object('id',v.id,'fileId',v."fileId",'number',v.number,'objectETag',v."objectETag",'objectVersionId',v."objectVersionId",'checksumSha256',v."checksumSha256",'checksumEvidence',v."checksumEvidence")) THEN RAISE EXCEPTION 'Exact scoped file version evidence required' USING ERRCODE='23514'; END IF;
 ELSIF t='ApprovalDecision' THEN
  SELECT * INTO STRICT st FROM "ApprovalStep" WHERE id=value->>'stepId' AND "requestId"=rid;
  configured:=b->'steps'->(st.position-1); actual_role:=value->>'actorRole';
  permitted:=CASE configured->>'approver' WHEN 'DIRECTOR' THEN actual_role='DIRECTOR' WHEN 'SENIOR_PROJECT_MANAGER' THEN actual_role='SENIOR_PROJECT_MANAGER' WHEN 'PROJECT_OWNER' THEN uid=p."ownerId" WHEN 'PROJECT_CO_OWNER' THEN EXISTS(SELECT 1 FROM "RuntimeParticipant" WHERE "projectId"=p.id AND "userId"=uid AND role='CO_OWNER') ELSE false END;
  IF NOT permitted OR uid IS DISTINCT FROM value->>'actorId' OR uid IS DISTINCT FROM current_setting('flux.approval_actor',true) OR value->>'sessionId' IS DISTINCT FROM current_setting('flux.runtime_session',true) OR value->>'sessionId' IS DISTINCT FROM current_setting('flux.approval_session',true) OR
   NOT flux_workflow_actor_current(uid,actual_role,(value->>'actorVersion')::int,value->>'sessionId') OR r.state<>'PENDING' OR r.revision<>(value->>'expectedRevision')::int OR r."currentStep"<>st.position OR r."evidenceHash"<>value->>'evidenceHash' OR value->>'nativeEventId' IS NOT NULL OR a."evidenceRevision"<>s."evidenceRevision" OR uid=a."requestedById" OR
   EXISTS(SELECT 1 FROM jsonb_each(s.values) x WHERE x.value->>'actorId'=uid) OR EXISTS(SELECT 1 FROM jsonb_each(s.checklist) x WHERE x.value->>'complete'='true' AND x.value->>'actorId'=uid) OR EXISTS(SELECT 1 FROM "RuntimeFileSubmission" f WHERE f."stageId"=s.id AND f."submittedById"=uid AND NOT EXISTS(SELECT 1 FROM "RuntimeFileSubmission" n WHERE n."supersedesId"=f.id)) OR
   NOT EXISTS(SELECT 1 FROM "UserAuthorization" WHERE "userId"=a."requestedById" AND "accountStatus"='ACTIVE' AND "authorizationVersion"=a."actorVersion" AND "businessRole"::text IN ('DIRECTOR','SENIOR_PROJECT_MANAGER','JUNIOR_PROJECT_MANAGER')) THEN RAISE EXCEPTION 'Ordered independent current runtime reviewer required' USING ERRCODE='23514'; END IF;
 ELSIF t='ApprovalEvent' THEN
  IF value->>'nativeEventId' IS NOT NULL OR value->>'externalActorEmail' IS NOT NULL OR value->>'actorId' IS DISTINCT FROM uid THEN RAISE EXCEPTION 'Genuine runtime audit required' USING ERRCODE='23514'; END IF;
  IF value->>'action'='REQUESTED' THEN
   IF uid<>a."requestedById" OR r.state<>'PENDING' OR r.revision<>0 OR (value->>'createdAt')::timestamp<>a."requestedAt" OR value->'details'<>jsonb_build_object('stageId',s.id) THEN RAISE EXCEPTION 'Native request event required' USING ERRCODE='23514'; END IF;
  ELSIF value->>'action'='DECIDED' THEN
   SELECT * INTO STRICT d FROM "ApprovalDecision" WHERE id=value->>'decisionId' AND "requestId"=rid;
   IF uid<>d."actorId" OR (value->>'createdAt')::timestamp<>d."decidedAt" OR value->'details' IS DISTINCT FROM jsonb_build_object('outcome',d.outcome,'reason',d.reason,'revision',d."expectedRevision"+1,'evidenceHash',d."evidenceHash") THEN RAISE EXCEPTION 'Native decision event required' USING ERRCODE='23514'; END IF;
  ELSIF value->>'action'='SUPERSEDED' THEN
   IF r.state<>'SUPERSEDED' OR value->'details'<>jsonb_build_object('stageId',s.id) THEN RAISE EXCEPTION 'Native supersession event required' USING ERRCODE='23514'; END IF;
  ELSE RAISE EXCEPTION 'Unsupported runtime approval event' USING ERRCODE='23514'; END IF;
 END IF;
END $$;
CREATE FUNCTION flux_runtime_approval_consistency(rid text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE r "ApprovalRequest"; a "RuntimeApprovalSubmission"; steps int; decisions int; rejected int; expected_state text;
BEGIN
 SELECT * INTO STRICT r FROM "ApprovalRequest" WHERE id=rid;
 SELECT * INTO STRICT a FROM "RuntimeApprovalSubmission" WHERE "approvalRequestId"=rid;
 SELECT count(*) INTO steps FROM "ApprovalStep" WHERE "requestId"=rid;
 SELECT count(*),count(*) FILTER(WHERE outcome='REJECT') INTO decisions,rejected FROM "ApprovalDecision" WHERE "requestId"=rid;
 IF steps NOT BETWEEN 1 AND 12 OR steps<>jsonb_array_length(r."policySnapshot"->'steps') OR (SELECT max(position) FROM "ApprovalStep" WHERE "requestId"=rid)<>steps OR
 (SELECT count(*) FROM "ApprovalEvent" WHERE "requestId"=rid AND action='REQUESTED')<>1 OR (SELECT count(*) FROM "ApprovalEvent" WHERE "requestId"=rid AND action='DECIDED')<>decisions OR
 (SELECT count(*) FROM "ApprovalEvidence" WHERE "requestId"=rid)<>jsonb_array_length(a.snapshot->'files') OR
 EXISTS(SELECT 1 FROM "ApprovalDecision" d JOIN "ApprovalStep" st ON st.id=d."stepId" WHERE d."requestId"=rid AND st.position<>d."expectedRevision"+1) OR
 EXISTS(SELECT 1 FROM "ApprovalDecision" d WHERE d."requestId"=rid AND d.outcome='REJECT' AND d."expectedRevision"<>decisions-1) THEN RAISE EXCEPTION 'Complete runtime approval evidence ordered decisions and history required' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM "RuntimeActivity" WHERE "stageId"=a."stageId" AND action='APPROVAL_SUBMITTED' AND "actorId"=a."requestedById" AND result->>'requestId'=rid) OR
 EXISTS(SELECT 1 FROM "ApprovalDecision" d WHERE d."requestId"=rid AND NOT EXISTS(SELECT 1 FROM "RuntimeActivity" h WHERE h."stageId"=a."stageId" AND h.action='APPROVAL_DECIDED' AND h."actorId"=d."actorId" AND h.snapshot->'command'->'expected'->>'requestId'=rid AND h.snapshot->'command'->'expected'->>'commandId'=d."commandId")) THEN RAISE EXCEPTION 'Runtime approvals require atomic native activity and outbox' USING ERRCODE='23514'; END IF;
 IF r.state='SUPERSEDED' THEN
  IF decisions>=steps OR rejected<>0 OR r.revision<>decisions+1 OR r."currentStep"<>decisions+1 OR (SELECT count(*) FROM "ApprovalEvent" WHERE "requestId"=rid AND action='SUPERSEDED')<>1 OR a."evidenceRevision">=(SELECT "evidenceRevision" FROM "RuntimeStage" WHERE id=a."stageId") THEN RAISE EXCEPTION 'Supersession must follow changed stage evidence' USING ERRCODE='23514'; END IF;
 ELSE
  expected_state:=CASE WHEN rejected=1 THEN 'REJECTED' WHEN decisions=steps THEN 'APPROVED' ELSE 'PENDING' END;
  IF rejected>1 OR r.state::text<>expected_state OR r.revision<>decisions OR r."currentStep"<>(CASE WHEN expected_state='PENDING' THEN decisions+1 ELSE decisions END) THEN RAISE EXCEPTION 'Runtime approval projection inconsistent' USING ERRCODE='23514'; END IF;
 END IF;
END $$;

ALTER TABLE "ApprovalRequest" DROP CONSTRAINT "ApprovalRequest_values_check";
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_values_check" CHECK (
  (("subjectType"::text='RUNTIME_STAGE' AND num_nonnulls("projectId","completionSubmissionId","submissionEventId","externalRequesterEmail","expiresAt")=0 AND "requestedById" IS NOT NULL AND "policyKey"='runtime-stage.ordered.v1') OR ("subjectType"::text = 'COMPLETION_DOCUMENT_SUBMISSION' AND "subjectId" = "completionSubmissionId" AND
    num_nonnulls("projectId","completionSubmissionId","submissionEventId")=3) OR
   ("subjectType"::text = 'WORKFLOW_DRAFT_REVISION' AND num_nonnulls("projectId","completionSubmissionId","submissionEventId","externalRequesterEmail","expiresAt")=0 AND
    "requestedById" IS NOT NULL AND "policyKey"='workflow-publication.director.v1')) AND
  num_nonnulls("requestedById", "externalRequesterEmail") = 1 AND
  "revision" >= 0 AND "currentStep" > 0 AND "evidenceHash" ~ '^[a-f0-9]{64}$' AND
  length(btrim("policyKey")) BETWEEN 3 AND 100 AND
  jsonb_typeof("policySnapshot") = 'object' AND jsonb_typeof("subjectSnapshot") = 'object' AND
  ((state = 'SUPERSEDED' AND "supersededAt" IS NOT NULL AND length(btrim("supersessionReason")) > 0) OR
   (state <> 'SUPERSEDED' AND "supersededAt" IS NULL AND "supersessionReason" IS NULL))
);
CREATE OR REPLACE FUNCTION flux_approval_write_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE r "ApprovalRequest"; s "CompletionDocumentSubmission"; v "SharedFileVersion";
  e "CompletionDocumentEvent"; st "ApprovalStep"; d "ApprovalDecision"; auth record; step_count int; sub "WorkflowPublicationSubmission"; dr "WorkflowDraftRevision"; newer "WorkflowDraftRevision"; w "WorkflowDraft";
BEGIN
  IF TG_OP IN ('DELETE','TRUNCATE') THEN RAISE EXCEPTION 'Approval history is retained' USING ERRCODE = '23514'; END IF;
  -- Runtime requests retain their native stage snapshot; legacy branches remain below.
  IF TG_TABLE_NAME='ApprovalRequest' THEN
   IF NEW."subjectType"::text='RUNTIME_STAGE' THEN PERFORM flux_runtime_approval_write(TG_TABLE_NAME,TG_OP,to_jsonb(NEW),CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE NULL END); RETURN NEW; END IF;
  ELSE
   SELECT * INTO STRICT r FROM "ApprovalRequest" WHERE id=NEW."requestId" FOR UPDATE;
   IF r."subjectType"::text='RUNTIME_STAGE' THEN PERFORM flux_runtime_approval_write(TG_TABLE_NAME,TG_OP,to_jsonb(NEW),CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE NULL END); RETURN NEW; END IF;
  END IF;
  -- Phase 4.2: configuration-only subject; completion paths below are preserved.
  IF TG_TABLE_NAME='ApprovalRequest' THEN
   IF NEW."subjectType"::text='WORKFLOW_DRAFT_REVISION' THEN
    SELECT * INTO STRICT sub FROM "WorkflowPublicationSubmission" WHERE "approvalRequestId"=NEW.id;
    SELECT * INTO STRICT dr FROM "WorkflowDraftRevision" WHERE id=sub."draftRevisionId";
    SELECT * INTO STRICT w FROM "WorkflowDraft" WHERE id=sub."workflowId";
    IF TG_OP='UPDATE' THEN
      IF OLD.state<>'PENDING' OR NEW.revision<>OLD.revision+1 OR
       (to_jsonb(NEW)-ARRAY['state','revision','currentStep','supersededAt','supersessionReason']) IS DISTINCT FROM
       (to_jsonb(OLD)-ARRAY['state','revision','currentStep','supersededAt','supersessionReason']) THEN
       RAISE EXCEPTION 'Workflow approval identity and snapshots are immutable' USING ERRCODE='23514'; END IF;
      IF NEW.state='SUPERSEDED' THEN
       SELECT * INTO STRICT newer FROM "WorkflowDraftRevision" WHERE "workflowId"=w.id AND revision=w."currentRevision";
       IF newer.revision<=dr.revision OR NEW."supersededAt"<>newer."createdAt" OR
        NEW."supersessionReason"<>'A newer draft revision requires a fresh review.' OR
        newer."actorId" IS DISTINCT FROM current_setting('flux.draft_actor',true) THEN
        RAISE EXCEPTION 'Native draft revision must supersede pending review' USING ERRCODE='23514'; END IF;
      ELSE
       SELECT * INTO STRICT d FROM "ApprovalDecision" WHERE "requestId"=NEW.id;
       IF NEW.state::text<>(CASE d.outcome WHEN 'APPROVE' THEN 'APPROVED' ELSE 'REJECTED' END) OR
        d."actorId" IS DISTINCT FROM current_setting('flux.approval_actor',true) THEN
        RAISE EXCEPTION 'Workflow approval state must reflect the Director decision' USING ERRCODE='23514'; END IF;
      END IF;
    ELSE
      IF NEW.state<>'PENDING' OR NEW.revision<>0 OR NEW."currentStep"<>1 OR NEW."expiresAt" IS NOT NULL OR
       dr.revision<>w."currentRevision" OR dr."validationStatus"<>'VALID' OR NEW."subjectId"<>w.id OR NEW."subjectVersion"<>dr.id OR
       NEW."requestedById" IS DISTINCT FROM sub."submittedById" OR NEW."requestedAt"<>sub."submittedAt" OR
       NEW."requestedById" IS DISTINCT FROM current_setting('flux.publication_actor',true) OR
       sub."sessionId" IS DISTINCT FROM current_setting('flux.publication_session',true) OR
       NOT flux_workflow_actor_current(sub."submittedById",sub."actorRole",sub."actorVersion",sub."sessionId") OR
       NEW."policySnapshot" IS DISTINCT FROM '{"key":"workflow-publication.director.v1","steps":["DIRECTOR"]}'::jsonb OR
       (NEW."subjectSnapshot"-'submittedAt') IS DISTINCT FROM jsonb_build_object(
        'schemaVersion',sub."schemaVersion",'workflowId',w.id,'draftRevisionId',dr.id,'draftRevision',dr.revision,
        'authorId',w."createdById",'revisionActorId',dr."actorId",'submittedById',sub."submittedById",'changeSummary',sub."changeSummary",
        'intendedProjectType',sub."intendedProjectType",'previousPublishedVersionId',sub."previousPublishedVersionId",
        'configurationHash',dr."configurationHash",'definition',dr.definition) OR
       (NEW."subjectSnapshot"->>'submittedAt')::timestamp IS DISTINCT FROM sub."submittedAt" THEN
       RAISE EXCEPTION 'Workflow request must bind exact native revision and fixed Director policy' USING ERRCODE='23514'; END IF;
    END IF;
    RETURN NEW;
   END IF;
  ELSE
    SELECT * INTO STRICT r FROM "ApprovalRequest" WHERE id=NEW."requestId" FOR UPDATE;
    IF r."subjectType"::text='WORKFLOW_DRAFT_REVISION' THEN
      IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Workflow approval evidence and decisions are immutable' USING ERRCODE='23514'; END IF;
      SELECT * INTO STRICT sub FROM "WorkflowPublicationSubmission" WHERE "approvalRequestId"=r.id;
      SELECT * INTO STRICT dr FROM "WorkflowDraftRevision" WHERE id=sub."draftRevisionId";
      IF TG_TABLE_NAME='ApprovalStep' THEN
        IF r.state<>'PENDING' OR r.revision<>0 OR NEW.position<>1 OR NEW.eligibility<>'DIRECTOR' THEN
         RAISE EXCEPTION 'Workflow publication requires the fixed Director step' USING ERRCODE='23514'; END IF;
      ELSIF TG_TABLE_NAME='ApprovalEvidence' THEN
        RAISE EXCEPTION 'Configuration approvals cannot fabricate file evidence' USING ERRCODE='23514';
      ELSIF TG_TABLE_NAME='ApprovalDecision' THEN
        SELECT * INTO STRICT st FROM "ApprovalStep" WHERE id=NEW."stepId" AND "requestId"=r.id;
        IF r.state<>'PENDING' OR r.revision<>NEW."expectedRevision" OR r."currentStep"<>st.position OR st.eligibility<>'DIRECTOR' OR
         NEW."evidenceHash"<>r."evidenceHash" OR NEW."nativeEventId" IS NOT NULL OR NEW."actorRole"<>'DIRECTOR' OR
         NEW."actorId" IS DISTINCT FROM current_setting('flux.approval_actor',true) OR NEW."actorId" IS DISTINCT FROM current_setting('flux.publication_actor',true) OR
         NEW."sessionId" IS DISTINCT FROM current_setting('flux.approval_session',true) OR NEW."sessionId" IS DISTINCT FROM current_setting('flux.publication_session',true) OR
         r.id IS DISTINCT FROM current_setting('flux.publication_request',true) OR
         NOT flux_workflow_actor_current(NEW."actorId",NEW."actorRole",NEW."actorVersion",NEW."sessionId") OR
         dr.revision<>(SELECT "currentRevision" FROM "WorkflowDraft" WHERE id=sub."workflowId") THEN
         RAISE EXCEPTION 'Current Director must explicitly decide the exact pending revision' USING ERRCODE='23514'; END IF;
        IF NEW.outcome='APPROVE' AND NOT EXISTS(SELECT 1 FROM "UserAuthorization" WHERE "userId"=sub."submittedById" AND
         "accountStatus"='ACTIVE' AND "businessRole"::text=sub."actorRole" AND "authorizationVersion"=sub."actorVersion") THEN
         RAISE EXCEPTION 'Submitter authority changed; a fresh submission is required' USING ERRCODE='23514'; END IF;
      ELSIF TG_TABLE_NAME='ApprovalEvent' THEN
        IF NEW."externalActorEmail" IS NOT NULL OR NEW."nativeEventId" IS NOT NULL THEN RAISE EXCEPTION 'No fabricated native document event' USING ERRCODE='23514'; END IF;
        IF NEW.action='REQUESTED' THEN
          IF NEW."actorId" IS DISTINCT FROM sub."submittedById" OR NEW."createdAt"<>sub."submittedAt" OR r.state<>'PENDING' OR r.revision<>0 OR
           NEW.details IS DISTINCT FROM jsonb_build_object('configurationHash',sub."configurationHash",'draftRevisionId',dr.id) THEN
           RAISE EXCEPTION 'Submission audit must match native request' USING ERRCODE='23514'; END IF;
        ELSIF NEW.action='DECIDED' THEN
          SELECT * INTO STRICT d FROM "ApprovalDecision" WHERE id=NEW."decisionId" AND "requestId"=r.id;
          IF NEW."actorId" IS DISTINCT FROM d."actorId" OR NEW."createdAt"<>d."decidedAt" OR
           NEW.details IS DISTINCT FROM jsonb_build_object('outcome',d.outcome,'reason',d.reason,'revision',d."expectedRevision"+1,'evidenceHash',d."evidenceHash") THEN
           RAISE EXCEPTION 'Decision audit must retain exact actor reason and evidence' USING ERRCODE='23514'; END IF;
        ELSIF NEW.action='SUPERSEDED' THEN
          SELECT * INTO STRICT newer FROM "WorkflowDraftRevision" WHERE id=NEW.details->>'supersedingRevisionId';
          IF r.state<>'SUPERSEDED' OR newer."workflowId"<>sub."workflowId" OR newer.revision<=dr.revision OR
           NEW."actorId" IS DISTINCT FROM newer."actorId" OR NEW."createdAt"<>newer."createdAt" OR
           NEW.details IS DISTINCT FROM jsonb_build_object('supersedingRevisionId',newer.id) THEN
           RAISE EXCEPTION 'Supersession audit must retain exact newer revision' USING ERRCODE='23514'; END IF;
        ELSE RAISE EXCEPTION 'Unsupported workflow approval event' USING ERRCODE='23514'; END IF;
      END IF;
      RETURN NEW;
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'ApprovalRequest' THEN
    IF TG_OP = 'UPDATE' THEN
      IF OLD.state <> 'PENDING' OR NEW.revision <> OLD.revision + 1 OR
        (to_jsonb(NEW) - ARRAY['state','revision','currentStep','supersededAt','supersessionReason']) IS DISTINCT FROM
        (to_jsonb(OLD) - ARRAY['state','revision','currentStep','supersededAt','supersessionReason']) THEN
        RAISE EXCEPTION 'Approval request identity and snapshots are immutable' USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END IF;
    SELECT * INTO STRICT s FROM "CompletionDocumentSubmission" WHERE id = NEW."completionSubmissionId";
    SELECT * INTO STRICT e FROM "CompletionDocumentEvent" WHERE id = NEW."submissionEventId";
    SELECT fv.* INTO v FROM "SharedFileReference" ref JOIN "SharedFileVersion" fv ON fv.id = ref."versionId"
      WHERE ref."completionSubmissionId" = s.id AND ref.role = 'SOURCE';
    IF s.status <> 'SUBMITTED' OR v.id IS NULL OR v.status <> 'READY' OR NEW.state <> 'PENDING' OR NEW.revision <> 0 OR NEW."currentStep" <> 1 OR
      NEW."subjectVersion" <> v.id OR NEW."projectId" <> s."projectId" OR
      NEW."requestedById" IS DISTINCT FROM s."submittedById" OR NEW."externalRequesterEmail" IS DISTINCT FROM s."externalSubmitterEmail" OR
      e.action <> 'DOCUMENT_SUBMITTED' OR e."submissionId" IS DISTINCT FROM s.id OR e."actorId" IS DISTINCT FROM s."submittedById" OR
      e."externalActorEmail" IS DISTINCT FROM s."externalSubmitterEmail" OR NEW."requestedAt" <> e."createdAt" OR
      NEW."subjectSnapshot"->>'submissionId' IS DISTINCT FROM s.id OR NEW."subjectSnapshot"->>'workflowId' IS DISTINCT FROM s."workflowId" OR
      NEW."subjectSnapshot"->>'projectId' IS DISTINCT FROM s."projectId" OR NEW."subjectSnapshot"->>'type' IS DISTINCT FROM s.type::text OR
      NEW."subjectSnapshot"->>'sourceEvidenceHash' IS DISTINCT FROM s."evidenceHash" OR
      (NEW."subjectSnapshot"->>'requestTime')::timestamp IS DISTINCT FROM s."requestTime" OR
      NEW."policySnapshot"->>'key' IS DISTINCT FROM NEW."policyKey" THEN
      RAISE EXCEPTION 'Approval request must bind the exact native submitted version' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'Approval evidence decisions steps and events are immutable' USING ERRCODE = '23514'; END IF;
  SELECT * INTO STRICT r FROM "ApprovalRequest" WHERE id = NEW."requestId" FOR UPDATE;
  IF TG_TABLE_NAME IN ('ApprovalStep','ApprovalEvidence') AND (r.state <> 'PENDING' OR r.revision <> 0) THEN
    RAISE EXCEPTION 'Approval configuration is sealed at request creation' USING ERRCODE = '23514'; END IF;
  IF TG_TABLE_NAME = 'ApprovalStep' THEN
    IF (r."policySnapshot"->'steps'->>(NEW.position - 1)) IS DISTINCT FROM NEW.eligibility::text THEN
      RAISE EXCEPTION 'Approval step differs from immutable policy snapshot' USING ERRCODE = '23514'; END IF;
  ELSIF TG_TABLE_NAME = 'ApprovalEvidence' THEN
    SELECT * INTO STRICT v FROM "SharedFileVersion" WHERE id = NEW."fileVersionId";
    IF v.status <> 'READY' OR NEW."fileVersionId" <> r."subjectVersion" OR NOT EXISTS (
      SELECT 1 FROM "SharedFileReference" WHERE "completionSubmissionId" = r."completionSubmissionId" AND "versionId" = v.id AND role = 'SOURCE') OR
      NEW.snapshot->>'id' IS DISTINCT FROM v.id OR NEW.snapshot->>'fileId' IS DISTINCT FROM v."fileId" OR
      (NEW.snapshot->>'number')::int IS DISTINCT FROM v.number OR NEW.snapshot->>'status' IS DISTINCT FROM v.status::text OR
      NEW.snapshot->>'bucket' IS DISTINCT FROM v.bucket OR NEW.snapshot->>'storageKey' IS DISTINCT FROM v."storageKey" OR
      NEW.snapshot->>'objectETag' IS DISTINCT FROM v."objectETag" OR NEW.snapshot->>'objectVersionId' IS DISTINCT FROM v."objectVersionId" OR
      NEW.snapshot->>'checksumSha256' IS DISTINCT FROM v."checksumSha256" OR NEW.snapshot->>'checksumEvidence' IS DISTINCT FROM v."checksumEvidence"::text OR
      (NEW.snapshot->>'fileSize')::int IS DISTINCT FROM v."fileSize" OR NEW.snapshot->>'mimeType' IS DISTINCT FROM v."mimeType" OR
      NEW.snapshot->>'uploadedById' IS DISTINCT FROM v."uploadedById" OR NEW.snapshot->>'externalUploaderEmail' IS DISTINCT FROM v."externalUploaderEmail" THEN
      RAISE EXCEPTION 'Approval evidence must retain the exact submitted file version and observed integrity' USING ERRCODE = '23514'; END IF;
  ELSIF TG_TABLE_NAME = 'ApprovalDecision' THEN
    SELECT * INTO STRICT st FROM "ApprovalStep" WHERE id = NEW."stepId" AND "requestId" = r.id;
    SELECT a.* INTO auth FROM "UserAuthorization" a WHERE "userId" = NEW."actorId";
    IF r.state <> 'PENDING' OR r.revision <> NEW."expectedRevision" OR r."currentStep" <> st.position OR
      NEW."evidenceHash" <> r."evidenceHash" OR (r."expiresAt" IS NOT NULL AND r."expiresAt" <= (clock_timestamp() AT TIME ZONE 'UTC')) OR
      NEW."actorId" IS DISTINCT FROM nullif(current_setting('flux.approval_actor',true),'') OR
      NEW."sessionId" IS DISTINCT FROM nullif(current_setting('flux.approval_session',true),'') OR
      auth."accountStatus" IS DISTINCT FROM 'ACTIVE' OR auth."businessRole"::text IS DISTINCT FROM NEW."actorRole" OR
      auth."authorizationVersion" IS DISTINCT FROM NEW."actorVersion" OR
      NOT EXISTS (SELECT 1 FROM "Session" WHERE id = NEW."sessionId" AND "userId" = NEW."actorId" AND "expiresAt" > (clock_timestamp() AT TIME ZONE 'UTC')
        AND token LIKE 'v2.' || NEW."actorVersion"::text || '.%') OR
      (st.eligibility = 'DIRECTOR' AND NEW."actorRole" <> 'DIRECTOR') OR
      (NEW."actorRole" <> 'DIRECTOR' AND NOT EXISTS (SELECT 1 FROM "Project" p WHERE p.id = r."projectId" AND
        (p."ownerId" = NEW."actorId" OR EXISTS (SELECT 1 FROM "ProjectCoOwner" co WHERE co."projectId" = p.id AND co."userId" = NEW."actorId")))) THEN
      RAISE EXCEPTION 'Approval decision requires current authorized actor ordered step and revision' USING ERRCODE = '23514'; END IF;
    SELECT count(*) INTO step_count FROM "ApprovalStep" WHERE "requestId" = r.id;
    IF (NEW.outcome = 'REJECT' OR st.position = step_count) IS DISTINCT FROM (NEW."nativeEventId" IS NOT NULL) THEN
      RAISE EXCEPTION 'Terminal approval decision requires a native decision event' USING ERRCODE = '23514'; END IF;
  ELSIF TG_TABLE_NAME = 'ApprovalEvent' THEN
    IF NEW.action = 'DECIDED' THEN
      SELECT * INTO STRICT d FROM "ApprovalDecision" WHERE id = NEW."decisionId" AND "requestId" = r.id;
      IF NEW."actorId" IS DISTINCT FROM d."actorId" OR NEW."externalActorEmail" IS NOT NULL OR NEW."nativeEventId" IS DISTINCT FROM d."nativeEventId" THEN
        RAISE EXCEPTION 'Approval audit actor must match decision' USING ERRCODE = '23514'; END IF;
    ELSE
      SELECT * INTO STRICT e FROM "CompletionDocumentEvent" WHERE id = NEW."nativeEventId";
      IF e."projectId" <> r."projectId" OR NEW."actorId" IS DISTINCT FROM e."actorId" OR NEW."externalActorEmail" IS DISTINCT FROM e."externalActorEmail" OR
        (NEW.action = 'REQUESTED' AND e.id <> r."submissionEventId") OR
        (NEW.action = 'SUPERSEDED' AND (r.state <> 'SUPERSEDED' OR e.action NOT IN ('configureProjectCompletionWorkflow','prepareAuthorityApprovalRequest','prepareCopyrightTransferRequest','requestProjectFinalInvoice','markProjectInvoiceNotRequired','DOCUMENT_REVISION_REQUESTED'))) OR
        (NEW.action = 'STALE_REJECTED' AND (r.state <> 'SUPERSEDED' OR e.action <> 'DOCUMENT_REJECTED' OR e."submissionId" IS DISTINCT FROM r."completionSubmissionId")) THEN
        RAISE EXCEPTION 'Approval audit must retain real native event attribution' USING ERRCODE = '23514'; END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION flux_approval_consistency_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE rid text; r "ApprovalRequest"; s "CompletionDocumentSubmission"; last_decision record;
  step_count int; decision_count int; rejected_count int; expected_state text; native_state text;
BEGIN
  IF TG_TABLE_NAME = 'ApprovalRequest' THEN rid := NEW.id;
  ELSIF TG_TABLE_NAME = 'CompletionDocumentSubmission' THEN SELECT id INTO rid FROM "ApprovalRequest" WHERE "completionSubmissionId" = NEW.id;
  ELSE rid := NEW."requestId"; END IF;
  IF rid IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO STRICT r FROM "ApprovalRequest" WHERE id = rid;
  IF r."subjectType"::text='RUNTIME_STAGE' THEN PERFORM flux_runtime_approval_consistency(rid); RETURN NULL; END IF;
  IF r."subjectType"::text='WORKFLOW_DRAFT_REVISION' THEN PERFORM flux_workflow_approval_consistency(rid); RETURN NULL; END IF;
  SELECT * INTO STRICT s FROM "CompletionDocumentSubmission" WHERE id = r."completionSubmissionId";
  SELECT count(*) INTO step_count FROM "ApprovalStep" WHERE "requestId" = rid;
  SELECT count(*),count(*) FILTER (WHERE outcome = 'REJECT') INTO decision_count,rejected_count FROM "ApprovalDecision" WHERE "requestId" = rid;
  IF step_count NOT BETWEEN 1 AND 8 OR step_count <> jsonb_array_length(r."policySnapshot"->'steps') OR
    (SELECT max(position) FROM "ApprovalStep" WHERE "requestId" = rid) <> step_count OR
    (SELECT count(*) FROM "ApprovalEvidence" WHERE "requestId" = rid AND "fileVersionId" = r."subjectVersion") <> 1 OR
    (SELECT count(*) FROM "ApprovalEvent" WHERE "requestId" = rid AND action = 'REQUESTED') <> 1 OR
    (SELECT count(*) FROM "ApprovalEvent" WHERE "requestId" = rid AND action = 'DECIDED') <> decision_count OR
    EXISTS (SELECT 1 FROM "ApprovalDecision" d JOIN "ApprovalStep" st ON st.id = d."stepId"
      WHERE d."requestId" = rid AND st.position <> d."expectedRevision" + 1) THEN
    RAISE EXCEPTION 'Approval request requires complete immutable steps evidence and audit' USING ERRCODE = '23514'; END IF;
  IF decision_count > 0 THEN
    SELECT d.*,st.position INTO last_decision FROM "ApprovalDecision" d JOIN "ApprovalStep" st ON st.id=d."stepId" WHERE d."requestId" = rid ORDER BY st.position DESC LIMIT 1;
    IF last_decision.position <> decision_count OR rejected_count > 1 OR (rejected_count = 1 AND last_decision.outcome <> 'REJECT') THEN
      RAISE EXCEPTION 'Approval decisions must follow their configured order' USING ERRCODE = '23514'; END IF;
  END IF;
  IF r.state = 'SUPERSEDED' THEN
    IF decision_count >= step_count OR rejected_count <> 0 OR r.revision <> decision_count + 1 OR r."currentStep" <> decision_count + 1 OR
      s.status NOT IN ('SUBMITTED','REJECTED') OR (SELECT count(*) FROM "ApprovalEvent" WHERE "requestId" = rid AND action = 'SUPERSEDED') <> 1 OR
      (s.status = 'REJECTED' AND NOT EXISTS (SELECT 1 FROM "ApprovalEvent" a JOIN "CompletionDocumentEvent" e ON e.id=a."nativeEventId"
        WHERE a."requestId"=rid AND a.action='STALE_REJECTED' AND e."submissionId"=s.id AND e."actorId"=s."reviewedById")) THEN
      RAISE EXCEPTION 'Superseded approval cannot be decided or lose native history' USING ERRCODE = '23514'; END IF;
    RETURN NULL;
  END IF;
  expected_state := CASE WHEN rejected_count = 1 THEN 'REJECTED' WHEN decision_count = step_count THEN 'APPROVED' ELSE 'PENDING' END;
  native_state := CASE expected_state WHEN 'APPROVED' THEN 'ACCEPTED' WHEN 'REJECTED' THEN 'REJECTED' ELSE 'SUBMITTED' END;
  IF r.state::text <> expected_state OR r.revision <> decision_count OR
    r."currentStep" <> (CASE WHEN expected_state='PENDING' THEN decision_count+1 ELSE decision_count END) OR s.status::text <> native_state THEN
    RAISE EXCEPTION 'Approval and native submission states must commit consistently' USING ERRCODE = '23514'; END IF;
  IF expected_state <> 'PENDING' THEN
    IF s."reviewedById" IS DISTINCT FROM last_decision."actorId" OR s."reviewedAt" IS DISTINCT FROM last_decision."decidedAt" OR
      s."reviewReason" IS DISTINCT FROM last_decision.reason OR NOT EXISTS (
        SELECT 1 FROM "CompletionDocumentEvent" e WHERE e.id=last_decision."nativeEventId" AND e."submissionId"=s.id AND
          e."actorId"=last_decision."actorId" AND e.action='DOCUMENT_' || native_state) THEN
      RAISE EXCEPTION 'Native and reusable approval decisions must retain the same actual actor and evidence' USING ERRCODE = '23514'; END IF;
    IF expected_state='APPROVED' AND NOT EXISTS (SELECT 1 FROM "ProjectCompletionDocument" WHERE "submissionId"=s.id) THEN
      RAISE EXCEPTION 'Approved completion evidence requires its native accepted document' USING ERRCODE = '23514'; END IF;
  END IF;
  RETURN NULL;
END $$;
ALTER TABLE "BusinessEvent" DROP CONSTRAINT "BusinessEvent_contract_check";
ALTER TABLE "BusinessEvent" ADD CONSTRAINT "BusinessEvent_contract_check" CHECK (
 "schemaVersion"=1 AND sequence>0 AND "actorVersion">0 AND jsonb_typeof(payload)='object' AND (
 (type::text='RUNTIME_ACTIVITY' AND "aggregateType"='RUNTIME_PROJECT' AND operation='runtimeStageCommand' AND "actorRole" IN ('DIRECTOR','SENIOR_PROJECT_MANAGER','JUNIOR_PROJECT_MANAGER') AND num_nonnulls("projectId","flexibleProjectId","taskId","taskEntryId","decisionId","nativeEventId","approvalEvidenceId","fileVersionId")=0) OR (type::text='COMPLETION_DOCUMENT_REVIEW_DECIDED' AND "aggregateType"='COMPLETION_DOCUMENT_SUBMISSION' AND
 "actorRole" IN ('DIRECTOR','SENIOR_PROJECT_MANAGER','JUNIOR_PROJECT_MANAGER') AND operation='reviewCompletionDocument' AND
 "projectId" IS NOT NULL AND "decisionId" IS NOT NULL AND "nativeEventId" IS NOT NULL AND "approvalEvidenceId" IS NOT NULL AND "fileVersionId" IS NOT NULL AND "taskId" IS NULL AND "taskEntryId" IS NULL AND "flexibleProjectId" IS NULL)
 OR (type::text='TASK_ACTIVITY' AND "aggregateType"='UNIVERSAL_TASK' AND operation IN ('generalTaskCommand','deliverableTaskCommand','conceptTaskCommand') AND
 "actorRole" IN ('DIRECTOR','SENIOR_PROJECT_MANAGER','JUNIOR_PROJECT_MANAGER','DESIGNER','DIGITAL_LEAD') AND
 num_nonnulls("projectId","flexibleProjectId")=1 AND "taskId" IS NOT NULL AND "taskEntryId" IS NOT NULL AND
 "decisionId" IS NULL AND "nativeEventId" IS NULL AND "approvalEvidenceId" IS NULL AND "fileVersionId" IS NULL)
 OR (type::text='WORKFLOW_DRAFT_REVISED' AND "aggregateType"='WORKFLOW_DRAFT' AND operation='draftWorkflowCommand' AND
 "actorRole" IN ('DIRECTOR','SENIOR_PROJECT_MANAGER') AND num_nonnulls("projectId","flexibleProjectId","taskId","taskEntryId","decisionId","nativeEventId","approvalEvidenceId","fileVersionId")=0) OR (type::text IN ('WORKFLOW_PUBLICATION_SUBMITTED','WORKFLOW_PUBLICATION_SUPERSEDED','WORKFLOW_PUBLICATION_DECIDED','WORKFLOW_VERSION_PUBLISHED') AND
 "aggregateType"='WORKFLOW_PUBLICATION_REQUEST' AND operation='workflowPublicationCommand' AND
 "actorRole" IN ('DIRECTOR','SENIOR_PROJECT_MANAGER') AND num_nonnulls("projectId","flexibleProjectId","taskId","taskEntryId","decisionId","nativeEventId","approvalEvidenceId","fileVersionId")=0)));
CREATE OR REPLACE FUNCTION flux_event_write_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE runtime_row "RuntimeActivity"; dr "WorkflowDraftRevision"; te "UniversalTaskEntry"; tt "UniversalTask"; d "ApprovalDecision"; r "ApprovalRequest"; e "ApprovalEvidence"; v "SharedFileVersion"; o "EventOutbox"; pv "PublishedWorkflowVersion"; audit "WorkflowPublicationAudit"; ae "ApprovalEvent"; sub "WorkflowPublicationSubmission";
 expected_id text; expected_request text; expected_actor text; expected_role text; expected_version int; expected_time timestamp;
 expected_sequence int; expected_payload jsonb; expected_type text; expected_action text;
BEGIN
  IF TG_OP IN ('DELETE','TRUNCATE') OR (TG_OP='UPDATE' AND TG_TABLE_NAME<>'EventOutbox') THEN
    RAISE EXCEPTION 'Shared event history is retained and immutable' USING ERRCODE='23514'; END IF;
  IF TG_TABLE_NAME='BusinessEvent' THEN
    IF NEW.type::text='RUNTIME_ACTIVITY' THEN
     SELECT * INTO STRICT runtime_row FROM "RuntimeActivity" WHERE id=NEW."causationId";
     IF pg_trigger_depth()<>2 OR NEW.id<>runtime_row."eventId" OR NEW."idempotencyKey"<>NEW.id OR NEW."aggregateId"<>runtime_row."projectId" OR NEW."correlationId"<>runtime_row."projectId" OR NEW.sequence<>runtime_row.sequence OR NEW."actorId"<>runtime_row."actorId" OR NEW."actorRole"<>runtime_row."actorRole" OR NEW."actorVersion"<>runtime_row."actorVersion" OR NEW."occurredAt"<>runtime_row."createdAt" OR NEW.payload IS DISTINCT FROM jsonb_build_object('action',runtime_row.action,'stageId',runtime_row."stageId") THEN RAISE EXCEPTION 'Exact native runtime event required' USING ERRCODE='23514'; END IF;
     RETURN NEW;
    END IF;
    IF NEW.type::text IN ('WORKFLOW_PUBLICATION_SUBMITTED','WORKFLOW_PUBLICATION_SUPERSEDED','WORKFLOW_PUBLICATION_DECIDED','WORKFLOW_VERSION_PUBLISHED') THEN
     IF NEW.type::text='WORKFLOW_VERSION_PUBLISHED' THEN
      SELECT * INTO STRICT pv FROM "PublishedWorkflowVersion" WHERE id=NEW."causationId";
      SELECT * INTO STRICT d FROM "ApprovalDecision" WHERE id=pv."approvalDecisionId";
      expected_id:=pv."eventId"; expected_request:=pv."approvalRequestId"; expected_actor:=d."actorId"; expected_role:=d."actorRole"; expected_version:=d."actorVersion";
      expected_time:=pv."publishedAt"; expected_sequence:=3;
      expected_payload:=jsonb_build_object('action','PUBLISHED','workflowId',pv."workflowId",'draftRevisionId',pv."draftRevisionId",'configurationHash',pv."configurationHash",'requestId',expected_request,'versionId',pv.id,'versionNumber',pv.number);
     ELSE
      SELECT * INTO STRICT audit FROM "WorkflowPublicationAudit" WHERE id=NEW."causationId";
      SELECT * INTO STRICT ae FROM "ApprovalEvent" WHERE id=audit.id;
      SELECT * INTO STRICT sub FROM "WorkflowPublicationSubmission" WHERE "approvalRequestId"=ae."requestId";
      expected_id:=audit."eventId"; expected_request:=ae."requestId"; expected_actor:=ae."actorId"; expected_role:=audit."actorRole"; expected_version:=audit."actorVersion";
      expected_time:=ae."createdAt"; expected_sequence:=CASE ae.action WHEN 'REQUESTED' THEN 1 ELSE 2 END;
      IF ae.action='REQUESTED' THEN expected_type:='WORKFLOW_PUBLICATION_SUBMITTED'; expected_action:='SUBMITTED';
      ELSIF ae.action='SUPERSEDED' THEN expected_type:='WORKFLOW_PUBLICATION_SUPERSEDED'; expected_action:='SUPERSEDED';
      ELSE SELECT * INTO STRICT d FROM "ApprovalDecision" WHERE id=ae."decisionId"; expected_type:='WORKFLOW_PUBLICATION_DECIDED'; expected_action:=d.outcome::text; END IF;
      IF NEW.type::text<>expected_type THEN RAISE EXCEPTION 'Exact typed publication event required' USING ERRCODE='23514'; END IF;
      expected_payload:=jsonb_build_object('action',expected_action,'workflowId',sub."workflowId",'draftRevisionId',sub."draftRevisionId",'configurationHash',sub."configurationHash",'requestId',expected_request);
     END IF;
     IF (pg_trigger_depth()<>2 AND NOT (NEW.type::text='WORKFLOW_PUBLICATION_SUPERSEDED' AND pg_trigger_depth()=3)) OR
      NEW.id IS DISTINCT FROM expected_id OR NEW."idempotencyKey"<>NEW.id OR NEW."aggregateId"<>expected_request OR NEW."correlationId"<>expected_request OR
      NEW.sequence<>expected_sequence OR NEW."actorId"<>expected_actor OR NEW."actorRole"<>expected_role OR NEW."actorVersion"<>expected_version OR
      NEW."occurredAt"<>expected_time OR NEW.payload IS DISTINCT FROM expected_payload THEN
      RAISE EXCEPTION 'Exact native workflow approval or publication event required' USING ERRCODE='23514'; END IF;
     RETURN NEW;
    END IF;

    IF NEW.type::text='WORKFLOW_DRAFT_REVISED' THEN
     SELECT * INTO STRICT dr FROM "WorkflowDraftRevision" WHERE id=NEW."causationId";
     IF pg_trigger_depth()<>2 OR NEW.id IS DISTINCT FROM dr."eventId" OR NEW."idempotencyKey"<>NEW.id OR
      NEW."aggregateId"<>dr."workflowId" OR NEW.sequence<>dr.revision OR NEW."correlationId"<>dr."workflowId" OR
      NEW."actorId"<>dr."actorId" OR NEW."actorRole"<>dr."actorRole" OR NEW."actorVersion"<>dr."actorVersion" OR NEW."occurredAt"<>dr."createdAt" OR
      NEW.payload IS DISTINCT FROM jsonb_build_object('action',dr.action,'configurationHash',dr."configurationHash",'validationStatus',dr."validationStatus") THEN
      RAISE EXCEPTION 'Exact native draft revision event required' USING ERRCODE='23514'; END IF;
     RETURN NEW;
    END IF;
    IF NEW.type::text='TASK_ACTIVITY' THEN
     SELECT * INTO STRICT te FROM "UniversalTaskEntry" WHERE id=NEW."taskEntryId";
     SELECT * INTO STRICT tt FROM "UniversalTask" WHERE id=te."taskId";
     IF NEW.operation IS DISTINCT FROM (CASE WHEN tt.type='GENERAL' THEN 'generalTaskCommand' WHEN tt.type IN ('FILE_UPLOAD','DATA_INPUT') THEN 'deliverableTaskCommand' ELSE 'conceptTaskCommand' END) OR pg_trigger_depth()<>2 OR NEW.id IS DISTINCT FROM 'task:'||te.id OR NEW."idempotencyKey"<>NEW.id OR
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
    IF (pg_trigger_depth()<>2 AND NOT (pg_trigger_depth()=3 AND EXISTS(SELECT 1 FROM "BusinessEvent" WHERE id=NEW."eventId" AND type::text='WORKFLOW_PUBLICATION_SUPERSEDED'))) OR NEW.state<>'PENDING'  OR NEW.attempts<>0 OR NEW."lastErrorCode" IS NOT NULL THEN
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
CREATE OR REPLACE FUNCTION flux_shared_file_reference_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v "SharedFileVersion"; f "SharedFile"; source jsonb; source_project text; source_flexible text;
BEGIN
  IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'File version references are immutable' USING ERRCODE = '23514'; END IF;
  SELECT * INTO STRICT v FROM "SharedFileVersion" WHERE id = NEW."versionId";
  SELECT * INTO STRICT f FROM "SharedFile" WHERE id = v."fileId";
  IF NEW."runtimeSubmissionId" IS NOT NULL THEN
   IF NEW.role<>'SOURCE' OR NOT EXISTS(SELECT 1 FROM "RuntimeFileSubmission" x WHERE x.id=NEW."runtimeSubmissionId" AND x."versionId"=v.id AND x."stageId"=f."runtimeStageId" AND x."submittedById"=v."uploadedById") THEN RAISE EXCEPTION 'Exact runtime file source required' USING ERRCODE='23514'; END IF;
   RETURN NEW;
  END IF;
  IF f."runtimeStageId" IS NOT NULL THEN RAISE EXCEPTION 'Runtime files cannot cross native sources' USING ERRCODE='23514'; END IF;
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
COMMIT;
