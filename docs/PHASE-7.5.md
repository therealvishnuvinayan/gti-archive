# FLUX V2 — Phase 7.5 compatibility and readiness review

24 October 2026, Asia/Dubai. Baseline commit: `a37aeb235a09c6e0a66ab6deb32d53d66b6beda7` (clean checkout, including Phases 7.3 and 7.4).

Phase 7.5 restores the two legacy entry points and maintains the historical checks against current V2 contracts. **Phase 7 remains unactivated; all four flags remain unset.** No migration, live database/account operation, provider delivery, worker, push or deployment was performed.

This report supersedes the flag-off compatibility limitations in the historical [7.3](../src/lib/calendar-v2/PHASE-7.3.md) and [7.4](../src/lib/notifications-v2/PHASE-7.4.md) reports. Those reports remain unchanged as historical evidence. [7.1](../src/lib/dashboard-v2/PHASE-7.1.md), [7.2](../src/lib/search-v2/PHASE-7.2.md), [Phase 6 activation](../src/lib/archive-runtime/PHASE-6-ACTIVATION.md), and the Phase 5.4 blocker/decision registers were reviewed.

## 1. Manual Calendar: before and after

The exact pre-7.3 implementation was inspected at commit `dda3a9322064d3c01cae5fde990d27478b078a78`, including `/calendar/page.tsx`, `calendar/actions.ts`, `CalendarWorkspace`, `EventDialog`, `calendar-month-grid`, `src/lib/calendar.ts` and central workspace policies.

It supported month/week/day browsing, `date`/`event` query links, details, creation and deletion. **There was no update/edit event service or UI.** The historical action named `saveCalendarEventAction` creates a record. This package does not introduce editing.

| State | Previously in Phase 7.3 | Phase 7.5 |
| --- | --- | --- |
| Calendar flag OFF | Sidebar hidden; `/calendar` not found | Authorized `/calendar` renders the existing manual Calendar, including creation, details and deletion. |
| Calendar flag ON | Task Calendar, without the manual UI | Task Calendar stays at `/calendar`; its **Manual Events** link opens `/calendar/manual`, with a link back. |
| Established event links | Rejected as unsupported Task Calendar input | `/calendar?...&event=id` redirects to Manual Events with its original view/date/event parameters when ON. Legacy `view=day` links also resolve there. OFF links remain at `/calendar`. |
| Explicit manual route | Absent | `/calendar/manual` remains authorized and usable in either flag state. |
| New API OFF | 404 | Still 404; legacy availability does not enable `/api/calendar`. |

Both entry points reuse the existing service and client workspace. Central policy is unchanged: all five business roles can create/read/delete their own Events and Reminders. Director can additionally manage Projects and Payments. Director does **not** gain access to other people's personal events. SPM/JPM/Designer/Digital Lead do not gain financial-event visibility. Technical-only accounts have no Calendar access. Historical collaborator assignments do not grant V2 authority; calendar sharing was already closed before 7.3 and remains closed. No collaborator directory is loaded by the compatibility wrapper.

`CalendarEvent` continues to store its original `PROJECTS`, `EVENTS`, `REMINDERS`, `PAYMENTS`, tone, creator, `startAt` and `endAt`. Its old server-local date/time interpretation is preserved. Universal Tasker timestamps retain their explicit-offset instant and Asia/Dubai display contract. No conversion, synchronization, new database, reminder delivery or mixing into task deadline counts occurs.

## 2. Recorded Notifications: before and after

The pre-7.4 route and shell/provider were inspected at the same historical commit. The original notification list, recent-message dropdown, actual unread badge, polling, focus refresh and private Ably invalidation remain the underlying implementation.

