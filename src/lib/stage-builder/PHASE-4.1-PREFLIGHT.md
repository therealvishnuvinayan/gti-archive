# FLUX V2 — Phase 4.1 verification closure and controlled activation preflight

Verification closure performed on 2026-10-22 from commit `99feceea37b2588d1e0eeeba3ccf062405043013`. This report supplements [the implementation report](./PHASE-4.1.md). The working tree began clean. This task authorizes test repairs and read-only preflight only; migration and local feature activation require separate explicit approval.

## Verification repairs

No product code, business policy, schema, migration, account or environment file was changed. The four existing commands still execute their native source checks, then run actual V2 services through `run-authorization-isolated-integration.mjs`. Every invocation creates a private disposable PostgreSQL cluster, synthetic current-version sessions, and fake external services. No cached success receipt or skip option is accepted.

`native-ui-verification.mjs` counts executed source assertions, requires a nonzero count, checks the isolated process exit code and required behavior checkpoints, and reports PASS only after both parts succeed. These are **source assertion counts and isolated checkpoint counts**, not an invented total of individual integration assertions. Negative probes confirmed exit code 1 for an injected substantive failure in each runner, zero source assertions, and a failing isolated child process.

Exact assertion changes:

| Runner | Previous assertion | Replacement and reason |
| --- | --- | --- |
| Stage 5 | Literal `redirect(returnTo ?? "/")` | Preserve shared safe-return wiring; execute actual `signInAction`, password verification and session resolution. Check Director/SPM/JPM → `/`, Designer/Digital Lead → `/tasks`, technical-only → `/settings`, unmapped legacy SUPER_ADMIN → `/no-access`; empty/absolute/protocol-relative/backslash/control-character destinations, exact checklist return URL, signed-out redirect encoding, and bad-password rejection. V2 intentionally resolves the default landing from authenticated authority. |
| Stage 6 | Presence of `isGlobalProjectAdministrator(user)` implies global management | Execute exported native Stage 5/6/7 policy helpers with real server-bound V2 identities. Director is global; SPM owner and JPM co-owner manage; unrelated SPM, restricted roles, technical-only, unmapped and forged objects cannot manage. Retain actual Stage 6 recipient-only decision, stale-version rejection, final-decision immutability and no project finalization assertions. |
| Stage 7 | Retired `Mark Project as Completed` label and sample-screen `closeStageSevenProjectAction` | Check the manager-gated link to the actual project's `#final-completion` panel and closed status. Keep the compatibility server action wired to native closure; assert it is absent from sample-screen controls. Execute shared governance and native closure, including Director-only finalization. |
| Stage 7 | Legacy global-administrator helper plus stage permission string | Use the same real V2 management matrix and direct full-workspace read denials. |
| Stage 7 | `canManage ? null : user.id` recipient filtering grants full Stage 7 workspace reads | Preserve notification type, upsert/deduplication/repair and participant-output wiring. Directly reject restricted/technical/non-manager workspace reads under the approved V2 full-project boundary. Retain the separate native assigned-recipient receipt/review, required rejection note and final-decision checks. |
| Stage 7 | Local `projectClosure.create`, `remainingUnits`/`canClose` and disabled direct-close button | Verify delegation to `finalizeProjectAsDirector` and exercise real prerequisites: missing sign-off, unresolved approval, mandatory external-project documents, owner request without finalization, Director decision, native closed-stage state, truthful closure actor and archive separation. Final completion moved into shared governance. |
| Concepts | Legacy global-administrator helper | Execute V2 management/completion/review/view/work matrix, including technical-only denial even when named owner, co-owner and executor; managers cannot review their own assigned concept; forged legacy SUPER_ADMIN objects grant nothing. |
| Concepts | Dead `: user.id` source branch proves executor filtering | Retain capability/selected-filter prop wiring; execute owner and Director listing/filter behavior and assert exact returned concept identity. |
| Concepts | Executor may open an unlocked empty full-stage workspace | Replace with direct full-list denial for Designer, Digital Lead, technical-only and non-manager SPM executors. The approved V2 read boundary reserves full workspaces for project managers. Existing actual assigned execution, creation, completion requests, unauthorized structural-edit and locked-stage tests remain. |
| Concepts | Ably token route must use the retired concept-participation helper | Execute the actual configured token route: every fixture role gets 403 for stage/project subscriptions; signed-out gets 401; no provider token is issued. V2 deliberately disables persistent project subscriptions because they cannot revalidate the current session on each event. |

