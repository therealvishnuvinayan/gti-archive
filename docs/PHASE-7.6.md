# FLUX V2 — Phase 7.6 final integration verification and activation preflight

24 October 2026, Asia/Dubai. Starting commit: `8fd8c58a683d9bd94c47b9f2aa2b75fdc9492964`, clean checkout.

**PASS — ready to request controlled local development activation. Not activated.** All four Phase 7 flags remain unset. No live database write, migration, account/session change, environment edit, live S3 operation, message delivery, worker, deployment or Phase 8 work occurred. Production release and independent user QA remain separate. Phase 7 sign-off is recommended only after separately approved activation and successful postchecks, and only for the implemented 7.1–7.5 scope.

The [7.1](../src/lib/dashboard-v2/PHASE-7.1.md), [7.2](../src/lib/search-v2/PHASE-7.2.md), [7.3](../src/lib/calendar-v2/PHASE-7.3.md), [7.4](../src/lib/notifications-v2/PHASE-7.4.md), [7.5](./PHASE-7.5.md), [Phase 6 activation](../src/lib/archive-runtime/PHASE-6-ACTIVATION.md), central authorization/services, navigation, migration history, isolated runners and GTI registers were reviewed. Phase 7.5 supersedes the earlier Calendar/Notifications flag-off limitations; historical reports remain unchanged.

## 1. Integrated scope

| Feature | Fresh verification |
| --- | --- |
| Dashboard / My Work | Current-role native, flexible and runtime project identities/counts; all six Tasker types; actual Owner/executor relationships; currently eligible decision queues; Director oversight remains distinct from ownership. Empty views and original destinations work. No invented completion, progress or official-template designation. |
| Unified Search | All three project families and six task types; restricted context projections, private task/Sister isolation, bounded stable pagination, safe filters and validated return links. Existing native project search/filter behavior remains covered by My Projects regressions. |
| Task Calendar | Month/week/agenda service projections, actual timestamps/status/relationships and six types; Dubai day boundaries remain stable under UTC, Los Angeles, Tokyo and Dubai process zones. A Los Angeles browser displays Dubai deadlines correctly. Manual events are not task deadlines. |
| Attention / Deadline Watch | Assigned actions, independent Owner reviews, genuine Director/SPM configured decisions and JPM creation governance; due-today/past/upcoming windows; Completed/Closed work excluded from active overdue classification. Original services retain final decision authorization. |
| Shared shell | Existing sidebar/header, current-role landing routes, one Calendar/Notifications entry, authorized workspace links, return navigation and desktop/tablet/mobile layouts. No new navigation framework or business API. |

All application code is unchanged from the Phase 7.5 baseline. No activation-blocking application defect was found. The three script changes below improve evidence isolation, screenshot readiness and persisted legacy-record assertions.

## 2. All sixteen flag combinations

Order is Dashboard, Search, Calendar, Notifications; `0` means disabled and `1` enabled. Flags were injected only into disposable processes. Each combination passed navigation, new-API enable/disable and fallback checks. The browser matrix uses a genuine Designer account; all five business roles, technical-only and empty accounts receive additional service/browser coverage.

| D S C N | Dashboard/landing | Search | Calendar | Notifications | Result |
| --- | --- | --- | --- | --- | --- |
| 0 0 0 0 | Legacy role landing | Hidden / API 404 | Manual | Recorded | PASS |
| 0 0 0 1 | Legacy role landing | Hidden / API 404 | Manual | Attention + Recorded | PASS |
| 0 0 1 0 | Legacy role landing | Hidden / API 404 | Tasks + Manual | Recorded | PASS |
| 0 0 1 1 | Legacy role landing | Hidden / API 404 | Tasks + Manual | Attention + Recorded | PASS |
| 0 1 0 0 | Legacy role landing | Enabled | Manual | Recorded | PASS |
| 0 1 0 1 | Legacy role landing | Enabled | Manual | Attention + Recorded | PASS |
| 0 1 1 0 | Legacy role landing | Enabled | Tasks + Manual | Recorded | PASS |
| 0 1 1 1 | Legacy role landing | Enabled | Tasks + Manual | Attention + Recorded | PASS |
| 1 0 0 0 | Role dashboard | Hidden / API 404 | Manual | Recorded | PASS |
| 1 0 0 1 | Role dashboard | Hidden / API 404 | Manual | Attention + Recorded | PASS |
| 1 0 1 0 | Role dashboard | Hidden / API 404 | Tasks + Manual | Recorded | PASS |
| 1 0 1 1 | Role dashboard | Hidden / API 404 | Tasks + Manual | Attention + Recorded | PASS |
| 1 1 0 0 | Role dashboard | Enabled | Manual | Recorded | PASS |
| 1 1 0 1 | Role dashboard | Enabled | Manual | Attention + Recorded | PASS |
| 1 1 1 0 | Role dashboard | Enabled | Tasks + Manual | Recorded | PASS |
| 1 1 1 1 | Role dashboard | Enabled | Tasks + Manual | Attention + Recorded | PASS |

