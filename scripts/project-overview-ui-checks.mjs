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
  "Initial Concept",
  "Final Concept",
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

assert(
  overview.includes("stage.number >= 1 && stage.number <= 6"),
  "Stage 1 through Stage 6 should be openable only when persisted status permits.",
);
assert(overview.includes("Open Stage"), "Implemented stages should show the Open Stage CTA.");
assert(
  overview.includes("href={`/projects/${projectId}/stages/${stage.number}`}"),
  "Implemented stages should open their dedicated UI route.",
);
assert(overview.includes("status === \"AVAILABLE\""), "Available state must come from persisted workflow status.");
assert(overview.includes("status === \"COMPLETED\""), "Completed state must come from persisted workflow status.");
assert(
  overview.includes("Available · Stage UI coming next"),
  "Unimplemented future stages should retain a safe available state.",
);
assert(overview.includes("disabled"), "Unavailable stage controls should be disabled.");
assert(overview.includes("Locked"), "Locked workflow stages should show their real state.");
assert(
  projectQuery.includes("workflowStages:") && projectQuery.includes("stageKey: stage.stageKey"),
  "The project query must return persisted workflow stage state.",
);
assert(
  projectQuery.includes("toProjectIsoString(stage.unlockedAt)") &&
    projectQuery.includes("toProjectIsoString(stage.completedAt)"),
  "Cached workflow dates must accept both Prisma Date values and serialized strings.",
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
