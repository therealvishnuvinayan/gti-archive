import { ProjectWorkflowStageKey } from "@prisma/client";

/**
 * Stage 5 accepts an approved Stage 3 file when Stage 4 is skipped, a real
 * Stage 4 handoff, or a file uploaded directly into Stage 5 when neither
 * concept stage produced a source file.
 */
export const STAGE_FIVE_SOURCE_WORKFLOW_STAGE_KEYS = [
  ProjectWorkflowStageKey.CONCEPT_CREATION,
  ProjectWorkflowStageKey.PROJECT_DEVELOPMENT,
  ProjectWorkflowStageKey.FINAL_LAYOUT,
] as const;

export function isStageFiveSourceWorkflowStageKey(
  stageKey: ProjectWorkflowStageKey,
) {
  return STAGE_FIVE_SOURCE_WORKFLOW_STAGE_KEYS.some(
    (allowedStageKey) => allowedStageKey === stageKey,
  );
}
