## 1. Executive Summary

Stage Chat does not currently have live cross-user updates. It renders initial history from the server, lets the current sender see optimistic and confirmed local messages immediately, and refreshes selected flows with `router.refresh()`. Other users do not see new or deleted messages until their route is refreshed, they navigate, or future code explicitly fetches the message API.

The existing notification system is polling, not true realtime push. The dashboard-wide notification provider polls `/api/notifications/recent` every 120 seconds when the tab is visible, refreshes on browser focus if the cached result is older than 60 seconds, and uses `sessionStorage` for a 30 second recent-notifications cache. The full notifications page separately polls `/api/notifications` every 30 seconds while visible. There is no `EventSource`, SSE, WebSocket, Socket.IO, Pusher, Ably, Supabase Realtime, or BroadcastChannel implementation in the current app.

Best immediate Stage Chat architecture: active-stage incremental polling with a lightweight API, not the existing notification polling interval as-is. Poll every 2-5 seconds only while a Stage Chat tab is visible and only for the selected project/stage. The endpoint should return only changed messages since a cursor/watermark, including soft-delete updates, and the client should merge by server comment id to avoid duplicate optimistic messages. This is Vercel-safe, keeps Neon/Postgres as the source of truth, introduces no new vendor, and fits the current codebase.

Best future true realtime architecture: a managed realtime provider, preferably Ably or Pusher Channels, if GTI needs sub-second chat delivery, typing indicators, presence, or read receipts at scale. Vercel's own WebSocket guidance points to managed providers for realtime integrations with Vercel Functions, and Socket.IO itself expects a long-lived server-side runtime. Socket.IO should be avoided inside the Next.js/Vercel app unless GTI is willing to operate a separate Node WebSocket service.

Sources checked:
- Local notification provider: `src/components/notifications/notification-center.tsx`
- Local notifications page: `src/components/notifications/notifications-page-workspace.tsx`
- Local notification API/service: `src/app/api/notifications/*`, `src/lib/notification-center/service.ts`
- Local Stage Chat page/workspace/API/service: `src/app/(dashboard)/projects/[slug]/chat/page.tsx`, `src/components/projects/project-chat-workspace.tsx`, `src/app/api/projects/[projectId]/stages/[stageId]/chat/*`, `src/lib/project-history.ts`
- Vercel WebSocket guidance: https://vercel.com/kb/guide/do-vercel-serverless-functions-support-websocket-connections
- Vercel streaming functions: https://vercel.com/docs/functions/streaming-functions
- Vercel function duration: https://vercel.com/docs/functions/configuring-functions/duration
- Next.js Route Handler streaming: https://nextjs.org/docs/app/api-reference/file-conventions/route#streaming
- Socket.IO docs: https://socket.io/docs/v4/
- Ably Next.js/token auth docs: https://ably.com/docs/getting-started/nextjs, https://ably.com/docs/auth/token
- Pusher private channel auth docs: https://pusher.com/docs/channels/server_api/authorizing-users/
- Supabase Realtime docs: https://supabase.com/docs/guides/realtime, https://supabase.com/docs/guides/realtime/authorization
- Firebase realtime docs: https://firebase.google.com/docs/firestore/query-data/listen
- PubNub access/presence docs: https://www.pubnub.com/docs/general/security/access-control, https://www.pubnub.com/docs/general/presence/overview

## 2. Current Notification Update Mechanism

Current behavior is short/medium polling plus focus refresh, not push.

Notification center provider:
- File: `src/components/notifications/notification-center.tsx`
- The provider defines `NOTIFICATION_REFRESH_INTERVAL_MS = 120_000`, `NOTIFICATION_FOCUS_REFRESH_STALE_MS = 60_000`, and `NOTIFICATION_RECENT_CACHE_TTL_MS = 30_000`.
- It fetches `/api/notifications/recent` with `cache: "no-store"`.
- It stores/reuses recent notifications in `window.sessionStorage` under `gti:recent-notifications`.
- On mount, it reads session cache and then schedules an initial API refresh after 500 ms without cache or 1,000 ms with cache.
- It starts `window.setInterval(...)` at 120 seconds. The interval skips refresh when `document.visibilityState === "hidden"`.
- It listens for browser `focus` and refreshes only if the last refresh is at least 60 seconds stale.
- It deduplicates overlapping refresh calls with `refreshPromiseRef`.
- It updates local state optimistically for read/unread and mark-all-read, then reconciles unread count from the mutation response.

