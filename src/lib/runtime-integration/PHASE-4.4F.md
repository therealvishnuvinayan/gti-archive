# Phase 4.4F — Integrated verification and controlled development activation preflight

Verified 23 October 2026. **Ready for the explicit development-activation approval checkpoint, with the operational note in item 10. Not activated.** No migration or feature-flag execution is authorized by this report. Phase 5 has not begun.

1. **Overall integrated implementation.** The combined A–E implementation passed fresh disposable-database, authorization, native/legacy, production-build and Chromium verification. The persisted browser sequence covers Director creation, independent SPM creation, JPM request/Director approval, pinned stages, information/checklist/file evidence, independent ordered stage review, all six runtime Tasker types, field/file application, Inspect/Concept references, Sisters, explicit completion-document policy, exact-version submission/review, Owner request, Director rejection/new request/final approval, and retained COMPLETED history. Service tests additionally cover rejected creation, concurrent decisions, stale evidence, rollback, Director-as-Owner and all six Sister variants. No executable project is created from a draft or unapproved definition.

   Stage, task and final-project completion remain separate operations. Task acceptance does not accept a configured stage file, complete a stage, complete a project or publish to Archives. Every runtime project requires an explicit Director-approved document policy; UNCONFIGURED blocks final completion, including when every stage is complete. REQUIRED, OPTIONAL and NOT_APPLICABLE remain explicit choices. Final completion requires the genuine Owner's request followed by a separate genuine Director decision. The native Director-as-Owner policy permits both roles, but each operation is separately confirmed, reasoned and audited.

2. **Exact changes made during F.** No application implementation, Prisma schema, migration SQL, environment file or existing report was changed. Two test files gained fifteen lines of negative coverage:

   - `scripts/runtime-completion-check.ts`: runtime external-submission command denial; native link issuance with a real RuntimeProject ID denied; native external INFO/PREPARE/FINISH with a forged token denied; no access/submission rows added.
   - `scripts/stage-runtime-browser-check.mjs`: actual HTTP denial of runtime external creation/submission and native token operations; persisted project/token/document/audit counts and fake-storage operation counts unchanged.

   Created: this `PHASE-4.4F.md` report and [PHASE-4.4F-OBJECTS.md](./PHASE-4.4F-OBJECTS.md). Ignored reproducible verification scripts, private reviewed copies and evidence are under `.tmp/phase44f/`.

   All A–E work was staged at the start of F. Its index remains byte-identical, SHA-256 `3b0373fffd5691662c28a178800782d2b0bb60286bb27e55d5d042ddad21a875`. F's test/document additions remain unstaged. The current SQL remains byte-identical to E; no new candidate checksum is required.

