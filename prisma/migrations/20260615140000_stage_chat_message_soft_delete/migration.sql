ALTER TABLE "ProjectComment"
ADD COLUMN "deletedAt" TIMESTAMP(3),
ADD COLUMN "deletedByUserId" TEXT;

ALTER TABLE "ProjectComment"
ADD CONSTRAINT "ProjectComment_deletedByUserId_fkey"
FOREIGN KEY ("deletedByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "ProjectComment_deletedByUserId_idx" ON "ProjectComment"("deletedByUserId");
