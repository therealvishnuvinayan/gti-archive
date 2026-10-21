# Phase 3.4 — Controlled development activation preflight

**Read-only preflight passed; awaiting explicit approval.** Verified on 2026-10-21, with database snapshots beginning at 19:02:12 and 19:03:05 UTC, completed at 19:03:35 UTC. Connection settings and DDL privileges were checked at 19:04:17 UTC. No migration, environment modification, application mutation, live S3 access, worker activation, push or deployment occurred. This report does not authorize execution.

The approval checkpoint comes from §4 of the user's [controlled activation request](</Users/vishnuvinayan/.codex/attachments/3759f0d4-5d66-441b-92e7-24215cd63c42/Pasted text.txt>): “STOP and request my explicit approval before applying the migration or enabling any flag.”

**Verified identity and state.** Provider GETs independently confirmed the project, branch and endpoint; read-only SQL confirmed the database and exact server version. Credentials, stored password values and session tokens were not printed or exported. Endpoint fingerprints are the first 16 hexadecimal characters of SHA-256 over `hostname:5432/neondb`, excluding credentials.

| Item | Verified value |
| --- | --- |
| Project | `flux-v2-dev` / `little-hall-78798085` |
| Branch | `develop` / `br-frosty-moon-b43rvpbe` |
| Endpoint | `ep-raspy-salad-b4iqfan0` |
| Database / schema | `neondb` / `public` |
| PostgreSQL | `18.6 (fd34222)` |
| Direct host | `ep-raspy-salad-b4iqfan0.c-6.us-east-2.aws.neon.tech` |
| Direct fingerprint | `5b001dbfcdb263fa` |
| Pooled host | `ep-raspy-salad-b4iqfan0-pooler.c-6.us-east-2.aws.neon.tech` |
| Pooled fingerprint | `9d6f1df51a9db284` |
| Reviewed implementation | Commit `9f8c78beec6bde200de6fd8f13ab5761ddf07b6e` |
| Installed tooling | Prisma `6.19.3`; Next.js `16.2.6` |

| Database condition | Current verified state | Required after approved migration |
| --- | --- | --- |
| Successful migrations | 111 | 112 |
| Failed migrations | 0 | 0 |
| Pending migrations | 1, the candidate below | 0 |
| Public tables, including `_prisma_migrations` | 120 | 122 |
| Prisma drift against the applicable schema | None | None |

Every applied migration name and checksum matches its repository file; the full 111-row ledger also matches the final Phase 3.3 snapshot. The baseline Prisma diff is empty. The diff from the current database to the proposed Prisma schema contains exactly the candidate's two tables, indexes and foreign keys. Custom functions, triggers and checks were reviewed separately because Prisma's schema diff does not cover their behavior. All current catalog constraints are validated, indexes valid/ready and application triggers enabled. Current columns, constraints, indexes, enums, function definitions and triggers match the Phase 3.3 baseline exactly.

**Exact candidate.**

```text
20261022030000_universal_tasker_sisters
SHA-256: 84fb73f0bc9939e260afd75dab7f91964a328108f543c556037a20de02bd3b1d
```

The 64-character checksum matches the real SQL, the captured review copy and implementation evidence. All 26 reviewed implementation file hashes match; all 111 previous migration files remain unchanged. `.env`, `.env.local`, `.env.example` and both prior implementation/activation reports remain byte-for-byte unchanged. The working tree was clean before preflight; this report is the only new non-ignored repository file.

**Complete proposed object inventory.** Two new tables contain 13 columns total:

- `UniversalTaskFamilyLink`: `taskId`, `sourceTaskId`, `rootTaskId`, `createdEntryId`, `sourceVersion`, `mode`.
- `UniversalTaskInheritedEvidence`: `id`, `taskId`, `versionId`, `sourceUploadId`, `sourceEntryId`, nullable `sourceReviewId`, `sourceState`.

All nine foreign keys use both `ON DELETE RESTRICT` and `ON UPDATE RESTRICT`:

| Constraint | Reference |
| --- | --- |
| `UniversalTaskFamilyLink_taskId_fkey` | `UniversalTask.id` |
| `UniversalTaskFamilyLink_sourceTaskId_fkey` | `UniversalTask.id` |
| `UniversalTaskFamilyLink_rootTaskId_fkey` | `UniversalTask.id` |
| `UniversalTaskFamilyLink_createdEntryId_fkey` | `UniversalTaskEntry.id` |
| `UniversalTaskInheritedEvidence_taskId_fkey` | `UniversalTaskFamilyLink.taskId` |
| `UniversalTaskInheritedEvidence_versionId_fkey` | `SharedFileVersion.id` |
| `UniversalTaskInheritedEvidence_sourceUploadId_fkey` | `UniversalTaskUpload.id` |
| `UniversalTaskInheritedEvidence_sourceEntryId_fkey` | `UniversalTaskEntry.id` |
| `UniversalTaskInheritedEvidence_sourceReviewId_fkey` | `UniversalTaskEntry.id` |