Notification dropdown:
- File: `src/components/notifications/notification-dropdown.tsx`
- Opening the dropdown calls `refreshRecent()`.
- The dropdown does not create its own interval. It consumes the provider state.

Notifications page:
- File: `src/components/notifications/notifications-page-workspace.tsx`
- It fetches `/api/notifications?page=...&pageSize=...&status=...&type=...&query=...` with `cache: "no-store"`.
- It loads immediately on page/filter/search/page-size changes.
- It starts a 30 second interval while the page is mounted and visible.
- It refreshes on browser `focus` without a stale-time guard.

Sidebar/dashboard-count:
- File: `src/components/layout/sidebar.tsx`
- Project badge count is not realtime. If the count is not passed from the server, the sidebar reads a 30 second `sessionStorage` cache (`gti:sidebar-project-badge-count`) or fetches `/api/projects/dashboard-count` once after 500 ms.
- It does not poll project badge counts.
- The notifications sidebar badge uses `unreadCount` from `NotificationCenterProvider`.

Notification API routes:
- `GET /api/notifications/recent`
  - File: `src/app/api/notifications/recent/route.ts`
  - Dynamic route, `revalidate = 0`, returns `Cache-Control: no-store`.
  - Authenticates with `getCurrentUser()`.
  - Requires `notification.view`.
  - Calls `getRecentNotificationsForUser(user.id)`.
- `GET /api/notifications/unread-count`
  - Dynamic, no-store.
  - Requires `notification.view`.
  - Calls `getUnreadNotificationCount(user.id)`.
  - I did not find a client using this endpoint in the audited code. The provider uses `/recent`, which already includes `unreadCount`.
- `GET /api/notifications`
  - Dynamic, no-store.
  - Requires `notification.view`.
  - Supports `page`, `pageSize`, `status`, `type`, and `query`.
- `POST /api/notifications/[notificationId]/read`
- `POST /api/notifications/[notificationId]/unread`
- `POST /api/notifications/read-all`
  - Require `notification.markRead`.
  - Mutate only the current user's notifications.

Notification DB/API load:
- `/api/notifications/recent` runs a Prisma transaction with:
  - one `notification.findMany` for the latest 5 items by default, clamped to max 20
  - one unread `notification.count`
- `/api/notifications` runs a larger transaction:
  - one paged `notification.findMany`
  - one count for the filtered result
  - five additional counts for all/unread/read/mentions/workflow tab summaries
- Payload sizes are small for `/recent`: 5 `NotificationRecord` objects plus one unread count. Each record contains id, title, description, timestamp label, type/context fields, booleans, visual kind, and target href. The full page payload is larger because it includes page rows, unread count, tab count summary, page metadata, and total counts.

Answers:
- True realtime push? No.
- Short polling? Yes, but not extremely short. Provider: 120 seconds. Notifications page: 30 seconds.
- Updates only when dropdown opens? No. Dropdown opening forces an additional provider refresh, but provider polling/focus refresh also runs.
- Browser focus/visibility? Yes. Provider skips interval refresh when hidden and refreshes on focus only when stale by 60 seconds. Page poller skips interval refresh when hidden and always refreshes on focus.
- Cross-tab updates? No explicit cross-tab coordination. Each tab has its own React state and `sessionStorage`. `sessionStorage` is per tab, not shared like `localStorage`.
- Requires refresh? No manual refresh is required for notification polling, but latency can be up to 120 seconds globally or 30 seconds on the notifications page.
- Cache/session cache? Yes. Recent notifications and project badge count use 30 second `sessionStorage` caches. Network requests themselves use `cache: "no-store"` and routes are dynamic.
- Hits DB every interval? Yes, every visible tab interval/focus refresh that reaches the route hits the DB through Prisma. There is no shared browser tab leader, BroadcastChannel, or server push fanout.
- Performance issues? Current intervals are conservative. The page endpoint is heavier than `/recent` because it performs multiple counts every 30 seconds per visible notifications page tab. The provider endpoint is lightweight enough for a notification bell but too slow for active chat.