Disabled Dashboard, Task Calendar and live Attention APIs also return 404. Legacy role landing means the original dashboard for permitted managers and the established Tasks/Settings destination for other identities. Technical privileges alone confer no business access in either state.

## 3. Legacy preservation

Calendar OFF opens the authorized manual UI at `/calendar`; ON opens Task Calendar there and exposes `/calendar/manual`. Established `event`, `date` and legacy day-view links preserve authorized manual destinations. Persisted creation, details, reload and deletion pass. Personal Events/Reminders remain creator-scoped; only Director receives shared Projects/Payments authority. Director cannot read/delete somebody else's personal events. No editing, new sharing policy, synchronization or deadline conversion was introduced.

Notifications OFF retains the original recorded list, real unread state, dropdown, polling and provider activation. ON retains live Attention and the explicit `/notifications?view=messages` view; provider activation is confined to that recorded view. Actual per-recipient read/unread works on desktop and mobile. Current full-project message scope remains required; a task relationship does not confer access to unrelated project messages. Private and unlinked rows remain omitted under existing policy. No live Ably/provider delivery was exercised; private subscribe-only authorization was tested with the existing fake broker.

The final browser run compares complete manual records before and after navigation plus temporary create/delete operations: **all 25 original CalendarEvent rows are identical**. All **eight recorded Notification identities and message contents** are also identical; only real receipt fields (`isRead`, `readAt`, `updatedAt`) are excluded because the test deliberately operates read controls. [Browser preservation receipt](../.tmp/phase76/browser-preservation.json).

Separate live-read acceptance preserves Notification **8**, consumer receipts **0**, BusinessEvent **380** and outbox **380**, including complete recorded rows. Live attention creates no message, receipt or unread counter. Empty manual Calendar and Recorded Messages views pass in both flag states. Legacy Calendar's no-edit, local-date, overlapping-event and unpaginated-list limitations remain documented in Phase 7.5.

## 4. Roles, privacy and lifecycle

| Identity | Preserved boundary |
| --- | --- |
| Director | Genuine global business oversight without fabricated ownership; personal-event restrictions and independent exact evidence remain enforced. |
| SPM | Authorized projects/tasks and approved-version creation; no Director-only creation approval, final completion or runtime Archive verification. |
| JPM | Governed creation with eligible SPM Co-owner and separate Director decision; no unrestricted Archive/private-project access. |
| Designer | Assigned/owned/observed Tasker work and permitted context only; unrelated runtime stages and private tasks deny; Archive access requires exact grants. |
| Digital Lead | Authorized work and scoped category/file access; no inherited full-project access or runtime Archive verification authority. Existing native exact-version verification remains subject to its own policy. |
| Technical-only | No business workspace authority solely from technical privileges; direct service/API and UI navigation deny. |

Anonymous, expired, revoked, suspended, legacy-token and stale-version sessions deny; reactivation does not revive an old session. Tests preserve Owner/executor/spectator separation, independent acceptance, stage versus final-project approval, immutable publication/completion, exact file identity/provenance, native/flexible read/write/governance, Archive deletion/sharing/verification and Library isolation. All real account/password/role/session data remained unchanged.

## 5. Fresh local evidence

