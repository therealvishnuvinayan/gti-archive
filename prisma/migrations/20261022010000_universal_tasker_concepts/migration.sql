-- Phase 3.3 candidate. Do not apply without separate controlled activation approval.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
-- CreateTable
CREATE TABLE "UniversalTaskReference" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "selectedEntryId" TEXT NOT NULL,
    "sourceUploadId" TEXT,
    "sourceAttachmentId" TEXT,
    "sourceSubmissionId" TEXT,
    "sourceReviewId" TEXT,
    "sourceState" TEXT NOT NULL,

    CONSTRAINT "UniversalTaskReference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UniversalTaskReference_sourceSubmissionId_idx" ON "UniversalTaskReference"("sourceSubmissionId");

-- CreateIndex
CREATE UNIQUE INDEX "UniversalTaskReference_taskId_versionId_key" ON "UniversalTaskReference"("taskId", "versionId");

-- AddForeignKey
ALTER TABLE "UniversalTaskReference" ADD CONSTRAINT "UniversalTaskReference_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "UniversalTask"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "UniversalTaskReference" ADD CONSTRAINT "UniversalTaskReference_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "SharedFileVersion"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "UniversalTaskReference" ADD CONSTRAINT "UniversalTaskReference_selectedEntryId_fkey" FOREIGN KEY ("selectedEntryId") REFERENCES "UniversalTaskEntry"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "UniversalTaskReference" ADD CONSTRAINT "UniversalTaskReference_sourceUploadId_fkey" FOREIGN KEY ("sourceUploadId") REFERENCES "UniversalTaskUpload"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "UniversalTaskReference" ADD CONSTRAINT "UniversalTaskReference_sourceAttachmentId_fkey" FOREIGN KEY ("sourceAttachmentId") REFERENCES "ProjectAttachment"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "UniversalTaskReference" ADD CONSTRAINT "UniversalTaskReference_sourceSubmissionId_fkey" FOREIGN KEY ("sourceSubmissionId") REFERENCES "UniversalTaskEntry"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "UniversalTaskReference" ADD CONSTRAINT "UniversalTaskReference_sourceReviewId_fkey" FOREIGN KEY ("sourceReviewId") REFERENCES "UniversalTaskEntry"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;


CREATE UNIQUE INDEX "UniversalTaskReference_inspection_key" ON "UniversalTaskReference" ("taskId") WHERE kind='INSPECTION';
ALTER TABLE "UniversalTaskReference" ADD CONSTRAINT "UniversalTaskReference_values" CHECK (
 kind IN ('INSPECTION','INSPIRATION') AND num_nonnulls("sourceUploadId","sourceAttachmentId")=1 AND
 ((kind='INSPECTION' AND "sourceSubmissionId" IS NULL AND "sourceReviewId" IS NULL AND "sourceState"='SEALED') OR
  (kind='INSPIRATION' AND "sourceUploadId" IS NOT NULL AND "sourceSubmissionId" IS NOT NULL AND
   "sourceState" IN ('SUBMITTED','APPROVED') AND ("sourceState"='APPROVED')=("sourceReviewId" IS NOT NULL))));
ALTER TABLE "UniversalTask" DROP CONSTRAINT "UniversalTask_values";
ALTER TABLE "UniversalTask" ADD CONSTRAINT "UniversalTask_values" CHECK (
 (type NOT IN ('FILE_UPLOAD','DATA_INPUT') OR "projectId" IS NOT NULL) AND num_nonnulls("projectId","flexibleProjectId")=1 AND "ownerId"<>"executorId" AND version>0 AND
 length(btrim(title)) BETWEEN 1 AND 200 AND length(btrim(brief)) BETWEEN 1 AND 20000);
