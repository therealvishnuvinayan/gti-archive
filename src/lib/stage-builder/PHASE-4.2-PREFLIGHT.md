# Phase 4.2 — controlled development activation preflight

**Read-only preflight passed; explicit execution approval is still required.** Final verification completed at **2026-10-22T06:02:10.474Z / 2026-10-22 10:02:10 Dubai**. No migration was attempted and no environment flag was changed.

This report implements the mandatory checkpoint in section 7 of the user's Phase 4.2 preflight request. It does not authorize execution. The reviewed implementation is documented in [PHASE-4.2.md](./PHASE-4.2.md); the live baseline is the separately completed [Phase 4.1 activation](./PHASE-4.1-ACTIVATION.md).

**1. Verified target and connections**

| Identity | Independently verified value |
| --- | --- |
| Neon project | `flux-v2-dev` / `little-hall-78798085` |
| Branch | `develop` / `br-frosty-moon-b43rvpbe` |
| Endpoint ID | `ep-raspy-salad-b4iqfan0` |
| Database/schema | `neondb/public` |
| PostgreSQL | `18.6 (fd34222)` |
| Direct endpoint | `ep-raspy-salad-b4iqfan0.c-6.us-east-2.aws.neon.tech` |
| Pooled endpoint | `ep-raspy-salad-b4iqfan0-pooler.c-6.us-east-2.aws.neon.tech` |
| Direct fingerprint | `5b001dbfcdb263fa` |
| Pooled fingerprint | `9d6f1df51a9db284` |

Fingerprints are the first 16 hexadecimal characters of SHA-256 over `hostname:5432/neondb`; they contain no credentials. Fresh provider reads verified the project, branch, endpoint association, database and recovery retention. SQL verified the actual server identity. Environment precedence and any direct-URL overrides were checked before connecting. All database probes used the direct endpoint with default transaction read-only enabled; complete snapshots also explicitly used repeatable-read, read-only transactions.

**2. Exact candidate**

File: [`prisma/migrations/20261023020000_workflow_publication/migration.sql`](../../../prisma/migrations/20261023020000_workflow_publication/migration.sql).

The repository file and reviewed private copy have the required 64-character SHA-256:

```text
6552870889a39ad1605678671c8a4671ac242ef062c823045ff8ec0fb6ec2c62
```

All 113 preceding migration names and checksums match the live ledger and their original implementation baseline. The candidate remained unchanged throughout preflight.

**3. Current and proposed database state**

| Check | Current, verified twice | Expected after separate approval and successful execution |
| --- | ---: | ---: |
| Successful migrations | 113 | 114 |
| Failed migrations | 0 | 0 |
| Pending migrations | 1 | 0 |
| Public tables, including Prisma ledger | 124 | 128 |
| Prisma schema drift | None against the 113-migration baseline | None against the reviewed 114-migration schema |
| Publication tables | Absent | Four, initially empty |

**4. Pending migration and drift**

Installed Prisma **6.19.3** reports exactly one pending migration: `20261023020000_workflow_publication`. Its status command exits 1 because that migration is pending; this is the expected status result, not a failed migration.

Read-only Prisma diffs against the preserved 113-migration schema returned `-- This is an empty migration.` before and after verification. The proposed Prisma schema delta matches the candidate's generated DDL statements. The live columns, constraints, indexes, enum values, functions and triggers also match the Phase 4.1 final catalog exactly, covering custom SQL that Prisma's schema comparison does not represent. All existing constraints are validated, indexes valid/ready and user triggers enabled.

**5. Complete proposed object inventory**

