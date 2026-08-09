import {
  ProjectWorkflowStageKey,
  ProjectWorkflowStageStatus,
  type Prisma,
} from "@prisma/client";

import { PROJECT_WORKFLOW_STAGE_DEFINITIONS } from "@/lib/project-workflow";

export const PROJECT_LIST_STATUSES = [
  "ALL",
  "ACTIVE",
  "COMPLETED",
  "SETUP_NEEDED",
] as const;

export type ProjectListStatus = (typeof PROJECT_LIST_STATUSES)[number];

export const PROJECT_LIST_ROLES = [
  "ALL",
  "OWNER",
  "CO_OWNER",
  "EXECUTOR",
  "COLLABORATOR",
] as const;

export type ProjectListRole = (typeof PROJECT_LIST_ROLES)[number];

export type ProjectListWorkflowState = {
  status: Exclude<ProjectListStatus, "ALL">;
  statusLabel: "Active" | "Completed" | "Setup Needed";
  currentStageNumber: number;
  currentStageName: string;
  stageStatuses: ProjectWorkflowStageStatus[];
};

type ProjectListWorkflowInput = {
  id?: string;
  ownerId: string | null;
  completedAt?: Date | null;
  closure?: { id: string } | null;
  executors: Array<{ userId: string }>;
  workflowStages: Array<{
    stageKey: ProjectWorkflowStageKey;
    status: ProjectWorkflowStageStatus;
  }>;
};

const stageKeys = PROJECT_WORKFLOW_STAGE_DEFINITIONS.map((stage) => stage.key);
const finalStageKey = ProjectWorkflowStageKey.IMPLEMENTATION_AND_SUPERVISION;

function buildCompletedWhere(): Prisma.ProjectWhereInput {
  return {
    OR: [
      { completedAt: { not: null } },
      { closure: { isNot: null } },
      {
        workflowStages: {
          some: {
            stageKey: finalStageKey,
            status: ProjectWorkflowStageStatus.COMPLETED,
          },
        },
      },
    ],
  };
}

function buildInitializedWorkflowWhere(): Prisma.ProjectWhereInput {
  return {
    AND: stageKeys.map((stageKey) => ({
      workflowStages: { some: { stageKey } },
    })),
  };
}

/**
 * Builds the server-side predicate from the same V2 workflow rules used by the
 * card mapper below. Listing projects never repairs or advances workflow rows.
 */
export function buildProjectListStatusWhere(
  status: ProjectListStatus,
): Prisma.ProjectWhereInput {
  if (status === "ALL") return {};

  const completedWhere = buildCompletedWhere();
  const initializedWorkflowWhere = buildInitializedWorkflowWhere();
  const requiredSetupWhere: Prisma.ProjectWhereInput = {
    ownerId: { not: null },
    executors: { some: {} },
    workflowStages: {
      some: { status: ProjectWorkflowStageStatus.AVAILABLE },
    },
    ...initializedWorkflowWhere,
  };

  if (status === "COMPLETED") return completedWhere;

  if (status === "ACTIVE") {
    return {
      AND: [{ NOT: completedWhere }, requiredSetupWhere],
    };
  }

  return {
    AND: [
      { NOT: completedWhere },
      { NOT: requiredSetupWhere },
    ],
  };
}

export function buildProjectListStageWhere(
  stageNumber: number | null,
): Prisma.ProjectWhereInput {
  if (!stageNumber) return {};

  const definition = PROJECT_WORKFLOW_STAGE_DEFINITIONS.find(
    (stage) => stage.number === stageNumber,
  );

  if (!definition) return {};

  if (stageNumber === PROJECT_WORKFLOW_STAGE_DEFINITIONS.length) {
    return {
      OR: [
        buildCompletedWhere(),
        {
          workflowStages: {
            some: {
              stageKey: definition.key,
              status: ProjectWorkflowStageStatus.AVAILABLE,
            },
          },
        },
      ],
    };
  }

  return {
    workflowStages: {
      some: {
        stageKey: definition.key,
        status: ProjectWorkflowStageStatus.AVAILABLE,
      },
    },
  };
}

export function deriveProjectListWorkflowState(
  project: ProjectListWorkflowInput,
): ProjectListWorkflowState {
  const stageByKey = new Map(
    project.workflowStages.map((stage) => [stage.stageKey, stage] as const),
  );
  const stageStatuses = stageKeys.map(
    (stageKey) =>
      stageByKey.get(stageKey)?.status ?? ProjectWorkflowStageStatus.LOCKED,
  );
  const finalStage = stageByKey.get(finalStageKey);
  const isCompleted = Boolean(
    project.completedAt ||
      project.closure ||
      finalStage?.status === ProjectWorkflowStageStatus.COMPLETED,
  );

  if (isCompleted) {
    return {
      status: "COMPLETED",
      statusLabel: "Completed",
      currentStageNumber: PROJECT_WORKFLOW_STAGE_DEFINITIONS.length,
      currentStageName:
        PROJECT_WORKFLOW_STAGE_DEFINITIONS[
          PROJECT_WORKFLOW_STAGE_DEFINITIONS.length - 1
        ].name,
      stageStatuses,
    };
  }

  const hasCompleteStageSet =
    project.workflowStages.length === stageKeys.length &&
    stageKeys.every((stageKey) => stageByKey.has(stageKey));
  const availableStages = PROJECT_WORKFLOW_STAGE_DEFINITIONS.filter(
    (definition) =>
      stageByKey.get(definition.key)?.status ===
      ProjectWorkflowStageStatus.AVAILABLE,
  );
  const setupIncomplete =
    !project.ownerId ||
    project.executors.length === 0 ||
    !hasCompleteStageSet ||
    availableStages.length === 0;

  if (setupIncomplete) {
    return {
      status: "SETUP_NEEDED",
      statusLabel: "Setup Needed",
      currentStageNumber: 0,
      currentStageName: "Project Setup",
      stageStatuses,
    };
  }

  if (availableStages.length > 1) {
    console.warn("[projects:list] Multiple AVAILABLE workflow stages", {
      projectId: project.id,
      stageKeys: availableStages.map((stage) => stage.key),
    });
  }

  const currentStage = availableStages[0];

  return {
    status: "ACTIVE",
    statusLabel: "Active",
    currentStageNumber: currentStage.number,
    currentStageName: currentStage.name,
    stageStatuses,
  };
}
