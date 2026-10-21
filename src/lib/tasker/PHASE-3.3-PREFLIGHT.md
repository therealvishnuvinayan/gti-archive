# Phase 3.3 controlled development activation preflight

**PASS — read-only preflight completed at 2026-10-21T18:13:09.858Z. Awaiting explicit migration and local-flag approval.** No migration or environment change was performed. This is the approval checkpoint required by section 4 of the supplied Phase 3.3 activation request; it is not activation sign-off.

The implementation is committed at `93bdb64`. All 24 reviewed source-file hashes match the completed [implementation report](PHASE-3.3.md), and all 110 earlier migration files and three environment files match the implementation baseline. The working tree was clean before this report was added.

| Verified target | Value |
| --- | --- |
| Neon project | `flux-v2-dev` / `little-hall-78798085` |
| Branch | `develop` / `br-frosty-moon-b43rvpbe` |
| Database / schema | `neondb` / `public` |
| PostgreSQL | `18.6 (fd34222)` |
| Endpoint | `ep-raspy-salad-b4iqfan0` |
| Direct host | `ep-raspy-salad-b4iqfan0.c-6.us-east-2.aws.neon.tech` |
| Pooled host | `ep-raspy-salad-b4iqfan0-pooler.c-6.us-east-2.aws.neon.tech` |
| Direct / pooled fingerprint | `5b001dbfcdb263fa` / `9d6f1df51a9db284` |

Provider project, branch and endpoint GET responses agree with the configured target. SQL independently confirms the database, schema and server version. Endpoint fingerprints are SHA-256 prefixes over hostname, port and database; they exclude credentials. Configuration precedence and any direct-URL or shell override were checked. PostgreSQL snapshot sessions enforced read-only transactions and read-only connection defaults; Prisma introspection also used read-only connection defaults.

Candidate: [`prisma/migrations/20261022010000_universal_tasker_concepts/migration.sql`](../../../prisma/migrations/20261022010000_universal_tasker_concepts/migration.sql).

Exact verified SHA-256:

```text
8c0e844318df9ab16efb5026cbf2ad974c5b7f372ddae8c44ad6775ac0b87271
```

| Measure | Current verified state | Expected after separate approval and execution |
| --- | ---: | ---: |
| Successful migrations | 110 | 111 |
| Failed migrations | 0 | 0 |
| Pending migrations | 1 | 0 |
| Public tables including Prisma ledger | 119 | 120 |
| Baseline Prisma drift | None | None |

The candidate is the only pending migration. All 110 applied ledger entries have successful completion, one applied step, no rollback and the exact checksum of their repository SQL. No extra, missing or duplicate ledger migration was found. Prisma diff against the reviewed Phase 3.2 schema is empty. Diff against the candidate Prisma schema contains exactly the new table, its two model indexes, primary key and seven foreign keys; the additional partial index, CHECK constraints and trigger logic are reviewed directly in SQL.

| Candidate object change | Verified inventory |
| --- | --- |
| Table | One `UniversalTaskReference`, ten columns |
| Foreign keys | Seven, all `ON DELETE RESTRICT ON UPDATE RESTRICT` |
| Indexes | Four including primary key, task/version uniqueness, one inspection per task and source-submission lookup |
| CHECK constraints | One new; replacements of `UniversalTask_values`, `UniversalTaskEntry_values`, `BusinessEvent_contract_check` |
| New functions | `flux_task_reference_guard`, `flux_task_concept_consistency` |
| Replaced functions | `flux_task_guard`, `flux_emit_task_event`, `flux_event_write_guard`, `flux_task_deliverable_consistency`, `flux_shared_file_provenance_guard` |
| Triggers | Four: reference row/truncate guards and two initially deferred consistency triggers |
| Enums / historical backfill | None / none |

The five function bodies were compared with the actual existing catalog, which also matches the prior activation snapshot. `flux_task_guard` adds manager-only concept creation and Owner/Director source selection while retaining immutable ownership, real actors, version progression, retained history and distinct review. Event emission and validation add `conceptTaskCommand` while retaining the General/Deliverable mappings, exact native decision checks and internal outbox delivery rules. Deliverable consistency still requires its target and accepted application/publication. File provenance adds an exact selected-reference branch and preserves upload, deliverable publication and completion-document branches. The three CHECK replacements retain the old-type conditions while extending the supported types, action and event operation.

The new guards require exact sealed versions, matching project context, truthful selection/submission/review history, eligible Initial Concept sources, immutable references and atomic provenance. Inspection completion requires its pinned source. Concept completion requests require a fresh exact submission. Existing task ownership, historical concept submissions, approvals and file-version rows are not updated by this migration. Native project-completion authority is unchanged.

**Preservation passed for every existing table.** Both read-only snapshots match the final [Phase 3.2 activation](PHASE-3.2-ACTIVATION.md) snapshot: all 119 table counts and canonical full-row SHA-256 fingerprints, all 110 ledger rows, account/authorization records and Artwork approval history are identical. The 1,315 column definitions, 1,383 constraints, 556 indexes, enum definitions, 23 function definitions and 79 non-internal triggers are unchanged. All captured constraints are validated, indexes valid/ready and triggers enabled.

All nine accounts retain their stored passwords, names, legacy roles, V2 roles/privileges, active status and authorization versions. There remain one Director, two SPMs, one JPM, two Designers, one Digital Lead and two technical-only administrators. Three sessions, nine authorization-change records, the Director-approved Artwork preset and its governance event remain unchanged. Sensitive row values were hashed within PostgreSQL; passwords, session tokens and database credentials were not printed or exported.

