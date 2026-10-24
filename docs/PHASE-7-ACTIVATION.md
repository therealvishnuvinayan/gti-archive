# FLUX V2 — Phase 7 Controlled Local Development Activation Report

24 October 2026, Asia/Dubai.

**PASS — controlled local development activation completed and verified. All 19 flags are enabled.** The four approved Phase 7 flags were appended at **2026-10-24T09:30:55.772788+00:00** (13:30:55 Dubai). The local Next.js development server is running at **http://127.0.0.1:3000**. No rollback was required. Phase 8 was not started.

This report records execution of the user's explicit approval following [Phase 7.6 verification and preflight](./PHASE-7.6.md). It supports sign-off for the implemented Dashboard/My Work, Unified Search, Task Calendar, Attention/Deadline Watch and legacy compatibility scope. Production release and the user's independent QA remain separate. Outstanding GTI decisions and official-template blockers remain open.

## 1. Authorization and reviewed baseline

The user approved exactly four local flag assignments, a private backup, local-server startup, disposable acceptance and final read-only Neon preservation. Conditional rollback was authorized only for the exact approved append. No migration, Neon business-data write, account/permission change, live storage, external integration, real delivery, worker, scheduler, deployment or Phase 8 work was authorized or performed.

The starting commit is `f6ceca20e4f8f5be0ccb428a5a46332764256970`. Compared with Phase 7.6's original starting commit, it contains exactly the already reviewed report and three verification-script changes. All **1,189 reviewed source-file hashes** and the preflight report checksum matched; no unexpected source change occurred. The activation baseline records **1,190 files**, all unchanged through verification. Git staging started empty and remains unchanged.

All three reviewed environment checksums matched before activation. The existing production build `/private/tmp/flux-dashboard-build-iJRCm9` was retained: all **704** application code/style files matched current source. Its successful build, full TypeScript, zero-warning lint, six historical static checks and wider Tasker/runtime/template/Archive regressions remain documented in Phase 7.6. They were not represented as newly rerun here. This activation freshly reran the documented combined service/browser acceptance and complete authorization/lifecycle runner.

Evidence: [source precheck](../.tmp/phase7-activation/source-precheck.json), [approval scope](../.tmp/phase7-activation/approval.json), [final source/environment audit](../.tmp/phase7-activation/preservation.json).

## 2. Repeated critical read-only prechecks

| Check | Result |
| --- | --- |
| Provider project | `flux-v2-dev` / `little-hall-78798085` |
| Branch | `develop` / `br-frosty-moon-b43rvpbe` |
| Database / schema / PostgreSQL | `neondb` / `public` / **18.6 (fd34222)** |
| Direct endpoint | `ep-raspy-salad-b4iqfan0.c-6.us-east-2.aws.neon.tech` |
| Configured pooled endpoint | `ep-raspy-salad-b4iqfan0-pooler.c-6.us-east-2.aws.neon.tech` |
| Direct / pooled identity fingerprints | `5b001dbfcdb263fa` / `9d6f1df51a9db284` |
| Successful / failed / pending migrations | **117 / 0 / 0**; every checksum matches reviewed historical SQL |
| Tables / schema drift | **159 / zero** |
| Accounts / sessions | **9 / 3**, all account, password, authorization and session fingerprints unchanged |
| Data/catalog comparison | All 159 table fingerprints, ledger, catalog, account assignments and preset approvals match the reviewed Phase 7.6 and Phase 6 receipts |
| Operational checks | Zero active competing transactions, waiting locks or prepared transactions |
| Precheck completion | `2026-10-24T09:30:36.788Z` |

Provider requests were GETs. Direct SQL and Prisma schema introspection enforced read-only mode with timeouts; the pooled probe used an explicit read-only transaction. No migration SQL was applied to Neon. The unchanged three stored sessions include the previously documented one legacy/malformed token; it remains subject to current fail-closed session validation. Nothing was repaired or changed.

Evidence: [provider identity](../.tmp/phase7-activation/provider-result.json), [read-only engine safeguards](../.tmp/phase7-activation/engine-readonly.json), [database precheck](../.tmp/phase7-activation/live-result.json), [empty schema diff](../.tmp/phase7-activation/live-diff.sql).

## 3. Exact environment activation and server

A mode-**0600**, byte-for-byte backup was created privately under `.tmp/phase7-activation/` before editing. Its content and checksum matched the original `.env.local`. The only environment change is an **80-byte append**:

```dotenv
FLUX_DASHBOARD_V2=1
FLUX_SEARCH_V2=1
FLUX_CALENDAR_V2=1
FLUX_NOTIFICATIONS_V2=1
```

Every original byte and all 15 existing enabled flags were preserved. `.env`, `.env.example` and Git staging are unchanged. The exact append and backup were revalidated after postchecks. Credential values and backup contents are not included in this report. Private before/after checksums are retained in the activation receipt.

