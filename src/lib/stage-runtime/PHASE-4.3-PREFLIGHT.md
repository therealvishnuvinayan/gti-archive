# Phase 4.3 — controlled development activation preflight

**Read-only preflight passed; activation requires separate explicit approval.** Final verification: **2026-10-22T17:16:41.747639+00:00**. Final live preservation/drift/lock check: **2026-10-22T17:12:08.863Z**. No Neon migration was attempted and no environment flag was changed. This report implements section 7 of the user's Phase 4.3 preflight request: “STOP and request my explicit approval before applying the migration or changing any environment flag.”

The implementation remains as documented in [PHASE-4.3.md](./PHASE-4.3.md), following the completed [Phase 4.2 activation](../stage-builder/PHASE-4.2-ACTIVATION.md). Preflight started from clean HEAD `cdce362b728346fe7e344d7e22c6d639c41c94cc`. The 46 reviewed hashes and all 1,019 original/changed implementation files match the prior verification evidence. No implementation or migration changes were needed.

**1. Independently verified identity**

| Identity | Verified value |
| --- | --- |
| Neon project | `flux-v2-dev` / `little-hall-78798085` |
| Branch | `develop` / `br-frosty-moon-b43rvpbe` |
| Endpoint ID | `ep-raspy-salad-b4iqfan0` |
| Database/schema | `neondb/public` |
| Actual PostgreSQL | `18.6 (fd34222)` |
| Direct endpoint | `ep-raspy-salad-b4iqfan0.c-6.us-east-2.aws.neon.tech` |
| Pooled endpoint | `ep-raspy-salad-b4iqfan0-pooler.c-6.us-east-2.aws.neon.tech` |
| Direct fingerprint | `5b001dbfcdb263fa` |
| Pooled fingerprint | `9d6f1df51a9db284` |

Fingerprints are the first 16 hex characters of SHA-256 over `hostname:5432/neondb`, without credentials. Provider GETs verified the project, branch, endpoint association, database and retention. SQL independently verified the actual database and server. Environment precedence and any direct URL overrides were checked. Every live database connection enforced default read-only mode; preservation snapshots additionally used explicit repeatable-read, read-only transactions.

**2. Exact candidate and migration history**

File: [`prisma/migrations/20261023030000_stage_runtime/migration.sql`](../../../prisma/migrations/20261023030000_stage_runtime/migration.sql).

```text
7561f1b249489281a37ff356bbcda514092332fa0973482a5ee943aab5b213b8
```

The repository SQL, private reviewed copy and expected full 64-character checksum match. All 114 previous migration names/checksums match both the live ledger and preserved implementation baseline. Installed Prisma **6.19.3** reports precisely one pending migration, this candidate. Its status exit code is 1 because a migration is pending; no migration has failed.

| Check | Current verified state | Expected after separate approval |
| --- | ---: | ---: |
| Successful migrations | 114 | 115 |
| Failed migrations | 0 | 0 |
| Pending migrations | 1 | 0 |
| Public tables, including Prisma ledger | 128 | 134 |
| Prisma drift | None against baseline 114 | None against reviewed schema 115 |
| Runtime tables | Absent | Six, initially empty |

Both fresh live baseline diffs returned an empty migration. The local baseline-to-candidate Prisma DDL is contained exactly in the reviewed SQL. All live columns, constraints, indexes, enums, functions and triggers match the prior final catalog, including custom guards outside Prisma's drift representation. Existing constraints are validated, indexes valid/ready and user triggers enabled.

**3. Complete proposed object inventory**

