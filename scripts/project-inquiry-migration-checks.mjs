import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [migration, schema, creation] = await Promise.all([
  readFile(
    "prisma/migrations/20260807180000_project_inquiry_workflow/migration.sql",
    "utf8",
  ),
  readFile("prisma/schema.prisma", "utf8"),
  readFile("src/lib/project-creation.ts", "utf8"),
]);

const stageKeys = [
  "PROJECT_INQUIRY",
  "PROJECT_RESEARCH_AND_PLANNING",
  "CONCEPT_CREATION",
  "PROJECT_DEVELOPMENT",
  "FINAL_LAYOUT",
  "PRODUCTION_AND_HANDOVER",
  "IMPLEMENTATION_AND_SUPERVISION",
];

for (const stageKey of stageKeys) {
  assert(migration.includes(`('${stageKey}')`), `Backfill is missing ${stageKey}.`);
}

assert(
  migration.includes('CREATE TABLE "ProjectWorkflowStage"') &&
    migration.includes('CREATE TABLE "ProjectInquiry"') &&
    migration.includes('CREATE TABLE "ContactDirectoryEntry"'),
  "Migration must add the fixed workflow, inquiry, and contact-directory tables.",
);
assert(
  migration.includes('ON CONFLICT ("projectId", "stageKey") DO NOTHING'),
  "Existing-project backfill must be duplicate-safe.",
);
assert(
  migration.includes("THEN 'AVAILABLE'") && migration.includes("ELSE 'LOCKED'"),
  "Existing projects must backfill Stage 1 AVAILABLE and Stages 2-7 LOCKED.",
);
assert(
  !migration.includes('DROP TABLE "ProjectStage"') &&
    !migration.includes('ALTER TABLE "ProjectStage"'),
  "The V2 migration must not mutate the legacy ProjectStage model.",
);
assert(
  schema.includes("inquiryDate        DateTime?                    @db.Date") &&
    schema.includes("deadline           DateTime?                    @db.Date"),
  "Inquiry dates must use PostgreSQL DATE semantics.",
);
assert(
  creation.includes("workflowStages:") &&
    creation.includes("getInitialProjectWorkflowStageData()"),
  "V2 project creation must initialize the fixed workflow transactionally.",
);

console.log("Project Inquiry migration regression checks passed.");
