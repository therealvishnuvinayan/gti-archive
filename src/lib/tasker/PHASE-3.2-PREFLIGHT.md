# Phase 3.2 — verification closure and controlled activation preflight

This is the historical pre-activation checkpoint. The subsequent separately approved [development activation is complete](PHASE-3.2-ACTIVATION.md); its report records the current state.

2026-10-21. **PASS — awaiting explicit approval. No migration applied; deliverables remain disabled.** Live preflight completed at **17:07:58 UTC / 21:07:58 Dubai**. This report supersedes the legacy-runner gap and activation recommendation in the [initial implementation report](PHASE-3.2.md), whose implementation history remains intact.

## 1. Both legacy runners execute and pass

Neither command was retired or excluded. Final assertion counts:

| Command / suite | Assertions | Result |
| --- | ---: | --- |
| `tasks:integration-check`: historical assignment migration | 3 | PASS |
| `tasks-integration-check` | 66 | PASS |
| `user-projects-integration-check` | 57 | PASS |
| **Tasks command total** | **126** | **PASS** |
| `concept-stage:completion-check`: completion revocation | 171 | PASS |
| Stage-skip revocation | 141 | PASS |
| Manual concept stages | 61 | PASS |
| Completion requests | 170 | PASS |
| Completion without a file | 46 | PASS |
| Concept creation, execution, review, comparison and Stage 3/4 lineage | 188 | PASS |
| Round-four final files and Stage 5/6 handoffs | 109 | PASS |
| **Concept command total** | **886** | **PASS** |

Counts are from the final run; concurrency branches can vary the number of assertions. Every child suite reports its count, PASS/FAIL, genuine V2 sessions and zero attempted external requests. Nonzero exits or zero assertions fail the command. Both commands retain all constituent suites.

The shared [isolated runner](../../../scripts/run-native-workflow-isolated.mjs) creates private Unix-socket PostgreSQL clusters with TCP disabled and separate databases for each suite. It copies the migration chain, generates an isolated Prisma client, compiles the existing suites, executes them and removes the cluster. No application credentials are inherited. The historical assignment test inserts the original pre-migration fixture at the correct migration boundary and verifies known assigners, unknown/unassigned cases and received tasks.

[Framework/storage bootstrap](../../../scripts/native-workflow-bootstrap.cjs) supplies test request context and fake signing, while [fixtures](../../../scripts/native-workflow-fixtures.ts) create actual V2 authorization rows, versioned sessions and authenticated users. Authentication, resource policies, Prisma, audit guards and mutation transactions are real. Unexpected storage/network operations fail the suite; authorization denials are normalized only to the legacy result shape. Unexpected database or application errors still fail.

| Earlier assumption | Approved V2 assertion now exercised |
| --- | --- |
| Legacy ADMIN/SUPER_ADMIN implies business authority | Actual Director/SPM/JPM relationships and genuine sessions govern access; unrelated managers and technical-only accounts deny. |
| Executors can read full stage/chat/comparison workspaces | Assigned tasks and safe project contexts remain available; full workspace, comparison and caption reads deny to restricted actors. |
| Designer co-owner records grant management | Historical relationships preserve context, without creating management authority. Project-type navigation remains available to business participants. |
| Approval reset or replacement can overwrite completed evidence | Disabled approved-file reset paths deny across roles, including Director, and preserve workflow, task, revision, attachment, handoff, checklist and production snapshots. Completed-stage replay/reconciliation cannot bypass the V2 guard. |
| Every concurrent native completion call succeeds | Exactly one transition commits; the losing transaction rolls back or observes the completed guard. No duplicate handoffs, checklists or timestamps. Supported fileless reopening can be retried in a fresh authenticated call after a conflict. |

Supported native creation, execution, revisions, request changes, file approval, fileless completion, reasoned Director reopening, stage skips, downstream locks, retained history, explicit reference import, handoff provenance, checklist isolation, production initialization and failure rollback remain exercised. These changes follow [project read rules](../authorization/PROJECT-READ.md) and [project write rules](../authorization/PROJECT-WRITE.md), including the explicit prohibition on overwriting approved-file history.

The repaired suites exposed two runtime defects, now fixed narrowly:

- [Native concept handlers](../project-concepts.ts) and [skip/reopen handlers](../project-stage-skip-revocation.ts) no longer recursively retry inside an already-aborted shared authorization transaction. They return the existing conflict result so the outer transaction rolls back. No automatic mutation replay or new authority was introduced.
- [Comparison and caption checks](../comparison.ts) now pass the persisted attachment ID to the existing V2 file guard. Authorized manager reads pass; restricted and cross-resource cases remain denied.

