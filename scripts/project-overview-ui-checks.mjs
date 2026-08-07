import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [overview, projectPage, createForm] = await Promise.all([
  readFile("src/components/projects/project-overview-workspace.tsx", "utf8"),
  readFile("src/app/(dashboard)/projects/[slug]/page.tsx", "utf8"),
  readFile("src/components/projects/create-project-form.tsx", "utf8"),
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
  assert.match(overview, new RegExp(`number: ${index + 1},`));
  assert(overview.includes(`name: "${stageName}"`), `Missing predefined stage: ${stageName}`);
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
assert(overview.includes("disabled"), "Locked stage controls should be disabled.");
assert(overview.includes("Locked"), "Stages 2-7 should show their locked state.");
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