Disposable PostgreSQL **14.19**, genuine synthetic versioned sessions/password logins and fake storage were used. No real environment files are loaded into test applications. Browser/server guards block external destinations. Isolated acceptance made zero external/provider requests; the later authorized Neon preflight is a separate read-only operation.

| Check | Result |
| --- | --- |
| Dashboard service/API | PASS: **126 assertions**. |
| Search service/API | PASS: **243 assertions**, **21** expected denied/invalid responses, **1** intentional sanitized failure, **17** inspected query plans. |
| Task Calendar service/API | PASS: **295 assertions**, **26** expected denied/invalid responses, **1** intentional sanitized failure, **6** inspected plans. |
| Attention service/API | PASS: **343 assertions**, **31** expected denied/invalid responses, **1** intentional sanitized failure, **2** inspected plans; all 16 combinations. |
| Manual Calendar / recorded-message compatibility | PASS: **320 assertions**, **74** expected denials; genuine persisted operations, current sessions, privacy and historical candidate/deletion/dashboard invariants. |
| Authorization / native/flexible projects / Calendar / notifications / Library / Archives / completion documents / Shared File Identity / approvals / events | PASS: complete combined runner, including workspace and fake Ably contracts. These legacy suites print scenario receipts rather than a numeric assertion total; no total is invented. |
| Universal Tasker / six types / Sisters / Stage Builder | PASS: current native lifecycle, family privacy, all field/capability types, concurrency, provenance and populated historical migration checks. These sub-suites do not print numeric totals. |
| Workflow publication | PASS: **402 assertions** in this run. The counter varies with the permitted winner of the approve/reject race: a publication event adds 12 event/dispatch assertions. The invariant remains exactly one decision; the earlier 414 count is not a fixed requirement. |
| Runtime stages | PASS: **503 assertions**. |
| Disabled runtime / creation / General / deliverables / concepts and Sisters / final completion | PASS: **17 / 49 / 463 / 376 / 483 / 340 assertions**. |
| Five template workflows | PASS: **3,803 assertions**: Packaging 721; Printed POSM 635; Merchandise 629; Retail 557; Exhibition 602; Digital 655. Both POSM variants and immutable closure are covered. |
| Phase 6 Archive folders / verification / sharing / runtime | PASS: **50 / 64 / 53 expected denials** in verification/sharing/runtime; six/thirteen internal audit deliveries with replay. Bounds remain 500 reviewable versus 501 denied and 50 published files versus 51 denied; 449 superseded versions excluded. No Archive storage writes. |
| Native Tasks / My Projects | PASS: **66 / 57 assertions**, plus **3** historical assignment-migration assertions. |
| Six historical static commands | PASS: all six, detailed below. |
| Template specifications/source, navigation, notification realtime/security | PASS. |
| Full TypeScript | PASS: `pnpm exec tsc --noEmit --incremental false`. |
| Targeted ESLint | PASS: **73 executable files**, zero warnings. |
| Isolated production build | PASS: `/private/tmp/flux-dashboard-build-iJRCm9`; **704** application code/style files match. No environment copied; unreachable build-only database URL. Existing nonfatal `keyv → got → ably` dependency warning remains. |
| Chromium | PASS: **153.0.8010.12**, **9 scenario groups**, **64 screenshots**, **40 expected HTTP denials**, zero unexpected responses, zero page/hydration errors and zero external requests. Desktop 1536×1100, tablet 768×1024 and mobile 390×844. |

These are per-suite counts, not unique requirement totals. Synthetic historical migration rehearsals never touched Neon. Source/template specification checks also pass with all five canonical hashes unchanged:

| Candidate | Definition SHA-256 |
| --- | --- |
| Packaging | `1f1e33373d711b1e8e0669f65c898fe8bd055e4f6dcd3c124823c57f717b58d7` |
| POSM | `2f0f94603398158d6866e45111b6fa84499c1636a098565817bfd185294bc4fc` |
| Retail | `dbfb9f4de1e68ccb5d706ba210a9a6481eac3bb6d912541ee56f151927dd8694` |
| Exhibition | `88266d16c856d7c3c9c20f7fbd5339242395443b73e9bfda11fecfb9807dbec1` |
| Digital | `f11f5a5e839b682685a771076b41a88a1e4f126ea327276ab76c56848986643c` |

