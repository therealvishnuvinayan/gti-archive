CREATE TABLE "FlexibleMilestoneNote" (
    "id" TEXT NOT NULL,
    "milestoneId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FlexibleMilestoneNote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FlexibleMilestoneNote_milestoneId_createdAt_idx"
ON "FlexibleMilestoneNote"("milestoneId", "createdAt");

CREATE INDEX "FlexibleMilestoneNote_authorId_idx"
ON "FlexibleMilestoneNote"("authorId");

ALTER TABLE "FlexibleMilestoneNote"
ADD CONSTRAINT "FlexibleMilestoneNote_milestoneId_fkey"
FOREIGN KEY ("milestoneId") REFERENCES "FlexibleMilestone"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FlexibleMilestoneNote"
ADD CONSTRAINT "FlexibleMilestoneNote_authorId_fkey"
FOREIGN KEY ("authorId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
