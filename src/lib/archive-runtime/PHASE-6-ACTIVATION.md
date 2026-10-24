# FLUX V2 — Phase 6 Activation Report

24 October 2026, Asia/Dubai. Starting commit: `6c4395610164435875dde12220b08843db0cce5f`.

**Controlled development activation completed.** The single authorized migration succeeded; every database postcheck and final preservation check passed. All fifteen V2 flags are enabled locally. The required isolated regressions passed with exactly the three acknowledged historical static-check exceptions. No application or authorization behavior was changed. Work stopped after Phase 6 activation verification.

## Authorization and target

The user's explicit approval authorized one attempt at controlled development activation, followed by local flags only after all database postchecks passed. No additional migration, production deployment, live S3 operation, real business-data seeding, account change, external worker, notification or Phase 7 work was authorized or performed.

| Item | Verified value |
| --- | --- |
| Neon project | `flux-v2-dev` / `little-hall-78798085` |
| Branch | `develop` / `br-frosty-moon-b43rvpbe` |
| Database / schema | `neondb` / `public` |
| Server | PostgreSQL `18.6 (fd34222)` |
| Direct endpoint | `ep-raspy-salad-b4iqfan0.c-6.us-east-2.aws.neon.tech` |
| Direct / configured pooled identity fingerprints | `5b001dbfcdb263fa` / `9d6f1df51a9db284` |
| Candidate | `20261025010000_archive_folders/migration.sql` |
| Required and executed SHA-256 | `f654a4101f805a93544d34e22efd73d914234f0690451d2bbab8b8d80627e5b9` |
| Installed Prisma | `6.19.3` |
| Lock / statement timeout | 5 seconds / 60 seconds |

Fingerprints are SHA-256 prefixes over `host:port/database`, not credential hashes. Migration execution used the verified direct endpoint in both injected connection variables. Existing environment files were not used to choose a different migration destination. The installed CLI and schema-engine hashes matched the reviewed preflight package.

## Fresh prechecks

Provider GETs reconfirmed project, branch, endpoint and database identity. At **03:03:12.654 UTC**, the project retained a **21,600-second (six-hour)** recovery window. Historical schema retrieval for **03:01:02.283 UTC** succeeded with 150 tables and SHA-256 `231c0e0ce92105e3f455a31304e28a694743872e1b87b6748d57dc045024d8a1`. No restore or restore drill was performed.

All 117 migration files matched the reviewed manifest, including all 116 historical checksums. The database had exactly 116 successful migrations, no failed migrations, and only the approved candidate pending. All 150 table fingerprints, complete historical ledger, accounts, sessions, Artwork approval and full catalog matched the prior activation baseline. Prisma drift was empty.

The installed Prisma engine passed a SELECT-only identity/read-only/timeout probe. The immediate-before snapshot began at **03:04:17.038 UTC**, with zero other sessions, zero other active transactions, zero waiting locks, zero prepared transactions and no other held database locks. No session was terminated. Environment files and Git staging also matched the reviewed state.

## Single execution and immediate postchecks

The exclusive attempt marker was created at **03:04:55.989 UTC**. The installed Prisma CLI ran `migrate deploy` once against the reviewed schema and migration directory. Both startup options and the unchanged candidate's `SET LOCAL` statements enforced the approved timeouts.

| Execution evidence | Actual result |
| --- | --- |
| Attempts | **1** |
| CLI return | Exit 0; no signal or execution error |
| New ledger ID | `d45d95c2-a369-4ea7-9d76-e016272f7a59` |
| Database migration start | `2026-10-24T03:05:03.680932+00:00` |
| Database migration finish | `2026-10-24T03:05:05.369575+00:00` |
| Applied steps | 1 |
| Ledger logs / rolled back timestamp | Both null |
| Successful / failed / pending migrations | **117 / 0 / 0** |
| Public tables | **159** |

The actual ledger and catalog were read after execution before its exit status was accepted. Complete postchecks passed at **03:06:51.965 UTC**. No retry, reset, repair, resolve, rollback, recovery operation or second migration was attempted.

All 149 pre-existing non-ledger tables retained their exact row counts and server-side preservation fingerprints. All 116 original ledger rows remained byte-for-byte equivalent in the canonical snapshot; the ledger gained only the approved migration. Passwords and session tokens participated in server-side aggregate hashes without exporting their raw values.

