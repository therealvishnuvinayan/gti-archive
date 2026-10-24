# FLUX V2 — Phase 6.5: integrated verification and read-only activation preflight

24 October 2026 (Asia/Dubai), starting from clean commit `7a3b781`. **Verification/preflight only; not activated.** No Neon migration, business-data write, real S3 operation, actual environment edit, account change, worker activation, push or deployment occurred. Separate explicit approval is required for both migration execution and local flag activation.

## 1. Overall result and recommendation

The integrated Phase 6.1–6.4 workflows, populated migration rehearsal, current authorization/native regressions, full TypeScript, targeted ESLint, isolated production build and both Chromium configurations pass. Genuine persisted tests cover the 500/501 review boundary, 50/51 publication boundary, Tasker-derived source exclusion and attempted republication after Director deletion.

The read-only Neon preflight passes against the expected original development baseline. **Recommend controlled development activation of the revised candidate below, subject to separate approval and fresh prechecks.** This is not production acceptance or an assertion that every historical repository command is green: three obsolete static commands fail identically on the committed baseline, as detailed in section 4. No application policy was changed to satisfy those tests.

## 2. Exact candidate and the only migration correction

Candidate: `prisma/migrations/20261025010000_archive_folders/migration.sql`.

**Current SHA-256: `f654a4101f805a93544d34e22efd73d914234f0690451d2bbab8b8d80627e5b9`.**

The supplied Phase 6.4 checksum, `c4700cf0dc4288e31d34fc7cd52e6384ad45557515ff1f97c34c157d1517087a`, is now historical. That candidate lacked the requested SQL timeouts. The correction updates its introductory comment and adds these statements immediately after its existing `BEGIN`:

```sql
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
```

The transaction still ends with its existing `COMMIT`. No DDL definitions, permission rules, migration ordering or business data operations changed. The revised candidate was rehearsed successfully with the full integrated suite and both browser configurations. All 116 historical migration files match the original activation manifest and the actual Neon ledger, including complete checksums.

## 3. Complete catalog audit

[PHASE-6.5-OBJECTS.json](./PHASE-6.5-OBJECTS.json) contains every added object identity and complete PostgreSQL definition, all new table columns/defaults/nullability/types, and before/after definitions for each replacement. The SQL remains the authoritative executable source.

| Change relative to 116 migrations | Verified count |
| --- | ---: |
| New tables | 9 |
| Indexes, including primary-key indexes | 39 |
| Explicit constraints | 49: 34 foreign keys, 9 primary keys, 6 CHECKs |
| Functions | 21 |
| Triggers | 22 |
| Existing enum values added | 3 |
| Existing objects removed | 0 |

The tables are `ArchiveFolder`, `ArchiveFilePlacement`, `ArchiveOrganizationCommand`, `ArchiveVerificationDecision`, `RetainedArchiveSource`, `ArchiveGrantScope`, `ArchiveAccessDecision`, `RuntimeArchivePublication` and `RuntimeArchiveFile`.

Existing replacements are limited to `BusinessEvent_contract_check`, `UserArchiveAssetAccess_single_asset_check`, `flux_event_write_guard()`, `flux_shared_file_reference_guard()` and `BusinessEventType`. Its additions are `ARCHIVE_VERIFICATION_DECIDED`, `ARCHIVE_ACCESS_DECIDED` and `ARCHIVE_RUNTIME_PUBLISHED`. Extensions between Phase 6 subfeatures modify newly introduced objects within this same candidate.

Expected approved activation: **117 successful migrations, zero failed/pending migrations, 159 public tables, zero Prisma drift**. PostgreSQL 18 also records NOT NULL constraints explicitly: the baseline has 1,098 such entries; the 88 required new columns imply 88 additional entries. These are separate from the 49 explicit constraints above. Expected full catalog totals are 706 indexes, 89 functions, 219 triggers and 1,949 constraints including NOT NULL entries.

## 4. Regression, build and browser evidence

All mutations used disposable socket-only PostgreSQL **14.19**, genuine synthetic V2 sessions, isolated generated clients and fake storage. Browser tests used actual password sign-ins and persisted database assertions. No test connection accepted the Neon URL.