## 3. Current Stage Chat Update Mechanism

Initial message load:
- File: `src/app/(dashboard)/projects/[slug]/chat/page.tsx`
- The page requires a user, loads the project shell, checks `chat.view`, validates the stage query param, then renders `ProjectChatWorkspace`.
- It calls `getProjectStageChatMessages(user, slug, stage, { projectAccessRecord })`.
- This is server-rendered data passed into the client workspace as `history`.

Message history query:
- File: `src/lib/project-history.ts`
- `getProjectStageChatMessages(...)` checks project access and required permission (`chat.view` by default), resolves the active stage, clamps the limit (default 30, max 50), and decodes an older-message cursor.
- Existing cursor semantics are older-only. `buildStageChatCreatedAtWhere(cursor)` produces `{ lt: cursor.createdAt }`.
- It queries latest comments by `projectId`, `stageId`, and optional `createdAt < cursor`, ordered by `createdAt desc, id desc`, with `take = limit + 1`.
- It may also query latest revision and comparison activity, then optionally revision history and comparison comments.
- It applies collaborator visibility pause windows before mapping entries.
- It maps deleted comments to a placeholder body, clears mentions, clears attachments, and includes `deletedAt`/`deletedByUserId`.
- It returns entries in chronological order, plus `nextCursor`, `hasMore`, `activeStageId`, `latestRevisionId`, and `revisionCount`.

Current message API:
- `GET /api/projects/[projectId]/stages/[stageId]/chat/messages`
  - File: `src/app/api/projects/[projectId]/stages/[stageId]/chat/messages/route.ts`
  - Dynamic, `revalidate = 0`, no-store response.
  - Requires authenticated user.
  - Accepts `cursor` and `limit`.
  - Calls `getProjectStageChatMessages`.
  - This endpoint supports loading earlier messages only. It does not support `since`, `updatedAfter`, or "latest delta" semantics.

Current text-send API:
- `POST /api/projects/[projectId]/stages/[stageId]/chat/comments`
  - File: `src/app/api/projects/[projectId]/stages/[stageId]/chat/comments/route.ts`
  - Dynamic, `revalidate = 0`, no-store response.
  - Requires authenticated user.
  - Calls `createStageTextCommentFast`.
  - Schedules comment-added and mention notifications after response.
  - Explicit timing logs say message refetch and revalidate/router refresh are skipped.
  - Returns only `{ commentId, revisionId, createdAt, mentionedUserIds }`, not a fully mapped `ProjectChatEntry`.

Current attachment-backed comment flow:
- File: `src/components/projects/project-chat-workspace.tsx`
- The client creates an optimistic comment, then uses:
  - `POST /api/project-assets/chat-comment-upload`
  - direct S3 upload(s)
  - `POST /api/project-assets/chat-comment-upload/complete`
  - `POST /api/project-assets/chat-comment-upload/finalize`
- Finalize schedules notification tasks and revalidates the projects cache tag after response.
- The sender gets a local confirmed comment with local attachment metadata after finalize. Other users still need refresh/fetch to see it.

Current client state/merge behavior:
- File: `src/components/projects/project-chat-workspace.tsx`
- `loadedHistoryEntries` starts from `history.entries`.
- When `history` props change after a route refresh, the client resets `loadedHistoryEntries`, `olderMessagesCursor`, `hasEarlierMessages`, and `stageRevisionCount`.
- It keeps separate arrays for `optimisticComments` and `confirmedComments`.
- It builds `serverMessageIds` from loaded server entries.
- It hides optimistic/confirmed local entries once their `serverEntryId` appears in loaded server messages, except optimistic entries with pending/uploading attachments remain visible.
- It applies `deletedMessageOverrides` locally by server comment id.
- This is a useful merge foundation for future incremental updates, but there is no current background message fetch.

