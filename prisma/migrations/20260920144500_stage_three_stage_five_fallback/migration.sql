-- When Stage 4 is skipped, approved Stage 3 files become legitimate Stage 5
-- checklist sources. Stage 4 and direct Stage 5 sources remain supported.
ALTER TABLE "ProjectStageFileHandoff"
DROP CONSTRAINT "ProjectStageFileHandoff_stage_pair_check";

ALTER TABLE "ProjectStageFileHandoff"
ADD CONSTRAINT "ProjectStageFileHandoff_stage_pair_check" CHECK (
  (
    "sourceWorkflowStageKey" = 'CONCEPT_CREATION'
    AND "targetWorkflowStageKey" = 'FINAL_LAYOUT'
  )
  OR
  (
    "sourceWorkflowStageKey" = 'PROJECT_DEVELOPMENT'
    AND "targetWorkflowStageKey" = 'FINAL_LAYOUT'
  )
  OR
  (
    "sourceWorkflowStageKey" = 'FINAL_LAYOUT'
    AND "targetWorkflowStageKey" = 'FINAL_LAYOUT'
  )
);

-- Repair existing projects that already skipped an empty Stage 4 and reached
-- an empty Stage 5 before this fallback existed. Projects with any Stage 5
-- source are left untouched so existing direct-upload work is never changed.
WITH "EligibleProjects" AS (
  SELECT project."id"
  FROM "Project" AS project
  INNER JOIN "ProjectWorkflowStage" AS stage_three
    ON stage_three."projectId" = project."id"
    AND stage_three."stageKey" = 'CONCEPT_CREATION'
    AND stage_three."status" = 'COMPLETED'
  INNER JOIN "ProjectWorkflowStage" AS stage_four
    ON stage_four."projectId" = project."id"
    AND stage_four."stageKey" = 'PROJECT_DEVELOPMENT'
    AND stage_four."status" = 'COMPLETED'
  INNER JOIN "ProjectWorkflowStage" AS stage_five
    ON stage_five."projectId" = project."id"
    AND stage_five."stageKey" = 'FINAL_LAYOUT'
    AND stage_five."status" = 'AVAILABLE'
  WHERE NOT EXISTS (
    SELECT 1
    FROM "ProjectConceptFolder" AS stage_four_folder
    WHERE stage_four_folder."projectId" = project."id"
      AND stage_four_folder."workflowStageKey" = 'PROJECT_DEVELOPMENT'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM "ProjectStageFileHandoff" AS existing_handoff
    WHERE existing_handoff."projectId" = project."id"
      AND existing_handoff."targetWorkflowStageKey" = 'FINAL_LAYOUT'
  )
)
INSERT INTO "ProjectStageFileHandoff" (
  "id",
  "projectId",
  "sourceWorkflowStageKey",
  "sourceAttachmentId",
  "targetWorkflowStageKey",
  "handedOffById",
  "handedOffAt",
  "createdAt",
  "updatedAt"
)
SELECT
  'stage3_fallback_handoff_' || md5(stage_three_folder."id" || ':FINAL_LAYOUT'),
  stage_three_folder."projectId",
  'CONCEPT_CREATION',
  stage_three_folder."approvedAttachmentId",
  'FINAL_LAYOUT',
  COALESCE(stage_three_folder."approvedById", project."ownerId"),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "ProjectConceptFolder" AS stage_three_folder
INNER JOIN "EligibleProjects" AS eligible
  ON eligible."id" = stage_three_folder."projectId"
INNER JOIN "Project" AS project
  ON project."id" = stage_three_folder."projectId"
WHERE stage_three_folder."workflowStageKey" = 'CONCEPT_CREATION'
  AND stage_three_folder."approvedAttachmentId" IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO "ProjectFileChecklist" (
  "id",
  "projectId",
  "handoffId",
  "sourceAttachmentId",
  "createdAt",
  "updatedAt"
)
SELECT
  'stage3_fallback_checklist_' || md5(handoff."id"),
  handoff."projectId",
  handoff."id",
  handoff."sourceAttachmentId",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "ProjectStageFileHandoff" AS handoff
WHERE handoff."sourceWorkflowStageKey" = 'CONCEPT_CREATION'
  AND handoff."targetWorkflowStageKey" = 'FINAL_LAYOUT'
  AND NOT EXISTS (
    SELECT 1
    FROM "ProjectFileChecklist" AS checklist
    WHERE checklist."handoffId" = handoff."id"
  )
ON CONFLICT DO NOTHING;
