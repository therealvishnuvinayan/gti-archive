ALTER TABLE "ProjectTrackerColumn" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "ProjectTrackerRow" ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE INDEX "ProjectTrackerColumn_trackerId_deletedAt_idx" ON "ProjectTrackerColumn"("trackerId", "deletedAt");
CREATE INDEX "ProjectTrackerRow_trackerId_deletedAt_idx" ON "ProjectTrackerRow"("trackerId", "deletedAt");
