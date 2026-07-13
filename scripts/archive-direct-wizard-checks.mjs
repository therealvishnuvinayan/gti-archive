import { readFileSync } from "node:fs";

function read(path) {
  return readFileSync(path, "utf8");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertIncludes(source, value, label) {
  assert(source.includes(value), `${label} is missing.`);
}

const metadata = read("src/lib/archive-artwork-metadata.ts");
const metadataForm = read("src/components/archives/archive-artwork-metadata-form.tsx");
const directUpload = read("src/components/dashboard/upload-assets-button.tsx");
const archiveService = read("src/lib/archives.ts");
const completeRoute = read("src/app/api/archives/complete/route.ts");
const schema = read("prisma/schema.prisma");
const migration = read(
  "prisma/migrations/20260713170000_direct_archive_artwork_metadata/migration.sql",
);
const projectChat = read("src/components/projects/project-chat-workspace.tsx");

for (const snippet of [
  "ArchiveArtworkMetadataDraft",
  "requiredArchiveArtworkMetadataFields",
  "buildDirectArchiveArtworkMetadataDraft",
  "getArchiveArtworkMetadataMissingGroups",
  "archiveDirectUploadWizardSteps",
]) {
  assertIncludes(metadata, snippet, `Shared archive metadata contract ${snippet}`);
}

for (const snippet of [
  "ArchiveArtworkMetadataField",
  "ArchiveMetadataIdentificationStep",
  "ArchiveMetadataTechnicalStep",
  "ArchiveMetadataReviewList",
  "AppDatePicker",
]) {
  assertIncludes(metadataForm, snippet, `Shared archive metadata form ${snippet}`);
}

for (const snippet of [
  "ArchiveMetadataIdentificationStep",
  "ArchiveMetadataTechnicalStep",
  "ArchiveMetadataReviewList",
  "archiveDirectUploadWizardSteps",
  'fetch("/api/archives/upload-url"',
  'fetch("/api/archives/complete"',
  "artworkMetadata: archiveFile.metadata",
  "finalArchiveFileName",
]) {
  assertIncludes(directUpload, snippet, `Direct archive wizard ${snippet}`);
}

for (const snippet of [
  "ArchiveMetadataIdentificationStep",
  "ArchiveMetadataTechnicalStep",
  "ArchiveMetadataReviewList",
  "archiveProjectWizardSteps as archiveWizardSteps",
  "getArchiveArtworkMetadataMissingGroups as getArchiveMetadataMissingGroups",
]) {
  assertIncludes(projectChat, snippet, `Project archive shared metadata usage ${snippet}`);
}

for (const snippet of [
  "CompleteArchiveUploadInput",
  "validateArchiveArtworkMetadataInput",
  "manualArchiveFileId",
  'sourceType: "DIRECT_UPLOAD"',
  "archiveArtworkMetadata.upsert",
]) {
  assertIncludes(archiveService, snippet, `Direct archive server metadata ${snippet}`);
}

assertIncludes(
  completeRoute,
  "artworkMetadata?: ArchiveArtworkMetadataDraft",
  "Archive complete route metadata payload",
);

for (const snippet of [
  "ArchiveArtworkMetadataSourceType",
  "manualArchiveFileId String?",
  "manualArchiveFile   ManualArchiveFile?",
  "artworkMetadata   ArchiveArtworkMetadata?",
]) {
  assertIncludes(schema, snippet, `Prisma direct archive metadata schema ${snippet}`);
}

for (const snippet of [
  'CREATE TYPE "ArchiveArtworkMetadataSourceType"',
  'ADD COLUMN "manualArchiveFileId" TEXT',
  'ALTER COLUMN "archiveFileId" DROP NOT NULL',
  'ALTER COLUMN "projectId" DROP NOT NULL',
  'ArchiveArtworkMetadata_manualArchiveFileId_fkey',
]) {
  assertIncludes(migration, snippet, `Migration direct metadata ${snippet}`);
}

console.log("Archive direct wizard regression checks passed.");