| State | Previously in Phase 7.4 | Phase 7.5 |
| --- | --- | --- |
| Notifications flag OFF | Hidden navigation and not-found page | Original notification list at `/notifications`, original header dropdown and actual unread sidebar badge; provider enabled throughout the authorized shell. |
| Notifications flag ON | Live Attention/Deadline Watch plus Recorded messages | Same live views and obvious **Recorded messages** link at `/notifications?view=messages`; neutral header/sidebar links carry no computed unread count. |
| Stored read/unread | Existing per-recipient service | Unchanged `Notification.isRead`/`readAt`, list/recent/count filters, read/unread and mark-all behavior. |
| Provider in ON mode | Enabled on Recorded messages only | Preserved; live attention does not poll or subscribe to a message provider. |
| New attention API OFF | 404 | Still 404; existing recorded-message APIs retain their original independent authorization. |

The server passes the actual feature flag through the existing shell; no public client environment flag was added. Neutral loading text now works for both legacy and new views. Screenshot review also exposed the legacy list's fixed desktop columns overlapping on mobile. Rows now stack below the desktop breakpoint so titles, messages and real read/View controls remain usable; no notification service or read-state semantics changed.

Recorded rows require the real recipient and current full-project authorization. Unlinked historical rows and inaccessible project content remain omitted. Designer/Digital Lead do not acquire full project-message access merely by being task participants, even if an old notification row names them. The existing recipient-bound read-state operations are unchanged, including mark-all's existing treatment of the recipient's rows. Computed live attention creates no `Notification`, `readAt`, consumer receipt or invented delivery evidence.

## 3. Combined Phase 7 interfaces

| Feature | Implemented scope | OFF behavior |
| --- | --- | --- |
| Dashboard / My Work | Role-aware authorized project families, six Tasker types, actual relationships and independent decision queues | Original dashboard for authorized managers; existing task/settings landing for other identities. |
| Unified Search | Authorized project/task search, filters, bounded pages and destination return links | New Search entry/API unavailable. Existing native project search remains. |
| Task Calendar | Authorized Tasker deadlines; month/week/agenda, Dubai boundaries and stable pagination | Manual Calendar restored; new task API remains disabled. |
| Attention / Deadline Watch | Live authorized actions, native decision destinations and bounded deadline windows | Recorded Notifications restored; live attention API remains disabled. |

All use `DashboardAppFrame`, `DashboardShell`, the existing sidebar and topbar. There is one Calendar and one Notifications sidebar entry. Manual Events and Recorded Messages are workspace links. Search/Calendar/Attention task destinations preserve the existing validated `returnTo` convention. No alternate navigation framework or new action endpoint was introduced.

Cross-timezone acceptance exposed an existing hydration mismatch in the `/tasks` list: server and browser rendered local deadline/activity strings differently. Task cards now render the same stored timestamp initially, then retain the existing browser-local display after hydration; overdue styling also waits for hydration. This small presentation fix changes no stored deadline, service, permission, completion or approval behavior.

Archives and Library keep their separate resource policies. Director oversight is never relabeled as ownership. SPM approved-version creation, JPM requests requiring an eligible SPM and separate Director decision, Task Owner/executor/spectator boundaries, independent review, completed-runtime immutability and exact file provenance remain unchanged.

## 4. Capability inventory

