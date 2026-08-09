-- Correct Stage 7 Sample Rounds to use a distinct round name and one date-only
-- deadline. The original milestone columns are intentionally retained as
-- nullable legacy fields so this migration is additive and data preserving.
ALTER TABLE "ProductionSampleRound"
  ADD COLUMN "name" TEXT,
  ADD COLUMN "deadline" DATE;

-- The original implementation treated delivery as the final round deadline.
-- Preserve that meaning for any legacy rows, with defensive fallbacks for
-- partially written data. New application writes use only "deadline".
UPDATE "ProductionSampleRound"
SET
  "name" = 'Sample Round ' || "sequence",
  "deadline" = COALESCE(
    "deliveryDueAt"::date,
    "revisionSignoffDueAt"::date,
    "reviewDueAt"::date,
    "submissionDueAt"::date,
    "createdAt"::date
  );

ALTER TABLE "ProductionSampleRound"
  ALTER COLUMN "name" SET NOT NULL,
  ALTER COLUMN "deadline" SET NOT NULL,
  ALTER COLUMN "submissionDueAt" DROP NOT NULL,
  ALTER COLUMN "reviewDueAt" DROP NOT NULL,
  ALTER COLUMN "revisionSignoffDueAt" DROP NOT NULL,
  ALTER COLUMN "deliveryDueAt" DROP NOT NULL;

CREATE INDEX "ProductionSampleRound_projectId_deadline_status_idx"
  ON "ProductionSampleRound"("projectId", "deadline", "status");
