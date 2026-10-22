# FLUX V2 — Phase 4.2 activation verification

**PASS.** The explicitly approved migration was applied once to development, all database preservation and object checks passed, and `FLUX_STAGE_BUILDER_PUBLICATION=1` was enabled in local `.env.local` only. All required verification passed. Final database verification completed at **2026-10-22T06:30:22.152Z / 2026-10-22 10:30:22 Dubai**.

This records the separately approved activation following [Phase 4.2 preflight](./PHASE-4.2-PREFLIGHT.md). The earlier [implementation report](./PHASE-4.2.md) remains unchanged as a historical record. Application code, test runners, Prisma schema and migration files were not changed during activation.

**Approved target and repeated preflight**

| Identity | Verified value |
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

Endpoint fingerprints are the first 16 hexadecimal characters of SHA-256 over `hostname:5432/neondb`, excluding credentials. Fresh provider reads confirmed the project, branch, database and endpoint association. SQL confirmed the actual PostgreSQL version. Connection precedence and direct/pooled consistency were checked before execution.

Only migration **`20261023020000_workflow_publication`** was applied. Repository SQL, reviewed copy and installed ledger checksum match the approved SHA-256:

```text
6552870889a39ad1605678671c8a4671ac242ef062c823045ff8ec0fb6ec2c62
```

The repeated preflight verified all 113 existing migration names/checksums, exactly this one pending migration, 124 public tables, no baseline drift, unchanged catalog and complete table fingerprints, nine unchanged accounts and all eight existing flags. Publication was still disabled. No competing sessions, active transactions, waiting locks or prepared transactions were present. A further read-only snapshot and empty baseline diff immediately preceded execution.

Recovery retention remained **21,600 seconds / six hours**. A fresh provider GET at `06:17:53.965Z` successfully retrieved the historical 124-table schema at `06:15:52.208Z`, before migration. Its SHA-256 was `c221eb120bbb1846794a44aa20bd3c664da261bfef1fe713e4bf1b95c773d494`. Recovery availability was verified; **no restore drill was performed**.

**Single execution**

Installed Prisma **6.19.3** ran `migrate deploy --schema <reviewed-copy>/schema.prisma` through the direct endpoint. The CLI and schema engine were fingerprinted; engine SHA-256 was `caa2cf90d5b2cfe6cc06e47974f7e3275dd395b4d35cf140d5d4b2362c3b5bb1`. A fresh SELECT-only probe through that engine verified the target and **5-second lock timeout / 60-second statement timeout**. Execution enforced those connection settings and retained the approved SQL's explicit transaction and local timeout settings.

The sole attempt started at **06:21:21.590Z** and finished at **06:21:31.015Z**. Prisma reported exactly the approved migration applied and exited 0. An exclusive attempt marker prohibited a second invocation. No retry, repair, reset, resolve or recovery command was used.

**Database result and preservation**

| Check | Before | After migration and final verification |
| --- | ---: | ---: |
| Successful migrations | 113 | **114** |
| Failed migrations | 0 | **0** |
| Pending migrations | 1 | **0** |
| Public tables, including Prisma ledger | 124 | **128** |
| Prisma schema drift | None | **None** |
| Four publication tables | Absent | **All empty** |

Every one of the **123 pre-existing non-ledger tables** retained its complete row count and canonical full-row SHA-256 fingerprint. All **113 previous migration ledger rows** remained identical. After isolated testing, all **128 table fingerprints**, the complete 114-row ledger and the complete post-migration catalog matched the immediate postcheck snapshot again.

- All nine User rows, including stored passwords, names and legacy roles, remain unchanged.
- All nine ACTIVE authorization assignments and nine authorization-history rows remain unchanged, including business roles, technical privileges and authorization versions. Exactly one Director and two technical-only administrators remain.
- All three sessions, the approved Artwork compatibility preset and its original Director governance event retain their original contents, attribution, definition hash and timestamps. Six status groups and ten status options are unchanged.
- Existing draft/revision, completion-document approval/history, project/stage, Universal Tasker/Sister, file/provenance, shared-event/outbox, Archive and Library structures and data are preserved. These operational tables were empty on this development branch; populated historical preservation was separately exercised in disposable integration databases.

No historical row was rewritten, no backfill occurred, and no actual workflow draft, approval, publication or project stage was created. Fingerprints were computed inside PostgreSQL; raw passwords, password hashes and session tokens were not exported into the verification evidence.