| Capability | Actual repository support | Limit |
| --- | --- | --- |
| Recorded notifications / Ably | `notification-center/service.ts`, triggers, existing list/recent/read APIs, provider and private per-user subscribe-only tokens | Stored in-app state and invalidation; neither proves external delivery. No live Ably delivery was exercised. |
| Native reminders | `request-reminders.ts`, `RequestReminder`/attempt records and secret-protected `/api/internal/request-reminders`; native Stage 5/7 channels include in-app and Resend email. Claims, deduplication, retries and expired-lease handling are implemented. | Requires operational scheduler/configuration described in [operations](./REQUEST_REMINDER_OPERATIONS.md). No scheduler/configuration or delivery was activated/tested against a provider. Not a Universal Tasker deadline engine. |
| Email | Actual Resend adapter in `src/lib/email/resend.ts` and native request/production templates | Existing adapter is evidence of code, not evidence of configured credentials, delivery, V2 recipient policy, SMS or push support. |
| BusinessEvent / outbox | Transactional history, immutable actor/provenance, leases, bounded attempts, internal dispatcher and consumer receipts | `createInternalDispatcher` explicitly installs no production singleton, poller or endpoint. Internal audit consumer receipts are not employee notification receipts. |
| Universal Tasker deadlines | Required persisted timestamp, six task types, real task relationships and current session enforcement | No all-day inference, business-calendar calculation, grace period, escalation or automatic rescheduling. |
| Live attention | Current actionable projections and Deadline Watch at `/notifications` | Refresh/read-time indicators; no delivered state, scheduled worker or universal count. |
| Search | Current project-family and six-type task projections, original workspace links | Permission-bounded; no external tracker, global document index or hidden-project aggregation. |
| Task Calendar | Current authorized deadlines, Dubai calendar windows and real task links | Manual events remain separate; native project planning dates do not become enforceable runtime milestones. |
| Dashboard | Authorized summaries, actual My Work, pending eligible actions and deep links | Decisions still execute in original services with their original evidence/version checks. |
| Native Project Tracker | Tracker/column/row/cell/activity schema and native source-value/CSV logic in `project-tracker.ts` | Sidebar disabled; writes explicitly deny pending scoped provenance/mutation policies. This is not an operational external connector. |
| External native submissions | Existing scoped-token checklist/production routes and native completion-document INFO/PREPARE/FINISH endpoint | Specific native workflows only; no general external RuntimeStage/CERBER/Toolio adapter. |

## 5. Outstanding integrations and GTI decisions

The [blocker register](./requirements/GTI_Standard_Template_Blockers.md) and [decision register](./requirements/GTI_Standard_Template_Decisions.md) remain authoritative and unchanged. No OPEN entry was marked deferred or satisfied by this review. The following is an implementation inventory, not approval of a provider or policy.

