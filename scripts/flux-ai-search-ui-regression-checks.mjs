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

const tools = read("src/lib/flux-ai/tools.ts");
for (const snippet of [
  "sanitizeProjectSearchQuery",
  "isAllProjectsPrompt",
  "isBroadProjectSearchPrompt",
  "inferAssigneeNameFromPrompt",
  "inferCompletionBlockerFromPrompt",
  "rawMessage?: string | null;",
  "includesSearchValue(project.category, category)",
  "getTagNames(project).some",
  "collaboratorMatchesSearch(user, project, assigneeName)",
  "ProjectCompletionStepStatus.NOT_STARTED",
  "ProjectCompletionStepStatus.PENDING",
  "projectHasCompletionBlocker(project, completionBlocker)",
]) {
  assertIncludes(tools, snippet, `Flux AI search tool ${snippet}`);
}

assert(
  /assigneeName[\s\S]*project\.executors\.some[\s\S]*collaboratorMatchesSearch\(user, project, assigneeName\)/.test(
    tools,
  ),
  "Assigned-to searches must check both executors and collaborators.",
);
assert(
  /assigneeName[\s\S]*canUseParticipantFilter\(user, project\)/.test(tools),
  "Assigned-to searches must remain participant-permission gated.",
);
assert(
  /explicitProjectName[\s\S]*!\s*isBroadProjectSearchPrompt\(rawMessage\)[\s\S]*modelProjectName/.test(
    tools,
  ),
  "Broad project searches must not trust model project-name extraction unless explicitly named.",
);

const chatRoute = read("src/app/api/flux-ai/chat/route.ts");
for (const snippet of [
  "getDeterministicFluxAIIntent",
  "isProjectSearchPrompt",
  "isReadyForArchivePrompt",
  "isOverdueStagesPrompt",
  "isArchiveBlockersPrompt",
  "isProjectCountSummaryPrompt(message)",
  "rawMessage: input.message",
  "detection.completionBlocker ?? inferCompletionBlockerFromPrompt(message)",
  'case "project_search"',
  "I couldn't find any matching projects.",
]) {
  assertIncludes(chatRoute, snippet, `Flux AI chat route ${snippet}`);
}

assert(
  chatRoute.indexOf("isProjectCountSummaryPrompt(message)") <
    chatRoute.indexOf("isProjectSearchPrompt(message)"),
  "Count summary detection must remain before project search detection.",
);
assert(
  chatRoute.indexOf("isDraftProjectPrompt(message)") <
    chatRoute.indexOf("isProjectSearchPrompt(message)"),
  "Draft project detection must remain before project search detection.",
);

const workspace = read("src/components/flux-ai/flux-ai-workspace.tsx");
for (const snippet of [
  "isResultPanelOpen",
  "shouldShowResultPanel",
  "shouldShowProjectMatchesPanel",
  "shouldShowStatusSummaryPanel",
  "shouldShowCreatedProjectPanel",
  "shouldShowStandaloneBlockersPanel",
  "response.intent === \"project_count_summary\"",
  "ProjectResultDetailCard",
  "Project Result Detail",
  "fluxResponse?.projects?.length === 1",
  "projectCards.length > 1",
  "Try searching by project name, executor, category, tag, or status.",
  "CreatedProjectPanel",
  "Flux AI is thinking...",
  "messagesEndRef",
  "!hasUserStartedConversation",
  "Close results panel",
  "xl:sticky xl:top-6 xl:self-start",
  "xl:grid-cols-[minmax(0,1fr)_minmax(420px,560px)]",
  "setFluxResponse(null);",
  "No projects found.",
  "No project query yet.",
  "COLLAPSED_MESSAGE_LINE_LIMIT",
  "COLLAPSED_MESSAGE_CHARACTER_LIMIT",
  "Show full message",
  "Show less",
  "DraftProjectPreviewPanel",
  "DraftProjectEditorPanel",
  "/api/flux-ai/validate-draft",
  "ChatLanguagePicker",
  "/api/ai/translate",
  "/api/ai/transcribe",
  "Start voice input",
  "Edit Draft Details",
  "Save Details",
  "Cancel Edit",
  "Project Details",
  "Timeline & Budget",
  "Main Executor",
  "Collaborators",
  "Stages",
]) {
  assertIncludes(workspace, snippet, `Flux AI workspace state ${snippet}`);
}
assert(
  /fluxResponse\?\.projects\?\.length === 1[\s\S]*<ProjectResultDetailCard[\s\S]*project=\{fluxResponse\.projects\[0\]\}/.test(
    workspace,
  ),
  "Single project results must render through the detail card.",
);
assert(
  /projectCards\.length > 1[\s\S]*projectCards\.map[\s\S]*<ProjectMatchCard/.test(
    workspace,
  ),
  "Multiple project results must continue to render through compact cards.",
);
assert(
  /No projects found\.[\s\S]*Try searching by project name, executor, category, tag, or status\./.test(
    workspace,
  ),
  "Empty project results must show the guided empty state.",
);
assert(
  /function hasFluxResultContent[\s\S]*shouldShowProjectMatches\(response\)[\s\S]*response\.projectStatus[\s\S]*response\.type === "created_project"[\s\S]*response\.draftProject/.test(
    workspace,
  ),
  "Contextual result panel must be driven by concrete contextual data, not every response.",
);
assert(
  !/function hasFluxResultContent[\s\S]*response\.statusSummary \|\|[\s\S]*function getDraftStageLabel/.test(
    workspace,
  ),
  "Simple count/statusSummary-only answers must not automatically open the right panel.",
);

const validateDraftRoute = read("src/app/api/flux-ai/validate-draft/route.ts");
for (const snippet of [
  "hasPermission(user, \"project.create\")",
  "validateFluxAIDraftForCreation",
  'type: isReady ? "draft_project" : "missing_fields"',
  "Draft updated and ready to create.",
]) {
  assertIncludes(validateDraftRoute, snippet, `Flux AI draft validation route ${snippet}`);
}

for (const forbidden of [
  "Milano Ramadan Campaign 2026",
  "GTI Premium Blend Packaging",
  "Heritage Series Rebrand",
  "AI Suggestions",
  "const suggestions =",
  "Bot,",
]) {
  assertNotIncludes(workspace, forbidden, `Flux AI stale/mock UI ${forbidden}`);
}

console.log("Flux AI search/UI regression checks passed.");