Load earlier behavior:
- The "Load earlier messages" button calls `loadEarlierMessages()`.
- It fetches `/api/projects/{projectId}/stages/{activeStageId}/chat/messages?cursor={olderMessagesCursor}&limit=30`.
- It prepends non-duplicate older entries to `loadedHistoryEntries`.

Delete behavior:
- Client deletion:
  - Only current user's non-deleted, non-optimistic comment messages with a server comment id and live `canDeleteUntil` can be deleted.
  - The client immediately writes a local deleted placeholder into `deletedMessageOverrides`.
  - It calls `deleteStageCommentAction`.
  - On success it updates the local override, closes the dialog, shows a toast, and calls `router.refresh()`.
  - On failure it removes the override.
- Server deletion:
  - `deleteStageCommentAction` calls `deleteStageComment`.
  - `deleteStageComment` requires project access and `chat.view`, ensures the comment belongs to the project/stage, ensures the author is the current user, rejects already-deleted/system/non-comment-attachment messages, and enforces the 5 minute delete window.
  - It soft-deletes by setting `deletedAt` and `deletedByUserId`.
  - It does not delete the DB row.

Answers:
- How initial messages load: server render through `getProjectStageChatMessages`, then passed as client state.
- How new text send works: optimistic client entry, `POST /chat/comments`, local confirmed entry with `serverEntryId`, no route refresh.
- How delete works: local deleted override, server action soft delete, route refresh on success.
- Can another user see a new message without refresh? No. There is no Stage Chat poll/SSE/WebSocket. Another user only sees it after navigation, route refresh, manual reload, or future explicit fetch.
- Current polling exists? No Stage Chat message polling exists. The only `setInterval` in `ProjectChatWorkspace` is a 15 second local timer for delete-menu expiry.
- Do message APIs support cursor/since? They support older cursor pagination only. No `since`, `updatedAfter`, `deletedSince`, or event sequence endpoint exists.
- Can deleted messages be fetched incrementally? Not with existing API semantics. Deleted comments are represented correctly when a full/latest/older history fetch includes them, but the only cursor uses `createdAt < cursor`, while deletion changes `updatedAt` and `deletedAt` on an existing row. A proper incremental API should query `ProjectComment.updatedAt > watermark` for changed comments.

## 4. Options Compared

| Option | Realtime quality | Vercel fit | Complexity | Cost | DB load | Recommended? |
| --- | --- | --- | --- | --- | --- | --- |
| A. Active-stage incremental polling | Near-realtime, usually 2-5s latency | Excellent | Low-medium | No new vendor | Predictable if scoped and incremental | Yes for Phase 1 |
| B. SSE / EventSource route | Push-like one-way receive, low latency | Possible but operationally sensitive | Medium | No new vendor, but consumes long-running function time | Depends on implementation; often still needs DB polling or pub/sub behind stream | Not first choice |
| C. Socket.IO / custom WebSocket server | True bidirectional realtime | Poor inside Vercel Functions; acceptable only as separate service | High | Hosting/ops cost | Low DB read load if event-driven | No for current project deployment |
| D. Managed realtime provider | True realtime, strong presence/typing fit | Excellent | Medium | Vendor cost | Low DB read load if broadcasting ids/events | Yes when true realtime/nice-to-have features are required |
| E. Database realtime / LISTEN-NOTIFY / Supabase Realtime | True-ish event stream if platform supports it | Mixed | Medium-high | Depends on DB/provider | Low polling load, but connection complexity | Not recommended with current Neon/Prisma/Vercel stack |

Option A - Reuse notification polling pattern:
- Reuse the pattern, not the exact implementation.
- Notification provider polling every 120 seconds is much too slow for active chat.
- A Stage Chat-specific poller can run every 2-5 seconds while:
  - the Stage Chat route is mounted
  - the tab is visible
  - the selected stage is active
  - the user has not gone idle for a long period
