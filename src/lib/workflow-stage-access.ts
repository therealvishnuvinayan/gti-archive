import {
  ProjectWorkflowStageKey,
  ProjectWorkflowStageStatus,
} from "@prisma/client";

export const ACCESSIBLE_WORKFLOW_STAGE_STATUSES = [
  ProjectWorkflowStageStatus.AVAILABLE,
  ProjectWorkflowStageStatus.COMPLETED,
] as const;

export type ProjectWorkflowStageAccessResult =
  | {
      allowed: true;
      code: "STAGE_ACCESSIBLE";
      status:
        | typeof ProjectWorkflowStageStatus.AVAILABLE
        | typeof ProjectWorkflowStageStatus.COMPLETED;
    }
  | {
      allowed: false;
      code: "STAGE_LOCKED";
      status: typeof ProjectWorkflowStageStatus.LOCKED | null;
    };

/**
 * Canonical runtime workflow policy.
 *
 * Project authorization is deliberately evaluated by the caller. Workflow
 * progression is role-independent: no account, including SUPER_ADMIN, may
 * open a locked or missing fixed-workflow stage.
 */
export function getProjectWorkflowStageAccess(
  status: ProjectWorkflowStageStatus | null | undefined,
): ProjectWorkflowStageAccessResult {
  if (
    status === ProjectWorkflowStageStatus.AVAILABLE ||
    status === ProjectWorkflowStageStatus.COMPLETED
  ) {
    return {
      allowed: true,
      code: "STAGE_ACCESSIBLE",
      status,
    };
  }

  return {
    allowed: false,
    code: "STAGE_LOCKED",
    status: status === ProjectWorkflowStageStatus.LOCKED ? status : null,
  };
}

export function isWorkflowStagePersistentlyOpen(
  status: ProjectWorkflowStageStatus | null | undefined,
) {
  return getProjectWorkflowStageAccess(status).allowed;
}

export function canOpenImplementedWorkflowStage(input: {
  stageKey: ProjectWorkflowStageKey;
  status: ProjectWorkflowStageStatus | null | undefined;
}) {
  void input.stageKey;
  return getProjectWorkflowStageAccess(input.status).allowed;
}

export function canOpenProjectStageChatContainer(input: {
  isTasker: boolean;
  conceptFolder?: { workflowStageKey: ProjectWorkflowStageKey } | null;
  workflowStages?: Array<{
    stageKey: ProjectWorkflowStageKey;
    status: ProjectWorkflowStageStatus;
  }>;
}) {
  // Legacy non-tasker chat containers are not one of the seven fixed workflow
  // stage routes. Concept tasker containers are, and must inherit their
  // persisted Stage 3/4 lock.
  if (!input.isTasker) {
    return true;
  }

  const stageKey = input.conceptFolder?.workflowStageKey;

  if (!stageKey) {
    return false;
  }

  return canOpenImplementedWorkflowStage({
    stageKey,
    status: input.workflowStages?.find((stage) => stage.stageKey === stageKey)?.status,
  });
}