**Installed object validation**

Actual PostgreSQL 18 definitions were compared with a fresh disposable application of the approved migration chain. All nine new/replaced function bodies match the approved SQL exactly. All constraints are validated, all indexes valid and ready, and all user triggers enabled.

| Object | Validated result |
| --- | --- |
| Four tables | `WorkflowPublicationSubmission`, `WorkflowPublicationAudit`, `PublishedWorkflow`, `PublishedWorkflowVersion`; 43 columns total |
| Indexes | 18: four primary-key indexes, ten additional unique indexes, four ordinary indexes |
| Foreign keys | 18; all restrictive on update/delete; the submission-to-request FK and two new event FKs are initially deferred |
| New checks | `WorkflowPublicationSubmission_shape`, `WorkflowPublicationAudit_shape`, `PublishedWorkflowVersion_shape` |
| Extended checks | `ApprovalRequest_values_check`, `BusinessEvent_contract_check` |
| New functions | `flux_workflow_actor_current`, `flux_workflow_publication_guard`, `flux_workflow_approval_consistency`, `flux_workflow_publication_consistency`, `flux_workflow_supersede_review`, `flux_emit_workflow_publication_event` |
| Extended functions | `flux_approval_write_guard`, `flux_approval_consistency_guard`, `flux_event_write_guard` |
| New triggers | 15: four write guards, four truncate guards, four initially deferred consistency triggers, one draft supersession trigger, two event emitters |
| Enum additions | `WORKFLOW_DRAFT_REVISION` subject and the four reviewed workflow-publication event types |
| PostgreSQL 18 NOT NULL entries | All 41 required-column constraints on new tables validated |

Only the reviewed three approval-reference nullability constraints, two checks and three existing guard functions changed among existing definitions. The three former column-level NOT NULL constraints are replaced by the typed-subject requirement. No other existing catalog object changed or disappeared. Complete names and definitions are retained in `proposed-inventory.json` and `catalog-changes.json` in the evidence directory.

Completion-document subjects still require their native project, submission and submission-event references. Exact `SharedFileVersion` evidence, native approval authority, mandatory-document gates, immutable decisions/history and Director-only final project completion remain enforced. Configuration-only workflow subjects cannot fabricate file evidence or completion-document associations. The existing completion write branch is preserved, and its consistency guard adds only typed workflow dispatch.

Workflow publication requires a current authenticated Director's separate confirmed decision with a reason and exact reviewed hash/revision. SPMs may submit authorized own drafts; other roles cannot acquire publication authority through technical privileges or legacy roles. Current sessions and authorization versions, submitter authority, row locks, supersession, replay checks, immutable numbering and atomic decision/version/audit/outbox consistency were verified. Explicit Director self-approval remains confined to workflow publication; Tasker and native review policies are preserved.

**Local activation and fresh process**

After successful postchecks at `06:22:37.341Z`, local `.env.local` was updated at **06:22:42.907Z**. Its sole content change was adding:

```dotenv
FLUX_STAGE_BUILDER_PUBLICATION=1
```

All eight existing flags remain `1`: `FLUX_SHARED_FILE_IDENTITY`, `FLUX_APPROVAL_ENGINE`, `FLUX_SHARED_EVENTS`, `FLUX_UNIVERSAL_TASKER`, `FLUX_TASKER_DELIVERABLES`, `FLUX_TASKER_CONCEPTS`, `FLUX_TASKER_SISTERS`, `FLUX_STAGE_BUILDER_DRAFTS`.

Removing only the recorded appended flag reproduces the original `.env.local` hash. `.env`, `.env.example` and all other local environment content remain unchanged.

A fresh Next.js **16.2.6** production process loaded the actual repository environment, verified **all nine flags as `1`**, reached Ready and stopped. Live database access was disabled before application startup, external connections were blocked, and no application request or actual account login was made. Recorded HTTP requests, fetch requests, socket connections and external attempts were all zero.

**Post-activation verification**

All required checks were rerun after local activation and exited successfully. Mutation and browser tests used disposable PostgreSQL **14.19**, private Unix sockets with TCP disabled, synthetic users and fake storage/external services. The migration itself executed successfully on the actual PostgreSQL **18.6** target.

