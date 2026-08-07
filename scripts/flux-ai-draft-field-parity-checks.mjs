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

const fluxPage = read("src/app/(dashboard)/flux-ai/page.tsx");
for (const snippet of [
  "getCollaborators()",
  "getActiveProjectMasterDataOptions()",
  "draftOptions={{",
  "categories: masterDataOptions.categories",
  "statuses: masterDataOptions.projectStatuses",
  "tags: masterDataOptions.tags",
  "canManageProjectMasterData: hasPermission(user, \"settings.manageMasterData\")",
]) {
  assertIncludes(fluxPage, snippet, `Flux AI page draft option source ${snippet}`);
}

const workspace = read("src/components/flux-ai/flux-ai-workspace.tsx");
for (const snippet of [
  "type FluxAIDraftOptions",
  "draftOptions = emptyDraftOptions",
  "PROJECT_CURRENCY_OPTIONS",
  "resolveProjectCurrency",
  "projectPriorityOptions",
  "Project status",
  "Select project category",
  "Select project tags",
  "Search existing executor",
  "Search existing collaborators",
  "projectCollaboratorPermissionKeys.map",
  "projectCollaboratorPermissionLabels[permissionKey]",
  "isClientOfGtiParticipantType(selectedCandidate.type)",
  "Client of GTI collaborators cannot access project archives.",
]) {
  assertIncludes(workspace, snippet, `Flux AI draft editor parity ${snippet}`);
}

for (const forbidden of [
  "value={joinCommaList(draftProject.tags)}",
  "value={joinCommaList(draftProject.collaborators)}",
  "onChange={(event) => updateDraft({ category: event.target.value })}",
  "onChange={(event) => updateDraft({ currency: event.target.value.toUpperCase() || null })}",
  "onChange={(event) => updateDraft({ mainExecutor: event.target.value || null })}",
]) {
  assertNotIncludes(workspace, forbidden, `Weak Flux AI draft text control ${forbidden}`);
}

const fluxTypes = read("src/lib/flux-ai/types.ts");
for (const snippet of [
  "statusId?: string | null;",
  "statusName?: string | null;",
  "export type FluxAICollaboratorPermissions",
  "type: ProjectCollaboratorParticipantType;",
  "typeGroup: \"internal\" | \"external\";",
  "permissions?: FluxAICollaboratorPermissions | null;",
]) {
  assertIncludes(fluxTypes, snippet, `Flux AI draft type parity ${snippet}`);
}

const tools = read("src/lib/flux-ai/tools.ts");
for (const snippet of [
  "canonicalOption(rawCategory, masterData.categories)",
  "canonicalTags = rawTags.map((tag) => canonicalOption(tag, masterData.tags))",
  "Category \"${draftProject.category}\" was not found in active project categories.",
  "addMissingField(missingFields, \"Valid Project Tags\")",
  "permissions: getFluxAICollaboratorPermissions",
  "normalizeProjectCollaboratorPermissions",
  "Select an active project status.",
  "function parseDraftNaturalDate",
  "function getDraftDateContextYear",
  "inferredTimeline.startDate ??",
  "inferredTimeline.endDate ??",
  "normalizeDraftDate(detectedDraft?.startDate, { defaultYear: draftDateContextYear })",
  "normalizeDraftDate(detectedDraft?.endDate, { defaultYear: draftDateContextYear })",
]) {
  assertIncludes(tools, snippet, `Flux AI draft server validation ${snippet}`);
}
assertNotIncludes(
  tools,
  "new Date(normalizedValue)",
  "Flux AI draft date normalization must not use JavaScript's ambiguous date parser.",
);
assertNotIncludes(
  tools,
  "addMissingField(missingFields, \"Attachments\")",
  "Flux AI draft validation must not make attachments required.",
);

const createRoute = read("src/app/api/flux-ai/create-project/route.ts");
for (const snippet of [
  "temporarily unavailable for the V2 workflow",
  "select an operational owner, optional co-owners, and executors",
  "jsonFluxAI(response, 409)",
]) {
  assertIncludes(createRoute, snippet, `Flux AI create route form parity ${snippet}`);
}
assertNotIncludes(
  createRoute,
  "createProjectAction(",
  "Flux AI create route must not call the legacy create project action.",
);
assertNotIncludes(createRoute, "prisma.project.create", "Flux AI create route direct create");

console.log("Flux AI draft field parity checks passed.");
