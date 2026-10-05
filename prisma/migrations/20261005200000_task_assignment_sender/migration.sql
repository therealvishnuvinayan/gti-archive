ALTER TABLE "ProjectConceptFolder" ADD COLUMN "assignedById" TEXT;

-- Existing tasks record their creator; prior reassignment senders were not stored.
UPDATE "ProjectConceptFolder"
SET "assignedById" = "createdById"
WHERE "assignedExecutorId" IS NOT NULL;

CREATE INDEX "ProjectConceptFolder_assignedById_workflowStageKey_idx"
ON "ProjectConceptFolder"("assignedById", "workflowStageKey");

ALTER TABLE "ProjectConceptFolder"
ADD CONSTRAINT "ProjectConceptFolder_assignedById_fkey"
FOREIGN KEY ("assignedById") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