Policy evidence: [V2 project read restrictions](../authorization/PROJECT-READ.md) and [project completion governance](../authorization/PROJECT-GOVERNANCE.md). The current native review/execution and technical/business separation rules were preserved. All other native checklist, handover, evidence, sample, concept creation/edit/review/lock, layout and notification source assertions remain.

The runtime integration config now compiles the actual sign-in server action. The existing project-write integration suite supplies the added management/read/realtime cases. No production regression was found or repaired. The remaining old source scans are intentionally reported as wiring checks; they are not presented as browser interaction coverage.

## Verification evidence

All required local checks passed. Private logs, receipts and screenshots are in `.tmp/phase41-closure/`.

| Check | Result |
| --- | --- |
| Full TypeScript (`pnpm exec tsc --noEmit --incremental false`) | PASS |
| Targeted ESLint, all Phase 4.1 implementation and closure TS/TSX/MJS files | PASS, 30 files, `--max-warnings 0`; exact list in `lint-files.json` |
| Fresh production build | PASS, isolated application copy with no environment files/live credentials; Next.js 16.2.6. One existing multiple-lockfile root-inference warning; no build error. |
| `stage-builder:check` | PASS, populated 112→113 rehearsal, 122→124 tables, unchanged prior rows/ledger, no backfill or drift, flag-off 112-schema behavior, registry/authorization/revision/concurrency/cloning/event/outbox safeguards |
| Broad V2 authorization integration | PASS, 112 checkpoints: administration, current sessions, workspace/project reads/writes, governance, files, approvals, events, completion documents, Archives and Library |
| Foundation/persistence, approval/event and Tasker/Sister units | PASS |
| All six Universal Tasker types and Sisters | PASS in the Stage Builder harness, including references, family traversal, lifecycle isolation, stale writes, source visibility and retained evidence |
| Repaired legacy Tasks suite | PASS, 66 task + 57 project-relationship + 3 historical-assignment assertions = 126; genuine V2 sessions, zero external requests |
| Repaired legacy concepts suite | PASS, seven suites, 887 assertions: 171 completion revocation, 142 skip revocation, 61 manual stage, 170 completion requests, 46 without-file completion, 188 native concepts, 109 Round 4. The unchanged skip-revocation concurrency test has conditional branches, so the previous run's 888 total is not copied forward. |
| `stage-five:ui-check` | PASS, 94 native source assertions + 30 isolated checkpoints |
| `stage-six:ui-check` | PASS, 73 native source assertions + 21 isolated checkpoints |
| `stage-seven:ui-check` | PASS, 81 native source assertions + 29 isolated checkpoints |
| `concept-stage:ui-check` | PASS, 54 native source assertions + 21 isolated checkpoints |
| Runner negative probes | PASS, six probes: each of four source failures exits 1; zero assertions and child-process failure also exit 1 |

The four runners execute **302 source assertions**. Their isolated checkpoint counts overlap, because each command independently runs its required behavior suite; they are not additive unique coverage. Stage Builder/broad integration and browser reports do not instrument individual assertion totals, so their successful named checks and process exits are reported instead.

| Fresh browser acceptance | Screenshots | Result |
| --- | ---: | --- |
| Stage Builder | 14 | PASS: three acceptance groups |
| Sister Tasks | 16 | PASS: two acceptance groups |
| Inspection / Initial Concept / Final Concept | 13 | PASS: three acceptance groups |
| General Tasker | 9 | PASS: three acceptance groups |
| File Upload / Data Input | 10 | PASS: one acceptance group |
| Current application on 112 migrations, Stage Builder disabled | 10 | PASS: four acceptance groups, Projects entry absent and draft API unavailable |
| Total | **72** | **Zero page errors; zero blocked external requests** |

All six browser processes exited 0. They use PostgreSQL 14.19, Chromium 153.0.8010.12 and fake local storage/consumers. The Stage Builder browser receipt has three completed check groups rather than a `status` field; its exit-0 receipt is recorded separately. No result was inferred from a screenshot alone. Desktop structure preview and mobile editor screenshots were visually inspected. All new accounts and business records were disposable fixtures.

