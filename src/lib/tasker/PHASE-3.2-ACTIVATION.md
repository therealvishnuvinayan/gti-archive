# Phase 3.2 — controlled development activation

**PASS — development migration and local activation completed on 2026-10-21.** Only the explicitly approved migration was applied, once. Final read-only verification completed at **2026-10-21T17:24:23.015Z**. This supersedes the pending-approval status in the [preflight report](PHASE-3.2-PREFLIGHT.md).

## Authorized target and execution

| Field | Verified value |
| --- | --- |
| Neon project | `flux-v2-dev` / `little-hall-78798085` |
| Branch | `develop` / `br-frosty-moon-b43rvpbe` |
| Database / schema | `neondb` / `public` |
| PostgreSQL | `18.6 (fd34222)` |
| Endpoint | `ep-raspy-salad-b4iqfan0` |
| Direct host | `ep-raspy-salad-b4iqfan0.c-6.us-east-2.aws.neon.tech` |
| Pooled host | `ep-raspy-salad-b4iqfan0-pooler.c-6.us-east-2.aws.neon.tech` |
| Direct / pooled fingerprint | `5b001dbfcdb263fa` / `9d6f1df51a9db284` |

Endpoint fingerprints are 16-character SHA-256 prefixes over host, port and database, excluding credentials. Provider identity and direct SQL identity agreed.

Migration: **`20261021230000_universal_tasker_deliverables`**.

Verified full SHA-256:

```text
547060da2b87852e8c4e8fc9eb0cd6f930abcf788c007e08ba113e76f8ffed37
```

Execution started at `2026-10-21T17:17:58.030Z` and completed successfully at `2026-10-21T17:18:08.499Z`. Prisma reported exactly this migration applied. The executor records an exclusive attempt marker before calling `migrate deploy`; attempts: **1**. No retry, repair, reset or additional live migration was performed. All migration SQL and the 48 reviewed source files matched the preceding approved review before execution.

Immediately beforehand, read-only checks repeated project/branch/endpoint identity, PostgreSQL version, all 109 ledger checksums, exactly one pending migration, no drift, every table fingerprint, account/governance state and database locks. There were zero other active transactions, waiting locks or prepared transactions; one other idle session existed. Another complete preservation snapshot immediately preceded execution.

Recovery retention remained **21,600 seconds / six hours**. Historical schema retrieval at `2026-10-21T17:12:40.957Z` succeeded with all 116 baseline tables. This was a retention/historical-access check, not a restore drill. No recovery branch was created.

## Database results

| Measure | Before | Verified after |
| --- | ---: | ---: |
| Successful migrations | 109 | **110** |
| Failed migrations | 0 | **0** |
| Pending migrations | 1 | **0** |
| Public tables, including Prisma ledger | 116 | **119** |
| Prisma schema drift | None | **None** |

The new `UniversalTaskTarget`, `UniversalTaskApplication` and `UniversalTaskPublication` tables exist and remain empty. No test task/project or backfill was created in Neon.

Catalog validation checked exact definitions against the reviewed migration chain, plus function bodies directly against the approved SQL:

- Nine restrictive foreign keys and ten indexes including three primary keys.
- Three new CHECK constraints and three reviewed replacements.
- Twenty-one new PostgreSQL 18 NOT NULL constraints.
- Three new trigger functions and four reviewed function replacements.
- Ten new triggers, including four initially deferred consistency triggers.
- The `TASK_DELIVERABLE_ACCEPTED` activity enum value.

Every constraint is validated, every index valid/ready and every trigger enabled. Existing catalog changes are limited to the reviewed three CHECK replacements, four function replacements, enum addition and new objects. Existing columns and other definitions remain unchanged. A final read-only snapshot after all verification confirms no further database data or catalog changes.

## Preservation

All **115 pre-existing non-ledger tables** retain identical counts and canonical full-row SHA-256 fingerprints. All **109 previous migration ledger rows** are exactly unchanged; only the approved new ledger row was added.

All nine accounts, stored passwords, names, legacy roles, V2 roles/privileges, account status, authorization versions, three sessions and nine authorization-change records are unchanged. There remains one Director, two SPMs, one JPM, two Designers, one Digital Lead and two technical-only administrators. The Director-approved Artwork preset, its definition/approval record and governance event are unchanged.

| Full-record preservation fingerprint | SHA-256 |
| --- | --- |
| User records, including stored passwords | `f0920a0c751e4f4d83db0baaa57581d8255ce6f49f9d306b669e0d45e082354e` |
| UserAuthorization records | `c994e7b2c97aa5571eff7da3b81530c9f34dff79982f34282cd2f2fe3e8c8b36` |

Raw passwords and session tokens were not printed or exported. Fingerprints were computed inside PostgreSQL. General Task, native concept, file, approval/event, Archive and Library structures are preserved. Their operational live tables were empty before and remain empty; populated General/native/file/history preservation was separately exercised in disposable migration tests.

## Local activation and fresh Next.js verification

After database postchecks passed, only local **`.env.local`** was changed at `2026-10-21T17:19:25.392Z`, adding `FLUX_TASKER_DELIVERABLES=1`. Reversing that single addition reproduces the exact prior file hash. Every other environment file remains byte-identical, and the four existing flag settings were preserved.

```text
FLUX_SHARED_FILE_IDENTITY=1
FLUX_APPROVAL_ENGINE=1
FLUX_SHARED_EVENTS=1
FLUX_UNIVERSAL_TASKER=1
FLUX_TASKER_DELIVERABLES=1
```

