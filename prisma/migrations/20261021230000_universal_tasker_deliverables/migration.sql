-- Phase 3.2 candidate; separate development activation approval required.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
-- AlterEnum
ALTER TYPE "ActivityLogAction" ADD VALUE 'TASK_DELIVERABLE_ACCEPTED';

-- CreateTable
CREATE TABLE "UniversalTaskTarget" (
    "taskId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "nativeId" TEXT NOT NULL,
    "inputMode" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "identity" JSONB NOT NULL,
    "identityHash" TEXT NOT NULL,
    "expectedState" JSONB NOT NULL,
    "expectedHash" TEXT NOT NULL,

    CONSTRAINT "UniversalTaskTarget_pkey" PRIMARY KEY ("taskId")
);

-- CreateTable
CREATE TABLE "UniversalTaskApplication" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "requestEntryId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'PREPARED',
    "errorCode" TEXT,
    "acceptedEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UniversalTaskApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UniversalTaskPublication" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "sourceVersionId" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "attachmentId" TEXT,
    "publishedVersionId" TEXT,

    CONSTRAINT "UniversalTaskPublication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UniversalTaskApplication_requestEntryId_key" ON "UniversalTaskApplication"("requestEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "UniversalTaskApplication_acceptedEntryId_key" ON "UniversalTaskApplication"("acceptedEntryId");

-- CreateIndex
CREATE INDEX "UniversalTaskApplication_taskId_idx" ON "UniversalTaskApplication"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "UniversalTaskPublication_storageKey_key" ON "UniversalTaskPublication"("storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "UniversalTaskPublication_attachmentId_key" ON "UniversalTaskPublication"("attachmentId");

-- CreateIndex
CREATE UNIQUE INDEX "UniversalTaskPublication_publishedVersionId_key" ON "UniversalTaskPublication"("publishedVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "UniversalTaskPublication_applicationId_sourceVersionId_key" ON "UniversalTaskPublication"("applicationId", "sourceVersionId");

-- AddForeignKey
ALTER TABLE "UniversalTaskTarget" ADD CONSTRAINT "UniversalTaskTarget_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "UniversalTask"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "UniversalTaskApplication" ADD CONSTRAINT "UniversalTaskApplication_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "UniversalTask"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "UniversalTaskApplication" ADD CONSTRAINT "UniversalTaskApplication_requestEntryId_fkey" FOREIGN KEY ("requestEntryId") REFERENCES "UniversalTaskEntry"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "UniversalTaskApplication" ADD CONSTRAINT "UniversalTaskApplication_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "UniversalTaskApplication" ADD CONSTRAINT "UniversalTaskApplication_acceptedEntryId_fkey" FOREIGN KEY ("acceptedEntryId") REFERENCES "UniversalTaskEntry"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "UniversalTaskPublication" ADD CONSTRAINT "UniversalTaskPublication_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "UniversalTaskApplication"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "UniversalTaskPublication" ADD CONSTRAINT "UniversalTaskPublication_sourceVersionId_fkey" FOREIGN KEY ("sourceVersionId") REFERENCES "SharedFileVersion"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "UniversalTaskPublication" ADD CONSTRAINT "UniversalTaskPublication_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "ProjectAttachment"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "UniversalTaskPublication" ADD CONSTRAINT "UniversalTaskPublication_publishedVersionId_fkey" FOREIGN KEY ("publishedVersionId") REFERENCES "SharedFileVersion"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;


ALTER TABLE "UniversalTask" DROP CONSTRAINT "UniversalTask_values";
ALTER TABLE "UniversalTask" ADD CONSTRAINT "UniversalTask_values" CHECK (
 type IN ('GENERAL','FILE_UPLOAD','DATA_INPUT') AND (type='GENERAL' OR "projectId" IS NOT NULL) AND num_nonnulls("projectId","flexibleProjectId")=1 AND "ownerId"<>"executorId" AND version>0 AND
 length(btrim(title)) BETWEEN 1 AND 200 AND length(btrim(brief)) BETWEEN 1 AND 20000);

ALTER TABLE "UniversalTaskEntry" DROP CONSTRAINT "UniversalTaskEntry_values";
ALTER TABLE "UniversalTaskEntry" ADD CONSTRAINT "UniversalTaskEntry_values" CHECK (
 version>0 AND "actorVersion">0 AND "commandHash" ~ '^[a-f0-9]{64}$' AND length("commandId") BETWEEN 1 AND 128 AND
 action IN ('CREATED','EDIT','MESSAGE','SUBMIT','REQUEST_COMPLETION','APPROVE','REJECT','CLOSE','DELETE','PREPARE_UPLOAD','FINALIZE_UPLOAD','REFRESH_TARGET','PREPARE_APPLICATION','APPLICATION_FAILED') AND
 "actorRole" IN ('DIRECTOR','SENIOR_PROJECT_MANAGER','JUNIOR_PROJECT_MANAGER','DESIGNER','DIGITAL_LEAD') AND
 (action IN ('EDIT','PREPARE_UPLOAD','FINALIZE_UPLOAD') OR length(btrim(text))>0) AND jsonb_typeof(snapshot)='object');

ALTER TABLE "BusinessEvent" DROP CONSTRAINT "BusinessEvent_contract_check";
ALTER TABLE "BusinessEvent" ADD CONSTRAINT "BusinessEvent_contract_check" CHECK (
 "schemaVersion"=1 AND sequence>0 AND "actorVersion">0 AND jsonb_typeof(payload)='object' AND (
 (type::text='COMPLETION_DOCUMENT_REVIEW_DECIDED' AND "aggregateType"='COMPLETION_DOCUMENT_SUBMISSION' AND
 "actorRole" IN ('DIRECTOR','SENIOR_PROJECT_MANAGER','JUNIOR_PROJECT_MANAGER') AND operation='reviewCompletionDocument' AND
 "projectId" IS NOT NULL AND "decisionId" IS NOT NULL AND "nativeEventId" IS NOT NULL AND "approvalEvidenceId" IS NOT NULL AND "fileVersionId" IS NOT NULL AND "taskId" IS NULL AND "taskEntryId" IS NULL AND "flexibleProjectId" IS NULL)
 OR (type::text='TASK_ACTIVITY' AND "aggregateType"='UNIVERSAL_TASK' AND operation IN ('generalTaskCommand','deliverableTaskCommand') AND
 "actorRole" IN ('DIRECTOR','SENIOR_PROJECT_MANAGER','JUNIOR_PROJECT_MANAGER','DESIGNER','DIGITAL_LEAD') AND
 num_nonnulls("projectId","flexibleProjectId")=1 AND "taskId" IS NOT NULL AND "taskEntryId" IS NOT NULL AND
 "decisionId" IS NULL AND "nativeEventId" IS NULL AND "approvalEvidenceId" IS NULL AND "fileVersionId" IS NULL)));

CREATE OR REPLACE FUNCTION flux_task_guard() RETURNS trigger LANGUAGE plpgsql AS $$
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
   (NEW.action IN ('CREATED','EDIT','APPROVE','REJECT','CLOSE','DELETE','REFRESH_TARGET','PREPARE_APPLICATION','APPLICATION_FAILED') AND a."userId"<>t."ownerId") OR
   (NEW.action IN ('SUBMIT','REQUEST_COMPLETION') AND a."userId"<>t."executorId") OR
   (NEW.action IN ('MESSAGE','PREPARE_UPLOAD','FINALIZE_UPLOAD') AND a."userId" NOT IN (t."ownerId",t."executorId"))) THEN
   RAISE EXCEPTION 'Task relationship required' USING ERRCODE='23514'; END IF;
  IF (NEW.action='REQUEST_COMPLETION' AND t.status<>'COMPLETION_REQUESTED') OR (NEW.action='APPROVE' AND t.status<>'COMPLETED') OR
   (NEW.action='CLOSE' AND t.status<>'CLOSED') OR (NEW.action='DELETE' AND t."deletedAt" IS NULL) OR
   (NEW.action IN ('SUBMIT','REJECT') AND t.status<>'IN_PROGRESS') THEN RAISE EXCEPTION 'Task outcome mismatch' USING ERRCODE='23514'; END IF;
  IF NEW.action='REFRESH_TARGET' AND (t.type<>'DATA_INPUT' OR t.status<>'IN_PROGRESS') THEN RAISE EXCEPTION 'Invalid target refresh' USING ERRCODE='23514'; END IF;
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

CREATE OR REPLACE FUNCTION flux_emit_task_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE t "UniversalTask"; eid text;
BEGIN
 SELECT * INTO STRICT t FROM "UniversalTask" WHERE id=NEW."taskId";
 eid:='task:'||NEW.id;
 INSERT INTO "BusinessEvent" (id,type,"schemaVersion","aggregateType","aggregateId",sequence,"projectId","flexibleProjectId","taskId","taskEntryId","actorId","actorRole","actorVersion",operation,"correlationId","causationId","idempotencyKey","occurredAt",payload)
 VALUES (eid,'TASK_ACTIVITY',1,'UNIVERSAL_TASK',t.id,NEW.version,t."projectId",t."flexibleProjectId",t.id,NEW.id,NEW."actorId",NEW."actorRole",NEW."actorVersion",CASE WHEN t.type='GENERAL' THEN 'generalTaskCommand' ELSE 'deliverableTaskCommand' END,t.id,NEW.id,eid,NEW."createdAt",
 jsonb_build_object('action',NEW.action,'status',t.status,'directorOverride',NEW."directorOverride"));
 INSERT INTO "EventOutbox" ("eventId","consumerKey") VALUES (eid,'internal.audit.v1');
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION flux_shared_file_provenance_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'File provenance is immutable' USING ERRCODE = '23514'; END IF;
  IF NEW."taskEntryId" IS NOT NULL THEN
   IF EXISTS (SELECT 1 FROM "UniversalTaskApplication" a JOIN "UniversalTaskPublication" p ON p."applicationId"=a.id
     JOIN "UniversalTaskEntry" e ON e.id=a."acceptedEntryId" WHERE a.state='APPLIED' AND e.action='APPROVE' AND e."taskId"=a."taskId"
     AND e.id=NEW."taskEntryId" AND NEW."versionId" IN (p."sourceVersionId",p."publishedVersionId")) THEN RETURN NEW; END IF;
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
     IF NEW.operation IS DISTINCT FROM (CASE WHEN tt.type='GENERAL' THEN 'generalTaskCommand' ELSE 'deliverableTaskCommand' END) OR pg_trigger_depth()<>2 OR NEW.id IS DISTINCT FROM 'task:'||te.id OR NEW."idempotencyKey"<>NEW.id OR
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

ALTER TABLE "UniversalTaskTarget" ADD CONSTRAINT "UniversalTaskTarget_values" CHECK (
 kind IN ('private-folder','research-folder','checklist') AND "inputMode" IN ('TEXT','FILE','TEXT_FILE') AND
 (kind='checklist' OR "inputMode"='FILE') AND "identityHash" ~ '^[a-f0-9]{64}$' AND "expectedHash" ~ '^[a-f0-9]{64}$' AND
 jsonb_typeof(identity)='object' AND jsonb_typeof("expectedState")='object');
ALTER TABLE "UniversalTaskApplication" ADD CONSTRAINT "UniversalTaskApplication_values" CHECK (
 state IN ('PREPARED','FAILED','APPLIED') AND (state='APPLIED')=("acceptedEntryId" IS NOT NULL) AND (state='FAILED')=("errorCode" IS NOT NULL));
ALTER TABLE "UniversalTaskPublication" ADD CONSTRAINT "UniversalTaskPublication_values" CHECK (
 num_nonnulls("attachmentId","publishedVersionId") IN (0,2));
CREATE FUNCTION flux_task_deliverable_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE t "UniversalTask"; a jsonb; app "UniversalTaskApplication"; r "UniversalTaskEntry";
BEGIN
 IF TG_OP IN ('DELETE','TRUNCATE') THEN RAISE EXCEPTION 'Deliverable evidence is retained' USING ERRCODE='23514'; END IF;
 a:=flux_task_actor();
 IF TG_TABLE_NAME='UniversalTaskPublication' THEN
  SELECT * INTO STRICT app FROM "UniversalTaskApplication" WHERE id=NEW."applicationId";
  SELECT * INTO STRICT t FROM "UniversalTask" WHERE id=app."taskId";
 ELSE SELECT * INTO STRICT t FROM "UniversalTask" WHERE id=NEW."taskId"; END IF;
 IF t.type NOT IN ('FILE_UPLOAD','DATA_INPUT') OR t."projectId" IS NULL OR t."deletedAt" IS NOT NULL OR
   (a->>'businessRole'<>'DIRECTOR' AND a->>'userId'<>t."ownerId") THEN RAISE EXCEPTION 'Deliverable owner required' USING ERRCODE='23514'; END IF;
 IF TG_TABLE_NAME='UniversalTaskTarget' THEN
  IF (t.type='DATA_INPUT') IS DISTINCT FROM (NEW.kind='checklist') OR NEW.identity->>'projectId' IS DISTINCT FROM t."projectId" OR
    NEW.identity->>'nativeId' IS DISTINCT FROM NEW."nativeId" THEN RAISE EXCEPTION 'Typed native project target required' USING ERRCODE='23514'; END IF;
  IF TG_OP='UPDATE' AND (t.type<>'DATA_INPUT' OR t.status NOT IN ('OPEN','IN_PROGRESS','COMPLETION_REQUESTED') OR
    (to_jsonb(NEW)-ARRAY['expectedState','expectedHash']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['expectedState','expectedHash'])) THEN
    RAISE EXCEPTION 'Target identity is immutable' USING ERRCODE='23514'; END IF;
 ELSIF TG_TABLE_NAME='UniversalTaskApplication' THEN
  SELECT * INTO STRICT r FROM "UniversalTaskEntry" WHERE id=NEW."requestEntryId";
  IF r."taskId"<>t.id OR r.action<>'REQUEST_COMPLETION' OR r."actorId"=NEW."reviewerId" OR t."executorId"=NEW."reviewerId" OR
   NEW."reviewerId"<>a->>'userId' OR t.status NOT IN ('COMPLETION_REQUESTED','COMPLETED') THEN RAISE EXCEPTION 'Exact independent review required' USING ERRCODE='23514'; END IF;
  IF TG_OP='UPDATE' AND (OLD.state='APPLIED' OR (to_jsonb(NEW)-ARRAY['state','errorCode','acceptedEntryId','updatedAt']) IS DISTINCT FROM
    (to_jsonb(OLD)-ARRAY['state','errorCode','acceptedEntryId','updatedAt'])) THEN RAISE EXCEPTION 'Application identity is immutable' USING ERRCODE='23514'; END IF;
  IF NEW.state='APPLIED' AND NOT EXISTS (SELECT 1 FROM "UniversalTaskEntry" e WHERE e.id=NEW."acceptedEntryId" AND e."taskId"=t.id AND e.action='APPROVE'
    AND e.snapshot->>'requestId'=r.id AND e.snapshot->>'applicationId'=NEW.id AND e."actorId"=NEW."reviewerId") THEN RAISE EXCEPTION 'Atomic accepted application required' USING ERRCODE='23514'; END IF;
 ELSE
  IF app.state='APPLIED' OR app."reviewerId"<>a->>'userId' OR t.status<>'COMPLETION_REQUESTED' OR NOT EXISTS (
    SELECT 1 FROM "UniversalTaskUpload" u JOIN "SharedFileVersion" v ON v.id=u."versionId" JOIN "UniversalTaskEntry" e ON e.id=app."requestEntryId"
    WHERE u."taskId"=t.id AND v.id=NEW."sourceVersionId" AND v.status='READY' AND e.snapshot->'fileVersionIds' ? v.id
    AND e.snapshot->'submissionIds' ? u."submittedEntryId") THEN RAISE EXCEPTION 'Exact eligible publication source required' USING ERRCODE='23514'; END IF;
  IF TG_OP='UPDATE' AND (OLD."attachmentId" IS NOT NULL OR (to_jsonb(NEW)-ARRAY['attachmentId','publishedVersionId']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['attachmentId','publishedVersionId'])) THEN
    RAISE EXCEPTION 'Publication identity is immutable' USING ERRCODE='23514'; END IF;
  IF NEW."attachmentId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "ProjectAttachment" p JOIN "SharedFileVersion" v ON v.id=NEW."publishedVersionId"
    JOIN "SharedFileVersion" source ON source.id=NEW."sourceVersionId" JOIN "SharedFileReference" ref ON ref."projectAttachmentId"=p.id AND ref."versionId"=v.id
    WHERE p.id=NEW."attachmentId" AND p."projectId"=t."projectId" AND p.status='READY' AND v.status='READY' AND p."storageKey"=NEW."storageKey"
    AND p.bucket=NEW.bucket AND v."objectETag"=source."objectETag" AND p."uploadedById"=source."uploadedById" AND p."reviewedById"=app."reviewerId") THEN
    RAISE EXCEPTION 'Ready native publication with exact provenance required' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['UniversalTaskTarget','UniversalTaskApplication','UniversalTaskPublication'] LOOP
 EXECUTE format('CREATE TRIGGER flux_task_deliverable_guard BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION flux_task_deliverable_guard()',t);
 EXECUTE format('CREATE TRIGGER flux_task_deliverable_truncate BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION flux_task_deliverable_guard()',t);
END LOOP; END $$;
CREATE FUNCTION flux_task_deliverable_consistency() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE t "UniversalTask";
BEGIN
 SELECT * INTO STRICT t FROM "UniversalTask" WHERE id=NEW.id;
 IF t.type='GENERAL' THEN RETURN NULL; END IF;
 IF NOT EXISTS (SELECT 1 FROM "UniversalTaskTarget" WHERE "taskId"=t.id) OR
  (t.status='COMPLETED' AND NOT EXISTS (SELECT 1 FROM "UniversalTaskApplication" a JOIN "UniversalTaskEntry" e ON e.id=a."acceptedEntryId"
   WHERE a."taskId"=t.id AND a.state='APPLIED' AND e.action='APPROVE' AND NOT EXISTS (
     SELECT 1 FROM "UniversalTaskPublication" p WHERE p."applicationId"=a.id AND p."attachmentId" IS NULL))) THEN
  RAISE EXCEPTION 'Atomic deliverable target/application required' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER flux_task_deliverable_consistency AFTER INSERT OR UPDATE ON "UniversalTask" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION flux_task_deliverable_consistency();
CREATE FUNCTION flux_task_application_consistency() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a "UniversalTaskApplication"; t "UniversalTask"; e "UniversalTaskEntry";
BEGIN
 IF TG_TABLE_NAME='UniversalTaskTarget' THEN
  SELECT * INTO STRICT t FROM "UniversalTask" WHERE id=NEW."taskId";
  SELECT * INTO STRICT e FROM "UniversalTaskEntry" WHERE "taskId"=t.id AND version=t.version;
  IF TG_OP='UPDATE' AND (e.action<>'REFRESH_TARGET' OR e.snapshot->'refreshed' IS DISTINCT FROM NEW."expectedState") THEN
   RAISE EXCEPTION 'Target refresh requires atomic native history' USING ERRCODE='23514'; END IF;
  RETURN NULL;
 END IF;
 IF TG_TABLE_NAME='UniversalTaskApplication' THEN
  SELECT * INTO STRICT a FROM "UniversalTaskApplication" WHERE id=NEW.id;
 ELSE SELECT * INTO STRICT a FROM "UniversalTaskApplication" WHERE id=NEW."applicationId"; END IF;
 IF NOT EXISTS (SELECT 1 FROM "UniversalTaskEntry" WHERE "taskId"=a."taskId" AND action='PREPARE_APPLICATION' AND snapshot->>'applicationId'=a.id) THEN
  RAISE EXCEPTION 'Durable application requires native history' USING ERRCODE='23514'; END IF;
 IF a.state='APPLIED' THEN
  SELECT * INTO STRICT e FROM "UniversalTaskEntry" WHERE id=a."requestEntryId";
  IF (SELECT count(*) FROM "UniversalTaskPublication" WHERE "applicationId"=a.id AND "attachmentId" IS NOT NULL)<>jsonb_array_length(e.snapshot->'fileVersionIds') OR
   NOT EXISTS (SELECT 1 FROM "ProjectActivityLog" WHERE metadata->>'applicationId'=a.id AND metadata->>'taskEntryId'=a."acceptedEntryId" AND "actorId"=a."reviewerId") THEN
   RAISE EXCEPTION 'Complete publication and native project history required' USING ERRCODE='23514'; END IF;
 ELSIF TG_TABLE_NAME='UniversalTaskPublication' THEN
  IF NEW."attachmentId" IS NOT NULL THEN RAISE EXCEPTION 'Unaccepted publication is forbidden' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NULL;
END $$;
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['UniversalTaskTarget','UniversalTaskApplication','UniversalTaskPublication'] LOOP
 EXECUTE format('CREATE CONSTRAINT TRIGGER flux_task_application_consistency AFTER INSERT OR UPDATE ON %I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION flux_task_application_consistency()',t);
END LOOP; END $$;
COMMIT;