A fresh Next.js environment-loader process verified the initial 15 ON / four unset state and the resulting **19 ON** state. It also checked duplicate assignments and inherited overrides. The server launcher independently loaded and verified the same 19 settings, then started Next.js **16.2.6** bound to `127.0.0.1:3000`; its log reports Ready. Telemetry is disabled. No worker/scheduler was launched. Authenticated browser tests ran only against the disposable application, not the Neon-backed server; no actual user was signed in or session created for testing.

| Flag | Effective value | Change |
| --- | --- | --- |
| `FLUX_SHARED_FILE_IDENTITY` | `1` | Preserved |
| `FLUX_APPROVAL_ENGINE` | `1` | Preserved |
| `FLUX_SHARED_EVENTS` | `1` | Preserved |
| `FLUX_UNIVERSAL_TASKER` | `1` | Preserved |
| `FLUX_TASKER_DELIVERABLES` | `1` | Preserved |
| `FLUX_TASKER_CONCEPTS` | `1` | Preserved |
| `FLUX_TASKER_SISTERS` | `1` | Preserved |
| `FLUX_STAGE_BUILDER_DRAFTS` | `1` | Preserved |
| `FLUX_STAGE_BUILDER_PUBLICATION` | `1` | Preserved |
| `FLUX_STAGE_RUNTIME` | `1` | Preserved |
| `FLUX_RUNTIME_INTEGRATION` | `1` | Preserved |
| `FLUX_ARCHIVE_FOLDERS` | `1` | Preserved |
| `FLUX_ARCHIVE_VERIFICATION` | `1` | Preserved |
| `FLUX_ARCHIVE_SHARING` | `1` | Preserved |
| `FLUX_ARCHIVE_RUNTIME` | `1` | Preserved |
| `FLUX_DASHBOARD_V2` | `1` | Enabled in this activation |
| `FLUX_SEARCH_V2` | `1` | Enabled in this activation |
| `FLUX_CALENDAR_V2` | `1` | Enabled in this activation |
| `FLUX_NOTIFICATIONS_V2` | `1` | Enabled in this activation |

Evidence: [activation receipt](../.tmp/phase7-activation/activation.json), [fresh loader verification](../.tmp/phase7-activation/flags-enabled.json), [server process](../.tmp/phase7-activation/server.json), [server startup](../.tmp/phase7-activation/server.log).

## 4. Fresh isolated postchecks

Disposable PostgreSQL **14.19**, synthetic accounts/current-version sessions and fake storage were used. The runners construct their own database URLs and do not import live environment files. The browser application uses the verified production build. Actual Neon is reserved for read-only preservation checks.

Commands completed successfully:

```sh
node scripts/run-authorization-isolated-integration.mjs --archives --library --project-read --project-write --project-governance --completion-documents --runtime --file-identity --events --workspace
FLUX_BROWSER_BUILD=/private/tmp/flux-dashboard-build-iJRCm9 node scripts/run-dashboard-isolated.mjs --compatibility --browser --evidence-dir=.tmp/phase7-activation/postchecks
```

| Postcheck | Result |
| --- | --- |
| Complete authorization/lifecycle runner | PASS, exit 0: roles/current sessions; native/flexible project read/write/governance; completion documents; Library/Archives; Shared File Identity; approvals/events; workspace; legacy Calendar/recorded notifications and fake Ably contracts |
| Dashboard | PASS: **126 assertions** |
| Unified Search | PASS: **243 assertions**, 21 expected denials, one intentional sanitized failure, 17 query plans |
| Task Calendar | PASS: **295 assertions**, 26 expected denials, one intentional sanitized failure, six query plans |
| Attention / Deadline Watch | PASS: **343 assertions**, 31 expected denials, one intentional sanitized failure, two query plans |
| Legacy compatibility | PASS: **320 assertions**, 74 expected denials |
| Flag matrix | PASS: all **16** Dashboard/Search/Calendar/Notifications combinations; independent APIs/navigation, legacy fallback and role landings |
| Chromium 153.0.8010.12 | PASS: **9 scenario groups**, **64 screenshots**, **40 expected HTTP denials** |
| Unexpected responses / page or hydration errors / external requests | **0 / 0 / 0** |
| Desktop / tablet / mobile | PASS: 1536×1100 / 768×1024 / 390×844 |

The authorization runner prints scenario receipts rather than a single numeric assertion count. Expected denials and deliberately injected sanitized failures are passing negative tests. No acceptance postcheck failed. A temporary precheck helper initially needed its `@next/env` import resolved through the installed Next package; this was corrected before any flag edit, with no source/environment discrepancy.

Fresh screenshots of the populated Dashboard and mobile Recorded Notifications were visually reviewed. All-enabled navigation and authorized Search/Calendar return links pass. All five business roles, technical-only, anonymous and empty accounts retain appropriate boundaries. Suspended, expired, revoked, stale-version and legacy-token sessions deny; reactivation does not revive stale sessions. Owner/executor/observer, private task/Sister, independent review and stage/final-project authority remain distinct.