| Complete-record fingerprint | SHA-256 |
| --- | --- |
| User including stored passwords | `f0920a0c751e4f4d83db0baaa57581d8255ce6f49f9d306b669e0d45e082354e` |
| UserAuthorization | `c994e7b2c97aa5571eff7da3b81530c9f34dff79982f34282cd2f2fe3e8c8b36` |

General/Deliverable tasks, legacy concepts, project stages, Shared File Identity, approvals/events, Archive and Library tables retain their definitions and fingerprints. Their operational live records remain empty. Populated historical preservation is supported by the earlier disposable migration rehearsals, not by live sample data. The nonempty live tables contain the accounts, authorization history, sessions, preset/governance records, status options and migration ledger described above.

| Local flag | Fresh Next.js environment-loader value |
| --- | --- |
| `FLUX_SHARED_FILE_IDENTITY` | `1` |
| `FLUX_APPROVAL_ENGINE` | `1` |
| `FLUX_SHARED_EVENTS` | `1` |
| `FLUX_UNIVERSAL_TASKER` | `1` |
| `FLUX_TASKER_DELIVERABLES` | `1` |
| `FLUX_TASKER_CONCEPTS` | Unset, disabled |

The fresh environment-loader check starts no application server and performs no HTTP requests. `.env`, `.env.example` and `.env.local` remain byte-identical to the implementation baseline. The required fresh Next.js application-process verification with all six flags belongs after separately approved migration and flag activation.

Recovery retention is **21,600 seconds / six hours**, independently confirmed through Neon at `2026-10-21T18:11:16.911Z`. Historical schema access for `2026-10-21T18:09:15.085Z` succeeded with all 119 baseline tables and no reference table. Historical schema SHA-256 is `d510e3ad2270bd8a6575a6ecf1d83b8588ce9bdf6c71f0471e63d8e01a268d75`. This establishes retention and historical-schema accessibility; it is not a data restore drill or an independent backup. Recovery must be rechecked immediately before any approved execution.

Both snapshots showed **zero other active transactions, zero waiting locks and zero prepared transactions**, with one other session. These observations do not reserve a future migration window. The migration uses one explicit transaction, a five-second lock timeout and a sixty-second statement timeout. Replacing the CHECK constraints requires strong table locks on UniversalTask, UniversalTaskEntry and BusinessEvent; the foreign keys also lock referenced tables. A short blocking interval remains possible even though the affected operational tables are currently empty. PostgreSQL 18 documents these [ALTER TABLE lock levels](https://www.postgresql.org/docs/18/sql-altertable.html) and the [per-lock and per-statement timeout semantics](https://www.postgresql.org/docs/18/runtime-config-client.html); sixty seconds is not a whole-migration deadline.

The candidate uses established PostgreSQL 18 DDL/PLpgSQL constructs, existing types and unchanged trigger-function signatures. No compatibility blocker was found in static review or live baseline introspection. PostgreSQL documents replacement-function [ownership/dependency preservation](https://www.postgresql.org/docs/18/sql-createfunction.html) and [deferred constraint triggers](https://www.postgresql.org/docs/18/sql-createtrigger.html). Candidate execution and behavioral rehearsals have only run on disposable PostgreSQL **14.19**, so this is not a PostgreSQL 18.6 execution certification. PostgreSQL 18 represents the new table's six NOT NULL columns as catalog constraints; later object validation must account for that version difference.

On an approved execution failure, stop without retry, repair, reset or `db push`. Transactional schema changes should roll back on an SQL error; Prisma may retain a failed migration-ledger record. An interrupted connection can leave the commit outcome uncertain, requiring read-only inspection before further decisions. No automatic recovery or migration executor was run during this preflight.

No critical mismatch was observed. Remaining limitations are the absence of a PostgreSQL 18.6 candidate rehearsal and restore drill, and fake-storage verification rather than live S3 integrity/durability verification. Existing source-adapter and bounded-picker limitations remain as documented in the implementation report. The prior tests, static checks, production build and 32 browser screenshots still correspond to the exact reviewed source hashes; post-activation suites have not been represented as already run.

Only the local evidence directory and this report were added. No live synthetic data, account/role change, S3 access, external worker or notification activation, historical rewrite, push, deployment, unrelated implementation or Phase 3.4 work occurred.

Evidence: [preflight result](../../../.tmp/phase33-preflight-69sal9cb/preflight-passed.json), [migration manifest](../../../.tmp/phase33-preflight-69sal9cb/manifest.json), [first snapshot](../../../.tmp/phase33-preflight-69sal9cb/before.json), [second snapshot](../../../.tmp/phase33-preflight-69sal9cb/after-readonly.json), [preservation comparison](../../../.tmp/phase33-preflight-69sal9cb/preservation-comparison.json), [empty baseline diff](../../../.tmp/phase33-preflight-69sal9cb/baseline-diff.sql), [candidate diff](../../../.tmp/phase33-preflight-69sal9cb/candidate-diff.sql), [guard comparison](../../../.tmp/phase33-preflight-69sal9cb/guard-review.diff), [recovery](../../../.tmp/phase33-preflight-69sal9cb/recovery.json), [local flags](../../../.tmp/phase33-preflight-69sal9cb/flags-before.json), [reviewed source hashes](../../../.tmp/phase33-preflight-69sal9cb/reviewed-sources.json).

**Approval requested:** apply only `20261022010000_universal_tasker_concepts` with the exact checksum above to the verified development target; after successful migration and preservation postchecks, enable only `FLUX_TASKER_CONCEPTS=1` in local `.env.local`, preserve the five existing flags, and run the specified isolated post-activation verification. All critical prechecks must be repeated immediately before execution. Work is stopped pending that explicit approval.
