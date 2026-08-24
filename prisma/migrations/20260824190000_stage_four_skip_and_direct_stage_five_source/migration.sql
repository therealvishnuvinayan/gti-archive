-- Stage 4 can legitimately produce no file. In that case a primary source may
-- be uploaded directly in Stage 5, whose provenance is FINAL_LAYOUT itself.
ALTER TABLE "ProjectStageFileHandoff"
DROP CONSTRAINT "ProjectStageFileHandoff_stage_pair_check";

ALTER TABLE "ProjectStageFileHandoff"
ADD CONSTRAINT "ProjectStageFileHandoff_stage_pair_check" CHECK (
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

ALTER TYPE "ActivityLogAction" ADD VALUE IF NOT EXISTS 'STAGE_SKIPPED' BEFORE 'ARCHIVE_SNAPSHOT_SAVED';
