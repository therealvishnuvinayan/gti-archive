ALTER TABLE "FlexibleProjectAttachment"
ADD COLUMN "milestoneId" TEXT;

CREATE INDEX "FlexibleProjectAttachment_milestoneId_createdAt_idx"
ON "FlexibleProjectAttachment"("milestoneId", "createdAt");

ALTER TABLE "FlexibleProjectAttachment"
ADD CONSTRAINT "FlexibleProjectAttachment_milestoneId_fkey"
FOREIGN KEY ("milestoneId") REFERENCES "FlexibleMilestone"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