| Item / existing code | Missing service or provider | GTI decision and authorization | Minimum useful scope / prerequisites / package |
| --- | --- | --- | --- |
| Scheduled in-app Tasker reminders: deadlines, Notification and outbox exist | Tasker reminder scheduler, durable dispatch/recipient policy and replay-safe delivery | D15/B30: recipients, triggering states, timing and retention; reauthorize active recipient and task access at delivery | One approved task condition and in-app channel, deduplication, cancellation on completion/revocation and observable attempts. Needs approved policy and worker authorization. **Later package**, explicitly excluded by 7.3/7.4. |
| Email/SMS/push: native Resend email exists | V2 channel adapters/policy; no SMS/push connector identified | Approved channel, recipient identity/contact verification, consent/preferences, retention and provider ownership | Start with one authorized channel after secure configuration, contract and delivery/retry evidence. **Later package**; no provider assumed. |
| Timing/repetition/escalation: native interval/next-run/attempt fields exist | Versioned cross-workflow reminder/escalation rules | D15/B30: timezone, advance notice, repetition, stop conditions, escalation recipients, quiet periods and retention; escalation never grants approval rights | A documented policy for one task type, then bounded idempotent processing. Needs scheduling/channel decisions. **Later package**. |
| Working days, holidays, leave: manual Calendar records exist | Authoritative business-calendar/leave source and schedule adapter | D15/B29/B44: workweek, holidays, leave visibility and any separately authorized deputy rights; leave must not imply account lockout or delegated Director power | Read-only approved availability/calendar first; verified identity and private leave scope. Needs source ownership and policy versioning. **Later package**. |
| Manual Calendar compatibility | **Resolved here** by reuse of existing UI/services | Existing personal/Director business-event policies retained; no new sharing/edit policy | Required for **Phase 7 compatibility**, now preserved. Automatic Calendar/Tasker sync remains separate. |
| Milestones/backward scheduling: native planning fields, Flexible milestones and runtime DATE fields exist | Typed dependency graph, duration policy, fixed/manual/calculated provenance and recalculation review | D15/B29, B01/B05 prerequisites: durations, organiser dates, lead times, conflicts, change authority; authorized project planners only | One project family with approved fixed dates and explicit proposed recalculation. **Later package**, no fabricated stages or deadlines. |
| External tracker: native tracker schema/import code exists | Approved external source/API, scoped mappings, reconciliation and audited writes | Source of truth, ownership, external identity mapping and field visibility; do not reopen disabled native writes by inference | Read-only import for one approved source with record provenance. Needs source access contract and current V2 read policy. **Later package**. |
| CERBER/vendor: templates hold reference/evidence fields; native production workflows exist | Verified vendor registry/qualification, procurement/selection and approved dispatch adapter; no CERBER API established | D12/D14/D16, B16–B21/B31: registry owner, vendor validity, purchase/Director roles, offer/contract and money visibility | Scoped vendor evidence with independent verification, then exact approved dispatch only if authorized. Needs legal/finance/recipient decisions. **Later package** and an official-template rollout dependency where applicable. |
| Toolio entry proof: Packaging references/manual tasks exist | Verified external-entry record/gate; no Toolio API established | D13/B41: acceptable independent proof, verifier identity, exact product/file/version linkage | Approved verifiable manual evidence procedure first; API synchronization is optional. Needs product identity/provenance and independent review. **Later package**. |
| External document submissions: native token-based services exist | General runtime external identity/token, immutable request/file/version binding, revocation and external submission adapter | D11/D14, B19/B20/B21/B25: authorized recipients, approval/signature meaning, rollout scope, expiry and retention | One approved external runtime request with exact evidence and actor provenance; reuse reviewed native principles without bypassing policy. **Later package**. |
| Official GTI templates: five pinned internal candidates and publication exist | Official designation/readiness/disposition mechanism and unmet domain integrations | D01–D14 and affected later decisions, especially D10: actual Director sign-off, exact revision/scope and accepted limitations; workflow publication is not official designation | Explicit versioned designation after required blockers or authorized scoped dispositions. Preserve existing runtime pins. **Separate package**, never a side effect of Phase 7 activation. |

A delivery engine needs approved **recipient, channel, timing, repetition and retention** policy before implementation/operation. Working days, escalation and absence/delegation decisions are also open. The original Phase 7.3/7.4 requests explicitly excluded automated scheduling and messages; these pending capabilities are not omissions from the implemented Phase 7 read interfaces. Official-template readiness remains blocked under its own register.

## 6. Six historical checks

All six commands now exit 0; [exact command receipts](../.tmp/phase75/static-results.json).

| Command | Exact maintenance and retained invariant |
| --- | --- |
| `phase0:check` | Replaced removed per-project Archive download/preview expectations with executable central role/category/file-grant contracts, including no-grant denial, scoped Designer/Digital access, JPM/technical denial and Director-only deletion eligibility. Updated delegated chat wrappers to require both central `runProjectMutation` and implementation guards. Completion assertions now follow shared upload/event services and current full-project authority; real completion-requiredness cases are executed. |
| `flow:check` | Inherits the behavioral Archive check; follows current Director identity, central category scope, full-project budget checks, authorized chat wrappers and shared completion uploads. Preserves native final-completion/Archive blockers, negative file/caption controls and existing Phase 3 checks. |
| `project-create:v2-check` | Replaces ADMIN-only candidate expectation with actual `validateRuntimeCreation` cases: genuine JPM Owner, eligible SPM, active typed participants, published hash and negative alternatives. Aligns participant-write checks with retained Co-owner/executor persistence and disabled legacy collaborator changes. Genuine-session service acceptance additionally verifies current Director/SPM/JPM candidates and task-role/technical denials. |
| `projects:v2-check` | Verifies the action delegates to `deleteProject`; executes rejection for six actor kinds and active/completed/archived/missing targets. Current service forbids deletion pending durable history/audit, stronger than the obsolete final-stage string guard. |
| `dashboard:v2-check` | Removes dependence on the decorative “Flexible Projects” label, keeps the actual overview connection and permissions, tests current flexible scope, and follows current central native/full-project scope and recent-project projection. Real service acceptance verifies the SPM's authorized private-project card/count. |
| `projects:user-check` | Runs in a temporary compiled server environment using Next's **real installed `server-only` package**, its supported `react-server` condition and actual server navigation implementation. Explicit probes require default/client import to fail and server import to succeed. No empty marker or module interception bypass. Retains display-state and UI privacy assertions; updates stale legacy-role/query assumptions, executes current manager/full-project role cases and denies forged SUPER_ADMIN identity. |