Seven indexes, including the two primary indexes:

- `UniversalTaskFamilyLink_pkey`.
- `UniversalTaskFamilyLink_createdEntryId_key` (unique).
- `UniversalTaskFamilyLink_sourceTaskId_idx`.
- `UniversalTaskFamilyLink_rootTaskId_idx`.
- `UniversalTaskInheritedEvidence_pkey`.
- `UniversalTaskInheritedEvidence_sourceEntryId_idx`.
- `UniversalTaskInheritedEvidence_taskId_versionId_key` (unique).

Two CHECK constraints: `UniversalTaskFamilyLink_shape` rejects self/root identity, nonpositive source versions and modes outside KEEP/MODIFY; `UniversalTaskInheritedEvidence_state` restricts historical states to SUPPORTING, SUBMITTED, APPROVED, REJECTED or SUPERSEDED.

Three new zero-argument PL/pgSQL trigger functions: `flux_task_family_guard`, `flux_task_inherited_guard`, `flux_task_family_consistency`. They enforce immutable lineage/evidence, real authorized creation, completed same-project sources, exact selected sealed versions, truthful original attribution and deferred atomic entry/link/evidence/provenance consistency.

| New trigger | Relation | Timing |
| --- | --- | --- |
| `flux_task_family_guard` | `UniversalTaskFamilyLink` | BEFORE INSERT/UPDATE/DELETE, row |
| `flux_task_family_truncate` | `UniversalTaskFamilyLink` | BEFORE TRUNCATE, statement |
| `flux_task_inherited_guard` | `UniversalTaskInheritedEvidence` | BEFORE INSERT/UPDATE/DELETE, row |
| `flux_task_inherited_truncate` | `UniversalTaskInheritedEvidence` | BEFORE TRUNCATE, statement |
| `flux_task_family_entry_consistency` | Existing `UniversalTaskEntry` | AFTER INSERT, row, initially deferred constraint trigger |
| `flux_task_family_consistency` | `UniversalTaskFamilyLink` | AFTER INSERT, row, initially deferred constraint trigger |
| `flux_task_inherited_consistency` | `UniversalTaskInheritedEvidence` | AFTER INSERT, row, initially deferred constraint trigger |

Two existing functions are replaced. Direct diffs against the live definitions show only these changes:

- `flux_shared_file_provenance_guard`: permits an exact inherited version linked through the family to its native CREATED entry and selected-version snapshot. Existing concept-reference, application/publication, task-upload and completion-document paths remain unchanged.
- `flux_task_reference_guard`: extends inspection-upload selection to an exact prior inspection reference through the immediate source family, during the new task's CREATED entry, for the original upload-task Owner or Director. Existing active-owner, sealed-version, same-project, project-folder delegation and Final Concept inspiration checks remain intact.

Both replacements retain zero arguments, `RETURNS trigger`, PL/pgSQL, invoker security and no function-specific settings. The current connection has ownership privileges for both functions, schema CREATE permission and the required REFERENCES/TRIGGER privileges on existing tables. No existing column, index, CHECK, enum or business record is rewritten or removed. Foreign keys introduce dependencies on existing tables; the one new entry trigger and the two function replacements are the existing-object changes. No historical backfill, automatic family creation or permission grant is present.

**Preservation.** Read-only repeatable-read snapshots captured row counts and canonical full-row SHA-256 fingerprints for all 120 public tables. Every fingerprint matches both the final Phase 3.3 snapshot at 18:26:57 UTC and the second snapshot in this preflight. Only aggregates leave PostgreSQL; raw stored passwords and session tokens do not. This verifies preservation of stored credential values without attempting logins or resetting passwords.

All nine accounts remain active with unchanged names, stored passwords, statuses, authorization versions and role assignments: one Director, two Senior Project Managers, one Junior Project Manager, two Designers, one Digital Lead and two technical-only administrators. Both administrators have no business role; business accounts have no technical privilege. Nine authorization-change records, three sessions, the single Artwork preset approval and its governance audit event remain unchanged. Preset definition hash, approving Director, timestamp and non-revoked state match exactly.

User-table fingerprint: `f0920a0c751e4f4d83db0baaa57581d8255ce6f49f9d306b669e0d45e082354e`.

Authorization-table fingerprint: `c994e7b2c97aa5571eff7da3b81530c9f34dff79982f34282cd2f2fe3e8c8b36`.

The existing Tasker, native concept, project, Shared File Identity, approval/event, Archive and Library structures are present and unchanged. Their operational data tables are currently empty in this development database; no live populated-task preservation claim is made. Populated six-type, legacy, approval, provenance and event preservation is covered by the earlier disposable rehearsal described in [PHASE-3.4.md](PHASE-3.4.md).