ALTER TABLE "UniversalTaskEntry" DROP CONSTRAINT "UniversalTaskEntry_values";
ALTER TABLE "UniversalTaskEntry" ADD CONSTRAINT "UniversalTaskEntry_values" CHECK (
 version>0 AND "actorVersion">0 AND "commandHash" ~ '^[a-f0-9]{64}$' AND length("commandId") BETWEEN 1 AND 128 AND
 action IN ('CREATED','EDIT','MESSAGE','SUBMIT','REQUEST_COMPLETION','APPROVE','REJECT','CLOSE','DELETE','PREPARE_UPLOAD','FINALIZE_UPLOAD','REFRESH_TARGET','PREPARE_APPLICATION','APPLICATION_FAILED','SET_SOURCE') AND
 "actorRole" IN ('DIRECTOR','SENIOR_PROJECT_MANAGER','JUNIOR_PROJECT_MANAGER','DESIGNER','DIGITAL_LEAD') AND
 (action IN ('EDIT','PREPARE_UPLOAD','FINALIZE_UPLOAD') OR length(btrim(text))>0) AND jsonb_typeof(snapshot)='object');

ALTER TABLE "BusinessEvent" DROP CONSTRAINT "BusinessEvent_contract_check";
ALTER TABLE "BusinessEvent" ADD CONSTRAINT "BusinessEvent_contract_check" CHECK (
 "schemaVersion"=1 AND sequence>0 AND "actorVersion">0 AND jsonb_typeof(payload)='object' AND (
 (type::text='COMPLETION_DOCUMENT_REVIEW_DECIDED' AND "aggregateType"='COMPLETION_DOCUMENT_SUBMISSION' AND
 "actorRole" IN ('DIRECTOR','SENIOR_PROJECT_MANAGER','JUNIOR_PROJECT_MANAGER') AND operation='reviewCompletionDocument' AND
 "projectId" IS NOT NULL AND "decisionId" IS NOT NULL AND "nativeEventId" IS NOT NULL AND "approvalEvidenceId" IS NOT NULL AND "fileVersionId" IS NOT NULL AND "taskId" IS NULL AND "taskEntryId" IS NULL AND "flexibleProjectId" IS NULL)
 OR (type::text='TASK_ACTIVITY' AND "aggregateType"='UNIVERSAL_TASK' AND operation IN ('generalTaskCommand','deliverableTaskCommand','conceptTaskCommand') AND
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
   IF NEW.type IN ('INSPECT_FILE','INITIAL_CONCEPT','FINAL_CONCEPT') AND a."businessRole" NOT IN ('DIRECTOR','SENIOR_PROJECT_MANAGER','JUNIOR_PROJECT_MANAGER') THEN
    RAISE EXCEPTION 'Concept creation requires a business manager' USING ERRCODE='23514'; END IF;
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
   (NEW.action IN ('CREATED','EDIT','APPROVE','REJECT','CLOSE','DELETE','REFRESH_TARGET','PREPARE_APPLICATION','APPLICATION_FAILED','SET_SOURCE') AND a."userId"<>t."ownerId") OR
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
 VALUES (eid,'TASK_ACTIVITY',1,'UNIVERSAL_TASK',t.id,NEW.version,t."projectId",t."flexibleProjectId",t.id,NEW.id,NEW."actorId",NEW."actorRole",NEW."actorVersion",CASE WHEN t.type='GENERAL' THEN 'generalTaskCommand' WHEN t.type IN ('FILE_UPLOAD','DATA_INPUT') THEN 'deliverableTaskCommand' ELSE 'conceptTaskCommand' END,t.id,NEW.id,eid,NEW."createdAt",
 jsonb_build_object('action',NEW.action,'status',t.status,'directorOverride',NEW."directorOverride"));
 INSERT INTO "EventOutbox" ("eventId","consumerKey") VALUES (eid,'internal.audit.v1');
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
CREATE OR REPLACE FUNCTION flux_task_deliverable_consistency() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE t "UniversalTask";
BEGIN
 SELECT * INTO STRICT t FROM "UniversalTask" WHERE id=NEW.id;
 IF t.type NOT IN ('FILE_UPLOAD','DATA_INPUT') THEN RETURN NULL; END IF;
 IF NOT EXISTS (SELECT 1 FROM "UniversalTaskTarget" WHERE "taskId"=t.id) OR
  (t.status='COMPLETED' AND NOT EXISTS (SELECT 1 FROM "UniversalTaskApplication" a JOIN "UniversalTaskEntry" e ON e.id=a."acceptedEntryId"
   WHERE a."taskId"=t.id AND a.state='APPLIED' AND e.action='APPROVE' AND NOT EXISTS (
     SELECT 1 FROM "UniversalTaskPublication" p WHERE p."applicationId"=a.id AND p."attachmentId" IS NULL))) THEN
  RAISE EXCEPTION 'Atomic deliverable target/application required' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE OR REPLACE FUNCTION flux_shared_file_provenance_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'File provenance is immutable' USING ERRCODE = '23514'; END IF;
  IF NEW."taskEntryId" IS NOT NULL THEN
   IF EXISTS (SELECT 1 FROM "UniversalTaskReference" ref JOIN "UniversalTaskEntry" e ON e.id=ref."selectedEntryId"
    WHERE ref."versionId"=NEW."versionId" AND ref."selectedEntryId"=NEW."taskEntryId" AND e."taskId"=ref."taskId"
    AND e.action IN ('CREATED','SET_SOURCE') AND e.snapshot->'referenceVersionIds' ? NEW."versionId") THEN RETURN NEW; END IF;
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

-- References are native evidence: actor/session, current source eligibility and
-- project context are independently checked. No mutable latest-version pointer.
CREATE FUNCTION flux_task_reference_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE t "UniversalTask"; e "UniversalTaskEntry"; v "SharedFileVersion"; f "SharedFile";
 u "UniversalTaskUpload"; source "UniversalTask"; submission "UniversalTaskEntry"; review "UniversalTaskEntry"; a jsonb;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Task references are immutable and retained' USING ERRCODE='23514'; END IF;
 a:=flux_task_actor();
 SELECT * INTO STRICT t FROM "UniversalTask" WHERE id=NEW."taskId";
 SELECT * INTO STRICT e FROM "UniversalTaskEntry" WHERE id=NEW."selectedEntryId";
 SELECT * INTO STRICT v FROM "SharedFileVersion" WHERE id=NEW."versionId";
 SELECT * INTO STRICT f FROM "SharedFile" WHERE id=v."fileId";
 IF t."deletedAt" IS NOT NULL OR t.status NOT IN ('OPEN','IN_PROGRESS') OR
  (a->>'businessRole'<>'DIRECTOR' AND a->>'userId'<>t."ownerId") OR
  e."taskId"<>t.id OR e.version<>t.version OR e."actorId"<>a->>'userId' OR
  e.action NOT IN ('CREATED','SET_SOURCE') OR NOT (e.snapshot->'referenceVersionIds' ? v.id) OR
  v.status<>'READY' OR v."objectETag" IS NULL OR NOT (v."applicationSealed" OR v."objectVersionId" IS NOT NULL) OR
  f."projectId" IS DISTINCT FROM t."projectId" OR f."flexibleProjectId" IS DISTINCT FROM t."flexibleProjectId" THEN
  RAISE EXCEPTION 'Exact sealed source and atomic authorized selection required' USING ERRCODE='23514'; END IF;
 IF NEW.kind='INSPECTION' THEN
  IF t.type<>'INSPECT_FILE' THEN RAISE EXCEPTION 'Inspection task required' USING ERRCODE='23514'; END IF;
  IF NEW."sourceUploadId" IS NOT NULL THEN
   IF NOT EXISTS (SELECT 1 FROM "UserAuthorization" WHERE "userId"=t."ownerId" AND "accountStatus"='ACTIVE' AND "businessRole" IS NOT NULL) THEN
    RAISE EXCEPTION 'Current source owner authority required' USING ERRCODE='23514'; END IF;
   IF NOT EXISTS (SELECT 1 FROM "UniversalTaskUpload" WHERE id=NEW."sourceUploadId" AND "taskId"=t.id AND "versionId"=v.id AND "uploadedById"=t."ownerId") THEN
    RAISE EXCEPTION 'Real owner source upload required' USING ERRCODE='23514'; END IF;
  ELSE
   IF NOT EXISTS (SELECT 1 FROM "ProjectAttachment" p JOIN "SharedFileReference" r ON r."projectAttachmentId"=p.id
    WHERE p.id=NEW."sourceAttachmentId" AND p."projectId"=t."projectId" AND p.status='READY' AND r."versionId"=v.id AND
    p.bucket=v.bucket AND p."storageKey"=v."storageKey" AND p."fileSize"=v."fileSize" AND p."mimeType"=v."mimeType") THEN
    RAISE EXCEPTION 'Exact native project file required' USING ERRCODE='23514'; END IF;
   -- Genuine source delegation is narrower than project management. Both actual
   -- owner and intervening selector must own the folder (or be Director).
   IF EXISTS (SELECT 1 FROM "UserAuthorization" auth WHERE auth."userId" IN (t."ownerId",a->>'userId') AND
    (auth."accountStatus"<>'ACTIVE' OR auth."businessRole" IS NULL OR (auth."businessRole"<>'DIRECTOR' AND NOT EXISTS (
     SELECT 1 FROM "ProjectAttachment" p JOIN "Project" project ON project.id=p."projectId"
     LEFT JOIN "ProjectPrivateFolder" pf ON pf.id=p."privateFolderId"
     LEFT JOIN "ProjectResearchFolderFile" rf ON rf."attachmentId"=p.id
     LEFT JOIN "ProjectResearchFolder" folder ON folder.id=rf."folderId"
     LEFT JOIN "ProjectResearchWorkspace" workspace ON workspace.id=folder."workspaceId"
     WHERE p.id=NEW."sourceAttachmentId" AND ((pf.id IS NOT NULL AND pf."ownerUserId"=auth."userId") OR (pf.id IS NULL AND workspace."ownerUserId"=project."ownerId" AND auth."businessRole" IN ('SENIOR_PROJECT_MANAGER','JUNIOR_PROJECT_MANAGER') AND (project."ownerId"=auth."userId" OR EXISTS (SELECT 1 FROM "ProjectCoOwner" WHERE "projectId"=project.id AND "userId"=auth."userId")))) AND
      (project."ownerId"=auth."userId" OR EXISTS (SELECT 1 FROM "ProjectCoOwner" WHERE "projectId"=project.id AND "userId"=auth."userId") OR
       EXISTS (SELECT 1 FROM "ProjectExecutor" WHERE "projectId"=project.id AND "userId"=auth."userId"))
    )))) THEN RAISE EXCEPTION 'Current folder delegation authority required' USING ERRCODE='23514'; END IF;
  END IF;
 ELSE
  SELECT * INTO STRICT u FROM "UniversalTaskUpload" WHERE id=NEW."sourceUploadId";
  SELECT * INTO STRICT source FROM "UniversalTask" WHERE id=u."taskId" FOR SHARE;
  SELECT * INTO STRICT submission FROM "UniversalTaskEntry" WHERE id=NEW."sourceSubmissionId";
  IF t.type<>'FINAL_CONCEPT' OR e.action<>'CREATED' OR source.type<>'INITIAL_CONCEPT' OR source."deletedAt" IS NOT NULL OR source.status='CLOSED' OR
   source."projectId" IS DISTINCT FROM t."projectId" OR source."flexibleProjectId" IS DISTINCT FROM t."flexibleProjectId" OR
   (a->>'businessRole'<>'DIRECTOR' AND source."ownerId"<>a->>'userId') OR
   u."versionId"<>v.id OR u."submittedEntryId" IS DISTINCT FROM submission.id OR submission.action<>'SUBMIT' OR
   submission."taskId"<>source.id OR submission."actorId"<>u."uploadedById" OR NOT (submission.snapshot->'fileVersionIds' ? v.id) OR
   EXISTS (SELECT 1 FROM "UniversalTaskEntry" WHERE "taskId"=source.id AND version>submission.version AND action IN ('SUBMIT','EDIT','REJECT','CLOSE')) THEN
   RAISE EXCEPTION 'Eligible exact Initial Concept submission required' USING ERRCODE='23514'; END IF;
  SELECT * INTO review FROM "UniversalTaskEntry" WHERE "taskId"=source.id AND action='APPROVE' AND snapshot->'evidence'->'submissionIds' ? submission.id;
  IF NEW."sourceReviewId" IS DISTINCT FROM review.id OR (NEW."sourceState"='APPROVED') IS DISTINCT FROM (review.id IS NOT NULL) THEN
   RAISE EXCEPTION 'Truthful original concept review required' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER flux_task_reference_guard BEFORE INSERT OR UPDATE OR DELETE ON "UniversalTaskReference" FOR EACH ROW EXECUTE FUNCTION flux_task_reference_guard();
CREATE TRIGGER flux_task_reference_truncate BEFORE TRUNCATE ON "UniversalTaskReference" FOR EACH STATEMENT EXECUTE FUNCTION flux_task_reference_guard();
CREATE FUNCTION flux_task_concept_consistency() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE t "UniversalTask"; e "UniversalTaskEntry"; expected integer;
BEGIN
 IF TG_TABLE_NAME='UniversalTaskReference' THEN
  IF NOT EXISTS (SELECT 1 FROM "SharedFileProvenance" WHERE "taskEntryId"=NEW."selectedEntryId" AND "versionId"=NEW."versionId") THEN
   RAISE EXCEPTION 'Atomic selected-file provenance required' USING ERRCODE='23514'; END IF;
  RETURN NULL;
 END IF;
 SELECT * INTO STRICT t FROM "UniversalTask" WHERE id=NEW."taskId";
 IF t.type NOT IN ('INSPECT_FILE','INITIAL_CONCEPT','FINAL_CONCEPT') THEN RETURN NULL; END IF;
 IF NEW.action IN ('CREATED','SET_SOURCE') THEN
  expected:=coalesce(jsonb_array_length(NEW.snapshot->'referenceVersionIds'),0);
  IF (NEW.action='SET_SOURCE' AND (t.type<>'INSPECT_FILE' OR expected<>1)) OR
   expected<>(SELECT count(*) FROM "UniversalTaskReference" WHERE "selectedEntryId"=NEW.id) THEN
   RAISE EXCEPTION 'Atomic exact task references required' USING ERRCODE='23514'; END IF;
 END IF;
 IF t.type='INSPECT_FILE' AND NEW.action IN ('SUBMIT','REQUEST_COMPLETION','APPROVE') AND
  NOT EXISTS (SELECT 1 FROM "UniversalTaskReference" WHERE "taskId"=t.id AND kind='INSPECTION') THEN
  RAISE EXCEPTION 'Sealed inspection source required' USING ERRCODE='23514'; END IF;
 IF NEW.action='REQUEST_COMPLETION' THEN
  SELECT * INTO e FROM "UniversalTaskEntry" WHERE "taskId"=t.id AND action='SUBMIT' AND version<NEW.version ORDER BY version DESC LIMIT 1;
  IF e.id IS NULL OR NEW.snapshot->'submissionIds' IS DISTINCT FROM jsonb_build_array(e.id) OR
   NEW.snapshot->'fileVersionIds' IS DISTINCT FROM e.snapshot->'fileVersionIds' OR
   EXISTS (SELECT 1 FROM "UniversalTaskEntry" WHERE "taskId"=t.id AND version>e.version AND version<NEW.version AND action IN ('EDIT','REJECT')) THEN
   RAISE EXCEPTION 'Fresh exact concept submission required' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER flux_task_concept_consistency AFTER INSERT ON "UniversalTaskEntry" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION flux_task_concept_consistency();
CREATE CONSTRAINT TRIGGER flux_task_reference_consistency AFTER INSERT ON "UniversalTaskReference" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION flux_task_concept_consistency();
COMMIT;
