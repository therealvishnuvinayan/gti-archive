-- Phase 2.2 additive candidate. Separate Neon approval required.
BEGIN;
-- CreateEnum
CREATE TYPE "ApprovalSubjectType" AS ENUM ('COMPLETION_DOCUMENT_SUBMISSION');

-- CreateEnum
CREATE TYPE "ApprovalRequestState" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "ApprovalStepEligibility" AS ENUM ('DOCUMENT_REVIEWER', 'DIRECTOR');

-- CreateEnum
CREATE TYPE "ApprovalDecisionOutcome" AS ENUM ('APPROVE', 'REJECT');

-- CreateEnum
CREATE TYPE "ApprovalEventAction" AS ENUM ('REQUESTED', 'DECIDED', 'SUPERSEDED', 'STALE_REJECTED');

-- CreateTable
CREATE TABLE "ApprovalRequest" (
    "id" TEXT NOT NULL,
    "subjectType" "ApprovalSubjectType" NOT NULL,
    "subjectId" TEXT NOT NULL,
    "subjectVersion" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "completionSubmissionId" TEXT NOT NULL,
    "submissionEventId" TEXT NOT NULL,
    "requestedById" TEXT,
    "externalRequesterEmail" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL,
    "policyKey" TEXT NOT NULL,
    "policySnapshot" JSONB NOT NULL,
    "subjectSnapshot" JSONB NOT NULL,
    "evidenceHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "state" "ApprovalRequestState" NOT NULL DEFAULT 'PENDING',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "currentStep" INTEGER NOT NULL DEFAULT 1,
    "supersededAt" TIMESTAMP(3),
    "supersessionReason" TEXT,

    CONSTRAINT "ApprovalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalStep" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "eligibility" "ApprovalStepEligibility" NOT NULL,

    CONSTRAINT "ApprovalStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalEvidence" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "fileVersionId" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,

    CONSTRAINT "ApprovalEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalDecision" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "commandId" TEXT NOT NULL,
    "expectedRevision" INTEGER NOT NULL,
    "evidenceHash" TEXT NOT NULL,
    "outcome" "ApprovalDecisionOutcome" NOT NULL,
    "reason" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "actorVersion" INTEGER NOT NULL,
    "sessionId" TEXT NOT NULL,
    "decidedAt" TIMESTAMP(3) NOT NULL,
    "nativeEventId" TEXT,

    CONSTRAINT "ApprovalDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalEvent" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "action" "ApprovalEventAction" NOT NULL,
    "actorId" TEXT,
    "externalActorEmail" TEXT,
    "nativeEventId" TEXT,
    "decisionId" TEXT,
    "details" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovalEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalRequest_completionSubmissionId_key" ON "ApprovalRequest"("completionSubmissionId");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalRequest_submissionEventId_key" ON "ApprovalRequest"("submissionEventId");

-- CreateIndex
CREATE INDEX "ApprovalRequest_projectId_state_idx" ON "ApprovalRequest"("projectId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalRequest_subjectType_subjectId_subjectVersion_key" ON "ApprovalRequest"("subjectType", "subjectId", "subjectVersion");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalStep_requestId_position_key" ON "ApprovalStep"("requestId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalStep_id_requestId_key" ON "ApprovalStep"("id", "requestId");

-- CreateIndex
CREATE INDEX "ApprovalEvidence_fileVersionId_idx" ON "ApprovalEvidence"("fileVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalEvidence_requestId_fileVersionId_key" ON "ApprovalEvidence"("requestId", "fileVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalDecision_stepId_key" ON "ApprovalDecision"("stepId");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalDecision_nativeEventId_key" ON "ApprovalDecision"("nativeEventId");

-- CreateIndex
CREATE INDEX "ApprovalDecision_actorId_idx" ON "ApprovalDecision"("actorId");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalDecision_requestId_commandId_key" ON "ApprovalDecision"("requestId", "commandId");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalDecision_requestId_expectedRevision_key" ON "ApprovalDecision"("requestId", "expectedRevision");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalDecision_stepId_requestId_key" ON "ApprovalDecision"("stepId", "requestId");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalEvent_decisionId_key" ON "ApprovalEvent"("decisionId");

-- CreateIndex
CREATE INDEX "ApprovalEvent_requestId_createdAt_idx" ON "ApprovalEvent"("requestId", "createdAt");

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_completionSubmissionId_fkey" FOREIGN KEY ("completionSubmissionId") REFERENCES "CompletionDocumentSubmission"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_submissionEventId_fkey" FOREIGN KEY ("submissionEventId") REFERENCES "CompletionDocumentEvent"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ApprovalStep" ADD CONSTRAINT "ApprovalStep_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ApprovalRequest"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ApprovalEvidence" ADD CONSTRAINT "ApprovalEvidence_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ApprovalRequest"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ApprovalEvidence" ADD CONSTRAINT "ApprovalEvidence_fileVersionId_fkey" FOREIGN KEY ("fileVersionId") REFERENCES "SharedFileVersion"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ApprovalDecision" ADD CONSTRAINT "ApprovalDecision_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ApprovalRequest"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ApprovalDecision" ADD CONSTRAINT "ApprovalDecision_stepId_requestId_fkey" FOREIGN KEY ("stepId", "requestId") REFERENCES "ApprovalStep"("id", "requestId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ApprovalDecision" ADD CONSTRAINT "ApprovalDecision_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ApprovalDecision" ADD CONSTRAINT "ApprovalDecision_nativeEventId_fkey" FOREIGN KEY ("nativeEventId") REFERENCES "CompletionDocumentEvent"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ApprovalEvent" ADD CONSTRAINT "ApprovalEvent_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ApprovalRequest"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ApprovalEvent" ADD CONSTRAINT "ApprovalEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ApprovalEvent" ADD CONSTRAINT "ApprovalEvent_nativeEventId_fkey" FOREIGN KEY ("nativeEventId") REFERENCES "CompletionDocumentEvent"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ApprovalEvent" ADD CONSTRAINT "ApprovalEvent_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "ApprovalDecision"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- Retain request/evidence/decision history. State is a projection of immutable
-- decisions; native completion submission remains the first adapter's authority.
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_values_check" CHECK (
  "subjectType" = 'COMPLETION_DOCUMENT_SUBMISSION' AND "subjectId" = "completionSubmissionId" AND
  num_nonnulls("requestedById", "externalRequesterEmail") = 1 AND
  "revision" >= 0 AND "currentStep" > 0 AND "evidenceHash" ~ '^[a-f0-9]{64}$' AND
  length(btrim("policyKey")) BETWEEN 3 AND 100 AND
  jsonb_typeof("policySnapshot") = 'object' AND jsonb_typeof("subjectSnapshot") = 'object' AND
  ((state = 'SUPERSEDED' AND "supersededAt" IS NOT NULL AND length(btrim("supersessionReason")) > 0) OR
   (state <> 'SUPERSEDED' AND "supersededAt" IS NULL AND "supersessionReason" IS NULL))
);
ALTER TABLE "ApprovalStep" ADD CONSTRAINT "ApprovalStep_position_check" CHECK (position BETWEEN 1 AND 8);
ALTER TABLE "ApprovalEvidence" ADD CONSTRAINT "ApprovalEvidence_snapshot_check" CHECK (jsonb_typeof(snapshot) = 'object');
ALTER TABLE "ApprovalDecision" ADD CONSTRAINT "ApprovalDecision_values_check" CHECK (
  "expectedRevision" >= 0 AND "actorVersion" > 0 AND
  "actorRole" IN ('DIRECTOR','SENIOR_PROJECT_MANAGER','JUNIOR_PROJECT_MANAGER') AND
  "commandId" ~ '^[a-zA-Z0-9_-]{12,128}$' AND "evidenceHash" ~ '^[a-f0-9]{64}$' AND
  length(btrim(reason)) BETWEEN 1 AND 2000 AND length("sessionId") > 0
);
ALTER TABLE "ApprovalEvent" ADD CONSTRAINT "ApprovalEvent_actor_check" CHECK (
  num_nonnulls("actorId", "externalActorEmail") = 1 AND jsonb_typeof(details) = 'object' AND
  ((action = 'DECIDED' AND "decisionId" IS NOT NULL AND "actorId" IS NOT NULL) OR (action <> 'DECIDED' AND "decisionId" IS NULL))
);
CREATE UNIQUE INDEX "ApprovalEvent_one_request" ON "ApprovalEvent" ("requestId") WHERE action = 'REQUESTED';
CREATE UNIQUE INDEX "ApprovalEvent_one_supersession" ON "ApprovalEvent" ("requestId") WHERE action = 'SUPERSEDED';
CREATE UNIQUE INDEX "ApprovalEvent_one_stale_rejection" ON "ApprovalEvent" ("requestId") WHERE action = 'STALE_REJECTED';

CREATE FUNCTION flux_approval_write_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE r "ApprovalRequest"; s "CompletionDocumentSubmission"; v "SharedFileVersion";
  e "CompletionDocumentEvent"; st "ApprovalStep"; d "ApprovalDecision"; auth record; step_count int;
BEGIN
  IF TG_OP IN ('DELETE','TRUNCATE') THEN RAISE EXCEPTION 'Approval history is retained' USING ERRCODE = '23514'; END IF;
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
CREATE TRIGGER "ApprovalRequest_write_guard" BEFORE INSERT OR UPDATE OR DELETE ON "ApprovalRequest" FOR EACH ROW EXECUTE FUNCTION flux_approval_write_guard();
CREATE TRIGGER "ApprovalStep_write_guard" BEFORE INSERT OR UPDATE OR DELETE ON "ApprovalStep" FOR EACH ROW EXECUTE FUNCTION flux_approval_write_guard();
CREATE TRIGGER "ApprovalEvidence_write_guard" BEFORE INSERT OR UPDATE OR DELETE ON "ApprovalEvidence" FOR EACH ROW EXECUTE FUNCTION flux_approval_write_guard();
CREATE TRIGGER "ApprovalDecision_write_guard" BEFORE INSERT OR UPDATE OR DELETE ON "ApprovalDecision" FOR EACH ROW EXECUTE FUNCTION flux_approval_write_guard();
CREATE TRIGGER "ApprovalEvent_write_guard" BEFORE INSERT OR UPDATE OR DELETE ON "ApprovalEvent" FOR EACH ROW EXECUTE FUNCTION flux_approval_write_guard();

-- Deferred checks allow the native decision, immutable decision and projection to
-- be written in either order, but never committed as competing sources of truth.
DO $$ DECLARE tbl text; BEGIN
  FOREACH tbl IN ARRAY ARRAY['ApprovalRequest','ApprovalStep','ApprovalEvidence','ApprovalDecision','ApprovalEvent'] LOOP
    EXECUTE format('CREATE TRIGGER approval_truncate_guard BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION flux_approval_write_guard()', tbl);
  END LOOP;
END $$;

CREATE FUNCTION flux_approval_consistency_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE rid text; r "ApprovalRequest"; s "CompletionDocumentSubmission"; last_decision record;
  step_count int; decision_count int; rejected_count int; expected_state text; native_state text;
BEGIN
  IF TG_TABLE_NAME = 'ApprovalRequest' THEN rid := NEW.id;
  ELSIF TG_TABLE_NAME = 'CompletionDocumentSubmission' THEN SELECT id INTO rid FROM "ApprovalRequest" WHERE "completionSubmissionId" = NEW.id;
  ELSE rid := NEW."requestId"; END IF;
  IF rid IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO STRICT r FROM "ApprovalRequest" WHERE id = rid;
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
CREATE CONSTRAINT TRIGGER "ApprovalRequest_consistent" AFTER INSERT OR UPDATE ON "ApprovalRequest" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION flux_approval_consistency_guard();
CREATE CONSTRAINT TRIGGER "ApprovalStep_consistent" AFTER INSERT ON "ApprovalStep" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION flux_approval_consistency_guard();
CREATE CONSTRAINT TRIGGER "ApprovalEvidence_consistent" AFTER INSERT ON "ApprovalEvidence" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION flux_approval_consistency_guard();
CREATE CONSTRAINT TRIGGER "ApprovalDecision_consistent" AFTER INSERT ON "ApprovalDecision" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION flux_approval_consistency_guard();
CREATE CONSTRAINT TRIGGER "ApprovalEvent_consistent" AFTER INSERT ON "ApprovalEvent" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION flux_approval_consistency_guard();
CREATE CONSTRAINT TRIGGER "CompletionSubmission_approval_consistent" AFTER INSERT OR UPDATE ON "CompletionDocumentSubmission" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION flux_approval_consistency_guard();
COMMIT;
