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

const schema = read("prisma/schema.prisma");
assert(!schema.includes("model ArtworkCaption"), "Phase 3 must not add ArtworkCaption.");
assertIncludes(schema, "model ComparisonComment", "ComparisonComment model");
assertIncludes(schema, "captionAttachmentId String?", "caption target field");
assertIncludes(schema, "isCaption           Boolean", "caption discriminator field");
assertIncludes(schema, "comparisonOpacity   Float?", "comparison opacity field");
assertIncludes(
  schema,
  '@relation("ComparisonCommentCaptionAttachment"',
  "caption attachment relation",
);

const migration = read(
  "prisma/migrations/20260705000300_add_comparison_comment_caption_fields/migration.sql",
);
for (const snippet of [
  'ADD COLUMN "captionAttachmentId"',
  'ADD COLUMN "isCaption"',
  'ADD COLUMN "comparisonOpacity"',
  'ComparisonComment_captionAttachmentId_fkey',
]) {
  assertIncludes(migration, snippet, `caption migration ${snippet}`);
}

const comparison = read("src/lib/comparison.ts");
for (const snippet of [
  "createSubmissionCaption",
  "getSubmissionCaptionsForAttachment",
  "assertCanCreateSubmissionCaption",
  "assertStageChatWriteAccess(user",
  'permissionKey: "compare.createComment"',
  "canAddProjectCaptions(user, project)",
  "getLatestFormalSubmissionAttachmentId",
  "This submission has been superseded. Existing captions are read-only.",
  'mimeType.toLowerCase() === "image/png"',
  "isAllowedStageSubmissionFile",
  "captionAttachmentId: context.attachment.id",
  "captionAttachmentId: captionTarget.attachment.id",
  "isCaption: true",
]) {
  assertIncludes(comparison, snippet, `comparison caption guard ${snippet}`);
}
assert(
  !/ArtworkCaption|artwork-captions/.test(comparison),
  "Comparison service must not use a separate artwork caption module.",
);

const resolver = read("src/lib/permissions/resolver.ts");
assertIncludes(
  resolver,
  'case "compare.createComment":\n      return canAddProjectCaptions(user, project);',
  "compare authoring must use canAddCaptions",
);

const apiRoute = read("src/app/api/project-assets/[attachmentId]/captions/route.ts");
for (const snippet of [
  "requireUser()",
  "getSubmissionCaptionsForAttachment",
  "createSubmissionCaption",
  "revalidateTag(PROJECTS_CACHE_TAG",
]) {
  assertIncludes(apiRoute, snippet, `caption API ${snippet}`);
}

const projectHistory = read("src/lib/project-history.ts");
for (const snippet of [
  'kind: "caption"',
  "added a caption on",
  "captionAttachment",
  "comparison.isCaption",
]) {
  assertIncludes(projectHistory, snippet, `stage history caption ${snippet}`);
}

const comparisonUtils = read("src/lib/comparison-utils.ts");
assertIncludes(
  comparisonUtils,
  "Formal stage submissions must be PNG. Only valid PNG stage submissions can be compared or captioned.",
  "required caption/comparison help text",
);
assertIncludes(
  comparisonUtils,
  "isCaptionableStageSubmissionAttachment",
  "captionable submission helper",
);

const captionDialog = read("src/components/projects/submission-caption-dialog.tsx");
for (const snippet of [
  "SubmissionCaptionDialog",
  "/api/project-assets/${attachment.id}/captions",
  "stageSubmissionCaptionHelpText",
  "No captions yet.",
]) {
  assertIncludes(captionDialog, snippet, `caption dialog ${snippet}`);
}

const chatWorkspace = read("src/components/projects/project-chat-workspace.tsx");
for (const snippet of [
  "SubmissionCaptionDialog",
  "showCaptionAction={canAddCaptions}",
  'message.kind === "caption"',
  "View Caption",
]) {
  assertIncludes(chatWorkspace, snippet, `chat caption UI ${snippet}`);
}

const compareWorkspace = read("src/components/projects/project-compare-workspace.tsx");
for (const snippet of [
  "SubmissionCaptionDialog",
  "canAddCaptions={canAddCaptions}",
  "isCaptionableStageSubmissionAttachment",
  "stageSubmissionCaptionHelpText",
  "Save Caption",
]) {
  assertIncludes(compareWorkspace, snippet, `compare caption UI ${snippet}`);
}

const chatPage = read("src/app/(dashboard)/projects/[slug]/chat/page.tsx");
const comparePage = read("src/app/(dashboard)/projects/[slug]/compare/page.tsx");
for (const source of [chatPage, comparePage]) {
  assertIncludes(source, "canAddProjectCaptions", "server-side caption permission prop");
  assertIncludes(source, "canAddCaptions:", "project collaborator caption grant in context");
}

console.log("Phase 3 caption regression checks passed.");
