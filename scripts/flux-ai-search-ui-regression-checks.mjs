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
  "containsInsensitive",
  "buildFluxAISafeTextSearchWhere",
  "buildFluxAIProjectSearchWhere",
  "scopeParticipantSearchForFluxAI",
  "canViewVendorInfo: true",
  "where: searchWhere",
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
assert(
  /const searchWhere = buildFluxAIProjectSearchWhere[\s\S]*where: searchWhere[\s\S]*\.filter\(\(project\) => projectMatchesSearch/.test(
    tools,
  ),
  "Flux AI project search must query matching accessible projects before applying final in-memory checks.",
);
assert(
  /buildFluxAIParticipantVisibilityScopeWhere[\s\S]*canViewVendorInfo: true[\s\S]*scopeParticipantSearchForFluxAI[\s\S]*buildFluxAIParticipantSearchWhere/.test(
    tools,
  ),
  "Flux AI participant search must remain scoped to users allowed to see participant information.",
);

const chatRoute = read("src/app/api/flux-ai/chat/route.ts");
for (const snippet of [
  "getDeterministicFluxAIIntent",
  "isProjectSearchPrompt",
  "isPlainProjectLookupPrompt",
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
  "FluxMatchesPanel",
  "FluxRecentChatsPanel",
  "CompactProjectMatchCard",
  "CompactArchiveMatchCard",
  "activeMatchesTab",
  "Recent Chats",
  "Current Chat",
  "Try searching by project name, executor, category, tag, or status.",
  "CreatedProjectPanel",
  "Flux AI is thinking...",
  "messagesEndRef",
  "!hasUserStartedConversation",
  "xl:h-[calc(100vh-180px)]",
  "xl:overflow-hidden",
  "xl:h-full xl:overflow-y-auto xl:pr-1",
  "min-h-0 flex-1 space-y-5 overflow-y-auto pr-1",
  "xl:grid-cols-[minmax(0,1fr)_minmax(340px,390px)]",
  "setFluxResponse(null);",
  "No projects found.",
  "No project query yet.",
  "COLLAPSED_MESSAGE_LINE_LIMIT",
  "COLLAPSED_MESSAGE_CHARACTER_LIMIT",
  "Show full message",
  "Show less",
  "DraftProjectPreviewPanel",
  "DraftProjectEditorPanel",
  "draftMissingFieldOrder",
  "sortDraftMissingFields",
  "orderedMissingFields.map((field) =>",
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
  "Executor",
  "Collaborators",
  "Stages",
]) {
  assertIncludes(workspace, snippet, `Flux AI workspace state ${snippet}`);
}
assert(
  /projectCards\.slice\(0, 8\)\.map[\s\S]*<CompactProjectMatchCard/.test(
    workspace,
  ),
  "Project matches must render through compact right-sidebar cards.",
);
assert(
  /archiveAssets\.slice\(0, 8\)\.map[\s\S]*<CompactArchiveMatchCard/.test(
    workspace,
  ),
  "Archive matches must render through compact right-sidebar cards.",
);
assert(
  /<FluxRecentChatsPanel[\s\S]*conversations=\{conversations\}[\s\S]*activeConversationId=\{activeConversationId\}/.test(
    workspace,
  ),
  "Conversation history must render in the right sidebar.",
);
assert(
  /header[\s\S]*Flux AI[\s\S]*Ask, find, create, and manage projects with AI\.[\s\S]*<\/header>/.test(
    workspace,
  ) &&
    !/header[\s\S]*Recent Chats[\s\S]*<\/header>/.test(workspace),
  "Main chat header must not include the horizontal recent-chat strip.",
);
assert(
  /No projects found\.[\s\S]*Try searching by project name, executor, category, tag, or status\./.test(
    workspace,
  ),
  "Empty project results must show the guided empty state.",
);
assert(
  /draftMissingFieldOrder[\s\S]*\^Project Name\$[\s\S]*\^Category\$[\s\S]*\^Project Brief\$[\s\S]*\^Start Date\$[\s\S]*\^Executor\$[\s\S]*\^Resolve Collaborators\$[\s\S]*\^Stages\$/.test(
    workspace,
  ),
  "Draft missing-field chips must follow the same order as the draft preview sections.",
);
assert(
  /const projectMissing = getSectionMissingFields\(orderedMissingFields, \[[\s\S]*\^Project Brief\$[\s\S]*\]\);/.test(
    workspace,
  ),
  "Project detail missing-field chips must use exact project-detail labels.",
);
assert(
  /const stageMissing = getSectionMissingFields\(orderedMissingFields, \[[\s\S]*\^Stages\$[\s\S]*\^Stage \\d\+ /.test(
    workspace,
  ),
  "Stage missing-field chips must stay scoped to the Stages section.",
);
assert(
  !/function DraftSection[\s\S]*Missing \{missingFields\.length\}/.test(workspace),
  "Draft sections must not show local missing-count badges that conflict with the total missing count.",
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
