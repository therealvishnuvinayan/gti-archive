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

const events = read("src/lib/realtime/events.ts");
assertIncludes(
  events,
  'timelineUpdated: "stage-chat.timeline.updated"',
  "Stage Chat timeline realtime event",
);
assertIncludes(
  events,
  "StageChatRealtimeTimelineUpdatedPayload",
  "Stage Chat timeline payload type",
);

const realtimeServer = read("src/lib/realtime/server.ts");
for (const snippet of [
  "publishStageChatTimelineUpdated",
  "publishStageChatTimelineUpdatedAfterResponse",
  "eventType: StageChatRealtimeTimelineUpdatedPayload",
  "changedEntityId: input.changedEntityId ?? null",
]) {
  assertIncludes(realtimeServer, snippet, `Realtime server ${snippet}`);
}

const realtimeHook = read("src/hooks/use-stage-chat-realtime.ts");
for (const snippet of [
  "onTimelineUpdated",
  "isTimelineUpdatedPayload",
  "handleTimelineUpdated",
  "STAGE_CHAT_REALTIME_EVENTS.timelineUpdated",
  "unsubscribe timeline.updated",
]) {
  assertIncludes(realtimeHook, snippet, `Realtime hook ${snippet}`);
}

const workspace = read("src/components/projects/project-chat-workspace.tsx");
for (const snippet of [
  "handleRealtimeTimelineUpdated",
  "void reconcileStageChat();",
  "onTimelineUpdated: handleRealtimeTimelineUpdated",
  "mergeServerChatEntry(entry, { countAsNew: false })",
]) {
  assertIncludes(workspace, snippet, `Project chat workspace ${snippet}`);
}

const history = read("src/lib/project-history.ts");
const updateFunctionMatch = history.match(
  /export async function getStageChatUpdatesForUser[\s\S]*?export async function getProjectStageHistory/,
);
assert(updateFunctionMatch, "Stage Chat updates function was not found.");
const updateFunction = updateFunctionMatch[0];
for (const snippet of [
  "prisma.projectComment.findMany",
  "prisma.projectRevision.findMany",
  "prisma.comparisonComment.findMany",
  "mapCommentEntry",
  "mapRevisionEntry",
  "mapComparisonEntry",
  "getProjectVisibilityPauseWindows",
  "filterHistoryEntriesOutsidePauseWindows",
]) {
  assertIncludes(updateFunction, snippet, `Stage Chat updates source ${snippet}`);
}

const actions = read("src/app/(dashboard)/projects/actions.ts");
for (const snippet of [
  "publishStageChatTimelineInvalidation",
  "publishProjectStageTimelineInvalidation",
  'eventType: "revision_created"',
  'eventType: "revision_reviewed"',
  'eventType: "stage_status_changed"',
  'eventType: "brief_accepted"',
  'eventType: "invoice_requested"',
  'eventType: "comparison_created"',
  'eventType: "participant_access_changed"',
  'eventType: "completion_updated"',
]) {
  assertIncludes(actions, snippet, `Project action timeline event ${snippet}`);
}

const textCommentRoute = read(
  "src/app/api/projects/[projectId]/stages/[stageId]/chat/comments/route.ts",
);
assertIncludes(
  textCommentRoute,
  'eventType: "message_created"',
  "Text comment route timeline event",
);

const uploadFinalizeRoute = read(
  "src/app/api/project-assets/chat-comment-upload/finalize/route.ts",
);
assertIncludes(
  uploadFinalizeRoute,
  'eventType: "attachment_uploaded"',
  "Chat attachment finalize timeline event",
);

const uploadCompleteRoute = read("src/app/api/project-assets/complete/route.ts");
for (const snippet of ['eventType: "invoice_uploaded"', 'eventType: "attachment_uploaded"']) {
  assertIncludes(uploadCompleteRoute, snippet, `Upload complete route ${snippet}`);
}

const captionsRoute = read("src/app/api/project-assets/[attachmentId]/captions/route.ts");
assertIncludes(
  captionsRoute,
  'eventType: "caption_created"',
  "Submission caption route timeline event",
);

console.log("Stage Chat realtime timeline checks passed.");