- It should call a new lightweight endpoint such as:
  - `GET /api/projects/[projectId]/stages/[stageId]/chat/updates?after=<watermark>`
  - or `GET /api/projects/[projectId]/stages/[stageId]/chat/messages/since?updatedAfter=<timestamp>&cursor=<id>`
- The endpoint should return only:
  - new comments after last seen `createdAt/id`
  - changed/deleted comments after last seen `updatedAt/id`
  - optional latest revision/comparison events later, if needed
  - a new server watermark
- It should not reload the full project/stage history.
- This is the lowest-risk Phase 1 because it uses the existing auth, permission, DB, and mapped chat-entry model.

Option B - SSE / EventSource:
- Browser-native `EventSource` gives one-way server-to-browser delivery, which is enough for receiving messages/deletes. Sending still uses POST APIs.
- Next.js Route Handlers can return streams using Web APIs, and Vercel Functions support streaming responses. Vercel also documents `text/event-stream` streaming examples and configurable function durations.
- The main concern is operational: each open Stage Chat tab holds an HTTP connection to a function for a long time. With many users/tabs, this increases function duration/concurrency/cost.
- SSE still needs a source of events. If the SSE route simply polls the DB internally, it moves polling from the browser to server functions and may be worse on Vercel. If backed by Redis/pub-sub or a managed event source, it becomes more complex.
- SSE is viable only after confirming Vercel plan limits and expected concurrency. It is not the simplest first move for GTI.

Option C - Socket.IO / custom WebSocket server:
- Socket.IO is a mature library for low-latency bidirectional event communication and includes transports, fallback, reconnection, acknowledgements, and rooms.
- Socket.IO is not plain WebSocket. Its docs state it adds protocol metadata and requires matching Socket.IO clients/servers.
- It expects a long-lived Socket.IO server process. Vercel's WebSocket guidance for Vercel Functions points developers to managed realtime providers such as Ably, Pusher, PubNub, Firebase, and Supabase.
- Running Socket.IO inside Next.js route handlers on Vercel is not the right fit. It is appropriate only if GTI deploys a separate Node service on a platform designed for persistent WebSocket servers.

Option D - Managed realtime provider:
- Ably:
  - Strong fit for Vercel/Next.js. Ably documents a Next.js integration, publish/subscribe, presence, history, and production token auth.
  - Token/JWT capability scoping maps well to project/stage channels.
  - Good fit for future typing, presence, and read receipts.
- Pusher Channels:
  - Strong fit for private/presence channels.
  - Private/presence subscription requires a server authorization endpoint that checks the current user and returns auth or 403.
  - Good fit for chat broadcasting and typing/presence with familiar channel semantics.
- Supabase Realtime:
  - Excellent if the app is already on Supabase Postgres/Auth/RLS.
  - Provides Broadcast, Presence, and Postgres Changes.
  - Realtime Authorization uses RLS policies on `realtime.messages`, and Postgres Changes respect RLS for records clients can read.
  - Less natural for GTI today because this project uses Prisma/Neon-style Postgres and custom auth/permissions, not Supabase Auth/RLS as its primary authorization layer.
- Firebase Realtime Database / Firestore:
  - Strong realtime document/list listeners and good client SDKs.
  - Poor fit as a primary Stage Chat store unless GTI duplicates chat data into Firebase or migrates chat storage away from Postgres. That violates the current desire to keep DB as source of truth.
- PubNub:
  - Strong mature pub/sub, access control, and presence.
  - More generic messaging infrastructure than the minimum GTI needs.
  - Viable if GTI expects broad realtime features beyond chat/notifications, but likely overkill for Phase 1.

