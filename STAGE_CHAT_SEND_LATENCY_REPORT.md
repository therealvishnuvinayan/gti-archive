# Stage Chat Send Latency Report

## Before Timing

Reported browser observation before this change:

```text
POST /api/projects/[projectId]/stages/[stageId]/chat/comments: ~2.9s-4.0s
```

The old route already skipped router refresh and scheduled notifications after the response, but it still did avoidable work around the DB-first save path:

- It selected more project status data than the text-send check needs.
- It still used a post-insert realtime DTO refetch inside the Ably publish task.
- The route did not emit a single `[chat-send-fast]` breakdown, so auth, access query, insert, response, and publish could not be separated in the live logs.

## Exact Bottleneck Breakdown

Detailed route timings were added with the prefix:

```text
[chat-send-fast]
```

The live route now logs:

- request start
- route params
- parse body
- auth
- permission snapshot marker
- mention parsing
- stage/access query
- project/stage lookup
- project access check
- `chat.createComment` permission check
- completed-project check
- revision lookup used/skipped
- mention user lookup used/skipped
- `ProjectComment` insert
- returned DTO mapping
- notification scheduling
- message refetch skipped
- Ably publish start
- Ably publish duration
- response serialization
- total

Read-only / rolled-back DB probes against the configured Neon database from this environment:

```text
simple projectStage.findFirst: 3458ms
optimized stage/access query: 2543ms, 1221ms, 1254ms
rolled-back ProjectComment insert: 965ms, 596ms, 644ms
```

Those probes indicate the main latency floor is the remote Neon/Prisma database round trip, especially the access query and insert. The live route logs will show the exact per-request split for authenticated browser sends.

## Queries Removed / Optimized

Optimized text-send path:

- Kept existing auth and permission checks.
- Kept stage-belongs-to-project validation.
- Narrowed project status selection to fields required for completed-project detection.
- Kept revision lookup only when `revisionId` is present.
- Kept mention recipient lookup only when mentions are present.
- Kept notifications scheduled after response.
- Removed the post-insert `getStageChatCommentEntryForUser` refetch from the Ably publish path.
- Built the safe text-message `ProjectChatEntry` directly from the insert result and current user.

The common no-mention, no-revision text path is now:

```text
auth -> stage/access query -> permission checks -> ProjectComment insert -> DTO mapping -> response
```

Ably publish remains DB-first and runs after DB success without blocking the HTTP response.

## Ably Publish Timing

The route now logs:

```text
[chat-send-fast] ably publish start
[chat-send-fast] ably publish
```

Server publish logs also remain available:

```text
[ably:server] publish stage-chat.message.created start
[ably:server] publish stage-chat.message.created success
[ably:server] publish stage-chat.message.created failure
```

The publish payload no longer requires a second DB read. It uses the DTO returned by `createStageTextCommentFast`.

## After Timing

No authenticated browser send was executed from this shell session, so live HTTP after-timing should be read from the new `[chat-send-fast] total` log on the running dev server.

Measured DB components after optimization from this environment:

```text
optimized access query warm floor: ~1.2s
rolled-back insert warm floor: ~0.6s
combined DB floor before auth/serialization: ~1.8s warm, ~3.5s cold
```

This should improve over the old 2.9s-4.0s route when the removed realtime DTO refetch was contributing, but current Neon round-trip latency alone can still keep DB-first sends above Slack-level in many cases.

## Remaining DB / Neon Latency Floor

The configured Neon path showed:

- cold/simple read around 3.5s
- warm optimized access reads around 1.2s
- rolled-back inserts around 0.6s-1.0s

That means a secure DB-first send cannot reliably feel instant if every cross-user Ably event must wait for remote DB access validation and insert completion.

## Can DB-First Meet Slack-Level?

With the current remote Neon latency, DB-first can be improved but is unlikely to consistently meet Slack/WhatsApp-level cross-user delivery. The sender still gets local optimistic UI immediately, but other users cannot receive `message.created` until the DB insert succeeds.

DB-first can get closer if database latency is reduced by infrastructure changes such as closer region placement, warmed connections, or lower-latency database hosting.

## Is Ably-First Broadcast Still Needed?

If management requires other users to see text messages in near-real-time under the current DB latency floor, an Ably-first pending-message broadcast is still recommended as the next architecture step.

That would need a separate reliability design:

- broadcast a pending sanitized event before DB commit
- persist in DB
- publish confirmed/rejected state
- reconcile missed or failed messages from DB
- avoid exposing messages to unauthorized users

This change intentionally did not implement Ably-first broadcast.

## Checks Run

```text
pnpm lint
pnpm typecheck
pnpm build
```

All passed.