New harness files: `run-native-workflow-isolated.mjs`, `native-workflow-bootstrap.cjs`, `native-workflow-fixtures.ts` and `native-task-assignment-fixture.sql`. Both existing runner entry points and their nine test files were updated. No TypeScript exclusion or disabled test was added.

## 2. Required regressions

| Verification | Final result |
| --- | --- |
| Full `tsc --noEmit --incremental false` | PASS |
| ESLint on every changed/new TS, TSX, MJS and CJS file, zero warnings | PASS |
| Production `pnpm build` | PASS; real credentials blanked, database set to disabled loopback |
| General, File Upload and Data Input integration | PASS |
| Populated 109/116 → 110/119 migration rehearsal, original rows/checksums and zero drift | PASS; GENERAL also runs before the candidate migration |
| Tasker, approval and event units; authorization foundation/persistence | PASS |
| V2 authorization/session, administration, workspace, project read/write/governance, completion documents, file identity/provenance, approvals/events, Archives and Library | PASS; 107 PASS summaries |
| Repaired native task/project and concept-stage commands | PASS; 126 + 886 assertions |
| General Task browser acceptance | PASS; 9 screenshots |
| Deliverables browser acceptance | PASS; 10 screenshots |

Both browser suites ran against the final production application build with synthetic password sign-ins, Chromium 153.0.8010.12, disposable PostgreSQL and fake storage. Director, SPM, JPM, Designer and Digital Lead flows, unrelated actors and technical-only denial passed. Both report zero page errors and zero attempted external requests. Synthetic account/password and parent-project preservation checks passed.

Integration assertions confirm task-only executors upload without destination rights; sealed evidence stays unpublished until acceptance; acceptance/replay publishes exactly once; rejection and revoked owner/reviewer/session authority prevent publication; storage and post-copy database/outbox failures never falsely complete a task; durable reservations support explicit reconciliation and reuse of observed orphan objects. Concurrent Data Input proposals cannot overwrite newer values; stale proposals require authorized refresh and resubmission. Unsupported fields, stages and arbitrary model/path inputs fail closed. General Tasks and native concepts remain functional.

Evidence: [verification summary](../../../.tmp/phase32-preflight/verification-summary.json), [Tasker log](../../../.tmp/phase32-preflight/tasker.log), [regression log](../../../.tmp/phase32-preflight/regressions.log), [task legacy log](../../../.tmp/phase32-preflight/legacyTasks.log), [concept legacy log](../../../.tmp/phase32-preflight/legacyConcepts.log), [General browser result](../../../.tmp/phase32-preflight/browser-artifacts/result.json), [deliverables browser result](../../../.tmp/phase32-preflight/deliverableBrowser-artifacts/result.json). All command exit records and build/static-check logs are in that directory. Earlier failing expectations were repaired, not omitted from the final run.

## 3. PostgreSQL 18 compatibility

No critical SQL incompatibility was identified. This is a source/documentation review plus PostgreSQL 14.19 mutation evidence; it is **not PostgreSQL 18 mutation certification**. Local installations are 14, 16 and 17; no already-available disposable 18 instance/container was found. No Neon branch was created. The live read-only checks independently confirmed 18.6.