The browser fixture/acceptance was repeated only after screenshot review found capture during the shell's JavaScript opacity transition. The harness now waits for full opacity and adds the legacy-row preservation comparison. No application fix or build repeat was necessary. The other complete passing lifecycle suites were not repeated. An optional command was initially mistyped as `navigation:check`; the actual `navigation:ui-check` passed. Both attempts are retained. PostgreSQL/network sandbox escalations were approved; there was no automatic approval rejection.

Receipts: [local gate](../.tmp/phase76/local-checks.json), [combined output](../.tmp/phase76/combined.log), [Search](../.tmp/phase76/search/service-result.json), [Calendar](../.tmp/phase76/calendar/service-result.json), [Attention](../.tmp/phase76/service-result.json), [compatibility](../.tmp/phase76/compatibility-result.json), [authorization](../.tmp/phase76/authorization.log), [Tasker/runtime/templates](../.tmp/phase76/tasker-runtime-templates.log), [Archive](../.tmp/phase76/archive.log), [native Tasks](../.tmp/phase76/native-tasks.log), [template hashes](../.tmp/phase76/standard-templates-spec-check.log), [TypeScript](../.tmp/phase76/typecheck.log), [lint scope](../.tmp/phase76/lint-files.json), [lint](../.tmp/phase76/lint.log), [build](../.tmp/phase76/build.log), [browser](../.tmp/phase76/browser/result.json).

Reviewed screenshots: [populated Dashboard](../.tmp/phase76/browser/combined-dashboard.png), [Search return](../.tmp/phase76/browser/combined-search-return.png), [Task Calendar](../.tmp/phase76/browser/combined-calendar-return.png), [live Attention](../.tmp/phase76/browser/spm-attention.png), [Manual Events](../.tmp/phase76/browser/legacy-director-calendar-1.png), [persisted event creation](../.tmp/phase76/browser/manual-created-0.png), [recorded messages](../.tmp/phase76/browser/recorded-persisted-0.png), [mobile read controls](../.tmp/phase76/browser/mobile-recorded-1.png), [tablet](../.tmp/phase76/browser/tablet-actions.png), [empty manual view](../.tmp/phase76/browser/empty-manual-0.png), [denied technical account](../.tmp/phase76/browser/legacy-denial-1.png). The browser receipt lists every flag screenshot.

## 6. Six historical commands

| Command | Fresh result and retained meaningful assertion |
| --- | --- |
| `phase0:check` | PASS: current central Archive role/category/file-grant and completion contracts, with negative authorization. |
| `flow:check` | PASS: central Archive contracts and current native final-completion, document and caption checks. |
| `project-create:v2-check` | PASS: genuine JPM/eligible-SPM creation contracts and current persisted participant policy; no ADMIN business shortcut. |
| `projects:v2-check` | PASS: real deletion service rejects all currently disabled deletion paths, including completed work. |
| `dashboard:v2-check` | PASS: current flexible-project scope and actual overview/service connection. |
| `projects:user-check` | PASS: genuine current-role/project-scope contracts; Next's real server-only marker rejects default/client import and succeeds only in server context. |

No assertion or business permission was changed in this package. [Exact exit receipts](../.tmp/phase76/static-results.json).

## 7. Actual read-only Neon preflight

Provider GETs freshly confirmed the project, branch, endpoint and database. The direct SQL/schema-engine probes enforced startup read-only mode and timeouts. Pooled verification used an explicit `BEGIN READ ONLY` transaction with local timeouts, as in Phase 6's successful pooled probe. No migration/status-repair/seed/reset/resolve/restore command was executed against Neon.

