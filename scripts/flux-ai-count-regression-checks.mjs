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
assertIncludes(types, '"project_count_summary"', "project_count_summary intent");

const tools = read("src/lib/flux-ai/tools.ts");
for (const snippet of [
  "getProjectCountSummaryForFluxAI",
  "getDashboardProjectCounts(user)",
  "total: counts.total",
  "active: counts.ongoing",
  "pending: counts.pending",
  "onHold: counts.onHold",
  "completed: counts.completed",
]) {
  assertIncludes(tools, snippet, `count tool ${snippet}`);
}

const chatRoute = read("src/app/api/flux-ai/chat/route.ts");
for (const snippet of [
  "isProjectCountSummaryPrompt",
  "getProjectCountFocus",
  "project_count_summary",
  "getProjectCountSummaryForFluxAI(input.user)",
  "You currently have ${input.summary.total} accessible project",
  "You currently have ${input.summary.active} active project",
  "Total projects: ${input.summary.total}",
  "Active projects: ${input.summary.active}",
  "getDeterministicFluxAIIntent(message, explicitMode)",
  "if (isProjectCountSummaryPrompt(message))",
]) {
  assertIncludes(chatRoute, snippet, `count route ${snippet}`);
}
assertIncludes(chatRoute, 'case "project_search"', "Find all projects remains search-capable");
assertIncludes(
  chatRoute,
  "I couldn't find any matching projects.",
  "search empty state remains distinct from counts",
);

const workspace = read("src/components/flux-ai/flux-ai-workspace.tsx");
for (const snippet of [
  'response.intent === "project_count_summary"',
  "whitespace-pre-line",
  "shouldShowProjectMatches(response)",
  "Project Matches",
]) {
  assertIncludes(workspace, snippet, `count UI ${snippet}`);
}
assert(
  /function shouldShowProjectMatches[\s\S]*response\.intent === "project_count_summary"[\s\S]*return false/.test(
    workspace,
  ),
  "Project count summaries must not render Project Matches.",
);
assertNotIncludes(
  workspace,
  "Milano Ramadan Campaign 2026",
  "mock project cards must not be rendered for count summaries",
);

console.log("Flux AI count regression checks passed.");