All nine new tables were empty:

| Table | Rows |
| --- | ---: |
| ArchiveAccessDecision | 0 |
| ArchiveFilePlacement | 0 |
| ArchiveFolder | 0 |
| ArchiveGrantScope | 0 |
| ArchiveOrganizationCommand | 0 |
| ArchiveVerificationDecision | 0 |
| RetainedArchiveSource | 0 |
| RuntimeArchiveFile | 0 |
| RuntimeArchivePublication | 0 |

The complete live definitions matched the reviewed disposable catalog. Existing PostgreSQL 18 NOT NULL constraints were preserved and all 88 new NOT NULL constraints were checked individually. Constraints were validated, indexes valid/ready, and triggers enabled. Prisma drift was empty.

| Final schema inventory | Count |
| --- | ---: |
| Columns | 1,679 |
| Constraints, including NOT NULL | 1,949 |
| NOT NULL constraints | 1,186 |
| Indexes | 706 |
| Enum labels | 351 |
| Functions | 89 |
| Triggers | 219 |

The approved delta is nine tables, 39 indexes, 49 explicit constraints, 21 functions, 22 triggers and three enum labels. Only the five reviewed existing objects were replaced: `BusinessEventType`, `BusinessEvent_contract_check`, `UserArchiveAssetAccess_single_asset_check`, `flux_event_write_guard()` and `flux_shared_file_reference_guard()`. Full definitions remain in [PHASE-6.5-OBJECTS.json](./PHASE-6.5-OBJECTS.json).

## Local activation

After the passing postcheck, the prepared procedure appended exactly these four settings to `.env.local`:

```dotenv
FLUX_ARCHIVE_FOLDERS=1
FLUX_ARCHIVE_VERIFICATION=1
FLUX_ARCHIVE_SHARING=1
FLUX_ARCHIVE_RUNTIME=1
```

A fresh Node process using Next.js `@next/env` confirmed all fifteen flags at **03:06:54.516 UTC**. The existing eleven remained `1`: `FLUX_SHARED_FILE_IDENTITY`, `FLUX_APPROVAL_ENGINE`, `FLUX_SHARED_EVENTS`, `FLUX_UNIVERSAL_TASKER`, `FLUX_TASKER_DELIVERABLES`, `FLUX_TASKER_CONCEPTS`, `FLUX_TASKER_SISTERS`, `FLUX_STAGE_BUILDER_DRAFTS`, `FLUX_STAGE_BUILDER_PUBLICATION`, `FLUX_STAGE_RUNTIME` and `FLUX_RUNTIME_INTEGRATION`.

The original `.env.local` content was preserved exactly before the approved append; a private backup and before/after hashes are retained. `.env` and `.env.example` are unchanged. No development server was listening on port 3000 during the activation check; acceptance uses a separate disposable application process.

## Isolated regressions

All workflow mutations used disposable socket-only PostgreSQL **14.19**, synthetic accounts/sessions and fake storage. The production build ran from a separate temporary directory with all fifteen flags injected, no copied environment files and an unreachable `127.0.0.1:1` build-only database URL. All 670 copied application source hashes matched the approved workspace. Chromium used genuine synthetic password sign-ins, an isolated application and fake S3; Node and browser guards blocked external destinations.