| Verification | Result |
| --- | --- |
| Combined folder / verification / sharing / runtime suite | PASS; folder moves, keyboard and drag/drop persistence, cycles, stale commands, privacy, exact versions, grants, audit, deletion and rollback |
| Verification/revocation | PASS; **50 expected denials**, 6 audit deliveries with replay |
| Sharing/expiry/revocation | PASS; **64 expected denials**, 13 audit deliveries with deduplication |
| Runtime Archive publication | PASS; **53 expected denials**, including genuine Tasker-derived stage evidence, rejected/failed versions, wrong identity, missing confirmation/reason, role attacks and retired-source republication |
| Persisted size boundaries | PASS; genuine completed projects containing 500 and 501 submissions; 500 reviewable, 501 denied; 50 exact files published, 51 rejected with no publication; 449 superseded versions excluded |
| Native Archive / Library / project read/write/governance / completion documents / Shared File Identity / events / sessions | PASS through the combined authorization runner |
| Universal Tasker, all six types, Sisters, Stage Builder and published versions | PASS through the complete Tasker/runtime runner |
| Runtime stages | PASS; **503 assertions** |
| Runtime creation / General Task / deliverables / concepts and Sisters / final completion | PASS; **49 / 463 / 376 / 483 / 340 assertions** respectively |
| Five Phase 5 candidates, including both POSM variants | PASS; **3,803 assertions**; candidate definitions, hashes and official status unchanged |
| Native tasks / user-project workflows | PASS; **66 / 57 assertions**, plus 3 historical assignment-migration assertions |
| Native concept, completion, skip, manual-stage and revision suites | PASS; **173 / 140 / 61 / 170 / 46 / 188 / 109 assertions** in their individual receipts |
| Authorization foundation/persistence, approval/event/Tasker unit checks | PASS |
| Archive access/edit/upload wizard, final permissions, AI Archive finder, Stage 5/6/7/concept UI checks, template-source check, caption checks | PASS |
| Full `pnpm exec tsc --noEmit --incremental false` | PASS |
| ESLint across all 60 Phase 6 executable files, `--max-warnings 0` | PASS |
| Isolated `pnpm build --webpack` | PASS compilation, TypeScript and page generation; existing `keyv → got → ably` dynamic-dependency warning |

Assertion totals are the individual suites' receipts, not a count of unique requirements. Some legacy suites emit scenario receipts without assertion totals; no totals were invented for them.

| Chromium 153.0.8010.12 | Folders enabled | Folders disabled |
| --- | ---: | ---: |
| Scenario groups | 14 | 11 |
| Screenshots | 24 | 19 |
| Expected denied/conflict responses | 17 | 12 |
| Unexpected HTTP responses | 0 | 0 |
| JavaScript errors | 0 | 0 |
| Failed file requests | 0 | 0 |
| External requests | 0 | 0 |

The browsers exercised actual completion, reviewed publication, pinned downloads, native Digital Lead verification, Director verification/revocation, Director/SPM sharing, Designer restrictions, revoked access, mobile dialogs and retained publication history. Nine synthetic account assignments stayed unchanged. The build contains no real environment files and uses an unreachable loopback build-only database URL.

**Historical static-check exceptions:** `phase0:check` and its umbrella `flow:check` still expect removed per-project Archive download/preview guard text. `project-create:v2-check` expects the old ADMIN-only co-owner selector. Both root failures were reproduced against unchanged commit `7a3b781`; these source-text expectations predate the central V2 policies. They were not counted as passes or repaired by restoring obsolete permissions. Current persisted native/project/Archive authorization tests pass. Follow-up maintenance of those historical checks remains separate from this activation package.

Two relevant fixture corrections are included: the authorization foundation test now expects SPM denial for `archive.revokeVerification`, and fake S3 emits the proper `NotFound` error for missing Tasker publication destinations. Corrected reruns pass. No production service or UI changes were needed.

## 5. Existing-data preservation

The populated 116→117 rehearsal compares all original rows and the complete historical ledger, then proves all nine new tables initially empty. There is no relocation, conversion, grant backfill, invented verification, automatic publication or old scalar-column alteration. Original Archive, Library, native project, approval, Tasker, runtime and shared-file structures survive unchanged. Current generated-client reads and disabled endpoints pass against the actual original 116-migration schema before candidate application.

Neon's read-only snapshot matches the prior Phase 4.4 activation evidence for every one of the **150 table counts and server-side SHA-256 preservation fingerprints**, the 116 ledger rows, accounts, authorization history, sessions, Artwork approval and full catalog. Passwords/session tokens participate only in server-side aggregate hashes; their raw values were not exported.

The live development database currently has nine nonempty tables: User (9), UserAuthorization (9), UserAuthorizationChange (9), Session (3), LegacyProjectPresetApproval (1), ProjectGovernanceEvent (1), ProjectStatusGroupOption (6), ProjectStatusOption (10), and the migration ledger (116). The remaining 141 business tables, including Archive, Library, runtime and Tasker content, are empty. Preservation of populated business workflows is therefore proved by the disposable rehearsal, not represented as existing live content.