A fresh Next.js production process loaded these five values from actual local configuration at `2026-10-21T17:21:07.810Z` and reached Ready. Its configured database identity was checked before replacing the connection with disabled loopback for startup safety. No application HTTP request was made; recorded HTTP, fetch and socket connection counts were all zero. The verification process was then stopped. This verifies actual Next.js configuration loading/startup without using real accounts or triggering live application writes.

## Required verification after activation

All checks below ran after the flag change, using the same reviewed application source:

| Check | Result |
| --- | --- |
| Full TypeScript, no incremental cache | PASS |
| Targeted ESLint on all 41 reviewed TS/TSX/MJS/CJS files, zero warnings | PASS |
| Production `pnpm build` | PASS |
| General, File Upload and Data Input integration | PASS |
| Populated migration preservation and pre-candidate General compatibility | PASS |
| Tasker, approval and event units; authorization foundation/persistence | PASS |
| Authorization/session/administration/workspace/project read-write/governance, completion documents, file identity/provenance, approval/event transactions and dispatcher, Archives and Library | PASS — 107 PASS summaries |
| Repaired `tasks:integration-check` | PASS — 126 assertions, including three historical-assignment migration assertions |
| Repaired `concept-stage:completion-check` | PASS — 888 assertions across all seven suites |
| General Task browser suite | PASS — 9 screenshots |
| Deliverables browser suite | PASS — 10 screenshots |

Detailed legacy execution counts:

| Suite | Assertions | Result |
| --- | ---: | --- |
| tasks-integration-check | 66 | PASS |
| user-projects-integration-check | 57 | PASS |
| project-concept-completion-revocation-check | 171 | PASS |
| project-stage-skip-revocation-check | 143 | PASS |
| project-concept-manual-stage-check | 61 | PASS |
| project-concept-completion-request-check | 170 | PASS |
| project-concept-without-file-check | 46 | PASS |
| project-concept-integration-check | 188 | PASS |
| project-concept-round-four-integration-check | 109 | PASS |

No legacy suite was retired or skipped. Race-dependent assertion counts can vary between runs. Every suite reported genuine V2 sessions and zero external requests.

Coverage confirms executor upload without destination-folder access; unpublished evidence before acceptance; exactly-once accepted publication and replay; rejection/revoked-authority denial; storage and post-copy database/outbox rollback without false completion; durable reservation reconciliation and explicit retry; stale/concurrent Data Input conflict protection; unsupported-field denial; and continued General/native concept behavior.

Both browser suites used real sign-ins for synthetic identities, Chromium `153.0.8010.12`, isolated local PostgreSQL and fake storage. Director, SPM, JPM, Designer, Digital Lead, unrelated and technical-only cases passed. Both reported zero page errors and zero external requests. No existing development account was used for acceptance tests.

## Limits and scope

The migration and catalog postchecks ran on the actual PostgreSQL **18.6** development database. Behavioral mutation suites and browser fixtures ran on disposable PostgreSQL **14.19**; no PostgreSQL 18 workflow fixture or restore drill was performed. Real S3 durability/publication behavior was not exercised. Existing bounded publication transactions and explicit orphan-reconciliation policy remain as documented in the [implementation report](PHASE-3.2.md).

No application implementation was changed during activation. No live test project/task, account/role change, S3 operation, external worker/notification activation, push, deployment or Phase 3.3 work occurred. Only the authorized schema migration, local flag addition and activation documentation were changed. No remaining failed required check was observed.

## Evidence

- [Repeated preflight](../../../.tmp/phase32-activation-556onfj0/preflight-passed.json), [recovery](../../../.tmp/phase32-activation-556onfj0/recovery.json), [execution result](../../../.tmp/phase32-activation-556onfj0/execution-result.json), [migration log](../../../.tmp/phase32-activation-556onfj0/migration.log).
- [Immediate pre-execution snapshot](../../../.tmp/phase32-activation-556onfj0/execution-before.json), [postchecks](../../../.tmp/phase32-activation-556onfj0/postchecks-passed.json), [catalog changes](../../../.tmp/phase32-activation-556onfj0/catalog-changes.json), [empty post-migration diff](../../../.tmp/phase32-activation-556onfj0/post-diff.sql).
- [Local activation](../../../.tmp/phase32-activation-556onfj0/local-activation.json), [fresh process flags](../../../.tmp/phase32-activation-556onfj0/fresh-app-flags.json), [fresh startup result](../../../.tmp/phase32-activation-556onfj0/fresh-app-result.json), [zero-network record](../../../.tmp/phase32-activation-556onfj0/fresh-app-network.json).
- [Verification summary](../../../.tmp/phase32-activation-556onfj0/verification-summary.json), [Tasker integration log](../../../.tmp/phase32-activation-556onfj0/tasker.log), [full regression log](../../../.tmp/phase32-activation-556onfj0/regressions.log), [task legacy log](../../../.tmp/phase32-activation-556onfj0/legacyTasks.log), [concept legacy log](../../../.tmp/phase32-activation-556onfj0/legacyConcepts.log).
- [General browser result](../../../.tmp/phase32-activation-556onfj0/browser-artifacts/result.json), [deliverables browser result](../../../.tmp/phase32-activation-556onfj0/deliverableBrowser-artifacts/result.json), [final live snapshot](../../../.tmp/phase32-activation-556onfj0/final.json), [final verification](../../../.tmp/phase32-activation-556onfj0/final-check-passed.json).

All individual exit records, build/static-check logs and screenshots are retained locally in the same evidence directory. Activation work is complete and stopped.