**Flags.** A fresh isolated Node process using the installed Next.js environment loader verified `FLUX_SHARED_FILE_IDENTITY`, `FLUX_APPROVAL_ENGINE`, `FLUX_SHARED_EVENTS`, `FLUX_UNIVERSAL_TASKER`, `FLUX_TASKER_DELIVERABLES` and `FLUX_TASKER_CONCEPTS` all load as `1`; `FLUX_TASKER_SISTERS` is unset. No application server was started against Neon. Full fresh application startup with all seven enabled belongs to the separately approved post-migration stage.

**Locking, compatibility and recovery.** Both snapshots found zero other active transactions, zero waiting locks and zero prepared transactions. One other session existed without an active transaction; no other database relation locks were reported. These are point-in-time observations and must be repeated immediately before any approved execution.

Foreign-key creation requires SHARE ROW EXCLUSIVE locks on referencing and referenced tables, so writes to `UniversalTask`, `UniversalTaskEntry`, `SharedFileVersion` and `UniversalTaskUpload` can briefly wait. CHECK operations can take stronger locks on the newly created tables. The new entry trigger also requires DDL locking of its existing table. No long-running backfill or existing-table index build is proposed. [PostgreSQL 18 ALTER TABLE documentation](https://www.postgresql.org/docs/18/sql-altertable.html).

The candidate uses PostgreSQL 18-supported PL/pgSQL, JSONB, restrictive foreign keys, row/statement triggers and initially deferred AFTER ROW constraint triggers. Function replacements preserve signatures and return types; PostgreSQL retains existing ownership and permissions. Static review found no PostgreSQL 18 incompatibility. This is an assessment, not a migration rehearsal on PostgreSQL 18. [PostgreSQL 18 CREATE FUNCTION](https://www.postgresql.org/docs/18/sql-createfunction.html), [CREATE TRIGGER](https://www.postgresql.org/docs/18/sql-createtrigger.html).

**Material execution limitation:** the exact reviewed SQL has no explicit BEGIN/COMMIT wrapper or SQL timeout settings. It has not been edited to add them because that would change the approved candidate checksum. Do not assume an explicit migration-wide rollback guarantee; Prisma documents that PostgreSQL migrations are not explicitly wrapped by default. Any failed or uncertain execution must stop for ledger/catalog inspection without automatic retry or repair. [Prisma migration transaction guidance](https://www.prisma.io/blog/prisma-migrate-dx-primitives).

The proposed execution settings are a 5-second lock timeout and 60-second statement timeout supplied through the direct connection URL. A read-only SELECT through installed Prisma Client confirmed those startup options reach PostgreSQL, along with enforced read-only mode during this check. This did not invoke the migration engine or authorize writes. The execution process must retain the same timeouts and a single-attempt guard after separate approval.

Neon recovery verification at 19:00:13 UTC confirmed 21,600 seconds (six hours) of history retention and successful historical-schema access at 18:58:10 UTC. The historical schema contains the expected 120 tables and no Sister tables. Its SHA-256 is `98aa35932c42a4450bf6a2afb38df8610fe40fc203e234b7d321e92c16c56637`. No restore drill or complete data backup was performed; schema access is evidence of recovery availability, not proof of a successful data restoration. Refresh recovery checks before execution because the retention window moves.

**Verification scope and limitations.** The prior implementation's 16 successful verification entries remain tied to unchanged source hashes: TypeScript, ESLint, production build, Tasker/Sister units and integration, authorization/approval/event regressions, both repaired legacy runners and all four browser suites. Prior Chromium evidence records 48 screenshots with zero page errors and external requests. These suites were not rerun as post-activation checks because activation has not occurred. Prior mutation coverage used disposable PostgreSQL 14.19 and fake storage; PostgreSQL 18.6 migration execution, real S3/PDF rendering, Safari and Firefox are not claimed.

No critical mismatch or unresolved implementation blocker was found. Execution remains gated on the explicit approval required by the request, with the transaction, recovery and coverage limitations above disclosed.

**Approval scope to request.** Apply only the exact candidate/checksum to the verified development target using installed Prisma migrate deploy, after repeating identity, history/checksum, recovery, drift, preservation and lock checks. Require 112 successful migrations, zero failed/pending, 122 public tables, no drift, exact catalog additions, empty new tables and unchanged prior records. Only after those postchecks pass, enable `FLUX_TASKER_SISTERS=1` in local `.env.local`, preserve the six existing flags, verify all seven in a fresh application process, and rerun all requested isolated regressions and browser acceptance. Stop on any unexpected result; no automatic retry/repair, live synthetic data, S3 mutation, external dispatch, push, deployment or Phase 4 work.

Private local evidence: `.tmp/phase34-preflight-t17r8u97/`, including provider/recovery records, before/after full-table fingerprints and catalogs, 112-file migration manifest, source hashes, baseline/candidate Prisma diffs, live guard-function diffs, flags, connection settings and `preflight-passed.json`. No credentials or raw credential-bearing rows are included in these evidence records.