| Group | Reviewed inventory |
| --- | --- |
| Four tables | `WorkflowPublicationSubmission`, `WorkflowPublicationAudit`, `PublishedWorkflow`, `PublishedWorkflowVersion` |
| 18 indexes | Four primary-key indexes, ten additional unique indexes, four ordinary indexes; complete columns below |
| 18 foreign keys | Five on submissions, three on audit, one on workflow identity, nine on versions; complete references below |
| Three new checks | `WorkflowPublicationSubmission_shape`, `WorkflowPublicationAudit_shape`, `PublishedWorkflowVersion_shape` |
| Two extended checks | `ApprovalRequest_values_check`, `BusinessEvent_contract_check` |
| Six new functions | `flux_workflow_actor_current`, `flux_workflow_publication_guard`, `flux_workflow_approval_consistency`, `flux_workflow_publication_consistency`, `flux_workflow_supersede_review`, `flux_emit_workflow_publication_event` |
| Three extended functions | `flux_approval_write_guard`, `flux_approval_consistency_guard`, `flux_event_write_guard` |
| 15 triggers | On each new table: `flux_workflow_publication_guard`, `flux_workflow_publication_truncate`, `flux_workflow_publication_consistency` (12 total). On `WorkflowDraftRevision`: `flux_workflow_supersede_review`. On audit and version tables: `flux_emit_workflow_publication_event` (two). |
| Five enum values | `ApprovalSubjectType.WORKFLOW_DRAFT_REVISION`; `BusinessEventType.WORKFLOW_PUBLICATION_SUBMITTED`, `WORKFLOW_PUBLICATION_SUPERSEDED`, `WORKFLOW_PUBLICATION_DECIDED`, `WORKFLOW_VERSION_PUBLISHED` |
| Existing column changes | Drop column-level NOT NULL on `ApprovalRequest.projectId`, `completionSubmissionId`, `submissionEventId`; replace it with the mandatory typed-subject check described below |

| Table | Every proposed index, expressed by its columns |
| --- | --- |
| `WorkflowPublicationSubmission` | PK `(id)`; unique `(draftRevisionId)`, `(approvalRequestId)`, `(submittedById, commandId)`; ordinary `(workflowId, submittedAt, id)`, `(previousPublishedVersionId)` |
| `WorkflowPublicationAudit` | PK `(id)`; unique `(eventId)`; ordinary `(supersedingRevisionId)` |
| `PublishedWorkflow` | PK `(id)` |
| `PublishedWorkflowVersion` | PK `(id)`; unique `(submissionId)`, `(draftRevisionId)`, `(approvalRequestId)`, `(approvalDecisionId)`, `(eventId)`, `(workflowId, number)`; ordinary `(publishedAt, id)` |

| Table | Every proposed foreign key: local column → referenced table's `id` |
| --- | --- |
| `WorkflowPublicationSubmission` | `workflowId` → `WorkflowDraft`; `draftRevisionId` → `WorkflowDraftRevision`; `approvalRequestId` → `ApprovalRequest`; `submittedById` → `User`; `previousPublishedVersionId` → `PublishedWorkflowVersion` |
| `WorkflowPublicationAudit` | `id` → `ApprovalEvent`; `supersedingRevisionId` → `WorkflowDraftRevision`; `eventId` → `BusinessEvent` |
| `PublishedWorkflow` | `id` → `WorkflowDraft` |
| `PublishedWorkflowVersion` | `workflowId` → `PublishedWorkflow`; `submissionId` → `WorkflowPublicationSubmission`; `draftRevisionId` → `WorkflowDraftRevision`; `approvalRequestId` → `ApprovalRequest`; `approvalDecisionId` → `ApprovalDecision`; `authorId`, `submittedById`, `approvedById` → `User`; `eventId` → `BusinessEvent` |

All 18 foreign keys use restrictive update/delete actions. The submission-to-request FK and the two new event FKs are initially deferred. The four new consistency triggers are initially deferred; write/truncate guards are immediate. Exact object names, including all indexes and constraints, are retained in the [machine-readable inventory](../../../.tmp/phase42-preflight-ejtpvri3/proposed-inventory.json).

The 70 top-level SQL statements contain schema operations, function/trigger definitions and transaction settings, with **no top-level business INSERT, UPDATE, DELETE or TRUNCATE**. No historical rewrite, backfill, draft publication or project-stage creation occurs during this migration. Business writes inside the new trigger functions apply only to later authorized workflow operations.

**6. Approval-engine and governance compatibility**

