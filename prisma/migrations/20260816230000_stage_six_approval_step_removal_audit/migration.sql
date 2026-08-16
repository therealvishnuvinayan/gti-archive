-- Preserve approval decisions and delivery history when a manager removes a step
-- from the live Stage 6 chain. Existing Marketing Director constraints continue to
-- protect the historical Step 1 identity; removed rows are excluded in application
-- queries and cannot act again.
ALTER TABLE "ProductionApprovalStep"
ADD COLUMN "removedAt" TIMESTAMP(3),
ADD COLUMN "removedByUserId" TEXT,
ADD COLUMN "statusAtRemoval" "ProductionApprovalStepStatus";

CREATE INDEX "ProductionApprovalStep_removedByUserId_idx"
ON "ProductionApprovalStep"("removedByUserId");

CREATE INDEX "ProductionApprovalStep_productionUnitId_removedAt_sequence_idx"
ON "ProductionApprovalStep"("productionUnitId", "removedAt", "sequence");

ALTER TABLE "ProductionApprovalStep"
ADD CONSTRAINT "ProductionApprovalStep_removedByUserId_fkey"
FOREIGN KEY ("removedByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
