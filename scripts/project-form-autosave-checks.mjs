import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const files = Object.fromEntries(
  await Promise.all(
    [
      ["schema", "prisma/schema.prisma"],
      ["migration", "prisma/migrations/20260814160000_project_form_autosave/migration.sql"],
      ["service", "src/lib/project-form-drafts.ts"],
      ["route", "src/app/api/projects/[projectId]/form-drafts/[formKey]/route.ts"],
      ["hook", "src/components/ui/project-form-autosave.tsx"],
      ["stage1", "src/components/projects/stage-one-workspace.tsx"],
      ["stage2", "src/components/projects/stage-two-folder-workspace.tsx"],
      ["concepts", "src/components/projects/concept-stage-workspace.tsx"],
      ["stage5", "src/components/projects/stage-five-workspace.tsx"],
      ["stage6", "src/components/projects/stage-six-workspace.tsx"],
      ["stage7", "src/components/projects/stage-seven-workspace.tsx"],
    ].map(async ([key, path]) => [key, await readFile(path, "utf8")]),
  ),
);

assert(files.schema.includes("model ProjectFormDraft"));
assert(files.schema.includes("@@unique([projectId, userId, formKey])"));
assert(files.migration.includes('CREATE TABLE "ProjectFormDraft"'));
assert(files.migration.includes('ON DELETE CASCADE'));

for (const required of [
  "assertProjectAccess",
  "MAX_DRAFT_BYTES",
  "validatePayload",
  "clientRevision: { lte: input.clientRevision }",
  'error.code !== "P2002"',
  "projectId_userId_formKey",
]) {
  assert(files.service.includes(required), `Draft service is missing ${required}`);
}

for (const required of [
  "getCurrentUser",
  'dynamic = "force-dynamic"',
  '"Cache-Control": "no-store"',
  "export async function GET",
  "export async function PUT",
  "export async function DELETE",
]) {
  assert(files.route.includes(required), `Draft API is missing ${required}`);
}

for (const required of [
  "debounceMs = 900",
  'keepalive: true',
  'window.addEventListener("pagehide"',
  'window.addEventListener("online"',
  "persistedSerializedRef.current === null",
  "useLayoutEffect",
  "Draft restored",
  "Draft not saved",
  'method: "DELETE"',
]) {
  assert(files.hook.includes(required), `Autosave hook is missing ${required}`);
}

const coverage = {
  stage1: ["stage-one-project-inquiry", "autosave.clearDraft"],
  stage2: ["stage-two-text-file", "ProjectFormAutosaveStatus"],
  concepts: ["concept-details:", "autosave.clearDraft"],
  stage5: ["stage-five-checklist:", "stage-five-information-request:"],
  stage6: ["stage-six-approver:", "stage-six-handover:"],
  stage7: ["stage-seven-sample-request:", "stage-seven-sample-review:"],
};

for (const [file, markers] of Object.entries(coverage)) {
  for (const marker of markers) {
    assert(files[file].includes(marker), `${file} is missing autosave coverage for ${marker}`);
  }
}

console.log("Server-backed project form autosave checks passed.");
