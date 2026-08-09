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

export type ProjectBusinessStatus = Exclude<ProjectListStatus, "ALL">;
export type ProjectWorkflowHealth = "VALID" | "MISSING" | "INVALID";

export type ProjectListWorkflowState = {
  businessStatus: ProjectBusinessStatus | null;
  statusLabel: "Active" | "Completed" | null;
  workflowHealth: ProjectWorkflowHealth;
  workflowDiagnosticLabel: "Workflow Missing" | "Legacy Project" | null;
  currentStageNumber: number | null;
  currentStageName: string | null;
  stageStatuses: ProjectWorkflowStageStatus[];
};

type ProjectListWorkflowInput = {
  id?: string;
  completedAt?: Date | null;
  closure?: { id: string } | null;
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

function buildValidActiveWorkflowWhere(): Prisma.ProjectWhereInput {
  const completedWhere = buildCompletedWhere();

  return {
    AND: [
      { NOT: completedWhere },
      buildInitializedWorkflowWhere(),
      {
        OR: stageKeys.map((availableStageKey) => ({
          AND: [
            {
              workflowStages: {
                some: {
                  stageKey: availableStageKey,
                  status: ProjectWorkflowStageStatus.AVAILABLE,
                },
              },
            },
            ...stageKeys
              .filter((stageKey) => stageKey !== availableStageKey)
              .map((stageKey) => ({
                workflowStages: {
                  none: {
                    stageKey,
                    status: ProjectWorkflowStageStatus.AVAILABLE,
                  },
                },
              })),
          ],
        })),
      },
    ],
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

  if (status === "COMPLETED") return completedWhere;
  return buildValidActiveWorkflowWhere();
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
          AND: [
            buildValidActiveWorkflowWhere(),
            {
              workflowStages: {
                some: {
                  stageKey: definition.key,
                  status: ProjectWorkflowStageStatus.AVAILABLE,
                },
              },
            },
          ],
        },
      ],
    };
  }

  return {
    AND: [
      buildValidActiveWorkflowWhere(),
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

  const hasCompleteStageSet =
    project.workflowStages.length === stageKeys.length &&
    stageKeys.every((stageKey) => stageByKey.has(stageKey));
  const availableStages = PROJECT_WORKFLOW_STAGE_DEFINITIONS.filter(
    (definition) =>
      stageByKey.get(definition.key)?.status ===
      ProjectWorkflowStageStatus.AVAILABLE,
  );
  const workflowHealth: ProjectWorkflowHealth =
    project.workflowStages.length === 0
      ? "MISSING"
      : !hasCompleteStageSet || (!isCompleted && availableStages.length !== 1)
        ? "INVALID"
        : "VALID";
  const workflowDiagnosticLabel =
    workflowHealth === "MISSING"
      ? "Workflow Missing"
      : workflowHealth === "INVALID"
        ? "Legacy Project"
        : null;

  if (isCompleted) {
    return {
      businessStatus: "COMPLETED",
      statusLabel: "Completed",
      workflowHealth,
      workflowDiagnosticLabel,
      currentStageNumber: PROJECT_WORKFLOW_STAGE_DEFINITIONS.length,
      currentStageName:
        PROJECT_WORKFLOW_STAGE_DEFINITIONS[
          PROJECT_WORKFLOW_STAGE_DEFINITIONS.length - 1
        ].name,
      stageStatuses,
    };
  }

  if (workflowHealth !== "VALID") {
    console.warn("[projects:list] Invalid or missing V2 workflow", {
      projectId: project.id,
      workflowHealth,
      stageKeys: availableStages.map((stage) => stage.key),
    });

    return {
      businessStatus: null,
      statusLabel: null,
      workflowHealth,
      workflowDiagnosticLabel,
      currentStageNumber: null,
      currentStageName: null,
      stageStatuses,
    };
  }

  const currentStage = availableStages[0];

  return {
    businessStatus: "ACTIVE",
    statusLabel: "Active",
    workflowHealth,
    workflowDiagnosticLabel,
    currentStageNumber: currentStage.number,
    currentStageName: currentStage.name,
    stageStatuses,
  };
}
