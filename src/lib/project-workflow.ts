import {
  ProjectWorkflowStageKey,
  ProjectWorkflowStageStatus,
} from "@prisma/client";

export const PROJECT_WORKFLOW_STAGE_DEFINITIONS = [
  {
    key: ProjectWorkflowStageKey.PROJECT_INQUIRY,
    number: 1,
    name: "Project Inquiry",
    description: "Gather the initial requirements, goals, and context for the project.",
  },
  {
    key: ProjectWorkflowStageKey.PROJECT_RESEARCH_AND_PLANNING,
    number: 2,
    name: "Project Research and Planning",
    description: "Research and plan the project scope, timeline, and resources.",
  },
  {
    key: ProjectWorkflowStageKey.CONCEPT_CREATION,
    number: 3,
    name: "Initial Concept",
    description: "Create and manage the initial concept directions for the project.",
  },
  {
    key: ProjectWorkflowStageKey.PROJECT_DEVELOPMENT,
    number: 4,
    name: "Final Concept",
    description: "Refine selected directions into final project concepts.",
  },
  {
    key: ProjectWorkflowStageKey.FINAL_LAYOUT,
    number: 5,
    name: "Final Layout",
    description: "Prepare final layouts and detailed design specifications.",
  },
  {
    key: ProjectWorkflowStageKey.PRODUCTION_AND_HANDOVER,
    number: 6,
    name: "Production and Handover",
    description: "Oversee production and prepare a clear quality handover.",
  },
  {
    key: ProjectWorkflowStageKey.IMPLEMENTATION_AND_SUPERVISION,
    number: 7,
    name: "Implementation and Supervision",
    description: "Implement the project and provide on-site supervision.",
  },
] as const;

export function getInitialProjectWorkflowStageData(unlockedAt = new Date()) {
  return PROJECT_WORKFLOW_STAGE_DEFINITIONS.map((stage) => ({
    stageKey: stage.key,
    status:
      stage.number === 1
        ? ProjectWorkflowStageStatus.AVAILABLE
        : ProjectWorkflowStageStatus.LOCKED,
    unlockedAt: stage.number === 1 ? unlockedAt : null,
  }));
}

export type ProjectWorkflowSequenceState =
  | { kind: "MISSING" | "INVALID"; currentStage: null }
  | {
      kind: "ACTIVE";
      currentStage: (typeof PROJECT_WORKFLOW_STAGE_DEFINITIONS)[number];
    }
  | { kind: "COMPLETED"; currentStage: null };

/**
 * Interprets the fixed workflow as a strict completed-prefix, one available
 * stage, and locked-suffix sequence. It never repairs malformed persisted
 * data or guesses which stage should be current.
 */
export function getProjectWorkflowSequenceState(
  workflowStages: ReadonlyArray<{
    stageKey: ProjectWorkflowStageKey;
    status: ProjectWorkflowStageStatus;
    unlockedAt?: Date | null;
    completedAt?: Date | null;
  }>,
): ProjectWorkflowSequenceState {
  if (workflowStages.length === 0) {
    return { kind: "MISSING", currentStage: null };
  }

  if (workflowStages.length !== PROJECT_WORKFLOW_STAGE_DEFINITIONS.length) {
    return { kind: "INVALID", currentStage: null };
  }

  const stageByKey = new Map(
    workflowStages.map((stage) => [stage.stageKey, stage.status] as const),
  );

  if (stageByKey.size !== PROJECT_WORKFLOW_STAGE_DEFINITIONS.length) {
    return { kind: "INVALID", currentStage: null };
  }

  const includesTimestamps = workflowStages.some(
    (stage) => "unlockedAt" in stage || "completedAt" in stage,
  );
  if (
    includesTimestamps &&
    workflowStages.some((stage) => {
      if (stage.status === ProjectWorkflowStageStatus.LOCKED) {
        return Boolean(stage.unlockedAt || stage.completedAt);
      }
      if (stage.status === ProjectWorkflowStageStatus.AVAILABLE) {
        return !stage.unlockedAt || Boolean(stage.completedAt);
      }
      return !stage.unlockedAt || !stage.completedAt;
    })
  ) {
    return { kind: "INVALID", currentStage: null };
  }

  const statuses = PROJECT_WORKFLOW_STAGE_DEFINITIONS.map((definition) =>
    stageByKey.get(definition.key),
  );

  if (statuses.some((status) => status === undefined)) {
    return { kind: "INVALID", currentStage: null };
  }

  if (
    statuses.every(
      (status) => status === ProjectWorkflowStageStatus.COMPLETED,
    )
  ) {
    return { kind: "COMPLETED", currentStage: null };
  }

  const availableIndex = statuses.indexOf(ProjectWorkflowStageStatus.AVAILABLE);
  if (
    availableIndex < 0 ||
    statuses.lastIndexOf(ProjectWorkflowStageStatus.AVAILABLE) !== availableIndex
  ) {
    return { kind: "INVALID", currentStage: null };
  }

  const validPrefix = statuses
    .slice(0, availableIndex)
    .every((status) => status === ProjectWorkflowStageStatus.COMPLETED);
  const validSuffix = statuses
    .slice(availableIndex + 1)
    .every((status) => status === ProjectWorkflowStageStatus.LOCKED);

  return validPrefix && validSuffix
    ? {
        kind: "ACTIVE",
        currentStage: PROJECT_WORKFLOW_STAGE_DEFINITIONS[availableIndex],
      }
    : { kind: "INVALID", currentStage: null };
}

export function getWorkflowStageCompletionMode(
  workflowStages: ReadonlyArray<{
    stageKey: ProjectWorkflowStageKey;
    status: ProjectWorkflowStageStatus;
    unlockedAt?: Date | null;
    completedAt?: Date | null;
  }>,
  stageKey: ProjectWorkflowStageKey,
): "TRANSITION" | "RETRY" | "UNAVAILABLE" {
  const sequence = getProjectWorkflowSequenceState(workflowStages);
  const target = PROJECT_WORKFLOW_STAGE_DEFINITIONS.find(
    (definition) => definition.key === stageKey,
  );

  if (!target) {
    return "UNAVAILABLE";
  }

  if (sequence.kind === "COMPLETED") {
    return "RETRY";
  }

  if (sequence.kind !== "ACTIVE" || !sequence.currentStage) {
    return "UNAVAILABLE";
  }

  if (sequence.currentStage.key === stageKey) {
    return "TRANSITION";
  }

  return sequence.currentStage.number > target.number ? "RETRY" : "UNAVAILABLE";
}