| New table | Columns | Indexes, expressed by columns |
| --- | ---: | --- |
| `RuntimeProject` | 12 | PK `(id)`; ordinary `(ownerId, createdAt, id)` |
| `RuntimeParticipant` | 6 | PK `(id)`; unique `(projectId, userId)` |
| `RuntimeStage` | 13 | PK `(id)`; unique `(projectId, definitionStageId)`, `(projectId, position)` |
| `RuntimeFileSubmission` | 15 | PK `(id)`; unique `(versionId)`, `(supersedesId)`; ordinary `(stageId, capabilityId)` |
| `RuntimeApprovalSubmission` | 10 | PK `(id)`; unique `(approvalRequestId)`; ordinary `(stageId, capabilityId, requestedAt)` |
| `RuntimeActivity` | 15 | PK `(id)`; unique `(eventId)`, `(actorId, commandId)`, `(projectId, sequence)`; ordinary `(stageId, sequence)` |
| Existing `SharedFileReference` | +1 nullable column | Unique `(runtimeSubmissionId)` |

Total: **six new tables / 71 new-table columns; 20 indexes = six PK + ten other unique + four ordinary indexes**. Existing `SharedFile.runtimeStageId` and `SharedFileReference.runtimeSubmissionId` are nullable text bindings. No existing column is dropped, renamed or made less restrictive.

| Table | Every new FK: local column → referenced table's `id` |
| --- | --- |
| `RuntimeProject` | `ownerId`, `createdById` → `User`; `publishedVersionId` → `PublishedWorkflowVersion` |
| `RuntimeParticipant` | `projectId` → `RuntimeProject`; `userId`, `addedById` → `User` |
| `RuntimeStage` | `projectId` → `RuntimeProject`; `completedById` → `User` |
| `RuntimeFileSubmission` | `stageId` → `RuntimeStage`; `versionId` → `SharedFileVersion`; `supersedesId` → `RuntimeFileSubmission`; `submittedById`, `reviewedById` → `User` |
| `RuntimeApprovalSubmission` | `stageId` → `RuntimeStage`; `requestedById` → `User`; `approvalRequestId` → `ApprovalRequest` |
| `RuntimeActivity` | `projectId` → `RuntimeProject`; `stageId` → `RuntimeStage`; `actorId` → `User`; `eventId` → `BusinessEvent` |
| Existing `SharedFile` | `runtimeStageId` → `RuntimeStage` |
| Existing `SharedFileReference` | `runtimeSubmissionId` → `RuntimeFileSubmission` |

All **22 FKs** use `ON DELETE RESTRICT ON UPDATE RESTRICT`. Runtime approval → request and activity → event are initially deferred.

Seven new CHECK constraints: `RuntimeProject_shape`, `RuntimeParticipant_shape`, `RuntimeStage_shape`, `RuntimeFileSubmission_shape`, `RuntimeApprovalSubmission_shape`, `RuntimeActivity_shape`, `SharedFile_runtime_origin`.

Four replaced/extended CHECK constraints: `ApprovalRequest_values_check`, `ApprovalStep_position_check`, `BusinessEvent_contract_check`, `SharedFileReference_one_record_check`.

Seven new PL/pgSQL functions: `flux_runtime_authorized`, `flux_runtime_ready`, `flux_runtime_guard`, `flux_runtime_consistency`, `flux_emit_runtime_event`, `flux_runtime_approval_write`, `flux_runtime_approval_consistency`. Precise terminology: **three return `trigger`; four are helper functions** returning boolean or void. The reported total of seven is correct.

Four extended guard functions: `flux_approval_write_guard`, `flux_approval_consistency_guard`, `flux_event_write_guard`, `flux_shared_file_reference_guard`.

Nineteen new triggers: on each of the six runtime tables, `flux_runtime_guard` before row writes, `flux_runtime_truncate` before truncate, and `flux_runtime_consistency` after insert/update, deferred until transaction completion; plus `flux_emit_runtime_event` after insertion on `RuntimeActivity`.

Three enum additions: `ApprovalSubjectType.RUNTIME_STAGE`, `ApprovalStepEligibility.RUNTIME_STAGE_REVIEWER`, `BusinessEventType.RUNTIME_ACTIVITY`.

