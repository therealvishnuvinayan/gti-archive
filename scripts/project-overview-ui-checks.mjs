import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [overview, workflow, projectPage, createForm, projectQuery] = await Promise.all([
  readFile("src/components/projects/project-overview-workspace.tsx", "utf8"),
  readFile("src/lib/project-workflow.ts", "utf8"),
  readFile("src/app/(dashboard)/projects/[slug]/page.tsx", "utf8"),
  readFile("src/components/projects/create-project-form.tsx", "utf8"),
  readFile("src/lib/projects.ts", "utf8"),
]);

const stageNames = [
  "Project Inquiry",
  "Project Research and Planning",
  "Concept Creation",
  "Project Development",
  "Final Layout",
  "Production and Handover",
  "Implementation and Supervision",
];

for (const [index, stageName] of stageNames.entries()) {
  assert.match(workflow, new RegExp(`number: ${index + 1},`));
  assert(workflow.includes(`name: "${stageName}"`), `Missing predefined stage: ${stageName}`);
}

for (const label of [
  "Project Name",
  "Project Owner",
  "Project Co-Owners",
  "Project Executors",
]) {
  assert(overview.includes(`label="${label}"`), `Missing project summary row: ${label}`);
}

assert(overview.includes("stage.number === 1"), "Only Stage 1 should be visually active.");
assert(overview.includes("Open Stage"), "Stage 1 should show the Open Stage CTA.");
assert(
  overview.includes("href={`/projects/${projectId}/stages/1`}"),
  "Stage 1 should open its dedicated UI route.",
);
assert(overview.includes("status === \"AVAILABLE\""), "Available state must come from persisted workflow status.");
assert(overview.includes("status === \"COMPLETED\""), "Completed state must come from persisted workflow status.");
assert(overview.includes("Available · Stage UI coming next"), "Stage 2 should show a safe available state.");
assert(overview.includes("disabled"), "Unavailable stage controls should be disabled.");
assert(overview.includes("Locked"), "Locked workflow stages should show their real state.");
assert(
  projectQuery.includes("workflowStages:") && projectQuery.includes("stageKey: stage.stageKey"),
  "The project query must return persisted workflow stage state.",
);
assert(
  projectPage.includes("ProjectOverviewWorkspace") &&
    projectPage.includes("getProjectShellById"),
  "The project landing route should render the overview from the existing project query.",
);
assert(
  createForm.includes("router.push(`/projects/${result.projectId}`)"),
  "Successful project creation should open the project overview.",
);

console.log("Project overview UI checks passed.");