Coverage includes Director global editing; SPM own drafts and cross-SPM isolation; restricted/technical denial; four capabilities and six information field types; ordered stages/gates; malformed keys, duplicate IDs, arbitrary expressions and invalid dependencies; immutable snapshots and truthful actor attribution; concurrent/stale edits; clone independence and stable field IDs; atomic draft/event/outbox rollback; absent publication/approval/activation routes; and unchanged approved Artwork preset/governance records in populated preservation rehearsals.

Limitations: no fresh interactive native Stage 5/6/7 browser walkthrough was added; their repaired commands combine native UI wiring checks with real V2 service/action tests. No live notification delivery, real S3 operation, provider restore drill, live account login, or active Neon Stage Builder session was attempted. Expected negative authorization/validation cases are assertions, not unreported errors. All final verification runs passed; the additional obsolete assertions found during repair are enumerated above.

## Independently verified Neon baseline

Read-only preflight completed at **2026-10-21T20:32:41.614Z** (2026-10-22 00:32:41 Dubai). Provider identity/recovery GETs and direct PostgreSQL snapshots were performed in this task; these results are not copied from the prior activation report.

| Identity | Verified value |
| --- | --- |
| Project | `flux-v2-dev` / `little-hall-78798085` |
| Branch | `develop` / `br-frosty-moon-b43rvpbe` |
| Database/schema | `neondb/public` |
| Server | PostgreSQL `18.6 (fd34222)` |
| Endpoint | `ep-raspy-salad-b4iqfan0` |
| Direct host | `ep-raspy-salad-b4iqfan0.c-6.us-east-2.aws.neon.tech` |
| Pooled host | `ep-raspy-salad-b4iqfan0-pooler.c-6.us-east-2.aws.neon.tech` |
| Direct fingerprint | `5b001dbfcdb263fa` |
| Pooled fingerprint | `9d6f1df51a9db284` |

Fingerprints are the first 16 hex characters of SHA-256 over `hostname:5432/neondb`, without credentials. Environment precedence, allowed connection options and optional direct-URL consistency were checked before connecting.

**Migration/schema:** all 112 existing migration names and full SHA-256 checksums match repository SQL and the previous activation ledger. Every ledger row is successful, with no failed or rolled-back migration. Exactly `20261023010000_stage_builder_drafts` is pending. There are 122 public tables including the ledger. Read-only Prisma diff against the committed Phase 3.4 schema is empty. The current candidate model diff exactly matches its reviewed table/index/FK/enum DDL. All existing constraints are validated, indexes valid/ready, and user triggers enabled. Existing columns, constraints, indexes, enums, functions and triggers match the earlier activation catalog.

**Data preservation:** full canonical-row SHA-256 fingerprints and counts were captured for all 122 tables, compared with the Phase 3.4 final snapshot, and captured again after the read-only checks. All 122 match in both comparisons, including all 112 ledger rows. The complete safe fingerprint artifact is `.tmp/phase41-closure/neon/table-fingerprints.json` (SHA-256 `73b3b08f7ef184e5cfde11d28b0cce2974f27fc61abc4c929ef83ed28fed312f`). It contains table names, counts and full-table hashes, never passwords, password hashes or session tokens.

- Nine accounts and their full User rows, including password storage, names and legacy roles are unchanged. User table SHA-256: `f0920a0c751e4f4d83db0baaa57581d8255ce6f49f9d306b669e0d45e082354e`.
- Nine authorization assignments, authorization versions/statuses and nine immutable authorization-change records are unchanged. Authorization table SHA-256: `c994e7b2c97aa5571eff7da3b81530c9f34dff79982f34282cd2f2fe3e8c8b36`. Exactly one Director and two technical-only administrators remain; all assignments are active at version 1, with no technical/business crossover.
- Three existing session rows are unchanged. The one approved Artwork compatibility preset and its one governance event are unchanged, including original approver, definition hash and approval timestamp. No draft, proposal, approval or project was created.
- Existing status-option rows are unchanged. Operational project/stage, six-type Tasker/Sister, shared-file, approval/event, Archive and Library tables remain empty on this development branch. Their structures were verified; populated preservation is covered by the isolated rehearsals, not misrepresented as populated Neon data.

**Flags and workspace:** `.env`, `.env.local`, `.env.example`, all 113 SQL files and the initially empty staged diff retain their starting fingerprints. A fresh Next environment loader confirms `FLUX_SHARED_FILE_IDENTITY`, `FLUX_APPROVAL_ENGINE`, `FLUX_SHARED_EVENTS`, `FLUX_UNIVERSAL_TASKER`, `FLUX_TASKER_DELIVERABLES`, `FLUX_TASKER_CONCEPTS` and `FLUX_TASKER_SISTERS` are all `1`. `FLUX_STAGE_BUILDER_DRAFTS` remains unset/disabled.

