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
  assert(!source.includes(value), `${label} must not be present.`);
}

const types = read("src/lib/flux-ai/types.ts");
for (const snippet of [
  '"archive_search"',
  '"archive_results"',
  "FluxAIArchiveAssetResult",
  "archiveAssets?: FluxAIArchiveAssetResult[];",
  "mimeType: string;",
]) {
  assertIncludes(types, snippet, `Flux AI archive type ${snippet}`);
}

const chatRoute = read("src/app/api/flux-ai/chat/route.ts");
for (const snippet of [
  "isArchiveAssetSearchPrompt",
  'return "archive_search";',
  'case "archive_search"',
  "searchArchiveAssetsForFluxAI",
  "getArchiveResultsMessage",
  "I couldn't find any matching archive assets.",
  "storage keys, private file paths",
]) {
  assertIncludes(chatRoute, snippet, `Flux AI archive chat route ${snippet}`);
}
assert(
  chatRoute.indexOf("isArchiveAssetSearchPrompt(message)") <
    chatRoute.indexOf("isProjectSearchPrompt(message)"),
  "Archive asset detection must run before generic project search detection.",
);
assert(
  /function getArchiveResultsMessage[\s\S]*matching archive assets[\s\S]*function shouldAlsoSearchArchivesForProjectPrompt/.test(
    chatRoute,
  ),
  "Archive empty-result copy must say archive assets, not matching projects.",
);

const tools = read("src/lib/flux-ai/tools.ts");
for (const snippet of [
  "searchArchiveAssetsForFluxAI",
  "getFluxAIAccessibleArchiveCategoryWhere",
  "buildArchivedProjectFileAnyTextWhere",
  "buildManualArchiveFileAnyTextWhere",
  "buildArchivedProjectFileExtensionWhere",
  "buildManualArchiveFileExtensionWhere",
  "getArchiveAccessLevel(user) === \"PARTIAL\"",
  "userArchiveAccesses",
  "canUseArchives(user) || isClientOfGtiUser(user)",
  "AttachmentStatus.READY",
  "viewHref: `/api/archives/files/${file.id}/preview`",
  "downloadHref: options.canDownload",
]) {
  assertIncludes(tools, snippet, `Flux AI archive search tool ${snippet}`);
}
for (const forbidden of [
  "storageKey",
  "bucket",
  "downloadUrl",
  "previewUrl",
  "downloadPath",
  "previewPath",
]) {
  assertNotIncludes(tools, forbidden, `Flux AI archive search payload ${forbidden}`);
}
assert(
  /extractArchiveFilenameTerms[\s\S]*terms\.add\(fileName\)[\s\S]*terms\.add\(fileName\.replace/.test(
    tools,
  ),
  "Archive filename search must include exact filename and filename stem terms.",
);
assert(
  /cleanedQuery =[\s\S]*filenameTerms\.length > 0[\s\S]*\? ""/.test(tools),
  "Exact filename prompts must not be over-filtered by a second broad text query.",
);

const conversations = read("src/lib/flux-ai/conversations.ts");
for (const snippet of [
  "sanitizeArchiveAssetForPersistence",
  "archiveAssets: response.archiveAssets?.map(sanitizeArchiveAssetForPersistence)",
  '"storageKey"',
  '"bucket"',
  '"downloadUrl"',
  '"previewUrl"',
]) {
  assertIncludes(conversations, snippet, `Flux AI archive persistence ${snippet}`);
}

const workspace = read("src/components/flux-ai/flux-ai-workspace.tsx");
for (const snippet of [
  "shouldShowArchiveMatches",
  "CompactArchiveMatchCard",
  "AssetPreviewButton",
  "getArchiveAssetMimeType",
  "Archive Match",
  "Archive Matches",
  "No archive assets found.",
  "Try searching by file name, artwork ID, brand, archive category, project name, or file type.",
  "asset.downloadHref",
]) {
  assertIncludes(workspace, snippet, `Flux AI archive UI ${snippet}`);
}
assertNotIncludes(
  workspace,
  '<Link href={asset.viewHref} target="_blank"',
  "Flux AI archive View action must open the in-app preview modal",
);

const archives = read("src/lib/archives.ts");
for (const snippet of [
  "getArchivedFilePreviewUrlForUser",
  "getArchivedFileDownloadUrlForUser",
  "assertCanAccessArchivedProjectFileAsset",
  "assertCanAccessManualArchiveFileAsset",
  "hasPermission(user, \"archive.download\")",
]) {
  assertIncludes(archives, snippet, `Archive route safety ${snippet}`);
}

console.log("Flux AI archive search regression checks passed.");
