-- Physical sample requests use the same internal/external recipient model as
-- the optional Stage 6 production handover. Existing emailed requests remain
-- valid and are classified as external requests.
ALTER TABLE "ProductionSampleRound"
  ADD COLUMN "recipientRoute" "ProductionHandoverRoute",
  ADD COLUMN "recipientType" "ProductionApprovalRecipientType",
  ADD COLUMN "recipientUserId" TEXT,
  ADD COLUMN "recipientCompany" TEXT,
  ADD COLUMN "recipientPhone" TEXT;

UPDATE "ProductionSampleRound"
SET
  "recipientRoute" = 'DIRECT_VENDOR',
  "recipientType" = 'EXTERNAL_EMAIL'
WHERE "recipientEmail" IS NOT NULL;

CREATE INDEX "ProductionSampleRound_recipientUserId_idx"
  ON "ProductionSampleRound"("recipientUserId");

ALTER TABLE "ProductionSampleRound"
  ADD CONSTRAINT "ProductionSampleRound_recipientUserId_fkey"
  FOREIGN KEY ("recipientUserId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
