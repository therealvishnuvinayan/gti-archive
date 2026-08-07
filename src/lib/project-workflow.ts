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