| Verification | Actual result |
| --- | --- |
| Combined Archive folders / verification / sharing / runtime | PASS; populated 116→117 migration preserves original rows/ledger; zero drift; complete catalog matches live postchecks |
| Exact-version verification and revocation | PASS; 50 expected denials, six audit deliveries with replay |
| Sharing, expiry and revocation | PASS; 64 expected denials, 13 audit deliveries with deduplication |
| Completed-runtime publication | PASS; 53 denied attacks; genuine Owner request/Director completion, Tasker-derived source exclusion, retained-source republication denial, replay/race/rollback |
| Persisted boundaries | PASS; 500 reviewable / 501 denied; 50 exact files published / 51 rejected without publication; 449 superseded versions excluded; sources unchanged and no Archive storage writes |
| Authorization / native Archives / Library / project read/write/governance / completion documents / files / events | PASS; combined disposable authorization runner, all nine identities and current-session enforcement |
| Universal Tasker / all six types / Sisters / Stage Builder / publication | PASS; published-workflow suite reports 414 assertions |
| Runtime stages | PASS; 503 assertions |
| Runtime creation / General Task / deliverables / concepts and Sisters / completion | PASS; 49 / 463 / 376 / 483 / 340 assertions |
| Five Phase 5 templates, including both POSM variants | PASS; 3,803 assertions; no external requests |
| Native tasks / user-project workflows | PASS; 66 / 57 assertions plus three assignment-migration assertions |
| Native concept completion/revocation, skip, manual stage, request, no-file, integration and round-four checks | PASS; current receipts report 171 / 142 / 61 / 170 / 46 / 188 / 109 assertions |
| Full TypeScript | PASS: `pnpm exec tsc --noEmit --incremental false` |
| ESLint | PASS: all 60 reviewed Phase 6 executable files, `--max-warnings 0` |
| Production build | PASS: `pnpm build --webpack`, including compilation, TypeScript and page generation |
| Additional native/static command set | 18 pass; three acknowledged historical exceptions reproduced, detailed below |

The build retains the previously documented `keyv → got → ably` dynamic-dependency warning. It completed with exit 0. Assertion totals describe individual receipts, not unique requirements.

The additional passing commands were `authorization:foundation-check`, `authorization:persistence-check`, `approvals:unit-check`, `events:unit-check`, `tasker:unit-check`, `tasks:integration-check`, `concept-stage:completion-check`, `stage-five:ui-check`, `stage-six:ui-check`, `stage-seven:ui-check`, `concept-stage:ui-check`, `archive:access-level-check`, `archive:edit-check`, `archive:direct-wizard-check`, `permissions:final-check`, `flux-ai:archive-finder-check`, `standard-templates:source-check` and `phase3:check`. The template-source check retained 523 paragraphs and source SHA-256 `4d86f90d173a406ad9f3a5ffbba7ce55776b5d209f4bc2a0e4653f299d61b944`.

The three acknowledged exceptions were run and **failed**, rather than being counted as passes:

| Command | Reproduced obsolete assertion |
| --- | --- |
| `phase0:check` | `project archive download per-project guard is missing.` |
| `flow:check` | Same historical per-project Archive guard assertion |
| `project-create:v2-check` | `ADMIN-only co-owner candidates is missing.` |

These match the documented pre-activation exceptions. No authorization, application behavior, or tracked test was changed to satisfy them. Persisted current authorization/project/Archive workflows pass.

Both Chromium **153.0.8010.12** configurations passed against the freshly built application:

| Browser evidence | Folders enabled | Folders disabled |
| --- | ---: | ---: |
| Scenario groups | 14 | 11 |
| Screenshots | 24 | 19 |
| Expected denied/conflict responses | 17 | 12 |
| Unexpected HTTP responses | 0 | 0 |
| JavaScript errors | 0 | 0 |
| Failed file requests | 0 | 0 |
| External requests | 0 | 0 |

Both covered actual Owner completion request and Director completion, reviewed RuntimeProject publication, exact protected bytes, grants/revocation, independent verification/revocation, role-specific access and responsive dialogs/history. All nine synthetic account assignments were preserved. Disposable application, database and object fixtures were removed after each run.

## Final preservation

The final read-only Neon check passed at **2026-10-24 03:13:09.669 UTC** (**07:13:09.669 Asia/Dubai**), after every isolated regression finished:

| Final check | Result |
| --- | --- |
| Successful / failed / pending migrations | **117 / 0 / 0** |
| Public tables / Prisma drift | **159 / zero** |
| All 159 post-migration table fingerprints | Unchanged |
| All 117 post-migration ledger rows | Unchanged |
| Complete post-migration catalog definitions | Unchanged |
| Nine new Archive tables | All empty |
| Users / authorizations / authorization history | **9 / 9 / 9**, unchanged |
| Sessions | **3**, unchanged |
| Historical Artwork approval / governance event | **1 / 1**, unchanged |
| Other sessions / active transactions / waiting locks / prepared transactions | **0 / 0 / 0 / 0** |
| Public-table storage | 7,446,528 bytes |