**Read-only safeguards/tooling:** PostgreSQL snapshot transactions and connection defaults were read-only, with 5-second lock and 30-second statement timeouts. Installed Prisma `6.19.3` schema engine independently passed a SELECT-only identity/read-only/5-second-lock/60-second-statement probe. Engine SHA-256: `caa2cf90d5b2cfe6cc06e47974f7e3275dd395b4d35cf140d5d4b2362c3b5bb1`. The two schema diffs generated SQL locally and did not execute it. Final observation: zero other sessions, active transactions, waiting locks or prepared transactions; public table/index storage was 5,996,544 bytes.

**Recovery:** Neon reports 21,600 seconds (six hours) of history retention. At `2026-10-21T20:30:55.215Z`, the provider successfully returned the 122-table historical schema requested for `2026-10-21T20:28:45.256Z`, including Sisters and excluding both draft tables. Historical schema SHA-256: `36f1f5c431aceff957b2275ecc5114fccd21fec67e99c74410944895148eb07d`. This establishes retention and historical-schema access; no restore drill or full data-backup verification was performed. Availability must be rechecked before any later approved application.

Evidence: `neon/preflight-passed.json`, `before.json`, `after-readonly.json`, `preservation-comparison.json`, `manifest.json`, `proposed-objects.json`, `baseline-diff.sql`, `candidate-diff.sql`, `event-guard-review.diff`, provider/recovery receipts and `engine-readonly.json` under `.tmp/phase41-closure/`. Existing event-guard code matches byte-for-byte after excluding only the new draft branch and local variable. No critical mismatch or remaining verification blocker was found.

## Exact migration candidate

`prisma/migrations/20261023010000_stage_builder_drafts/migration.sql`

```text
3527adb36ac84d49069e9f0db084af3df6af09d4bed890d5b64681afbd8430fe
```

The reviewed SQL is unchanged. Its complete object inventory is:

| Kind | Objects |
| --- | --- |
| Two new tables | `WorkflowDraft` (6 columns), `WorkflowDraftRevision` (15 columns) |
| Seven indexes including primary keys | `WorkflowDraft_pkey`; `WorkflowDraft_createdById_updatedAt_id_idx`; `WorkflowDraftRevision_pkey`; `WorkflowDraftRevision_eventId_key`; `WorkflowDraftRevision_sourceRevisionId_idx`; `WorkflowDraftRevision_workflowId_revision_key`; `WorkflowDraftRevision_actorId_commandId_key` |
| Five foreign keys, all `ON DELETE RESTRICT ON UPDATE RESTRICT` | `WorkflowDraft_createdById_fkey` → User; `WorkflowDraftRevision_workflowId_fkey` → WorkflowDraft; `WorkflowDraftRevision_actorId_fkey` → User; `WorkflowDraftRevision_sourceRevisionId_fkey` → WorkflowDraftRevision; `WorkflowDraftRevision_eventId_fkey` → BusinessEvent. The event FK is subsequently marked `DEFERRABLE INITIALLY DEFERRED`. |
| Two new checks | `WorkflowDraft_shape`, `WorkflowDraftRevision_shape` |
| Three new functions | `flux_draft_guard()`, `flux_draft_consistency()`, `flux_emit_draft_event()` |
| Six new triggers | `WorkflowDraft.flux_draft_guard`, `WorkflowDraft.flux_draft_truncate`, `WorkflowDraft.flux_draft_consistency` (deferred constraint trigger); `WorkflowDraftRevision.flux_draft_guard`, `WorkflowDraftRevision.flux_draft_truncate`, `WorkflowDraftRevision.flux_emit_draft_event`. Four are emitted by the reviewed two-table DO loop. |
| One enum addition | `BusinessEventType.WORKFLOW_DRAFT_REVISED` |
| Existing-object extensions | Drop/re-add `BusinessEvent_contract_check` with the additional draft branch; replace `flux_event_write_guard()` with an additional exact native draft-event branch and its local revision variable. Existing event trigger bindings remain. |

