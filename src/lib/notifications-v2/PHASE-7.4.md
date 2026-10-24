# FLUX V2 Phase 7.4 implementation and acceptance report

24 October 2026, Asia/Dubai.

Phase 7.4 adds a live **Attention center** and **Deadline watch** at the existing `/notifications` route, backed by the read-only `/api/notifications/attention` endpoint. `FLUX_NOTIFICATIONS_V2` defaults OFF and remains unset. Dashboard, Search and Calendar flags remain OFF/unset. No live database, S3, notification provider, environment file, real account, push or deployment was used or changed.

The 117-migration, 159-table, PostgreSQL 18.6 Neon baseline is the historical Phase 6 activation record, not a fresh verification. The existing uncommitted Phase 7.3 work and Git staging were recorded before Phase 7.4 and preserved; the inventory below describes this phase's incremental changes.

## Existing infrastructure and message semantics

| Existing capability | Finding and treatment |
| --- | --- |
| `Notification` / `notification-center` | Real recipient-specific rows with title/message, resource references, `isRead`, `readAt`, creation timestamps and optional deduplication key. Existing triggers create native project notifications. Reads require the actual recipient and current full-project authorization; unlinked/restricted historical content is omitted. |
| Existing notifications UI/API/provider | Existing list, recent messages, unread count, read/unread operations, polling and Ably invalidation subscription. Reused through the explicit **Recorded messages** link (`/notifications?view=messages`). The existing provider is enabled only on that view. No notification is created merely by visiting the live center. |
| `BusinessEvent`, `EventOutbox`, `EventDeliveryAttempt`, `EventConsumerReceipt` | Transactional business history, internal consumer delivery and deduplication. An outbox delivery/consumer receipt is not evidence that a GTI employee received a notification. The internal dispatcher has no production scheduler/consumer registration added here. Live attention never reads these event payloads or creates recipients from them. |
| `RequestReminder`, `RequestReminderDeliveryAttempt` | Older native Stage 5/7 request reminders, with interval, scheduling/claim fields and provider attempts, separate from V2 Tasker deadlines. The existing secret-protected internal route and services are unchanged and were not invoked or scheduled. |
| Settings | Existing own-account/profile settings do not establish a V2 deadline-reminder preference, delivery-channel, opt-out or retention policy. No such policy/control is invented. |
| Dashboard Needs My Attention | Existing source-specific eligibility for task reviews, publication, runtime creation, final completion, document policy and configured stage reviewers. Reused directly without activating the Dashboard UI. |
| Calendar | Explicit-offset Universal Tasker timestamps, Dubai date boundaries, supported type/status/relationship contracts and stable deadline/ID cursor. Reused without activating Calendar. |

**Live indicators** are computed from current authorized records when the page opens or Refresh is selected. They have no delivered/unread/read status, receipt, dismiss operation or aggregate notification count. Both header and sidebar are neutral links. Opening an action only navigates to its original workspace.

**Recorded messages** are the existing persisted in-app notification records. Their existing read controls apply only to those actual per-user records. This phase does not claim email/push delivery evidence from their existence, convert indicators into messages, backfill receipts or alter their service. Legacy message reads retain their established full-project scope and query behavior; they are not the new bounded live projection.

## Supported actions and limitations

Needs my attention shows one chosen work category at a time, using its native state and ordering. There is no fabricated universal approval state and no inline Approve/Reject button.

| Category | Current eligibility and destination |
| --- | --- |
| Assigned task actions | Existing `executionWork`: actual executor, Open/In progress, writable runtime context, enabled Tasker type and required inspection source. Opens `/tasks/[id]`. |
| Task completion reviews | Existing pending completion request; actual Owner or eligible Director intervention; excludes executor/self-requester review and closed runtime contexts. Labels Owner and intervention separately. Its date is labeled Updated because this source exposes task `updatedAt`, not a separate request timestamp. Opens the task workspace. |
| Workflow publication | Director; pending submission, current revision and current submitting actor authority. Opens the exact `/projects/workflow-approvals/[approvalRequestId]`. |
| JPM creation decisions | Director; undecided runtime request, valid snapshot/hash, genuine active JPM Owner, required SPM Co-owner, eligible participants and current publication. Opens `/projects/runtime/requests`. |
| Configured runtime-stage approval | Existing project scope plus actual configured reviewer/current step, independent evidence contribution rules, current evidence/hash/requester version, preceding-stage and blocking-rejection gates. Opens the real project and stage. A nominal role alone is insufficient. |
| Final completion | Director; current pending request, active project, genuine current Owner request, current policy, exact completion evidence and database readiness. Opens `/projects/runtime/[id]/completion`. |
| Completion-document policy | Director; active runtime project without a document policy. Opens the existing completion workspace. No policy is automatically selected. |
| My creation request status | JPM's own runtime requests only. Clearly **Information**, with awaiting/approved/rejected native decision state; never an approval action for the JPM. |

