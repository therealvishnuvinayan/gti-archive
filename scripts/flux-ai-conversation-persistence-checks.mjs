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

const schema = read("prisma/schema.prisma");
for (const snippet of [
  "enum FluxAiConversationStatus",
  "enum FluxAiMessageRole",
  "fluxAiConversations",
  "model FluxAiConversation",
  "model FluxAiMessage",
  "userId        String",
  "structuredPayload Json?",
  "@@index([userId, status, lastMessageAt])",
  "@@index([conversationId, role, createdAt])",
]) {
  assertIncludes(schema, snippet, `Prisma schema ${snippet}`);
}

const migration = read(
  "prisma/migrations/20260712120000_flux_ai_conversation_persistence/migration.sql",
);
for (const snippet of [
  'CREATE TYPE "FluxAiConversationStatus"',
  'CREATE TYPE "FluxAiMessageRole"',
  'CREATE TABLE "FluxAiConversation"',
  'CREATE TABLE "FluxAiMessage"',
  'FOREIGN KEY ("userId") REFERENCES "User"("id")',
  'FOREIGN KEY ("conversationId") REFERENCES "FluxAiConversation"("id")',
]) {
  assertIncludes(migration, snippet, `Flux AI migration ${snippet}`);
}

const conversationHelper = read("src/lib/flux-ai/conversations.ts");
for (const snippet of [
  "sanitizeFluxAIResponseForPersistence",
  "sensitivePayloadKeys",
  '"passwordHash"',
  '"storageKey"',
  '"downloadUrl"',
  "userId: user.id",
  "id: input.conversationId",
  "userId: input.user.id",
  "persistFluxAIUserMessage",
  "persistFluxAIAssistantMessage",
  "persistFluxAISystemEvent",
  "FluxAIConversationAccessError",
]) {
  assertIncludes(conversationHelper, snippet, `conversation helper ${snippet}`);
}
assert(
  /function sanitizeProjectResultForPersistence[\s\S]*return \{[\s\S]*id: project\.id[\s\S]*readyForArchive: project\.readyForArchive[\s\S]*\};/.test(
    conversationHelper,
  ),
  "Project result persistence must use an allowlisted safe snapshot.",
);
assertNotIncludes(
  conversationHelper,
  "passwordHash:",
  "conversation helper must not persist password hashes",
);
assertNotIncludes(
  conversationHelper,
  "budgetLabel:",
  "persisted project snapshots must not store budget labels",
);

const conversationsRoute = read("src/app/api/flux-ai/conversations/route.ts");
for (const snippet of [
  "getCurrentUser()",
  "hasPermission(user, \"fluxAi.view\")",
  "listFluxAIConversationsForUser(user)",
  "createFluxAIConversationForUser",
  '"Cache-Control": "no-store"',
]) {
  assertIncludes(conversationsRoute, snippet, `conversations route ${snippet}`);
}

const conversationDetailRoute = read(
  "src/app/api/flux-ai/conversations/[conversationId]/route.ts",
);
for (const snippet of [
  "getCurrentUser()",
  "hasPermission(user, \"fluxAi.view\")",
  "getFluxAIConversationDetailForUser",
  "deleteFluxAIConversationForUser",
  "FluxAIConversationAccessError",
]) {
  assertIncludes(conversationDetailRoute, snippet, `conversation detail route ${snippet}`);
}

const clearStateRoute = read(
  "src/app/api/flux-ai/conversations/[conversationId]/clear-state/route.ts",
);
for (const snippet of [
  "persistFluxAISystemEvent",
  "Flux AI draft state cleared.",
  "hasPermission(user, \"fluxAi.view\")",
]) {
  assertIncludes(clearStateRoute, snippet, `clear-state route ${snippet}`);
}

const chatRoute = read("src/app/api/flux-ai/chat/route.ts");
for (const snippet of [
  "conversationId?: unknown;",
  "persistFluxAIUserMessage",
  "persistFluxAIAssistantMessage",
  "FluxAIConversationAccessError",
  "conversationId: activeConversation.id",
  "conversationTitle: activeConversation.title",
  "savedMessages",
]) {
  assertIncludes(chatRoute, snippet, `chat persistence ${snippet}`);
}

const createRoute = read("src/app/api/flux-ai/create-project/route.ts");
for (const snippet of [
  "conversationId?: unknown;",
  "persistFluxAIAssistantMessage",
  "FluxAIConversationAccessError",
  "conversationId: requestedConversationId",
]) {
  assertIncludes(createRoute, snippet, `create persistence ${snippet}`);
}

const validateDraftRoute = read("src/app/api/flux-ai/validate-draft/route.ts");
for (const snippet of [
  "conversationId?: unknown;",
  "persistFluxAISystemEvent",
  "FluxAIConversationAccessError",
  "conversationId: requestedConversationId || undefined",
]) {
  assertIncludes(validateDraftRoute, snippet, `validate-draft persistence ${snippet}`);
}

const workspace = read("src/components/flux-ai/flux-ai-workspace.tsx");
for (const snippet of [
  "FluxAIConversationDetail",
  "FluxAIConversationSummary",
  "mapConversationMessagesToChatEntries",
  "getConversationIdFromUrl",
  "replaceConversationUrl",
  "/api/flux-ai/conversations",
  "/api/flux-ai/conversations/${encodeURIComponent(conversationId)}",
  "New Chat",
  "Current Chat",
  "conversationId: activeConversationId",
  "clear-state",
  "Loading Flux AI conversation...",
]) {
  assertIncludes(workspace, snippet, `workspace persistence ${snippet}`);
}
assert(
  /filter\(\(message\) => message\.role === "user" \|\| message\.role === "assistant"\)/.test(
    workspace,
  ),
  "System events must not render as chat bubbles.",
);

console.log("Flux AI conversation persistence regression checks passed.");
