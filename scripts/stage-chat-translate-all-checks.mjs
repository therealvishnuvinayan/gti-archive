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

const workspace = read("src/components/projects/project-chat-workspace.tsx");
const route = read("src/app/api/ai/translate-batch/route.ts");
const openai = read("src/lib/ai/openai.ts");

for (const snippet of [
  "translateAllEnabled",
  "isTranslatingAll",
  "stageChatTranslations",
  "pendingTranslateAllSegmentIdsRef",
  "handleTranslateAllToggle",
  "translateAllLoadedMessages",
  "loadAllEarlierMessagesForTranslateAll",
  "getStageChatTranslationSegments",
  "getTranslatedStageChatText",
  "Translate All",
  "Original",
  "ChatLanguagePicker",
  "getTranslatedStageChatText(",
  "translatedRevisionBody",
  "translatedRevisionLabel",
  "translatedRevisionStatusLabel",
  "translatedRevisionNoteLabel",
  "translatedSubmittedFilesLabel",
  "translatedCaptionBody",
  "translatedCaptionAddedLabel",
  "translatedComparisonBody",
  "translatedComparisonSubmittedLabel",
  "translatedCommentOnRevisionLabel",
  "translatedAttachmentLabel",
  "translatedCommentBody",
]) {
  assertIncludes(workspace, snippet, `Stage Chat Translate All UI ${snippet}`);
}

assert(
  workspace.includes('fetch("/api/ai/translate-batch"') &&
    workspace.includes("displayedMessages.flatMap") &&
    workspace.includes("limit: \"50\"") &&
    workspace.includes("selectedOutputLanguage.code") &&
    workspace.includes("translateAllEnabled"),
  "Stage Chat must call the batch translation API for loaded messages and selected language.",
);

for (const snippet of [
  "canUseChatAiTools",
  "AI_PERMISSION_ERROR",
  "checkAiRateLimit",
  "translateTextsWithOpenAI",
  "MAX_TRANSLATION_BATCH_ITEMS",
  "MAX_TRANSLATION_BATCH_CHARACTERS",
]) {
  assertIncludes(route, snippet, `Translate batch route safety ${snippet}`);
}

for (const snippet of [
  "translateTextsWithOpenAI",
  "chat_translation_batch_result",
  "Keep each output item id exactly unchanged",
  "MAX_TRANSLATION_BATCH_ITEMS",
  "MAX_TRANSLATION_BATCH_CHARACTERS",
]) {
  assertIncludes(openai, snippet, `OpenAI batch translation helper ${snippet}`);
}

console.log("Stage Chat Translate All regression checks passed.");