Option E - Database realtime:
- PostgreSQL `LISTEN/NOTIFY` is useful between long-lived server processes, but serverless functions are a poor place to keep durable DB listener sessions.
- Neon/Postgres remains a good source of truth, but Neon does not by itself give browser-authorized project/stage realtime channels for app events in this codebase.
- Supabase Realtime is realistic if GTI adopts Supabase's realtime stack and maps authorization carefully, but this is effectively choosing a managed provider plus auth/RLS integration, not a small local change.

## 5. Security Considerations

Polling recommendation:
- Authorization stays server-side in the Next.js route handler.
- Every update request should call `getCurrentUser()`.
- Every update request should verify:
  - project exists
  - user has `project.view`
  - user has `chat.view`
  - requested `stageId` belongs to `projectId`
  - collaborator visibility pause windows are applied
- The client should never send participant lists as authority.
- The route should return only mapped `ProjectChatEntry`-style records, not raw Prisma rows.
- Deleted message payload should not include original body, mentions, or attachments. The existing mapper already uses `This message was deleted`, empty mentions, and empty attachments.
- DB remains source of truth. Polling events are views over committed DB rows.

Managed provider recommendation:
- Use private channels with names that cannot be guessed as authority, for example `private-project:{projectId}:stage:{stageId}`. The name alone is not security.
- Add an auth/token endpoint in Next.js:
  - authenticate current session
  - verify project/stage access and `chat.view`
  - issue provider-scoped token/channel authorization only for that project/stage
- Broadcast only minimal event payloads:
  - `message.created` with `commentId`, `stageId`, `projectId`, `createdAt`
  - `message.deleted` with `commentId`, `stageId`, `projectId`, `deletedAt`, `deletedByUserId`
  - optional `message.changed` if later needed
- Prefer client receiving an event id and refetching the mapped record from GTI's API, or server publishing already-authorized sanitized payloads after DB commit.
- Do not broadcast raw message content unless the publisher path can guarantee the exact recipient set and visibility rules at broadcast time.
- If using presence/typing, presence payloads should be minimal: user id/display name/avatar/color/status. Avoid leaking email, permissions, role internals, or inactive/off-stage users.

Socket.IO separate service model:
- If ever used, the Socket.IO service must authenticate each connection and each room join.
- Room join must check the same project/stage permissions as HTTP routes.
- It should not trust client-selected room names.
- It needs a revocation story when collaborator access changes.

Supabase Realtime model:
- Private channels require RLS policy design around channel topics and JWT claims.
- If not using Supabase Auth as the primary identity, GTI must issue compatible JWTs and maintain RLS membership data.
- Postgres Changes can leak table shape if configured carelessly; use sanitized Broadcast for app events unless RLS is proven.

## 6. Performance Considerations

Polling:
- Server/API load:
  - One short request per visible active Stage Chat tab every 2-5 seconds.
  - Add jitter to avoid all tabs polling at once.
  - Use `AbortController` and single-flight request guards.
- DB load:
  - Keep endpoint narrow: `projectId`, `stageId`, `updatedAt > watermark`, low limit.
  - Add or verify an index suited to incremental reads, likely `(projectId, stageId, updatedAt)` for comment changes and `(projectId, stageId, createdAt)` already exists for chronological history.
  - Avoid full `getProjectStageChatMessages` for every poll because it can query comments, revisions, comparisons, favorites, and visibility windows.
- Browser load:
  - Very low if merging small deltas.
  - Pause when hidden. Back off when idle. Refresh immediately on focus.
- Latency:
  - Expected 2-5 seconds.
  - Good enough for workflow chat where the main requirement is "without refresh" rather than multiplayer typing-level immediacy.
- Many open tabs:
  - Risk: every tab polls.
  - Mitigation: optional BroadcastChannel/localStorage leader election later, where one visible tab polls and shares deltas across same-origin tabs.

SSE:
- Server/API load:
  - One open connection per active Stage Chat tab.
  - Long function durations increase resource usage.
- DB load:
  - Good if backed by a real event bus.
  - Bad if each SSE stream loops and polls DB.
- Browser load:
  - Low.
- Latency:
  - Near-instant if event-backed.
