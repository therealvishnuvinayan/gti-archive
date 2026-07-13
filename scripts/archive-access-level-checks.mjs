import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));

function read(relativePath) {
  return readFileSync(join(rootDir, relativePath), "utf8");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertIncludes(source, value, label) {
  assert(source.includes(value), `${label} is missing.`);
}

function assertNotIncludes(source, value, label) {
  assert(!source.includes(value), `${label} should not be present.`);
}

const schema = read("prisma/schema.prisma");
const migration = read(
  "prisma/migrations/20260713183000_archive_access_levels/migration.sql",
);
const resolver = read("src/lib/permissions/resolver.ts");
const profiles = read("src/lib/permissions/profiles.ts");
const archives = read("src/lib/archives.ts");
const userPermissions = read("src/lib/user-permissions.ts");
const userActions = read("src/app/(dashboard)/users/actions.ts");
const usersWorkspace = read("src/components/users/users-workspace.tsx");
const packageJson = read("package.json");

for (const snippet of [
  "enum ArchiveAccessLevel",
  "NONE",
  "FULL",
  "PARTIAL",
  "model UserArchiveAssetAccess",
  "level       ArchiveAccessLevel",
  "archivedProjectFileId String?",
  "manualArchiveFileId   String?",
  "archiveAssetAccesses",
]) {
  assertIncludes(schema, snippet, `Archive access schema ${snippet}`);
}

for (const snippet of [
  'CREATE TYPE "ArchiveAccessLevel"',
  'ADD COLUMN "level" "ArchiveAccessLevel"',
  'CREATE TABLE "UserArchiveAssetAccess"',
  "UserArchiveAssetAccess_single_asset_check",
  'FOREIGN KEY ("archivedProjectFileId")',
  'FOREIGN KEY ("manualArchiveFileId")',
]) {
  assertIncludes(migration, snippet, `Archive access migration ${snippet}`);
}

for (const snippet of [
  "export function getArchiveAccessLevel",
  'return "NONE" as const;',
  'return "FULL" as const;',
  'getArchiveAccessLevel(user) !== "NONE"',
  'user.collaboratorType === "CLIENT_OF_GTI"',
]) {
  assertIncludes(resolver, snippet, `Archive access resolver ${snippet}`);
}

for (const snippet of [
  "archiveAccessLevel",
  "archiveAccess?.level ?? \"NONE\"",
  "archiveAccessGranted: Boolean(archiveAccess && archiveAccess.level !== \"NONE\")",
]) {
  assertIncludes(profiles, snippet, `Archive access snapshot ${snippet}`);
}

for (const snippet of [
  "function hasPartialArchiveAccess",
  "getArchivedProjectFileAccessWhere",
  "getManualArchiveFileAccessWhere",
  "getArchiveCategoryAssetGrantWhere",
  "return canUseArchives(user);",
  "assertCanAccessArchivedProjectFileAsset",
  "assertCanAccessManualArchiveFileAsset",
  "prisma.userArchiveAssetAccess.count",
]) {
  assertIncludes(archives, snippet, `Archive access enforcement ${snippet}`);
}

assertNotIncludes(
  archives,
  "hasProjectArchiveGrant",
  "Legacy project-only archive grant area fallback",
);

for (const snippet of [
  "ManagedArchiveAccessLevel",
  "ManagedArchiveAssetAccessRecord",
  "archiveAccessLevel: ManagedArchiveAccessLevel",
  "normalizeArchiveAssetIds",
  "validateArchiveAssetSelection",
  "ArchiveAccessLevel.PARTIAL",
  "Select at least one archive asset for partial access.",
  "userArchiveAssetAccess.createMany",
  "userArchiveAssetAccess.deleteMany",
]) {
  assertIncludes(userPermissions, snippet, `Managed user archive access ${snippet}`);
}

for (const snippet of [
  "searchArchiveAssetsForAccessAction",
  "ArchiveAccessAssetSearchRecord",
  "AttachmentStatus.READY",
  "artworkMetadata",
  "recordTypeLabel",
]) {
  assertIncludes(userActions, snippet, `Archive access asset search ${snippet}`);
}

for (const forbidden of ["storageKey", "bucket", "downloadPath", "previewPath"]) {
  assertNotIncludes(
    userActions,
    forbidden,
    `Archive asset search action must not return ${forbidden}`,
  );
}

for (const snippet of [
  "ArchiveAssetAccessPicker",
  "No Access",
  "Full Access",
  "Partial Access",
  "searchArchiveAssetsForAccessAction",
  "selectedAssets.length",
  "GTI Client users cannot receive Archive access.",
  "Super Admins always retain full Archive access.",
]) {
  assertIncludes(usersWorkspace, snippet, `Archive access UI ${snippet}`);
}

assertIncludes(
  packageJson,
  '"archive:access-level-check": "node scripts/archive-access-level-checks.mjs"',
  "Archive access level package script",
);

console.log("Archive access level checks passed.");
