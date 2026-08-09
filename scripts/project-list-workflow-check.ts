import assert from "node:assert/strict";
import {
  ProjectWorkflowStageStatus,
} from "@prisma/client";

import {
  PROJECT_LIST_STATUSES,
  buildProjectListStatusWhere,
  deriveProjectListWorkflowState,
} from "../src/lib/project-list-workflow";
import {
  getInitialProjectWorkflowStageData,
} from "../src/lib/project-workflow";

const baseProject = {
  id: "workflow-state-test",
  ownerId: "owner",
  executors: [{ userId: "executor" }],
  completedAt: null,
  closure: null,
  workflowStages: getInitialProjectWorkflowStageData(),
};

assert.deepEqual(
  PROJECT_LIST_STATUSES,
  ["ALL", "ACTIVE", "COMPLETED"],
  "Public project statuses must only be All, Active, and Completed.",
);

const newProject = deriveProjectListWorkflowState(baseProject);
assert.equal(newProject.businessStatus, "ACTIVE");
assert.equal(newProject.workflowHealth, "VALID");
assert.equal(newProject.currentStageNumber, 1);
assert.equal(newProject.currentStageName, "Project Inquiry");

for (let currentStageNumber = 2; currentStageNumber <= 7; currentStageNumber += 1) {
  const state = deriveProjectListWorkflowState({
    ...baseProject,
    workflowStages: baseProject.workflowStages.map((stage, index) => ({
      ...stage,
      status:
        index + 1 < currentStageNumber
          ? ProjectWorkflowStageStatus.COMPLETED
          : index + 1 === currentStageNumber
            ? ProjectWorkflowStageStatus.AVAILABLE
            : ProjectWorkflowStageStatus.LOCKED,
      unlockedAt: index + 1 <= currentStageNumber ? new Date() : null,
      completedAt: index + 1 < currentStageNumber ? new Date() : null,
    })),
  });

  assert.equal(state.businessStatus, "ACTIVE");
  assert.equal(state.workflowHealth, "VALID");
  assert.equal(state.currentStageNumber, currentStageNumber);
}

const completedProject = deriveProjectListWorkflowState({
  ...baseProject,
  completedAt: new Date(),
  workflowStages: baseProject.workflowStages.map((stage) => ({
    ...stage,
    status: ProjectWorkflowStageStatus.COMPLETED,
    unlockedAt: new Date(),
    completedAt: new Date(),
  })),
});
assert.equal(completedProject.businessStatus, "COMPLETED");
assert.equal(completedProject.statusLabel, "Completed");

const missingWorkflow = deriveProjectListWorkflowState({
  ...baseProject,
  workflowStages: [],
});
assert.equal(missingWorkflow.businessStatus, null);
assert.equal(missingWorkflow.workflowHealth, "MISSING");
assert.equal(missingWorkflow.workflowDiagnosticLabel, "Workflow Missing");
assert.equal(missingWorkflow.currentStageNumber, null);

const partialWorkflow = deriveProjectListWorkflowState({
  ...baseProject,
  workflowStages: baseProject.workflowStages.slice(0, 3),
});
assert.equal(partialWorkflow.businessStatus, null);
assert.equal(partialWorkflow.workflowHealth, "INVALID");
assert.equal(partialWorkflow.workflowDiagnosticLabel, "Legacy Project");
assert.equal(partialWorkflow.currentStageNumber, null);

const multipleAvailableStages = deriveProjectListWorkflowState({
  ...baseProject,
  workflowStages: baseProject.workflowStages.map((stage, index) => ({
    ...stage,
    status:
      index < 2
        ? ProjectWorkflowStageStatus.AVAILABLE
        : ProjectWorkflowStageStatus.LOCKED,
  })),
});
assert.equal(multipleAvailableStages.businessStatus, null);
assert.equal(multipleAvailableStages.workflowHealth, "INVALID");
assert.equal(multipleAvailableStages.currentStageNumber, null);

const skippedStage = deriveProjectListWorkflowState({
  ...baseProject,
  workflowStages: baseProject.workflowStages.map((stage, index) => ({
    ...stage,
    status:
      index === 1
        ? ProjectWorkflowStageStatus.AVAILABLE
        : ProjectWorkflowStageStatus.LOCKED,
  })),
});
assert.equal(skippedStage.businessStatus, null);
assert.equal(skippedStage.workflowHealth, "INVALID");
assert.equal(skippedStage.currentStageNumber, null);

const invalidCompletedTimestamp = deriveProjectListWorkflowState({
  ...baseProject,
  workflowStages: baseProject.workflowStages.map((stage, index) => ({
    ...stage,
    status:
      index === 0
        ? ProjectWorkflowStageStatus.COMPLETED
        : index === 1
          ? ProjectWorkflowStageStatus.AVAILABLE
          : ProjectWorkflowStageStatus.LOCKED,
    unlockedAt: index === 1 ? new Date() : null,
    completedAt: index === 0 ? new Date() : null,
  })),
});
assert.equal(invalidCompletedTimestamp.businessStatus, null);
assert.equal(invalidCompletedTimestamp.workflowHealth, "INVALID");

const activeWhere = JSON.stringify(buildProjectListStatusWhere("ACTIVE"));
assert(activeWhere.includes("unlockedAt"));
assert(activeWhere.includes("completedAt"));

console.log("Project list workflow business-state and legacy-health checks passed.");
