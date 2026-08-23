import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  ProjectRevisionStatus,
  StageStatus,
} from "@prisma/client";

import {
  deriveUserProjectDisplayStatus,
  deriveUserTaskDisplayState,
} from "../src/lib/user-projects";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function task(input: {
  stageStatus?: StageStatus;
  started?: boolean;
  completed?: boolean;
  approved?: boolean;
  revisionStatus?: ProjectRevisionStatus;
}) {
  return {
    approvedAttachmentId: input.approved ? "approved-file" : null,
    taskerStage: {
      status: input.stageStatus ?? StageStatus.PENDING,
      actualStartedAt: input.started ? new Date("2026-08-16T08:00:00.000Z") : null,
      completedAt: input.completed ? new Date("2026-08-16T09:00:00.000Z") : null,
      revisions: input.revisionStatus
        ? [
            {
              status: input.revisionStatus,
              updatedAt: new Date("2026-08-16T08:30:00.000Z"),
            },
          ]
        : [],
    },
  };
}

const notStarted = deriveUserTaskDisplayState(task({}));
assert.deepEqual(notStarted, {
  status: "NOT_STARTED",
  label: "Not Started",
  dotTone: "gray",
});

const inProgress = deriveUserTaskDisplayState(
  task({ stageStatus: StageStatus.ONGOING, started: true }),
);
assert.deepEqual(inProgress, {
  status: "IN_PROGRESS",
  label: "In Progress",
  dotTone: "blue",
});

const changesRequested = deriveUserTaskDisplayState(
  task({
    stageStatus: StageStatus.ONGOING,
    started: true,
    revisionStatus: ProjectRevisionStatus.REJECTED,
  }),
);
assert.deepEqual(changesRequested, {
  status: "NEEDS_ATTENTION",
  label: "Changes Requested",
  dotTone: "orange",
});

const waitingForReview = deriveUserTaskDisplayState(
  task({
    stageStatus: StageStatus.ONGOING,
    started: true,
    revisionStatus: ProjectRevisionStatus.PENDING_REVIEW,
  }),
);
assert.deepEqual(waitingForReview, {
  status: "WAITING_FOR_REVIEW",
  label: "Waiting for Review",
  dotTone: "purple",
});

const completed = deriveUserTaskDisplayState(
  task({ stageStatus: StageStatus.COMPLETED, started: true, completed: true }),
);
assert.deepEqual(completed, {
  status: "COMPLETED",
  label: "Completed",
  dotTone: "green",
});

assert.equal(deriveUserProjectDisplayStatus([], "ACTIVE"), "NO_ASSIGNED_TASKS");
assert.equal(deriveUserProjectDisplayStatus([completed], "ACTIVE"), "IN_PROGRESS");
assert.equal(deriveUserProjectDisplayStatus([completed], "COMPLETED"), "COMPLETED");
assert.equal(deriveUserProjectDisplayStatus([], "COMPLETED"), "COMPLETED");
assert.equal(deriveUserProjectDisplayStatus([inProgress], "ACTIVE"), "IN_PROGRESS");
assert.equal(
  deriveUserProjectDisplayStatus([inProgress, waitingForReview], "ACTIVE"),
  "WAITING_FOR_REVIEW",
);
assert.equal(
  deriveUserProjectDisplayStatus([waitingForReview, changesRequested], "ACTIVE"),
  "NEEDS_ATTENTION",
);
assert.equal(
  deriveUserProjectDisplayStatus([completed, notStarted], "ACTIVE"),
  "NEEDS_ATTENTION",
);

const page = read("src/app/(dashboard)/projects/page.tsx");
const browser = read("src/components/projects/user-projects-browser.tsx");
const query = read("src/lib/user-projects.ts");
const managerBrowser = read("src/components/projects/projects-browser.tsx");
const managerCard = read("src/components/projects/project-card.tsx");

assert.match(page, /user\.role === UserRole\.USER/);
assert.match(page, /<UserProjectsBrowser/);
assert.match(page, /<ProjectsBrowser/);
assert.match(managerBrowser, /All Stages/);
assert.match(managerCard, /WorkflowProgress/);
assert.match(managerBrowser, /\+ New Project/);

for (const copy of [
  "My Projects",
  "Your workspace for assigned work and deliverables.",
  "Needs Attention",
  "Search projects...",
  "Priority",
  "Recently Updated",
  "Name A–Z",
  "Name Z–A",
  "Open Workspace",
  "No projects are assigned to you yet.",
  "No projects match these filters.",
]) {
  assert.ok(browser.includes(copy), `USER Projects UI is missing: ${copy}`);
}

for (const forbidden of [
  "All Stages",
  "Current Stage",
  "All Owners",
  "All Executors",
  "All Roles",
  "Stage 1",
  "Stage 2",
  "Stage 3",
  "Stage 4",
  "Stage 5",
  "Stage 6",
  "Stage 7",
  "Stage X of 7",
  "Brief",
  "Tech",
  "Concepts",
  "+ New Project",
]) {
  assert.ok(!browser.includes(forbidden), `USER Projects UI leaked: ${forbidden}`);
}

assert.match(browser, /Artwork Projects/);
assert.match(browser, /Flexible Projects/);
assert.match(browser, /href="\/projects\?view=flexible"/);

assert.match(browser, /gti:user-projects:view/);
assert.match(browser, /slice\(0, 5\)/);
assert.match(browser, /role="tooltip"/);
assert.match(browser, /task\.name/);
assert.match(browser, /task\.display\.label/);
assert.match(query, /buildAccessibleProjectsWhere\(currentUser\)/);
assert.match(query, /buildProjectListStatusWhere\("ACTIVE"\)/);
assert.match(query, /buildProjectListStatusWhere\("COMPLETED"\)/);
assert.match(query, /where: listWhere/);
assert.match(query, /where: \{ assignedExecutorId: currentUser\.id \}/);
assert.match(query, /plannedDueAt: true/);
assert.match(query, /revisions: \{/);
assert.match(query, /workflowStages: \{/);
assert.match(query, /deriveProjectListWorkflowState\(project\)/);
assert.match(query, /compareProjectsByPriority/);
assert.match(query, /isCompleted: left\.status === "COMPLETED"/);
assert.doesNotMatch(query, /inquiry:/);
assert.doesNotMatch(query, /researchWorkspaces:/);

console.log("USER My Projects display-state and UI isolation checks passed.");