For `COMPLETION_DOCUMENT_SUBMISSION`, the new subject check still requires all three native references, the matching submission subject ID and existing requester/snapshot/state requirements. Existing native FKs remain. The completion write-guard branch is identical after whitespace normalization; its consistency guard is identical except for the early dispatch of the new workflow subject. The completion adapter still requires the genuine authorized project transaction, current Director or actual SPM/JPM Owner/Co-owner, exact READY `SharedFileVersion` evidence, native terminal event and accepted-document consistency. Mandatory-document completion gates and Director-only final project completion remain intact.

For `WORKFLOW_DRAFT_REVISION`, native project/submission/event references, external requester and expiry must all be absent. A genuine internal requester and the fixed `workflow-publication.director.v1` policy are required. Database guards reject fabricated file evidence and native document events. A submission pins one immutable, validated current revision and exact definition hash, with genuine actor/session/version attribution.

The shared engine and workflow adapter require one explicit Director decision, a mandatory reason, API confirmation, exact request/step/revision/evidence expectation and configuration hash. The definition is reparsed and hashed on the server. Central authorization locks the current actor/session; approval rechecks and locks the submitter's current authorization. The workflow row is locked before the request, serializing edits, submission, supersession and decisions. Exact authenticated replay returns the existing decision; conflicting or stale commands cannot publish another version.

Approval, immutable numbered version, native audit, shared events and outbox commit atomically. Deferred guards enforce the complete evidence chain and contiguous version history. Updates, deletions and truncation of publication evidence are denied. A newer revision supersedes pending review, including when publication is disabled later; approved versions remain unchanged.

The user-authorized Director self-approval policy is confined to workflow publication and still requires a separate confirmed, reasoned decision. Tasker/native-file independent review and completion-document policies are unchanged. Existing completion, Tasker and draft event branches compare identically; the sole existing-outbox adjustment admits depth three only for the typed native workflow-supersession event. Generic event insertion remains denied.

Project creation, approved Artwork preset authority, JPM/eligible-SPM requirements, final completion, Archives and Library retain their existing policies. Published workflows remain configuration records and a management catalog; no runtime stages or executable project-creation option are introduced.

**7. Data, accounts, environment and workspace preservation**

Complete row counts and canonical full-row SHA-256 fingerprints were captured for **all 124 public tables**, including the ledger. Every fingerprint matches the Phase 4.1 final activation evidence and the final snapshot of this preflight. All 113 existing ledger rows are unchanged. Raw rows containing passwords, password hashes or session tokens were not exported; complete-row hashes were computed inside PostgreSQL.

- All nine User rows, including stored passwords, and all nine ACTIVE authorization assignments remain identical. There is exactly one Director and two technical-only administrators, with the expected business roles, technical privileges and authorization versions.
- All nine authorization-history rows, three sessions, the approved Artwork preset and its original Director governance event are unchanged. The preset definition hash, approver and timestamps match the activation record. Six status groups and ten status options are unchanged.
- Workflow drafts/revisions, completion submissions/approvals/decisions/history, all Tasker/Sister structures, files/provenance, shared events/outbox, Archives, Library and project/stage structures are unchanged. These operational tables currently contain no rows; populated preservation coverage comes from disposable integration fixtures, not invented Neon data.

Actual `.env`, `.env.local` and `.env.example` retain their initial hashes. A fresh process using the installed Next.js environment loader verified these eight flags as `1`: `FLUX_SHARED_FILE_IDENTITY`, `FLUX_APPROVAL_ENGINE`, `FLUX_SHARED_EVENTS`, `FLUX_UNIVERSAL_TASKER`, `FLUX_TASKER_DELIVERABLES`, `FLUX_TASKER_CONCEPTS`, `FLUX_TASKER_SISTERS`, `FLUX_STAGE_BUILDER_DRAFTS`. `FLUX_STAGE_BUILDER_PUBLICATION` remains **unset and disabled**. No shell feature-flag overrides were present.