All application source files, Phase 5 templates, historical migrations, three actual environment files and Git staging are preserved. All eleven existing V2 flags read `1` through a fresh Next.js environment-loader process; all four Phase 6 flags are unset. No activation approval or execution-attempt marker exists.

## 6. Authorization and functional boundaries

| Role | Verified boundary |
| --- | --- |
| Director | Global Archive management; eligible delete, exact verification/revocation, sharing and reviewed completed-runtime publication |
| SPM | Authorized management/sharing; cannot delete, verify/revoke or publish a RuntimeProject |
| Digital Lead | Permitted category management and file access; eligible historical native verification only; new preview/download grants do not delegate VERIFY |
| Designer | Explicit effective file grant plus category eligibility; preview/download only; restricted paths/counts/search and no private review history |
| JPM | No default Archive access |
| Technical-only administrator | No automatic business Archive authority |

Publication retains actual RuntimeProject, stage, Owner request, final Director decision, pinned workflow and original reference/version provenance. It creates no fabricated legacy Project ID, S3 copy or source-version mutation. Runtime files reuse existing folder, sharing and review services. Director deletion retains original runtime evidence, publication/review/access history and tombstones; a fresh republication command is denied.

## 7. Verified Neon target and baseline drift

| Item | Verified value |
| --- | --- |
| Project | `flux-v2-dev` / `little-hall-78798085` |
| Branch | `develop` / `br-frosty-moon-b43rvpbe`, ready |
| Database/schema | `neondb` / `public` |
| Server | PostgreSQL `18.6 (fd34222)` |
| Endpoint | `ep-raspy-salad-b4iqfan0`, same verified development branch |
| Direct host | `ep-raspy-salad-b4iqfan0.c-6.us-east-2.aws.neon.tech` |
| Pooled host | `ep-raspy-salad-b4iqfan0-pooler.c-6.us-east-2.aws.neon.tech` |
| Direct / pooled fingerprints | `5b001dbfcdb263fa` / `9d6f1df51a9db284` |
| Migration state | 116 successful, 0 failed; exactly the revised Phase 6 candidate pending |
| Public tables | 150 including Prisma ledger |
| Prisma and custom catalog drift | None |

