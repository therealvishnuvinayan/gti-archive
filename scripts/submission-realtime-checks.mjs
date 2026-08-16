import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [actions, workspace, projectGuard, projectHook, realtimeServer, events] =
  await Promise.all([
    readFile("src/app/(dashboard)/projects/actions.ts", "utf8"),
    readFile("src/components/projects/project-chat-workspace.tsx", "utf8"),
    readFile("src/components/projects/project-access-realtime-guard.tsx", "utf8"),
    readFile("src/hooks/use-project-access-realtime.ts", "utf8"),
    readFile("src/lib/realtime/server.ts", "utf8"),
    readFile("src/lib/realtime/events.ts", "utf8"),
  ]);

assert(
  actions.includes('eventType: "revision_created"') &&
    actions.includes("publishStageChatTimelineInvalidation"),
  "Submitting work must broadcast a stage timeline invalidation.",
);
assert(
  actions.includes('revalidateTag(PROJECTS_CACHE_TAG, { expire: 0 })'),
  "Submission mutations must expire project history immediately instead of serving one stale refresh.",
);
assert(
  workspace.includes("handleRealtimeTimelineUpdated") &&
    workspace.includes("void reconcileStageChat();") &&
    workspace.includes("router.refresh();"),
  "The open concept workspace must reconcile entries and refresh status on timeline changes.",
);
assert(
  actions.includes("publishProjectActivityUpdatedAfterResponse(input)") &&
    realtimeServer.includes("publishProjectActivityUpdatedAfterResponse") &&
    events.includes('activityUpdated: "project.activity.updated"'),
  "Submission changes must broadcast a project-scoped activity invalidation.",
);
assert(
  projectHook.includes("PROJECT_ACCESS_REALTIME_EVENTS.activityUpdated") &&
    projectHook.includes("onActivityUpdatedRef.current") &&
    projectHook.includes('client.connection.on("connected"') &&
    projectHook.includes("closeProjectAccessRealtimeClient(client)") &&
    projectHook.includes('runProjectAccessCleanup("client close"') &&
    projectHook.includes('.catch((error) => {') &&
    projectGuard.includes("handleActivityUpdated") &&
    projectGuard.includes("router.refresh()"),
  "Every open authorized project page must refresh when its project activity changes.",
);

console.log("Submitted-work realtime visibility checks passed.");
