-- CreateEnum
CREATE TYPE "CompletionSubmissionStatus" AS ENUM ('UPLOADING', 'SUBMITTED', 'ACCEPTED', 'REJECTED', 'FAILED');

-- AlterTable
ALTER TABLE "ProjectCompletionDocument" ADD COLUMN     "externalSubmitterEmail" TEXT,
ADD COLUMN     "submissionId" TEXT,
ALTER COLUMN "uploadedById" DROP NOT NULL;

-- CreateTable
CREATE TABLE "CompletionDocumentAccess" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "type" "ProjectCompletionDocumentType" NOT NULL,
    "requestTime" TIMESTAMP(3) NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "issuedById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompletionDocumentAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompletionDocumentSubmission" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "type" "ProjectCompletionDocumentType" NOT NULL,
    "requestTime" TIMESTAMP(3) NOT NULL,
    "evidenceHash" TEXT NOT NULL,
    "accessId" TEXT,
    "submittedById" TEXT,
    "externalSubmitterEmail" TEXT,
    "originalFileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "bucket" TEXT NOT NULL,
    "uploadKey" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" "CompletionSubmissionStatus" NOT NULL DEFAULT 'UPLOADING',
    "uploadedAt" TIMESTAMP(3),
    "objectETag" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompletionDocumentSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompletionDocumentEvent" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "submissionId" TEXT,
    "accessId" TEXT,
    "actorId" TEXT,
    "externalActorEmail" TEXT,
    "action" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompletionDocumentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompletionDocumentAccess_tokenHash_key" ON "CompletionDocumentAccess"("tokenHash");