Evidence: [authorization output](../.tmp/phase7-activation/authorization.log), [combined output](../.tmp/phase7-activation/combined.log), [browser receipt](../.tmp/phase7-activation/postchecks/browser/result.json), [Dashboard image](../.tmp/phase7-activation/postchecks/browser/combined-dashboard.png), [mobile recorded controls](../.tmp/phase7-activation/postchecks/browser/mobile-recorded-1.png).

## 5. Original Calendar and recorded messages

With all four flags enabled, Task Calendar exposes Manual Events and Attention exposes Recorded Messages. Original authorized manual-event links, real persisted creation/details/reload/deletion, recorded unread history and actual per-recipient read/unread controls pass. The same original capabilities remain available with flags OFF. Personal-event privacy, Director-only shared financial/project event authority and full-project recorded-message scope remain enforced.

The browser's before/after comparison preserves **all 25 original manual-event rows** and **all 8 recorded message identities/contents**. Temporary browser-created events were deleted. Only notification receipt fields `isRead`, `readAt` and `updatedAt` are excluded from the content comparison because the tests intentionally exercise read controls.

Separate live-attention read checks preserve the exact fixture counts **8 notifications / 0 consumer receipts / 380 business events / 380 outbox rows** before and after. No fabricated messages, unread counts, deliveries or external/provider requests were introduced. Fake provider authorization and browser activation wiring do not constitute live provider delivery.

Evidence: [browser record preservation](../.tmp/phase7-activation/postchecks/browser-preservation.json), [compatibility counts](../.tmp/phase7-activation/postchecks/compatibility-result.json), [Attention acceptance](../.tmp/phase7-activation/postchecks/service-result.json).

## 6. Final read-only Neon preservation

Completed at **2026-10-24T09:36:26.917Z**. The final bounded read-only snapshot and schema introspection confirm **117 successful migrations**, **159 tables**, **zero drift**, **zero changed table fingerprints**, **nine unchanged accounts** and **three unchanged sessions** relative to the immediate pre-activation baseline. All ledger/checksum, catalog, approval and authorization data remain identical. No active competing transaction, waiting lock or prepared transaction was present. The retained idle read-only pooled probe connection is expected.

The local server remains running with the approved configuration. Final source, staging, backup, exact environment delta and 19-flag verification passed. **Rollback was not invoked.**

Evidence: [final database receipt](../.tmp/phase7-activation/final-result.json), [final empty schema diff](../.tmp/phase7-activation/final-diff.sql), [final local preservation](../.tmp/phase7-activation/preservation.json).

## 7. Open capabilities and release boundary

The [GTI decisions](./requirements/GTI_Standard_Template_Decisions.md) and [blockers](./requirements/GTI_Standard_Template_Blockers.md) are unchanged. In particular:

- Automated Tasker reminders and email/SMS/push delivery remain unimplemented or awaiting separate recipient, timing, escalation, provider and operational authorization.
- Working days/holidays/leave and dynamic milestone scheduling retain their business rules and scheduling prerequisites (D15 / B29 / B30 / B44).
- External project tracker synchronization, CERBER/vendor workflows, Toolio verification and general external runtime submissions require their own approved identities, evidence, APIs and rollout.
- Official GTI template designation remains blocked on exact approved revisions, requiredness, review routes, domain proof and explicit designation. Passing internal candidates remain unofficial.
- Tasker-to-stage gates retain blocking-policy and exact stage-proof prerequisites (D03 / B14 / B30). Accepted-output application does not automatically approve a stage or complete a project.

No such capability was silently marked complete. Legacy Calendar limitations and recorded-message scope documented in Phase 7.6 are unchanged. This is a controlled local development activation, not production release, independent user QA, external-provider acceptance, recovery validation or a Phase 8 implementation.

## 8. Exact incremental inventory and outcome

- Modified, ignored: `.env.local`, exactly the four approved assignments appended; all previous bytes preserved.
- Created, tracked candidate: `docs/PHASE-7-ACTIVATION.md`, this report.
- Created, ignored/private: `.tmp/phase7-activation/`, containing the verified mode-0600 environment backup, approval/activation/source/flag receipts, read-only tools and snapshots, disposable postcheck logs/screenshots, server log/process receipt and evidence inventory. The [private evidence inventory](../.tmp/phase7-activation/evidence-inventory.json) lists generated artifacts and checksums.
- Generated runtime cache: ignored `.next/` development-server output. No application source, migration, schema, package dependency, permissions, template definitions, GTI registers or prior reports changed. Nothing was staged, committed, pushed or deployed.

**Recommend Phase 7 sign-off for its five implemented packages following this successful controlled activation.** All mandatory activation conditions passed. The server is available for the user's separate QA. Stop here; Phase 8 and all outstanding GTI/production capabilities retain their separate authorization requirements.