| Finding | Actual result |
| --- | --- |
| Project | `flux-v2-dev` / `little-hall-78798085` |
| Branch | `develop` / `br-frosty-moon-b43rvpbe` |
| Database / schema / PostgreSQL | `neondb` / `public` / **18.6 (fd34222)** |
| Direct endpoint | `ep-raspy-salad-b4iqfan0.c-6.us-east-2.aws.neon.tech` |
| Configured pooled endpoint | `ep-raspy-salad-b4iqfan0-pooler.c-6.us-east-2.aws.neon.tech` |
| Identity fingerprints, direct / pooled | `5b001dbfcdb263fa` / `9d6f1df51a9db284`; SHA-256 prefixes over host:port/database, not credentials |
| Successful / failed / pending migrations | **117 / 0 / 0**; every ledger checksum matches the exact historical local/reviewed SQL |
| Unreviewed new migration files | **0** |
| Public tables / Prisma drift | **159 / zero**; actual introspection returned an empty migration |
| Phase 6 comparison | All **159 table fingerprints**, all **117 ledger rows**, complete catalog, account assignments and Artwork approval match the final Phase 6 receipt |
| During preflight | Before/after table, ledger, account, approval and catalog snapshots identical |
| Accounts / assignments / assignment history | **9 / 9 / 9**, unchanged; all nine accounts ACTIVE at authorization version 1; status/version and password-bearing row fingerprints preserved |
| Role distribution | Director 1; SPM 2; JPM 1; Designer 2; Digital Lead 1; technical-only 2 |
| Sessions | **3 unchanged rows**, all unexpired at the aggregate check; two conform to current V2 format/version and active account, one is legacy/nonconforming and is rejected by current V2 session validation. No stale-version/inactive-account versioned session. No token exported or row repaired. |
| Business data | Archive, Library, Tasker, runtime, Calendar, Notification and outbox tables remain empty, as in Phase 6. No synthetic data reached Neon. |
| Operational state | Zero other active transactions, waiting locks, prepared transactions or other held database locks. One idle backend named `flux_phase76_pooled_readonly` was retained by the pool after this probe; it had no transaction or blockers. |
| Storage / recovery window | Public-table storage **7,446,528 bytes**, unchanged; provider reports **21,600 seconds** retention. No restore drill performed. |

The nine nonempty tables are User (9), UserAuthorization (9), UserAuthorizationChange (9), Session (3), LegacyProjectPresetApproval (1), ProjectGovernanceEvent (1), ProjectStatusGroupOption (6), ProjectStatusOption (10) and the migration ledger (117). All other 150 tables are empty. There was no later application-data change to explain relative to Phase 6; the nonconforming session row is also part of the unchanged baseline, not new access authority.

The successful live result completed at **2026-10-24 09:16:36.707 UTC / 13:16:36.707 Asia/Dubai**. The aggregate session check completed at **09:18:52.324 UTC**. An initial pooled probe failed when supplied the direct connection's startup timeout options; the previously verified explicit read-only transaction method succeeded. This tooling correction did not relax read-only protection or change database settings persistently.

Private evidence: [provider identity](../.tmp/phase76/provider-result.json), [schema-engine read-only probe](../.tmp/phase76/engine-readonly.json), [pooled identity](../.tmp/phase76/pooled-probe.json), [Phase 6 comparison](../.tmp/phase76/phase6-comparison.json), [live result](../.tmp/phase76/live-result.json), [empty drift](../.tmp/phase76/live-diff.sql), [session aggregates](../.tmp/phase76/session-summary.json). Full snapshots remain private; credentials/passwords/session tokens are not included in this report.

## 8. Local source and environment

A fresh Next.js environment-loader process verifies these exact values; the actual environment files were never edited:

| Flag | Actual value |
| --- | --- |
| `FLUX_SHARED_FILE_IDENTITY` | `1` |
| `FLUX_APPROVAL_ENGINE` | `1` |
| `FLUX_SHARED_EVENTS` | `1` |
| `FLUX_UNIVERSAL_TASKER` | `1` |
| `FLUX_TASKER_DELIVERABLES` | `1` |
| `FLUX_TASKER_CONCEPTS` | `1` |
| `FLUX_TASKER_SISTERS` | `1` |
| `FLUX_STAGE_BUILDER_DRAFTS` | `1` |
| `FLUX_STAGE_BUILDER_PUBLICATION` | `1` |
| `FLUX_STAGE_RUNTIME` | `1` |
| `FLUX_RUNTIME_INTEGRATION` | `1` |
| `FLUX_ARCHIVE_FOLDERS` | `1` |
| `FLUX_ARCHIVE_VERIFICATION` | `1` |
| `FLUX_ARCHIVE_SHARING` | `1` |
| `FLUX_ARCHIVE_RUNTIME` | `1` |
| `FLUX_DASHBOARD_V2` | Unset / OFF |
| `FLUX_SEARCH_V2` | Unset / OFF |
| `FLUX_CALENDAR_V2` | Unset / OFF |
| `FLUX_NOTIFICATIONS_V2` | Unset / OFF |

