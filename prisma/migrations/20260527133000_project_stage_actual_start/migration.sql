-- Add actual start tracking for executor brief acceptance
ALTER TABLE "ProjectStage"
ADD COLUMN "actualStartedAt" TIMESTAMP(3),
ADD COLUMN "startedById" TEXT;

ALTER TABLE "ProjectStage"
ADD CONSTRAINT "ProjectStage_startedById_fkey"
FOREIGN KEY ("startedById") REFERENCES "User"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

CREATE INDEX "ProjectStage_startedById_idx" ON "ProjectStage"("startedById");
