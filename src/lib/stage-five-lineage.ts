import { ProjectWorkflowStageKey } from "@prisma/client";

/**
 * Stage 5 accepts either a real Stage 4 handoff or a file uploaded directly
 * into Stage 5 after Stage 4 was skipped.
 */
export const STAGE_FIVE_SOURCE_WORKFLOW_STAGE_KEYS = [
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