The decision lists reuse `dashboardAttention` directly; assigned actions reuse `executionWork`. Both are internal authorized projections independent of `FLUX_DASHBOARD_V2`. No approval/Tasker/completion service or permission is modified.

The existing stage projection deliberately omits evidence-heavy stages exceeding 500 current file submissions and tells the user to inspect the original project workspace. Bounded candidate pages can be empty after current eligibility checks; Next page still allows continuation. No partial result becomes a count. Native legacy project approval queues, individual completion-document reviews, generic activity feeds and unsupported business sources remain in their existing workspaces; no universal approval aggregation is claimed.

## Deadline watch and date interpretation

The sole authoritative deadline is `UniversalTask.deadline`: required timestamp(3), written from an explicit zoned instant. All six Tasker types are supported, governed by their existing type flags. Display uses Asia/Dubai, including civil-date window boundaries and an exclusive midnight after the selected end date.

- **Due today:** Dubai's current civil day, with active Open, In progress or Completion requested work.
- **Past deadline:** actual timestamp earlier than the response's `asOf`, within the selected window, with those same active states. Default window is the previous 30 days through today; the UI displays that limit explicitly.
- **Coming up:** actual timestamp at or after `asOf`, within the selected window. Its initial seven-day window is a display filter, not a reminder policy.
- **All dated work:** all supported states in the selected window. Completed/Closed records are labeled **Historical deadline**, never active overdue work.

Completion requested remains a separate stored status and explicitly says it awaits separate Owner review. Deadline indicators are informational; they do not prove task acceptance, accepted output, stage approval or project completion. Owner, executor, spectator and Director oversight labels describe the actual actor relationship. A Sister marker never discloses its private parent or family details.

Date windows are limited to **92 inclusive civil days**, with valid dates from 1900 through 2199. Calendar's date parser, IANA formatting and deadline cursor are reused. Date-only/undated Universal Tasks are unsupported by the existing contract and non-null column; no all-day meaning or arbitrary Today placement is inferred. URL filter/page state survives refresh. Today links resolve the current Dubai day again rather than retaining yesterday's serialized date.

## Authorization and privacy

The new central `workspace.attention` capability admits business roles only when the feature flag is enabled. The service re-resolves the live versioned session inside its authorization transaction, verifies actor identity against the grant and rechecks expiry before returning. Task reads invoke `task.list` and apply existing resource predicates in SQL before titles/dates/overflow are returned.

Director oversight is distinct from direct task responsibility. SPM/JPM receive no Director-only category. Designer/Digital Lead see actual authorized task work and Owner review requests, without new runtime-stage, project financial, participant, Archive or Library grants. Technical-only, anonymous, revoked, expired, suspended and wrong-version sessions deny. Reactivation does not revive old sessions.

Responses omit private briefs, conversations, file/storage data, inspiration, parent-family IDs and actor rosters. Hidden task insertion does not change an authorized deadline response. No unread badge, total or hidden-data-derived filter option is returned. Static role/type choices reveal no private records.

The API rejects actor overrides, unknown/duplicate parameters, invalid views/sources/statuses/types/relationships, invalid dates/ranges/pages and malformed or out-of-range cursors. All responses, including errors, are private/no-store. Unexpected failures return generic text without SQL details.

## Query bounds and refresh behavior

Assigned actions and JPM status lists read at most 13 rows and display 12. Decision categories reuse a 13-candidate/12-row source page plus its existing bounded evidence checks. Attention pages are capped at 1,000 (12,000 offset), with source-specific stable ordering and unique ID tie-breakers. They are current-state pages: concurrent decisions can move rows between requests; no historical snapshot is promised.