The SQL has an explicit `BEGIN`/`COMMIT`, no existing-row DML, no backfill, no draft seed, no grants, no publication/approval/runtime-stage creation, and no physical columns added to old tables. It contains no SQL lock or statement timeout. The Prisma model diff covers the two tables, indexes, restrictive FKs and enum; custom checks/functions/triggers require the separate SQL/catalog review.

Expected **only after separately approved application**: 113 successful migrations, zero failed/pending, 124 public tables including `_prisma_migrations`, empty draft tables and zero Prisma drift. Existing rows and old ledger entries must compare unchanged before enabling the flag.

## PostgreSQL 18, locks and failure behavior

SQL review found no PostgreSQL 18 incompatibility. Full execution and populated preservation rehearsals used installed PostgreSQL 14.19; no PostgreSQL 18 DDL rehearsal or Neon write was performed. This is a compatibility assessment, not a claim that the migration has executed on PostgreSQL 18.

PostgreSQL permits adding an enum value in a transaction but prohibits using that new value until commit. Here the check compares `type::text`; the new enum literal appears in a PL/pgSQL function body that is invoked only by later draft writes, after migration commit. No draft row is inserted during migration. [PostgreSQL 18 ALTER TYPE](https://www.postgresql.org/docs/18/sql-altertype.html)

The existing `BusinessEvent` check replacement requires an `ACCESS EXCLUSIVE` lock and validation scan, temporarily blocking readers/writers. Foreign keys also take `SHARE ROW EXCLUSIVE` locks on referenced User/BusinessEvent tables. New-table index creation concerns initially empty tables. Locks remain until transaction completion, and lock acquisition can wait behind application transactions. Read-only preflight lock observations are a point-in-time observation, not a guarantee at deployment. [PostgreSQL 18 ALTER TABLE](https://www.postgresql.org/docs/18/sql-altertable.html)

`CREATE OR REPLACE FUNCTION` preserves the existing event guard's identity and trigger dependencies. The added draft branch validates exact native revision, actor, sequence, hash-only payload and trigger depth; native Tasker/document branches and existing outbox delivery restrictions remain. Their integration regressions exercise the replacement on populated local fixtures. Deferred history consistency and the event FK check at commit; a deliberate outbox failure rolled back the entire draft write. [PostgreSQL 18 CREATE FUNCTION](https://www.postgresql.org/docs/18/sql-createfunction.html), [constraint trigger timing](https://www.postgresql.org/docs/18/sql-createtrigger.html)

A migration error before `COMMIT` aborts this SQL transaction. Prisma may retain a failed migration ledger entry; loss of acknowledgement after commit can leave a committed schema whose ledger must be inspected. A future execution must stop on either condition and keep the flag disabled—no automatic `migrate resolve`, reset, destructive down migration or retry. Once committed, removing the enum value or retained draft history is not a simple rollback. Recovery would require a separately reviewed forward correction or provider restore.

A future approved application should use the direct endpoint and exact installed Prisma engine, with bounded session `lock_timeout=5s` and `statement_timeout=60s`, without editing the approved SQL/hash. Repeat identity, migration checksums, pending set, full table fingerprints, recovery availability and lock checks immediately before execution. Apply only when this remains the sole pending migration. Verify the complete post-migration catalog and preservation before changing `.env.local`.

## Mandatory approval checkpoint — not executed

The repaired runners, required regressions, browsers and read-only preflight passed. The remaining limitations are the PostgreSQL 14 local rehearsal, absence of a provider restore drill, and absence of a new interactive native Stage 5/6/7 browser walkthrough; their scope is stated above. DDL locks must still be checked immediately before any approved execution.

Request explicit approval to apply **only** `20261023010000_stage_builder_drafts` with SHA-256 `3527adb36ac84d49069e9f0db084af3df6af09d4bed890d5b64681afbd8430fe` to the verified `flux-v2-dev/develop/neondb` target using installed Prisma migrate deploy, then enable `FLUX_STAGE_BUILDER_DRAFTS=1` in local `.env.local` **only after** 113 successful/zero failed or pending migrations, 124 tables, zero drift, full existing-data preservation and all new catalog guards are verified. Preserve the seven existing flags; verify a fresh Next process loads all eight and repeat the required isolated/browser checks afterward.

This is the explicit stop required by section 6 of the user's request. **No Neon migration, flag change, draft publication, runtime stage creation, S3 operation, external worker activation, push or deployment has been performed.**
