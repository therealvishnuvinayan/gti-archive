-- CreateEnum
CREATE TYPE "GovernedProjectKind" AS ENUM ('ARTWORK', 'FLEXIBLE');

-- CreateEnum
CREATE TYPE "ProjectGovernanceStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'ACTIVATED');

-- CreateTable
CREATE TABLE "LegacyProjectPresetApproval" (
    "id" TEXT NOT NULL,
    "presetKey" TEXT NOT NULL,
    "definitionHash" TEXT NOT NULL,
    "definition" JSONB NOT NULL,
    "approvedById" TEXT NOT NULL,
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,
    "revocationReason" TEXT,

    CONSTRAINT "LegacyProjectPresetApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectCreationRequest" (
    "id" TEXT NOT NULL,
    "clientRequestId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "requesterVersion" INTEGER NOT NULL,
    "kind" "GovernedProjectKind" NOT NULL,
    "configuration" JSONB NOT NULL,
    "configurationHash" TEXT NOT NULL,
    "presetApprovalId" TEXT,
    "status" "ProjectGovernanceStatus" NOT NULL DEFAULT 'SUBMITTED',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionReason" TEXT,
    "activatedAt" TIMESTAMP(3),
    "projectId" TEXT,
    "flexibleProjectId" TEXT,

    CONSTRAINT "ProjectCreationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectFinalCompletionRequest" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "flexibleProjectId" TEXT,
    "requesterId" TEXT NOT NULL,
    "requesterVersion" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "snapshotHash" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "ProjectGovernanceStatus" NOT NULL DEFAULT 'SUBMITTED',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionReason" TEXT,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ProjectFinalCompletionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectGovernanceEvent" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creationRequestId" TEXT,
    "completionRequestId" TEXT,
    "presetApprovalId" TEXT,
    "templateProposalId" TEXT,

    CONSTRAINT "ProjectGovernanceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectTemplateProposal" (
    "id" TEXT NOT NULL,
    "clientRequestId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "requesterVersion" INTEGER NOT NULL,
    "proposal" JSONB NOT NULL,
    "proposalHash" TEXT NOT NULL,
    "status" "ProjectGovernanceStatus" NOT NULL DEFAULT 'SUBMITTED',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionReason" TEXT,

    CONSTRAINT "ProjectTemplateProposal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LegacyProjectPresetApproval_presetKey_definitionHash_idx" ON "LegacyProjectPresetApproval"("presetKey", "definitionHash");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectCreationRequest_projectId_key" ON "ProjectCreationRequest"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectCreationRequest_flexibleProjectId_key" ON "ProjectCreationRequest"("flexibleProjectId");

-- CreateIndex
CREATE INDEX "ProjectCreationRequest_status_submittedAt_idx" ON "ProjectCreationRequest"("status", "submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectCreationRequest_requesterId_clientRequestId_key" ON "ProjectCreationRequest"("requesterId", "clientRequestId");

-- CreateIndex
CREATE INDEX "ProjectFinalCompletionRequest_projectId_submittedAt_idx" ON "ProjectFinalCompletionRequest"("projectId", "submittedAt");

-- CreateIndex
CREATE INDEX "ProjectFinalCompletionRequest_flexibleProjectId_submittedAt_idx" ON "ProjectFinalCompletionRequest"("flexibleProjectId", "submittedAt");

-- CreateIndex
CREATE INDEX "ProjectFinalCompletionRequest_status_submittedAt_idx" ON "ProjectFinalCompletionRequest"("status", "submittedAt");

-- CreateIndex
CREATE INDEX "ProjectGovernanceEvent_creationRequestId_createdAt_idx" ON "ProjectGovernanceEvent"("creationRequestId", "createdAt");

-- CreateIndex
CREATE INDEX "ProjectGovernanceEvent_completionRequestId_createdAt_idx" ON "ProjectGovernanceEvent"("completionRequestId", "createdAt");

-- CreateIndex
CREATE INDEX "ProjectGovernanceEvent_presetApprovalId_createdAt_idx" ON "ProjectGovernanceEvent"("presetApprovalId", "createdAt");

-- CreateIndex
CREATE INDEX "ProjectGovernanceEvent_templateProposalId_createdAt_idx" ON "ProjectGovernanceEvent"("templateProposalId", "createdAt");

-- CreateIndex
CREATE INDEX "ProjectTemplateProposal_status_submittedAt_idx" ON "ProjectTemplateProposal"("status", "submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectTemplateProposal_requesterId_clientRequestId_key" ON "ProjectTemplateProposal"("requesterId", "clientRequestId");

-- AddForeignKey
ALTER TABLE "LegacyProjectPresetApproval" ADD CONSTRAINT "LegacyProjectPresetApproval_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegacyProjectPresetApproval" ADD CONSTRAINT "LegacyProjectPresetApproval_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectCreationRequest" ADD CONSTRAINT "ProjectCreationRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectCreationRequest" ADD CONSTRAINT "ProjectCreationRequest_presetApprovalId_fkey" FOREIGN KEY ("presetApprovalId") REFERENCES "LegacyProjectPresetApproval"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectCreationRequest" ADD CONSTRAINT "ProjectCreationRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectCreationRequest" ADD CONSTRAINT "ProjectCreationRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectCreationRequest" ADD CONSTRAINT "ProjectCreationRequest_flexibleProjectId_fkey" FOREIGN KEY ("flexibleProjectId") REFERENCES "FlexibleProject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectFinalCompletionRequest" ADD CONSTRAINT "ProjectFinalCompletionRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectFinalCompletionRequest" ADD CONSTRAINT "ProjectFinalCompletionRequest_flexibleProjectId_fkey" FOREIGN KEY ("flexibleProjectId") REFERENCES "FlexibleProject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectFinalCompletionRequest" ADD CONSTRAINT "ProjectFinalCompletionRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectFinalCompletionRequest" ADD CONSTRAINT "ProjectFinalCompletionRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectGovernanceEvent" ADD CONSTRAINT "ProjectGovernanceEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectGovernanceEvent" ADD CONSTRAINT "ProjectGovernanceEvent_creationRequestId_fkey" FOREIGN KEY ("creationRequestId") REFERENCES "ProjectCreationRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectGovernanceEvent" ADD CONSTRAINT "ProjectGovernanceEvent_completionRequestId_fkey" FOREIGN KEY ("completionRequestId") REFERENCES "ProjectFinalCompletionRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectGovernanceEvent" ADD CONSTRAINT "ProjectGovernanceEvent_presetApprovalId_fkey" FOREIGN KEY ("presetApprovalId") REFERENCES "LegacyProjectPresetApproval"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectGovernanceEvent" ADD CONSTRAINT "ProjectGovernanceEvent_templateProposalId_fkey" FOREIGN KEY ("templateProposalId") REFERENCES "ProjectTemplateProposal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectTemplateProposal" ADD CONSTRAINT "ProjectTemplateProposal_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectTemplateProposal" ADD CONSTRAINT "ProjectTemplateProposal_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- No legacy preset is approved by this migration. A Director must review it.
CREATE UNIQUE INDEX "LegacyProjectPresetApproval_active_key"
ON "LegacyProjectPresetApproval" ("presetKey", "definitionHash") WHERE "revokedAt" IS NULL;
CREATE UNIQUE INDEX "ProjectFinalCompletionRequest_pending_project"
ON "ProjectFinalCompletionRequest" ("projectId") WHERE "status" = 'SUBMITTED';
CREATE UNIQUE INDEX "ProjectFinalCompletionRequest_pending_flexible"
ON "ProjectFinalCompletionRequest" ("flexibleProjectId") WHERE "status" = 'SUBMITTED';

ALTER TABLE "LegacyProjectPresetApproval" ADD CONSTRAINT "preset_approval_integrity" CHECK (
  "definitionHash" ~ '^[a-f0-9]{64}$' AND length(btrim("reason")) > 0 AND
  (("revokedAt" IS NULL AND "revokedById" IS NULL AND "revocationReason" IS NULL) OR
   ("revokedAt" IS NOT NULL AND "revokedById" IS NOT NULL AND "revocationReason" IS NOT NULL AND length(btrim("revocationReason")) > 0))
);
ALTER TABLE "ProjectCreationRequest" ADD CONSTRAINT "creation_request_integrity" CHECK (
  "configurationHash" ~ '^[a-f0-9]{64}$' AND "requesterVersion" > 0 AND "expiresAt" > "submittedAt" AND
  (("status" = 'ACTIVATED' AND "activatedAt" IS NOT NULL AND
      (("kind" = 'ARTWORK' AND "projectId" IS NOT NULL AND "flexibleProjectId" IS NULL) OR
       ("kind" = 'FLEXIBLE' AND "flexibleProjectId" IS NOT NULL AND "projectId" IS NULL))) OR
   ("status" <> 'ACTIVATED' AND "activatedAt" IS NULL AND "projectId" IS NULL AND "flexibleProjectId" IS NULL)) AND
  (("status" IN ('DRAFT','SUBMITTED') AND "decidedById" IS NULL AND "decidedAt" IS NULL AND "decisionReason" IS NULL) OR
   ("status" IN ('APPROVED','REJECTED','ACTIVATED') AND "decidedById" IS NOT NULL AND "decidedAt" IS NOT NULL AND "decisionReason" IS NOT NULL AND length(btrim("decisionReason")) > 0) OR
   ("status" = 'ACTIVATED' AND "decidedById" IS NULL AND "decidedAt" IS NULL AND "decisionReason" IS NULL))
);
ALTER TABLE "ProjectFinalCompletionRequest" ADD CONSTRAINT "completion_request_integrity" CHECK (
  num_nonnulls("projectId", "flexibleProjectId") = 1 AND
  "snapshotHash" ~ '^[a-f0-9]{64}$' AND "requesterVersion" > 0 AND "expiresAt" > "submittedAt" AND length(btrim("reason")) > 0 AND
  (("status" = 'SUBMITTED' AND "decidedById" IS NULL AND "decidedAt" IS NULL AND "decisionReason" IS NULL AND "completedAt" IS NULL) OR
   ("status" IN ('APPROVED','REJECTED') AND "decidedById" IS NOT NULL AND "decidedAt" IS NOT NULL AND "decisionReason" IS NOT NULL AND length(btrim("decisionReason")) > 0 AND
    (("status" = 'APPROVED' AND "completedAt" IS NOT NULL) OR ("status" = 'REJECTED' AND "completedAt" IS NULL))))
);
ALTER TABLE "ProjectGovernanceEvent" ADD CONSTRAINT "governance_event_integrity" CHECK (
  num_nonnulls("creationRequestId", "completionRequestId", "presetApprovalId", "templateProposalId") = 1 AND
  length(btrim("reason")) > 0 AND length(btrim("action")) > 0
);

ALTER TABLE "ProjectTemplateProposal" ADD CONSTRAINT "template_proposal_integrity" CHECK (
  "proposalHash" ~ '^[a-f0-9]{64}$' AND "requesterVersion" > 0 AND "expiresAt" > "submittedAt" AND
  (("status" = 'SUBMITTED' AND "decidedById" IS NULL AND "decidedAt" IS NULL AND "decisionReason" IS NULL) OR
   ("status" IN ('APPROVED','REJECTED') AND "decidedById" IS NOT NULL AND "decidedAt" IS NOT NULL AND "decisionReason" IS NOT NULL AND length(btrim("decisionReason")) > 0))
);

-- This context binds audit attribution to the trusted service transaction.
-- Application authorization remains in the central runtime engine; the database
-- connection is trusted, and this setting is not a substitute for role checks.
CREATE FUNCTION flux_guard_project_governance() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE actor text := nullif(current_setting('flux.project_governance_actor', true), '');
BEGIN
  IF TG_OP IN ('DELETE', 'TRUNCATE') OR (TG_TABLE_NAME = 'ProjectGovernanceEvent' AND TG_OP = 'UPDATE') THEN
    RAISE EXCEPTION 'Project governance history must be retained unchanged';
  END IF;
  IF actor IS NULL THEN RAISE EXCEPTION 'Trusted project governance actor is required'; END IF;
  IF TG_OP = 'INSERT' THEN
    IF TG_TABLE_NAME = 'ProjectGovernanceEvent' THEN
      IF NEW."actorId" <> actor THEN RAISE EXCEPTION 'Incorrect governance audit actor'; END IF;
    ELSIF TG_TABLE_NAME = 'LegacyProjectPresetApproval' THEN
      IF NEW."approvedById" <> actor OR NEW."revokedAt" IS NOT NULL THEN RAISE EXCEPTION 'Invalid initial preset approval'; END IF;
    ELSE
      IF NEW."requesterId" <> actor OR NEW."status" NOT IN ('DRAFT','SUBMITTED') THEN RAISE EXCEPTION 'Invalid initial governance request'; END IF;
    END IF;
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME = 'LegacyProjectPresetApproval' THEN
    IF OLD."revokedAt" IS NOT NULL OR NEW."revokedAt" IS NULL OR NEW."revokedById" <> actor OR
       (to_jsonb(NEW) - ARRAY['revokedAt','revokedById','revocationReason']) IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY['revokedAt','revokedById','revocationReason']) THEN
      RAISE EXCEPTION 'Preset approval is immutable; only one revocation is allowed';
    END IF;
  ELSIF TG_TABLE_NAME = 'ProjectCreationRequest' THEN
    IF (to_jsonb(NEW) - ARRAY['status','decidedById','decidedAt','decisionReason','activatedAt','projectId','flexibleProjectId']) IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY['status','decidedById','decidedAt','decisionReason','activatedAt','projectId','flexibleProjectId']) THEN
      RAISE EXCEPTION 'Submitted project configuration is immutable';
    END IF;
    IF OLD."status" = 'SUBMITTED' AND NEW."status" IN ('APPROVED','REJECTED') THEN
      IF NEW."decidedById" <> actor THEN RAISE EXCEPTION 'Incorrect creation decision actor'; END IF;
    ELSIF OLD."status" IN ('DRAFT','APPROVED') AND NEW."status" = 'ACTIVATED' THEN
      IF ROW(NEW."decidedById",NEW."decidedAt",NEW."decisionReason") IS DISTINCT FROM
         ROW(OLD."decidedById",OLD."decidedAt",OLD."decisionReason") THEN
        RAISE EXCEPTION 'Creation decision must remain unchanged during activation';
      END IF;
    ELSE RAISE EXCEPTION 'Invalid or duplicate creation transition';
    END IF;
  ELSIF TG_TABLE_NAME = 'ProjectTemplateProposal' THEN
    IF (to_jsonb(NEW) - ARRAY['status','decidedById','decidedAt','decisionReason']) IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY['status','decidedById','decidedAt','decisionReason']) THEN
      RAISE EXCEPTION 'Submitted template proposal is immutable';
    END IF;
    IF OLD."status" <> 'SUBMITTED' OR NEW."status" NOT IN ('APPROVED','REJECTED') OR NEW."decidedById" <> actor THEN
      RAISE EXCEPTION 'Invalid or duplicate template proposal decision';
    END IF;
  ELSIF TG_TABLE_NAME = 'ProjectFinalCompletionRequest' THEN
    IF (to_jsonb(NEW) - ARRAY['status','decidedById','decidedAt','decisionReason','completedAt']) IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY['status','decidedById','decidedAt','decisionReason','completedAt']) THEN
      RAISE EXCEPTION 'Submitted completion evidence is immutable';
    END IF;
    IF OLD."status" <> 'SUBMITTED' OR NEW."status" NOT IN ('APPROVED','REJECTED') OR NEW."decidedById" <> actor THEN
      RAISE EXCEPTION 'Invalid or duplicate completion decision';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "guard_creation_request" BEFORE INSERT OR UPDATE OR DELETE ON "ProjectCreationRequest" FOR EACH ROW EXECUTE FUNCTION flux_guard_project_governance();
CREATE TRIGGER "guard_completion_request" BEFORE INSERT OR UPDATE OR DELETE ON "ProjectFinalCompletionRequest" FOR EACH ROW EXECUTE FUNCTION flux_guard_project_governance();
CREATE TRIGGER "guard_legacy_preset" BEFORE INSERT OR UPDATE OR DELETE ON "LegacyProjectPresetApproval" FOR EACH ROW EXECUTE FUNCTION flux_guard_project_governance();
CREATE TRIGGER "guard_governance_event" BEFORE INSERT OR UPDATE OR DELETE ON "ProjectGovernanceEvent" FOR EACH ROW EXECUTE FUNCTION flux_guard_project_governance();
CREATE TRIGGER "retain_creation_requests" BEFORE TRUNCATE ON "ProjectCreationRequest" FOR EACH STATEMENT EXECUTE FUNCTION flux_guard_project_governance();
CREATE TRIGGER "retain_completion_requests" BEFORE TRUNCATE ON "ProjectFinalCompletionRequest" FOR EACH STATEMENT EXECUTE FUNCTION flux_guard_project_governance();
CREATE TRIGGER "retain_legacy_preset_approvals" BEFORE TRUNCATE ON "LegacyProjectPresetApproval" FOR EACH STATEMENT EXECUTE FUNCTION flux_guard_project_governance();
CREATE TRIGGER "retain_governance_events" BEFORE TRUNCATE ON "ProjectGovernanceEvent" FOR EACH STATEMENT EXECUTE FUNCTION flux_guard_project_governance();
CREATE TRIGGER "guard_template_proposal" BEFORE INSERT OR UPDATE OR DELETE ON "ProjectTemplateProposal" FOR EACH ROW EXECUTE FUNCTION flux_guard_project_governance();
CREATE TRIGGER "retain_template_proposals" BEFORE TRUNCATE ON "ProjectTemplateProposal" FOR EACH STATEMENT EXECUTE FUNCTION flux_guard_project_governance();