- Vercel risk:
  - Vercel supports streaming and configurable function durations, but long-lived streams must be evaluated against plan limits and expected concurrency.

Socket.IO/custom WebSocket:
- Server/API load:
  - Efficient on a purpose-built persistent server.
  - Poor fit for serverless route handlers.
- DB load:
  - Low for broadcast, because writes publish events after commit.
- Browser load:
  - Low to moderate, one realtime connection.
- Operational load:
  - Highest if GTI has to deploy and operate a separate Node service, scale it, secure it, and bridge it to the Next.js app.

Managed provider:
- Server/API load:
  - HTTP write path remains as-is.
  - Add publish call after successful DB commit.
  - Add auth/token endpoint for private channel subscription.
- DB load:
  - Lowest for receiving updates if events carry enough data, or moderate if clients refetch individual changed records after event.
- Browser load:
  - One provider connection, active channel subscriptions only.
- Latency:
  - Typically sub-second.
- Cost:
  - Vendor cost depends on messages/connections/presence usage.
- Many open tabs:
  - Providers count connections/subscriptions/messages; cross-tab connection sharing may matter later.

Database realtime:
- Server/API load:
  - Low if clients subscribe directly to managed realtime.
  - High complexity if GTI builds its own DB listener bridge.
- Neon/Vercel risk:
  - Long-lived DB listener sessions do not align well with serverless functions.
  - Prisma is not an event-stream client.

## 7. Recommended Architecture

Best option: Option A now, with a clean upgrade path to Option D.

Use active-stage incremental polling for Phase 1:
- Add a dedicated Stage Chat updates endpoint.
- Poll every 2-5 seconds only while Stage Chat is open, visible, and focused enough to matter.
- On focus, poll immediately.
- On hidden tab, pause or back off to 30-60 seconds.
- Use a server-issued watermark, not client clocks as authority.
- Return only changed Stage Chat records and deleted-message tombstones.
- Merge by server `commentId`/entry id.
- Keep optimistic messages keyed by local id plus `serverEntryId`, using the existing duplicate suppression logic.
- Keep `/chat/messages?cursor=...` for "Load earlier messages"; do not overload it for live updates.

Proposed update endpoint shape:

```text
GET /api/projects/[projectId]/stages/[stageId]/chat/updates?after=<watermark>&limit=50
```

Possible response:

```json
{
  "stageId": "stage_id",
  "watermark": "server_watermark",
  "entries": [],
  "deleted": [
    {
      "id": "comment_id",
      "deletedAt": "2026-06-16T00:00:00.000Z",
      "deletedByUserId": "user_id",
      "displayText": "This message was deleted"
    }
  ],
  "hasMore": false
}
```

Implementation notes for later:
- For text comments, consider returning the fully mapped created `ProjectChatEntry` from `POST /chat/comments` to reduce local approximation. This is optional for realtime polling but improves sender consistency.
- Query incremental comments by `updatedAt` so soft deletes are included.
- Keep changed rows sanitized through the same mapper used by history.
- Store `lastSeenWatermark` in component state, initialized from the newest server history entry and/or a route-provided server timestamp.
- Include events created by the current user too; client merge logic should suppress duplicates via `serverEntryId`.
- Do not include typing/presence in Phase 1.

When to move to Option D:
- GTI wants typing indicators or online users.
- GTI wants sub-second chat delivery.
- DB polling starts showing meaningful load.
- The team wants notifications and chat delivered through the same realtime provider.

Managed provider preference:
- Ably is the strongest fit if GTI wants a full realtime platform with Next.js docs, token auth, presence, history, and future chat features.
- Pusher Channels is also a strong fit if the team prefers its private/presence channel model.
- Supabase Realtime is only preferred if GTI is already planning to move auth/database/realtime toward Supabase.
- Firebase and PubNub are viable but less natural for this Prisma/Postgres-first app.

Socket.IO decision:
- Do not use Socket.IO inside this Next.js/Vercel app.
- Use Socket.IO only if GTI intentionally adds a separately hosted persistent Node realtime service.

