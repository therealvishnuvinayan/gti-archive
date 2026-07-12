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

function extractArray(source, marker) {
  const start = source.indexOf(marker);

  assert(start >= 0, `${marker} block is missing.`);

  const arrayStart = source.indexOf("[", start);
  const arrayEnd = source.indexOf("]", arrayStart);

  assert(arrayStart >= 0 && arrayEnd >= 0, `${marker} array could not be parsed.`);

  return source.slice(arrayStart, arrayEnd + 1);
}

const definitions = read("src/lib/permissions/definitions.ts");
for (const snippet of [
  '"fluxAi.deleteOwnConversation"',
  'label: "Delete own Flux AI chats"',
  '"fluxAi.deleteOwnConversation": "fluxAi"',
]) {
  assertIncludes(definitions, snippet, `permission catalog ${snippet}`);
}

assert(
  /SUPER_ADMIN:\s*allPermissionKeys/.test(definitions),
  "SUPER_ADMIN must inherit all permission keys by default.",
);
assert(
  !extractArray(definitions, "ADMIN:").includes('"fluxAi.deleteOwnConversation"'),
  "ADMIN must not have fluxAi.deleteOwnConversation by default.",
);
assert(
  !extractArray(definitions, "COLLABORATOR:").includes(
    '"fluxAi.deleteOwnConversation"',
  ),
  "COLLABORATOR must not have fluxAi.deleteOwnConversation by default.",
);
assert(
  !extractArray(definitions, "const defaultCollaboratorWorkflowPermissions").includes(
    '"fluxAi.deleteOwnConversation"',
  ),
  "Collaborator type defaults must not include fluxAi.deleteOwnConversation.",
);

const conversationHelper = read("src/lib/flux-ai/conversations.ts");
for (const snippet of [
  "deleteFluxAIConversationForUser",
  "archiveFluxAIConversationForUser(input)",
  'status: "ACTIVE"',
  'status: "ARCHIVED"',
  "archivedAt: new Date()",
  "userId: input.user.id",
]) {
  assertIncludes(conversationHelper, snippet, `conversation helper ${snippet}`);
}

const conversationRoute = read(
  "src/app/api/flux-ai/conversations/[conversationId]/route.ts",
);
for (const snippet of [
  "export async function DELETE",
  "getCurrentUser()",
  'hasPermission(user, "fluxAi.view")',
  'hasPermission(user, "fluxAi.deleteOwnConversation")',
  "deleteFluxAIConversationForUser",
  "FluxAIConversationAccessError",
  "Flux AI conversation not found.",
  "You do not have permission to delete Flux AI chats.",
]) {
  assertIncludes(conversationRoute, snippet, `conversation delete route ${snippet}`);
}
assert(
  conversationRoute.indexOf('hasPermission(user, "fluxAi.view")') <
    conversationRoute.indexOf('hasPermission(user, "fluxAi.deleteOwnConversation")'),
  "DELETE route must check Flux AI access before delete permission.",
);
assert(
  conversationRoute.indexOf('hasPermission(user, "fluxAi.deleteOwnConversation")') <
    conversationRoute.lastIndexOf("deleteFluxAIConversationForUser"),
  "DELETE route must check delete permission before deleting.",
);

const workspace = read("src/components/flux-ai/flux-ai-workspace.tsx");
for (const snippet of [
  "ConfirmationDialog",
  "Delete this Flux AI chat?",
  "This will remove the conversation from your Flux AI history.",
  "Delete Chat",
  "conversationPendingDelete",
  "confirmDeleteConversation",
  'method: "DELETE"',
  "showSuccessToast(\"Flux AI chat deleted.\")",
  "replaceConversationUrl(null)",
  "setActiveConversationTitle(\"New Flux AI Chat\")",
  "Trash2",
]) {
  assertIncludes(workspace, snippet, `workspace delete UI ${snippet}`);
}

const helpCenter = read("src/lib/help-center.ts");
assertIncludes(
  helpCenter,
  "Users with the required Flux AI permission can delete their own Flux AI chats from conversation history.",
  "Help Center delete note",
);
assertIncludes(
  helpCenter,
  "Deleting a chat removes it from their history and does not affect projects created through Flux AI.",
  "Help Center project safety note",
);

console.log("Flux AI conversation delete regression checks passed.");
