-- Scope concept folders by the V2 workflow stage while preserving the existing
-- Stage 3 folder and its dedicated legacy ProjectStage chat identity.
ALTER TABLE "ProjectConceptFolder"
ADD COLUMN "workflowStageKey" "ProjectWorkflowStageKey" NOT NULL
DEFAULT 'CONCEPT_CREATION';

DROP INDEX "ProjectConceptFolder_projectId_normalizedName_key";
DROP INDEX "ProjectConceptFolder_projectId_sortOrder_idx";

CREATE UNIQUE INDEX "ProjectConceptFolder_projectId_workflowStageKey_normalizedName_key"
ON "ProjectConceptFolder"("projectId", "workflowStageKey", "normalizedName");

CREATE INDEX "ProjectConceptFolder_projectId_workflowStageKey_sortOrder_idx"
ON "ProjectConceptFolder"("projectId", "workflowStageKey", "sortOrder");

ALTER TABLE "ProjectConceptFolder"
ADD CONSTRAINT "ProjectConceptFolder_workflowStageKey_check"
CHECK ("workflowStageKey" IN ('CONCEPT_CREATION', 'PROJECT_DEVELOPMENT'));

ALTER TABLE "ProjectConceptFolder"
ADD CONSTRAINT "ProjectConceptFolder_name_length_check"
CHECK (
  char_length(btrim("name")) BETWEEN 1 AND 120
  AND char_length(btrim("normalizedName")) BETWEEN 1 AND 120
);

UPDATE "ProjectStage" AS stage
SET "isTasker" = true
FROM "ProjectConceptFolder" AS folder
WHERE folder."taskerStageId" = stage."id"
  AND stage."isTasker" = false;