The SQL contains **81 top-level statements**, including explicit transaction settings, schema operations, function definitions and one DO block that creates triggers. There is no top-level business INSERT, UPDATE, DELETE, TRUNCATE, COPY or function invocation that seeds business data. No historical conversion, backfill or automatic runtime project is introduced. Complete object names and attributes are retained in [proposed-inventory.json](../../../.tmp/phase43-preflight-87p517au/proposed-inventory.json).

**4. Approval, file and event compatibility**

After removing only the new runtime dispatch/provenance branches, each of the four extended guard function bodies matches its actual live predecessor after comment/whitespace normalization. Native completion, Tasker, draft and publication branches are preserved.

`ApprovalRequest` gains a narrowly typed runtime subject: real internal requester, runtime policy key, no native project/completion-submission/event references, external requester or expiry. Completion-document and publication subject shapes retain their existing requirements. `ApprovalStep` permits 1–12 only for `RUNTIME_STAGE_REVIEWER`; previous eligibility types retain 1–8. The application engine admits that eligibility only through its explicit runtime adapter. Completion-document terminal native events, exact file evidence, accepted-document consistency and final project gates remain unchanged.

Shared files retain their native foundation. A runtime file cannot also claim an existing project/task/completion origin. The single-source reference check includes the exact runtime submission, and the reference guard binds its exact version, stage and uploader. Runtime files cannot enter other native source/publication paths. Existing explicit column projections keep Tasker and legacy readers compatible with schema 114.

Runtime events are anchored to immutable `RuntimeActivity`, with exact real actor, revision, correlation/causation and bounded action/stage payload. Their outbox insertion commits atomically. The existing worker/delivery rules and non-runtime event branches are unchanged; no consumer, notification or external worker is activated.

**5. Runtime and authorization boundaries**

Creation requires the central Director-only capability, a genuine current Director session, a genuine eligible Owner and active authorized participants. Creator attribution is separate from membership. The service and database pin the exact immutable published-version identity, version number, hash and stage configuration. They create a separate runtime project and all configured stages atomically, without native seven-stage initialization or existing-project conversion.

Stage services strictly parse commands and validate field identity, values, bounds, calendar dates and approved options. READ_ONLY fields reject direct API edits and retain defaults under SQL guards. The definition parser forbids required READ_ONLY fields. Required checklist text/exact-version evidence, file counts and acceptance gates are checked on the server and reinforced by database readiness/provenance guards. Rejected, superseded, pending or failed replacements cannot inherit approval. Explicit predecessor gates are enforced; ordering alone creates no dependency. Completion requires current readiness and verified storage observations. Completed stage projections, history and evidence are immutable.

The existing Approval Engine controls ordered steps, evidence hashes, revisions and replay. The runtime adapter checks current Director/SPM roles and genuine Owner/Co-owner relationships within current project scope. Requesters and current field/checklist/upload contributors cannot approve their own evidence, including Directors. The publication-only Director self-decision exception is not reused. Decisions require explicit confirmation/reason; changed evidence supersedes pending review and invalidates older approval for completion. RETURN_FOR_CHANGES requires persisted correction; BLOCK_STAGE cannot reopen.

Central authorization locks current assignments and the session. Project-root locks serialize runtime mutations; request locks, expected revisions and actor/command advisory locks enforce concurrency and idempotency. Deferred checks require contiguous native activity, exact projections, ordered approval history and atomic outbox records. Unauthorized managers, Designers, Digital Leads and technical-only administrators remain denied; executor membership alone grants no runtime access. APIs use same-origin bounded JSON, strict allowlists and protected file streaming.

Completing the last stage leaves `RuntimeProject.state='ACTIVE'`. The database check and immutable project guard prohibit a fabricated final state; there is no closure command or adapter. No final Director decision, native final-completion request, Stage 7 completion or archive is synthesized. The UI explicitly reports final closure as unavailable.

