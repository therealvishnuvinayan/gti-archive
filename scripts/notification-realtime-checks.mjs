import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [center, service, events, server, ablyServer, client, tokenRoute, layout] =
  await Promise.all([
    readFile("src/components/notifications/notification-center.tsx", "utf8"),
    readFile("src/lib/notification-center/service.ts", "utf8"),
    readFile("src/lib/realtime/events.ts", "utf8"),
    readFile("src/lib/realtime/server.ts", "utf8"),
    readFile("src/lib/realtime/ably-server.ts", "utf8"),
    readFile("src/lib/realtime/client.ts", "utf8"),
    readFile("src/app/api/realtime/ably/token/route.ts", "utf8"),
    readFile("src/app/(dashboard)/layout.tsx", "utf8"),
  ]);

assert(
  events.includes("private:user:${userId}:notifications") &&
    events.includes('changed: "notification.changed"'),
  "Notifications must use a private per-user realtime channel.",
);
assert(
  ablyServer.includes('[getNotificationChannelName(input.userId)]: ["subscribe"]') &&
    !ablyServer.includes('[getNotificationChannelName(input.userId)]: ["publish"]'),
  "Browser notification tokens must be subscribe-only.",
);
assert(
  tokenRoute.includes('scope === "notifications"') &&
    tokenRoute.includes('hasPermission(user, "notification.view")') &&
    tokenRoute.includes("userId: user.id"),
  "Notification realtime access must be authenticated, permission checked, and bound to the current user.",
);
assert(
  client.includes('scope=notifications') &&
    center.includes("NOTIFICATION_REALTIME_EVENTS.changed") &&
    center.includes("refreshRecent()"),
  "The notification center must subscribe and refresh immediately when a change event arrives.",
);
assert(
  service.includes("publishNotificationChanges") &&
    service.includes('reason: "created"') &&
    service.includes('reason: "read-state-updated"'),
  "Notification creation and read-state updates must publish realtime invalidations.",
);
assert(
  server.includes("publishAblyNotificationChanged") &&
    center.includes("const NOTIFICATION_REFRESH_INTERVAL_MS = 30_000"),
  "Realtime delivery must retain a bounded polling fallback.",
);
assert(
  layout.includes("id: user.id"),
  "The authenticated dashboard user id must scope the private subscription.",
);

console.log("Notification realtime delivery and security checks passed.");