Deadline watch reads at most 31 authorized rows and displays 30, using a `(deadline, id)` continuation predicate without OFFSET. No full task/project hydration or count query is introduced. Queries run in a Repeatable Read authorization transaction with a 30-second transaction timeout and three-second statement timeout. No index or migration was added; actual SQL plans on populated disposable fixtures were inspected.

Dashboard decision helpers retain their own narrow validations: creation validates the proposed participant/publication snapshot; runtime stage checks have their existing participant, dependency and file-evidence bounds; final completion compares native evidence in PostgreSQL. No broad audit-event scan is used.

Refresh performs another authorized read. The live center adds no background polling, worker, delivery consumer, recurring job or provider connection. Existing recorded-message polling/subscription runs only in its explicitly selected legacy view.

## UI and compatibility

The existing FLUX shell, Notifications route, task/project workspaces and return-navigation convention are reused. Needs my attention and Deadline watch have clearly labeled filters, source-specific statuses/dates, empty/loading/error states, visible focus controls and bounded pages. Live entries link to the real task, workflow approval, runtime request or completion workspace. Validated internal `returnTo` links restore the Attention filters/page; they cannot redirect to another origin.

When `FLUX_NOTIFICATIONS_V2` is OFF, its sidebar/header links are hidden, `/api/notifications/attention` returns 404 and `/notifications` uses `notFound()`. Next.js may stream its not-found content with HTTP 200; acceptance checks content and absence of live data. The pre-existing legacy notification APIs retain their existing authorization; they are not new attention endpoints. The old message UI is reached through Recorded messages after feature activation.

Dashboard, Search and Calendar routes remain intact. All four Phase 7 flags are independent; no internal reuse turns another flag on.

**Legacy CalendarEvent compatibility:** Phase 7.3 retained manual event records/services but replaced their presentation at `/calendar`. With Calendar OFF there is no Calendar page/link; with it ON the route shows Task Calendar, not historical manual events. This phase neither restores manual-event presentation nor mislabels those events as Tasker reminders. Before combined activation, GTI must decide whether to accept retirement of that manual-event presentation while preserving records, or separately require an authorized read-only retrieval path. Confirm the affected usage/data with the owner as part of that decision. No second calendar or event redesign is implemented here.

## Incremental file inventory

Created (10):

- `src/lib/notifications-v2/activation.ts`
- `src/lib/notifications-v2/contracts.ts`
- `src/lib/notifications-v2/service.ts`
- `src/lib/notifications-v2/PHASE-7.4.md`
- `src/components/notifications/live-attention-workspace.tsx`
- `src/app/(dashboard)/notifications/loading.tsx`
- `src/app/api/notifications/attention/route.ts`
- `scripts/notifications-v2-integration-check.ts`
- `scripts/notifications-browser-check.mjs`
- `scripts/tsconfig.notifications-v2.json`

Modified (13):

- `src/app/(dashboard)/notifications/page.tsx`: gated live views and explicit recorded-message entry.
- `src/components/layout/dashboard-app-frame.tsx`: existing message provider only on the recorded-message view.
- `src/components/layout/sidebar.tsx`: neutral Notifications entry without count.
- `src/components/layout/topbar.tsx`: neutral link to the center.
- `src/lib/authorization/definitions.ts`: new workspace capability.
- `src/lib/authorization/eligibility.ts`: business-role eligibility.
- `src/lib/authorization/workspace-policies.ts`: independent feature gate.
- `src/lib/permissions/resolver.ts`: navigation visibility gate.
- `src/lib/dashboard-navigation.ts`: validated Attention return URLs.
- `scripts/dashboard-v2-integration-check.ts`: optional acceptance hook/query capture.
- `scripts/run-dashboard-isolated.mjs`: optional Notifications mode and separate Phase 7.4/Search/Calendar artifacts.
- `scripts/dashboard-v2-build.mjs`: optional isolated Notifications build.
- `package.json`: three Notifications verification commands.

No Prisma/schema/migration, task engine, approval engine, Calendar implementation, Dashboard/Search service, notification producer, reminder worker or event consumer was changed. Shared scripts/navigation/capability files build on the pre-existing Phase 7.3 edits rather than replacing them.

