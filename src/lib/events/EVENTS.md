# Phase 2.3 — Shared Audit and Event Infrastructure

Implemented as a narrowly scoped, default-off foundation. Native histories remain authoritative. The only producer is a new terminal completion-document review recorded by Phase 2.2. No Neon connection, migration, live file operation, message delivery, staging, push or deployment was performed during implementation.

## Existing infrastructure examined

| Source | Authority, reuse and boundaries |
| --- | --- |
| `UserAuthorizationChange`; `authorization/assignment-transaction.ts` | Trigger-generated real-actor assignment history, versioned sessions and atomic assignment changes. Retained unchanged. Its transaction-local attribution pattern informs the new adapter. |
| `ProjectGovernanceEvent`; `project-governance/service.ts` | Preset approval, creation requests, Director decisions, completion requests and template proposals. Uses current authenticated authorization transactions. No new producer or policy change. |
| `CompletionDocumentEvent`; `completion-documents/service.ts` | Native upload/review/rejection/revision/access history and actual submitter/reviewer. Native submission status, accepted documents and workflow projections remain business truth. |
| `ApprovalRequest`, `ApprovalDecision`, `ApprovalEvent`; `approvals/service.ts` | Immutable evidence, native decision reference, current approver/session, step/revision ordering and replay commands. This is the one adopted decision boundary. |
| `SharedFileProvenance`; `files/completion-adapter.ts` | Immutable native event/version links. Exact `ApprovalEvidence` and `SharedFileVersion` FKs are reused without copying storage locations or asserting new byte integrity. |
| `ProjectActivityLog`, `ProjectTrackerActivity`, revisions and stage/task histories; `project-history.ts`, `user-tasks.ts` | Existing stage, assignment, revision and activity views. Their existing retention and visibility rules are not replaced by the new ledger. |
| Archives; `archives.ts` | Publication/source records and existing project activity entries, including archive snapshots. Director/SPM global authority and Designer/Digital Lead grants remain unchanged. No Archive adapter added. |
| Library; `library.ts` | Native manual assets, upload intents, shares/favorites/tags and linked project records. No universal immutable Library event history is claimed. Restrictive project/own-upload visibility and Director management remain unchanged. |
| `Notification`; `notification-center/service.ts`, `triggers.ts` | Recipient-specific persisted notifications and post-response tasks. Existing paths can publish invalidations after writes; they are not a durable general-purpose outbox and are not migrated in this phase. |
| `realtime/events.ts`, `realtime/server.ts` | Typed Ably event names and post-response/authorized-transaction `afterCommit` publication. This is separate from new audit delivery. No provider called or newly connected. |
| `RequestReminder`, `RequestReminderDeliveryAttempt`; `request-reminders.ts`, internal reminder route | Existing scheduled claim tokens, attempt dedupe and expiry handling, protected by `CRON_SECRET`. Expired processing is deliberately not replayed by that subsystem. It is neither replaced nor connected to this outbox. |
| `authorization/runtime.ts`, `project-write.ts`, `project-transaction.ts` | Current-session/resource authorization, Serializable native transaction and nested transaction propagation. The new hook joins exactly this existing transaction, before a new decision insert. |

The earlier Phase 2.1/2.2 implementation documents describe their implementation-time flags; subsequent activation is separate. This change preserves the currently active local `FLUX_SHARED_FILE_IDENTITY=1` and `FLUX_APPROVAL_ENGINE=1` and leaves `FLUX_SHARED_EVENTS` unset/off.

## Contract and schema

`contracts.ts` defines `COMPLETION_DOCUMENT_REVIEW_DECIDED`, schema version 1. The immutable envelope contains:

- Stable event ID and idempotency key, both `review:<ApprovalDecision.id>`.
- `COMPLETION_DOCUMENT_SUBMISSION` aggregate ID and native decision revision sequence; distinct submissions/revisions retain distinct IDs.
- Native `ApprovalDecision` and `CompletionDocumentEvent` references, exact `ApprovalEvidence` and `SharedFileVersion` references, and project context. Task context is explicitly null for this adapter.
- Actual approver ID, business role and authorization version from the guarded native decision. Director oversight never changes original ownership or uploader identity.
- Native decision occurrence time; request ID as correlation ID; native decision-event ID as causation ID; authorized operation `reviewCompletionDocument`.
- An allowlisted payload: outcome, document type, approval request ID, evidence snapshot hash and checksum-evidence classification. UNKNOWN means unknown cryptographic file evidence, not verified bytes.