The current implementation at commit `9624057b7dd485631e3a7754d678d7a20ed4e18b` matches all **996** reviewed baseline/implementation file hashes. All **598** application source files in the previously tested production build match current source; package, lockfile and Prisma schema match too. Git's commit changed externally during the session, but source content did not; this preflight made no commit or staging change. Its only new repository document is this report; supporting evidence is ignored under `.tmp`.

**8. Recovery, locking and failure behavior**

Neon reports **21,600 seconds / six hours** of recovery retention. A provider GET at `2026-10-22T05:57:42.976Z` successfully retrieved the 124-table historical schema for `2026-10-22T05:55:41.207Z`, including drafts, approvals, events and Tasker/Sister structures and excluding publication tables. Historical-schema SHA-256: `c221eb120bbb1846794a44aa20bd3c664da261bfef1fe713e4bf1b95c773d494`. **No restore drill was performed.**

Both live snapshots found zero competing sessions, active transactions, waiting locks or prepared transactions. These observations must be repeated immediately before any separately approved execution.

The candidate contains explicit `BEGIN` / `COMMIT`, `SET LOCAL lock_timeout = '5s'` and `SET LOCAL statement_timeout = '60s'`. Altering `ApprovalRequest` and replacing checks on it and `BusinessEvent` requires strong table locks and check validation. Those tables can temporarily block reads and writes. New foreign keys also lock referenced existing tables; the draft-revision trigger installation can block competing writes. Locks normally last until transaction completion. See PostgreSQL 18's [ALTER TABLE](https://www.postgresql.org/docs/18/sql-altertable.html) and [locking rules](https://www.postgresql.org/docs/18/explicit-locking.html).

The five-second limit applies to each lock wait; the 60-second limit applies to each statement. Neither promises a 60-second bound on the entire multi-statement transaction. A quiet development window and the repeated lock check remain necessary. See PostgreSQL's [timeout semantics](https://www.postgresql.org/docs/18/runtime-config-client.html).

The proposed procedure uses the installed Prisma `migrate deploy --schema <reviewed-copy>/schema.prisma`, the direct endpoint and connection-level 5s/60s settings as well as the unchanged SQL settings. A checked manifest containing the existing 113 migrations plus this sole candidate prevents unrelated pending work from being included. Prisma's advisory locking remains enabled; drift and checksum verification are separate because deploy does not perform a full drift check. See [Prisma v6 deployment behavior](https://www.prisma.io/docs/orm/v6/prisma-migrate/workflows/development-and-production).

Only one execution attempt may occur after approval. Failure, timeout, disconnect or uncertain outcome must stop for read-only inspection of the actual schema and Prisma ledger. The SQL transaction is not grounds to assume the observed schema or ledger outcome. No automatic retry, repair, resolve, reset or recovery action is authorized.

**9. PostgreSQL 18 compatibility findings**

The exact installed Prisma 6.19.3 schema engine successfully performed introspection, both schema comparisons, migration status and a SELECT-only settings/identity assertion against PostgreSQL 18.6. The assertion verified `neondb/public`, read-only enforcement, `lock_timeout=5s` and `statement_timeout=1min`. Engine SHA-256: `caa2cf90d5b2cfe6cc06e47974f7e3275dd395b4d35cf140d5d4b2362c3b5bb1`.

No incompatible SQL construct was identified. PostgreSQL 18 permits adding enum values inside a transaction but prohibits using newly added values before commit. The candidate's new subject/event check branches compare enum values through text; casts to new enum values occur in PL/pgSQL bodies that the migration does not invoke. This avoids using uncommitted enum values during installation. See [PostgreSQL 18 ALTER TYPE](https://www.postgresql.org/docs/18/sql-altertype.html).

**Limit:** this candidate's mutating migration and runtime rehearsals used disposable PostgreSQL **14.19**, not 18.6. The current preflight confirms the actual 18.6 server, installed-engine connectivity/introspection and reviewed SQL compatibility; it does not claim a completed PostgreSQL 18.6 execution rehearsal.

**10. Regression and test evidence**