3. **Fresh regression and browser results.** All mutation testing used fresh disposable PostgreSQL **14.19**, genuine synthetic V2 sessions and fake storage. No application credentials are passed to those database harnesses. The isolated build uses unreachable loopback database URLs and no actual environment files. Its **635 application TS/TSX/CSS files and Prisma schema exactly match current source**.

   | Verification | Final result |
   | --- | --- |
   | A creation governance | PASS — 49 assertions |
   | B runtime General Tasks | PASS — 463 |
   | C runtime File Upload / Data Input | PASS — 376 |
   | D runtime Inspect / Initial / Final / Sisters | PASS — 483 |
   | E policies / documents / Owner requests / Director final completion | PASS — 340 in the final strengthened run |
   | Phase 4.3 stages / ordered approvals | PASS — 503 |
   | Published workflow governance | PASS — 414 |
   | Latest client, integration disabled, reconstructed actual 115 schema | PASS — 17 |
   | Draft Builder, six native/flexible Tasker types, native Sisters | PASS in the full progression; native types/Sisters also rerun after all 116 migrations |
   | Broad V2 services/session/account administration, native project read/write/governance and documents, approvals, Shared Files/provenance, events/outbox, Archives/Library, workspace/search | PASS — 113 named checkpoints |
   | Authorization foundation/persistence; approval/event/Tasker units | PASS |
   | Repaired legacy task runners | PASS — 66 + 57 assertions; separate historical-assignment check: 3 |
   | Repaired legacy concept runner | PASS — 887 assertions across seven scripts |
   | Stage 5 / Stage 6 / Stage 7 / Concept UI | PASS — source assertions 94 / 73 / 81 / 54; isolated checkpoints 30 / 21 / 29 / 21 |
   | Full TypeScript and isolated integration compilation | PASS |
   | ESLint, all 51 changed/new TS/TSX/MJS files | PASS — zero warnings |
   | Isolated Next.js production build | PASS |
   | Populated 115→116 migration, original rows/ledger, empty additions, Prisma drift | PASS — 116 successful / 150 tables / zero drift |
   | Complete before/after catalog comparison | PASS — exact inventory in item 8 |
   | Chromium 153.0.8010.12 | PASS — 233 assertions, 51 screenshots, zero unexpected page errors, zero blocked external requests |

   **Counted total: 4,193 assertions**, using the final E 340 run once and including the 233 browser assertions. Separately, the broad authorization suite reported 113 checkpoints and the four native UI suites 101 isolated checkpoints. Native Tasker/draft/unit suites without numeric assertion receipts also passed; they are not assigned invented counts. The earlier full progression's E 329 run is retained as evidence but not double-counted. Repeated/overlapping tests are not represented as unique business scenarios.

   Chromium exercised all five business roles and both technical-only accounts. The 32 recorded Tasker HTTP errors (27×403, 5×400) are intentional negative checks; runtime/native external denials are separately asserted. Database assertions verify genuine policy/reviewer/Owner/Director identities, exact final document-version evidence, unchanged stage snapshots and no legacy final-completion or Archive creation. The final completed-project screenshot was also visually inspected. Browser coverage does not claim every race or rollback path; those are persisted service/database tests.

   Initial sandbox runs could not start PostgreSQL shared memory or Next's local build helper. The affected runs subsequently passed with the required local OS access. Two private evidence checks initially assumed an incomplete catalog projection and quoted names for every recovery table; complete catalog snapshots and proper quoted/unquoted identifier parsing resolved those harness assumptions. No application assertion or database guard was removed or weakened. The strict zero-other-sessions observation is retained separately in item 10.

4. **Security audit, deferred capability and production limits.** Current sessions and authorization versions are resolved server-side. The authorization transaction locks assignments and the exact session before loading project/task resources; action-specific Director/Owner checks precede replay lookup. Project-before-task locking serializes completion and task mutations. Unique actor/command identities, expected revisions, immutable snapshots, native histories and deferred constraints prevent duplicate or contradictory outcomes. Tests cover conflicting requests/decisions, expired/revoked authority, forged/cross-project IDs, field conflicts, failed storage, rollback and late outbox failure.

   Designer/Digital Lead assignment exposes only task context and selected exact versions; it grants no full stage/completion-document authority. Spectators remain view-only under each task type's existing evidence rules. Technical privileges supply no business authority. Search/list/count/family traversal, previews/downloads and direct APIs use current scope. Tasker and runtime-stage independent-review rules remain intact; workflow-publication self-approval does not confer unrelated review authority. Native completion-document manager self-review remains its existing rule.

   The twelve existing-function changes were compared with the applied 115 baseline. New dispatch is typed to real runtime associations. Native attachment/provenance requirements remain enforced by their original branches plus compensating typed consistency checks. Nullable native IDs cannot stand in for RuntimeProject identity. The new document reference/provenance branches require their exact relational adapter before commit. Forced rollback tests retain business/history/outbox consistency.

   **Runtime external submission links are NOT implemented.** Native access records require legacy Project/workflow FKs and BusinessEvent requires an internal User actor. Runtime links need a separately reviewed typed token/access model and genuine external-actor provenance adapter. No fake Project/User, unsafe token, external email or broad project grant is introduced. Runtime creation/submission and forged native token attempts now fail closed in fresh service and HTTP tests. Existing native external-link expiry/revocation/submission tests pass unchanged. This is denial coverage, not a runtime external-link lifecycle pass.

   This deferred capability **does not prevent controlled development sign-off for the implemented internal-submission workflow**. It **prevents production sign-off for workflows requiring external runtime submissions**. General production rollout is not certified here: real S3/IAM/version retention, streaming/throughput, large histories, recovery execution and candidate mutation on PostgreSQL 18.6 were not exercised. ETags remain opaque validators, not cryptographic proofs. Tasker retains committed copy reservations and authorized recovery; completion-document copy followed by database rollback can leave an orphan sealed object. No cleanup/notification/worker is activated. Reopening, archive publication and official templates remain outside scope.