Preservation checks confirm **1,156 baseline files unchanged**, including all **117 historical migration files/checksums**, all five canonical Phase 5 template factories/definitions and the GTI registers/blueprints. The pre-existing Calendar implementation and acceptance sources remain unchanged. All **702 application code/style files** match the final isolated build. `.env`, `.env.local`, `.env.example`, Git HEAD and Git staging retain their original hashes. The fifteen existing V2 flags remain enabled; all four Phase 7 flags remain OFF/unset. No migration was created or applied to an existing database, and official template status is unchanged. [Preservation receipt](../../../.tmp/phase74/preservation.json), [five canonical hash comparisons](../../../.tmp/phase74/template-hashes.json).

## Verification

Service/API acceptance uses real synthetic sessions and persisted fixtures on socket-only disposable PostgreSQL. Real existing services perform task requests/reviews, independent stage evidence changes, publication rejection, JPM creation rejection, document policy and final completion request/decision changes. Live reads are checked before/after those mutations. No production data is involved.

| Verification | Final result |
| --- | --- |
| Notifications service/API | **PASS: 343 assertions**, 31 expected denied/invalid responses and one deliberately injected database failure with sanitized output. All 16 flag combinations. |
| Existing Dashboard | **PASS: 126 assertions** across all five roles, private work, true decision queues and project families. |
| Existing Search | **PASS: 243 assertions**, 21 expected denials/invalid inputs, one injected failure and 17 query plans. |
| Existing Calendar | **PASS: 295 assertions**, 26 expected denials/invalid inputs, one injected failure and six query plans. |
| Current authorization | **PASS:** Archive, Library, project read/write/governance, completion documents, runtime, file identity and shared events. |
| Current Tasker/runtime | **PASS:** native Tasker/Sisters; publication 414 assertions; runtime 503; disabled-schema compatibility 17; creation governance 49; runtime General 463; deliverables 376; concepts/Sisters 483; completion 340. |
| TypeScript | **PASS:** full `pnpm exec tsc --noEmit --incremental false`, plus all integration sources compiled by the runner. |
| Targeted ESLint | **PASS:** changed application, orchestration and acceptance files. |
| Isolated production build | **PASS:** copied application source, no environment files, unreachable build-only DB address. Existing keyv/got/Ably dynamic dependency warning remains. |
| Chromium | **PASS:** seven acceptance groups, **39 screenshots**, **40 expected denied/invalid responses**, zero unexpected responses/page errors/external requests. Chromium 153.0.8010.12; 16 independent flag combinations. |

Service acceptance includes real task assignment and Owner review, Director intervention, all six types, true Sister privacy, exact publication rejection disappearance, JPM rejection/status, genuine configured SPM review and exclusion after the SPM contributes evidence, Director final-completion requests/rejection, policy disappearance, technical/invalid sessions, hidden-task response equality, bounded pagination and all four independent flags. Calendar/notification dates are consistent under UTC, Los Angeles, Tokyo and Dubai process zones. Tasker OFF returns unavailable/empty task work.

During the measured live reads, the fixture retained exactly zero stored Notification rows, zero consumer receipts, 380 business events/outbox rows, three approval decisions, 331 Tasker entries and 28 runtime activities. Those counts were unchanged across reads; the preceding fixture mutations legitimately created business history using the original services. No live read generated a message, receipt, event or decision. Storage reads and external requests were zero. Two actual Tasker SQL plans were inspected using `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` with timestamp bindings preserved; final execution times were 0.020 and 0.105 ms on populated local fixtures. These exclude application/network overhead and do not establish production latency.

Chromium authenticated five business roles with synthetic passwords, plus empty/technical accounts. It exercised deadline views, Dubai midnight in a Los Angeles browser, actual task/stage destinations and Back to Attention, refresh after an exact authorized Owner rejection, stable pages, invalid windows, private-task API denials and the separately labeled recorded-message view. It checked 390×844 mobile and 768×1024 tablet layouts without page-width overflow. Eight disabled flag combinations render no Attention UI, with the established not-found page behavior. The full unchanged standard-template workflow suite was not repeated; canonical definitions/specification checks and relevant runtime/authorization regressions were rerun.

Selected screenshots:

