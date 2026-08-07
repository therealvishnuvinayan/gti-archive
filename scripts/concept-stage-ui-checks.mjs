import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [workspace, route, stageThreePage, stageFourPage, overview, workflow, schema] =
  await Promise.all([
    readFile("src/components/projects/concept-stage-workspace.tsx", "utf8"),
    readFile("src/components/projects/concept-stage-route.tsx", "utf8"),
    readFile("src/app/(dashboard)/projects/[slug]/stages/3/page.tsx", "utf8"),
    readFile("src/app/(dashboard)/projects/[slug]/stages/4/page.tsx", "utf8"),
    readFile("src/components/projects/project-overview-workspace.tsx", "utf8"),
    readFile("src/lib/project-workflow.ts", "utf8"),
    readFile("prisma/schema.prisma", "utf8"),
  ]);

for (const label of [
  "Concept Workspace",
  "Project Name",
  "Project Owner",
  "Project Co-Owners",
  "Project Executors",
  "Concept Folders",
  "Manage your concept folders.",
  "Concept 1",
]) {
  assert(workspace.includes(label), `Missing concept-stage overview content: ${label}`);
}

assert.equal(
  workspace.match(/New Folder/g)?.length,
  1,
  "The concept overview must render exactly one New Folder action.",
);
assert(
  workspace.includes('useState<ConceptFolder[]>([') &&
    workspace.includes('{ id: "concept-1", name: "Concept 1" }'),
  "Concept 1 must be the only initial local folder.",
);
assert(
  workspace.includes("crypto.randomUUID()") &&
    workspace.includes('mode: "rename"') &&
    !workspace.includes("fetch(") &&
    !workspace.includes("Action("),
  "Folder creation and rename must remain local UI state.",
);

for (const forbiddenText of [
  "ProjectChatWorkspace",
  "Tasker",
  "Submit Revision",
  "Request Changes",
  "Approval",
  "Revisions",
  "Assignee",
]) {
  assert(!workspace.includes(forbiddenText), `Forbidden overview UI found: ${forbiddenText}`);
}

assert(
  stageThreePage.includes("ConceptStageRoute") &&
    stageThreePage.includes('stageNumber={3}') &&
    stageThreePage.includes('stageTitle="Initial Concept"'),
  "Stage 3 must be a thin route over the shared concept-stage component.",
);
assert(
  stageFourPage.includes("ConceptStageRoute") &&
    stageFourPage.includes('stageNumber={4}') &&
    stageFourPage.includes('stageTitle="Final Concept"'),
  "Stage 4 must be a thin route over the shared concept-stage component.",
);
assert(
  route.includes("getProjectShellById") &&
    route.includes("ProjectWorkflowStageStatus.AVAILABLE") &&
    route.includes("ProjectWorkflowStageStatus.COMPLETED") &&
    route.includes("StageLockedState"),
  "Concept-stage routes must use real project data and persisted workflow locking.",
);
assert(
  overview.includes("stage.number >= 1 && stage.number <= 4") &&
    overview.includes("const stageOpenable = implementedStage && !locked"),
  "Overview must link Stage 3/4 only when their persisted workflow status is not locked.",
);
assert(
  workflow.includes('name: "Initial Concept"') && workflow.includes('name: "Final Concept"'),
  "Overview stage labels must match the approved concept-stage names.",
);
assert(
  !schema.includes("ProjectConceptFolder") && !schema.includes("isTasker"),
  "The UI-only concept stages must not add Prisma persistence.",
);

console.log("Stage 3/4 reusable folder-overview UI checks passed.");