| Area | Finding |
| --- | --- |
| Tables, FKs and CHECK constraints | Standard PostgreSQL types, restrictive FKs and CHECK syntax remain supported. New FK source tables are empty. Replacing existing CHECKs requires validation scans and restrictive locks. No existing column/type conversion or row backfill occurs. [PostgreSQL 18 ALTER TABLE](https://www.postgresql.org/docs/18/sql-altertable.html) |
| Enum and trigger functions | The activity enum value is added transactionally, with no data statement using it before commit. PL/pgSQL guard definitions are installed for later calls. Row-level deferred constraint triggers and statement-level TRUNCATE guards use supported forms. [ALTER TYPE](https://www.postgresql.org/docs/18/sql-altertype.html), [CREATE TRIGGER](https://www.postgresql.org/docs/18/sql-createtrigger.html) |
| `xmin` conflict token | `xmin::text` identifies the current row version. It is compared with value, attachment IDs, status and update timestamp under locks. It is not a durable globally unique revision ID: transaction IDs are 32-bit and wrap around. [System columns](https://www.postgresql.org/docs/18/ddl-system-columns.html) |
| Native locking | Tasker and native writers lock the actual Project root; checklist acceptance additionally locks the item/checklist/handoff. Folder publication takes SHARE locks on folder/workspace tables, so it can delay unrelated folder writes while the transaction runs. [Explicit locking](https://www.postgresql.org/docs/18/explicit-locking.html) |
| Transaction failure | Serializable conflicts abort the transaction and require a fresh transaction. The repaired native handlers preserve this boundary. Application mutations, history and outbox commit atomically. [Transaction isolation](https://www.postgresql.org/docs/18/transaction-iso.html) |
| Publication | S3 is outside PostgreSQL atomicity. PREPARED application/publication reservations precede copy; conditional source copy and observed destination validation support explicit reconciliation. The publication transaction is bounded to 30 seconds. Slow storage can cause rollback and retained orphan objects; no cleanup worker was activated. |

PostgreSQL 18 mutation testing, a restore drill and real-S3 durability/behavior remain unperformed limitations for the user's approval decision.

## 4. Exact Neon identity

| Field | Independently verified value |
| --- | --- |
| Project | `flux-v2-dev` — `little-hall-78798085` |
| Branch | `develop` — `br-frosty-moon-b43rvpbe` |
| Database / schema | `neondb` / `public` |
| PostgreSQL | `18.6 (fd34222)` |
| Endpoint ID | `ep-raspy-salad-b4iqfan0` |
| Direct host | `ep-raspy-salad-b4iqfan0.c-6.us-east-2.aws.neon.tech` |
| Pooled host | `ep-raspy-salad-b4iqfan0-pooler.c-6.us-east-2.aws.neon.tech` |
| Direct / pooled fingerprint | `5b001dbfcdb263fa` / `9d6f1df51a9db284` |

Endpoint fingerprints are the first 16 hex characters of SHA-256 over `host:5432/neondb`, excluding credentials. Provider project/branch/endpoint GETs and direct database identity agree. Snapshot sessions enforced both default and transaction read-only mode; schema diffs also used read-only connections.

## 5. Exact candidate

`20261021230000_universal_tasker_deliverables`

```text
547060da2b87852e8c4e8fc9eb0cd6f930abcf788c007e08ba113e76f8ffed37
```

This is the complete 64-character SHA-256 of the actual [migration SQL](../../../prisma/migrations/20261021230000_universal_tasker_deliverables/migration.sql). It matches the user's specified value and the reviewed copy. All 109 earlier migration files also remain byte-identical. No migration SQL was edited during verification closure.

## 6. Current and expected counts

| Measure | Current live baseline | After separately approved execution |
| --- | ---: | ---: |
| Successful migrations | 109 | 110 |
| Failed migrations | 0 | 0 |
| Pending migrations | 1, exactly the candidate | 0 |
| Public tables, including Prisma ledger | 116 | 119 |
| Prisma baseline drift | None | Must remain none |

Every applied ledger checksum matches its repository SQL. Baseline Prisma diff is empty. The proposed Prisma diff matches the candidate's model DDL exactly; custom checks, guards and triggers were reviewed separately. Existing columns, constraints, indexes, enums, function definitions and triggers match the preceding Phase 3.1 activation catalog. All current constraints are validated, indexes valid/ready and triggers enabled.

## 7. Schema changes and locking risks

The candidate adds `UniversalTaskTarget`, `UniversalTaskApplication` and `UniversalTaskPublication`; three primary keys; seven additional indexes; nine restrictive foreign keys; three new CHECK constraints; three replacement task/event CHECK constraints; one activity enum value; three new trigger functions; four replaced trigger functions; and ten new trigger instances, including deferred consistency and retention guards.

New functions are `flux_task_deliverable_guard`, `flux_task_deliverable_consistency` and `flux_task_application_consistency`. Replacements are `flux_task_guard`, `flux_emit_task_event`, `flux_shared_file_provenance_guard` and `flux_event_write_guard`. Existing General and completion-document branches remain protected by the passing regressions.

There are no immediate INSERT/UPDATE/DELETE data statements against existing records, no backfill, and no table/column removal or conversion. INSERT statements inside trigger definitions execute only on later application writes.

The migration uses BEGIN/COMMIT, a 5-second lock timeout and a 60-second statement timeout. CHECK replacement takes ACCESS EXCLUSIVE locks on existing task/entry/event tables; FK creation also locks referenced tables. A fresh quiet-window check remains necessary before execution. Both preflight snapshots showed zero competing active transactions, waiting locks and prepared transactions. One other idle session existed; public relation size was 5,775,360 bytes. Lock timeout or statement failure requires stopping; this report authorizes no retry, repair or reset.

Object inventory: [proposed objects](../../../.tmp/phase32-preflight/proposed-objects.json). Schema evidence: [baseline diff](../../../.tmp/phase32-preflight/baseline-diff.sql), [candidate diff](../../../.tmp/phase32-preflight/candidate-diff.sql).

## 8. Recovery readiness

Neon reports **21,600 seconds / six hours** of history retention. Historical schema retrieval for **2026-10-21 17:04:12.613 UTC** succeeded and contained all 116 baseline tables, including shared files, approvals, events and General Tasker, with no deliverable tables. Recovery was checked at 17:06:15 UTC. Historical schema SHA-256:

```text
631c448dd7c20438d54dbf715037913ee2c976215c097c034fb9cc1feec51bf6
```

This verifies provider retention and historical schema access, not a restored-data drill or exported backup. No branch, restore or recovery mutation was performed. Recheck the moving recovery window immediately before separately approved execution. Evidence: [recovery record](../../../.tmp/phase32-preflight/recovery.json).

## 9. Existing-data and configuration preservation

All **116 public table row counts and canonical full-row SHA-256 fingerprints** match between the two read-only snapshots and the previous Phase 3.1 activation baseline, including sessions. Raw passwords/session tokens were not printed or exported; database-side aggregate fingerprints include all stored columns.

Nine active accounts retain their names, password hashes, legacy roles, V2 assignments and authorization versions: one Director, two SPMs, one JPM, two Designers, one Digital Lead and two technical-only administrators. The nine immutable authorization-change records remain unchanged. The existing Director-approved Artwork preset, definition hash, approval timestamp and its governance event remain unchanged.

| Preservation fingerprint | SHA-256 |
| --- | --- |
| Full User records, including stored password hashes | `f0920a0c751e4f4d83db0baaa57581d8255ce6f49f9d306b669e0d45e082354e` |
| Full UserAuthorization records | `c994e7b2c97aa5571eff7da3b81530c9f34dff79982f34282cd2f2fe3e8c8b36` |

Live operational tables including `Project`, `UniversalTask`, `ProjectConceptFolder`, `SharedFile`, `ApprovalRequest`, `BusinessEvent`, `ProjectArchive`, `ManualArchiveFile` and `ManualLibraryAsset` are currently empty; their schemas and empty-row fingerprints are preserved. This is not represented as a populated live workflow test. The isolated migration rehearsal separately contains populated General/native/file/history fixtures and verifies preservation through the candidate.

All local environment files are byte-identical. A fresh process using Next.js environment loading confirmed:

```text
FLUX_SHARED_FILE_IDENTITY=1
FLUX_APPROVAL_ENGINE=1
FLUX_SHARED_EVENTS=1
FLUX_UNIVERSAL_TASKER=1
FLUX_TASKER_DELIVERABLES=unset
```

The user's previously staged changes are unchanged. No real account/permission, live S3 object, external worker/notification, remote branch or deployment was changed. No push, deployment or Phase 3.3 work occurred.

Evidence: [preflight result](../../../.tmp/phase32-preflight/preflight-passed.json), [initial read-only snapshot](../../../.tmp/phase32-preflight/before.json), [final read-only snapshot](../../../.tmp/phase32-preflight/after-readonly.json), [fresh configuration result](../../../.tmp/phase32-preflight/flags-before.json). Snapshot files are local and permission-restricted.

## 10. Blockers, limitations and required approval

No failing required test or critical migration issue remains. The limitations are PostgreSQL 18 mutation testing unavailable, no restore drill, fake rather than live storage testing, and the documented bounded transaction/orphan-reconciliation behavior. Legacy approved-file reset operations remain intentionally blocked; historical eligibility hints do not grant mutation authority.

**STOP: explicit user approval is still required.** The latest request authorizes this verification and read-only preflight only. Earlier Phase 3.1 approval does not authorize this candidate.

The proposed next action, only after approval, is to repeat identity/checksum/drift/recovery/preservation/lock checks, apply only the exact candidate once, validate 110 successful / zero failed / zero pending migrations, 119 tables and no drift, verify every existing row remains unchanged, then enable `FLUX_TASKER_DELIVERABLES=1` in local `.env.local` only while preserving the four existing flags. Fresh Next.js loading and required isolated regressions/browser acceptance must then pass. Stop on any critical mismatch or migration failure; no automatic repair/retry/reset, live test projects/tasks, live S3 changes, external dispatch, push, deployment or Phase 3.3.
