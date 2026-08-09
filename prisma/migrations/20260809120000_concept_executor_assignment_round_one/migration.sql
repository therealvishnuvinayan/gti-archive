-- Round 1 concept assignment is nullable for legacy rows. New concept creation
-- requires it at the application boundary.
ALTER TABLE "ProjectConceptFolder"
ADD COLUMN "assignedExecutorId" TEXT;

-- Prefer the tasker's historical starter when that user is still a project
-- executor. This preserves existing acceptance timestamps.
UPDATE "ProjectConceptFolder" AS folder
SET "assignedExecutorId" = stage."startedById"
FROM "ProjectStage" AS stage
JOIN "ProjectExecutor" AS executor
  ON executor."projectId" = stage."projectId"
 AND executor."userId" = stage."startedById"
WHERE stage.id = folder."taskerStageId"
  AND stage."projectId" = folder."projectId"
  AND folder."assignedExecutorId" IS NULL;

-- If and only if a project has exactly one executor, that assignment is
-- deterministic for any remaining legacy concept.
UPDATE "ProjectConceptFolder" AS folder
SET "assignedExecutorId" = single_executor."userId"
FROM (
  SELECT "projectId", MIN("userId") AS "userId"
  FROM "ProjectExecutor"
  GROUP BY "projectId"
  HAVING COUNT(*) = 1
) AS single_executor
WHERE single_executor."projectId" = folder."projectId"
  AND folder."assignedExecutorId" IS NULL;

ALTER TABLE "ProjectConceptFolder"
ADD CONSTRAINT "ProjectConceptFolder_projectId_assignedExecutorId_fkey"
FOREIGN KEY ("projectId", "assignedExecutorId")
REFERENCES "ProjectExecutor"("projectId", "userId")
ON DELETE RESTRICT
ON UPDATE CASCADE;

CREATE INDEX "ProjectConceptFolder_projectId_workflowStageKey_assignedExec_idx"
ON "ProjectConceptFolder"("projectId", "workflowStageKey", "assignedExecutorId", "sortOrder");