-- CreateIndex
CREATE INDEX "CompletionDocumentAccess_workflowId_type_idx" ON "CompletionDocumentAccess"("workflowId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "CompletionDocumentSubmission_uploadKey_key" ON "CompletionDocumentSubmission"("uploadKey");

-- CreateIndex
CREATE UNIQUE INDEX "CompletionDocumentSubmission_storageKey_key" ON "CompletionDocumentSubmission"("storageKey");

-- CreateIndex
CREATE INDEX "CompletionDocumentSubmission_workflowId_type_createdAt_idx" ON "CompletionDocumentSubmission"("workflowId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "CompletionDocumentEvent_projectId_createdAt_idx" ON "CompletionDocumentEvent"("projectId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectCompletionWorkflow_id_projectId_key" ON "ProjectCompletionWorkflow"("id", "projectId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectCompletionDocument_submissionId_key" ON "ProjectCompletionDocument"("submissionId");

-- AddForeignKey
ALTER TABLE "ProjectCompletionDocument" ADD CONSTRAINT "ProjectCompletionDocument_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "CompletionDocumentSubmission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompletionDocumentAccess" ADD CONSTRAINT "CompletionDocumentAccess_workflowId_projectId_fkey" FOREIGN KEY ("workflowId", "projectId") REFERENCES "ProjectCompletionWorkflow"("id", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompletionDocumentAccess" ADD CONSTRAINT "CompletionDocumentAccess_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompletionDocumentSubmission" ADD CONSTRAINT "CompletionDocumentSubmission_workflowId_projectId_fkey" FOREIGN KEY ("workflowId", "projectId") REFERENCES "ProjectCompletionWorkflow"("id", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompletionDocumentSubmission" ADD CONSTRAINT "CompletionDocumentSubmission_accessId_fkey" FOREIGN KEY ("accessId") REFERENCES "CompletionDocumentAccess"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompletionDocumentSubmission" ADD CONSTRAINT "CompletionDocumentSubmission_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompletionDocumentSubmission" ADD CONSTRAINT "CompletionDocumentSubmission_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompletionDocumentEvent" ADD CONSTRAINT "CompletionDocumentEvent_workflowId_projectId_fkey" FOREIGN KEY ("workflowId", "projectId") REFERENCES "ProjectCompletionWorkflow"("id", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompletionDocumentEvent" ADD CONSTRAINT "CompletionDocumentEvent_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "CompletionDocumentSubmission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompletionDocumentEvent" ADD CONSTRAINT "CompletionDocumentEvent_accessId_fkey" FOREIGN KEY ("accessId") REFERENCES "CompletionDocumentAccess"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompletionDocumentEvent" ADD CONSTRAINT "CompletionDocumentEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- History is append-only. Capabilities and tickets are bound to their actual
-- workflow/project; authenticated service transactions supply the audit actor.
ALTER TABLE "CompletionDocumentSubmission" ADD CONSTRAINT "completion_submission_actor" CHECK (
  ("submittedById" IS NOT NULL AND "accessId" IS NULL AND "externalSubmitterEmail" IS NULL) OR
  ("submittedById" IS NULL AND "accessId" IS NOT NULL AND "externalSubmitterEmail" IS NOT NULL));
ALTER TABLE "CompletionDocumentSubmission" ADD CONSTRAINT "completion_submission_file" CHECK ("fileSize" > 0 AND "expiresAt" > "createdAt");
ALTER TABLE "CompletionDocumentEvent" ADD CONSTRAINT "completion_event_actor" CHECK (("actorId" IS NULL) <> ("externalActorEmail" IS NULL));
ALTER TABLE "CompletionDocumentAccess" ADD CONSTRAINT "completion_access_expiry" CHECK ("expiresAt" > "createdAt");
CREATE UNIQUE INDEX "completion_one_submitted_document" ON "CompletionDocumentSubmission" ("workflowId", "type", "requestTime") WHERE status = 'SUBMITTED';

CREATE FUNCTION flux_completion_history_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE actor text := nullif(current_setting('flux.completion_actor', true), '');
DECLARE access_id text := nullif(current_setting('flux.completion_access', true), '');
DECLARE linked "CompletionDocumentAccess";
DECLARE submitted "CompletionDocumentSubmission";
BEGIN
  IF TG_OP IN ('DELETE', 'TRUNCATE') OR (TG_TABLE_NAME = 'CompletionDocumentEvent' AND TG_OP = 'UPDATE') THEN
    RAISE EXCEPTION 'Completion document history is immutable';
  END IF;
  IF TG_TABLE_NAME = 'CompletionDocumentAccess' THEN
    IF actor IS NULL THEN RAISE EXCEPTION 'Authenticated capability issuer required'; END IF;
    IF TG_OP = 'INSERT' AND NEW."issuedById" IS DISTINCT FROM actor THEN RAISE EXCEPTION 'Incorrect capability issuer'; END IF;
    IF TG_OP = 'UPDATE' AND ((to_jsonb(NEW) - 'revokedAt') IS DISTINCT FROM (to_jsonb(OLD) - 'revokedAt') OR OLD."revokedAt" IS NOT NULL OR NEW."revokedAt" IS NULL) THEN RAISE EXCEPTION 'Capability history is immutable'; END IF;
  ELSIF TG_TABLE_NAME = 'CompletionDocumentSubmission' THEN
    IF NEW."accessId" IS NOT NULL THEN
      SELECT * INTO linked FROM "CompletionDocumentAccess" WHERE id = NEW."accessId";
      IF linked.id IS NULL OR (linked."projectId", linked."workflowId", linked.type, linked."requestTime", linked."recipientEmail") IS DISTINCT FROM (NEW."projectId", NEW."workflowId", NEW.type, NEW."requestTime", NEW."externalSubmitterEmail") THEN RAISE EXCEPTION 'Submission capability association mismatch'; END IF;
    END IF;
    IF TG_OP = 'INSERT' THEN
      IF NEW.status <> 'UPLOADING' OR NEW."reviewedById" IS NOT NULL OR NEW."uploadedAt" IS NOT NULL OR NEW."objectETag" IS NOT NULL OR NEW."reviewedAt" IS NOT NULL OR NEW."reviewReason" IS NOT NULL THEN RAISE EXCEPTION 'Invalid initial submission'; END IF;
      IF (NEW."submittedById" IS NOT NULL AND NEW."submittedById" IS DISTINCT FROM actor) OR (NEW."accessId" IS NOT NULL AND NEW."accessId" IS DISTINCT FROM access_id) THEN RAISE EXCEPTION 'Incorrect submission actor'; END IF;
    ELSE
      IF (to_jsonb(NEW) - ARRAY['status','uploadedAt','objectETag','reviewedById','reviewedAt','reviewReason']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','uploadedAt','objectETag','reviewedById','reviewedAt','reviewReason']) THEN RAISE EXCEPTION 'Submission identity and file metadata are immutable'; END IF;
      IF OLD.status = 'UPLOADING' AND NEW.status IN ('SUBMITTED','FAILED') THEN
        IF (NEW."submittedById" IS NOT NULL AND NEW."submittedById" IS DISTINCT FROM actor) OR (NEW."accessId" IS NOT NULL AND NEW."accessId" IS DISTINCT FROM access_id) THEN RAISE EXCEPTION 'Incorrect upload actor'; END IF;
        IF NEW.status = 'SUBMITTED' AND (NEW."uploadedAt" IS NULL OR NEW."objectETag" IS NULL) THEN RAISE EXCEPTION 'Verified object evidence required'; END IF;
        IF NEW."reviewedById" IS NOT NULL OR NEW."reviewedAt" IS NOT NULL OR NEW."reviewReason" IS NOT NULL THEN RAISE EXCEPTION 'Review cannot be inferred from upload'; END IF;
      ELSIF OLD.status = 'SUBMITTED' AND NEW.status IN ('ACCEPTED','REJECTED') THEN
        IF actor IS NULL OR NEW."reviewedById" IS DISTINCT FROM actor OR NEW."reviewedAt" IS NULL OR length(trim(NEW."reviewReason")) = 0 OR NEW."reviewReason" IS NULL THEN RAISE EXCEPTION 'Actual review actor and reason required'; END IF;
        IF (NEW."uploadedAt", NEW."objectETag") IS DISTINCT FROM (OLD."uploadedAt", OLD."objectETag") THEN RAISE EXCEPTION 'Uploaded evidence is immutable'; END IF;
      ELSE RAISE EXCEPTION 'Invalid submission transition'; END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'ProjectCompletionDocument' THEN
    IF TG_OP = 'UPDATE' THEN RAISE EXCEPTION 'Accepted document evidence is immutable'; END IF;
    IF NEW."submissionId" IS NOT NULL THEN
      SELECT * INTO submitted FROM "CompletionDocumentSubmission" WHERE id = NEW."submissionId";
      IF submitted.status <> 'ACCEPTED' OR actor IS NULL OR submitted."reviewedById" IS DISTINCT FROM actor OR
        (NEW."projectId", NEW."workflowId", NEW.type, NEW."uploadedById", NEW."externalSubmitterEmail", NEW."storageKey", NEW.bucket, NEW."mimeType", NEW."fileSize", NEW."uploadedAt", NEW."originalFileName") IS DISTINCT FROM
        (submitted."projectId", submitted."workflowId", submitted.type, submitted."submittedById", submitted."externalSubmitterEmail", submitted."storageKey", submitted.bucket, submitted."mimeType", submitted."fileSize", submitted."uploadedAt", submitted."originalFileName") THEN RAISE EXCEPTION 'Accepted document must match the reviewed submission'; END IF;
    ELSIF NEW."uploadedById" IS NULL THEN RAISE EXCEPTION 'Legacy document requires its original submitter'; END IF;
    IF NOT EXISTS (SELECT 1 FROM "ProjectCompletionWorkflow" WHERE id = NEW."workflowId" AND "projectId" = NEW."projectId") THEN RAISE EXCEPTION 'Document project association mismatch'; END IF;
  ELSIF TG_TABLE_NAME = 'CompletionDocumentEvent' THEN
    IF NEW."actorId" IS NOT NULL THEN
      IF NEW."actorId" IS DISTINCT FROM actor THEN RAISE EXCEPTION 'Incorrect audit actor'; END IF;
    ELSE
      SELECT * INTO linked FROM "CompletionDocumentAccess" WHERE id = access_id;
      IF linked.id IS NULL OR (NEW."externalActorEmail", NEW."projectId", NEW."workflowId") IS DISTINCT FROM (linked."recipientEmail", linked."projectId", linked."workflowId") THEN RAISE EXCEPTION 'Incorrect external audit actor'; END IF;
    END IF;
    IF NEW."submissionId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "CompletionDocumentSubmission" WHERE id = NEW."submissionId" AND "projectId" = NEW."projectId" AND "workflowId" = NEW."workflowId") THEN RAISE EXCEPTION 'Audit submission association mismatch'; END IF;
    IF NEW."accessId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "CompletionDocumentAccess" WHERE id = NEW."accessId" AND "projectId" = NEW."projectId" AND "workflowId" = NEW."workflowId") THEN RAISE EXCEPTION 'Audit capability association mismatch'; END IF;
  END IF;
  RETURN NEW;
END $$;
DO $$ DECLARE tbl text; BEGIN
  FOREACH tbl IN ARRAY ARRAY['CompletionDocumentAccess','CompletionDocumentSubmission','CompletionDocumentEvent','ProjectCompletionDocument'] LOOP
    EXECUTE format('CREATE TRIGGER completion_history_guard BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION flux_completion_history_guard()', tbl);
    EXECUTE format('CREATE TRIGGER completion_truncate_guard BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION flux_completion_history_guard()', tbl);
  END LOOP;
END $$;

DROP INDEX "ProjectCompletionDocument_workflowId_type_key";
CREATE INDEX "ProjectCompletionDocument_workflowId_type_idx" ON "ProjectCompletionDocument"("workflowId", "type");
