BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- CreateEnum
CREATE TYPE "BusinessEventType" AS ENUM ('COMPLETION_DOCUMENT_REVIEW_DECIDED');

-- CreateEnum
CREATE TYPE "EventDeliveryState" AS ENUM ('PENDING', 'PROCESSING', 'DELIVERED', 'FAILED');

-- CreateEnum
CREATE TYPE "EventAttemptOutcome" AS ENUM ('CLAIMED', 'SUCCEEDED', 'RETRY', 'DEAD', 'EXPIRED');

-- CreateTable
CREATE TABLE "BusinessEvent" (
    "id" TEXT NOT NULL,
    "type" "BusinessEventType" NOT NULL,
    "schemaVersion" INTEGER NOT NULL,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "projectId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "actorVersion" INTEGER NOT NULL,
    "operation" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "nativeEventId" TEXT NOT NULL,
    "approvalEvidenceId" TEXT NOT NULL,
    "fileVersionId" TEXT NOT NULL,
    "correlationId" TEXT NOT NULL,
    "causationId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'::text),
    "payload" JSONB NOT NULL,

    CONSTRAINT "BusinessEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventOutbox" (
    "eventId" TEXT NOT NULL,
    "consumerKey" TEXT NOT NULL,
    "state" "EventDeliveryState" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'::text),
    "leaseToken" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,

    CONSTRAINT "EventOutbox_pkey" PRIMARY KEY ("eventId")
);

-- CreateTable
CREATE TABLE "EventDeliveryAttempt" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "outcome" "EventAttemptOutcome" NOT NULL,
    "errorCode" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'::text),

    CONSTRAINT "EventDeliveryAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventConsumerReceipt" (
    "eventId" TEXT NOT NULL,
    "consumerKey" TEXT NOT NULL,
    "consumedAt" TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'::text),

    CONSTRAINT "EventConsumerReceipt_pkey" PRIMARY KEY ("eventId","consumerKey")
);

-- CreateIndex
CREATE UNIQUE INDEX "BusinessEvent_decisionId_key" ON "BusinessEvent"("decisionId");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessEvent_nativeEventId_key" ON "BusinessEvent"("nativeEventId");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessEvent_idempotencyKey_key" ON "BusinessEvent"("idempotencyKey");

-- CreateIndex
CREATE INDEX "BusinessEvent_projectId_occurredAt_id_idx" ON "BusinessEvent"("projectId", "occurredAt", "id");

-- CreateIndex
CREATE INDEX "BusinessEvent_fileVersionId_idx" ON "BusinessEvent"("fileVersionId");

-- CreateIndex
CREATE INDEX "BusinessEvent_approvalEvidenceId_idx" ON "BusinessEvent"("approvalEvidenceId");

-- CreateIndex
CREATE INDEX "BusinessEvent_actorId_idx" ON "BusinessEvent"("actorId");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessEvent_aggregateType_aggregateId_sequence_key" ON "BusinessEvent"("aggregateType", "aggregateId", "sequence");

-- CreateIndex
CREATE INDEX "EventOutbox_state_availableAt_idx" ON "EventOutbox"("state", "availableAt");

-- CreateIndex
CREATE INDEX "EventOutbox_state_leaseUntil_idx" ON "EventOutbox"("state", "leaseUntil");

-- CreateIndex
CREATE UNIQUE INDEX "EventDeliveryAttempt_eventId_attempt_outcome_key" ON "EventDeliveryAttempt"("eventId", "attempt", "outcome");

-- AddForeignKey
ALTER TABLE "BusinessEvent" ADD CONSTRAINT "BusinessEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "BusinessEvent" ADD CONSTRAINT "BusinessEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "BusinessEvent" ADD CONSTRAINT "BusinessEvent_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "ApprovalDecision"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "BusinessEvent" ADD CONSTRAINT "BusinessEvent_nativeEventId_fkey" FOREIGN KEY ("nativeEventId") REFERENCES "CompletionDocumentEvent"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "BusinessEvent" ADD CONSTRAINT "BusinessEvent_approvalEvidenceId_fkey" FOREIGN KEY ("approvalEvidenceId") REFERENCES "ApprovalEvidence"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "BusinessEvent" ADD CONSTRAINT "BusinessEvent_fileVersionId_fkey" FOREIGN KEY ("fileVersionId") REFERENCES "SharedFileVersion"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "EventOutbox" ADD CONSTRAINT "EventOutbox_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "BusinessEvent"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "EventDeliveryAttempt" ADD CONSTRAINT "EventDeliveryAttempt_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "EventOutbox"("eventId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "EventConsumerReceipt" ADD CONSTRAINT "EventConsumerReceipt_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "BusinessEvent"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Only new decisions at the reviewed native boundary adopt this ledger. This
-- trigger runs after Phase 2.2's actor/session/evidence guards, in the same tx.
CREATE FUNCTION flux_emit_completion_review_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r "ApprovalRequest"; e "ApprovalEvidence"; v "SharedFileVersion"; eid text;
BEGIN
  IF NEW."nativeEventId" IS NULL OR NEW."nativeEventId" IS DISTINCT FROM nullif(current_setting('flux.shared_event_native',true),'') THEN RETURN NEW; END IF;
  SELECT * INTO STRICT r FROM "ApprovalRequest" WHERE id=NEW."requestId";
  SELECT * INTO STRICT e FROM "ApprovalEvidence" WHERE "requestId"=r.id;
  SELECT * INTO STRICT v FROM "SharedFileVersion" WHERE id=e."fileVersionId";
  eid := 'review:' || NEW.id;
  INSERT INTO "BusinessEvent" (id,type,"schemaVersion","aggregateType","aggregateId",sequence,"projectId","actorId","actorRole","actorVersion",operation,
    "decisionId","nativeEventId","approvalEvidenceId","fileVersionId","correlationId","causationId","idempotencyKey","occurredAt",payload)
  VALUES (eid,'COMPLETION_DOCUMENT_REVIEW_DECIDED',1,'COMPLETION_DOCUMENT_SUBMISSION',r."completionSubmissionId",NEW."expectedRevision"+1,r."projectId",
    NEW."actorId",NEW."actorRole",NEW."actorVersion",'reviewCompletionDocument',NEW.id,NEW."nativeEventId",e.id,v.id,r.id,NEW."nativeEventId",eid,NEW."decidedAt",
    jsonb_build_object('outcome',NEW.outcome,'documentType',r."subjectSnapshot"->>'type','requestId',r.id,'evidenceHash',NEW."evidenceHash",'checksumEvidence',v."checksumEvidence"));
  INSERT INTO "EventOutbox" ("eventId","consumerKey") VALUES (eid,'internal.audit.v1');
  RETURN NEW;
END $$;
CREATE TRIGGER flux_emit_completion_review_event AFTER INSERT ON "ApprovalDecision" FOR EACH ROW EXECUTE FUNCTION flux_emit_completion_review_event();

ALTER TABLE "BusinessEvent" ADD CONSTRAINT "BusinessEvent_contract_check" CHECK (
  "schemaVersion"=1 AND "aggregateType"='COMPLETION_DOCUMENT_SUBMISSION' AND sequence>0 AND "actorVersion">0 AND
  "actorRole" IN ('DIRECTOR','SENIOR_PROJECT_MANAGER','JUNIOR_PROJECT_MANAGER') AND operation='reviewCompletionDocument' AND
  jsonb_typeof(payload)='object');
ALTER TABLE "EventOutbox" ADD CONSTRAINT "EventOutbox_delivery_check" CHECK (
  "consumerKey"='internal.audit.v1' AND attempts BETWEEN 0 AND 5 AND
  ("lastErrorCode" IS NULL OR "lastErrorCode" IN ('TEMPORARY_FAILURE','PERMANENT_FAILURE','LEASE_EXPIRED','UNSUPPORTED_EVENT')) AND
  ((state='PROCESSING' AND "leaseToken" IS NOT NULL AND "leaseUntil" IS NOT NULL AND attempts>0) OR
   (state<>'PROCESSING' AND "leaseToken" IS NULL AND "leaseUntil" IS NULL)) AND
  ((state='DELIVERED' AND "deliveredAt" IS NOT NULL) OR (state<>'DELIVERED' AND "deliveredAt" IS NULL)));
ALTER TABLE "EventDeliveryAttempt" ADD CONSTRAINT "EventDeliveryAttempt_check" CHECK (
  attempt BETWEEN 1 AND 5 AND ("errorCode" IS NULL OR "errorCode" IN ('TEMPORARY_FAILURE','PERMANENT_FAILURE','LEASE_EXPIRED','UNSUPPORTED_EVENT')));
ALTER TABLE "EventConsumerReceipt" ADD CONSTRAINT "EventConsumerReceipt_consumer_check" CHECK ("consumerKey"='internal.audit.v1');

CREATE FUNCTION flux_event_write_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE d "ApprovalDecision"; r "ApprovalRequest"; e "ApprovalEvidence"; v "SharedFileVersion"; o "EventOutbox";
BEGIN
  IF TG_OP IN ('DELETE','TRUNCATE') OR (TG_OP='UPDATE' AND TG_TABLE_NAME<>'EventOutbox') THEN
    RAISE EXCEPTION 'Shared event history is retained and immutable' USING ERRCODE='23514'; END IF;
  IF TG_TABLE_NAME='BusinessEvent' THEN
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
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['BusinessEvent','EventOutbox','EventDeliveryAttempt','EventConsumerReceipt'] LOOP
    EXECUTE format('CREATE TRIGGER flux_event_write BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION flux_event_write_guard()',t);
    EXECUTE format('CREATE TRIGGER flux_event_truncate BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION flux_event_write_guard()',t);
  END LOOP;
END $$;

CREATE FUNCTION flux_event_delivery_consistency() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE eid text; o "EventOutbox";
BEGIN
  IF TG_TABLE_NAME='BusinessEvent' THEN eid:=NEW.id; ELSE eid:=NEW."eventId"; END IF;
  SELECT * INTO o FROM "EventOutbox" WHERE "eventId"=eid;
  IF o."eventId" IS NULL OR
    ((o.state='DELIVERED') IS DISTINCT FROM EXISTS (SELECT 1 FROM "EventConsumerReceipt" WHERE "eventId"=eid AND "consumerKey"=o."consumerKey")) OR
    (o.attempts>0 AND NOT EXISTS (SELECT 1 FROM "EventDeliveryAttempt" WHERE "eventId"=eid AND attempt=o.attempts AND outcome='CLAIMED')) OR
    (o.state='DELIVERED' AND NOT EXISTS (SELECT 1 FROM "EventDeliveryAttempt" WHERE "eventId"=eid AND attempt=o.attempts AND outcome='SUCCEEDED')) OR
    (o.state='PENDING' AND o.attempts>0 AND NOT EXISTS (SELECT 1 FROM "EventDeliveryAttempt" WHERE "eventId"=eid AND attempt=o.attempts AND outcome='RETRY')) OR
    (o.state='FAILED' AND NOT EXISTS (SELECT 1 FROM "EventDeliveryAttempt" WHERE "eventId"=eid AND attempt=o.attempts AND outcome IN ('DEAD','EXPIRED'))) OR
    (o.state='PROCESSING' AND EXISTS (SELECT 1 FROM "EventDeliveryAttempt" WHERE "eventId"=eid AND attempt=o.attempts AND outcome<>'CLAIMED')) THEN
    RAISE EXCEPTION 'Event requires atomic outbox receipt and attempt history' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER flux_event_delivery_consistency AFTER INSERT ON "BusinessEvent" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION flux_event_delivery_consistency();
CREATE CONSTRAINT TRIGGER flux_event_delivery_consistency AFTER INSERT OR UPDATE ON "EventOutbox" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION flux_event_delivery_consistency();
CREATE CONSTRAINT TRIGGER flux_event_delivery_consistency AFTER INSERT ON "EventConsumerReceipt" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION flux_event_delivery_consistency();
CREATE CONSTRAINT TRIGGER flux_event_delivery_consistency AFTER INSERT ON "EventDeliveryAttempt" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION flux_event_delivery_consistency();
COMMIT;
