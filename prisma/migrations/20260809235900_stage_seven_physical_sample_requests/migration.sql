-- Add the final Stage 7 physical-sample request and decision audit without
-- removing any previously deployed evaluation, evidence, feedback, or legacy
-- milestone persistence.
CREATE TYPE "PhysicalSampleDecision" AS ENUM ('ACCEPTED', 'REJECTED');

ALTER TABLE "ProductionSampleRound"
  ADD COLUMN "recipientName" TEXT,
  ADD COLUMN "recipientEmail" TEXT,
  ADD COLUMN "requestNote" TEXT,
  ADD COLUMN "requestReferenceFileIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "emailStatus" "ProductionDispatchStatus" NOT NULL DEFAULT 'NOT_SENT',
  ADD COLUMN "emailSentAt" TIMESTAMP(3),
  ADD COLUMN "emailError" TEXT,
  ADD COLUMN "emailProviderMessageId" TEXT,
  ADD COLUMN "emailAttemptCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "decision" "PhysicalSampleDecision",
  ADD COLUMN "decisionNote" TEXT,
  ADD COLUMN "decidedById" TEXT,
  ADD COLUMN "decidedAt" TIMESTAMP(3);

CREATE INDEX "ProductionSampleRound_projectId_decision_deadline_idx"
  ON "ProductionSampleRound"("projectId", "decision", "deadline");

CREATE INDEX "ProductionSampleRound_emailStatus_updatedAt_idx"
  ON "ProductionSampleRound"("emailStatus", "updatedAt");

CREATE INDEX "ProductionSampleRound_decidedById_idx"
  ON "ProductionSampleRound"("decidedById");

ALTER TABLE "ProductionSampleRound"
  ADD CONSTRAINT "ProductionSampleRound_decidedById_fkey"
  FOREIGN KEY ("decidedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
