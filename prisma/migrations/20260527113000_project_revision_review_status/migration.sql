CREATE TYPE "ProjectRevisionStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED');

ALTER TABLE "ProjectRevision"
ADD COLUMN "reviewedById" TEXT,
ADD COLUMN "status" "ProjectRevisionStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
ADD COLUMN "reviewedAt" TIMESTAMP(3),
ADD COLUMN "rejectionReason" TEXT;

CREATE INDEX "ProjectRevision_reviewedById_idx" ON "ProjectRevision"("reviewedById");
CREATE INDEX "ProjectRevision_status_idx" ON "ProjectRevision"("status");

ALTER TABLE "ProjectRevision"
ADD CONSTRAINT "ProjectRevision_reviewedById_fkey"
FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