## 8. Suggested Implementation Plan

Phase 1 - Minimal live new messages/deletes:
- Add a Stage Chat updates API route.
- Reuse current server auth and permission checks.
- Add incremental query support for comments changed since a server watermark.
- Return mapped/sanitized entries and deleted tombstones only for the active stage.
- Add client polling in `ProjectChatWorkspace`:
  - visible tab: 2-5 seconds
  - hidden tab: paused or 30-60 seconds
  - focus: immediate refresh
  - single in-flight request
  - jittered intervals
- Merge entries into `loadedHistoryEntries` by id.
- Remove/hide local confirmed optimistic entries when their `serverEntryId` appears.
- Apply deleted tombstones through existing `deletedMessageOverrides` or directly replace loaded entries.
- Do not implement typing, presence, read receipts, or notification behavior changes in this phase.

Phase 2 - Typing indicator and presence:
- Decide between:
  - lightweight managed provider channel for presence/typing only, while messages still persist through GTI APIs
  - or continue without presence if not business-critical
- Prefer Ably/Pusher private channels if this phase is approved.
- Add private channel auth endpoint with project/stage permission checks.
- Use ephemeral events for typing and presence. Do not store typing indicators in Postgres.

Phase 3 - Read receipts/delivery state:
- Add persisted read state only if the product needs it.
- Store read receipts in Postgres as the source of truth.
- Use polling or provider events to update UI.
- Consider per-stage read watermarks rather than per-message rows unless detailed auditability is required.

Phase 4 - Unify notification realtime if needed:
- If managed provider is adopted, consider publishing notification events after DB notification creation.
- Keep existing notification polling as fallback.
- Use provider events to trigger `/api/notifications/recent` refresh rather than broadcasting raw notification data.

## 9. Open Questions

- What is the expected number of concurrent active Stage Chat users and open tabs?
- Is 2-5 second latency acceptable for GTI Stage Chat Phase 1, or is sub-second delivery a hard requirement?
- Is GTI deployed only on Vercel, or is there appetite for a separate realtime service?
- Is the database definitely Neon/Postgres in production?
- Does GTI want typing indicators and presence soon, or are they optional polish?
- Should live Stage Chat include revision/comparison workflow cards immediately, or only text comment creates/deletes in Phase 1?
- Should attachment-backed comments appear to other users only after finalize succeeds? Recommended answer: yes.
- Should cross-tab coordination be required in Phase 1, or can it wait until polling load is measured?

## 10. Final Decision Needed

Recommendation:

Best option:
- Option A - active-stage incremental polling for Phase 1.

Why:
- It satisfies "new message/deleted message appears without refresh" with the least change to the current Prisma/Postgres/Next.js architecture.
- It is Vercel-safe and does not require persistent WebSocket infrastructure.
- It keeps the DB as the source of truth and continues enforcing GTI permissions server-side.
- It avoids reloading full project/stage history by using a narrow updates endpoint.
- It can be shipped before choosing a paid realtime vendor.

Use existing notification mechanism?
- Reuse the pattern: client polling, no-store API, visibility/focus handling, server-side permission checks.
- Do not reuse the exact intervals or endpoint shape. The notification provider's 120 second interval is not good enough for chat, and the notification page's 30 second interval is still too slow for active conversation.

Use polling temporarily?
- Yes. Polling is the recommended Phase 1 architecture, not just a throwaway hack, as long as the endpoint is incremental and scoped to the active stage.

Avoid Socket.IO?
- Yes. Avoid Socket.IO in the Vercel/Next.js app. Use it only with a separately hosted persistent Node service, which is not warranted for Phase 1.

Use managed provider?
- Not required for Phase 1.
- Recommended for Phase 2+ if GTI wants typing indicators, presence, lower latency, or notification/chat realtime on one provider. Ably or Pusher should be evaluated first.

Final decision to make:
- Approve Phase 1 incremental polling now.
- Defer managed provider selection until GTI confirms sub-second realtime, typing, presence, or read receipt requirements.
