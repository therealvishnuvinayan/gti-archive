-- Phase 4.2: typed Director approval and immutable workflow publication. No backfill.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- AlterEnum
ALTER TYPE "ApprovalSubjectType" ADD VALUE 'WORKFLOW_DRAFT_REVISION';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "BusinessEventType" ADD VALUE 'WORKFLOW_PUBLICATION_SUBMITTED';
ALTER TYPE "BusinessEventType" ADD VALUE 'WORKFLOW_PUBLICATION_SUPERSEDED';
ALTER TYPE "BusinessEventType" ADD VALUE 'WORKFLOW_PUBLICATION_DECIDED';
ALTER TYPE "BusinessEventType" ADD VALUE 'WORKFLOW_VERSION_PUBLISHED';

-- AlterTable
ALTER TABLE "ApprovalRequest" ALTER COLUMN "projectId" DROP NOT NULL,
ALTER COLUMN "completionSubmissionId" DROP NOT NULL,
ALTER COLUMN "submissionEventId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "WorkflowPublicationSubmission" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "draftRevisionId" TEXT NOT NULL,
    "approvalRequestId" TEXT NOT NULL,
    "submittedById" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "actorVersion" INTEGER NOT NULL,
    "sessionId" TEXT NOT NULL,
    "commandId" TEXT NOT NULL,
    "commandHash" TEXT NOT NULL,
    "configurationHash" TEXT NOT NULL,
    "changeSummary" TEXT NOT NULL,
    "intendedProjectType" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL,
    "previousPublishedVersionId" TEXT,

    CONSTRAINT "WorkflowPublicationSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublishedWorkflow" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublishedWorkflow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublishedWorkflowVersion" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "submissionId" TEXT NOT NULL,
    "draftRevisionId" TEXT NOT NULL,
    "approvalRequestId" TEXT NOT NULL,
    "approvalDecisionId" TEXT NOT NULL,
    "definition" JSONB NOT NULL,
    "configurationHash" TEXT NOT NULL,
    "intendedProjectType" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL,
    "validationStatus" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "submittedById" TEXT NOT NULL,
    "approvedById" TEXT NOT NULL,
    "approvalReason" TEXT NOT NULL,
    "approvedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "eventId" TEXT NOT NULL,

    CONSTRAINT "PublishedWorkflowVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowPublicationAudit" (
    "id" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "actorVersion" INTEGER NOT NULL,
    "sessionId" TEXT NOT NULL,
    "supersedingRevisionId" TEXT,
    "eventId" TEXT NOT NULL,

    CONSTRAINT "WorkflowPublicationAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowPublicationSubmission_draftRevisionId_key" ON "WorkflowPublicationSubmission"("draftRevisionId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowPublicationSubmission_approvalRequestId_key" ON "WorkflowPublicationSubmission"("approvalRequestId");

-- CreateIndex
CREATE INDEX "WorkflowPublicationSubmission_workflowId_submittedAt_id_idx" ON "WorkflowPublicationSubmission"("workflowId", "submittedAt", "id");

-- CreateIndex
CREATE INDEX "WorkflowPublicationSubmission_previousPublishedVersionId_idx" ON "WorkflowPublicationSubmission"("previousPublishedVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowPublicationSubmission_submittedById_commandId_key" ON "WorkflowPublicationSubmission"("submittedById", "commandId");

-- CreateIndex
CREATE UNIQUE INDEX "PublishedWorkflowVersion_submissionId_key" ON "PublishedWorkflowVersion"("submissionId");

-- CreateIndex
CREATE UNIQUE INDEX "PublishedWorkflowVersion_draftRevisionId_key" ON "PublishedWorkflowVersion"("draftRevisionId");

-- CreateIndex
CREATE UNIQUE INDEX "PublishedWorkflowVersion_approvalRequestId_key" ON "PublishedWorkflowVersion"("approvalRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "PublishedWorkflowVersion_approvalDecisionId_key" ON "PublishedWorkflowVersion"("approvalDecisionId");

-- CreateIndex
CREATE UNIQUE INDEX "PublishedWorkflowVersion_eventId_key" ON "PublishedWorkflowVersion"("eventId");

-- CreateIndex
CREATE INDEX "PublishedWorkflowVersion_publishedAt_id_idx" ON "PublishedWorkflowVersion"("publishedAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "PublishedWorkflowVersion_workflowId_number_key" ON "PublishedWorkflowVersion"("workflowId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowPublicationAudit_eventId_key" ON "WorkflowPublicationAudit"("eventId");

-- CreateIndex
CREATE INDEX "WorkflowPublicationAudit_supersedingRevisionId_idx" ON "WorkflowPublicationAudit"("supersedingRevisionId");

-- AddForeignKey
ALTER TABLE "WorkflowPublicationSubmission" ADD CONSTRAINT "WorkflowPublicationSubmission_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "WorkflowDraft"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "WorkflowPublicationSubmission" ADD CONSTRAINT "WorkflowPublicationSubmission_draftRevisionId_fkey" FOREIGN KEY ("draftRevisionId") REFERENCES "WorkflowDraftRevision"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "WorkflowPublicationSubmission" ADD CONSTRAINT "WorkflowPublicationSubmission_approvalRequestId_fkey" FOREIGN KEY ("approvalRequestId") REFERENCES "ApprovalRequest"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "WorkflowPublicationSubmission" ADD CONSTRAINT "WorkflowPublicationSubmission_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "WorkflowPublicationSubmission" ADD CONSTRAINT "WorkflowPublicationSubmission_previousPublishedVersionId_fkey" FOREIGN KEY ("previousPublishedVersionId") REFERENCES "PublishedWorkflowVersion"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PublishedWorkflow" ADD CONSTRAINT "PublishedWorkflow_id_fkey" FOREIGN KEY ("id") REFERENCES "WorkflowDraft"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PublishedWorkflowVersion" ADD CONSTRAINT "PublishedWorkflowVersion_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "PublishedWorkflow"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PublishedWorkflowVersion" ADD CONSTRAINT "PublishedWorkflowVersion_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "WorkflowPublicationSubmission"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PublishedWorkflowVersion" ADD CONSTRAINT "PublishedWorkflowVersion_draftRevisionId_fkey" FOREIGN KEY ("draftRevisionId") REFERENCES "WorkflowDraftRevision"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PublishedWorkflowVersion" ADD CONSTRAINT "PublishedWorkflowVersion_approvalRequestId_fkey" FOREIGN KEY ("approvalRequestId") REFERENCES "ApprovalRequest"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PublishedWorkflowVersion" ADD CONSTRAINT "PublishedWorkflowVersion_approvalDecisionId_fkey" FOREIGN KEY ("approvalDecisionId") REFERENCES "ApprovalDecision"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PublishedWorkflowVersion" ADD CONSTRAINT "PublishedWorkflowVersion_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PublishedWorkflowVersion" ADD CONSTRAINT "PublishedWorkflowVersion_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PublishedWorkflowVersion" ADD CONSTRAINT "PublishedWorkflowVersion_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PublishedWorkflowVersion" ADD CONSTRAINT "PublishedWorkflowVersion_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "BusinessEvent"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "WorkflowPublicationAudit" ADD CONSTRAINT "WorkflowPublicationAudit_id_fkey" FOREIGN KEY ("id") REFERENCES "ApprovalEvent"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "WorkflowPublicationAudit" ADD CONSTRAINT "WorkflowPublicationAudit_supersedingRevisionId_fkey" FOREIGN KEY ("supersedingRevisionId") REFERENCES "WorkflowDraftRevision"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "WorkflowPublicationAudit" ADD CONSTRAINT "WorkflowPublicationAudit_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "BusinessEvent"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;



ALTER TABLE "WorkflowPublicationSubmission" ALTER CONSTRAINT "WorkflowPublicationSubmission_approvalRequestId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "WorkflowPublicationAudit" ALTER CONSTRAINT "WorkflowPublicationAudit_eventId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "PublishedWorkflowVersion" ALTER CONSTRAINT "PublishedWorkflowVersion_eventId_fkey" DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "WorkflowPublicationSubmission" ADD CONSTRAINT "WorkflowPublicationSubmission_shape" CHECK (
 "actorRole" IN ('DIRECTOR','SENIOR_PROJECT_MANAGER') AND "actorVersion">0 AND "schemaVersion"=1 AND
 "commandId" ~ '^[a-zA-Z0-9_-]{12,128}$' AND "commandHash" ~ '^[a-f0-9]{64}$' AND "configurationHash" ~ '^[a-f0-9]{64}$' AND
 length(btrim("changeSummary")) BETWEEN 1 AND 2000 AND "intendedProjectType" IN ('ARTWORK_PACKAGING','POSM','RETAIL_DISPLAY','EXHIBITION_STAND','DIGITAL','CUSTOM'));
ALTER TABLE "PublishedWorkflowVersion" ADD CONSTRAINT "PublishedWorkflowVersion_shape" CHECK (
 number>0 AND "schemaVersion"=1 AND "validationStatus"='VALID' AND "configurationHash" ~ '^[a-f0-9]{64}$' AND
 jsonb_typeof(definition)='object' AND definition->>'schemaVersion'='1' AND
 length(btrim("approvalReason")) BETWEEN 1 AND 2000 AND "publishedAt"="approvedAt");
ALTER TABLE "WorkflowPublicationAudit" ADD CONSTRAINT "WorkflowPublicationAudit_shape" CHECK (
 "actorRole" IN ('DIRECTOR','SENIOR_PROJECT_MANAGER') AND "actorVersion">0 AND length("sessionId")>0);

CREATE FUNCTION flux_workflow_actor_current(uid text, role_name text, version_number int, sid text) RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
 RETURN EXISTS(SELECT 1 FROM "UserAuthorization" a JOIN "Session" s ON s."userId"=a."userId"
 WHERE a."userId"=uid AND a."accountStatus"='ACTIVE' AND a."businessRole"::text=role_name AND a."authorizationVersion"=version_number AND
 s.id=sid AND s."expiresAt">clock_timestamp() AT TIME ZONE 'UTC' AND s.token ~ ('^v2\.'||version_number||'\.[a-f0-9]{64}$'));
END $$;

CREATE FUNCTION flux_workflow_publication_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE sub "WorkflowPublicationSubmission"; dr "WorkflowDraftRevision"; w "WorkflowDraft"; r "ApprovalRequest";
 d "ApprovalDecision"; e "ApprovalEvent"; a record; previous_id text; total int; actor_id text; actor_role text; actor_version int; session_id text;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Workflow publication evidence and versions are immutable and retained' USING ERRCODE='23514'; END IF;
 IF TG_TABLE_NAME='WorkflowPublicationAudit' THEN
  SELECT * INTO STRICT e FROM "ApprovalEvent" WHERE id=NEW.id;
  SELECT * INTO STRICT r FROM "ApprovalRequest" WHERE id=e."requestId";
  SELECT * INTO STRICT sub FROM "WorkflowPublicationSubmission" WHERE "approvalRequestId"=r.id;
  IF r."subjectType"::text<>'WORKFLOW_DRAFT_REVISION' THEN RAISE EXCEPTION 'Typed workflow approval required' USING ERRCODE='23514'; END IF;
  IF e.action='REQUESTED' THEN
   actor_id:=sub."submittedById"; actor_role:=sub."actorRole"; actor_version:=sub."actorVersion"; session_id:=sub."sessionId";
  ELSIF e.action='DECIDED' THEN
   SELECT * INTO STRICT d FROM "ApprovalDecision" WHERE id=e."decisionId";
   actor_id:=d."actorId"; actor_role:=d."actorRole"; actor_version:=d."actorVersion"; session_id:=d."sessionId";
  ELSIF e.action='SUPERSEDED' THEN
   SELECT * INTO STRICT dr FROM "WorkflowDraftRevision" WHERE id=NEW."supersedingRevisionId";
   actor_id:=dr."actorId"; actor_role:=dr."actorRole"; actor_version:=dr."actorVersion"; session_id:=current_setting('flux.draft_session',true);
   IF dr."workflowId"<>sub."workflowId" OR dr.id IS DISTINCT FROM e.details->>'supersedingRevisionId' OR
    dr.revision<=(SELECT revision FROM "WorkflowDraftRevision" WHERE id=sub."draftRevisionId") OR r.state<>'SUPERSEDED' OR
    actor_id IS DISTINCT FROM current_setting('flux.draft_actor',true) THEN RAISE EXCEPTION 'Exact superseding revision required' USING ERRCODE='23514'; END IF;
  ELSE RAISE EXCEPTION 'Unsupported workflow approval audit' USING ERRCODE='23514'; END IF;
  IF e.action<>'SUPERSEDED' AND (NEW."supersedingRevisionId" IS NOT NULL OR actor_id IS DISTINCT FROM current_setting('flux.publication_actor',true) OR
   session_id IS DISTINCT FROM current_setting('flux.publication_session',true)) THEN RAISE EXCEPTION 'Authorized publication transaction required' USING ERRCODE='23514'; END IF;
  IF NEW."actorRole"<>actor_role OR NEW."actorVersion"<>actor_version OR NEW."sessionId" IS DISTINCT FROM session_id OR e."actorId" IS DISTINCT FROM actor_id OR
   NOT flux_workflow_actor_current(actor_id,actor_role,actor_version,session_id) OR NEW."eventId"<>'workflow-approval:'||NEW.id THEN
   RAISE EXCEPTION 'Workflow audit must retain its genuine native actor' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END IF;
 SELECT * INTO a FROM "UserAuthorization" WHERE "userId"=nullif(current_setting('flux.publication_actor',true),'');
 IF a."businessRole" IS NULL OR a."businessRole"::text NOT IN ('DIRECTOR','SENIOR_PROJECT_MANAGER') OR
  NOT flux_workflow_actor_current(a."userId",a."businessRole"::text,a."authorizationVersion",current_setting('flux.publication_session',true)) THEN
  RAISE EXCEPTION 'Current publication actor session required' USING ERRCODE='23514'; END IF;
 IF TG_TABLE_NAME='WorkflowPublicationSubmission' THEN
  SELECT * INTO STRICT dr FROM "WorkflowDraftRevision" WHERE id=NEW."draftRevisionId";
  SELECT * INTO STRICT w FROM "WorkflowDraft" WHERE id=NEW."workflowId" FOR UPDATE;
  SELECT id INTO previous_id FROM "PublishedWorkflowVersion" WHERE "workflowId"=w.id ORDER BY number DESC LIMIT 1;
  IF dr."workflowId"<>w.id OR dr.revision<>w."currentRevision" OR dr."validationStatus"<>'VALID' OR jsonb_array_length(dr.definition->'stages')=0 OR
   NEW."submittedById"<>a."userId" OR NEW."actorRole"<>a."businessRole"::text OR NEW."actorVersion"<>a."authorizationVersion" OR
   NEW."sessionId" IS DISTINCT FROM current_setting('flux.publication_session',true) OR (a."businessRole"<>'DIRECTOR' AND w."createdById"<>a."userId") OR
   NEW."configurationHash"<>dr."configurationHash" OR NEW."intendedProjectType" IS DISTINCT FROM dr.definition->>'intendedProjectType' OR
   NEW."previousPublishedVersionId" IS DISTINCT FROM previous_id THEN RAISE EXCEPTION 'Authorized exact validated workflow revision required' USING ERRCODE='23514'; END IF;
  NEW."submittedAt":=clock_timestamp() AT TIME ZONE 'UTC';
  RETURN NEW;
 END IF;
 SELECT * INTO STRICT sub FROM "WorkflowPublicationSubmission" WHERE "approvalRequestId"=current_setting('flux.publication_request',true);
 SELECT * INTO STRICT r FROM "ApprovalRequest" WHERE id=sub."approvalRequestId";
 SELECT * INTO STRICT d FROM "ApprovalDecision" WHERE "requestId"=r.id;
 SELECT * INTO STRICT dr FROM "WorkflowDraftRevision" WHERE id=sub."draftRevisionId";
 SELECT * INTO STRICT w FROM "WorkflowDraft" WHERE id=sub."workflowId" FOR UPDATE;
 IF a."businessRole"<>'DIRECTOR' OR d."actorId"<>a."userId" OR d."actorRole"<>'DIRECTOR' OR d."actorVersion"<>a."authorizationVersion" OR
  d."sessionId" IS DISTINCT FROM current_setting('flux.publication_session',true) OR d.outcome<>'APPROVE' OR r.state<>'APPROVED' OR
  dr.revision<>w."currentRevision" THEN RAISE EXCEPTION 'Explicit current Director approval required for publication' USING ERRCODE='23514'; END IF;
 IF TG_TABLE_NAME='PublishedWorkflow' THEN
  IF NEW.id<>w.id OR NEW."createdAt"<>d."decidedAt" THEN RAISE EXCEPTION 'Stable approved workflow identity required' USING ERRCODE='23514'; END IF;
 ELSE
  SELECT count(*) INTO total FROM "PublishedWorkflowVersion" WHERE "workflowId"=w.id;
  SELECT id INTO previous_id FROM "PublishedWorkflowVersion" WHERE "workflowId"=w.id ORDER BY number DESC LIMIT 1;
  IF NEW."workflowId"<>w.id OR NEW.number<>total+1 OR NEW."submissionId"<>sub.id OR NEW."draftRevisionId"<>dr.id OR
   NEW."approvalRequestId"<>r.id OR NEW."approvalDecisionId"<>d.id OR NEW.definition IS DISTINCT FROM dr.definition OR
   NEW."configurationHash"<>dr."configurationHash" OR NEW."intendedProjectType"<>sub."intendedProjectType" OR NEW."schemaVersion"<>sub."schemaVersion" OR
   NEW."authorId"<>w."createdById" OR NEW."submittedById"<>sub."submittedById" OR NEW."approvedById"<>d."actorId" OR
   NEW."approvalReason"<>d.reason OR NEW."approvedAt"<>d."decidedAt" OR NEW."publishedAt"<>d."decidedAt" OR
   NEW."eventId"<>'workflow-version:'||NEW.id OR sub."previousPublishedVersionId" IS DISTINCT FROM previous_id THEN
   RAISE EXCEPTION 'Publication must equal its exact approved snapshot and next version' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['WorkflowPublicationSubmission','PublishedWorkflow','PublishedWorkflowVersion','WorkflowPublicationAudit'] LOOP
 EXECUTE format('CREATE TRIGGER flux_workflow_publication_guard BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION flux_workflow_publication_guard()',t);
 EXECUTE format('CREATE TRIGGER flux_workflow_publication_truncate BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION flux_workflow_publication_guard()',t);
END LOOP; END $$;

CREATE FUNCTION flux_workflow_approval_consistency(rid text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE r "ApprovalRequest"; sub "WorkflowPublicationSubmission"; dr "WorkflowDraftRevision"; d "ApprovalDecision";
 steps int; decisions int; versions int; audits int;
BEGIN
 SELECT * INTO STRICT r FROM "ApprovalRequest" WHERE id=rid;
 SELECT * INTO STRICT sub FROM "WorkflowPublicationSubmission" WHERE "approvalRequestId"=rid;
 SELECT * INTO STRICT dr FROM "WorkflowDraftRevision" WHERE id=sub."draftRevisionId";
 SELECT count(*) INTO steps FROM "ApprovalStep" WHERE "requestId"=rid;
 SELECT count(*) INTO decisions FROM "ApprovalDecision" WHERE "requestId"=rid;
 SELECT count(*) INTO versions FROM "PublishedWorkflowVersion" WHERE "approvalRequestId"=rid;
 SELECT count(*) INTO audits FROM "ApprovalEvent" WHERE "requestId"=rid;
 IF steps<>1 OR (SELECT eligibility FROM "ApprovalStep" WHERE "requestId"=rid)<>'DIRECTOR' OR
  EXISTS(SELECT 1 FROM "ApprovalEvidence" WHERE "requestId"=rid) OR
  (SELECT count(*) FROM "ApprovalEvent" WHERE "requestId"=rid AND action='REQUESTED')<>1 OR
  EXISTS(SELECT 1 FROM "ApprovalEvent" e LEFT JOIN "WorkflowPublicationAudit" a ON a.id=e.id WHERE e."requestId"=rid AND a.id IS NULL) OR
  r."currentStep"<>1 OR r."subjectId"<>sub."workflowId" OR r."subjectVersion"<>dr.id THEN
  RAISE EXCEPTION 'Typed workflow approval requires native revision policy and complete audit' USING ERRCODE='23514'; END IF;
 IF r.state='PENDING' THEN
  IF r.revision<>0 OR decisions<>0 OR versions<>0 OR audits<>1 OR dr.revision<>(SELECT "currentRevision" FROM "WorkflowDraft" WHERE id=sub."workflowId") THEN
   RAISE EXCEPTION 'Pending workflow approval must pin the current draft' USING ERRCODE='23514'; END IF;
 ELSIF r.state='SUPERSEDED' THEN
  IF r.revision<>1 OR decisions<>0 OR versions<>0 OR audits<>2 OR
   (SELECT count(*) FROM "ApprovalEvent" WHERE "requestId"=rid AND action='SUPERSEDED')<>1 OR
   NOT EXISTS(SELECT 1 FROM "ApprovalEvent" e JOIN "WorkflowPublicationAudit" a ON a.id=e.id JOIN "WorkflowDraftRevision" newer ON newer.id=a."supersedingRevisionId"
    WHERE e."requestId"=rid AND e.action='SUPERSEDED' AND newer."workflowId"=dr."workflowId" AND newer.revision>dr.revision) THEN
   RAISE EXCEPTION 'Superseded review must retain its exact superseding revision and never publish' USING ERRCODE='23514'; END IF;
 ELSE
  SELECT * INTO STRICT d FROM "ApprovalDecision" WHERE "requestId"=rid;
  IF decisions<>1 OR audits<>2 OR r.revision<>1 OR d."expectedRevision"<>0 OR d."actorRole"<>'DIRECTOR' OR
   (SELECT count(*) FROM "ApprovalEvent" WHERE "requestId"=rid AND action='DECIDED' AND "decisionId"=d.id)<>1 OR
   r.state::text<>(CASE d.outcome WHEN 'APPROVE' THEN 'APPROVED' ELSE 'REJECTED' END) OR
   versions<>(CASE d.outcome WHEN 'APPROVE' THEN 1 ELSE 0 END) THEN
   RAISE EXCEPTION 'Director approval and exact publication must commit atomically' USING ERRCODE='23514'; END IF;
 END IF;
END $$;

CREATE FUNCTION flux_workflow_publication_consistency() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE rid text; wid text; total int; maximum int;
BEGIN
 IF TG_TABLE_NAME='WorkflowPublicationSubmission' THEN rid:=NEW."approvalRequestId";
 ELSIF TG_TABLE_NAME='PublishedWorkflowVersion' THEN rid:=NEW."approvalRequestId"; wid:=NEW."workflowId";
 ELSIF TG_TABLE_NAME='PublishedWorkflow' THEN wid:=NEW.id;
 ELSE SELECT "requestId" INTO STRICT rid FROM "ApprovalEvent" WHERE id=NEW.id; END IF;
 IF rid IS NOT NULL THEN PERFORM flux_workflow_approval_consistency(rid); END IF;
 IF wid IS NOT NULL THEN
  SELECT count(*),max(number) INTO total,maximum FROM "PublishedWorkflowVersion" WHERE "workflowId"=wid;
  IF total=0 OR maximum<>total THEN RAISE EXCEPTION 'Published workflow requires contiguous immutable versions' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NULL;
END $$;
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['WorkflowPublicationSubmission','PublishedWorkflow','PublishedWorkflowVersion','WorkflowPublicationAudit'] LOOP
 EXECUTE format('CREATE CONSTRAINT TRIGGER flux_workflow_publication_consistency AFTER INSERT ON %I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION flux_workflow_publication_consistency()',t);
END LOOP; END $$;

CREATE FUNCTION flux_workflow_supersede_review() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r "ApprovalRequest"; eid text;
BEGIN
 FOR r IN SELECT ar.* FROM "ApprovalRequest" ar JOIN "WorkflowPublicationSubmission" sub ON sub."approvalRequestId"=ar.id
  WHERE sub."workflowId"=NEW."workflowId" AND sub."draftRevisionId"<>NEW.id AND ar.state='PENDING' FOR UPDATE OF ar LOOP
  UPDATE "ApprovalRequest" SET state='SUPERSEDED',revision=revision+1,"supersededAt"=NEW."createdAt",
   "supersessionReason"='A newer draft revision requires a fresh review.' WHERE id=r.id;
  eid:='supersede:'||r.id;
  INSERT INTO "ApprovalEvent" (id,"requestId",action,"actorId",details,"createdAt")
   VALUES(eid,r.id,'SUPERSEDED',NEW."actorId",jsonb_build_object('supersedingRevisionId',NEW.id),NEW."createdAt");
  INSERT INTO "WorkflowPublicationAudit" (id,"actorRole","actorVersion","sessionId","supersedingRevisionId","eventId")
   VALUES(eid,NEW."actorRole",NEW."actorVersion",current_setting('flux.draft_session',true),NEW.id,'workflow-approval:'||eid);
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER flux_workflow_supersede_review AFTER INSERT ON "WorkflowDraftRevision" FOR EACH ROW EXECUTE FUNCTION flux_workflow_supersede_review();

CREATE FUNCTION flux_emit_workflow_publication_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE e "ApprovalEvent"; sub "WorkflowPublicationSubmission"; d "ApprovalDecision"; eid text; event_type text; action_name text;
 actor_id text; actor_role text; actor_version int; occurred timestamp; sequence_number int; payload_value jsonb; cause text; request_id text;
BEGIN
 IF TG_TABLE_NAME='WorkflowPublicationAudit' THEN
  SELECT * INTO STRICT e FROM "ApprovalEvent" WHERE id=NEW.id;
  SELECT * INTO STRICT sub FROM "WorkflowPublicationSubmission" WHERE "approvalRequestId"=e."requestId";
  request_id:=e."requestId"; eid:=NEW."eventId"; actor_id:=e."actorId"; actor_role:=NEW."actorRole"; actor_version:=NEW."actorVersion";
  occurred:=e."createdAt"; cause:=NEW.id;
  IF e.action='REQUESTED' THEN event_type:='WORKFLOW_PUBLICATION_SUBMITTED'; sequence_number:=1; action_name:='SUBMITTED';
  ELSIF e.action='SUPERSEDED' THEN event_type:='WORKFLOW_PUBLICATION_SUPERSEDED'; sequence_number:=2; action_name:='SUPERSEDED';
  ELSE SELECT * INTO STRICT d FROM "ApprovalDecision" WHERE id=e."decisionId";
   event_type:='WORKFLOW_PUBLICATION_DECIDED'; sequence_number:=2; action_name:=d.outcome::text; END IF;
  payload_value:=jsonb_build_object('action',action_name,'workflowId',sub."workflowId",'draftRevisionId',sub."draftRevisionId",'configurationHash',sub."configurationHash",'requestId',request_id);
 ELSE
  SELECT * INTO STRICT sub FROM "WorkflowPublicationSubmission" WHERE id=NEW."submissionId";
  SELECT * INTO STRICT d FROM "ApprovalDecision" WHERE id=NEW."approvalDecisionId";
  request_id:=NEW."approvalRequestId"; eid:=NEW."eventId"; actor_id:=NEW."approvedById"; actor_role:=d."actorRole"; actor_version:=d."actorVersion";
  occurred:=NEW."publishedAt"; cause:=NEW.id; event_type:='WORKFLOW_VERSION_PUBLISHED'; sequence_number:=3;
  payload_value:=jsonb_build_object('action','PUBLISHED','workflowId',NEW."workflowId",'draftRevisionId',NEW."draftRevisionId",'configurationHash',NEW."configurationHash",'requestId',request_id,'versionId',NEW.id,'versionNumber',NEW.number);
 END IF;
 INSERT INTO "BusinessEvent" (id,type,"schemaVersion","aggregateType","aggregateId",sequence,"actorId","actorRole","actorVersion",operation,"correlationId","causationId","idempotencyKey","occurredAt",payload)
 VALUES(eid,event_type::"BusinessEventType",1,'WORKFLOW_PUBLICATION_REQUEST',request_id,sequence_number,actor_id,actor_role,actor_version,'workflowPublicationCommand',request_id,cause,eid,occurred,payload_value);
 INSERT INTO "EventOutbox" ("eventId","consumerKey") VALUES(eid,'internal.audit.v1');
 RETURN NEW;
END $$;
CREATE TRIGGER flux_emit_workflow_publication_event AFTER INSERT ON "WorkflowPublicationAudit" FOR EACH ROW EXECUTE FUNCTION flux_emit_workflow_publication_event();
CREATE TRIGGER flux_emit_workflow_publication_event AFTER INSERT ON "PublishedWorkflowVersion" FOR EACH ROW EXECUTE FUNCTION flux_emit_workflow_publication_event();


ALTER TABLE "ApprovalRequest" DROP CONSTRAINT "ApprovalRequest_values_check";

ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_values_check" CHECK (
  (("subjectType"::text = 'COMPLETION_DOCUMENT_SUBMISSION' AND "subjectId" = "completionSubmissionId" AND
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
 (type::text='COMPLETION_DOCUMENT_REVIEW_DECIDED' AND "aggregateType"='COMPLETION_DOCUMENT_SUBMISSION' AND
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
DECLARE dr "WorkflowDraftRevision"; te "UniversalTaskEntry"; tt "UniversalTask"; d "ApprovalDecision"; r "ApprovalRequest"; e "ApprovalEvidence"; v "SharedFileVersion"; o "EventOutbox"; pv "PublishedWorkflowVersion"; audit "WorkflowPublicationAudit"; ae "ApprovalEvent"; sub "WorkflowPublicationSubmission";
 expected_id text; expected_request text; expected_actor text; expected_role text; expected_version int; expected_time timestamp;
 expected_sequence int; expected_payload jsonb; expected_type text; expected_action text;
BEGIN
  IF TG_OP IN ('DELETE','TRUNCATE') OR (TG_OP='UPDATE' AND TG_TABLE_NAME<>'EventOutbox') THEN
    RAISE EXCEPTION 'Shared event history is retained and immutable' USING ERRCODE='23514'; END IF;
  IF TG_TABLE_NAME='BusinessEvent' THEN
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

COMMIT;