5. **Independently verified Neon identity and flags.** Provider GETs and the direct read-only database connection agree:

   | Attribute | Verified value |
   | --- | --- |
   | Project | `flux-v2-dev` / `little-hall-78798085` |
   | Branch | `develop` / `br-frosty-moon-b43rvpbe` |
   | Database / schema | `neondb` / `public` |
   | PostgreSQL | `18.6 (fd34222)` |
   | Direct endpoint | `ep-raspy-salad-b4iqfan0.c-6.us-east-2.aws.neon.tech` |
   | Endpoint identity | `ep-raspy-salad-b4iqfan0`, linked by provider to the authorized branch |
   | Direct fingerprint | `5b001dbfcdb263fa` |
   | Pooled fingerprint | `9d6f1df51a9db284` |

   Fingerprints are the established first 16 hex characters of SHA-256(host:port/database), excluding credentials. Environment precedence and any configured direct URL were validated privately against the same endpoint/role/database.

   At **2026-10-23 13:42:31 UTC**, a fresh process using installed Next `@next/env` loaded all ten existing flags as `1`: Shared File Identity, Approval Engine, Shared Events, Universal Tasker, Tasker Deliverables, Tasker Concepts, Tasker Sisters, Stage Builder Drafts, Stage Builder Publication and Stage Runtime. `FLUX_RUNTIME_INTEGRATION` is absent/disabled. `.env`, `.env.local` and `.env.example` hashes match the start of F.

6. **Actual migration history and baseline drift.** Read-only Neon introspection found **115 successful migrations, zero failed/unfinished/rolled-back entries, exactly one pending candidate, and 134 public tables including `_prisma_migrations`**. All 115 applied names and complete checksums match the actual repository SQL and Phase 4.3 activation ledger. Every historical file is unchanged. The separate installed Prisma 6.19.3 `migrate status` agrees: 116 local migrations and only `20261024010000_runtime_integration` pending. Its exit code 1 is the expected pending-migration status, not an execution attempt.

   Prisma's read-only database-to-115-schema diff is empty. Complete columns, constraints, valid/ready indexes, enums, function bodies and enabled triggers match the prior live snapshot and remain unchanged between the two fresh snapshots. No baseline custom-catalog drift is hidden by the Prisma comparison. Current source/reviewed copies have the same SQL and Prisma schema. No `migrate deploy`, reset, repair or resolve was executed against Neon.

7. **Exact approval candidate.**

   `prisma/migrations/20261024010000_runtime_integration/migration.sql`

   **SHA-256 (64 characters):**

   ```text
   0a7981b4ff8b3646a6e9acfca744ef4cd2c555698317c9a9ab469b6adff54bef
   ```

   This is the unchanged E candidate and the sole proposed migration. Earlier A/B/C/D checksums are historical and are not approval values.

8. **Complete proposed object inventory and dependency review.** The fresh 115→116 catalog comparison independently verifies **16 empty new tables, 55 valid indexes including primary keys, 48 validated restrictive foreign keys, seven new-table CHECKs, 24 new functions and 67 enabled new triggers**. Twelve existing function definitions and nine existing named CHECKs are replaced. Four labels extend existing enums; no enum type is added. All other prior columns, indexes, constraints, functions, triggers and enum labels remain intact.

   New tables: RuntimeCreationRequest, RuntimeCreationDecision, RuntimeTaskContext, RuntimeTaskEventContext, RuntimeTaskTarget, RuntimeTaskApplication, RuntimeTaskPublication, RuntimeTaskReference, RuntimeCompletionActivity, RuntimeDocumentPolicy, RuntimeDocumentFile, RuntimeDocumentSubmission, RuntimeDocumentReference, RuntimeDocumentProvenance, RuntimeCompletionRequest and RuntimeCompletionDecision.

   Existing CHECK replacements are on ApprovalRequest, BusinessEvent, RuntimeProject, SharedFileProvenance, SharedFileReference, UniversalTask, UniversalTaskPublication, UniversalTaskReference and UniversalTaskTarget. Exact names, every index, all FK destinations and deferral properties, all function identities and every trigger's timing/definition are in the [complete object appendix](./PHASE-4.4F-OBJECTS.md). Full bodies and before/after definitions are retained in `catalog-delta.json` and the actual SQL.

   The SQL has **191 top-level statements**, one explicit BEGIN/COMMIT and local 5-second/60-second timeouts. There is no top-level business INSERT/UPDATE/DELETE/TRUNCATE/COPY, automatic project creation, fabricated historical event, existing-column alteration or backfill. Existing Prisma changes are inverse relations only. CHECK relaxation for typed associations is compensated by exact relational/deferred guards; native identities retain their original meanings.