| Verification | Result |
| --- | --- |
| Workflow-publication integration | **PASS, 402 counted assertions**; complete publication lifecycle, current authority, replay/concurrency, rollback and immutable evidence |
| Stage Builder | PASS within the integration chain: creation/editing, immutable revisions, cloning, validation, role/ownership denials, concurrent edits and atomic events |
| All six Universal Tasker types and Sister Tasks | PASS: General, File Upload, Data Input, Inspection, Initial Concept, Final Concept; family traversal, retained exact evidence and independent lifecycle |
| Populated publication migration | PASS: 113/124 → 114/128; all prior rows and checksums preserved, four new tables empty, zero drift |
| Authorization, project governance, completion documents, reusable approvals, events, file identity, Archives and Library | **PASS, 112 named checkpoints**, including populated native approval/event-history preservation |
| Foundation/persistence, approval/event and Tasker/Sister units | PASS |
| Legacy task runner | **PASS, 123 assertions** across two suites |
| Legacy concept runner | **PASS, 887 assertions** across seven suites |
| Stage 5 UI runner | PASS, 94 source assertions + 30 isolated checkpoints |
| Stage 6 UI runner | PASS, 73 source assertions + 21 isolated checkpoints |
| Stage 7 UI runner | PASS, 81 source assertions + 29 isolated checkpoints |
| Concept UI runner | PASS, 54 source assertions + 21 isolated checkpoints |
| Full application TypeScript | PASS: `pnpm exec tsc --noEmit --project tsconfig.typecheck.json --incremental false`; integration runners also compiled |
| Targeted ESLint | PASS: 39 reviewed TS/TSX/MJS files, zero diagnostics, `--max-warnings 0` |
| Fresh isolated production build | PASS, all nine flags, dummy database endpoints, no actual environment files |
| Publication browser acceptance | **PASS, 57 assertions / 16 screenshots** |
| Publication-disabled 113-schema Stage Builder browser acceptance | **PASS, 61 assertions / 14 screenshots** |

Counts describe this run. Publication assertions include checks per emitted/consumed event, so their total varies with the concurrent approve/reject outcome; the earlier 414 count was not treated as a fixed test-case count. Legacy concept assertions also vary with the concurrency branch. All named scenarios passed. The four UI runners total 302 source assertions and 101 isolated checkpoints; overlapping checkpoints are not presented as unique tests.

Publication/browser acceptance exercised SPM submission, exact Director review, mandatory confirmation/reason, approval and rejection, revision/resubmission, supersession, stale decisions, immutable v1/v2 history, the management catalog and explicit Director-authored decisions. Unauthorized role, ownership, forged actor/hash/plan/version, stale-session and revoked-role paths remained denied. Completion-document authority, exact evidence and final-completion gates passed their native regressions. No configurable stage or executable project-creation choice was introduced.

Both browser processes used Chromium **153.0.8010.12** and reported **zero page errors, zero external requests and zero storage operations**. Desktop published-version and mobile version-history screenshots were visually inspected. Verification servers and disposable databases stopped and cleaned up. Native Stage 5/6/7 and concept UI runners exercised source wiring and actual isolated services/actions; this was not a new interactive walkthrough of those native screens.

No required test failed during activation. The isolated build emitted the existing non-failing multiple-lockfile workspace-root warning. No restore drill, actual Neon draft publication, real S3 mutation or external notification delivery was performed.

**Evidence, preserved work and stop point**

Evidence is retained in `.tmp/phase42-activation-5hrd34er/`: `authorization.json`, `preflight-passed.json`, provider/recovery receipts, engine probe, `execution-started.json`, `execution-result.json`, `migration.log`, `postchecks-passed.json`, catalog reference/changes, local activation and fresh-process receipts, all test logs/results, browser screenshots, `verification-summary.json` and `final-verification.json`.

`table-fingerprints.json` contains complete before/after/final counts and hashes. Its SHA-256 is:

```text
f37853256fcb7178c8bc7c46a8a615927dd1516ddc05403fda4ac9b6078f5a4d
```

All 995 pre-existing repository files captured at activation start retain their hashes, including the already-untracked Phase 4.2 preflight report. Existing staged work and HEAD `9624057b7dd485631e3a7754d678d7a20ed4e18b` are preserved. This activation adds only this report and ignored verification evidence, alongside the specifically approved local environment change.

No actual workflow draft was created, approved or published for testing. No project runtime stages, account/permission changes, live S3 changes, external workers or notifications, push or application deployment occurred. **Phase 4.3 was not begun. Activation verification is complete; work stops here.**
