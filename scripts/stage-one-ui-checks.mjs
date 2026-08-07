import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [workspace, stagePage, stageActions, service, schema, overview] = await Promise.all([
  readFile("src/components/projects/stage-one-workspace.tsx", "utf8"),
  readFile("src/app/(dashboard)/projects/[slug]/stages/1/page.tsx", "utf8"),
  readFile("src/app/(dashboard)/projects/[slug]/stages/1/actions.ts", "utf8"),
  readFile("src/lib/project-inquiry.ts", "utf8"),
  readFile("prisma/schema.prisma", "utf8"),
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
  workspace.includes('<StageOneFormField label="Client Name" required') &&
    workspace.includes('<StageOneFormField label="Final Beneficiary" required'),
  "Only Client Name and Final Beneficiary should visibly show required markers.",
);
assert.equal(
  workspace.match(/<StageOneFormField label="[^"]+" required/g)?.length,
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
  "createContactDirectoryEntryAction",
  "completeProjectInquiryAction",
  "saveCollaboratorAction",
  'assetType: "GENERAL_PROJECT_ASSET"',
]) {
  assert(workspace.includes(snippet) || overview.includes(snippet), `Missing UI behavior: ${snippet}`);
}

assert(
  overview.includes("href={`/projects/${projectId}/stages/${stage.number}`}") &&
    overview.includes("stage.number >= 1 && stage.number <= 4"),
  "The overview CTA should open the dedicated implemented stage route.",
);
assert(
  stagePage.includes("getProjectShellById") &&
    stagePage.includes("getProjectInquiryPageData") &&
    stagePage.includes("StageOneWorkspace"),
  "The Stage 1 route should load the project shell and persisted inquiry data.",
);
assert(stageActions.includes('"use server"'), "Stage 1 mutations must use authenticated server actions.");
assert(service.includes('"project.update"'), "Stage 1 mutation must enforce project update permission.");
assert(service.includes('"stage.view"'), "Stage 1 read must enforce stage view permission.");
assert(service.includes("prisma.$transaction"), "Stage 1 completion must be transactional.");
assert(
  service.includes("timeout: 30_000") && service.includes("maxWait: 10_000"),
  "The multi-step Stage 1 transaction must allow bounded time for a remote database.",
);
assert(
  workspace.includes("value={priority}") &&
    !workspace.includes("value={priority || undefined}"),
  "Priority must remain a controlled Select for the component lifetime.",
);
assert(schema.includes("model ProjectInquiry"), "Stage 1 must persist its own domain record.");
assert(
  schema.includes("inquiryDate        DateTime?                    @db.Date") &&
    schema.includes("deadline           DateTime?                    @db.Date"),
  "Stage 1 dates must use date-only database semantics.",
);

console.log("Stage 1 end-to-end static checks passed.");