9. **Existing-data preservation.** Both read-only Neon snapshots match every one of the **134 canonical table row counts and SHA-256 fingerprints**, the complete ledger and custom catalog from the Phase 4.3 activation evidence. Passwords and session tokens participate only in server-side aggregate fingerprints; their raw values were neither exported nor displayed.

   Preserved live data: **nine Users, nine ACTIVE authorization assignments, nine authorization-history rows, three sessions, one approved Artwork preset, one governance event, six status groups and ten status options**. Authorization versions remain 1; there is one genuine Director and two technical-only administrators without business roles. Artwork approver identity, approval timestamp, definition hash and governance linkage are exact. Runtime/stage, draft/publication, native/flexible project, Tasker/Sister, file-version/provenance, approval/event/outbox, Archives and Library tables are present and unchanged; these operational tables are currently empty in Neon.

   Preservation of populated business histories is demonstrated separately by the disposable migration rehearsal. It compares every original table row and prior ledger entry before/after the candidate, including existing native/flexible projects, runtime stages, six Tasker types, Sisters, Shared Files, approvals/events and account/session data. The complete broad native regression suite also passes. All sixteen new tables begin empty. No existing table receives a new physical column in this candidate, so no new nullable binding requires a null-value postcheck; every original column must remain identical.

10. **Recovery availability, PostgreSQL 18 review and operational risk.** Provider verification at **2026-10-23 13:42:22 UTC** confirms **21,600 seconds / six hours** of retained history. The schema requested at **13:40:17 UTC** is accessible and contains exactly the same 134 table identities, including all runtime-stage tables and none of the pending integration tables. Historical schema SHA-256: `787039246e3f6d6549bf95806eb8ae45509708f30172f45bef5eade9b12d8b97`. No restore drill or branch restoration was performed; historical-schema availability does not certify a complete data restore. The retention window must be rechecked immediately before execution. [Neon restore documentation](https://neon.com/docs/postgres/backup-restore/branch-restore).

    The first fresh snapshot had zero other sessions, active transactions, waiting locks or prepared transactions. The final preservation snapshot at **13:48:29 UTC** still had **zero active transactions, waiting locks, held locks from other sessions or prepared transactions**, but found **one other session**. The private strict zero-other-sessions check stopped with `FINAL_LOCK_RISK`; it is retained, not reported as a pass. Read-only inspection at **13:50:35 UTC** identified an idle `pgbouncer` client backend, PID 1110, waiting on ClientRead, with no transaction ID, snapshot horizon, active transaction or blockers. No session was canceled or terminated. This is an operational note, not evidence of a blocking transaction. The required active-transaction/lock checks pass; a completely connection-free quiet window was not established at the final snapshot. Repeat the session/transaction/lock inspection immediately before any approved execution.

    CHECK replacement takes strong locks on the nine existing tables above. New FKs lock their referenced tables, including Users, RuntimeProject/Stage, Tasker, shared-file and event/approval records; new trigger installation also locks existing target tables. Indexes are created on the new empty tables. Constraint validation may scan existing data. The public relations currently total **6,471,680 bytes**; this small development size does not certify production locking duration. [PostgreSQL 18 ALTER TABLE locking](https://www.postgresql.org/docs/18/sql-altertable.html).

    Installed Prisma **6.19.3** and its schema engine were verified by hashes. A SELECT-only engine probe on the actual 18.6 direct endpoint confirmed default and transaction read-only enforcement, `lock_timeout=5s`, and `statement_timeout=1min`. No incompatible PostgreSQL 18 syntax or dependency ordering was identified. New enum labels are compared as text in installation-time CHECKs; enum-valued business writes occur only in later function execution after COMMIT. [PostgreSQL 18 enum transaction restriction](https://www.postgresql.org/docs/18/sql-altertype.html).

    **Candidate mutation certification remains PostgreSQL 14.19.** The 18.6 evidence is read-only introspection/settings plus compatibility review. Timeouts bound individual lock waits/statements, not the whole deployment. Startup options must also cover Prisma's ledger/advisory-lock operations; retain Prisma advisory locking. SQL failure before COMMIT should roll back DDL, but Prisma may retain an unfinished migration row. A connection loss after COMMIT may leave committed schema and an uncertain ledger. Any failed/uncertain approved attempt must stop for actual ledger/catalog inspection without automatic retry, repair, resolve, reset or rollback. [PostgreSQL timeout semantics](https://www.postgresql.org/docs/18/runtime-config-client.html), [Prisma v6 deployment/advisory locking](https://www.prisma.io/docs/orm/v6/prisma-migrate/workflows/development-and-production).

11. **Expected post-activation state and reviewed procedure.** After separate approval, repeat provider/database identity, endpoint fingerprints, all 115 applied checksums, exact candidate/source hashes, baseline drift, recovery, all 134 table fingerprints/account history and transaction/lock checks. Stop on a critical mismatch. Use installed Prisma migrate deploy with the verified private copy containing exactly the 115 applied migrations and this sole candidate, against the authorized direct development endpoint. Enforce five-second lock and sixty-second statement timeouts through connection startup settings and the SQL. **One execution attempt only.**

    Expected postchecks: **116 successful migrations, zero failed/unfinished/pending, 150 public tables including ledger, zero Prisma drift**, exact reviewed custom catalog, all 134 original table values and 115 historical ledger rows/checksums preserved, and all sixteen new tables empty. No historical backfill, fake legacy identity or synthetic Neon business record is permitted.

    Only after successful migration and preservation postchecks may a separately approved action set `FLUX_RUNTIME_INTEGRATION=1` in local `.env.local` alone, preserve all ten flags and verify all eleven in a fresh Next process. Then repeat the required isolated regressions, TypeScript, ESLint, build and browser acceptance. The current task has performed neither action and has not prepared an automatically executing activation driver.

12. **Recommendation and explicit approval checkpoint.** **Controlled development activation is recommended for the implemented internal-submission scope**, subject to separate approval of the exact candidate and fresh critical prechecks immediately before the single attempt. The idle pooled connection and recovery/storage/PostgreSQL mutation-certification limits above remain explicit. Production rollout and runtime external-submission support are not signed off.

    The user's Phase 4.4F instruction explicitly requires: **“STOP and request my explicit approval before applying the migration or changing `.env.local`.”** Approval is requested to apply only `20261024010000_runtime_integration`, SHA-256 `0a7981b4ff8b3646a6e9acfca744ef4cd2c555698317c9a9ab469b6adff54bef`, once to `flux-v2-dev / develop / neondb` using the reviewed direct-endpoint procedure; then, only after all required postchecks pass, enable the integration flag in local `.env.local` and perform isolated activation verification.

    **Stopped at this checkpoint.** No Neon schema/data mutation, actual account/password/role change, live S3 operation, unsafe runtime link, email/worker/notification activation, automatic archive, official template, push, deployment or Phase 5 work occurred.

Evidence is retained under `.tmp/phase44f/`: `baseline.json`, `manifest.json`, `reviewed/`, `integration.log`, `completion-final.log`, `native-after.log`, `authorization.log`, `regressions.json`, individual logs, `lint-result.json`, `build-result.json`, `browser/result.json` and 51 PNGs, `sql-review.json`, `guard-replacements.diff`, `catalog-delta.json`, complete disposable catalog snapshots, provider/recovery receipts, `before.json`, `final.json`, `before-diff.sql`, `read-preflight.json`, `prisma-status.json`, `engine-readonly.json`, `flags.json`, `final-stopped.json`, `session-inspection.json`, `operations-assessment.json` and `verification.json`.