Fixing the first failing assertion exposed further obsolete assertions in the same scripts; those narrow changes are listed above. No production service was changed to make a test pass. Central authorization, native Calendar/notification services, Tasker services, runtime, Archive and Library implementations remain byte-identical to baseline.

## 7. Verification

All mutations used disposable PostgreSQL 14.19, synthetic accounts with genuine versioned sessions/password logins and fake storage. The browser and server block external destinations; real provider credentials and environment files are not passed to the test applications.

| Verification | Result |
| --- | --- |
| New compatibility service/API acceptance | PASS: **320 assertions, 74 expected denials**, 25 persisted manual events and eight recorded notifications. Both flag states; own/shared financial visibility, create/delete, actual read/readAt/unread, other-recipient denial, current-project restriction, technical/anonymous/expired/revoked/version mismatch, candidate roles, deletion protection and legacy dashboard. |
| Live reads with existing messages | PASS: before/after Notification **8**, consumer receipts **0**, BusinessEvent **380**, outbox **380**; all stored notification rows unchanged by live reads. Zero external requests/storage reads. |
| Existing Phase 7 service suites | PASS: Dashboard **126**; Search **243**; Calendar **295**; Notifications **343** assertions. All 16 flag combinations, disabled new APIs, source eligibility, task privacy, stable pages, six types, empty data and generic injected-error responses. Counts describe individual suite assertions, not unique requirements. |
| Authorization / legacy Calendar / notifications / Archives / Library / native project read-write-governance / files / completion documents / events | PASS: existing combined disposable runner, including workspace privacy and subscribe-only Ably token contracts with a fake broker. No real subscription/delivery. |
| Tasker / publication / runtime | PASS: publication **414**, runtime stages **503**, disabled-runtime **17**, creation **49**, General **463**, deliverables **376**, concepts/Sisters **483**, completion **340**; prior lifecycle/provenance/separation unchanged. |
| Native Tasks / My Projects | PASS: native Tasks **66**, My Projects **57**, historical assignment migration **3** assertions; genuine V2 sessions and zero external requests. |
| Historical six commands | PASS, all six; no waived or unconditional assertion. |
| Other targeted checks | PASS: notification realtime/security, navigation, five standard-template specification/source checks. All five original definition hashes match Phase 5.4 exactly. |
| Full TypeScript | PASS: `pnpm exec tsc --noEmit --incremental false`. |
| Targeted ESLint | PASS: all changed/new executable files, `--max-warnings 0`. |
| Isolated production build | PASS: `/private/tmp/flux-dashboard-build-TNly19`; no environment files copied, unreachable build-only database URL, **704** application source/style files match. Existing `keyv → got → ably` dynamic-dependency warning remains nonfatal. |
| Chromium desktop/mobile | PASS: Chromium **153.0.8010.12**, **64 screenshots**, all **16 flag combinations**, desktop/mobile/tablet, persisted manual create/reload/delete, actual desktop/mobile read/unread, empty legacy views, cross-timezone task dates, real destinations/return links and technical denial. **40 expected HTTP denials; zero page errors, unexpected responses or external requests.** |