**6. Existing-data and environment preservation**

All **128 table row counts and canonical SHA-256 fingerprints**, all 114 ledger rows and the full custom catalog match the prior implementation snapshot and both fresh preflight snapshots. Passwords and session tokens were included only in server-side aggregate fingerprints; none were exposed or exported as raw values.

Preserved nonempty business/configuration tables: nine Users, nine ACTIVE UserAuthorization assignments, nine authorization-history rows, three sessions, one original approved Artwork preset, one governance event, six status groups and ten status options. Authorization versions remain 1; there is exactly one Director and two technical-only administrators without business roles. The original Artwork approval identity, definition hash, approver, timestamp and audit linkage remain exact.

Existing structured/flexible projects, native stages, Stage 5/6/7, completion documents, shared files, approvals, events/outbox, Archive/Library, all six Tasker types, Sister links/evidence, drafts and publication structures are present and unchanged. Their live operational tables are currently empty; preservation of populated histories is separately demonstrated by disposable rehearsals, not inferred from empty live tables. The actual Tasker enum retains GENERAL, FILE_UPLOAD, DATA_INPUT, INSPECT_FILE, INITIAL_CONCEPT and FINAL_CONCEPT.

`.env`, `.env.local` and `.env.example` hashes remain unchanged. A fresh process using the installed Next.js environment loader verified all nine flags as `1`: `FLUX_SHARED_FILE_IDENTITY`, `FLUX_APPROVAL_ENGINE`, `FLUX_SHARED_EVENTS`, `FLUX_UNIVERSAL_TASKER`, `FLUX_TASKER_DELIVERABLES`, `FLUX_TASKER_CONCEPTS`, `FLUX_TASKER_SISTERS`, `FLUX_STAGE_BUILDER_DRAFTS`, `FLUX_STAGE_BUILDER_PUBLICATION`. **`FLUX_STAGE_RUNTIME` remains unset.** This was an environment-loader check, not an activated application server.

Fresh integration verification confirms flag-off operation against the actual reconstructed 114-migration schema before applying the candidate. Runtime service/page/policy guards return before runtime queries. The retained 114-schema publication browser suite also passes with runtime disabled.

**7. PostgreSQL 18 compatibility, locking and failure behavior**

The candidate has explicit `BEGIN`/`COMMIT`, `SET LOCAL lock_timeout='5s'` and `SET LOCAL statement_timeout='60s'`. A fresh SELECT-only probe through the installed Prisma 6.19.3 schema engine verified both timeout settings and read-only enforcement on the actual 18.6 endpoint. Engine SHA-256 is `caa2cf90d5b2cfe6cc06e47974f7e3275dd395b4d35cf140d5d4b2362c3b5bb1`.

