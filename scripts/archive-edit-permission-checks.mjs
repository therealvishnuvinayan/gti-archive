import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path) {
  return readFileSync(path, "utf8");
}

function includes(source, snippet, message) {
  assert.ok(source.includes(snippet), message);
}

const archives = read("src/lib/archives.ts");
const action = read("src/app/(dashboard)/archives/actions.ts");
const workspace = read("src/components/archives/archive-category-workspace.tsx");
const dialog = read("src/components/archives/archive-item-dialog.tsx");
const page = read("src/app/(dashboard)/archives/[slug]/page.tsx");

const editGuardStart = archives.indexOf(
  "export async function assertCanEditArchivedFileInformation",
);
const editMutationStart = archives.indexOf(
  "export async function updateArchivedFileInformation",
);
assert.ok(editGuardStart >= 0 && editMutationStart > editGuardStart);

const editGuard = archives.slice(editGuardStart, editMutationStart);

for (const snippet of [
  "assertCanUseArchives(",
  "assertCanAccessArchivedProjectFileAsset(",
  "assertCanAccessManualArchiveFileAsset(",
  "await assertProjectAccess(user, archivedProjectFile.projectId)",
  "await assertProjectTimestampVisibleForUser(user, {",
]) {
  includes(editGuard, snippet, `Archive edit guard must include ${snippet}`);
}

for (const forbidden of [
  "isProjectOwner(",
  "isProjectExecutor(",
  "isSuperAdminRole(",
  "archivedById === user.id",
  "uploadedById === user.id",
]) {
  assert.ok(
    !editGuard.includes(forbidden),
    `Archive editing must not be restricted by ${forbidden}`,
  );
}

includes(
  archives,
  "validateArchiveFileName(",
  "Archive rename must preserve the existing filename validation",
);
includes(
  archives,
  "validateArchiveArtworkMetadataInput({",
  "Archive metadata edits must preserve existing metadata validation",
);
includes(action, "const user = await requireUser();", "Archive edit action must require authentication");
includes(
  action,
  "await updateArchivedFileInformation(user, input)",
  "Archive edit action must delegate to the guarded service",
);
includes(page, "const user = await requireUser();", "Archive category page must remain authenticated");
includes(workspace, ">\n                        Edit\n", "Accessible Archive items must show Edit");
includes(
  workspace,
  'item.mimeType.startsWith("image/")',
  "Image Archive items must render an inline preview thumbnail",
);
includes(
  workspace,
  "src={item.previewPath}",
  "Archive image thumbnails must use the protected preview route",
);
includes(
  dialog,
  "ArchiveMetadataIdentificationStep",
  "Archive edit dialog must reuse the metadata form",
);
includes(
  dialog,
  "ArchiveMetadataTechnicalStep",
  "Archive edit dialog must expose existing technical metadata",
);
includes(
  dialog,
  "updateArchivedFileInformationAction({",
  "Archive edit dialog must persist through the server action",
);

for (const privilegedMutation of ["delete", "restore"]) {
  assert.ok(
    !action.toLowerCase().includes(privilegedMutation),
    `Archive editing must not add ${privilegedMutation} authority`,
  );
}

console.log("Archive edit permission checks passed.");
