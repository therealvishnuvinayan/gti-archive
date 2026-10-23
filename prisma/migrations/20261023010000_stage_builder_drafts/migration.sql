-- Phase 4.1: additive draft-only storage. No backfill or project activation.
BEGIN;
-- AlterEnum
ALTER TYPE "BusinessEventType" ADD VALUE 'WORKFLOW_DRAFT_REVISED';

-- CreateTable
CREATE TABLE "WorkflowDraft" (
    "id" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "currentRevision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowDraftRevision" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "actorVersion" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "commandId" TEXT NOT NULL,
    "commandHash" TEXT NOT NULL,
    "definition" JSONB NOT NULL,
    "configurationHash" TEXT NOT NULL,
    "validationStatus" TEXT NOT NULL,
    "sourceRevisionId" TEXT,
    "eventId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowDraftRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkflowDraft_createdById_updatedAt_id_idx" ON "WorkflowDraft"("createdById", "updatedAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowDraftRevision_eventId_key" ON "WorkflowDraftRevision"("eventId");

-- CreateIndex
CREATE INDEX "WorkflowDraftRevision_sourceRevisionId_idx" ON "WorkflowDraftRevision"("sourceRevisionId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowDraftRevision_workflowId_revision_key" ON "WorkflowDraftRevision"("workflowId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowDraftRevision_actorId_commandId_key" ON "WorkflowDraftRevision"("actorId", "commandId");

-- AddForeignKey
ALTER TABLE "WorkflowDraft" ADD CONSTRAINT "WorkflowDraft_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "WorkflowDraftRevision" ADD CONSTRAINT "WorkflowDraftRevision_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "WorkflowDraft"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "WorkflowDraftRevision" ADD CONSTRAINT "WorkflowDraftRevision_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "WorkflowDraftRevision" ADD CONSTRAINT "WorkflowDraftRevision_sourceRevisionId_fkey" FOREIGN KEY ("sourceRevisionId") REFERENCES "WorkflowDraftRevision"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "WorkflowDraftRevision" ADD CONSTRAINT "WorkflowDraftRevision_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "BusinessEvent"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- A revision and its native event are created together by the revision trigger.
ALTER TABLE "WorkflowDraftRevision" ALTER CONSTRAINT "WorkflowDraftRevision_eventId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "WorkflowDraft" ADD CONSTRAINT "WorkflowDraft_shape" CHECK (status='DRAFT' AND "currentRevision">0);
ALTER TABLE "WorkflowDraftRevision" ADD CONSTRAINT "WorkflowDraftRevision_shape" CHECK (
 revision>0 AND "actorVersion">0 AND "actorRole" IN ('DIRECTOR','SENIOR_PROJECT_MANAGER') AND
 action IN ('CREATE','REVISE','CLONE') AND "validationStatus" IN ('VALID','INCOMPLETE') AND
 "configurationHash" ~ '^[a-f0-9]{64}$' AND "commandHash" ~ '^[a-f0-9]{64}$' AND
 octet_length(definition::text)<=262144 AND jsonb_typeof(definition)='object' AND definition->>'schemaVersion'='1' AND
 jsonb_typeof(definition->'stages')='array' AND jsonb_array_length(definition->'stages')<=30 AND
 ((action='CLONE' AND "sourceRevisionId" IS NOT NULL) OR (action<>'CLONE' AND "sourceRevisionId" IS NULL)) AND
 ((revision=1 AND action IN ('CREATE','CLONE')) OR (revision>1 AND action='REVISE')));

CREATE FUNCTION flux_draft_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a record; d "WorkflowDraft"; source "WorkflowDraftRevision";
BEGIN
 IF TG_OP IN ('DELETE','TRUNCATE') OR (TG_OP='UPDATE' AND TG_TABLE_NAME='WorkflowDraftRevision') THEN
  RAISE EXCEPTION 'Draft revisions and identity must be retained' USING ERRCODE='23514'; END IF;
 SELECT * INTO a FROM "UserAuthorization" WHERE "userId"=nullif(current_setting('flux.draft_actor',true),'');
 IF a."accountStatus" IS DISTINCT FROM 'ACTIVE' OR a."businessRole" IS NULL OR a."businessRole"::text NOT IN ('DIRECTOR','SENIOR_PROJECT_MANAGER') OR NOT EXISTS (
  SELECT 1 FROM "Session" WHERE id=current_setting('flux.draft_session',true) AND "userId"=a."userId" AND
  "expiresAt">clock_timestamp() AT TIME ZONE 'UTC' AND token ~ ('^v2\.'||a."authorizationVersion"||'\.[a-f0-9]{64}$')) THEN
  RAISE EXCEPTION 'Current draft author session required' USING ERRCODE='23514'; END IF;
 IF TG_TABLE_NAME='WorkflowDraft' THEN
  IF TG_OP='INSERT' THEN
   IF NEW."createdById"<>a."userId" OR NEW."currentRevision"<>1 THEN RAISE EXCEPTION 'Real draft creator required' USING ERRCODE='23514'; END IF;
   NEW."createdAt":=clock_timestamp() AT TIME ZONE 'UTC';
  ELSE
   IF (a."businessRole"<>'DIRECTOR' AND OLD."createdById"<>a."userId") OR NEW."currentRevision"<>OLD."currentRevision"+1 OR
    (to_jsonb(NEW)-ARRAY['currentRevision','updatedAt']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['currentRevision','updatedAt']) THEN
    RAISE EXCEPTION 'Authorized draft revision required' USING ERRCODE='23514'; END IF;
  END IF;
  NEW."updatedAt":=clock_timestamp() AT TIME ZONE 'UTC';
 ELSE
  SELECT * INTO STRICT d FROM "WorkflowDraft" WHERE id=NEW."workflowId" FOR UPDATE;
  IF (a."businessRole"<>'DIRECTOR' AND d."createdById"<>a."userId") OR NEW.revision<>d."currentRevision" OR
   NEW."actorId"<>a."userId" OR NEW."actorRole"<>a."businessRole"::text OR NEW."actorVersion"<>a."authorizationVersion" OR NEW."eventId"<>'draft:'||NEW.id THEN
   RAISE EXCEPTION 'Truthful draft revision required' USING ERRCODE='23514'; END IF;
  IF NEW.action='CLONE' THEN
   SELECT * INTO STRICT source FROM "WorkflowDraftRevision" WHERE id=NEW."sourceRevisionId";
   IF source."workflowId"=NEW."workflowId" OR NOT EXISTS (SELECT 1 FROM "WorkflowDraft" s WHERE s.id=source."workflowId" AND
    s."currentRevision"=source.revision AND (a."businessRole"='DIRECTOR' OR s."createdById"=a."userId")) THEN
    RAISE EXCEPTION 'Authorized current clone source required' USING ERRCODE='23514'; END IF;
  END IF;
  NEW."createdAt":=clock_timestamp() AT TIME ZONE 'UTC';
 END IF;
 RETURN NEW;
END $$;
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['WorkflowDraft','WorkflowDraftRevision'] LOOP
 EXECUTE format('CREATE TRIGGER flux_draft_guard BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION flux_draft_guard()',t);
 EXECUTE format('CREATE TRIGGER flux_draft_truncate BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION flux_draft_guard()',t);
END LOOP; END $$;

CREATE FUNCTION flux_draft_consistency() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE d "WorkflowDraft";
BEGIN
 SELECT * INTO STRICT d FROM "WorkflowDraft" WHERE id=NEW.id;
 IF (SELECT count(*) FROM "WorkflowDraftRevision" WHERE "workflowId"=d.id)<>d."currentRevision" OR
  NOT EXISTS (SELECT 1 FROM "WorkflowDraftRevision" WHERE "workflowId"=d.id AND revision=d."currentRevision") THEN
  RAISE EXCEPTION 'Atomic draft revision history required' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER flux_draft_consistency AFTER INSERT OR UPDATE ON "WorkflowDraft" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION flux_draft_consistency();

CREATE FUNCTION flux_emit_draft_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO "BusinessEvent" (id,type,"schemaVersion","aggregateType","aggregateId",sequence,"actorId","actorRole","actorVersion",operation,"correlationId","causationId","idempotencyKey","occurredAt",payload)
 VALUES (NEW."eventId",'WORKFLOW_DRAFT_REVISED',1,'WORKFLOW_DRAFT',NEW."workflowId",NEW.revision,NEW."actorId",NEW."actorRole",NEW."actorVersion",'draftWorkflowCommand',NEW."workflowId",NEW.id,NEW."eventId",NEW."createdAt",
 jsonb_build_object('action',NEW.action,'configurationHash',NEW."configurationHash",'validationStatus',NEW."validationStatus"));
 INSERT INTO "EventOutbox" ("eventId","consumerKey") VALUES (NEW."eventId",'internal.audit.v1');
 RETURN NEW;
END $$;
CREATE TRIGGER flux_emit_draft_event AFTER INSERT ON "WorkflowDraftRevision" FOR EACH ROW EXECUTE FUNCTION flux_emit_draft_event();

-- Extend the existing typed event adapter; preserve all earlier branches.
ALTER TABLE "BusinessEvent" DROP CONSTRAINT "BusinessEvent_contract_check";
ALTER TABLE "BusinessEvent" ADD CONSTRAINT "BusinessEvent_contract_check" CHECK (
 "schemaVersion"=1 AND sequence>0 AND "actorVersion">0 AND jsonb_typeof(payload)='object' AND (
 (type::text='COMPLETION_DOCUMENT_REVIEW_DECIDED' AND "aggregateType"='COMPLETION_DOCUMENT_SUBMISSION' AND
 "actorRole" IN ('DIRECTOR','SENIOR_PROJECT_MANAGER','JUNIOR_PROJECT_MANAGER') AND operation='reviewCompletionDocument' AND
 "projectId" IS NOT NULL AND "decisionId" IS NOT NULL AND "nativeEventId" IS NOT NULL AND "approvalEvidenceId" IS NOT NULL AND "fileVersionId" IS NOT NULL AND "taskId" IS NULL AND "taskEntryId" IS NULL AND "flexibleProjectId" IS NULL)
 OR (type::text='TASK_ACTIVITY' AND "aggregateType"='UNIVERSAL_TASK' AND operation IN ('generalTaskCommand','deliverableTaskCommand','conceptTaskCommand') AND
 "actorRole" IN ('DIRECTOR','SENIOR_PROJECT_MANAGER','JUNIOR_PROJECT_MANAGER','DESIGNER','DIGITAL_LEAD') AND
 num_nonnulls("projectId","flexibleProjectId")=1 AND "taskId" IS NOT NULL AND "taskEntryId" IS NOT NULL AND
 "decisionId" IS NULL AND "nativeEventId" IS NULL AND "approvalEvidenceId" IS NULL AND "fileVersionId" IS NULL)
 OR (type::text='WORKFLOW_DRAFT_REVISED' AND "aggregateType"='WORKFLOW_DRAFT' AND operation='draftWorkflowCommand' AND
 "actorRole" IN ('DIRECTOR','SENIOR_PROJECT_MANAGER') AND num_nonnulls("projectId","flexibleProjectId","taskId","taskEntryId","decisionId","nativeEventId","approvalEvidenceId","fileVersionId")=0)));

CREATE OR REPLACE FUNCTION flux_event_write_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE dr "WorkflowDraftRevision"; te "UniversalTaskEntry"; tt "UniversalTask"; d "ApprovalDecision"; r "ApprovalRequest"; e "ApprovalEvidence"; v "SharedFileVersion"; o "EventOutbox";
BEGIN
  IF TG_OP IN ('DELETE','TRUNCATE') OR (TG_OP='UPDATE' AND TG_TABLE_NAME<>'EventOutbox') THEN
    RAISE EXCEPTION 'Shared event history is retained and immutable' USING ERRCODE='23514'; END IF;
  IF TG_TABLE_NAME='BusinessEvent' THEN
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