The exact implementation hashes and final successful receipts were rechecked. No product source changed and no preflight finding invalidated the existing tests, so the full mutation suites were not repeated. All prior mutation tests used disposable socket-only PostgreSQL, synthetic users and fake storage/external services.

| Required coverage | Verified evidence |
| --- | --- |
| Draft creation, editing, immutable revisions and cloning; all six Tasker types and Sisters | PASS within the publication integration chain |
| Submission, Director approval/rejection, explicit self-approval, version history, supersession/resubmission, session/role revocation, concurrency/replay/rollback, audit/outbox | PASS, 414 publication assertions |
| Populated migration preservation | PASS, 113 migrations / 124 tables → 114 / 128; all prior rows/ledger checksums preserved, four new tables empty, no drift |
| Authorization, native completion approvals/evidence, creation/final completion, files, Archives and Library | PASS, 112 broad named checkpoints |
| Foundation/persistence, approvals, events, Tasker/Sister units | PASS |
| Legacy task runner | PASS, 123 assertions across two suites |
| Legacy concept runner | PASS, 885 assertions across seven suites |
| Stage 5 UI runner | PASS, 94 source assertions + 30 isolated checkpoints |
| Stage 6 UI runner | PASS, 73 source assertions + 21 isolated checkpoints |
| Stage 7 UI runner | PASS, 81 source assertions + 29 isolated checkpoints |
| Concept UI runner | PASS, 54 source assertions + 21 isolated checkpoints |
| TypeScript | PASS, full application typecheck plus integration-runner compilation |
| ESLint | PASS, reviewed changed/new files, zero warnings |
| Isolated production build | PASS; current source matches its tested copy |
| Publication browser acceptance | PASS, 57 assertions / 16 screenshots; zero page errors or external requests |
| Publication-disabled 113-schema browser acceptance | PASS, 61 assertions / 14 screenshots; eight flags enabled, publication off; zero page errors or external requests |

Assertion totals and named checkpoints are separate measures and include overlapping coverage. The four UI receipts are the final successful runs, not the earlier superseded harness failure. The isolated build has the previously documented non-failing multiple-lockfile warning. No required final regression is failing. A temporary preflight environment-loader script initially used the wrong module resolution path; correcting that private harness to use Next's installed dependency produced the successful fresh-loader result without changing application source or environment.

**11. Limitations, approval request and stop point**

No critical target, checksum, drift, preservation, inventory, authorization or regression mismatch was found. The material verification limits are the absence of a PostgreSQL 18.6 mutation rehearsal and a completed restore drill. Existing Neon operational tables are empty, so historical operational-row preservation is supported by populated isolated rehearsals. The current lock and recovery observations are time-sensitive and must be repeated before execution.

Private evidence is retained under `.tmp/phase42-preflight-ejtpvri3/`: provider identity/recovery receipts, `before.json`, `final.json`, all 124 table fingerprints, the 114-file migration manifest, reviewed SQL/schema copies, empty baseline/final diffs, candidate delta, installed-engine probe, complete proposed inventory, source/test hashes, fresh flag receipt and `final-verification.json`. Earlier isolated test logs and browser receipts remain under `.tmp/phase42-pmQiMv/`.

**Approval requested:** apply only `20261023020000_workflow_publication` with SHA-256 `6552870889a39ad1605678671c8a4671ac242ef062c823045ff8ec0fb6ec2c62` to the verified `flux-v2-dev / develop / neondb` target, once, through the reviewed direct-endpoint Prisma procedure. Only after successful 114/128, no-failure/no-pending/no-drift, complete preservation and object-validation postchecks, enable `FLUX_STAGE_BUILDER_PUBLICATION=1` in local `.env.local` while preserving the eight existing flags. Then verify all nine in a fresh Next.js process and repeat the required isolated regressions, build and browser acceptance.

**Stopped at the requested approval checkpoint.** No Neon business records, accounts, permissions, live S3 objects or environment flags were changed. No actual workflow was published or approved, no runtime stages were instantiated, no external worker or notification was activated, and nothing was pushed or deployed. Phase 4.3 was not begun.
