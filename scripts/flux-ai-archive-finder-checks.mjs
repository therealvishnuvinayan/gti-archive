import { existsSync, readFileSync } from "node:fs";
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

const removedFluxPaths = [
  "src/app/api/flux-ai/chat/route.ts",
  "src/app/api/flux-ai/create-project/route.ts",
  "src/app/api/flux-ai/validate-draft/route.ts",
  "src/app/api/flux-ai/conversations/route.ts",
  "src/app/api/flux-ai/conversations/[conversationId]/route.ts",
  "src/app/api/flux-ai/conversations/[conversationId]/clear-state/route.ts",
  "src/lib/flux-ai/conversations.ts",
  "src/lib/flux-ai/tools.ts",
  "src/lib/flux-ai/types.ts",
];

for (const relativePath of removedFluxPaths) {
  assert(
    !existsSync(join(rootDir, relativePath)),
    `Removed Flux AI surface ${relativePath} still exists.`,
  );
}

const searchRoute = read("src/app/api/flux-ai/search/route.ts");
for (const snippet of [
  'hasPermission(user, "fluxAi.view")',
  "canUseArchives(user)",
  "searchArchivesForUser",
  "No archives matched",
  '"Cache-Control": "no-store"',
]) {
  assertIncludes(searchRoute, snippet, `Flux AI search route ${snippet}`);
}
for (const forbidden of [
  "OpenAI",
  "prisma.",
  ".create(",
  ".update(",
  ".delete(",
  "project.create",
  "stage.markStageComplete",
]) {
  assertNotIncludes(searchRoute, forbidden, `Read-only Flux AI route ${forbidden}`);
}

const archives = read("src/lib/archives.ts");
for (const snippet of [
  "export async function searchArchivesForUser",
  "buildProjectArchiveSearchBaseWhere",
  "buildManualArchiveSearchBaseWhere",
  "getAccessibleArchiveCategoryWhere(user)",
  "getArchivedProjectFileAccessWhere(user)",
  "getManualArchiveFileAccessWhere(user)",
  "isArchiveTimestampVisibleToUser",
  "MAX_ARCHIVE_SEARCH_CANDIDATES",
  "finalArchiveFileName: true",
  "originalFileName: true",
]) {
  assertIncludes(archives, snippet, `Canonical archive search ${snippet}`);
}

const workspace = read("src/components/flux-ai/flux-ai-workspace.tsx");
for (const snippet of [
  "Flux AI",
  "Search your archived projects and files.",
  'placeholder="Search archives..."',
  "Find an archive by name",
  "Search archived projects",
  "Find an archived file",
  'fetch("/api/flux-ai/search"',
  "Open Archive",
  "Matched file",
]) {
  assertIncludes(workspace, snippet, `Flux AI archive finder UI ${snippet}`);
}
for (const forbidden of [
  "Create Project",
  "Edit Project",
  "Complete Stage",
  "Assign User",
  "Create Concept",
  "Recent Chats",
  "conversationId",
  "/api/flux-ai/chat",
  "/api/flux-ai/create-project",
  "/api/flux-ai/validate-draft",
]) {
  assertNotIncludes(workspace, forbidden, `Removed Flux AI UI ${forbidden}`);
}

const fluxPage = read("src/app/(dashboard)/flux-ai/page.tsx");
for (const snippet of [
  'hasPermission(user, "fluxAi.view")',
  "canUseArchives(user)",
  "<FluxAiWorkspace />",
]) {
  assertIncludes(fluxPage, snippet, `Flux AI page ${snippet}`);
}
for (const forbidden of [
  "getCollaborators",
  "getActiveProjectMasterDataOptions",
  "draftOptions",
]) {
  assertNotIncludes(fluxPage, forbidden, `Flux AI page heavy load ${forbidden}`);
}

const sidebar = read("src/components/layout/sidebar.tsx");
assertIncludes(
  sidebar,
  '{ label: "Flux AI", href: "/flux-ai"',
  "Flux AI sidebar name",
);
const resolver = read("src/lib/permissions/resolver.ts");
assertIncludes(
  resolver,
  'fluxAi: hasPermission(user, "fluxAi.view") && canUseArchives(user)',
  "Flux AI sidebar archive-access guard",
);

const permissions = read("src/lib/permissions/definitions.ts");
assertIncludes(permissions, 'fluxAi: ["fluxAi.view"]', "Flux AI view permission");
assertNotIncludes(
  permissions,
  "fluxAi.deleteOwnConversation",
  "Removed Flux AI conversation permission",
);

const archiveCategoryPage = read("src/app/(dashboard)/archives/[slug]/page.tsx");
const archiveCategoryWorkspace = read(
  "src/components/archives/archive-category-workspace.tsx",
);
assertIncludes(archiveCategoryPage, "initialSearch", "Archive result navigation query");
assertIncludes(
  archiveCategoryWorkspace,
  "search: initialSearch",
  "Archive module initial search",
);

console.log("Flux AI archive finder checks passed.");