Column/check changes require strong locks on SharedFile, SharedFileReference, ApprovalRequest, ApprovalStep and BusinessEvent. FK installation also locks referenced tables; the extra existing-table unique index is non-concurrent. Nullable columns without defaults avoid historical value backfills. Constraint validation and index creation can still scan and block. The final snapshot found **zero other sessions, active transactions, waiting locks or prepared transactions**; public relations occupied 6,258,688 bytes. These observations must be repeated immediately before execution. [PostgreSQL 18 ALTER TABLE](https://www.postgresql.org/docs/18/sql-altertable.html).

Timeouts bound lock waits and statements, not the entire migration's wall time; locks already acquired remain until transaction end. Configure the direct connection's startup options as well as the SQL's local settings so Prisma ledger/advisory-lock operations receive the same server limits. Retain Prisma's advisory lock. Its own documented ten-second acquisition ceiling does not replace the requested server lock timeout. [PostgreSQL timeout semantics](https://www.postgresql.org/docs/18/runtime-config-client.html), [Prisma v6 deployment and advisory locking](https://www.prisma.io/docs/orm/v6/prisma-migrate/workflows/development-and-production).

No incompatible PostgreSQL 18 construct was identified. Newly added enum labels are compared through text in installation-time checks; new enum-valued writes occur only in later PL/pgSQL operations, after commit. PostgreSQL forbids using a newly added enum value before that transaction commits. [PostgreSQL 18 ALTER TYPE](https://www.postgresql.org/docs/18/sql-altertype.html).

**Mutation certification remains PostgreSQL 14.19 only.** Read-only 18.6 introspection/settings checks and compatibility review do not certify this candidate's mutation on Neon 18.6.

An SQL error before COMMIT should roll back the candidate transaction, but Prisma's migration-ledger start/failure record can persist separately. A lost connection after COMMIT can leave installed schema with an unfinished ledger entry. Therefore any failed or uncertain execution must stop: inspect actual schema, enum/function/trigger state and ledger, report them, and perform no automatic retry, resolve, repair, reset or rollback. No migration execution has occurred during this preflight.

**8. Recovery and storage limitations**

Provider recovery verification at **2026-10-22T17:08:17.305Z** reports **21,600 seconds / six hours** of history retention. The historical schema requested at `2026-10-22T17:06:08.917Z` is accessible and contains the expected 128 tables, including publication tables and no runtime tables. Schema SHA-256: `db5d07c79436693495a090205e83d8bbfad4c0e14ed3360d7523151a59c3b15d`. No restore drill or branch restoration was performed. Retention is time-limited and must be rechecked before execution; historical-schema access does not itself prove a complete data restore. [Neon restore documentation](https://neon.com/docs/postgres/backup-restore/branch-restore).

An initial Node fetch provider GET failed at the transport layer. The installed CLI's HTTP client then completed the same read-only identity/recovery checks successfully. This was not a database execution failure or migration retry.

Storage finalization copies a conditionally observed staging object to a sealed key, verifies metadata/integrity and commits the exact SharedFileVersion. Failed storage work records FAILED when the database transaction can commit. A database failure after copying can leave an orphan sealed object and an UPLOADING intent. Users have explicit cancellation/replacement paths; there is no atomic S3/database transaction, automatic cleanup or retry worker. Opaque ETags are not claimed to be cryptographic checksums. Real S3 operations, IAM/versioning/retention and throughput were not exercised in preflight.

**9. Verification tied to reviewed hashes**

All 46 prior reviewed source hashes still match. The production build's 617 application TS/TSX/CSS files exactly match current source. Its copied migration SQL predates final runtime-only guard hardening, which does not affect compilation. To remove that evidence gap for mutation tests, preflight reran all migration-bearing runtime, broad authorization, legacy and native UI suites against the final candidate checksum. The retained runtime browser runner copies SQL from the repository separately from production output and ran after final SQL hardening.

| Required coverage | Evidence and result |
| --- | --- |
| Runtime persisted creation, version pins, typed forms, checklists, files, ordered review, correction, readiness, immutable completion, denials, concurrency/replay/rollback/events | Fresh PASS, **503 assertions** |
| Populated migration, all prior rows/checksums and new objects | Fresh PASS, **114/128 → 115/134**, six empty tables at migration, no drift/backfill |
| Drafts, publication, all six Tasker types and Sister Tasks | Fresh PASS within the runtime migration chain; publication **414 assertions** in this run |
| Broad authorization, native completion approvals, project governance, shared files/events/outbox, Archives and Library | Fresh PASS, **112 checkpoints** |
| Legacy task and concept runners | Fresh PASS; **123 task assertions + three historical-migration checks**, **885 concept assertions** across seven suites |
| Four native UI checks | Fresh PASS; Stage 5 **94 + 30**, Stage 6 **73 + 21**, Stage 7 **81 + 29**, Concept **54 + 21** source assertions/isolated checkpoints |
| Authorization foundation/persistence; approval/event/Tasker units | Retained PASS, unchanged implementation and runner hashes |
| Full TypeScript | Retained PASS, exact application sources; fresh integration-runner compilation also passed |
| ESLint | Retained PASS, 41 reviewed TS/TSX/MJS files, zero warnings |
| Isolated production build | Retained PASS, exact current application source, Next.js 16.2.6 / Prisma 6.19.3, dummy DB endpoints |
| Runtime Chromium browser | Retained PASS, **72 assertions / 16 screenshots** |
| Runtime-disabled 114-schema publication browser | Retained PASS, **57 / 16** |
| Publication/runtime-disabled 113-schema draft browser | Retained PASS, **61 / 14** |

All mutation tests used disposable PostgreSQL 14.19, synthetic accounts and fake storage. Chromium 153.0.8010.12 receipts report zero page errors and zero external attempts. Coverage includes unrelated-manager, Designer, Digital Lead and both technical-only-account direct page/API/file denials; SPM/JPM creation/options denial; independent Owner/SPM/Co-owner/Director ordered approval; explicit final-stage completion leaving the project ACTIVE. The four UI checks contain overlapping integration coverage, not 101 unique tests. Publication/concept totals vary with concurrency outcomes.

**10. Reviewed procedure after separate approval**

Repeat provider/database identity, endpoint fingerprints, all 114 ledger/file checksums, exact candidate hash, recovery, preservation, baseline drift and locks. Stop on any critical difference. Use the installed, pinned Prisma CLI with a verified private copy containing exactly the existing history plus this sole candidate. The proposed command is `node <installed-prisma-cli> migrate deploy --schema <reviewed-copy>/schema.prisma`, with the direct endpoint supplied privately and startup lock/statement limits of 5/60 seconds. This is one execution attempt only; no `db push`, reset, repair or automatic retry.

Require 115 successful migrations, zero failed/pending, 134 public tables, no Prisma drift, exact intended custom catalog changes, all six runtime tables empty, all old rows/credentials/roles/sessions/history preserved and no backfill. Existing-row comparison must project the original columns on the two extended file tables and separately confirm the new bindings are null.

Only after successful postchecks, the requested conditional activation is `FLUX_STAGE_RUNTIME=1` in local `.env.local` alone. Preserve all nine flags, verify all ten in a fresh Next.js process, and repeat required isolated regressions, TypeScript, ESLint, production build and browser acceptance. No actual Neon runtime project or workflow publication is needed for testing.

**11. Approval checkpoint and evidence**

No critical target, checksum, preservation, drift, integrity or regression mismatch remains. Material limits are no candidate mutation on PostgreSQL 18.6, no completed restore drill, and no real-storage operational test. Initial participants remain fixed; final closure, SPM/JPM runtime creation, Tasker-to-stage integration, reopening/skipping and Phase 4.4 remain outside this implementation.

Fresh evidence is retained in `.tmp/phase43-preflight-87p517au/`: reviewed SQL/schema copies, 115-file migration manifest, source verification, provider/recovery receipts, before/final snapshots, canonical table fingerprints, empty baseline diffs, Prisma status/delta/settings probe, SQL/object/legacy-function review, fresh regression logs/receipts, retained build/browser/source evidence hashes and final verification. Earlier browser screenshots and build artifacts remain in `.tmp/phase43-kun0acme/`.

**Approval requested:** apply only `20261023030000_stage_runtime`, SHA-256 `7561f1b249489281a37ff356bbcda514092332fa0973482a5ee943aab5b213b8`, once to the verified development target using the reviewed procedure; then, only after all required migration/preservation postchecks pass, enable the runtime flag in local `.env.local` and perform activation verification.

**Stopped at the explicit approval checkpoint.** No database/schema/account/permission/S3/environment mutation, live test runtime, notification/worker activation, push, deployment or Phase 4.4 work occurred. Existing Git staging and source files remain preserved; this report and ignored evidence are the only additions.