Receipts: [compatibility](../.tmp/phase75/compatibility-result.json), [Search](../.tmp/phase75/search/service-result.json), [Calendar](../.tmp/phase75/calendar/service-result.json), [Attention](../.tmp/phase75/service-result.json), [template hashes](../.tmp/phase75/templates.log), [authorization](../.tmp/phase75/authorization.log), [Tasker/runtime](../.tmp/phase75/tasker-runtime.log), [native Tasks](../.tmp/phase75/native-tasks.log), [TypeScript](../.tmp/phase75/typecheck.log), [lint](../.tmp/phase75/lint.log), [build](../.tmp/phase75/build.log), [browser](../.tmp/phase75/browser/result.json).

Representative reviewed screenshots: [Manual Events with Task Calendar enabled](../.tmp/phase75/browser/legacy-director-calendar-1.png), [recorded messages with Attention disabled](../.tmp/phase75/browser/recorded-persisted-0.png), [mobile message controls](../.tmp/phase75/browser/mobile-recorded-1.png), [Task Calendar return](../.tmp/phase75/browser/combined-calendar-return.png), [live Attention](../.tmp/phase75/browser/spm-attention.png), [empty manual Calendar](../.tmp/phase75/browser/empty-manual-0.png), and [technical denial](../.tmp/phase75/browser/legacy-denial-1.png).

The harness now uses the same transaction-propagating Prisma wrapper as production for native Calendar operations and Next's real server-only marker. Initial fixture assertions and browser timing/selectors were corrected; no product permission change was needed. Two browser hydration errors on the existing Tasks list led to the targeted date-rendering correction described above and a fresh production build/browser run. Visual review found overlapping legacy mobile message columns; responsive rows and actual mobile read-control assertions were added before the final run. Local disk exhaustion interrupted one browser/Tasker attempt; only obsolete temporary builds created in this session were removed, and affected acceptance was rerun. The browser runner now closes its application/browser even if writing an artifact fails. PostgreSQL shared-memory execution used approved sandbox escalation. No automatic approval rejection occurred.

## 8. Preservation and limitations

No schema change or new migration. All **117 historical SQL files** and **224 protected authorization/schema/migration/template/requirements/Archive files** match the baseline. All environment files, Git HEAD and staging are unchanged. A fresh read-only environment resolution confirms **15 existing flags = 1**, with `FLUX_DASHBOARD_V2`, `FLUX_SEARCH_V2`, `FLUX_CALENDAR_V2` and `FLUX_NOTIFICATIONS_V2` unset. [Preservation](../.tmp/phase75/preservation.json); [flag-only receipt](../.tmp/phase75/flags.json).

Neon's **117 successful migrations / 159 public tables / PostgreSQL 18.6 / zero drift at last verification** remains the recorded Phase 6 baseline. No fresh Neon connection or verification is claimed. No real accounts, passwords, roles, business rows, S3 objects, operational provider settings or official designations were touched.

Inherited manual Calendar limitations remain: no edit operation, no pagination of the legacy event list, server-local date semantics and overlapping-event layout. Recorded messages retain their old full-project query scope and polling behavior. Live bounded lists retain their documented candidate/evidence limits and manual refresh; none is a scheduler or delivery engine. Production-provider validation, production-scale performance, operational monitoring, recovery/restore proof and formal rollout QA remain outside this development package.

## 9. Readiness and stop

**PASS for the Phase 7.5 development compatibility package. No unresolved legacy-functionality blocker remains in the tested scope; all six historical checks and the required local checks pass.**

Recommend the next **separately authorized final combined Phase 7 verification and activation-preflight package**. It should review this exact candidate, freshly verify the development database/environment baseline and operational prerequisites, confirm approved rollout/rollback steps, and obtain explicit authorization before controlled development flag activation. This report is not activation approval or production-readiness sign-off. The integration and GTI decision gaps in section 5 remain open for their separately approved packages.

No flag activation, migration to Neon, external integration, scheduled worker, real message, deployment or next package was started. Official GTI template rollout remains subject to its separate unresolved decisions and integrations.