`.env`, `.env.local`, `.env.example`, Git HEAD and staging retain their starting hashes/state. All 117 migration files and five candidate definitions are unchanged. All 704 application source/style files match the tested build. No local server was listening on port 3000 when checked; no server was started or restarted against Neon.

The reviewed existing-file manifest has SHA-256 **`032b7a3e530d65817c271b02d090f79c899df613df6ef2d59ce1ca49f2868bf1`**, covering all 1,189 starting tracked files with the three reviewed test-harness updates. Environment hashes are retained privately. [Flag receipt](../.tmp/phase76/flags.json), [candidate files](../.tmp/phase76/candidate-files.json), [activation manifest](../.tmp/phase76/activation-plan.json), [final preservation](../.tmp/phase76/preservation.json).

## 9. Remaining capabilities and GTI decisions

The [Phase 5.4 blocker](./requirements/GTI_Standard_Template_Blockers.md) and [decision](./requirements/GTI_Standard_Template_Decisions.md) registers remain authoritative and unchanged. No OPEN decision was marked completed or waived. The detailed code/provider/prerequisite inventory remains in [Phase 7.5, sections 4–5](./PHASE-7.5.md).

| Boundary still open | Required follow-up |
| --- | --- |
| Automated Tasker reminders | Recipient, timing, repetition, escalation, retention and cancellation policy, then separately approved durable scheduling/delivery. Native RequestReminder infrastructure is not a Tasker scheduler. D15 / B30. |
| Email, SMS and push for V2 | Approved channel/recipient/provider policy and operational acceptance. Existing native Resend code does not establish V2 delivery; no SMS/push provider is assumed. |
| Working days, holidays, leave and dynamic milestones | Authoritative calendars, durations/dependencies, recalculation and privacy/deputy policy. D15 / B29 / B44. |
| External tracker synchronization | Approved source/API, identity mapping, scoped provenance and reconciliation; native tracker models/import helpers are not an operational external connector. |
| CERBER/vendor workflows | Verified source of truth, procurement and financial authority plus approved adapter. D12 / D14 / D16 and relevant vendor blockers. |
| Toolio proof | Approved independent verification of exact product/file/version evidence; no assumed API. D13 / B41. |
| General external runtime submissions | Scoped external identity, token/revocation, exact evidence and approved rollout; existing native endpoints are not a general runtime integration. D11 / D14. |
| Official GTI designation | Exact approved revision, requiredness/review routes, domain proof and explicit designation/release decision. Five passing internal candidates remain unofficial. D01–D14, especially D10. |
| Tasker-to-stage gate enforcement | Separately authorized blocking policy and exact stage-proof rules. Existing accepted-output application does not automatically approve stages or complete projects. D03 / B14 / B30. |

These remain unimplemented or awaiting their own business authorization as described; Phase 7 activation does not satisfy them. Production-provider validation, production-scale performance, restore/recovery proof, other browsers and independent QA are outside this development preflight.

## 10. Prepared activation procedure — do not execute without approval

The [private activation manifest](../.tmp/phase76/activation-plan.json) is **PREPARED_NOT_APPROVED_NOT_EXECUTED**. No approval token or environment backup for this activation has been created. No database migration is needed.