| Evidence | Screenshot |
| --- | --- |
| Actual Owner reviews | [SPM attention](../../../.tmp/phase74/browser/spm-attention.png) |
| Configured Director decision | [Director attention](../../../.tmp/phase74/browser/director-attention.png) |
| Informational JPM status | [JPM attention](../../../.tmp/phase74/browser/jpm-attention.png) |
| Dubai deadlines and historical completed work | [Deadline watch](../../../.tmp/phase74/browser/deadline-history.png), [due today](../../../.tmp/phase74/browser/due-today.png), [past deadline](../../../.tmp/phase74/browser/past-deadline.png) |
| Authorized navigation and stale removal | [Task destination](../../../.tmp/phase74/browser/authorized-task-destination.png), [stage destination](../../../.tmp/phase74/browser/authorized-stage-destination.png), [decided item removed](../../../.tmp/phase74/browser/decided-item-removed.png) |
| Mobile/tablet | [Mobile deadline entries](../../../.tmp/phase74/browser/mobile-deadline-items.png), [mobile Owner review](../../../.tmp/phase74/browser/mobile-owner-review.png), [tablet actions](../../../.tmp/phase74/browser/tablet-actions.png) |
| Denied/invalid/empty | [Technical fallback](../../../.tmp/phase74/browser/technical-denial.png), [invalid dates](../../../.tmp/phase74/browser/invalid-window.png), [empty work](../../../.tmp/phase74/browser/empty-attention.png) |
| Feature independence | [Notifications alone](../../../.tmp/phase74/browser/flags-0001.png), [all disabled](../../../.tmp/phase74/browser/flags-0000.png), [all enabled in fixture](../../../.tmp/phase74/browser/flags-1111.png) |
| Existing recorded-message UI | [Recorded messages](../../../.tmp/phase74/browser/recorded-message-view.png) |

Receipts: [service](../../../.tmp/phase74/service-result.json), [browser](../../../.tmp/phase74/browser/result.json), [Search](../../../.tmp/phase74/search/service-result.json), [Calendar](../../../.tmp/phase74/calendar/service-result.json), [authorization](../../../.tmp/phase74/authorization.log), [Tasker/runtime](../../../.tmp/phase74/tasker.log), [query plans](../../../.tmp/phase74/query-plans.json), [build](../../../.tmp/phase74/build.log), [historical static results](../../../.tmp/phase74/static-results.json). Evidence lives in ignored `.tmp/phase74/`; prior Phase 7.1–7.3 evidence was not overwritten.

Commands:

```sh
pnpm notifications:v2-check
pnpm notifications:v2-build
FLUX_BROWSER_BUILD=/private/tmp/flux-dashboard-build-<build-id> pnpm notifications:v2-browser-check
```

The build reports its private temporary path. Chromium uses the installed `playwright-core` package supplied through `FLUX_PLAYWRIGHT_PACKAGE`, with the existing local QA harness as fallback. Runners whitelist environment variables, never source real environment files, use fake storage and forbid external requests.

The six historical static exceptions remain unchanged: `phase0:check` and `flow:check` expect the old per-project Archive guard; `project-create:v2-check` expects ADMIN-only Co-owner candidates; `projects:v2-check` expects an obsolete completed-delete source guard; `dashboard:v2-check` expects the old Flexible Projects panel; standalone `projects:user-check` cannot resolve `server-only`. Permissions and unrelated legacy assertions were not weakened. The current navigation, project-list workflow and five-template specification checks pass.

## Outstanding policy and Phase 7.5 recommendation

GTI-B29, GTI-B30, GTI-B44 and GTI-D15 remain open. This phase does not choose advance notice intervals, repetition, working days/holidays, escalation conditions/recipients, delivery channels, opt-outs/preferences, retention, Digital maintenance schedules or leave/deputy behavior. No event-based notification delivery, email, SMS, push, webhook, scheduled message or automatic reminder is implemented or activated.

For Phase 7.5, first confirm its approved scope and acceptance criteria, and resolve the legacy manual-calendar visibility decision before combined Phase 7 activation. Any future delivery package should require an explicit GTI-approved recipient, timing, channel, repetition and retention policy, then a separately reviewed adapter using durable per-recipient evidence. Do not interpret this live center or the existing internal outbox as that delivery system. Phase 7.5 and Phase 8 have not been started.