## 10. Complete incremental file inventory

Modified (26):

- [package.json](../package.json)
- [scripts/calendar-browser-check.mjs](../scripts/calendar-browser-check.mjs)
- [scripts/calendar-v2-integration-check.ts](../scripts/calendar-v2-integration-check.ts)
- [scripts/dashboard-v2-build.mjs](../scripts/dashboard-v2-build.mjs)
- [scripts/dashboard-v2-integration-check.ts](../scripts/dashboard-v2-integration-check.ts)
- [scripts/dashboard-v2-regression-checks.mjs](../scripts/dashboard-v2-regression-checks.mjs)
- [scripts/flow-regression-checks.mjs](../scripts/flow-regression-checks.mjs)
- [scripts/notifications-browser-check.mjs](../scripts/notifications-browser-check.mjs)
- [scripts/notifications-v2-integration-check.ts](../scripts/notifications-v2-integration-check.ts)
- [scripts/phase0-regression-checks.mjs](../scripts/phase0-regression-checks.mjs)
- [scripts/project-creation-v2-regression-checks.mjs](../scripts/project-creation-v2-regression-checks.mjs)
- [scripts/projects-v2-dashboard-checks.mjs](../scripts/projects-v2-dashboard-checks.mjs)
- [scripts/run-dashboard-isolated.mjs](../scripts/run-dashboard-isolated.mjs)
- [scripts/user-projects-page-check.ts](../scripts/user-projects-page-check.ts)
- [src/app/(dashboard)/calendar/loading.tsx](../src/app/(dashboard)/calendar/loading.tsx)
- [src/app/(dashboard)/calendar/page.tsx](../src/app/(dashboard)/calendar/page.tsx)
- [src/app/(dashboard)/layout.tsx](../src/app/(dashboard)/layout.tsx)
- [src/app/(dashboard)/notifications/loading.tsx](../src/app/(dashboard)/notifications/loading.tsx)
- [src/app/(dashboard)/notifications/page.tsx](../src/app/(dashboard)/notifications/page.tsx)
- [src/components/layout/dashboard-app-frame.tsx](../src/components/layout/dashboard-app-frame.tsx)
- [src/components/layout/dashboard-shell.tsx](../src/components/layout/dashboard-shell.tsx)
- [src/components/layout/sidebar.tsx](../src/components/layout/sidebar.tsx)
- [src/components/layout/topbar.tsx](../src/components/layout/topbar.tsx)
- [src/components/notifications/notifications-page-workspace.tsx](../src/components/notifications/notifications-page-workspace.tsx)
- [src/components/tasks/task-families.tsx](../src/components/tasks/task-families.tsx)
- [src/lib/permissions/resolver.ts](../src/lib/permissions/resolver.ts)

Created (10):

- [docs/PHASE-7.5.md](../docs/PHASE-7.5.md)
- [scripts/phase75-browser-check.mjs](../scripts/phase75-browser-check.mjs)
- [scripts/phase75-contract-check.ts](../scripts/phase75-contract-check.ts)
- [scripts/phase75-integration-check.ts](../scripts/phase75-integration-check.ts)
- [scripts/register-server-contract.cjs](../scripts/register-server-contract.cjs)
- [scripts/run-server-contract-check.mjs](../scripts/run-server-contract-check.mjs)
- [scripts/tsconfig.phase75-contract.json](../scripts/tsconfig.phase75-contract.json)
- [scripts/tsconfig.phase75.json](../scripts/tsconfig.phase75.json)
- [src/app/(dashboard)/calendar/manual/page.tsx](../src/app/(dashboard)/calendar/manual/page.tsx)
- [src/components/calendar/manual-calendar-workspace.tsx](../src/components/calendar/manual-calendar-workspace.tsx)

Ignored `.tmp/phase75` contains local synthetic test receipts/screenshots/manifests only. No files were staged or committed.

