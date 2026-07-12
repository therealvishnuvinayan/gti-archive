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
  "fluxAi: [",
  '"fluxAi.view"',
  '"fluxAi.deleteOwnConversation"',
  'id: "fluxAi"',
  'title: "Flux AI"',
  'label: "View Flux AI"',
  'label: "Delete own Flux AI chats"',
  "Allows access to the Flux AI assistant page and Flux AI chat/project assistant APIs.",
  "Allows users with Flux AI access to delete their own Flux AI conversation history.",
  '"fluxAi.view": "fluxAi"',
  '"fluxAi.deleteOwnConversation": "fluxAi"',
]) {
  assertIncludes(definitions, snippet, `permission definition ${snippet}`);
}

const adminDefaults = extractArray(definitions, "ADMIN:");
const collaboratorDefaults = extractArray(definitions, "COLLABORATOR:");
const collaboratorTypeDefaults = extractArray(
  definitions,
  "const defaultCollaboratorWorkflowPermissions",
);

assert(
  /SUPER_ADMIN:\s*allPermissionKeys/.test(definitions),
  "SUPER_ADMIN must inherit all permission keys by default.",
);
assert(
  !adminDefaults.includes('"fluxAi.view"'),
  "ADMIN must not have fluxAi.view by default.",
);
assert(
  !adminDefaults.includes('"fluxAi.deleteOwnConversation"'),
  "ADMIN must not have fluxAi.deleteOwnConversation by default.",
);
assert(
  !collaboratorDefaults.includes('"fluxAi.view"'),
  "COLLABORATOR must not have fluxAi.view by default.",
);
assert(
  !collaboratorDefaults.includes('"fluxAi.deleteOwnConversation"'),
  "COLLABORATOR must not have fluxAi.deleteOwnConversation by default.",
);
assert(
  !collaboratorTypeDefaults.includes('"fluxAi.view"'),
  "Collaborator type defaults must not include fluxAi.view.",
);
assert(
  !collaboratorTypeDefaults.includes('"fluxAi.deleteOwnConversation"'),
  "Collaborator type defaults must not include fluxAi.deleteOwnConversation.",
);

const resolver = read("src/lib/permissions/resolver.ts");
assertIncludes(
  resolver,
  'fluxAi: hasPermission(user, "fluxAi.view")',
  "sidebar Flux AI permission guard",
);

const fluxAiPage = read("src/app/(dashboard)/flux-ai/page.tsx");
for (const snippet of [
  "requireUser()",
  "hasPermission(user, \"fluxAi.view\")",
  "redirect(getRestrictedAreaFallbackRoute(user))",
]) {
  assertIncludes(fluxAiPage, snippet, `Flux AI page guard ${snippet}`);
}

for (const routePath of [
  "src/app/api/flux-ai/chat/route.ts",
  "src/app/api/flux-ai/create-project/route.ts",
  "src/app/api/flux-ai/validate-draft/route.ts",
  "src/app/api/flux-ai/conversations/route.ts",
  "src/app/api/flux-ai/conversations/[conversationId]/route.ts",
  "src/app/api/flux-ai/conversations/[conversationId]/clear-state/route.ts",
]) {
  const route = read(routePath);

  assertIncludes(
    route,
    'hasPermission(user, "fluxAi.view")',
    `${routePath} fluxAi.view guard`,
  );
  assertIncludes(
    route,
    "You do not have permission to use Flux AI.",
    `${routePath} forbidden message`,
  );
}

const chatRoute = read("src/app/api/flux-ai/chat/route.ts");
assert(
  chatRoute.indexOf('hasPermission(user, "fluxAi.view")') <
    chatRoute.indexOf("isOpenAIConfigured()"),
  "Flux AI chat must check fluxAi.view before OpenAI configuration/calls.",
);

const createRoute = read("src/app/api/flux-ai/create-project/route.ts");
assert(
  createRoute.indexOf('hasPermission(user, "fluxAi.view")') <
    createRoute.indexOf('hasPermission(user, "project.create")'),
  "Flux AI create route must check fluxAi.view before project.create.",
);

const helpCenter = read("src/lib/help-center.ts");
for (const snippet of [
  'id: "flux-ai"',
  'title: "Flux AI"',
  "Flux AI is an AI assistant inside GTI Archive",
  "Search accessible projects",
  "It cannot bypass permissions.",
  "It cannot access Archives for CLIENT_OF_GTI accounts.",
  "It cannot create a project without confirmation.",
  "By default, only SUPER_ADMIN users can access Flux AI.",
  "Users with the required Flux AI permission can delete their own Flux AI chats from conversation history.",
  "project draft",
  "create project with ai",
]) {
  assertIncludes(helpCenter, snippet, `Help Center Flux AI content ${snippet}`);
}

console.log("Flux AI permission/help regression checks passed.");