1. Obtain the user's separate explicit approval for this exact four-flag local-development plan. Reconfirm the current commit and reviewed file-manifest contents; explain any change before proceeding.
2. Freshly verify the same Neon project/branch/database/endpoints, 117 exact migration checksums, 159 tables and zero drift using the read-only procedure. Recheck accounts/data/locks and the nineteen-name flag manifest. Unexpected differences stop the procedure.
3. Reconfirm all fifteen existing flags are `1`, the four new flags remain unset, and `.env.local` plus the other environment files match the reviewed checksums. Check for conflicting assignments or inherited process overrides.
4. Record the current `.env.local` checksum and make a private mode-0600 byte-for-byte backup under `.tmp/phase76/` only after approval. Record the backup checksum; do not print credentials.
5. Preserve every original byte and append only a necessary line boundary plus these four settings:

   ```dotenv
   FLUX_DASHBOARD_V2=1
   FLUX_SEARCH_V2=1
   FLUX_CALENDAR_V2=1
   FLUX_NOTIFICATIONS_V2=1
   ```

6. Verify that the exact file delta contains only this append and that all unrelated environment files/values and Git staging are unchanged. Record the resulting file checksum privately.
7. In a fresh Next.js environment-loader process, verify all **nineteen** flags resolve to `1`; do not rely on an existing server process or shell's cached values.
8. Inspect the local server process. Restart it, or start the approved development server if needed, so it loads the new configuration; do not deploy or start any worker/provider/scheduler.
9. Run the combined browser and authorization postchecks with injected flags, disposable PostgreSQL, synthetic accounts and fake storage. The existing `--compatibility --browser --evidence-dir=...` runner covers all enabled interfaces and the 16-combination fallback matrix. Never direct synthetic tests at Neon.
10. Verify manual Calendar creation/details/deletion and original links, actual recorded read/unread, protected destinations/return links, mobile rendering and no hydration errors. Confirm the legacy-row preservation receipt and absence of fabricated deliveries.
11. Perform a final read-only Neon preservation comparison against the immediate activation baseline, then recheck nineteen effective flags, environment delta, source manifest and staging. Report the actual activated state and limits before any implemented-scope sign-off.
12. If any guard/postcheck fails, stop and report. Do not repair a database or alter roles. The proposed rollback is restoration of the exact private environment backup and a local-server restart only after verifying the current file contains solely the approved append and that rollback is covered by the activation approval; otherwise request review.

This procedure is a reviewable plan, not an instruction to run migrations or enable settings now. The retained Phase 6 migration execution tool must not be reused.

## 11. Exact incremental file inventory

Created:

- [docs/PHASE-7.6.md](./PHASE-7.6.md): this verification report, open boundaries and guarded activation procedure.

Modified:

- [scripts/dashboard-v2-build.mjs](../scripts/dashboard-v2-build.mjs): optional repository-temporary `--evidence-dir` to preserve earlier phase receipts; existing defaults/build behavior retained.
- [scripts/run-dashboard-isolated.mjs](../scripts/run-dashboard-isolated.mjs): same evidence destination support and before/after persisted manual-record/message-content verification around browser acceptance.
- [scripts/notifications-browser-check.mjs](../scripts/notifications-browser-check.mjs): wait for the existing shell's entry opacity to settle before screenshots.

Ignored private `.tmp/phase76/` contains logs, screenshots, source/environment hashes, reviewed migration copies, read-only provider/database tooling/receipts and the unapproved activation manifest. The [complete private evidence inventory](../.tmp/phase76/evidence-inventory.json) records every evidence file and checksum. No activation/flag-edit script was executed. No production application, schema, permission, package dependency, candidate template, GTI register or prior report was modified. Git staging is unchanged; nothing was committed, pushed or deployed.

## 12. Recommendation and stop

**Recommend controlled local development activation of the four Phase 7 flags, subject to separate explicit user approval and fresh guards above.** There is no unresolved compatibility, authorization, migration or schema-drift blocker in this verified scope. All fifteen existing flags and the four OFF/unset Phase 7 flags are preserved.

Do not declare Phase 7 activated or signed off yet. After successful approved activation and postchecks, recommend sign-off only for the implemented Dashboard, Search, Task Calendar, Attention/Deadline Watch and legacy compatibility packages. The open GTI capabilities, production release and independent QA retain their separate boundaries. Stop here and request approval before any flag change.
