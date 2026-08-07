import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [workspace, stagePage, overview] = await Promise.all([
  readFile("src/components/projects/stage-one-workspace.tsx", "utf8"),
  readFile("src/app/(dashboard)/projects/[slug]/stages/1/page.tsx", "utf8"),
  readFile("src/components/projects/project-overview-workspace.tsx", "utf8"),
]);

for (const field of [
  "Client Name",
  "External / Internal",
  "Final Beneficiary",
  "Target Market",
  "Initial Brief",
  "Key Business Objectives",
  "Collaborators",
  "Deliverables",
  "Date",
  "Deadline",
  "Legal Notes",
  "Priority",
]) {
  assert(workspace.includes(`label="${field}"`), `Missing Stage 1 field: ${field}`);
}

assert(
  workspace.includes('<StageOneFormField label="Client Name" required>') &&
    workspace.includes('<StageOneFormField label="Final Beneficiary" required>'),
  "Only Client Name and Final Beneficiary should visibly show required markers.",
);
assert.equal(
  workspace.match(/<StageOneFormField label="[^"]+" required>/g)?.length,
  2,
  "Exactly two Stage 1 fields should visibly show required markers.",
);

for (const snippet of [
  "Stage 1 - Project Inquiry",
  "Project Name",
  "Project Owner",
  "Project Co-Owners",
  "Open Stage",
  "Next Stage",
  "All Stages",
  "AppDatePicker",
  "AttachmentTextarea",
  "MultiEntryInput",
  '["UAE", "GCC"]',
  '["Packaging Artwork", "Signature Artwork"]',
]) {
  assert(workspace.includes(snippet) || overview.includes(snippet), `Missing UI behavior: ${snippet}`);
}

assert(
  overview.includes("href={`/projects/${projectId}/stages/1`}"),
  "The Stage 1 overview CTA should open the dedicated Stage 1 route.",
);
assert(
  stagePage.includes("getProjectShellById") && stagePage.includes("StageOneWorkspace"),
  "The Stage 1 route should reuse the existing project access/query path.",
);
assert(!workspace.includes("fetch("), "The Stage 1 UI must not add backend persistence.");
assert(!workspace.includes("server action"), "The Stage 1 UI must not add a server action.");

console.log("Stage 1 UI checks passed.");