The typed attribution vocabulary reserves trusted external access references and unknown historical actors for future reviewed adapters. This event can only have a genuine internal approver. No external actor or historical event is fabricated. There is no generic arbitrary event/payload/actor insertion API. Strict decoding rejects unsupported versions/types/operations and extra payload fields. Reasons, filenames, email addresses, approval snapshots, session IDs/tokens, object keys, URLs and credentials are not copied into this payload.

| New model | Responsibility |
| --- | --- |
| `BusinessEvent` | Immutable native decision projection and exact evidence FKs; unique native decision/event/idempotency key and aggregate/revision identity. |
| `EventOutbox` | One fixed internal-consumer delivery per event; mutable pending/processing/delivered/failed state, bounded attempts, availability, lease, completion time and sanitized code. |
| `EventDeliveryAttempt` | Append-only claim and outcome diagnostics. At most one terminal outcome per attempt, enforced by the database. |
| `EventConsumerReceipt` | Immutable `(eventId, consumerKey)` dedupe receipt, committed with the local consumer's effect and outbox acknowledgement. |

All new timestamp defaults and eligibility comparisons explicitly use UTC, including on a PostgreSQL server whose session timezone is not UTC. Existing tables and timestamps are unchanged.

## Atomic integration and immutability

`prepareCompletionReviewEvent` only enables adoption for the current authorized structured-project `reviewCompletionDocument` transaction, when `FLUX_SHARED_EVENTS=1` and a terminal native event exists. It sets a transaction-local native-event identifier and verifies migration availability. Phase 2.2 still validates the genuine session, business role, current project relationship, step and evidence before inserting its decision.

An `AFTER INSERT` trigger on `ApprovalDecision` creates the ledger event and outbox. It reads the authoritative decision/request/evidence rather than accepting client snapshots. The native mutation, decision, both native histories, shared event and outbox commit together. A failed outbox insert rolls everything back. The adoption marker does not survive a transaction. Intermediate multi-step approval, superseded cleanup, native-only paths and pre-activation decisions produce no new shared event. Replaying an old decision does not backfill it.

Database guards reject ledger/attempt/receipt update, deletion and truncation. Outbox deletion/truncation and changes to event/consumer identity are rejected; terminal deliveries cannot be silently reset. Direct ledger and outbox insertion is restricted to the native producer trigger. FKs restrict changes to referenced identities and retained histories. Deferred consistency triggers require an outbox per event, claim/outcome diagnostics consistent with final delivery state, and a receipt if and only if delivery committed. These are application/database-role integrity controls, not protection against a database owner disabling triggers or rewriting schema.

The current native transaction can reject one concurrent Serializable writer. It does not silently retry business operations. A later authenticated replay remains safe and emits no duplicate; conflicting outcomes cannot both commit.

## Dispatcher, retries and ordering

`createInternalDispatcher` is a server-only bootstrap closure requiring a database client and a trusted in-process consumer. It accepts no business principal and grants no role-based worker privilege. No singleton, polling loop, scheduler, HTTP endpoint or production consumer registration exists. The only consumer key is `internal.audit.v1`, exercised exclusively by isolated tests. Future fan-out or external delivery requires a separately reviewed adapter/consumer registration and schema/authorization decision.

