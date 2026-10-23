-- Phase 4.4 additive candidate. Never run automatically against application databases.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "BusinessEventType" ADD VALUE 'RUNTIME_CREATION_REQUESTED';
ALTER TYPE "BusinessEventType" ADD VALUE 'RUNTIME_CREATION_DECIDED';

-- CreateTable
CREATE TABLE "RuntimeCreationRequest" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "publishedVersionId" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "snapshotHash" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "commandId" TEXT NOT NULL,
    "commandHash" TEXT NOT NULL,
    "actorVersion" INTEGER NOT NULL,
    "sessionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eventId" TEXT NOT NULL,

    CONSTRAINT "RuntimeCreationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RuntimeCreationDecision" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "snapshotHash" TEXT NOT NULL,
    "commandId" TEXT NOT NULL,
    "commandHash" TEXT NOT NULL,
    "actorVersion" INTEGER NOT NULL,
    "sessionId" TEXT NOT NULL,
    "projectId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eventId" TEXT NOT NULL,

    CONSTRAINT "RuntimeCreationDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RuntimeCreationRequest_eventId_key" ON "RuntimeCreationRequest"("eventId");

-- CreateIndex
CREATE INDEX "RuntimeCreationRequest_requesterId_createdAt_id_idx" ON "RuntimeCreationRequest"("requesterId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "RuntimeCreationRequest_requesterId_commandId_key" ON "RuntimeCreationRequest"("requesterId", "commandId");

-- CreateIndex
CREATE UNIQUE INDEX "RuntimeCreationDecision_requestId_key" ON "RuntimeCreationDecision"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "RuntimeCreationDecision_projectId_key" ON "RuntimeCreationDecision"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "RuntimeCreationDecision_eventId_key" ON "RuntimeCreationDecision"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "RuntimeCreationDecision_reviewerId_commandId_key" ON "RuntimeCreationDecision"("reviewerId", "commandId");

-- AddForeignKey
ALTER TABLE "RuntimeCreationRequest" ADD CONSTRAINT "RuntimeCreationRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RuntimeCreationRequest" ADD CONSTRAINT "RuntimeCreationRequest_publishedVersionId_fkey" FOREIGN KEY ("publishedVersionId") REFERENCES "PublishedWorkflowVersion"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RuntimeCreationRequest" ADD CONSTRAINT "RuntimeCreationRequest_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "BusinessEvent"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RuntimeCreationDecision" ADD CONSTRAINT "RuntimeCreationDecision_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "RuntimeCreationRequest"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RuntimeCreationDecision" ADD CONSTRAINT "RuntimeCreationDecision_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RuntimeCreationDecision" ADD CONSTRAINT "RuntimeCreationDecision_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "RuntimeProject"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RuntimeCreationDecision" ADD CONSTRAINT "RuntimeCreationDecision_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "BusinessEvent"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;


ALTER TABLE "RuntimeCreationRequest" ALTER CONSTRAINT "RuntimeCreationRequest_eventId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "RuntimeCreationDecision" ALTER CONSTRAINT "RuntimeCreationDecision_eventId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "RuntimeCreationDecision" ALTER CONSTRAINT "RuntimeCreationDecision_projectId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "RuntimeCreationRequest" ADD CONSTRAINT "RuntimeCreationRequest_shape" CHECK ("actorVersion">0 AND length(btrim(reason)) BETWEEN 1 AND 2000 AND "snapshotHash" ~ '^[a-f0-9]{64}$' AND "commandHash" ~ '^[a-f0-9]{64}$' AND jsonb_typeof(snapshot)='object');
ALTER TABLE "RuntimeCreationDecision" ADD CONSTRAINT "RuntimeCreationDecision_shape" CHECK ("actorVersion">0 AND length(btrim(reason)) BETWEEN 1 AND 2000 AND outcome IN ('APPROVE','REJECT') AND ((outcome='APPROVE')=("projectId" IS NOT NULL)) AND "snapshotHash" ~ '^[a-f0-9]{64}$' AND "commandHash" ~ '^[a-f0-9]{64}$');
CREATE FUNCTION flux_runtime_creation_valid(snapshot jsonb, requester text) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE v "PublishedWorkflowVersion"; uid text; role_name text; seen text[];
BEGIN
 SELECT * INTO v FROM "PublishedWorkflowVersion" WHERE id=snapshot->>'publishedVersionId';
 IF v.id IS NULL OR v."validationStatus"<>'VALID' OR v."configurationHash"<>snapshot->>'definitionHash' OR snapshot->>'ownerId'<>requester OR NOT EXISTS(SELECT 1 FROM "UserAuthorization" WHERE "userId"=requester AND "accountStatus"='ACTIVE' AND "businessRole"::text='JUNIOR_PROJECT_MANAGER') THEN RETURN false; END IF;
 IF NOT EXISTS(SELECT 1 FROM "UserAuthorization" WHERE "userId" IN (SELECT jsonb_array_elements_text(snapshot->'coOwnerIds')) AND "accountStatus"='ACTIVE' AND "businessRole"::text='SENIOR_PROJECT_MANAGER') THEN RETURN false; END IF;
 seen:=ARRAY[requester];
 FOR uid IN SELECT jsonb_array_elements_text(snapshot->'coOwnerIds') LOOP
  IF uid=ANY(seen) OR NOT EXISTS(SELECT 1 FROM "UserAuthorization" WHERE "userId"=uid AND "accountStatus"='ACTIVE' AND "businessRole"::text IN ('DIRECTOR','SENIOR_PROJECT_MANAGER','JUNIOR_PROJECT_MANAGER')) THEN RETURN false; END IF; seen:=array_append(seen,uid);
 END LOOP;
 FOR uid IN SELECT jsonb_array_elements_text(snapshot->'executorIds') LOOP
  IF uid=ANY(seen) OR NOT EXISTS(SELECT 1 FROM "UserAuthorization" WHERE "userId"=uid AND "accountStatus"='ACTIVE' AND "businessRole" IS NOT NULL) THEN RETURN false; END IF; seen:=array_append(seen,uid);
 END LOOP;
 RETURN true;
END $$;
CREATE FUNCTION flux_runtime_creation_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE uid text; role_name text; av int; sid text; r "RuntimeCreationRequest";
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Runtime creation history is immutable' USING ERRCODE='23514'; END IF;
 uid:=current_setting('flux.runtime_actor',true); sid:=current_setting('flux.runtime_session',true);
 SELECT "businessRole"::text,"authorizationVersion" INTO role_name,av FROM "UserAuthorization" WHERE "userId"=uid;
 IF NOT coalesce(flux_workflow_actor_current(uid,role_name,av,sid),false) OR NEW."actorVersion"<>av OR NEW."sessionId"<>sid OR NEW."eventId"<>'runtime-creation:'||NEW.id THEN RAISE EXCEPTION 'Current attributed creation session required' USING ERRCODE='23514'; END IF;
 IF TG_TABLE_NAME='RuntimeCreationRequest' THEN
  IF role_name<>'JUNIOR_PROJECT_MANAGER' OR NEW."requesterId"<>uid OR NEW."publishedVersionId"<>NEW.snapshot->>'publishedVersionId' OR NOT flux_runtime_creation_valid(NEW.snapshot,uid) THEN RAISE EXCEPTION 'Eligible JPM request with SPM co-owner required' USING ERRCODE='23514'; END IF;
 ELSE
  SELECT * INTO STRICT r FROM "RuntimeCreationRequest" WHERE id=NEW."requestId" FOR UPDATE;
  IF role_name<>'DIRECTOR' OR NEW."reviewerId"<>uid OR uid=r."requesterId" OR NEW."snapshotHash"<>r."snapshotHash" OR (NEW.outcome='APPROVE' AND NOT flux_runtime_creation_valid(r.snapshot,r."requesterId")) THEN RAISE EXCEPTION 'Independent Director decision on current request required' USING ERRCODE='23514'; END IF;
 END IF; RETURN NEW;
END $$;
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['RuntimeCreationRequest','RuntimeCreationDecision'] LOOP
 EXECUTE format('CREATE TRIGGER flux_runtime_creation_guard BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION flux_runtime_creation_guard()',t);
 EXECUTE format('CREATE TRIGGER flux_runtime_creation_truncate BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION flux_runtime_creation_guard()',t);
END LOOP; END $$;
CREATE FUNCTION flux_runtime_creation_consistency() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r "RuntimeCreationRequest"; p "RuntimeProject";
BEGIN
 IF NEW.outcome='APPROVE' THEN
 SELECT * INTO STRICT r FROM "RuntimeCreationRequest" WHERE id=NEW."requestId";
 SELECT * INTO STRICT p FROM "RuntimeProject" WHERE id=NEW."projectId";
 IF p."createdById"<>r."requesterId" OR p."ownerId"<>r.snapshot->>'ownerId' OR p.title<>r.snapshot->>'title' OR p.description<>r.snapshot->>'description' OR p."publishedVersionId"<>r."publishedVersionId" OR p."definitionHash"<>r.snapshot->>'definitionHash' OR
 ARRAY(SELECT "userId" FROM "RuntimeParticipant" WHERE "projectId"=p.id AND role='CO_OWNER' ORDER BY "userId") IS DISTINCT FROM ARRAY(SELECT jsonb_array_elements_text(r.snapshot->'coOwnerIds') ORDER BY 1) OR
 ARRAY(SELECT "userId" FROM "RuntimeParticipant" WHERE "projectId"=p.id AND role='EXECUTOR' ORDER BY "userId") IS DISTINCT FROM ARRAY(SELECT jsonb_array_elements_text(r.snapshot->'executorIds') ORDER BY 1) THEN RAISE EXCEPTION 'Approved creation must instantiate exact immutable request' USING ERRCODE='23514'; END IF;
 END IF; RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER flux_runtime_creation_consistency AFTER INSERT ON "RuntimeCreationDecision" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION flux_runtime_creation_consistency();
CREATE FUNCTION flux_emit_runtime_creation_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE requested boolean; actor_id text; role_name text; rid text;
BEGIN
 requested:=TG_TABLE_NAME='RuntimeCreationRequest'; actor_id:=CASE WHEN requested THEN to_jsonb(NEW)->>'requesterId' ELSE to_jsonb(NEW)->>'reviewerId' END;
 role_name:=CASE WHEN requested THEN 'JUNIOR_PROJECT_MANAGER' ELSE 'DIRECTOR' END; rid:=CASE WHEN requested THEN NEW.id ELSE to_jsonb(NEW)->>'requestId' END;
 INSERT INTO "BusinessEvent" (id,type,"schemaVersion","aggregateType","aggregateId",sequence,"actorId","actorRole","actorVersion",operation,"correlationId","causationId","idempotencyKey","occurredAt",payload)
 VALUES (NEW."eventId",(CASE WHEN requested THEN 'RUNTIME_CREATION_REQUESTED' ELSE 'RUNTIME_CREATION_DECIDED' END)::"BusinessEventType",1,'RUNTIME_CREATION',rid,CASE WHEN requested THEN 1 ELSE 2 END,actor_id,role_name,NEW."actorVersion",'runtimeCreationCommand',rid,NEW.id,NEW."eventId",NEW."createdAt",jsonb_build_object('snapshotHash',NEW."snapshotHash"));
 INSERT INTO "EventOutbox" ("eventId","consumerKey") VALUES(NEW."eventId",'internal.audit.v1');
 RETURN NEW;
END $$;
CREATE TRIGGER flux_emit_runtime_creation_event AFTER INSERT ON "RuntimeCreationRequest" FOR EACH ROW EXECUTE FUNCTION flux_emit_runtime_creation_event();
CREATE TRIGGER flux_emit_runtime_creation_event AFTER INSERT ON "RuntimeCreationDecision" FOR EACH ROW EXECUTE FUNCTION flux_emit_runtime_creation_event();

CREATE OR REPLACE FUNCTION public.flux_runtime_consistency()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE pid text; p "RuntimeProject"; s "RuntimeStage"; n int; last_row "RuntimeActivity"; initial "RuntimeActivity"; current_files jsonb;
BEGIN
 IF TG_TABLE_NAME='RuntimeProject' THEN pid:=NEW.id;
 ELSIF TG_TABLE_NAME IN ('RuntimeParticipant','RuntimeStage','RuntimeActivity') THEN pid:=NEW."projectId";
 ELSE SELECT "projectId" INTO STRICT pid FROM "RuntimeStage" WHERE id=NEW."stageId"; END IF;
 SELECT * INTO STRICT p FROM "RuntimeProject" WHERE id=pid;
 SELECT count(*) INTO n FROM "RuntimeActivity" WHERE "projectId"=pid;
 IF n<>p.revision OR (SELECT max(sequence) FROM "RuntimeActivity" WHERE "projectId"=pid)<>n OR NOT EXISTS(SELECT 1 FROM "RuntimeActivity" WHERE "projectId"=pid AND sequence=1 AND action='CREATED' AND ("actorId"=p."createdById" OR EXISTS(SELECT 1 FROM "RuntimeCreationDecision" d WHERE d."projectId"=p.id AND d."reviewerId"="RuntimeActivity"."actorId" AND d.outcome='APPROVE'))) OR
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
END $function$
;
ALTER TABLE "BusinessEvent" DROP CONSTRAINT "BusinessEvent_contract_check";
ALTER TABLE "BusinessEvent" ADD CONSTRAINT "BusinessEvent_contract_check" CHECK (("schemaVersion" = 1 AND sequence > 0 AND "actorVersion" > 0 AND jsonb_typeof(payload) = 'object'::text AND (type::text = 'RUNTIME_ACTIVITY'::text AND "aggregateType" = 'RUNTIME_PROJECT'::text AND operation = 'runtimeStageCommand'::text AND ("actorRole" = ANY (ARRAY['DIRECTOR'::text, 'SENIOR_PROJECT_MANAGER'::text, 'JUNIOR_PROJECT_MANAGER'::text])) AND num_nonnulls("projectId", "flexibleProjectId", "taskId", "taskEntryId", "decisionId", "nativeEventId", "approvalEvidenceId", "fileVersionId") = 0 OR type::text = 'COMPLETION_DOCUMENT_REVIEW_DECIDED'::text AND "aggregateType" = 'COMPLETION_DOCUMENT_SUBMISSION'::text AND ("actorRole" = ANY (ARRAY['DIRECTOR'::text, 'SENIOR_PROJECT_MANAGER'::text, 'JUNIOR_PROJECT_MANAGER'::text])) AND operation = 'reviewCompletionDocument'::text AND "projectId" IS NOT NULL AND "decisionId" IS NOT NULL AND "nativeEventId" IS NOT NULL AND "approvalEvidenceId" IS NOT NULL AND "fileVersionId" IS NOT NULL AND "taskId" IS NULL AND "taskEntryId" IS NULL AND "flexibleProjectId" IS NULL OR type::text = 'TASK_ACTIVITY'::text AND "aggregateType" = 'UNIVERSAL_TASK'::text AND (operation = ANY (ARRAY['generalTaskCommand'::text, 'deliverableTaskCommand'::text, 'conceptTaskCommand'::text])) AND ("actorRole" = ANY (ARRAY['DIRECTOR'::text, 'SENIOR_PROJECT_MANAGER'::text, 'JUNIOR_PROJECT_MANAGER'::text, 'DESIGNER'::text, 'DIGITAL_LEAD'::text])) AND num_nonnulls("projectId", "flexibleProjectId") <= 1 AND "taskId" IS NOT NULL AND "taskEntryId" IS NOT NULL AND "decisionId" IS NULL AND "nativeEventId" IS NULL AND "approvalEvidenceId" IS NULL AND "fileVersionId" IS NULL OR type::text = 'WORKFLOW_DRAFT_REVISED'::text AND "aggregateType" = 'WORKFLOW_DRAFT'::text AND operation = 'draftWorkflowCommand'::text AND ("actorRole" = ANY (ARRAY['DIRECTOR'::text, 'SENIOR_PROJECT_MANAGER'::text])) AND num_nonnulls("projectId", "flexibleProjectId", "taskId", "taskEntryId", "decisionId", "nativeEventId", "approvalEvidenceId", "fileVersionId") = 0 OR (type::text = ANY (ARRAY['WORKFLOW_PUBLICATION_SUBMITTED'::text, 'WORKFLOW_PUBLICATION_SUPERSEDED'::text, 'WORKFLOW_PUBLICATION_DECIDED'::text, 'WORKFLOW_VERSION_PUBLISHED'::text])) AND "aggregateType" = 'WORKFLOW_PUBLICATION_REQUEST'::text AND operation = 'workflowPublicationCommand'::text AND ("actorRole" = ANY (ARRAY['DIRECTOR'::text, 'SENIOR_PROJECT_MANAGER'::text])) AND num_nonnulls("projectId", "flexibleProjectId", "taskId", "taskEntryId", "decisionId", "nativeEventId", "approvalEvidenceId", "fileVersionId") = 0)) OR (type::text IN ('RUNTIME_CREATION_REQUESTED','RUNTIME_CREATION_DECIDED') AND "schemaVersion"=1 AND "aggregateType"='RUNTIME_CREATION' AND operation='runtimeCreationCommand' AND num_nonnulls("projectId","flexibleProjectId","taskId","taskEntryId","decisionId","nativeEventId","approvalEvidenceId","fileVersionId")=0));
CREATE OR REPLACE FUNCTION public.flux_event_write_guard()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE runtime_row "RuntimeActivity"; dr "WorkflowDraftRevision"; te "UniversalTaskEntry"; tt "UniversalTask"; d "ApprovalDecision"; r "ApprovalRequest"; e "ApprovalEvidence"; v "SharedFileVersion"; o "EventOutbox"; pv "PublishedWorkflowVersion"; audit "WorkflowPublicationAudit"; ae "ApprovalEvent"; sub "WorkflowPublicationSubmission";
 expected_id text; expected_request text; expected_actor text; expected_role text; expected_version int; expected_time timestamp;
 expected_sequence int; expected_payload jsonb; expected_type text; expected_action text;
BEGIN
 IF TG_TABLE_NAME='BusinessEvent' THEN
 IF NEW.type::text IN ('RUNTIME_CREATION_REQUESTED','RUNTIME_CREATION_DECIDED') THEN
  IF TG_OP<>'INSERT' OR NOT EXISTS(
    SELECT 1 FROM (SELECT id,"eventId","requesterId" AS actor,"actorVersion","createdAt","snapshotHash",id AS rid,1 AS seq,'RUNTIME_CREATION_REQUESTED' AS typ FROM "RuntimeCreationRequest"
    UNION ALL SELECT id,"eventId","reviewerId","actorVersion","createdAt","snapshotHash","requestId",2,'RUNTIME_CREATION_DECIDED' FROM "RuntimeCreationDecision") n
    WHERE n.id=NEW."causationId" AND n."eventId"=NEW.id AND n.actor=NEW."actorId" AND n."actorVersion"=NEW."actorVersion" AND n."createdAt"=NEW."occurredAt" AND n.rid=NEW."aggregateId" AND n.rid=NEW."correlationId" AND n.seq=NEW.sequence AND n.typ=NEW.type::text AND NEW."idempotencyKey"=NEW.id AND NEW.payload=jsonb_build_object('snapshotHash',n."snapshotHash") AND NEW."actorRole"=CASE n.seq WHEN 1 THEN 'JUNIOR_PROJECT_MANAGER' ELSE 'DIRECTOR' END)
  THEN RAISE EXCEPTION 'Runtime creation event requires exact native history' USING ERRCODE='23514'; END IF; RETURN NEW;
 END IF;
 END IF;

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
END $function$
;
-- Phase 4.4B: native task identity with a restrictive runtime context.
CREATE TABLE "RuntimeTaskContext" (
 "taskId" TEXT NOT NULL PRIMARY KEY,
 "projectId" TEXT NOT NULL,
 "sourceTaskId" TEXT,
 CONSTRAINT "RuntimeTaskContext_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "UniversalTask"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT "RuntimeTaskContext_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "RuntimeProject"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT "RuntimeTaskContext_sourceTaskId_fkey" FOREIGN KEY ("sourceTaskId") REFERENCES "UniversalTask"(id) ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE INDEX "RuntimeTaskContext_projectId_taskId_idx" ON "RuntimeTaskContext"("projectId","taskId");
CREATE INDEX "RuntimeTaskContext_sourceTaskId_idx" ON "RuntimeTaskContext"("sourceTaskId");
CREATE TABLE "RuntimeTaskEventContext" (
 "eventId" TEXT NOT NULL PRIMARY KEY,
 "taskId" TEXT NOT NULL,
 "projectId" TEXT NOT NULL,
 CONSTRAINT "RuntimeTaskEventContext_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "BusinessEvent"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT "RuntimeTaskEventContext_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "RuntimeTaskContext"("taskId") ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT "RuntimeTaskEventContext_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "RuntimeProject"(id) ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE INDEX "RuntimeTaskEventContext_projectId_eventId_idx" ON "RuntimeTaskEventContext"("projectId","eventId");
CREATE INDEX "RuntimeTaskEventContext_taskId_idx" ON "RuntimeTaskEventContext"("taskId");

CREATE FUNCTION flux_runtime_task_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE t "UniversalTask"; p "RuntimeProject"; a record;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Runtime task context is immutable' USING ERRCODE='23514'; END IF;
 IF TG_TABLE_NAME='RuntimeTaskEventContext' THEN
  IF pg_trigger_depth()<>2 OR NOT EXISTS(SELECT 1 FROM "BusinessEvent" e JOIN "RuntimeTaskContext" c ON c."taskId"=e."taskId"
    WHERE e.id=NEW."eventId" AND e.type='TASK_ACTIVITY' AND e."taskId"=NEW."taskId" AND c."projectId"=NEW."projectId"
      AND num_nonnulls(e."projectId",e."flexibleProjectId")=0 AND e.operation IN ('generalTaskCommand','deliverableTaskCommand','conceptTaskCommand')) THEN
   RAISE EXCEPTION 'Exact native runtime task event required' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END IF;
 SELECT * INTO STRICT t FROM "UniversalTask" WHERE id=NEW."taskId";
 SELECT * INTO STRICT p FROM "RuntimeProject" WHERE id=NEW."projectId" FOR SHARE;
 SELECT * INTO a FROM jsonb_to_record(flux_task_actor()) AS x("userId" text,"businessRole" text,"authorizationVersion" int);
 IF t.type NOT IN ('GENERAL','FILE_UPLOAD','DATA_INPUT','INSPECT_FILE','INITIAL_CONCEPT','FINAL_CONCEPT') OR num_nonnulls(t."projectId",t."flexibleProjectId")<>0 OR t.version<>1 OR t.status<>'OPEN' OR t."ownerId"<>a."userId" OR p.state<>'ACTIVE' THEN
  RAISE EXCEPTION 'Genuine runtime General Task origin required' USING ERRCODE='23514'; END IF;
 IF NEW."sourceTaskId" IS NOT NULL THEN

  PERFORM id FROM "UniversalTask" WHERE id=NEW."sourceTaskId" FOR SHARE;
  IF NEW."sourceTaskId"=t.id OR NOT EXISTS(SELECT 1 FROM "UniversalTask" s JOIN "RuntimeTaskContext" c ON c."taskId"=s.id
   WHERE s.id=NEW."sourceTaskId" AND c."projectId"=p.id AND s."deletedAt" IS NULL AND s.type IN ('GENERAL','FILE_UPLOAD','DATA_INPUT','INSPECT_FILE','INITIAL_CONCEPT','FINAL_CONCEPT')
    AND (a."businessRole"='DIRECTOR' OR a."userId" IN (s."ownerId",s."executorId"))) THEN
   RAISE EXCEPTION 'Authorized same-project task context required' USING ERRCODE='23514'; END IF;
 END IF;
 IF (NEW."sourceTaskId" IS NULL OR t.type<>'GENERAL') AND NOT (a."businessRole"='DIRECTOR' OR (a."businessRole" IN ('SENIOR_PROJECT_MANAGER','JUNIOR_PROJECT_MANAGER') AND
  (p."ownerId"=a."userId" OR EXISTS(SELECT 1 FROM "RuntimeParticipant" WHERE "projectId"=p.id AND "userId"=a."userId" AND role='CO_OWNER')))) THEN
  RAISE EXCEPTION 'Runtime owner or co-owner creation scope required' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['RuntimeTaskContext','RuntimeTaskEventContext'] LOOP
 EXECUTE format('CREATE TRIGGER flux_runtime_task_guard BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION flux_runtime_task_guard()',t);
 EXECUTE format('CREATE TRIGGER flux_runtime_task_truncate BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION flux_runtime_task_guard()',t);
END LOOP; END $$;

CREATE FUNCTION flux_runtime_task_consistency() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE tid text; t "UniversalTask"; contexts int;
BEGIN
 IF TG_TABLE_NAME='BusinessEvent' THEN
  IF NEW.type='TASK_ACTIVITY' THEN
   SELECT count(*) INTO contexts FROM "RuntimeTaskEventContext" WHERE "eventId"=NEW.id;
   IF num_nonnulls(NEW."projectId",NEW."flexibleProjectId")+contexts<>1 THEN RAISE EXCEPTION 'Exactly one task event project context required' USING ERRCODE='23514'; END IF;
  END IF; RETURN NULL;
 END IF;
 tid:=CASE WHEN TG_TABLE_NAME='UniversalTask' THEN to_jsonb(NEW)->>'id' ELSE to_jsonb(NEW)->>'taskId' END;
 SELECT * INTO STRICT t FROM "UniversalTask" WHERE id=tid;
 SELECT count(*) INTO contexts FROM "RuntimeTaskContext" WHERE "taskId"=tid;
 IF num_nonnulls(t."projectId",t."flexibleProjectId")+contexts<>1 OR (contexts=1 AND t.type NOT IN ('GENERAL','FILE_UPLOAD','DATA_INPUT','INSPECT_FILE','INITIAL_CONCEPT','FINAL_CONCEPT')) THEN
  RAISE EXCEPTION 'Exactly one supported task project context required' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER flux_runtime_task_consistency AFTER INSERT OR UPDATE ON "UniversalTask" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION flux_runtime_task_consistency();
CREATE CONSTRAINT TRIGGER flux_runtime_task_consistency AFTER INSERT ON "RuntimeTaskContext" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION flux_runtime_task_consistency();
CREATE CONSTRAINT TRIGGER flux_runtime_task_consistency AFTER INSERT ON "BusinessEvent" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION flux_runtime_task_consistency();

-- Native family invariants remain in flux_task_family_guard; null native IDs
-- additionally require the same real runtime project for child, source and root.
CREATE FUNCTION flux_runtime_sister_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE expected text; actual text; tid text;
BEGIN
 SELECT "projectId" INTO expected FROM "RuntimeTaskContext" WHERE "taskId"=NEW."taskId";
 FOREACH tid IN ARRAY ARRAY[NEW."sourceTaskId",NEW."rootTaskId"] LOOP
  SELECT "projectId" INTO actual FROM "RuntimeTaskContext" WHERE "taskId"=tid;
  IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Same genuine runtime family required' USING ERRCODE='23514'; END IF;
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER flux_runtime_sister_guard BEFORE INSERT ON "UniversalTaskFamilyLink" FOR EACH ROW EXECUTE FUNCTION flux_runtime_sister_guard();

ALTER TABLE "UniversalTask" DROP CONSTRAINT "UniversalTask_values";
ALTER TABLE "UniversalTask" ADD CONSTRAINT "UniversalTask_values" CHECK ((type NOT IN ('FILE_UPLOAD','DATA_INPUT') OR "flexibleProjectId" IS NULL) AND (num_nonnulls("projectId", "flexibleProjectId") = 1 OR (type IN ('GENERAL','FILE_UPLOAD','DATA_INPUT','INSPECT_FILE','INITIAL_CONCEPT','FINAL_CONCEPT') AND num_nonnulls("projectId", "flexibleProjectId") = 0)) AND "ownerId" <> "executorId" AND version > 0 AND length(btrim(title)) >= 1 AND length(btrim(title)) <= 200 AND length(btrim(brief)) >= 1 AND length(btrim(brief)) <= 20000);
CREATE OR REPLACE FUNCTION public.flux_emit_task_event()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE t "UniversalTask"; eid text;
BEGIN
 SELECT * INTO STRICT t FROM "UniversalTask" WHERE id=NEW."taskId";
 eid:='task:'||NEW.id;
 INSERT INTO "BusinessEvent" (id,type,"schemaVersion","aggregateType","aggregateId",sequence,"projectId","flexibleProjectId","taskId","taskEntryId","actorId","actorRole","actorVersion",operation,"correlationId","causationId","idempotencyKey","occurredAt",payload)
 VALUES (eid,'TASK_ACTIVITY',1,'UNIVERSAL_TASK',t.id,NEW.version,t."projectId",t."flexibleProjectId",t.id,NEW.id,NEW."actorId",NEW."actorRole",NEW."actorVersion",CASE WHEN t.type='GENERAL' THEN 'generalTaskCommand' WHEN t.type IN ('FILE_UPLOAD','DATA_INPUT') THEN 'deliverableTaskCommand' ELSE 'conceptTaskCommand' END,t.id,NEW.id,eid,NEW."createdAt",
 jsonb_build_object('action',NEW.action,'status',t.status,'directorOverride',NEW."directorOverride"));
 INSERT INTO "RuntimeTaskEventContext" ("eventId","taskId","projectId") SELECT eid,t.id,c."projectId" FROM "RuntimeTaskContext" c WHERE c."taskId"=t.id;
 INSERT INTO "EventOutbox" ("eventId","consumerKey") VALUES (eid,'internal.audit.v1');
 RETURN NEW;
END $function$
;

CREATE TABLE "RuntimeTaskTarget" (
 "taskId" TEXT NOT NULL PRIMARY KEY,
 "stageId" TEXT NOT NULL,
 "capabilityId" TEXT NOT NULL, "fieldId" TEXT,

 CONSTRAINT "RuntimeTaskTarget_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "UniversalTaskTarget"("taskId") ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT "RuntimeTaskTarget_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "RuntimeStage"(id) ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE INDEX "RuntimeTaskTarget_stageId_idx" ON "RuntimeTaskTarget"("stageId");

CREATE TABLE "RuntimeTaskApplication" (
 "applicationId" TEXT NOT NULL PRIMARY KEY,
 "activityId" TEXT NOT NULL,

 CONSTRAINT "RuntimeTaskApplication_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "UniversalTaskApplication"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT "RuntimeTaskApplication_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "RuntimeActivity"(id) ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX "RuntimeTaskApplication_activityId_key" ON "RuntimeTaskApplication"("activityId");

CREATE TABLE "RuntimeTaskPublication" (
 "publicationId" TEXT NOT NULL PRIMARY KEY,
 "submissionId" TEXT NOT NULL,

 CONSTRAINT "RuntimeTaskPublication_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "UniversalTaskPublication"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT "RuntimeTaskPublication_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "RuntimeFileSubmission"(id) ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX "RuntimeTaskPublication_submissionId_key" ON "RuntimeTaskPublication"("submissionId");

ALTER TABLE "UniversalTaskTarget" DROP CONSTRAINT "UniversalTaskTarget_values";
ALTER TABLE "UniversalTaskTarget" ADD CONSTRAINT "UniversalTaskTarget_values" CHECK (
 kind IN ('private-folder','research-folder','checklist','runtime-file','runtime-field') AND "inputMode" IN ('TEXT','FILE','TEXT_FILE') AND
 (kind='checklist' OR (kind='runtime-field' AND "inputMode"='TEXT') OR (kind NOT IN ('checklist','runtime-field') AND "inputMode"='FILE')) AND
 "identityHash" ~ '^[a-f0-9]{64}$' AND "expectedHash" ~ '^[a-f0-9]{64}$' AND jsonb_typeof(identity)='object' AND jsonb_typeof("expectedState")='object');
ALTER TABLE "UniversalTaskPublication" DROP CONSTRAINT "UniversalTaskPublication_values";
ALTER TABLE "UniversalTaskPublication" ADD CONSTRAINT "UniversalTaskPublication_values" CHECK ("attachmentId" IS NULL OR "publishedVersionId" IS NOT NULL);

-- Only an exact, pending Tasker reservation may import another actor's sealed file.
CREATE FUNCTION flux_runtime_task_import(sid text, cid text, vid text, uid text) RETURNS boolean LANGUAGE sql AS $$
 SELECT EXISTS(SELECT 1 FROM "UniversalTaskPublication" pub
 JOIN "UniversalTaskApplication" app ON app.id=pub."applicationId"
 JOIN "UniversalTask" t ON t.id=app."taskId"
 JOIN "RuntimeTaskTarget" rt ON rt."taskId"=t.id
 JOIN "RuntimeTaskContext" ctx ON ctx."taskId"=t.id
 JOIN "SharedFileVersion" src ON src.id=pub."sourceVersionId"
 JOIN "SharedFileVersion" dst ON dst.id=vid
 JOIN "UniversalTaskUpload" u ON u."versionId"=src.id AND u."taskId"=t.id
 JOIN "UniversalTaskEntry" request ON request.id=app."requestEntryId"
 WHERE rt."stageId"=sid AND rt."capabilityId"=cid AND rt."fieldId" IS NULL AND t.type='FILE_UPLOAD'
 AND t.status='COMPLETION_REQUESTED' AND app.state IN ('PREPARED','FAILED') AND app."reviewerId"=uid
 AND uid=flux_task_actor()->>'userId' AND flux_runtime_authorized(ctx."projectId",uid) AND flux_runtime_authorized(ctx."projectId",t."ownerId")
 AND request.snapshot->'fileVersionIds' ? src.id AND request.snapshot->'submissionIds' ? u."submittedEntryId"
 AND src.status='READY' AND src."applicationSealed" AND src."objectETag" IS NOT NULL
 AND dst."storageKey"=pub."storageKey" AND dst.bucket=pub.bucket AND dst."uploadedById"=src."uploadedById"
 AND dst."originalFileName"=src."originalFileName" AND dst."mimeType"=src."mimeType" AND dst."fileSize"=src."fileSize");
$$;
CREATE OR REPLACE FUNCTION public.flux_runtime_guard()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE pid text; uid text; sid text; role_name text; av int; p "RuntimeProject"; s "RuntimeStage"; pv "PublishedWorkflowVersion"; v "SharedFileVersion"; old_file "RuntimeFileSubmission"; b jsonb; f jsonb; item jsonb; val jsonb; key text; n int;
BEGIN
 IF TG_OP IN ('DELETE','TRUNCATE') THEN RAISE EXCEPTION 'Runtime history is retained' USING ERRCODE='23514'; END IF;
 uid:=current_setting('flux.runtime_actor',true); sid:=current_setting('flux.runtime_session',true);
 SELECT "businessRole"::text,"authorizationVersion" INTO role_name,av FROM "UserAuthorization" WHERE "userId"=uid;
 IF NOT coalesce(flux_workflow_actor_current(uid,role_name,av,sid),false) OR role_name NOT IN ('DIRECTOR','SENIOR_PROJECT_MANAGER','JUNIOR_PROJECT_MANAGER') THEN RAISE EXCEPTION 'Current runtime session required' USING ERRCODE='23514'; END IF;
 IF TG_TABLE_NAME='RuntimeProject' THEN
  IF TG_OP='INSERT' THEN
   SELECT * INTO STRICT pv FROM "PublishedWorkflowVersion" WHERE id=NEW."publishedVersionId";
   IF NOT ((role_name='DIRECTOR' AND NEW."createdById"=uid) OR (role_name='SENIOR_PROJECT_MANAGER' AND NEW."createdById"=uid AND NEW."ownerId"=uid) OR (role_name='DIRECTOR' AND EXISTS(SELECT 1 FROM "RuntimeCreationDecision" d JOIN "RuntimeCreationRequest" r ON r.id=d."requestId" WHERE d."projectId"=NEW.id AND d.outcome='APPROVE' AND d."reviewerId"=uid AND r."requesterId"=NEW."createdById"))) OR NEW.revision<>1 OR NEW."workflowId"<>pv."workflowId" OR NEW."versionNumber"<>pv.number OR NEW."definitionHash"<>pv."configurationHash" OR
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
  IF TG_OP<>'INSERT' OR p.revision<>1 OR role_name NOT IN ('DIRECTOR','SENIOR_PROJECT_MANAGER') OR NEW."addedById"<>uid OR NEW."userId"=p."ownerId" OR NOT EXISTS(SELECT 1 FROM "UserAuthorization" WHERE "userId"=NEW."userId" AND "accountStatus"='ACTIVE' AND "businessRole" IS NOT NULL AND (NEW.role='EXECUTOR' OR "businessRole"::text IN ('DIRECTOR','SENIOR_PROJECT_MANAGER','JUNIOR_PROJECT_MANAGER'))) THEN RAISE EXCEPTION 'Initial genuine participants only' USING ERRCODE='23514'; END IF;
 ELSIF TG_TABLE_NAME='RuntimeStage' THEN
  IF TG_OP='INSERT' THEN
   SELECT * INTO STRICT pv FROM "PublishedWorkflowVersion" WHERE id=p."publishedVersionId";
   IF p.revision<>1 OR role_name NOT IN ('DIRECTOR','SENIOR_PROJECT_MANAGER') OR NEW.revision<>0 OR NEW."evidenceRevision"<>0 OR NEW.state<>'AVAILABLE' OR NEW.configuration IS DISTINCT FROM pv.definition->'stages'->NEW.position OR NEW."definitionStageId"<>NEW.configuration->>'id' THEN RAISE EXCEPTION 'Runtime stage must bind exact immutable definition' USING ERRCODE='23514'; END IF;
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
   IF NEW.state<>'UPLOADING' OR (NEW."submittedById"<>uid AND NOT flux_runtime_task_import(NEW."stageId",NEW."capabilityId",NEW."versionId",uid)) OR v.status<>'UPLOADING' OR NOT v."applicationSealed" THEN RAISE EXCEPTION 'Attributed runtime upload intent required' USING ERRCODE='23514'; END IF;
   IF NEW."supersedesId" IS NOT NULL THEN
    SELECT * INTO STRICT old_file FROM "RuntimeFileSubmission" WHERE id=NEW."supersedesId";
    IF old_file."stageId"<>NEW."stageId" OR old_file."capabilityId"<>NEW."capabilityId" OR old_file.state='UPLOADING' OR (SELECT "fileId" FROM "SharedFileVersion" WHERE id=old_file."versionId")<>v."fileId" THEN RAISE EXCEPTION 'File revisions cannot cross boundaries' USING ERRCODE='23514'; END IF;
   END IF;
  ELSE
   IF (to_jsonb(NEW)-ARRAY['state','submittedAt','reviewedById','reviewedAt','reason','failureCode']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','submittedAt','reviewedById','reviewedAt','reason','failureCode']) OR EXISTS(SELECT 1 FROM "RuntimeFileSubmission" WHERE "supersedesId"=NEW.id) THEN RAISE EXCEPTION 'File source and history are retained' USING ERRCODE='23514'; END IF;
   IF OLD.state='UPLOADING' THEN
    IF (uid<>OLD."submittedById" AND NOT flux_runtime_task_import(NEW."stageId",NEW."capabilityId",NEW."versionId",uid)) OR NEW.state NOT IN ('SUBMITTED','FAILED') OR v.status::text<>(CASE NEW.state WHEN 'FAILED' THEN 'FAILED' ELSE 'READY' END) THEN RAISE EXCEPTION 'Only uploader finalizes exact version' USING ERRCODE='23514'; END IF;
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
END $function$
;
CREATE OR REPLACE FUNCTION public.flux_task_deliverable_guard()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE t "UniversalTask"; a jsonb; app "UniversalTaskApplication"; r "UniversalTaskEntry";
BEGIN
 IF TG_OP IN ('DELETE','TRUNCATE') THEN RAISE EXCEPTION 'Deliverable evidence is retained' USING ERRCODE='23514'; END IF;
 a:=flux_task_actor();
 IF TG_TABLE_NAME='UniversalTaskPublication' THEN
  SELECT * INTO STRICT app FROM "UniversalTaskApplication" WHERE id=NEW."applicationId";
  SELECT * INTO STRICT t FROM "UniversalTask" WHERE id=app."taskId";
 ELSE SELECT * INTO STRICT t FROM "UniversalTask" WHERE id=NEW."taskId"; END IF;
 IF t.type NOT IN ('FILE_UPLOAD','DATA_INPUT') OR (t."projectId" IS NULL AND NOT EXISTS(SELECT 1 FROM "RuntimeTaskContext" WHERE "taskId"=t.id)) OR t."deletedAt" IS NOT NULL OR
   (a->>'businessRole'<>'DIRECTOR' AND a->>'userId'<>t."ownerId") THEN RAISE EXCEPTION 'Deliverable owner required' USING ERRCODE='23514'; END IF;
 IF TG_TABLE_NAME='UniversalTaskTarget' THEN
  IF (t.type='DATA_INPUT') IS DISTINCT FROM (NEW.kind IN ('checklist','runtime-field')) OR NEW.identity->>'projectId' IS DISTINCT FROM coalesce(t."projectId",(SELECT "projectId" FROM "RuntimeTaskContext" WHERE "taskId"=t.id)) OR
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
  IF TG_OP='UPDATE' AND (OLD."publishedVersionId" IS NOT NULL OR (to_jsonb(NEW)-ARRAY['attachmentId','publishedVersionId']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['attachmentId','publishedVersionId'])) THEN
    RAISE EXCEPTION 'Publication identity is immutable' USING ERRCODE='23514'; END IF;
  IF t."projectId" IS NOT NULL AND num_nonnulls(NEW."attachmentId",NEW."publishedVersionId") NOT IN (0,2) THEN RAISE EXCEPTION 'Native publication requires attachment' USING ERRCODE='23514'; END IF;
  IF t."projectId" IS NULL AND (NEW."attachmentId" IS NOT NULL OR (NEW."publishedVersionId" IS NOT NULL AND NOT EXISTS(
   SELECT 1 FROM "RuntimeTaskPublication" rp JOIN "RuntimeFileSubmission" f ON f.id=rp."submissionId" JOIN "SharedFileVersion" v ON v.id=f."versionId"
   JOIN "SharedFileVersion" src ON src.id=NEW."sourceVersionId"
   WHERE rp."publicationId"=NEW.id AND v.id=NEW."publishedVersionId" AND f.state='SUBMITTED' AND v.status='READY' AND v."objectETag"=src."objectETag"
   AND v."storageKey"=NEW."storageKey" AND v.bucket=NEW.bucket AND f."submittedById"=src."uploadedById"
   AND (src."checksumSha256" IS NULL OR v."checksumSha256"=src."checksumSha256")))) THEN RAISE EXCEPTION 'Exact runtime publication required' USING ERRCODE='23514'; END IF;
  IF NEW."attachmentId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "ProjectAttachment" p JOIN "SharedFileVersion" v ON v.id=NEW."publishedVersionId"
    JOIN "SharedFileVersion" source ON source.id=NEW."sourceVersionId" JOIN "SharedFileReference" ref ON ref."projectAttachmentId"=p.id AND ref."versionId"=v.id
    WHERE p.id=NEW."attachmentId" AND p."projectId"=t."projectId" AND p.status='READY' AND v.status='READY' AND p."storageKey"=NEW."storageKey"
    AND p.bucket=NEW.bucket AND v."objectETag"=source."objectETag" AND p."uploadedById"=source."uploadedById" AND p."reviewedById"=app."reviewerId") THEN
    RAISE EXCEPTION 'Ready native publication with exact provenance required' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $function$;
CREATE OR REPLACE FUNCTION public.flux_task_application_consistency()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
  IF (SELECT count(*) FROM "UniversalTaskPublication" WHERE "applicationId"=a.id AND "publishedVersionId" IS NOT NULL)<>jsonb_array_length(e.snapshot->'fileVersionIds') OR
   (NOT EXISTS (SELECT 1 FROM "RuntimeTaskApplication" ra JOIN "RuntimeActivity" h ON h.id=ra."activityId"
    WHERE ra."applicationId"=a.id AND h."actorId"=a."reviewerId" AND h.snapshot->'taskApplication'->>'applicationId'=a.id)
   AND NOT EXISTS (SELECT 1 FROM "ProjectActivityLog" WHERE metadata->>'applicationId'=a.id AND metadata->>'taskEntryId'=a."acceptedEntryId" AND "actorId"=a."reviewerId")) THEN
   RAISE EXCEPTION 'Complete publication and native project history required' USING ERRCODE='23514'; END IF;
 ELSIF TG_TABLE_NAME='UniversalTaskPublication' THEN
  IF NEW."publishedVersionId" IS NOT NULL THEN RAISE EXCEPTION 'Unaccepted publication is forbidden' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NULL;
END $function$;
CREATE OR REPLACE FUNCTION public.flux_task_deliverable_consistency()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE t "UniversalTask";
BEGIN
 SELECT * INTO STRICT t FROM "UniversalTask" WHERE id=NEW.id;
 IF t.type NOT IN ('FILE_UPLOAD','DATA_INPUT') THEN RETURN NULL; END IF;
 IF NOT EXISTS (SELECT 1 FROM "UniversalTaskTarget" WHERE "taskId"=t.id) OR
  (t.status='COMPLETED' AND NOT EXISTS (SELECT 1 FROM "UniversalTaskApplication" a JOIN "UniversalTaskEntry" e ON e.id=a."acceptedEntryId"
   WHERE a."taskId"=t.id AND a.state='APPLIED' AND e.action='APPROVE' AND NOT EXISTS (
     SELECT 1 FROM "UniversalTaskPublication" p WHERE p."applicationId"=a.id AND (p."publishedVersionId" IS NULL OR (t."projectId" IS NOT NULL AND p."attachmentId" IS NULL))))) THEN
  RAISE EXCEPTION 'Atomic deliverable target/application required' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $function$;

CREATE FUNCTION flux_runtime_deliverable_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a jsonb; t "UniversalTask"; target "UniversalTaskTarget"; rt "RuntimeTaskTarget"; s "RuntimeStage"; p "RuntimeProject"; cap jsonb; field jsonb;
 app "UniversalTaskApplication"; pub "UniversalTaskPublication"; submission "RuntimeFileSubmission"; h "RuntimeActivity";
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Runtime deliverable links are immutable' USING ERRCODE='23514'; END IF;
 a:=flux_task_actor();
 IF TG_TABLE_NAME='RuntimeTaskTarget' THEN
  SELECT * INTO STRICT t FROM "UniversalTask" WHERE id=NEW."taskId";
  SELECT * INTO STRICT target FROM "UniversalTaskTarget" WHERE "taskId"=t.id;
  SELECT * INTO STRICT s FROM "RuntimeStage" WHERE id=NEW."stageId";
  SELECT * INTO STRICT p FROM "RuntimeProject" WHERE id=s."projectId" FOR UPDATE;
  SELECT cb INTO cap FROM jsonb_array_elements(s.configuration->'capabilities') cb WHERE cb->>'id'=NEW."capabilityId";
  SELECT f INTO field FROM jsonb_array_elements(coalesce(cap->'fields','[]')) f WHERE f->>'id'=NEW."fieldId";
  IF t.version<>1 OR t.status<>'OPEN' OR t."ownerId"<>a->>'userId' OR NOT flux_runtime_authorized(p.id,t."ownerId") OR
   NOT EXISTS(SELECT 1 FROM "RuntimeTaskContext" WHERE "taskId"=t.id AND "projectId"=p.id AND "sourceTaskId" IS NULL) OR
   s.state='COMPLETED' OR cap IS NULL OR target.identity->>'stageId' IS DISTINCT FROM s.id OR target.identity->>'capabilityId' IS DISTINCT FROM NEW."capabilityId" OR
   target.identity->>'fieldId' IS DISTINCT FROM NEW."fieldId" OR target.identity->>'publishedVersionId' IS DISTINCT FROM p."publishedVersionId" OR target.identity->>'definitionHash' IS DISTINCT FROM p."definitionHash" OR
   target.identity->>'definitionStageId' IS DISTINCT FROM s."definitionStageId" OR target.identity->'capability' IS DISTINCT FROM cap OR
   (t.type='FILE_UPLOAD' AND (target.kind<>'runtime-file' OR NEW."fieldId" IS NOT NULL OR cap->>'type'<>'FILE_REQUIREMENT')) OR
   (t.type='DATA_INPUT' AND (target.kind<>'runtime-field' OR field IS NULL OR field->>'type' NOT IN ('SHORT_TEXT','LONG_TEXT','NUMBER','DATE','SELECT') OR target.identity->'field' IS DISTINCT FROM field)) OR
   t.type NOT IN ('FILE_UPLOAD','DATA_INPUT') THEN RAISE EXCEPTION 'Exact authorized published runtime target required' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(s.configuration->'gates') g WHERE g->>'type'='PRECEDING_STAGE' AND NOT EXISTS(SELECT 1 FROM "RuntimeStage" prior WHERE prior."projectId"=p.id AND prior."definitionStageId"=g->>'stageId' AND prior.state='COMPLETED')) OR
   EXISTS(SELECT 1 FROM "RuntimeApprovalSubmission" sub JOIN "ApprovalRequest" req ON req.id=sub."approvalRequestId" CROSS JOIN LATERAL jsonb_array_elements(s.configuration->'capabilities') cb WHERE sub."stageId"=s.id AND req.state='REJECTED' AND cb->>'id'=sub."capabilityId" AND cb->>'rejection'='BLOCK_STAGE') THEN RAISE EXCEPTION 'Unavailable runtime target' USING ERRCODE='23514'; END IF;
 ELSIF TG_TABLE_NAME='RuntimeTaskPublication' THEN
  SELECT * INTO STRICT pub FROM "UniversalTaskPublication" WHERE id=NEW."publicationId";
  SELECT * INTO STRICT app FROM "UniversalTaskApplication" WHERE id=pub."applicationId";
  SELECT * INTO STRICT rt FROM "RuntimeTaskTarget" WHERE "taskId"=app."taskId";
  SELECT * INTO STRICT submission FROM "RuntimeFileSubmission" WHERE id=NEW."submissionId";
  IF submission."stageId"<>rt."stageId" OR submission."capabilityId"<>rt."capabilityId" OR rt."fieldId" IS NOT NULL OR
    NOT flux_runtime_task_import(submission."stageId",submission."capabilityId",submission."versionId",a->>'userId') THEN RAISE EXCEPTION 'Exact task runtime file source required' USING ERRCODE='23514'; END IF;
 ELSE
  SELECT * INTO STRICT app FROM "UniversalTaskApplication" WHERE id=NEW."applicationId";
  SELECT * INTO STRICT t FROM "UniversalTask" WHERE id=app."taskId";
  SELECT * INTO STRICT rt FROM "RuntimeTaskTarget" WHERE "taskId"=t.id;
  SELECT * INTO STRICT h FROM "RuntimeActivity" WHERE id=NEW."activityId";
  IF app.state<>'APPLIED' OR app."reviewerId"<>a->>'userId' OR h."actorId"<>app."reviewerId" OR h."stageId"<>rt."stageId" OR h.snapshot->'taskApplication'->>'applicationId' IS DISTINCT FROM app.id OR
   (t.type='DATA_INPUT' AND (h.action<>'FIELDS' OR (h.snapshot->'command'->'values') IS DISTINCT FROM jsonb_build_object(rt."fieldId",(SELECT snapshot->'proposedValue'->'value' FROM "UniversalTaskEntry" WHERE id=app."requestEntryId")))) OR
   (t.type='FILE_UPLOAD' AND h.action<>'FILE_SUBMITTED') OR NOT flux_runtime_authorized(h."projectId",t."ownerId") OR NOT flux_runtime_authorized(h."projectId",h."actorId") THEN RAISE EXCEPTION 'Atomic genuine runtime application history required' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['RuntimeTaskTarget','RuntimeTaskApplication','RuntimeTaskPublication'] LOOP
 EXECUTE format('CREATE TRIGGER flux_runtime_deliverable_guard BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION flux_runtime_deliverable_guard()',t);
 EXECUTE format('CREATE TRIGGER flux_runtime_deliverable_truncate BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION flux_runtime_deliverable_guard()',t);
END LOOP; END $$;

CREATE FUNCTION flux_runtime_deliverable_consistency() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE t "UniversalTask"; target "UniversalTaskTarget"; f "RuntimeFileSubmission";
BEGIN
 IF TG_TABLE_NAME='RuntimeFileSubmission' THEN
  SELECT * INTO STRICT f FROM "RuntimeFileSubmission" WHERE id=NEW.id;
  IF NEW."submittedById" IS DISTINCT FROM current_setting('flux.runtime_actor',true) AND NOT EXISTS(
   SELECT 1 FROM "RuntimeTaskPublication" rp JOIN "UniversalTaskPublication" pub ON pub.id=rp."publicationId" JOIN "UniversalTaskApplication" app ON app.id=pub."applicationId"
   WHERE rp."submissionId"=f.id AND app.state='APPLIED' AND pub."publishedVersionId"=f."versionId" AND f.state='SUBMITTED') THEN RAISE EXCEPTION 'Imported runtime file requires atomic accepted application' USING ERRCODE='23514'; END IF;
  RETURN NULL;
 END IF;
 SELECT * INTO STRICT t FROM "UniversalTask" WHERE id=CASE WHEN TG_TABLE_NAME='UniversalTask' THEN to_jsonb(NEW)->>'id' ELSE to_jsonb(NEW)->>'taskId' END;
 SELECT * INTO target FROM "UniversalTaskTarget" WHERE "taskId"=t.id;
 IF num_nonnulls(t."projectId",t."flexibleProjectId")=0 THEN
  IF (t.type IN ('FILE_UPLOAD','DATA_INPUT')) IS DISTINCT FROM EXISTS(SELECT 1 FROM "RuntimeTaskTarget" WHERE "taskId"=t.id) OR
    (t.type='GENERAL' AND target."taskId" IS NOT NULL) THEN RAISE EXCEPTION 'Typed runtime target required' USING ERRCODE='23514'; END IF;
 ELSE
  IF target.kind IN ('runtime-file','runtime-field') OR EXISTS(SELECT 1 FROM "RuntimeTaskTarget" WHERE "taskId"=t.id) THEN RAISE EXCEPTION 'Native task cannot bind runtime target' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER flux_runtime_deliverable_consistency AFTER INSERT OR UPDATE ON "UniversalTask" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION flux_runtime_deliverable_consistency();
CREATE CONSTRAINT TRIGGER flux_runtime_deliverable_consistency AFTER INSERT OR UPDATE ON "UniversalTaskTarget" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION flux_runtime_deliverable_consistency();
CREATE CONSTRAINT TRIGGER flux_runtime_deliverable_consistency AFTER INSERT ON "RuntimeTaskTarget" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION flux_runtime_deliverable_consistency();
CREATE CONSTRAINT TRIGGER flux_runtime_deliverable_consistency AFTER INSERT ON "RuntimeFileSubmission" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION flux_runtime_deliverable_consistency();


-- Phase 4.4D: exact runtime-stage inspection references.
CREATE TABLE "RuntimeTaskReference" (
 "referenceId" TEXT NOT NULL PRIMARY KEY,
 "projectId" TEXT NOT NULL,
 "submissionId" TEXT NOT NULL,
 CONSTRAINT "RuntimeTaskReference_referenceId_fkey" FOREIGN KEY ("referenceId") REFERENCES "UniversalTaskReference"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT "RuntimeTaskReference_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "RuntimeProject"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT "RuntimeTaskReference_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "RuntimeFileSubmission"("id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE INDEX "RuntimeTaskReference_projectId_idx" ON "RuntimeTaskReference"("projectId");
CREATE INDEX "RuntimeTaskReference_submissionId_idx" ON "RuntimeTaskReference"("submissionId");
ALTER TABLE "UniversalTaskReference" DROP CONSTRAINT "UniversalTaskReference_values";
ALTER TABLE "UniversalTaskReference" ADD CONSTRAINT "UniversalTaskReference_values" CHECK (
 kind IN ('INSPECTION','INSPIRATION') AND num_nonnulls("sourceUploadId","sourceAttachmentId")<=1 AND
 ((kind='INSPECTION' AND "sourceSubmissionId" IS NULL AND "sourceReviewId" IS NULL AND "sourceState"='SEALED') OR
  (kind='INSPIRATION' AND "sourceUploadId" IS NOT NULL AND "sourceSubmissionId" IS NOT NULL AND
   "sourceState" IN ('SUBMITTED','APPROVED') AND ("sourceState"='APPROVED')=("sourceReviewId" IS NOT NULL))));

CREATE FUNCTION flux_runtime_source_authorized(uid text, pid text) RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
 RETURN EXISTS(SELECT 1 FROM "UserAuthorization" a JOIN "RuntimeProject" p ON p.id=pid
  WHERE a."userId"=uid AND a."accountStatus"='ACTIVE' AND p.state='ACTIVE' AND
  (a."businessRole"='DIRECTOR' OR (a."businessRole" IN ('SENIOR_PROJECT_MANAGER','JUNIOR_PROJECT_MANAGER') AND
   (p."ownerId"=uid OR EXISTS(SELECT 1 FROM "RuntimeParticipant" WHERE "projectId"=p.id AND "userId"=uid AND role='CO_OWNER')))));
END $$;
CREATE FUNCTION flux_runtime_reference_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r "UniversalTaskReference"; t "UniversalTask"; sub "RuntimeFileSubmission"; st "RuntimeStage"; v "SharedFileVersion"; a jsonb; acceptance text;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Runtime source references are immutable and retained' USING ERRCODE='23514'; END IF;
 a:=flux_task_actor();
 SELECT * INTO STRICT r FROM "UniversalTaskReference" WHERE id=NEW."referenceId";
 SELECT * INTO STRICT t FROM "UniversalTask" WHERE id=r."taskId";
 PERFORM id FROM "RuntimeProject" WHERE id=NEW."projectId" FOR SHARE;
 SELECT * INTO STRICT sub FROM "RuntimeFileSubmission" WHERE id=NEW."submissionId";
 SELECT * INTO STRICT st FROM "RuntimeStage" WHERE id=sub."stageId" FOR SHARE;
 SELECT * INTO STRICT v FROM "SharedFileVersion" WHERE id=sub."versionId";
 SELECT c->>'acceptance' INTO acceptance FROM jsonb_array_elements(st.configuration->'capabilities') c WHERE c->>'id'=sub."capabilityId" AND c->>'type'='FILE_REQUIREMENT';
 IF t.type<>'INSPECT_FILE' OR r.kind<>'INSPECTION' OR num_nonnulls(r."sourceUploadId",r."sourceAttachmentId")<>0 OR
  NOT EXISTS(SELECT 1 FROM "RuntimeTaskContext" WHERE "taskId"=t.id AND "projectId"=NEW."projectId") OR
  st."projectId"<>NEW."projectId" OR r."versionId"<>sub."versionId" OR
  v.status<>'READY' OR v."objectETag" IS NULL OR NOT(v."applicationSealed" OR v."objectVersionId" IS NOT NULL) OR
  v."uploadedById" IS DISTINCT FROM sub."submittedById" OR
  NOT EXISTS(SELECT 1 FROM "SharedFile" WHERE id=v."fileId" AND "runtimeStageId"=st.id) OR
  NOT EXISTS(SELECT 1 FROM "SharedFileReference" WHERE "runtimeSubmissionId"=sub.id AND "versionId"=v.id AND role='SOURCE') OR
  acceptance IS NULL OR NOT(sub.state='ACCEPTED' OR (acceptance='NONE' AND sub.state='SUBMITTED')) OR
  EXISTS(SELECT 1 FROM "RuntimeFileSubmission" WHERE "supersedesId"=sub.id) OR
  NOT flux_runtime_source_authorized(t."ownerId",st."projectId") OR NOT flux_runtime_source_authorized(a->>'userId',st."projectId") THEN
  RAISE EXCEPTION 'Eligible exact runtime file and current delegation required' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER flux_runtime_reference_guard BEFORE INSERT OR UPDATE OR DELETE ON "RuntimeTaskReference" FOR EACH ROW EXECUTE FUNCTION flux_runtime_reference_guard();
CREATE TRIGGER flux_runtime_reference_truncate BEFORE TRUNCATE ON "RuntimeTaskReference" FOR EACH STATEMENT EXECUTE FUNCTION flux_runtime_reference_guard();

CREATE FUNCTION flux_runtime_reference_consistency() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r "UniversalTaskReference"; count_sources int; task_project text; source_project text;
BEGIN
 IF TG_TABLE_NAME='UniversalTaskReference' THEN r:=NEW;
 ELSE SELECT * INTO STRICT r FROM "UniversalTaskReference" WHERE id=NEW."referenceId"; END IF;
 SELECT count(*) INTO count_sources FROM "RuntimeTaskReference" WHERE "referenceId"=r.id;
 IF count_sources+num_nonnulls(r."sourceUploadId",r."sourceAttachmentId")<>1 THEN
  RAISE EXCEPTION 'Exactly one genuine reference source required' USING ERRCODE='23514'; END IF;
 SELECT "projectId" INTO task_project FROM "RuntimeTaskContext" WHERE "taskId"=r."taskId";
 IF count_sources=1 AND task_project IS NULL THEN RAISE EXCEPTION 'Runtime reference cannot bind a native task' USING ERRCODE='23514'; END IF;
 IF r."sourceUploadId" IS NOT NULL THEN
  SELECT c."projectId" INTO source_project FROM "UniversalTaskUpload" u LEFT JOIN "RuntimeTaskContext" c ON c."taskId"=u."taskId" WHERE u.id=r."sourceUploadId";
  IF task_project IS DISTINCT FROM source_project THEN RAISE EXCEPTION 'Same genuine runtime source required' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER flux_runtime_reference_consistency AFTER INSERT ON "UniversalTaskReference" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION flux_runtime_reference_consistency();
CREATE CONSTRAINT TRIGGER flux_runtime_reference_consistency AFTER INSERT ON "RuntimeTaskReference" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION flux_runtime_reference_consistency();

CREATE OR REPLACE FUNCTION flux_task_reference_guard() RETURNS trigger LANGUAGE plpgsql AS $$
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
   IF NOT EXISTS (SELECT 1 FROM "UniversalTaskUpload" WHERE id=NEW."sourceUploadId" AND "taskId"=t.id AND "versionId"=v.id AND "uploadedById"=t."ownerId") AND NOT EXISTS (
    SELECT 1 FROM "UniversalTaskFamilyLink" family JOIN "UniversalTaskReference" ref ON ref."taskId"=family."sourceTaskId"
    JOIN "UniversalTaskUpload" upload ON upload.id=ref."sourceUploadId" JOIN "UniversalTask" original ON original.id=upload."taskId"
    WHERE family."taskId"=t.id AND family."createdEntryId"=e.id AND e.action='CREATED' AND ref.kind='INSPECTION' AND
    ref."versionId"=v.id AND upload.id=NEW."sourceUploadId" AND (a->>'businessRole'='DIRECTOR' OR original."ownerId"=a->>'userId')) THEN
    RAISE EXCEPTION 'Real owner source upload required' USING ERRCODE='23514'; END IF;
  ELSIF NEW."sourceAttachmentId" IS NOT NULL THEN
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


-- AlterEnum
ALTER TYPE "ApprovalSubjectType" ADD VALUE 'RUNTIME_DOCUMENT';

-- AlterEnum
ALTER TYPE "BusinessEventType" ADD VALUE 'RUNTIME_COMPLETION_ACTIVITY';

-- CreateTable
CREATE TABLE "RuntimeCompletionActivity" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
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

    CONSTRAINT "RuntimeCompletionActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RuntimeDocumentPolicy" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "settings" JSONB NOT NULL,
    "snapshotHash" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,

    CONSTRAINT "RuntimeDocumentPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RuntimeDocumentFile" (
    "fileId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "category" "ProjectCompletionDocumentType" NOT NULL,

    CONSTRAINT "RuntimeDocumentFile_pkey" PRIMARY KEY ("fileId")
);

-- CreateTable
CREATE TABLE "RuntimeDocumentSubmission" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "category" "ProjectCompletionDocumentType" NOT NULL,
    "versionId" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'UPLOADING',
    "stagingKey" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "preparedActivityId" TEXT NOT NULL,
    "submittedActivityId" TEXT,
    "reviewedActivityId" TEXT,
    "approvalRequestId" TEXT,

    CONSTRAINT "RuntimeDocumentSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RuntimeDocumentReference" (
    "referenceId" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,

    CONSTRAINT "RuntimeDocumentReference_pkey" PRIMARY KEY ("referenceId")
);

-- CreateTable
CREATE TABLE "RuntimeDocumentProvenance" (
    "provenanceId" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,

    CONSTRAINT "RuntimeDocumentProvenance_pkey" PRIMARY KEY ("provenanceId")
);

-- CreateTable
CREATE TABLE "RuntimeCompletionRequest" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "snapshot" JSONB NOT NULL,
    "snapshotHash" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "supersededActivityId" TEXT,

    CONSTRAINT "RuntimeCompletionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RuntimeCompletionDecision" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "snapshotHash" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,

    CONSTRAINT "RuntimeCompletionDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RuntimeCompletionActivity_eventId_key" ON "RuntimeCompletionActivity"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "RuntimeCompletionActivity_actorId_commandId_key" ON "RuntimeCompletionActivity"("actorId", "commandId");

-- CreateIndex
CREATE UNIQUE INDEX "RuntimeCompletionActivity_projectId_sequence_key" ON "RuntimeCompletionActivity"("projectId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "RuntimeDocumentPolicy_activityId_key" ON "RuntimeDocumentPolicy"("activityId");

-- CreateIndex
CREATE UNIQUE INDEX "RuntimeDocumentPolicy_projectId_revision_key" ON "RuntimeDocumentPolicy"("projectId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "RuntimeDocumentFile_projectId_category_key" ON "RuntimeDocumentFile"("projectId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "RuntimeDocumentSubmission_versionId_key" ON "RuntimeDocumentSubmission"("versionId");

-- CreateIndex
CREATE UNIQUE INDEX "RuntimeDocumentSubmission_preparedActivityId_key" ON "RuntimeDocumentSubmission"("preparedActivityId");

-- CreateIndex
CREATE UNIQUE INDEX "RuntimeDocumentSubmission_submittedActivityId_key" ON "RuntimeDocumentSubmission"("submittedActivityId");

-- CreateIndex
CREATE UNIQUE INDEX "RuntimeDocumentSubmission_reviewedActivityId_key" ON "RuntimeDocumentSubmission"("reviewedActivityId");

-- CreateIndex
CREATE UNIQUE INDEX "RuntimeDocumentSubmission_approvalRequestId_key" ON "RuntimeDocumentSubmission"("approvalRequestId");

-- CreateIndex
CREATE INDEX "RuntimeDocumentSubmission_projectId_category_idx" ON "RuntimeDocumentSubmission"("projectId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "RuntimeDocumentReference_submissionId_key" ON "RuntimeDocumentReference"("submissionId");

-- CreateIndex
CREATE UNIQUE INDEX "RuntimeDocumentProvenance_activityId_key" ON "RuntimeDocumentProvenance"("activityId");

-- CreateIndex
CREATE INDEX "RuntimeDocumentProvenance_submissionId_idx" ON "RuntimeDocumentProvenance"("submissionId");

-- CreateIndex
CREATE UNIQUE INDEX "RuntimeCompletionRequest_activityId_key" ON "RuntimeCompletionRequest"("activityId");

-- CreateIndex
CREATE UNIQUE INDEX "RuntimeCompletionRequest_supersededActivityId_key" ON "RuntimeCompletionRequest"("supersededActivityId");

-- CreateIndex
CREATE UNIQUE INDEX "RuntimeCompletionRequest_projectId_revision_key" ON "RuntimeCompletionRequest"("projectId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "RuntimeCompletionDecision_requestId_key" ON "RuntimeCompletionDecision"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "RuntimeCompletionDecision_activityId_key" ON "RuntimeCompletionDecision"("activityId");

-- CreateIndex
CREATE INDEX "RuntimeCompletionDecision_projectId_idx" ON "RuntimeCompletionDecision"("projectId");

-- AddForeignKey
ALTER TABLE "RuntimeCompletionActivity" ADD CONSTRAINT "RuntimeCompletionActivity_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "RuntimeProject"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RuntimeCompletionActivity" ADD CONSTRAINT "RuntimeCompletionActivity_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RuntimeCompletionActivity" ADD CONSTRAINT "RuntimeCompletionActivity_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "BusinessEvent"("id") ON DELETE RESTRICT ON UPDATE RESTRICT DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "RuntimeDocumentPolicy" ADD CONSTRAINT "RuntimeDocumentPolicy_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "RuntimeProject"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RuntimeDocumentPolicy" ADD CONSTRAINT "RuntimeDocumentPolicy_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "RuntimeCompletionActivity"("id") ON DELETE RESTRICT ON UPDATE RESTRICT DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "RuntimeDocumentFile" ADD CONSTRAINT "RuntimeDocumentFile_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "SharedFile"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RuntimeDocumentFile" ADD CONSTRAINT "RuntimeDocumentFile_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "RuntimeProject"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RuntimeDocumentSubmission" ADD CONSTRAINT "RuntimeDocumentSubmission_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "RuntimeProject"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RuntimeDocumentSubmission" ADD CONSTRAINT "RuntimeDocumentSubmission_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "RuntimeDocumentPolicy"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RuntimeDocumentSubmission" ADD CONSTRAINT "RuntimeDocumentSubmission_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "SharedFileVersion"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RuntimeDocumentSubmission" ADD CONSTRAINT "RuntimeDocumentSubmission_preparedActivityId_fkey" FOREIGN KEY ("preparedActivityId") REFERENCES "RuntimeCompletionActivity"("id") ON DELETE RESTRICT ON UPDATE RESTRICT DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "RuntimeDocumentSubmission" ADD CONSTRAINT "RuntimeDocumentSubmission_submittedActivityId_fkey" FOREIGN KEY ("submittedActivityId") REFERENCES "RuntimeCompletionActivity"("id") ON DELETE RESTRICT ON UPDATE RESTRICT DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "RuntimeDocumentSubmission" ADD CONSTRAINT "RuntimeDocumentSubmission_reviewedActivityId_fkey" FOREIGN KEY ("reviewedActivityId") REFERENCES "RuntimeCompletionActivity"("id") ON DELETE RESTRICT ON UPDATE RESTRICT DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "RuntimeDocumentSubmission" ADD CONSTRAINT "RuntimeDocumentSubmission_approvalRequestId_fkey" FOREIGN KEY ("approvalRequestId") REFERENCES "ApprovalRequest"("id") ON DELETE RESTRICT ON UPDATE RESTRICT DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "RuntimeDocumentReference" ADD CONSTRAINT "RuntimeDocumentReference_referenceId_fkey" FOREIGN KEY ("referenceId") REFERENCES "SharedFileReference"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RuntimeDocumentReference" ADD CONSTRAINT "RuntimeDocumentReference_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "RuntimeDocumentSubmission"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RuntimeDocumentProvenance" ADD CONSTRAINT "RuntimeDocumentProvenance_provenanceId_fkey" FOREIGN KEY ("provenanceId") REFERENCES "SharedFileProvenance"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RuntimeDocumentProvenance" ADD CONSTRAINT "RuntimeDocumentProvenance_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "RuntimeDocumentSubmission"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RuntimeDocumentProvenance" ADD CONSTRAINT "RuntimeDocumentProvenance_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "RuntimeCompletionActivity"("id") ON DELETE RESTRICT ON UPDATE RESTRICT DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "RuntimeCompletionRequest" ADD CONSTRAINT "RuntimeCompletionRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "RuntimeProject"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RuntimeCompletionRequest" ADD CONSTRAINT "RuntimeCompletionRequest_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "RuntimeDocumentPolicy"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RuntimeCompletionRequest" ADD CONSTRAINT "RuntimeCompletionRequest_supersededActivityId_fkey" FOREIGN KEY ("supersededActivityId") REFERENCES "RuntimeCompletionActivity"("id") ON DELETE RESTRICT ON UPDATE RESTRICT DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "RuntimeCompletionRequest" ADD CONSTRAINT "RuntimeCompletionRequest_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "RuntimeCompletionActivity"("id") ON DELETE RESTRICT ON UPDATE RESTRICT DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "RuntimeCompletionDecision" ADD CONSTRAINT "RuntimeCompletionDecision_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "RuntimeProject"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RuntimeCompletionDecision" ADD CONSTRAINT "RuntimeCompletionDecision_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "RuntimeCompletionRequest"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RuntimeCompletionDecision" ADD CONSTRAINT "RuntimeCompletionDecision_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "RuntimeCompletionActivity"("id") ON DELETE RESTRICT ON UPDATE RESTRICT DEFERRABLE INITIALLY DEFERRED;


-- Phase 4.4E. Policy, document and completion records are native runtime evidence.
CREATE UNIQUE INDEX "RuntimeCompletionRequest_pending" ON "RuntimeCompletionRequest"("projectId") WHERE state='PENDING';
CREATE UNIQUE INDEX "RuntimeCompletionDecision_approved" ON "RuntimeCompletionDecision"("projectId") WHERE outcome='APPROVE';
ALTER TABLE "RuntimeCompletionActivity" ADD CONSTRAINT "RuntimeCompletionActivity_shape" CHECK(sequence>0 AND "actorVersion">0 AND length("commandId") BETWEEN 8 AND 100 AND "commandHash" ~ '^[a-f0-9]{64}$' AND jsonb_typeof(snapshot)='object' AND jsonb_typeof(result)='object' AND action IN ('POLICY_APPROVED','UPLOAD_PREPARED','DOCUMENT_SUBMITTED','UPLOAD_CANCELLED','DOCUMENT_REVIEWED','COMPLETION_REQUESTED','COMPLETION_DECIDED'));
ALTER TABLE "RuntimeDocumentPolicy" ADD CONSTRAINT "RuntimeDocumentPolicy_shape" CHECK(revision>0 AND "snapshotHash" ~ '^[a-f0-9]{64}$' AND length(btrim(reason)) BETWEEN 1 AND 2000 AND jsonb_typeof(settings)='object' AND settings ?& ARRAY['AUTHORITY_APPROVAL_PROOF','COPYRIGHT_TRANSFER','INVOICE'] AND settings-ARRAY['AUTHORITY_APPROVAL_PROOF','COPYRIGHT_TRANSFER','INVOICE']='{}'::jsonb AND settings->'AUTHORITY_APPROVAL_PROOF' IN ('"REQUIRED"'::jsonb,'"OPTIONAL"'::jsonb,'"NOT_APPLICABLE"'::jsonb) AND settings->'COPYRIGHT_TRANSFER' IN ('"REQUIRED"'::jsonb,'"OPTIONAL"'::jsonb,'"NOT_APPLICABLE"'::jsonb) AND settings->'INVOICE' IN ('"REQUIRED"'::jsonb,'"OPTIONAL"'::jsonb,'"NOT_APPLICABLE"'::jsonb));
ALTER TABLE "RuntimeDocumentSubmission" ADD CONSTRAINT "RuntimeDocumentSubmission_shape" CHECK(state IN ('UPLOADING','FAILED','SUBMITTED','ACCEPTED','REJECTED') AND (state='UPLOADING')=("submittedActivityId" IS NULL) AND (state IN ('SUBMITTED','ACCEPTED','REJECTED'))=("approvalRequestId" IS NOT NULL) AND (state IN ('ACCEPTED','REJECTED'))=("reviewedActivityId" IS NOT NULL));
ALTER TABLE "RuntimeCompletionRequest" ADD CONSTRAINT "RuntimeCompletionRequest_shape" CHECK((state='SUPERSEDED')=("supersededActivityId" IS NOT NULL) AND revision>0 AND state IN ('PENDING','SUPERSEDED','REJECTED','APPROVED') AND "snapshotHash" ~ '^[a-f0-9]{64}$' AND length(btrim(reason)) BETWEEN 1 AND 2000 AND jsonb_typeof(snapshot)='object');
ALTER TABLE "RuntimeCompletionDecision" ADD CONSTRAINT "RuntimeCompletionDecision_shape" CHECK(outcome IN ('APPROVE','REJECT') AND "snapshotHash" ~ '^[a-f0-9]{64}$' AND length(btrim(reason)) BETWEEN 1 AND 2000);

CREATE FUNCTION flux_runtime_completion_ready(pid text) RETURNS boolean LANGUAGE plpgsql STABLE AS $$
DECLARE policy "RuntimeDocumentPolicy"; c text; sub "RuntimeDocumentSubmission"; v "SharedFileVersion";
BEGIN
 SELECT * INTO policy FROM "RuntimeDocumentPolicy" WHERE "projectId"=pid ORDER BY revision DESC LIMIT 1;
 IF policy.id IS NULL OR NOT EXISTS(SELECT 1 FROM "RuntimeStage" WHERE "projectId"=pid) OR EXISTS(SELECT 1 FROM "RuntimeStage" WHERE "projectId"=pid AND (state<>'COMPLETED' OR NOT flux_runtime_ready(id))) THEN RETURN false; END IF;
 FOR c IN SELECT key FROM jsonb_each_text(policy.settings) WHERE value='REQUIRED' LOOP
  SELECT ds.* INTO sub FROM "RuntimeDocumentSubmission" ds JOIN "SharedFileVersion" fv ON fv.id=ds."versionId" WHERE ds."projectId"=pid AND ds.category::text=c ORDER BY fv.number DESC LIMIT 1;
  IF sub.id IS NULL OR sub.state<>'ACCEPTED' THEN RETURN false; END IF;
  SELECT * INTO STRICT v FROM "SharedFileVersion" WHERE id=sub."versionId";
  IF v.status<>'READY' OR NOT v."applicationSealed" OR v."objectETag" IS NULL OR NOT EXISTS(SELECT 1 FROM "ApprovalRequest" r JOIN "ApprovalDecision" d ON d."requestId"=r.id JOIN "RuntimeCompletionActivity" a ON a.id=sub."reviewedActivityId" WHERE r.id=sub."approvalRequestId" AND r.state='APPROVED' AND d.outcome='APPROVE' AND d."actorId"=a."actorId" AND d."evidenceHash"=r."evidenceHash") THEN RETURN false; END IF;
 END LOOP;
 RETURN true;
END $$;
CREATE FUNCTION flux_runtime_completion_evidence(pid text) RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE p "RuntimeProject"; policy "RuntimeDocumentPolicy"; stages jsonb; docs jsonb;
BEGIN
 SELECT * INTO STRICT p FROM "RuntimeProject" WHERE id=pid;
 SELECT * INTO STRICT policy FROM "RuntimeDocumentPolicy" WHERE "projectId"=pid ORDER BY revision DESC LIMIT 1;
 SELECT jsonb_agg(jsonb_build_object('id',id,'revision',revision,'evidenceRevision',"evidenceRevision",'completion',"completionSnapshot") ORDER BY position) INTO stages FROM "RuntimeStage" WHERE "projectId"=pid;
 SELECT coalesce(jsonb_agg(jsonb_build_object('category',x.category,'submissionId',x.id,'versionId',x."versionId",'approvalRequestId',x."approvalRequestId",'evidenceHash',r."evidenceHash",'decisionId',d.id) ORDER BY x.category::text),'[]'::jsonb) INTO docs FROM
 (SELECT DISTINCT ON (s.category) s.* FROM "RuntimeDocumentSubmission" s JOIN "SharedFileVersion" v ON v.id=s."versionId" WHERE s."projectId"=pid AND policy.settings->>s.category::text='REQUIRED' ORDER BY s.category,v.number DESC) x
 JOIN "ApprovalRequest" r ON r.id=x."approvalRequestId" JOIN "ApprovalDecision" d ON d."requestId"=r.id AND d.outcome='APPROVE';
 RETURN jsonb_build_object('projectId',pid,'ownerId',p."ownerId",'publishedVersionId',p."publishedVersionId",'definitionHash',p."definitionHash",'projectRevision',p.revision,'policyId',policy.id,'policyHash',policy."snapshotHash",'stages',stages,'documents',docs);
END $$;

CREATE FUNCTION flux_runtime_completion_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE pid text; uid text; role_name text; av int; p "RuntimeProject"; pol "RuntimeDocumentPolicy"; s "RuntimeDocumentSubmission"; v "SharedFileVersion"; a "RuntimeCompletionActivity"; r "RuntimeCompletionRequest"; aid text; act text; j jsonb;
BEGIN
 IF TG_OP IN ('DELETE','TRUNCATE') THEN RAISE EXCEPTION 'Runtime completion history is retained' USING ERRCODE='23514'; END IF;
 j:=to_jsonb(NEW); uid:=current_setting('flux.runtime_actor',true); aid:=current_setting('flux.completion_activity',true); act:=current_setting('flux.completion_action',true);
 SELECT "businessRole"::text,"authorizationVersion" INTO role_name,av FROM "UserAuthorization" WHERE "userId"=uid;
 IF NOT coalesce(flux_workflow_actor_current(uid,role_name,av,current_setting('flux.runtime_session',true)),false) THEN RAISE EXCEPTION 'Current completion session required' USING ERRCODE='23514'; END IF;
 pid:=j->>'projectId';
 IF TG_TABLE_NAME IN ('RuntimeDocumentReference','RuntimeDocumentProvenance') THEN SELECT * INTO STRICT s FROM "RuntimeDocumentSubmission" WHERE id=j->>'submissionId'; pid:=s."projectId"; END IF;
 SELECT * INTO STRICT p FROM "RuntimeProject" WHERE id=pid FOR UPDATE;
 IF NOT flux_runtime_authorized(pid,uid) AND NOT (TG_TABLE_NAME='RuntimeCompletionActivity' AND TG_OP='INSERT' AND j->>'action'='COMPLETION_DECIDED' AND role_name='DIRECTOR' AND p.state='COMPLETED' AND EXISTS(SELECT 1 FROM "RuntimeCompletionDecision" WHERE "projectId"=pid AND "activityId"=j->>'id' AND outcome='APPROVE')) THEN RAISE EXCEPTION 'Active authorized runtime project required' USING ERRCODE='23514'; END IF;
 SELECT * INTO pol FROM "RuntimeDocumentPolicy" WHERE "projectId"=pid ORDER BY revision DESC LIMIT 1;
 IF TG_OP='UPDATE' AND TG_TABLE_NAME NOT IN ('RuntimeDocumentSubmission','RuntimeCompletionRequest') THEN RAISE EXCEPTION 'Completion evidence immutable' USING ERRCODE='23514'; END IF;
 IF TG_TABLE_NAME='RuntimeCompletionActivity' THEN
  IF NEW.id IS DISTINCT FROM aid OR NEW.action IS DISTINCT FROM act OR NEW."actorId"<>uid OR NEW."actorRole"<>role_name OR NEW."actorVersion"<>av OR NEW."sessionId" IS DISTINCT FROM current_setting('flux.runtime_session',true) OR NEW.sequence<>(SELECT count(*)+1 FROM "RuntimeCompletionActivity" WHERE "projectId"=pid) OR NEW.snapshot->>'action'<>NEW.action OR NEW.snapshot->>'commandId'<>NEW."commandId" OR NEW."eventId"<>'runtime-completion:'||NEW.id THEN RAISE EXCEPTION 'Exact completion activity required' USING ERRCODE='23514'; END IF;
 ELSIF TG_TABLE_NAME='RuntimeDocumentPolicy' THEN
  IF role_name<>'DIRECTOR' OR act<>'POLICY_APPROVED' OR NEW."activityId" IS DISTINCT FROM aid OR NEW.revision<>coalesce(pol.revision,0)+1 THEN RAISE EXCEPTION 'Explicit current Director policy required' USING ERRCODE='23514'; END IF;
 ELSIF TG_TABLE_NAME='RuntimeDocumentFile' THEN
  IF act<>'UPLOAD_PREPARED' OR pol.id IS NULL OR pol.settings->>NEW.category::text NOT IN ('REQUIRED','OPTIONAL') OR NOT EXISTS(SELECT 1 FROM "SharedFile" f WHERE f.id=NEW."fileId" AND num_nonnulls(f."projectId",f."flexibleProjectId",f."taskId",f."runtimeStageId",f."stageId",f."conceptFolderId",f."milestoneId",f."completionWorkflowId",f."completionDocumentType")=0) OR EXISTS(SELECT 1 FROM "SharedFileVersion" WHERE "fileId"=NEW."fileId") THEN RAISE EXCEPTION 'New runtime document origin required' USING ERRCODE='23514'; END IF;
 ELSIF TG_TABLE_NAME='RuntimeDocumentSubmission' THEN
  SELECT * INTO STRICT v FROM "SharedFileVersion" WHERE id=NEW."versionId";
  IF pol.id IS NULL OR pol.settings->>NEW.category::text NOT IN ('REQUIRED','OPTIONAL') OR NOT EXISTS(SELECT 1 FROM "RuntimeDocumentFile" f WHERE f."fileId"=v."fileId" AND f."projectId"=pid AND f.category=NEW.category) THEN RAISE EXCEPTION 'Applicable runtime document policy and origin required' USING ERRCODE='23514'; END IF;
  IF TG_OP='INSERT' THEN
   IF act<>'UPLOAD_PREPARED' OR NEW.state<>'UPLOADING' OR NEW."preparedActivityId" IS DISTINCT FROM aid OR NEW."policyId"<>pol.id OR v.status<>'UPLOADING' OR v."uploadedById" IS DISTINCT FROM uid OR v."externalUploaderEmail" IS NOT NULL OR v."uploaderUnknown" OR NOT v."applicationSealed" OR v."storageKey"<>'runtime-completion/'||pid||'/'||NEW.id||'/sealed/'||v."originalFileName" OR NEW."stagingKey"<>'runtime-completion/'||pid||'/'||NEW.id||'/upload/'||v."originalFileName" OR NEW."expiresAt"<=(clock_timestamp() AT TIME ZONE 'UTC') OR NEW."expiresAt">(clock_timestamp() AT TIME ZONE 'UTC')+interval '11 minutes' THEN RAISE EXCEPTION 'Exact internal upload intent required' USING ERRCODE='23514'; END IF;
  ELSE
   IF (to_jsonb(NEW)-ARRAY['state','submittedActivityId','reviewedActivityId','approvalRequestId']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','submittedActivityId','reviewedActivityId','approvalRequestId']) OR EXISTS(SELECT 1 FROM "RuntimeDocumentSubmission" newer JOIN "SharedFileVersion" nv ON nv.id=newer."versionId" WHERE newer."projectId"=pid AND newer.category=NEW.category AND nv.number>v.number) THEN RAISE EXCEPTION 'Exact current version required' USING ERRCODE='23514'; END IF;
   IF OLD.state='UPLOADING' THEN
    SELECT * INTO STRICT a FROM "RuntimeCompletionActivity" WHERE id=OLD."preparedActivityId";
    IF a."actorId"<>uid OR act NOT IN ('DOCUMENT_SUBMITTED','UPLOAD_CANCELLED') OR NEW."submittedActivityId" IS DISTINCT FROM aid OR NEW.state NOT IN ('SUBMITTED','FAILED') OR (NEW.state='SUBMITTED' AND (v.status<>'READY' OR NEW."expiresAt"<=(clock_timestamp() AT TIME ZONE 'UTC'))) OR (NEW.state='FAILED' AND v.status<>'FAILED') THEN RAISE EXCEPTION 'Current uploader finalization required' USING ERRCODE='23514'; END IF;
   ELSIF OLD.state='SUBMITTED' THEN
    IF act<>'DOCUMENT_REVIEWED' OR NEW.state NOT IN ('ACCEPTED','REJECTED') OR NEW."reviewedActivityId" IS DISTINCT FROM aid OR NEW."submittedActivityId"<>OLD."submittedActivityId" OR NEW."approvalRequestId"<>OLD."approvalRequestId" THEN RAISE EXCEPTION 'Exact native document decision required' USING ERRCODE='23514'; END IF;
   ELSE RAISE EXCEPTION 'Final document history immutable' USING ERRCODE='23514'; END IF;
  END IF;
 ELSIF TG_TABLE_NAME='RuntimeDocumentReference' THEN
  IF act<>'UPLOAD_PREPARED' OR s."preparedActivityId" IS DISTINCT FROM aid OR NOT EXISTS(SELECT 1 FROM "SharedFileReference" ref WHERE ref.id=NEW."referenceId" AND ref."versionId"=s."versionId" AND ref.role='SOURCE' AND num_nonnulls(ref."projectAttachmentId",ref."flexibleAttachmentId",ref."archivedProjectFileId",ref."manualArchiveFileId",ref."manualLibraryAssetId",ref."completionSubmissionId",ref."completionDocumentId",ref."taskUploadId",ref."runtimeSubmissionId")=0) THEN RAISE EXCEPTION 'Exact typed document reference required' USING ERRCODE='23514'; END IF;
 ELSIF TG_TABLE_NAME='RuntimeDocumentProvenance' THEN
  IF NEW."activityId" IS DISTINCT FROM aid OR act NOT IN ('DOCUMENT_SUBMITTED','UPLOAD_CANCELLED','DOCUMENT_REVIEWED') OR NOT EXISTS(SELECT 1 FROM "SharedFileProvenance" pr WHERE pr.id=NEW."provenanceId" AND pr."versionId"=s."versionId" AND num_nonnulls(pr."completionEventId",pr."taskEntryId")=0) OR aid NOT IN (coalesce(s."submittedActivityId",''),coalesce(s."reviewedActivityId",'')) THEN RAISE EXCEPTION 'Exact typed document provenance required' USING ERRCODE='23514'; END IF;
 ELSIF TG_TABLE_NAME='RuntimeCompletionRequest' THEN
  IF TG_OP='INSERT' THEN
   IF uid<>p."ownerId" OR act<>'COMPLETION_REQUESTED' OR NEW."activityId" IS DISTINCT FROM aid OR NEW.state<>'PENDING' OR NEW.revision<>(SELECT count(*)+1 FROM "RuntimeCompletionRequest" WHERE "projectId"=pid) OR NEW."policyId" IS DISTINCT FROM pol.id OR NOT flux_runtime_completion_ready(pid) OR NEW.snapshot IS DISTINCT FROM flux_runtime_completion_evidence(pid) THEN RAISE EXCEPTION 'Genuine Owner ready evidence required' USING ERRCODE='23514'; END IF;
  ELSE
   IF OLD.state<>'PENDING' OR (to_jsonb(NEW)-ARRAY['state','supersededActivityId']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','supersededActivityId']) OR NEW.state NOT IN ('SUPERSEDED','APPROVED','REJECTED') OR (NEW.state='SUPERSEDED' AND NEW."supersededActivityId" IS DISTINCT FROM aid) OR (NEW.state='SUPERSEDED' AND act NOT IN ('POLICY_APPROVED','UPLOAD_PREPARED','DOCUMENT_SUBMITTED','UPLOAD_CANCELLED','DOCUMENT_REVIEWED')) OR (NEW.state<>'SUPERSEDED' AND NOT EXISTS(SELECT 1 FROM "RuntimeCompletionDecision" d WHERE d."requestId"=NEW.id AND d."activityId"=aid AND NEW.state=(CASE d.outcome WHEN 'APPROVE' THEN 'APPROVED' ELSE 'REJECTED' END))) THEN RAISE EXCEPTION 'Native completion projection required' USING ERRCODE='23514'; END IF;
  END IF;
 ELSIF TG_TABLE_NAME='RuntimeCompletionDecision' THEN
  SELECT * INTO STRICT r FROM "RuntimeCompletionRequest" WHERE id=NEW."requestId";
  SELECT * INTO STRICT a FROM "RuntimeCompletionActivity" WHERE id=r."activityId";
  IF role_name<>'DIRECTOR' OR act<>'COMPLETION_DECIDED' OR NEW."activityId" IS DISTINCT FROM aid OR r."projectId"<>pid OR r.state<>'PENDING' OR r."policyId" IS DISTINCT FROM pol.id OR NEW."snapshotHash"<>r."snapshotHash" OR a."actorId"<>p."ownerId" OR (NEW.outcome='APPROVE' AND NOT EXISTS(SELECT 1 FROM "UserAuthorization" WHERE "userId"=p."ownerId" AND "accountStatus"='ACTIVE' AND "authorizationVersion"=a."actorVersion" AND "businessRole"::text IN ('DIRECTOR','SENIOR_PROJECT_MANAGER','JUNIOR_PROJECT_MANAGER'))) OR (NEW.outcome='APPROVE' AND (NOT flux_runtime_completion_ready(pid) OR r.snapshot IS DISTINCT FROM flux_runtime_completion_evidence(pid))) THEN RAISE EXCEPTION 'Genuine Director current final evidence required' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;

CREATE FUNCTION flux_runtime_completion_consistency() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE pid text; p "RuntimeProject"; a "RuntimeCompletionActivity"; s "RuntimeDocumentSubmission"; pol "RuntimeDocumentPolicy"; r "RuntimeCompletionRequest"; d "RuntimeCompletionDecision";
BEGIN
 IF TG_TABLE_NAME='RuntimeProject' THEN pid:=NEW.id; ELSE pid:=to_jsonb(NEW)->>'projectId'; END IF;
 IF pid IS NULL THEN RETURN NULL; END IF;
 SELECT * INTO STRICT p FROM "RuntimeProject" WHERE id=pid;
 IF (p.state='COMPLETED') IS DISTINCT FROM EXISTS(SELECT 1 FROM "RuntimeCompletionDecision" WHERE "projectId"=pid AND outcome='APPROVE') THEN RAISE EXCEPTION 'Completed project requires final Director decision' USING ERRCODE='23514'; END IF;
 FOR a IN SELECT * FROM "RuntimeCompletionActivity" WHERE "projectId"=pid LOOP
  IF a.action='POLICY_APPROVED' THEN
   SELECT * INTO STRICT pol FROM "RuntimeDocumentPolicy" WHERE "activityId"=a.id;
   IF a."actorRole"<>'DIRECTOR' OR pol."projectId"<>pid OR pol.settings IS DISTINCT FROM a.snapshot->'settings' OR pol.reason<>btrim(a.snapshot->>'reason') OR a.snapshot->>'confirmed' IS DISTINCT FROM 'true' OR pol.revision<>(a.snapshot->>'expectedPolicyRevision')::int+1 THEN RAISE EXCEPTION 'Exact policy approval evidence required' USING ERRCODE='23514'; END IF;
  ELSIF a.action='UPLOAD_PREPARED' THEN
   SELECT * INTO STRICT s FROM "RuntimeDocumentSubmission" WHERE "preparedActivityId"=a.id;
   IF s."projectId"<>pid OR s.category::text<>a.snapshot->>'category' OR NOT EXISTS(SELECT 1 FROM "SharedFileVersion" v WHERE v.id=s."versionId" AND v."uploadedById"=a."actorId" AND v."fileSize"=(a.snapshot->>'fileSize')::int AND v."mimeType"=a.snapshot->>'mimeType') OR NOT EXISTS(SELECT 1 FROM "RuntimeDocumentReference" WHERE "submissionId"=s.id) THEN RAISE EXCEPTION 'Exact upload history required' USING ERRCODE='23514'; END IF;
  ELSIF a.action IN ('DOCUMENT_SUBMITTED','UPLOAD_CANCELLED','DOCUMENT_REVIEWED') THEN
   SELECT * INTO STRICT s FROM "RuntimeDocumentSubmission" WHERE id=a.snapshot->>'submissionId' AND "projectId"=pid;
   IF NOT EXISTS(SELECT 1 FROM "RuntimeDocumentProvenance" WHERE "submissionId"=s.id AND "activityId"=a.id) OR (a.action='DOCUMENT_REVIEWED' AND (s."reviewedActivityId"<>a.id OR a.snapshot->>'confirmed' IS DISTINCT FROM 'true' OR NOT EXISTS(SELECT 1 FROM "ApprovalDecision" ad WHERE ad."requestId"=s."approvalRequestId" AND ad."actorId"=a."actorId" AND ad.reason=btrim(a.snapshot->>'reason') AND ad.outcome::text=a.snapshot->>'outcome'))) OR (a.action<>'DOCUMENT_REVIEWED' AND s."submittedActivityId"<>a.id) THEN RAISE EXCEPTION 'Exact document audit required' USING ERRCODE='23514'; END IF;
  ELSIF a.action='COMPLETION_REQUESTED' THEN
   SELECT * INTO STRICT r FROM "RuntimeCompletionRequest" WHERE "activityId"=a.id;
   IF r."projectId"<>pid OR a."actorId"<>p."ownerId" OR r.reason<>btrim(a.snapshot->>'reason') OR a.snapshot->>'confirmed' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Exact Owner request evidence required' USING ERRCODE='23514'; END IF;
  ELSIF a.action='COMPLETION_DECIDED' THEN
   SELECT * INTO STRICT d FROM "RuntimeCompletionDecision" WHERE "activityId"=a.id;
   IF d."projectId"<>pid OR a."actorRole"<>'DIRECTOR' OR d.reason<>btrim(a.snapshot->>'reason') OR d.outcome<>a.snapshot->>'outcome' OR d."requestId"<>a.snapshot->>'requestId' OR d."snapshotHash"<>a.snapshot->>'requestHash' OR a.snapshot->>'confirmed' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Separate explicit Director decision required' USING ERRCODE='23514'; END IF;
  END IF;
 END LOOP;
 FOR s IN SELECT * FROM "RuntimeDocumentSubmission" WHERE "projectId"=pid LOOP
  IF s."approvalRequestId" IS NOT NULL THEN PERFORM flux_runtime_document_approval_consistency(s."approvalRequestId"); END IF;
 END LOOP;
 FOR r IN SELECT * FROM "RuntimeCompletionRequest" WHERE "projectId"=pid LOOP
  SELECT * INTO d FROM "RuntimeCompletionDecision" WHERE "requestId"=r.id;
  IF r.state='SUPERSEDED' THEN
   SELECT * INTO STRICT a FROM "RuntimeCompletionActivity" WHERE id=r."supersededActivityId";
   IF a."projectId"<>pid OR a.sequence<=(SELECT sequence FROM "RuntimeCompletionActivity" WHERE id=r."activityId") OR NOT (
    (a.action='POLICY_APPROVED' AND EXISTS(SELECT 1 FROM "RuntimeDocumentPolicy" changed JOIN "RuntimeDocumentPolicy" original ON original.id=r."policyId" WHERE changed."activityId"=a.id AND changed.revision>original.revision)) OR
    (a.action IN ('UPLOAD_PREPARED','DOCUMENT_SUBMITTED','UPLOAD_CANCELLED','DOCUMENT_REVIEWED') AND EXISTS(SELECT 1 FROM "RuntimeDocumentSubmission" doc JOIN "RuntimeDocumentPolicy" original ON original.id=r."policyId" WHERE doc."projectId"=pid AND original.settings->>doc.category::text='REQUIRED' AND a.id IN (doc."preparedActivityId",doc."submittedActivityId",doc."reviewedActivityId")))) THEN RAISE EXCEPTION 'Supersession requires relevant actual evidence change' USING ERRCODE='23514'; END IF;
  END IF;
  IF (r.state IN ('APPROVED','REJECTED'))<>(d.id IS NOT NULL) OR (d.id IS NOT NULL AND r.state<>(CASE d.outcome WHEN 'APPROVE' THEN 'APPROVED' ELSE 'REJECTED' END)) OR (r.state='PENDING' AND (r."policyId" IS DISTINCT FROM (SELECT id FROM "RuntimeDocumentPolicy" WHERE "projectId"=pid ORDER BY revision DESC LIMIT 1) OR NOT flux_runtime_completion_ready(pid) OR r.snapshot IS DISTINCT FROM flux_runtime_completion_evidence(pid))) THEN RAISE EXCEPTION 'Pending completion must retain current evidence' USING ERRCODE='23514'; END IF;
 END LOOP;
 RETURN NULL;
END $$;

CREATE FUNCTION flux_runtime_document_approval_write(t text,op text,value jsonb,old_value jsonb) RETURNS void LANGUAGE plpgsql AS $$
DECLARE rid text; r "ApprovalRequest"; s "RuntimeDocumentSubmission"; v "SharedFileVersion"; d "ApprovalDecision"; uid text; role_name text; av int; aid text;
BEGIN
 rid:=(CASE WHEN t='ApprovalRequest' THEN value->>'id' ELSE value->>'requestId' END);
 SELECT * INTO STRICT s FROM "RuntimeDocumentSubmission" WHERE "approvalRequestId"=rid;
 SELECT * INTO STRICT v FROM "SharedFileVersion" WHERE id=s."versionId";
 uid:=current_setting('flux.runtime_actor',true); aid:=current_setting('flux.completion_activity',true);
 SELECT "businessRole"::text,"authorizationVersion" INTO role_name,av FROM "UserAuthorization" WHERE "userId"=uid;
 IF NOT flux_runtime_authorized(s."projectId",uid) OR NOT coalesce(flux_workflow_actor_current(uid,role_name,av,current_setting('flux.runtime_session',true)),false) THEN RAISE EXCEPTION 'Current authorized document manager required' USING ERRCODE='23514'; END IF;
 IF t='ApprovalRequest' THEN
  IF op='INSERT' THEN
   IF value->>'state'<>'PENDING' OR value->>'revision'<>'0' OR value->>'currentStep'<>'1' OR s.state<>'SUBMITTED' OR value->>'subjectId'<>s.id OR value->>'subjectVersion'<>s."versionId" OR value->>'requestedById'<>uid OR s."submittedActivityId" IS DISTINCT FROM aid OR value->'subjectSnapshot' IS DISTINCT FROM jsonb_build_object('projectId',s."projectId",'submissionId',s.id,'policyId',s."policyId",'category',s.category,'versionId',s."versionId") OR value->'policySnapshot' IS DISTINCT FROM '{"key":"runtime-document.manager.v1","steps":["DOCUMENT_REVIEWER"],"selfReview":"NATIVE_MANAGER_RULE"}'::jsonb THEN RAISE EXCEPTION 'Exact runtime document approval required' USING ERRCODE='23514'; END IF;
  ELSE
   IF old_value->>'state'<>'PENDING' OR value->>'revision'<>'1' OR value->>'currentStep'<>'1' OR value->>'state' NOT IN ('APPROVED','REJECTED') OR (value-ARRAY['state','revision']) IS DISTINCT FROM (old_value-ARRAY['state','revision']) THEN RAISE EXCEPTION 'Document approval identity immutable' USING ERRCODE='23514'; END IF;
  END IF; RETURN;
 END IF;
 SELECT * INTO STRICT r FROM "ApprovalRequest" WHERE id=rid;
 IF op<>'INSERT' THEN RAISE EXCEPTION 'Document approval history immutable' USING ERRCODE='23514'; END IF;
 IF t='ApprovalStep' THEN
  IF r.state<>'PENDING' OR r.revision<>0 OR value->>'position'<>'1' OR value->>'eligibility'<>'DOCUMENT_REVIEWER' THEN RAISE EXCEPTION 'Native manager review step required' USING ERRCODE='23514'; END IF;
 ELSIF t='ApprovalEvidence' THEN
  IF r.state<>'PENDING' OR r.revision<>0 OR value->>'fileVersionId'<>v.id OR v.status<>'READY' OR value->'snapshot' IS DISTINCT FROM jsonb_build_object('id',v.id,'fileId',v."fileId",'number',v.number,'objectETag',v."objectETag",'objectVersionId',v."objectVersionId",'checksumSha256',v."checksumSha256",'checksumEvidence',v."checksumEvidence") THEN RAISE EXCEPTION 'Exact sealed document evidence required' USING ERRCODE='23514'; END IF;
 ELSIF t='ApprovalDecision' THEN
  IF r.state<>'PENDING' OR r.revision<>(value->>'expectedRevision')::int OR value->>'evidenceHash'<>r."evidenceHash" OR value->>'actorId' IS DISTINCT FROM uid OR value->>'actorRole'<>role_name OR (value->>'actorVersion')::int<>av OR value->>'sessionId' IS DISTINCT FROM current_setting('flux.runtime_session',true) OR value->>'nativeEventId' IS NOT NULL OR current_setting('flux.completion_action',true)<>'DOCUMENT_REVIEWED' OR s."reviewedActivityId" IS DISTINCT FROM aid OR s.state<>(CASE value->>'outcome' WHEN 'APPROVE' THEN 'ACCEPTED' ELSE 'REJECTED' END) OR NOT EXISTS(SELECT 1 FROM "ApprovalStep" WHERE id=value->>'stepId' AND "requestId"=rid AND position=1 AND eligibility='DOCUMENT_REVIEWER') THEN RAISE EXCEPTION 'Actual native document reviewer required' USING ERRCODE='23514'; END IF;
 ELSIF t='ApprovalEvent' THEN
  IF value->>'actorId' IS DISTINCT FROM uid OR value->>'nativeEventId' IS NOT NULL OR value->>'externalActorEmail' IS NOT NULL THEN RAISE EXCEPTION 'Genuine runtime document event required' USING ERRCODE='23514'; END IF;
  IF value->>'action'='REQUESTED' THEN
   IF r.state<>'PENDING' OR r.revision<>0 OR value->'details'<>jsonb_build_object('submissionId',s.id) OR (value->>'createdAt')::timestamp<>r."requestedAt" THEN RAISE EXCEPTION 'Exact submission event required' USING ERRCODE='23514'; END IF;
  ELSIF value->>'action'='DECIDED' THEN
   SELECT * INTO STRICT d FROM "ApprovalDecision" WHERE id=value->>'decisionId' AND "requestId"=rid;
   IF d."actorId"<>uid OR (value->>'createdAt')::timestamp<>d."decidedAt" OR value->'details' IS DISTINCT FROM jsonb_build_object('outcome',d.outcome,'reason',d.reason,'revision',d."expectedRevision"+1,'evidenceHash',d."evidenceHash") THEN RAISE EXCEPTION 'Exact document decision event required' USING ERRCODE='23514'; END IF;
  ELSE RAISE EXCEPTION 'Unsupported document approval event' USING ERRCODE='23514'; END IF;
 END IF;
END $$;
CREATE FUNCTION flux_runtime_document_approval_consistency(rid text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE r "ApprovalRequest"; s "RuntimeDocumentSubmission"; d "ApprovalDecision";
BEGIN
 SELECT * INTO STRICT r FROM "ApprovalRequest" WHERE id=rid;
 SELECT * INTO STRICT s FROM "RuntimeDocumentSubmission" WHERE "approvalRequestId"=rid;
 SELECT * INTO d FROM "ApprovalDecision" WHERE "requestId"=rid;
 IF (SELECT count(*) FROM "ApprovalStep" WHERE "requestId"=rid)<>1 OR (SELECT count(*) FROM "ApprovalEvidence" WHERE "requestId"=rid AND "fileVersionId"=s."versionId")<>1 OR (SELECT count(*) FROM "ApprovalEvent" WHERE "requestId"=rid AND action='REQUESTED')<>1 OR (SELECT count(*) FROM "ApprovalEvent" WHERE "requestId"=rid AND action='DECIDED')<>(CASE WHEN d.id IS NULL THEN 0 ELSE 1 END) OR r.state::text<>(CASE WHEN d.id IS NULL THEN 'PENDING' WHEN d.outcome='APPROVE' THEN 'APPROVED' ELSE 'REJECTED' END) OR r.revision<>(CASE WHEN d.id IS NULL THEN 0 ELSE 1 END) OR s.state<>(CASE WHEN d.id IS NULL THEN 'SUBMITTED' WHEN d.outcome='APPROVE' THEN 'ACCEPTED' ELSE 'REJECTED' END) THEN RAISE EXCEPTION 'Atomic typed document approval required' USING ERRCODE='23514'; END IF;
END $$;

CREATE FUNCTION flux_runtime_document_bridge_consistency() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='SharedFileReference' THEN
 IF num_nonnulls(NEW."projectAttachmentId",NEW."flexibleAttachmentId",NEW."archivedProjectFileId",NEW."manualArchiveFileId",NEW."manualLibraryAssetId",NEW."completionSubmissionId",NEW."completionDocumentId",NEW."taskUploadId",NEW."runtimeSubmissionId")=0 THEN
  IF NOT EXISTS(SELECT 1 FROM "RuntimeDocumentReference" WHERE "referenceId"=NEW.id) THEN RAISE EXCEPTION 'Typed document source required' USING ERRCODE='23514'; END IF;
 END IF;
 ELSIF TG_TABLE_NAME='SharedFileProvenance' THEN
 IF num_nonnulls(NEW."completionEventId",NEW."taskEntryId")=0 THEN
  IF NOT EXISTS(SELECT 1 FROM "RuntimeDocumentProvenance" WHERE "provenanceId"=NEW.id) THEN RAISE EXCEPTION 'Typed document provenance required' USING ERRCODE='23514'; END IF;
 END IF;
 END IF; RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER flux_runtime_document_bridge_consistency AFTER INSERT ON "SharedFileReference" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION flux_runtime_document_bridge_consistency();
CREATE CONSTRAINT TRIGGER flux_runtime_document_bridge_consistency AFTER INSERT ON "SharedFileProvenance" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION flux_runtime_document_bridge_consistency();

CREATE FUNCTION flux_emit_runtime_completion_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO "BusinessEvent" (id,type,"schemaVersion","aggregateType","aggregateId",sequence,"actorId","actorRole","actorVersion",operation,"correlationId","causationId","idempotencyKey","occurredAt",payload)
 VALUES(NEW."eventId",'RUNTIME_COMPLETION_ACTIVITY',1,'RUNTIME_COMPLETION',NEW."projectId",NEW.sequence,NEW."actorId",NEW."actorRole",NEW."actorVersion",'runtimeCompletionCommand',NEW."projectId",NEW.id,NEW."eventId",NEW."createdAt",jsonb_build_object('action',NEW.action));
 INSERT INTO "EventOutbox" ("eventId","consumerKey") VALUES(NEW."eventId",'internal.audit.v1'); RETURN NEW;
END $$;
CREATE TRIGGER flux_emit_runtime_completion_event AFTER INSERT ON "RuntimeCompletionActivity" FOR EACH ROW EXECUTE FUNCTION flux_emit_runtime_completion_event();
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['RuntimeCompletionActivity','RuntimeDocumentPolicy','RuntimeDocumentFile','RuntimeDocumentSubmission','RuntimeDocumentReference','RuntimeDocumentProvenance','RuntimeCompletionRequest','RuntimeCompletionDecision'] LOOP
  EXECUTE format('CREATE TRIGGER flux_runtime_completion_guard BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION flux_runtime_completion_guard()',t);
  EXECUTE format('CREATE TRIGGER flux_runtime_completion_truncate BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION flux_runtime_completion_guard()',t);
  IF t NOT IN ('RuntimeDocumentReference','RuntimeDocumentProvenance') THEN EXECUTE format('CREATE CONSTRAINT TRIGGER flux_runtime_completion_consistency AFTER INSERT OR UPDATE ON %I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION flux_runtime_completion_consistency()',t); END IF;
 END LOOP;
END $$;
CREATE CONSTRAINT TRIGGER flux_runtime_completion_consistency AFTER INSERT OR UPDATE ON "RuntimeProject" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION flux_runtime_completion_consistency();

-- Freeze ordinary task mutations under the same project lock as completion.
CREATE FUNCTION flux_runtime_completed_task_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE tid text; pid text; st text;
BEGIN
 tid:=(CASE WHEN TG_TABLE_NAME='UniversalTask' THEN to_jsonb(NEW)->>'id' ELSE to_jsonb(NEW)->>'taskId' END);
 SELECT "projectId" INTO pid FROM "RuntimeTaskContext" WHERE "taskId"=tid;
 IF pid IS NOT NULL THEN
  SELECT state INTO st FROM "RuntimeProject" WHERE id=pid FOR SHARE;
  IF st<>'ACTIVE' THEN RAISE EXCEPTION 'Completed runtime task evidence is read only' USING ERRCODE='23514'; END IF;
 END IF; RETURN NEW;
END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['UniversalTask','UniversalTaskEntry','UniversalTaskUpload','UniversalTaskSpectator','UniversalTaskReference','UniversalTaskFamilyLink','UniversalTaskInheritedEvidence','UniversalTaskTarget','UniversalTaskApplication'] LOOP
  EXECUTE format('CREATE TRIGGER flux_runtime_completed_task_guard BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION flux_runtime_completed_task_guard()',t);
 END LOOP;
END $$;

CREATE FUNCTION flux_runtime_document_version_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE origin "RuntimeDocumentFile"; s "RuntimeDocumentSubmission"; a "RuntimeCompletionActivity"; uid text;
BEGIN
 SELECT * INTO origin FROM "RuntimeDocumentFile" WHERE "fileId"=NEW."fileId";
 IF origin."fileId" IS NULL THEN RETURN NEW; END IF;
 uid:=current_setting('flux.runtime_actor',true);
 PERFORM id FROM "RuntimeProject" WHERE id=origin."projectId" FOR SHARE;
 IF NOT coalesce(flux_runtime_authorized(origin."projectId",uid),false) OR NOT EXISTS(SELECT 1 FROM "UserAuthorization" u WHERE u."userId"=uid AND flux_workflow_actor_current(uid,u."businessRole"::text,u."authorizationVersion",current_setting('flux.runtime_session',true))) OR NEW."uploadedById" IS DISTINCT FROM uid THEN RAISE EXCEPTION 'Authorized document uploader required' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' THEN
  IF current_setting('flux.completion_action',true) IS DISTINCT FROM 'UPLOAD_PREPARED' OR NEW.number<>(SELECT count(*)+1 FROM "SharedFileVersion" WHERE "fileId"=NEW."fileId") THEN RAISE EXCEPTION 'Contiguous document revision required' USING ERRCODE='23514'; END IF;
 ELSE
  SELECT * INTO STRICT s FROM "RuntimeDocumentSubmission" WHERE "versionId"=NEW.id;
  IF s.state<>'UPLOADING' OR current_setting('flux.completion_action',true) NOT IN ('DOCUMENT_SUBMITTED','UPLOAD_CANCELLED') THEN RAISE EXCEPTION 'Only native finalization seals document evidence' USING ERRCODE='23514'; END IF;
 END IF; RETURN NEW;
END $$;
CREATE TRIGGER flux_runtime_document_version_guard BEFORE INSERT OR UPDATE ON "SharedFileVersion" FOR EACH ROW EXECUTE FUNCTION flux_runtime_document_version_guard();
CREATE FUNCTION flux_runtime_document_version_consistency() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE fid text; s "RuntimeDocumentSubmission"; v "SharedFileVersion";
BEGIN
 fid:=CASE WHEN TG_TABLE_NAME='RuntimeDocumentFile' THEN NEW."fileId" ELSE NEW."fileId" END;
 IF NOT EXISTS(SELECT 1 FROM "RuntimeDocumentFile" WHERE "fileId"=fid) THEN RETURN NULL; END IF;
 IF NOT EXISTS(SELECT 1 FROM "SharedFileVersion" WHERE "fileId"=fid) THEN RAISE EXCEPTION 'Runtime document origin requires version history' USING ERRCODE='23514'; END IF;
 FOR v IN SELECT * FROM "SharedFileVersion" WHERE "fileId"=fid LOOP
  SELECT * INTO STRICT s FROM "RuntimeDocumentSubmission" WHERE "versionId"=v.id;
  IF (s.state='UPLOADING' AND v.status<>'UPLOADING') OR (s.state='FAILED' AND v.status<>'FAILED') OR (s.state IN ('SUBMITTED','ACCEPTED','REJECTED') AND v.status<>'READY') THEN RAISE EXCEPTION 'Document and sealed version must commit atomically' USING ERRCODE='23514'; END IF;
 END LOOP; RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER flux_runtime_document_version_consistency AFTER INSERT OR UPDATE ON "SharedFileVersion" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION flux_runtime_document_version_consistency();
CREATE CONSTRAINT TRIGGER flux_runtime_document_version_consistency AFTER INSERT ON "RuntimeDocumentFile" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION flux_runtime_document_version_consistency();

ALTER TABLE "RuntimeProject" DROP CONSTRAINT "RuntimeProject_shape";
ALTER TABLE "RuntimeProject" ADD CONSTRAINT "RuntimeProject_shape" CHECK (state IN ('ACTIVE','COMPLETED') AND revision > 0 AND "versionNumber" > 0 AND "definitionHash" ~ '^[a-f0-9]{64}$'::text AND length(btrim(title)) >= 1 AND length(btrim(title)) <= 160 AND length(description) <= 4000);
ALTER TABLE "SharedFileReference" DROP CONSTRAINT "SharedFileReference_one_record_check";
ALTER TABLE "SharedFileReference" ADD CONSTRAINT "SharedFileReference_one_record_check" CHECK (num_nonnulls("projectAttachmentId", "flexibleAttachmentId", "archivedProjectFileId", "manualArchiveFileId", "manualLibraryAssetId", "completionSubmissionId", "completionDocumentId", "taskUploadId", "runtimeSubmissionId") <= 1);
ALTER TABLE "SharedFileProvenance" DROP CONSTRAINT "SharedFileProvenance_native_check";
ALTER TABLE "SharedFileProvenance" ADD CONSTRAINT "SharedFileProvenance_native_check" CHECK (num_nonnulls("completionEventId", "taskEntryId") <= 1);
ALTER TABLE "ApprovalRequest" DROP CONSTRAINT "ApprovalRequest_values_check";
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_values_check" CHECK (("subjectType"::text IN ('RUNTIME_STAGE','RUNTIME_DOCUMENT') AND num_nonnulls("projectId", "completionSubmissionId", "submissionEventId", "externalRequesterEmail", "expiresAt") = 0 AND "requestedById" IS NOT NULL AND "policyKey" IN ('runtime-stage.ordered.v1','runtime-document.manager.v1') OR "subjectType"::text = 'COMPLETION_DOCUMENT_SUBMISSION'::text AND "subjectId" = "completionSubmissionId" AND num_nonnulls("projectId", "completionSubmissionId", "submissionEventId") = 3 OR "subjectType"::text = 'WORKFLOW_DRAFT_REVISION'::text AND num_nonnulls("projectId", "completionSubmissionId", "submissionEventId", "externalRequesterEmail", "expiresAt") = 0 AND "requestedById" IS NOT NULL AND "policyKey" = 'workflow-publication.director.v1'::text) AND num_nonnulls("requestedById", "externalRequesterEmail") = 1 AND revision >= 0 AND "currentStep" > 0 AND "evidenceHash" ~ '^[a-f0-9]{64}$'::text AND length(btrim("policyKey")) >= 3 AND length(btrim("policyKey")) <= 100 AND jsonb_typeof("policySnapshot") = 'object'::text AND jsonb_typeof("subjectSnapshot") = 'object'::text AND (state = 'SUPERSEDED'::"ApprovalRequestState" AND "supersededAt" IS NOT NULL AND length(btrim("supersessionReason")) > 0 OR state <> 'SUPERSEDED'::"ApprovalRequestState" AND "supersededAt" IS NULL AND "supersessionReason" IS NULL));
ALTER TABLE "BusinessEvent" DROP CONSTRAINT "BusinessEvent_contract_check";
ALTER TABLE "BusinessEvent" ADD CONSTRAINT "BusinessEvent_contract_check" CHECK ((("schemaVersion" = 1 AND sequence > 0 AND "actorVersion" > 0 AND jsonb_typeof(payload) = 'object'::text AND (type::text = 'RUNTIME_ACTIVITY'::text AND "aggregateType" = 'RUNTIME_PROJECT'::text AND operation = 'runtimeStageCommand'::text AND ("actorRole" = ANY (ARRAY['DIRECTOR'::text, 'SENIOR_PROJECT_MANAGER'::text, 'JUNIOR_PROJECT_MANAGER'::text])) AND num_nonnulls("projectId", "flexibleProjectId", "taskId", "taskEntryId", "decisionId", "nativeEventId", "approvalEvidenceId", "fileVersionId") = 0 OR type::text = 'COMPLETION_DOCUMENT_REVIEW_DECIDED'::text AND "aggregateType" = 'COMPLETION_DOCUMENT_SUBMISSION'::text AND ("actorRole" = ANY (ARRAY['DIRECTOR'::text, 'SENIOR_PROJECT_MANAGER'::text, 'JUNIOR_PROJECT_MANAGER'::text])) AND operation = 'reviewCompletionDocument'::text AND "projectId" IS NOT NULL AND "decisionId" IS NOT NULL AND "nativeEventId" IS NOT NULL AND "approvalEvidenceId" IS NOT NULL AND "fileVersionId" IS NOT NULL AND "taskId" IS NULL AND "taskEntryId" IS NULL AND "flexibleProjectId" IS NULL OR type::text = 'TASK_ACTIVITY'::text AND "aggregateType" = 'UNIVERSAL_TASK'::text AND (operation = ANY (ARRAY['generalTaskCommand'::text, 'deliverableTaskCommand'::text, 'conceptTaskCommand'::text])) AND ("actorRole" = ANY (ARRAY['DIRECTOR'::text, 'SENIOR_PROJECT_MANAGER'::text, 'JUNIOR_PROJECT_MANAGER'::text, 'DESIGNER'::text, 'DIGITAL_LEAD'::text])) AND num_nonnulls("projectId", "flexibleProjectId") <= 1 AND "taskId" IS NOT NULL AND "taskEntryId" IS NOT NULL AND "decisionId" IS NULL AND "nativeEventId" IS NULL AND "approvalEvidenceId" IS NULL AND "fileVersionId" IS NULL OR type::text = 'WORKFLOW_DRAFT_REVISED'::text AND "aggregateType" = 'WORKFLOW_DRAFT'::text AND operation = 'draftWorkflowCommand'::text AND ("actorRole" = ANY (ARRAY['DIRECTOR'::text, 'SENIOR_PROJECT_MANAGER'::text])) AND num_nonnulls("projectId", "flexibleProjectId", "taskId", "taskEntryId", "decisionId", "nativeEventId", "approvalEvidenceId", "fileVersionId") = 0 OR (type::text = ANY (ARRAY['WORKFLOW_PUBLICATION_SUBMITTED'::text, 'WORKFLOW_PUBLICATION_SUPERSEDED'::text, 'WORKFLOW_PUBLICATION_DECIDED'::text, 'WORKFLOW_VERSION_PUBLISHED'::text])) AND "aggregateType" = 'WORKFLOW_PUBLICATION_REQUEST'::text AND operation = 'workflowPublicationCommand'::text AND ("actorRole" = ANY (ARRAY['DIRECTOR'::text, 'SENIOR_PROJECT_MANAGER'::text])) AND num_nonnulls("projectId", "flexibleProjectId", "taskId", "taskEntryId", "decisionId", "nativeEventId", "approvalEvidenceId", "fileVersionId") = 0)) OR (type::text IN ('RUNTIME_CREATION_REQUESTED','RUNTIME_CREATION_DECIDED') AND "schemaVersion"=1 AND "aggregateType"='RUNTIME_CREATION' AND operation='runtimeCreationCommand' AND num_nonnulls("projectId","flexibleProjectId","taskId","taskEntryId","decisionId","nativeEventId","approvalEvidenceId","fileVersionId")=0)) OR (type::text='RUNTIME_COMPLETION_ACTIVITY' AND "schemaVersion"=1 AND "aggregateType"='RUNTIME_COMPLETION' AND operation='runtimeCompletionCommand' AND sequence>0 AND "actorVersion">0 AND "actorRole" IN ('DIRECTOR','SENIOR_PROJECT_MANAGER','JUNIOR_PROJECT_MANAGER') AND num_nonnulls("projectId","flexibleProjectId","taskId","taskEntryId","decisionId","nativeEventId","approvalEvidenceId","fileVersionId")=0));
CREATE OR REPLACE FUNCTION public.flux_runtime_guard()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE pid text; uid text; sid text; role_name text; av int; p "RuntimeProject"; s "RuntimeStage"; pv "PublishedWorkflowVersion"; v "SharedFileVersion"; old_file "RuntimeFileSubmission"; b jsonb; f jsonb; item jsonb; val jsonb; key text; n int;
BEGIN
 IF TG_OP IN ('DELETE','TRUNCATE') THEN RAISE EXCEPTION 'Runtime history is retained' USING ERRCODE='23514'; END IF;
 uid:=current_setting('flux.runtime_actor',true); sid:=current_setting('flux.runtime_session',true);
 SELECT "businessRole"::text,"authorizationVersion" INTO role_name,av FROM "UserAuthorization" WHERE "userId"=uid;
 IF NOT coalesce(flux_workflow_actor_current(uid,role_name,av,sid),false) OR role_name NOT IN ('DIRECTOR','SENIOR_PROJECT_MANAGER','JUNIOR_PROJECT_MANAGER') THEN RAISE EXCEPTION 'Current runtime session required' USING ERRCODE='23514'; END IF;
 IF TG_TABLE_NAME='RuntimeProject' THEN
  IF TG_OP='UPDATE' AND OLD.state='ACTIVE' AND NEW.state='COMPLETED' THEN
   IF role_name<>'DIRECTOR' OR (to_jsonb(NEW)-'state') IS DISTINCT FROM (to_jsonb(OLD)-'state') OR NOT flux_runtime_completion_ready(NEW.id) OR NOT EXISTS(SELECT 1 FROM "RuntimeCompletionDecision" d WHERE d."projectId"=NEW.id AND d.outcome='APPROVE' AND d."activityId"=current_setting('flux.completion_activity',true)) THEN RAISE EXCEPTION 'Final Director decision required' USING ERRCODE='23514'; END IF;
   RETURN NEW;
  END IF;
  IF TG_OP='INSERT' AND NEW.state<>'ACTIVE' THEN RAISE EXCEPTION 'New runtime starts active' USING ERRCODE='23514'; END IF;
  IF TG_OP='INSERT' THEN
   SELECT * INTO STRICT pv FROM "PublishedWorkflowVersion" WHERE id=NEW."publishedVersionId";
   IF NOT ((role_name='DIRECTOR' AND NEW."createdById"=uid) OR (role_name='SENIOR_PROJECT_MANAGER' AND NEW."createdById"=uid AND NEW."ownerId"=uid) OR (role_name='DIRECTOR' AND EXISTS(SELECT 1 FROM "RuntimeCreationDecision" d JOIN "RuntimeCreationRequest" r ON r.id=d."requestId" WHERE d."projectId"=NEW.id AND d.outcome='APPROVE' AND d."reviewerId"=uid AND r."requesterId"=NEW."createdById"))) OR NEW.revision<>1 OR NEW."workflowId"<>pv."workflowId" OR NEW."versionNumber"<>pv.number OR NEW."definitionHash"<>pv."configurationHash" OR
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
  IF TG_OP<>'INSERT' OR p.revision<>1 OR role_name NOT IN ('DIRECTOR','SENIOR_PROJECT_MANAGER') OR NEW."addedById"<>uid OR NEW."userId"=p."ownerId" OR NOT EXISTS(SELECT 1 FROM "UserAuthorization" WHERE "userId"=NEW."userId" AND "accountStatus"='ACTIVE' AND "businessRole" IS NOT NULL AND (NEW.role='EXECUTOR' OR "businessRole"::text IN ('DIRECTOR','SENIOR_PROJECT_MANAGER','JUNIOR_PROJECT_MANAGER'))) THEN RAISE EXCEPTION 'Initial genuine participants only' USING ERRCODE='23514'; END IF;
 ELSIF TG_TABLE_NAME='RuntimeStage' THEN
  IF TG_OP='INSERT' THEN
   SELECT * INTO STRICT pv FROM "PublishedWorkflowVersion" WHERE id=p."publishedVersionId";
   IF p.revision<>1 OR role_name NOT IN ('DIRECTOR','SENIOR_PROJECT_MANAGER') OR NEW.revision<>0 OR NEW."evidenceRevision"<>0 OR NEW.state<>'AVAILABLE' OR NEW.configuration IS DISTINCT FROM pv.definition->'stages'->NEW.position OR NEW."definitionStageId"<>NEW.configuration->>'id' THEN RAISE EXCEPTION 'Runtime stage must bind exact immutable definition' USING ERRCODE='23514'; END IF;
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
   IF NEW.state<>'UPLOADING' OR (NEW."submittedById"<>uid AND NOT flux_runtime_task_import(NEW."stageId",NEW."capabilityId",NEW."versionId",uid)) OR v.status<>'UPLOADING' OR NOT v."applicationSealed" THEN RAISE EXCEPTION 'Attributed runtime upload intent required' USING ERRCODE='23514'; END IF;
   IF NEW."supersedesId" IS NOT NULL THEN
    SELECT * INTO STRICT old_file FROM "RuntimeFileSubmission" WHERE id=NEW."supersedesId";
    IF old_file."stageId"<>NEW."stageId" OR old_file."capabilityId"<>NEW."capabilityId" OR old_file.state='UPLOADING' OR (SELECT "fileId" FROM "SharedFileVersion" WHERE id=old_file."versionId")<>v."fileId" THEN RAISE EXCEPTION 'File revisions cannot cross boundaries' USING ERRCODE='23514'; END IF;
   END IF;
  ELSE
   IF (to_jsonb(NEW)-ARRAY['state','submittedAt','reviewedById','reviewedAt','reason','failureCode']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','submittedAt','reviewedById','reviewedAt','reason','failureCode']) OR EXISTS(SELECT 1 FROM "RuntimeFileSubmission" WHERE "supersedesId"=NEW.id) THEN RAISE EXCEPTION 'File source and history are retained' USING ERRCODE='23514'; END IF;
   IF OLD.state='UPLOADING' THEN
    IF (uid<>OLD."submittedById" AND NOT flux_runtime_task_import(NEW."stageId",NEW."capabilityId",NEW."versionId",uid)) OR NEW.state NOT IN ('SUBMITTED','FAILED') OR v.status::text<>(CASE NEW.state WHEN 'FAILED' THEN 'FAILED' ELSE 'READY' END) THEN RAISE EXCEPTION 'Only uploader finalizes exact version' USING ERRCODE='23514'; END IF;
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
END $function$;
CREATE OR REPLACE FUNCTION public.flux_shared_file_reference_guard()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE v "SharedFileVersion"; f "SharedFile"; source jsonb; source_project text; source_flexible text;
BEGIN
 IF TG_OP='INSERT' AND num_nonnulls(NEW."projectAttachmentId",NEW."flexibleAttachmentId",NEW."archivedProjectFileId",NEW."manualArchiveFileId",NEW."manualLibraryAssetId",NEW."completionSubmissionId",NEW."completionDocumentId",NEW."taskUploadId",NEW."runtimeSubmissionId")=0 THEN RETURN NEW; END IF;
 IF TG_OP='INSERT' AND EXISTS(SELECT 1 FROM "SharedFileVersion" fv JOIN "RuntimeDocumentFile" origin ON origin."fileId"=fv."fileId" WHERE fv.id=NEW."versionId") THEN RAISE EXCEPTION 'Runtime documents require the typed adapter' USING ERRCODE='23514'; END IF;
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
END $function$
;
CREATE OR REPLACE FUNCTION public.flux_shared_file_provenance_guard()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
 IF TG_OP='INSERT' AND num_nonnulls(NEW."completionEventId",NEW."taskEntryId")=0 THEN RETURN NEW; END IF;
 IF TG_OP='INSERT' AND EXISTS(SELECT 1 FROM "SharedFileVersion" fv JOIN "RuntimeDocumentFile" origin ON origin."fileId"=fv."fileId" WHERE fv.id=NEW."versionId") THEN RAISE EXCEPTION 'Runtime documents require the typed adapter' USING ERRCODE='23514'; END IF;
  IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'File provenance is immutable' USING ERRCODE = '23514'; END IF;
  IF NEW."taskEntryId" IS NOT NULL THEN
   IF EXISTS (SELECT 1 FROM "UniversalTaskInheritedEvidence" evidence JOIN "UniversalTaskFamilyLink" family ON family."taskId"=evidence."taskId"
    JOIN "UniversalTaskEntry" entry ON entry.id=family."createdEntryId" WHERE entry.id=NEW."taskEntryId" AND evidence."versionId"=NEW."versionId"
    AND entry.action='CREATED' AND entry.snapshot->'sister'->'evidenceVersionIds' ? NEW."versionId") THEN RETURN NEW; END IF;
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
END $function$
;
CREATE OR REPLACE FUNCTION public.flux_approval_write_guard()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE r "ApprovalRequest"; s "CompletionDocumentSubmission"; v "SharedFileVersion";
  e "CompletionDocumentEvent"; st "ApprovalStep"; d "ApprovalDecision"; auth record; step_count int; sub "WorkflowPublicationSubmission"; dr "WorkflowDraftRevision"; newer "WorkflowDraftRevision"; w "WorkflowDraft";
BEGIN
  IF TG_OP IN ('DELETE','TRUNCATE') THEN RAISE EXCEPTION 'Approval history is retained' USING ERRCODE = '23514'; END IF;
  IF TG_TABLE_NAME='ApprovalRequest' THEN
   IF NEW."subjectType"::text='RUNTIME_DOCUMENT' THEN PERFORM flux_runtime_document_approval_write(TG_TABLE_NAME,TG_OP,to_jsonb(NEW),CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE NULL END); RETURN NEW; END IF;
  ELSE
   SELECT * INTO STRICT r FROM "ApprovalRequest" WHERE id=NEW."requestId" FOR UPDATE;
   IF r."subjectType"::text='RUNTIME_DOCUMENT' THEN PERFORM flux_runtime_document_approval_write(TG_TABLE_NAME,TG_OP,to_jsonb(NEW),CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE NULL END); RETURN NEW; END IF;
  END IF;
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
END $function$
;
CREATE OR REPLACE FUNCTION public.flux_approval_consistency_guard()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE rid text; r "ApprovalRequest"; s "CompletionDocumentSubmission"; last_decision record;
  step_count int; decision_count int; rejected_count int; expected_state text; native_state text;
BEGIN
  IF TG_TABLE_NAME = 'ApprovalRequest' THEN rid := NEW.id;
  ELSIF TG_TABLE_NAME = 'CompletionDocumentSubmission' THEN SELECT id INTO rid FROM "ApprovalRequest" WHERE "completionSubmissionId" = NEW.id;
  ELSE rid := NEW."requestId"; END IF;
  IF rid IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO STRICT r FROM "ApprovalRequest" WHERE id = rid;
  IF r."subjectType"::text='RUNTIME_DOCUMENT' THEN PERFORM flux_runtime_document_approval_consistency(rid); RETURN NULL; END IF;
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
END $function$
;
CREATE OR REPLACE FUNCTION public.flux_event_write_guard()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE runtime_row "RuntimeActivity"; dr "WorkflowDraftRevision"; te "UniversalTaskEntry"; tt "UniversalTask"; d "ApprovalDecision"; r "ApprovalRequest"; e "ApprovalEvidence"; v "SharedFileVersion"; o "EventOutbox"; pv "PublishedWorkflowVersion"; audit "WorkflowPublicationAudit"; ae "ApprovalEvent"; sub "WorkflowPublicationSubmission";
 expected_id text; expected_request text; expected_actor text; expected_role text; expected_version int; expected_time timestamp;
 expected_sequence int; expected_payload jsonb; expected_type text; expected_action text;
BEGIN
 IF TG_TABLE_NAME='BusinessEvent' THEN
 IF NEW.type::text='RUNTIME_COMPLETION_ACTIVITY' THEN
  IF TG_OP<>'INSERT' OR NOT EXISTS(SELECT 1 FROM "RuntimeCompletionActivity" a WHERE a."eventId"=NEW.id AND NEW."aggregateId"=a."projectId" AND NEW.sequence=a.sequence AND NEW."actorId"=a."actorId" AND NEW."actorRole"=a."actorRole" AND NEW."actorVersion"=a."actorVersion" AND NEW."occurredAt"=a."createdAt" AND NEW."causationId"=a.id AND NEW."correlationId"=a."projectId" AND NEW."idempotencyKey"=a."eventId" AND NEW.payload=jsonb_build_object('action',a.action)) THEN RAISE EXCEPTION 'Exact runtime completion event required' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END IF;
 IF NEW.type::text IN ('RUNTIME_CREATION_REQUESTED','RUNTIME_CREATION_DECIDED') THEN
  IF TG_OP<>'INSERT' OR NOT EXISTS(
    SELECT 1 FROM (SELECT id,"eventId","requesterId" AS actor,"actorVersion","createdAt","snapshotHash",id AS rid,1 AS seq,'RUNTIME_CREATION_REQUESTED' AS typ FROM "RuntimeCreationRequest"
    UNION ALL SELECT id,"eventId","reviewerId","actorVersion","createdAt","snapshotHash","requestId",2,'RUNTIME_CREATION_DECIDED' FROM "RuntimeCreationDecision") n
    WHERE n.id=NEW."causationId" AND n."eventId"=NEW.id AND n.actor=NEW."actorId" AND n."actorVersion"=NEW."actorVersion" AND n."createdAt"=NEW."occurredAt" AND n.rid=NEW."aggregateId" AND n.rid=NEW."correlationId" AND n.seq=NEW.sequence AND n.typ=NEW.type::text AND NEW."idempotencyKey"=NEW.id AND NEW.payload=jsonb_build_object('snapshotHash',n."snapshotHash") AND NEW."actorRole"=CASE n.seq WHEN 1 THEN 'JUNIOR_PROJECT_MANAGER' ELSE 'DIRECTOR' END)
  THEN RAISE EXCEPTION 'Runtime creation event requires exact native history' USING ERRCODE='23514'; END IF; RETURN NEW;
 END IF;
 END IF;

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
END $function$;

COMMIT;