The nine nonempty tables remain User (9), UserAuthorization (9), UserAuthorizationChange (9), Session (3), LegacyProjectPresetApproval (1), ProjectGovernanceEvent (1), ProjectStatusGroupOption (6), ProjectStatusOption (10), and the migration ledger (117). The remaining **150 tables are empty**. No test data reached Neon. The existing account assignment remains one Director, two SPMs, one JPM, two Designers, one Digital Lead and two technical-only administrators; status, privileges and authorization versions are unchanged.

Local verification at **03:12:09.385 UTC** passed: all **1,128 original tracked files**, including **670 application source files**, all 117 migrations and Phase 5 template definitions are unchanged; Git HEAD/staging are unchanged. `.env.local` contains only the approved append, with all other original bytes retained. The sole new repository file is this report. A second fresh Next.js environment-loader process at **03:12:09.424 UTC** again verified all fifteen flags enabled.

## Retained boundaries and limitations

- Completed-runtime Archive publication remains Director-only, with a reviewed explicit manifest, reason and confidentiality confirmation. Review is bounded at 500 submissions and publication at 50 exact files. There is no automatic publication or content classifier.
- Tasker files, conversations, Tasker-derived stage evidence, completion documents and financial/legal/authority evidence remain excluded. Runtime identity, original reference/version, Owner request and final Director approval provenance are retained without fabricated legacy Project IDs or publication-time S3 copies.
- New runtime preview/download grants do not delegate Digital Lead verification. Category/folder visibility does not itself grant file access. Director deletion preserves source evidence, history and tombstones and prevents republication of the retired source.
- Revocation/expiry denies subsequent protected requests. Previously issued direct S3 URLs can remain valid until their original expiry, up to five minutes; already-running transfers are not recalled.
- Live PostgreSQL 18.6 migration/catalog verification and disposable PostgreSQL 14.19 workflow tests are distinct evidence. No live S3/IAM/version-retention acceptance, production QA, executed restore drill or logical dump/restore ordering test was performed. The previously documented cross-table identity CHECK restore-ordering limitation remains.
- Phase 5 candidate definitions, hashes and official status are unchanged. Official GTI template designation remains unapproved. No external runtime submissions, new workers, notification delivery or Phase 7 work was introduced.

## Evidence

Private local evidence is under `.tmp/phase6-activation/`, separate from the historical `.tmp/phase65-preflight/` package. It contains the explicit approval record, immutable attempt marker, reviewed files and manifest, provider/recovery receipts, before/after snapshots, migration output/result, complete postcheck, private environment backup, fresh flag receipt, isolated regression logs, browser reports/screenshots and final preservation receipts.

The principal isolated commands were:

```sh
node scripts/run-archive-folders-isolated.mjs --verification --sharing --runtime --evidence-dir=.tmp/phase6-activation/rehearsal
node scripts/run-authorization-isolated-integration.mjs --archives --library --project-read --project-write --project-governance --completion-documents --runtime --file-identity --events
node scripts/run-universal-tasker-isolated.mjs --stage-runtime --runtime-integration --standard-templates
pnpm exec tsc --noEmit --incremental false
```

`lint-files.json` records the exact 60-file ESLint scope. `build.mjs` and `build-isolation.json` record isolated build inputs and preservation. The browser runs used `/private/tmp/flux-phase6-activation-build-qBlUKy`, `scripts/archive-folders-browser-check.mjs --verification --sharing --runtime`, with and without `--without-folders`, and separate `browser-folders` / `browser-legacy` artifact directories. The completed build's disposable cache was removed; the build and screenshot evidence remain local.

Key receipts: `EXECUTION-ATTEMPT.json`, `execution-result.json`, `immediate-before.json`, `actual-after.json`, `postcheck-live.json`, `postcheck.json`, `flag-edit.json`, `activated-flags.json`, each `*-result.json`, `regressions.json`, both browser `result.json` files, `local-preservation.json`, `final-live.json` and `final-check.json`. The prepared `execute-approved-once.cjs` refuses to execute again once its attempt marker exists; it must not be rerun for this approval.

The historical [Phase 6.5 report](./PHASE-6.5.md) describes the pre-approval state. This report records the subsequent explicitly approved activation. Credentials and private database evidence are not included in repository documentation.