Fingerprints are the first 16 hex characters of SHA-256 over `host:port/database`, not credential hashes. Both endpoints independently returned the expected database, schema, PostgreSQL version and ledger count. Direct reads enforced startup `default_transaction_read_only=on`. The pooler rejected `statement_timeout` in startup options; its identity probe instead used an explicit READ ONLY transaction with local timeouts and made no writes. Migration execution must use the direct endpoint. This matches [Neon's documented pooler limitation](https://neon.com/docs/connect/connection-errors#unsupported-startup-parameter).

The actual baseline exactly matches the disposable 116-migration catalog: 1,575 columns, 714 non-NOT-NULL constraints, 667 indexes, 348 enum labels, 68 functions and 197 triggers. PostgreSQL 18's 1,098 NOT NULL entries were separately inspected and retained. Complete definitions, including function bodies and trigger timing/deferral, match; checks are validated, indexes valid/ready and triggers enabled.

## 8. Recovery, PostgreSQL 18 and installed tooling

At **2026-10-23 21:34:15.978 UTC**, provider GETs reconfirmed `history_retention_seconds=21600`: **six hours**. Historical schema retrieval for `21:32:11.755 UTC` succeeded with 150 tables, SHA-256 `231c0e0ce92105e3f455a31304e28a694743872e1b87b6748d57dc045024d8a1`. Recovery availability was checked; no branch restore, data restoration or restore drill was executed. Availability must be checked again immediately before approval is acted on.

The SQL uses supported transactional DDL, deferred FKs, PL/pgSQL and existing PostgreSQL built-ins. Newly added enum labels are compared as text during migration and are consumed by runtime trigger executions after commit, consistent with [PostgreSQL 18 enum transaction rules](https://www.postgresql.org/docs/18/sql-altertype.html). Exact baseline deparser output matches the PostgreSQL 14 rehearsal, supporting the reviewed function/CHECK extensions. **PostgreSQL 14.19 mutation tests do not certify every PostgreSQL 18.6 runtime behavior.** No mutation rehearsal on Neon was authorized or performed.

Installed Prisma is **6.19.3**. CLI SHA-256: `c2a77456b70e8ba1e640e122824ed694433828a7c0d76ff3db7fc376b4b0e1a0`; schema-engine SHA-256: `caa2cf90d5b2cfe6cc06e47974f7e3275dd395b4d35cf140d5d4b2362c3b5bb1`. The actual installed engine passed a SELECT-only probe proving the expected target, read-only mode, five-second lock timeout and sixty-second statement timeout. `prisma migrate status` reported exactly one pending candidate (its expected exit code is 1).

## 9. Locks and uncertain outcomes

The initial live snapshot found **zero other sessions, zero other active transactions, zero waiting locks and zero prepared transactions**; total public-table storage was 7,053,312 bytes. The final recheck at **2026-10-23 21:40:33.174 UTC** preserved every table fingerprint, account/session, ledger and catalog definition, with zero Prisma drift. It observed one idle backend from this preflight's pooled probe (`flux_phase65_pooled_readonly`), with no transaction, transaction ID, snapshot horizon, held database locks or blockers. Active transactions, waiting locks and prepared transactions remained zero. No session was terminated. These are observations at those snapshots, not a reservation of the database for later activation. The final receipt is `.tmp/phase65-preflight/final-check.json`.

Replacing CHECK constraints on BusinessEvent and UserArchiveAssetAccess requires ACCESS EXCLUSIVE locks and validates existing rows without rewriting them. FK installation locks both referencing and referenced tables in SHARE ROW EXCLUSIVE mode. Creating triggers on existing Archive/grant tables also conflicts with writers. Locks remain until transaction end; concurrent reads can block CHECK replacement, and application writers can contend on referenced tables. Existing-table scans are small in this development baseline, but lock waits must still be bounded. See [PostgreSQL ALTER TABLE](https://www.postgresql.org/docs/18/sql-altertable.html) and [locking modes](https://www.postgresql.org/docs/18/explicit-locking.html).

Startup settings and the candidate's SET LOCAL statements enforce 5-second lock / 60-second statement timeouts. These are lock-wait and per-statement limits, not a blanket 60-second wall-clock guarantee for an entire migration. See [PostgreSQL timeout semantics](https://www.postgresql.org/docs/18/runtime-config-client.html).

A SQL error before COMMIT normally aborts the candidate transaction; Prisma may retain an unfinished/failed ledger record outside that transaction. Loss of connection near COMMIT can leave an uncertain client result even when DDL committed. Never infer rollback or success from the process exit alone. Capture the actual ledger and full catalog first, stop, and request a separately reviewed next action. No automatic retry, reset, repair, resolve, destructive down migration or recovery is authorized. Turning flags off does not undo database guards, records or retained history.

## 10. Exact proposed activation procedure — NOT EXECUTED

Prepared, syntax-checked local procedures are in `.tmp/phase65-preflight/`. They cannot execute the migration without a separate `APPROVAL.json` identifying this exact candidate/hash/project/branch. That approval file has deliberately not been created. Private evidence and credentials are not committed.

1. Obtain separate explicit user approval for the revised SHA-256 in section 2, development target in section 7, and subsequent activation of exactly four local flags. Record that authorization; do not reuse approval of the old checksum.
2. Recheck workspace/environment/staging preservation, all 117 reviewed file hashes, the sole pending candidate, 116 ledger checksums, target/provider identity, six-hour recovery availability, every table fingerprint, accounts/sessions/approval, full catalog, zero drift and operational state. Stop for any critical difference. Do not terminate other sessions. Only an inspected idle backend with no transaction, snapshot horizon, blockers or held database locks is acceptable.
3. Run `node .tmp/phase65-preflight/execute-approved-once.cjs` **once**. It repeats provider/SELECT-only/Prisma-engine/status checks; captures an immediate-before snapshot; verifies SQL timeouts; creates an exclusive write-once attempt marker; and calls the installed Prisma CLI with `migrate deploy --schema <reviewed/schema.prisma>`. Both `DATABASE_URL` and `DIRECT_URL` are provided only in the child environment using the verified **direct** endpoint and startup `options=-c lock_timeout=5000 -c statement_timeout=60000`. The reviewed directory contains all 116 unchanged historical migrations and only this one pending candidate. No environment file supplies a different migration target.
4. Irrespective of execution result, capture actual ledger/catalog state. If execution is failed, interrupted, uncertain or postchecks differ, stop. Leave flags off and report the actual successful/unfinished migration rows and object inventory. Do not run the procedure again or remove its attempt marker.
5. On a confirmed successful execution, run `node .tmp/phase65-preflight/postcheck-approved.cjs`. Require 117 successful / zero failed / zero pending migrations, 159 exact tables, all nine new tables empty, every old table fingerprint and all 116 old ledger rows unchanged, all new/replaced definitions equal to the rehearsal, all 88 PostgreSQL 18 NOT NULL additions correct, original accounts/sessions/approval preserved, and zero Prisma drift.
6. Only after that postcheck passes, run `node .tmp/phase65-preflight/enable-approved-local.cjs`. It requires explicit flag approval and a fresh passing postcheck, verifies original environment hashes, saves a private local backup, and appends only `FLUX_ARCHIVE_FOLDERS=1`, `FLUX_ARCHIVE_VERIFICATION=1`, `FLUX_ARCHIVE_SHARING=1`, `FLUX_ARCHIVE_RUNTIME=1` to `.env.local`. The existing eleven enabled switches and all other content remain unchanged. Any unexpected existing flag definition stops this prepared edit for review.
7. In a fresh process, run `node .tmp/phase65-preflight/verify-activated-flags.cjs` using Next.js's own environment loader; verify all fifteen flags. Restart any existing Next.js development process so it loads the new environment. Do not perform business mutations against Neon for acceptance.
8. Repeat isolated Archive integration, authorization, TypeScript, targeted ESLint, production build, Tasker/runtime/template/native regressions and both Chromium configurations with genuine synthetic sessions and fake S3. Keep their injected disposable URLs; never substitute Neon or run legacy helpers that derive a test schema from `.env`.
9. Take a final SELECT-only live snapshot and zero-drift comparison against the successful post-migration snapshot. Prove that local tests produced no Neon business writes and the nine new tables remain empty. Report activation success only after real postchecks, flag verification and isolated regressions pass.

The prepared scripts have been syntax-checked; their write branches have not been executed. They are a concrete proposed procedure, not an activation receipt.

## 11. Limitations retained

- Runtime Archive publication is Director-only and requires reviewed, explicitly selected non-sensitive eligible completed-stage outputs. There is no automatic publication or content classifier.
- Completion documents, invoices/legal/authority evidence, Tasker files, conversations and Tasker-derived stage submissions remain excluded.
- New runtime preview/download grants do not delegate Digital Lead verification; changing that policy/adapter requires separate approval.
- Historical files without genuine immutable exact identity remain unavailable for verification. No verification history or source identity is manufactured.
- Category/folder visibility does not confer file access. Revocation/expiry denies subsequent protected requests; old direct S3 URLs can remain valid until their original expiry, up to five minutes, and already-running transfers are not recalled.
- No real S3/IAM/version-retention acceptance, formal production QA, PostgreSQL 18 mutation rehearsal or executed restore drill. Logical dump/restore behavior is also unverified; the runtime native-grant CHECK calls a cross-table identity function, so restoration ordering deserves dedicated testing before production, consistent with [PostgreSQL's CHECK limitations](https://www.postgresql.org/docs/18/ddl-constraints.html).
- Official GTI template designation remains unapproved; Phase 5 candidates/hashes and unsupported external runtime submissions are unchanged. No Tasker-to-stage gates, notifications, workers or Phase 7 work were introduced.

## 12. Reproduction and evidence

Primary integrated command:

```sh
node scripts/run-archive-folders-isolated.mjs --verification --sharing --runtime --evidence-dir=.tmp/phase65-preflight
```

Authorization: `node scripts/run-authorization-isolated-integration.mjs --archives --library --project-read --project-write --project-governance --completion-documents --runtime --file-identity --events`.

Tasker/runtime/templates: `node scripts/run-universal-tasker-isolated.mjs --stage-runtime --runtime-integration --standard-templates`.

Chromium: use `FLUX_BROWSER_BUILD=/private/tmp/flux-phase65-build-YUa65c` and `scripts/archive-folders-browser-check.mjs --verification --sharing --runtime`, with and without `--without-folders`, and distinct artifact directories.

Private evidence root: `.tmp/phase65-preflight/`. It retains `local-before.json`, `local-preservation.json`, the reviewed 117-file manifest/schema, complete disposable before/after snapshots, migration inventory, suite logs, historical baseline-failure reproductions, both browser reports/screenshots, provider/recovery receipts, `before.json`, `read-preflight.json`, `cross-version-catalog.json`, engine/Prisma-status/pooled-probe receipts, flag receipt, final live snapshot/drift/preservation receipt and the guarded proposed activation procedures. No raw passwords or session tokens were exported in database snapshots. The existing synthetic build artifacts and screenshots remain local.

**Stop point: approve the revised candidate and controlled development activation separately. Until then, Neon stays at 116 migrations / 150 tables and all four Phase 6 flags stay off/unset.**
