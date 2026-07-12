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

const workspace = read("src/components/flux-ai/flux-ai-workspace.tsx");

for (const forbidden of [
  "const projectMatches",
  "const extractedDetails",
  "mock-",
  "Milano Ramadan Campaign 2026",
  "GTI Premium Blend Packaging",
  "Heritage Series Rebrand",
  "Concept & Design",
  "Production & Delivery",
  "[\"SM\", \"YK\", \"AN\"]",
]) {
  assertNotIncludes(workspace, forbidden, `Flux AI rendered mock data ${forbidden}`);
}

for (const required of [
  "const projectCards = useMemo(",
  "(fluxResponse?.projects ?? []).map(mapProjectResultToCard)",
  "Boolean(draftProject) && !shouldShowCreatedProjectPanel",
  "No projects found.",
  "No project query yet.",
  "Ask Flux AI to find projects and real matches will appear here.",
  "No collaborators extracted.",
  "No stages extracted.",
  "DraftProjectPreviewPanel",
  "DraftProjectEditorPanel",
  "onEdit={openDraftEditor}",
]) {
  assertIncludes(workspace, required, `Flux AI real-data UI state ${required}`);
}

assert(
  !/fluxResponse\?\.projects\?\.length[\s\S]*:\s*projectMatches/.test(workspace),
  "Project Matches must not fall back to mock project cards.",
);
assert(
  !/draftProject\?\.stages\.length[\s\S]*Concept & Design/.test(workspace),
  "Draft Project Preview must not fall back to sample stages.",
);

const chatRoute = read("src/app/api/flux-ai/chat/route.ts");
assertIncludes(
  chatRoute,
  "I couldn't find any matching projects.",
  "empty project search assistant message",
);

console.log("Flux AI real-data regression checks passed.");
