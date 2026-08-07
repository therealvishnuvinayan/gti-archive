import {
  ProjectWorkflowStageKey,
  ProjectWorkflowStageStatus,
  UserRole,
} from "@prisma/client";

const IMPLEMENTED_WORKFLOW_STAGE_KEYS = new Set<ProjectWorkflowStageKey>([
  ProjectWorkflowStageKey.PROJECT_INQUIRY,
  ProjectWorkflowStageKey.PROJECT_RESEARCH_AND_PLANNING,
  ProjectWorkflowStageKey.CONCEPT_CREATION,
  ProjectWorkflowStageKey.PROJECT_DEVELOPMENT,
  ProjectWorkflowStageKey.FINAL_LAYOUT,
  ProjectWorkflowStageKey.PRODUCTION_AND_HANDOVER,
  ProjectWorkflowStageKey.IMPLEMENTATION_AND_SUPERVISION,
]);

export function isWorkflowStagePersistentlyOpen(
  status: ProjectWorkflowStageStatus | null | undefined,
) {
  return (
    status === ProjectWorkflowStageStatus.AVAILABLE ||
    status === ProjectWorkflowStageStatus.COMPLETED
  );
}

export function canBypassImplementedWorkflowStageLock(user: {
  role: UserRole;
}) {
  return user.role === UserRole.SUPER_ADMIN;
}

export function canOpenImplementedWorkflowStage(input: {
  user: { role: UserRole };
  stageKey: ProjectWorkflowStageKey;
  status: ProjectWorkflowStageStatus | null | undefined;
}) {
  if (isWorkflowStagePersistentlyOpen(input.status)) {
    return true;
  }

  return (
    canBypassImplementedWorkflowStageLock(input.user) &&
    IMPLEMENTED_WORKFLOW_STAGE_KEYS.has(input.stageKey)
  );
}

export function canOpenProjectStageChatContainer(input: {
  user: { role: UserRole };
  isTasker: boolean;
  conceptFolder?: { workflowStageKey: ProjectWorkflowStageKey } | null;
  workflowStages?: Array<{
    stageKey: ProjectWorkflowStageKey;
    status: ProjectWorkflowStageStatus;
  }>;
}) {
  if (!input.isTasker) {
    return true;
  }

  const stageKey = input.conceptFolder?.workflowStageKey;

  if (!stageKey) {
    return false;
  }

  return canOpenImplementedWorkflowStage({
    user: input.user,
    stageKey,
    status: input.workflowStages?.find((stage) => stage.stageKey === stageKey)?.status,
  });
}