Claims lock one eligible outbox row with `FOR UPDATE SKIP LOCKED`, assign a fresh lease token, increment attempts and append claim history. PostgreSQL documents `SKIP LOCKED` for queue-like contention, not as a globally consistent ordered view: [SELECT locking](https://www.postgresql.org/docs/18/sql-select.html#SQL-FOR-UPDATE-SHARE). The default lease is 30 seconds; the internal factory can configure a bounded lease for trusted use/tests.

Delivery fences by event ID and lease token, holds the row lock, checks the lease, runs the local callback inside the same database transaction, rechecks expiry, then writes effect/receipt/success/acknowledgement atomically. Duplicate or stale claims return STALE and cause no repeat effect. Callback failure rolls back local effects and receipts. Callbacks must keep all effects in the supplied transaction and must not perform external I/O.

Retryable failures use bounded exponential delays (5, 10, 20, 40, 80 seconds for attempts 1–5; the fifth failed attempt is dead-lettered). Permanent/unsupported-contract errors fail immediately. Only fixed error codes are persisted, never exception messages or stack traces. An expired claim appends EXPIRED and can be reclaimed with a different token. Five abandoned claims result in FAILED. If the failure-recording database transaction itself fails, its error propagates; the unacknowledged claim remains recoverable after lease expiry.

Delivery is **at least once**, with transactional local dedupe. Exactly-once external delivery is not promised. Workers/providers are not activated. Dispatcher downtime leaves accepted native work committed with pending outbox rows. Missing/broken ledger schema while adoption is explicitly on fails the native write closed; disabling new adoption is not a delivery retry or history rewrite.

Ordering is deliberately narrow: the existing approval engine orders steps, and this adapter emits one terminal event per submission with its native revision sequence. Rejections/resubmissions are different aggregates. Concurrent consumers, retries and dead letters do **not** guarantee ordering across submissions, file revisions or projects. No consumer may infer a global order from timestamp, event ID or claim order. A future multi-event aggregate adapter needs an explicit sequence/partition policy.

## Authorization and disclosure

No shared business feed, history endpoint, counts, search endpoint or UI is added. Existing native history screens retain their current resource authorization and no-store behavior. A Technical Administrator gains no business-event access. Director, scoped SPM/JPM, Designer and Digital Lead policies remain untouched. An event ID, file-version link or retained historical approval grants no new access.

Worker access is trusted internal code, separate from user roles. Do not hand its bootstrap closure or database client to a route, user-configurable callback or client component. The dispatcher is not a generic authorized business-read service. A future history endpoint must reauthorize the current session against each native resource before exposing records or counts; no such endpoint is claimed here.

## Proposed migration and activation boundary

`prisma/migrations/20261021190000_shared_audit_events/migration.sql`

SHA-256: 4b812e6af34abc81a055bb24bcc7a2c31bec7bda2330802829829302163fd016

Additive DDL: four tables, three enums, eleven explicit indexes plus four primary keys, nine restrictive foreign keys, four CHECK constraints, three trigger functions and thirteen triggers (one native producer, four row guards, four truncate guards, four deferred consistency guards). Existing Prisma models gain inverse relations only. No historical backfill or existing data rewrite.

Migration uses one transaction, a 5-second lock timeout and a 60-second statement timeout. New-table DDL and FK installation take normal PostgreSQL schema/referenced-table locks; installing the producer trigger locks the existing `ApprovalDecision` table. Use a controlled quiet window, validated recovery readiness, exact checksum/history/schema/identity preflight, and separate explicit approval. Lock/constraint failure aborts the transaction. Do not automatically retry, repair, `db push` or reset. There is no destructive rollback script. Trigger timing follows PostgreSQL's documented [deferred constraint trigger semantics](https://www.postgresql.org/docs/18/sql-createtrigger.html).

Expected activation changes: **107 → 108 successful migrations; 108 → 112 public tables including the Prisma ledger; one → zero pending migrations; zero Prisma schema drift.** These are disposable-test results/activation expectations, not a new statement about the live Neon state. The migration has not been applied to Neon.

Only after separate reviewed activation should `FLUX_SHARED_EVENTS=1` be set. Existing two local flags and `.env.local` remain byte-for-byte unchanged here. `pnpm build` is `prisma generate && next build` and does not migrate. `vercel-build`, which invokes migrations, was not run.

## Verification

| Check | Result |
| --- | --- |
| Event contract units and bounded retry policy | PASS |
| Populated candidate migration; all prior rows/checksums; no backfill; schema drift | PASS — 107/108 to 108/112 migrations/tables, zero drift |
| Native event attribution/evidence, immutability, replay, concurrent conflicting decisions | PASS |
| Forced outbox-insert failure and outer transaction rollback | PASS — no native acceptance, engine decision, shared event or dispatchable outbox survives |
| Rejection/resubmission evidence and retained earlier event | PASS |
| Concurrent claims and duplicate delivery, transactional effect/receipt dedupe | PASS |
| Temporary retry/backoff, permanent failure, lease recovery/fencing, five-attempt exhaustion, overlong-callback rollback | PASS |
| Authorization foundation and persistence units | PASS |
| Assignment services; runtime/authentication/session and current resource authorization | PASS |
| Project read/write and creation/final-completion governance | PASS |
| Completion documents, shared file identity/provenance, reusable approvals and their historical migration baselines | PASS |
| Archive, Library, workspace/navigation and business administration | PASS |
| Full TypeScript (`tsc --noEmit --incremental false`) | PASS |
| Targeted ESLint, zero warnings | PASS |
| Production `pnpm build`, including application type check and page generation | PASS |
| Browser | Not run: no observable UI/route change in this milestone |

The retry tests exposed a non-UTC timestamp comparison/default issue in the new implementation. Explicit UTC database defaults and claim comparisons fixed it; the final suite passed on the non-UTC disposable server. Existing application behavior was not changed to accommodate the tests. All 107 old migration checksums, centralized authorization sources, Stage 6 and `.env.local` match their start-of-task fingerprints. No earlier regression assertion was removed or weakened.

Local evidence is retained under `.tmp/phase23/`: `events.log`, `regressions.log`, `units.log`, `approvalUnits.log`, `foundation.log`, `persistence.log`, `types.log`, `lint.log`, `build.log`, baseline hashes and `final-verification.json`.

Mutation tests use freshly created private PostgreSQL 14.19 clusters with TCP disabled, explicit fake credentials, generated clients, genuine fixture sessions, fake storage and in-process consumers. No application environment credentials are inherited. The populated migration baseline is created by the existing completion/file/approval service tests, including actual accepted/rejected decision histories. All pre-existing public-table rows and 107 migration checksums are compared before/after; new tables start empty. New event tests also preserve all nine fixture accounts, assignments and password hashes. Production build blanks environment-file values and uses an unreachable loopback database URL.

Browser tests are not required for this phase: no observable UI or route behavior changes while adoption remains off. HTTP/session/native policy regressions remain in the isolated suites. Neon PostgreSQL 18.6 execution, provider recovery and storage configuration have not been inspected in this implementation phase; no real S3 byte-level integrity claim is made.

## Exact implementation files

Created:

- `prisma/migrations/20261021190000_shared_audit_events/migration.sql`
- `src/lib/events/contracts.ts`
- `src/lib/events/producer.ts`
- `src/lib/events/dispatcher.ts`
- `src/lib/events/EVENTS.md`
- `scripts/shared-events-unit-check.ts`
- `scripts/shared-events-integration-check.ts`
- `scripts/tsconfig.shared-events-unit.json`

Modified:

- `prisma/schema.prisma`
- `src/lib/approvals/service.ts` — import plus one native-boundary hook; existing eligibility and decision logic retained.
- `scripts/completion-documents-integration-check.ts` — invoke the isolated event suite on explicit test flag.
- `scripts/run-authorization-isolated-integration.mjs` — new populated migration/event mode and historical schema projections that exclude later models; previous assertions retained.
- `package.json` — `events:check` and `events:unit-check` commands.

## Remaining boundaries and readiness

No generic public feed, multi-consumer fan-out, dead-letter replay UI, retention purge, archival/export service, external notification dispatcher or production worker is implemented. Failed deliveries are retained for diagnosis; recovery/requeue tooling requires a separately reviewed operation. Local in-process consumers must finish within the transaction timeout and keep effects in PostgreSQL. Wider aggregate ordering is deferred. Tasker, Sister Tasks, Custom Stage Builder, Archive/Library adapters, new templates and Phase 3 remain unimplemented.

**Ready for controlled development activation, subject to the separate identity/recovery/history/drift/checksum preflight and explicit migration approval.** No required local check remains failing. This is implementation sign-off, not Neon activation or production-worker sign-off. Stop at Phase 2.3; no next phase has been started.
