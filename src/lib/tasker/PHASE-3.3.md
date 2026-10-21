# Phase 3.3 — Inspect File, Initial Concept and Final Concept Tasks

**Implemented and verified; not activated.** This phase adds three adapters to UniversalTask and retains its existing lifecycle. No Neon connection/migration, live S3 operation, actual-account change, worker/notification activation, push or deployment occurred. Phase 3.4 was not started.

The repository baseline was commit `b7adccb82ab69c0605dc77c3ed016e5e80fd9db0`, with 110 migration files. The prior [Phase 3.2 activation report](PHASE-3.2-ACTIVATION.md) supplies the development database baseline of 110 successful migrations / 119 public tables on Neon PostgreSQL 18.6. This implementation did not re-query that database. All behavioral mutations used disposable local PostgreSQL 14.19, synthetic accounts and fake storage.

## 1. Exact file inventory

Created:

```text
prisma/migrations/20261022010000_universal_tasker_concepts/migration.sql
scripts/tasker-concepts-browser-check.mjs
scripts/tasker-concepts-integration-check.ts
src/app/api/tasker/[taskId]/references/[referenceId]/route.ts
src/lib/tasker/concepts.ts
src/lib/tasker/PHASE-3.3.md
```

Modified:

```text
package.json
prisma/schema.prisma
scripts/run-authorization-isolated-integration.mjs
scripts/run-universal-tasker-isolated.mjs
scripts/tasker-deliverables-browser-check.mjs
scripts/tasker-schema-baseline.mjs
scripts/tsconfig.universal-tasker.json
scripts/universal-tasker-browser-check.mjs
scripts/universal-tasker-unit-check.ts
src/app/(dashboard)/page.tsx
src/app/(dashboard)/tasks/page.tsx
src/components/tasks/general-tasker.tsx
src/components/tasks/project-tasker-link.tsx
src/lib/authorization/task-policies.ts
src/lib/events/contracts.ts
src/lib/tasker/contracts.ts
src/lib/tasker/http.ts
src/lib/tasker/service.ts
```

No prior migration, environment file, legacy concept service, Stage 6 service, Archive policy, Library policy or approval-engine implementation was modified. Local verification logs and screenshots are ignored artifacts under `.tmp/phase33/`.

## 2. INSPECT_FILE lifecycle

An authorized manager creates the task with the normal title, brief, deadline, priority, executor and genuine project/task context. The real creator remains its immutable Owner. The Owner either selects an eligible exact project version at creation or uploads a source on the detail page, then pins it through the authorized `SET_SOURCE` workflow. Upload finalization must establish READY, sealed evidence before pinning. Failed finalization leaves no source grant. An interrupted pin can be completed by explicitly selecting the Owner's ready upload.

Each inspection has at most one immutable source. Replacement uploads do not retarget it; inspecting a different version requires another task. Until a source exists, server and database guards reject findings submission and completion requests, and the UI withholds those controls.

The executor can download or preview that exact source without folder membership, discuss findings, upload supporting evidence, submit revisions and request completion with a reason. The independent Owner/Director approves or rejects with a reason; rejection requires a fresh submission. Requests never complete tasks automatically. Direct closure and soft deletion retain evidence. Inspection acceptance does not review, replace or approve the source resource, verify Archive content, change a stage, or complete a project.

## 3. INITIAL_CONCEPT lifecycle

Initial Concepts use the same conversation, upload, revision, submission, request, review, closure and deletion commands. The native `SUBMIT` entry is the submission identity and preserves the actual actor, timestamp, task and exact file versions. Director intervention retains the actual Director actor rather than pretending to be the executor.

Ready drafts and message attachments remain supporting material. Only files explicitly attached to `SUBMIT` are submitted concept evidence. The read model classifies submissions as SUBMITTED, APPROVED, REJECTED or SUPERSEDED from immutable native entries. A later submission or task edit supersedes unreviewed evidence; a rejection retains its actual rejected outcome. The native completion review supplies reviewer identity and determines approval. A file's existence or upload finalization never constitutes concept approval.

Text-only concepts are supported. No completion-document ApprovalRequest is manufactured. Completion affects only UniversalTask.

## 4. FINAL_CONCEPT and inspiration

Creation offers eligible same-project Initial Concept files that the selector can currently delegate. Only current submitted or approved evidence is eligible; drafts, conversation files, rejected/superseded submissions and closed/deleted source tasks are excluded. Each selected exact version retains its native source upload, submission, optional approval entry, original task/Owner, real uploader and submitter. The selection entry captures who delegated it and when.

References do not copy objects, overwrite files, import the original conversation or grant access to unselected files. The assigned Final executor reads selected versions through the Final task's protected reference endpoint. The original task API, other file IDs, project folders and unrelated resources retain their own authorization.

Selection records the source state **when selected**. Later Initial revisions/reviews do not alter that historical state or retarget its version. Soft deletion prevents new selection while retaining existing scoped references and attribution. Restrictive FKs prevent deleting referenced native history. Missing or changed storage objects fail closed. Final submissions use independent versions and their own review; original approval never approves Final work or bypasses project completion gates.

An explicit empty state allows creation without inspiration. Inspiration selection is currently at creation; inspection source upload is the explicit post-creation source workflow.

## 5. Source identity and exact-version guarantees

Inspection supports two deliberately reviewed sources: a sealed upload by the actual Task Owner in that task, or an adopted project attachment in an authorized private/research folder. Project selection checks current folder write/delegation authority, matching project, native attachment identity, object metadata and READY SharedFileVersion evidence. A Director intervening on another Owner's inspection also rechecks the Owner's source authority. Owner-upload pinning requires that Owner to remain an active business user.

Historical unmapped attachments, legacy concept-stage files without adopted versions, arbitrary Library/Archive assets, completion documents and flexible-project attachment selection are not implicitly adopted. They cannot be selected merely by supplying a file ID. Flexible contexts support owner-upload inspection and Universal Initial/Final Concept references.

The existing SharedFile / SharedFileVersion store remains authoritative. Native versions and new references are immutable. Downloads require task ID, reference ID and exact version ID, current V2 task access, and the retained source/project association. Conditional storage GET checks ETag and any recorded object VersionId/full-object SHA-256 evidence before streaming. A selected native attachment reparented across projects is denied.

**ETags remain opaque validators, not cryptographic digests.** Application sealing and conditional reads do not establish bucket retention, Object Lock, universal SHA-256 coverage or recovery of deleted objects. There is no new claim of live S3 byte verification.

## 6. Role and resource authorization

| Actor | Behavior |
| --- | --- |
| Director | Creates and oversees all three business types without fictitious membership. Actual intervention attribution and independent-review rules remain mandatory. |
| SPM / JPM | Create in their genuine project or owned/assigned-task context. Source delegation is checked independently. Project management does not make them another Task's Owner. |
| Initial source selector | Director or actual Initial Task Owner, with an active manager role and current eligible source evidence. Being a project manager alone does not grant delegation of another Owner's Initial Task. |
| Designer / Digital Lead | Execute assigned new types; creation of all three is denied in UI and direct APIs. Existing GENERAL and authorized FILE_UPLOAD creation remains intact. |
| Spectator | View-only metadata for the new types; source files, inspiration, submissions and protected conversation/history are withheld. No separate spectator file-grant feature was added. GENERAL spectator behavior remains unchanged. |
| Technical-only / unrelated user | No new business access; direct task, reference, preview and file requests are denied. |

Central V2 session/capability policies, current participant eligibility, immutable ownership, task locks, expected versions and actor-scoped command hashes remain in force. Identical replay returns the original result; conflicting bodies and stale versions fail. A Director cannot approve their own completion request or act as both assigned executor and reviewer.

## 7. Provenance, audit and transactions

`UniversalTaskReference` is the only new model. It links one task and exact version to a native selection entry and either a native project attachment or task upload. Inspiration additionally pins source submission/review entries. Source-task identity and original actors are reached through those restrictive FKs rather than duplicated historical records.

Selection, references, SharedFileProvenance, task version/history and event/outbox commit together. Native guards enforce sealed evidence, truthful actor/session, task/source kinds, matching context, original submission eligibility, actual approval attribution, one inspection source, replay uniqueness and retained immutable references. Deferred checks require matching selection history/provenance and fresh exact submissions for completion requests. Forced outbox failures and direct forged-reference insertion roll back.

The existing TASK_ACTIVITY contract adds `conceptTaskCommand` and `SET_SOURCE`; existing General/Deliverable and completion-document branches remain distinct. No external consumer, worker, recurring reminder or notification delivery was enabled. Upload sealing retains the existing possible orphan-object limitation when storage succeeds before a later database rollback; no cleanup operation was performed.

## 8. UI and navigation

The existing creation form provides manager-only Inspect File, Initial Concept and Final Concept choices. Inspection offers eligible project versions or the explicit post-creation Owner upload flow. Final creation displays eligible Initial files with task attribution, version and submitted/approved state, including an explicit empty state.

Details show protected pinned files, safe exact-version preview/download links, original source attribution and review state at selection, concept submission classifications, revisions and the existing review controls. PDF and common raster formats support inline preview; other types download. Responses are private/no-store, nosniff, sandboxed and have no referrer.

Grid default, list toggle, search, filters, priority/deadline indicators, pagination, restricted navigation and scoped project links remain. Counts include enabled types. With concepts enabled, the dashboard says My Tasks; flag-off labels retain existing behavior. Legacy concept tasks remain in their separate existing interface. No Sister Task, dependency, template or stage-builder controls were introduced.

## 9. Existing behavior and data preservation

The current application and generated Prisma client ran the General suite on migration 109 and the Deliverables suite on migration 110 **before** the candidate was installed, with concepts off. No absent reference table was queried. The candidate then preserved every row of all 119 existing tables, including populated General/Deliverable evidence, nine synthetic users/assignments, legacy concepts and earlier ledger rows/checksums. The new table began empty, with no backfill.

A second populated rehearsal preserved completion-document accepted/rejected approvals, original file versions, native document histories, business events, outbox/delivery diagnostics and accounts. Legacy workflow, native stage-write, Stage 6/governance, approval/document, Archive/Library and current-session regressions passed. Concept tests additionally fingerprinted accounts, old tasks, projects, native attachments, legacy concepts and workflow stages before/after execution.

All **110 previous migration files** and `.env`, `.env.example`, `.env.local` match the captured SHA-256 baseline. A fresh Next environment loader confirmed all five existing flags remain `1`; `FLUX_TASKER_CONCEPTS` is unset/off. No actual development account or object was used for mutation testing.

## 10. Migration, flag and object inventory

Candidate: `prisma/migrations/20261022010000_universal_tasker_concepts/migration.sql`.

Full SHA-256:

```text
8c0e844318df9ab16efb5026cbf2ad974c5b7f372ddae8c44ad6775ac0b87271
```

| Object | Change |
| --- | --- |
| Table | One: UniversalTaskReference, ten columns; existing models gain inverse Prisma relations only. |
| Foreign keys | Seven; all ON DELETE/UPDATE RESTRICT and validated. |
| Indexes | Four including primary key, unique task/version, partial unique inspection/task and source-submission index; all valid/ready. |
| CHECK constraints | One new reference discriminator; three existing replacements on UniversalTask, UniversalTaskEntry and BusinessEvent. |
| New functions | flux_task_reference_guard, flux_task_concept_consistency. |
| Replaced functions | flux_task_guard, flux_emit_task_event, flux_event_write_guard, flux_task_deliverable_consistency, flux_shared_file_provenance_guard. |
| New triggers | Four enabled triggers: reference row guard, reference truncate guard, deferred reference/provenance consistency and deferred task-entry/concept consistency. |
| Enums | No additions; the existing six-type vocabulary is reused. |

The migration is one transaction with five-second lock and sixty-second statement timeouts. Existing historical data is not rewritten. Normal DDL/check/FK installation requires locks; use a controlled window during separately approved activation.

Expected **after future activation**: **111 successful migrations, zero failed/pending migrations, 120 public tables including `_prisma_migrations`, and no Prisma schema drift.** These results were verified in disposable PostgreSQL; they are not a claim of Neon activation.

Gate: `FLUX_TASKER_CONCEPTS=1`, also requiring `FLUX_UNIVERSAL_TASKER=1`. It independently gates only the three new types. It remains off in actual local configuration; the existing five flags and all environment files are unchanged.

## 11. Verification results

| Check | Result |
| --- | --- |
| Full `pnpm exec tsc --noEmit --incremental false` | PASS |
| Targeted ESLint, every changed/new TS/TSX/MJS file, zero warnings | PASS |
| Production `pnpm build` | PASS; secrets blanked, unreachable loopback database, no migrate command |
| Tasker units and General/Deliverable/Concept integration | PASS |
| Populated 110 → 111 migration, prior rows/checksums, catalog validity, zero drift | PASS |
| Populated native approval/file/event preservation | PASS |
| Authorization foundation/persistence, approval/event units | PASS |
| V2 authorization/session/runtime/administration/workspace, project reads/writes/governance, documents/provenance/approvals/events, Archive/Library | PASS — 108 PASS summaries |
| `pnpm tasks:integration-check` | PASS — 126 assertions, including three historical-assignment assertions |
| `pnpm concept-stage:completion-check` | PASS — 889 assertions across all seven suites |
| New Concept browser suite | PASS — 13 screenshots |
| Existing General browser suite | PASS — 9 screenshots |
| Existing Deliverables browser suite | PASS — 10 screenshots |

Legacy concept assertion counts: completion revocation 173, stage-skip revocation 142, manual stage 61, completion request 170, without-file 46, primary concept suite 188, round-four 109. Race-dependent branches can vary counts between valid runs. Every runner used genuine synthetic V2 sessions and reported zero external requests.

Security checks include source-required submission, cross-project/forged versions, source selection without delegation, current source authority, exact preview/download, spectator/unrelated/technical denial, source replacement, draft/rejected/superseded selection, pinned references after source soft deletion, missing/changed objects, independent reviewer, real Director attribution, concurrent pin commands, replay conflicts, native forged-reference rejection, immutable references, session expiry and storage/outbox rollback. No requested suite was skipped.

## 12. Browser acceptance by role

All three suites used a fresh production Next.js process, Chromium `153.0.8010.12`, disposable PostgreSQL 14.19, real sign-ins for synthetic accounts and loopback fake S3. New types were enabled only in the new suite's child process. The old suites exercised existing interfaces with concepts off against the candidate schema.

| Role/case | Verified acceptance |
| --- | --- |
| Director | Creates inspection, uploads/pins source, rejects and independently accepts findings; publishes a fixture project source through existing File Upload. |
| SPM | Creates Initial/Final tasks, selects only eligible inspiration and an authorized project file, reviews rejection/revision/approval, accepts independent Final work. |
| JPM | Creates Final without fabricated inspiration and independently reviews Digital Lead work. |
| Designer | Submits/revises Initial evidence. The separate assigned Designer inspects/previews sources and executes Final with only selected inspiration; original task/conversation/unselected APIs deny. |
| Digital Lead | Executes Final, remains a source-isolated spectator on other new tasks, and sees no forbidden creation choices. |
| Designer / Digital Lead creation | All three new types absent from choices and denied through direct POST. Existing General/eligible File Upload behavior passes the old suites. |
| Technical-only / unrelated | Task and protected-file APIs deny; restricted navigation remains. |
| Other acceptance | Mobile history, legacy concept visibility, grid/list/filter/project-link behavior, unchanged synthetic accounts and parent projects. |

**32 screenshots, zero page errors and zero blocked external requests on the final runs.** Early new-harness runs exposed a readiness/response-consumption wait and an assertion expecting 403 where the established native preview route deliberately returned 404. The harness was corrected, an authorized-owner success check added, and the complete suite passed. These were resolved test failures, not skipped coverage. The fixture's abbreviated project workflow emits expected existing workflow-health diagnostics; no application page error occurred.

## 13. Limits and unsupported cases

Project-file selection currently covers adopted, stable versions in writable private/research folders. Unmapped historical files, arbitrary legacy stage files, flexible native attachments and Archive/Library/completion-document sources fail closed. There is no automatic identity backfill. Selectors examine up to 500 recent candidate versions per project; large-catalog pagination is not implemented.

Inspiration is selected at creation and remains immutable. Source review state is historical at selection, not a live badge asserting a later decision. There is no new spectator file-grant UI, side-by-side comparison, range-serving rebuild, arbitrary preview format, generalized approval adapter or file cleanup worker. Existing independent Tasker completion review remains authoritative.

The exact Neon PostgreSQL 18.6 engine, provider recovery and real S3 infrastructure were not exercised during this implementation. The approved 18.6 database was not contacted. Storage retention, IAM/versioning/Object Lock, full-object checksums and recovery require operational acceptance; opaque ETags do not prove cryptographic byte identity.

## 14. Controlled activation recommendation

Ready for a **separate Phase 3.3 development activation preflight and explicit approval**, with the documented source-adapter and PostgreSQL-version limits. Keep the new flag off until then. Reconfirm the authorized Neon project/branch/database/version, all 110 previous migration checksums, this exact candidate checksum, schema drift, recovery availability, complete data fingerprints and locks before any live execution. Prefer a PostgreSQL 18.6 rehearsal where available.

A future authorized activation should apply only this migration once, stop on any critical mismatch or failure, and validate 111/0/0 migrations, 120 tables, no drift, retained accounts/history and reference constraints before separately enabling the new local flag. No automatic retry, repair, live test data, storage cleanup, deployment or Phase 3.4 work is included here.

Evidence: [preservation](../../../.tmp/phase33/preservation.json), [verification summary](../../../.tmp/phase33/verification-summary.json), [Tasker integration](../../../.tmp/phase33/tasker.log), [V2 regressions](../../../.tmp/phase33/regressions.log), [legacy tasks](../../../.tmp/phase33/legacyTasks.log), [legacy concepts](../../../.tmp/phase33/legacyConcepts.log), [build](../../../.tmp/phase33/build.log), [new browser results](../../../.tmp/phase33/conceptBrowser-artifacts/result.json), [General browser results](../../../.tmp/phase33/browser-artifacts/result.json), [Deliverables browser results](../../../.tmp/phase33/deliverableBrowser-artifacts/result.json).

Representative screenshots: [pinned inspection](../../../.tmp/phase33/conceptBrowser-artifacts/director-pinned-inspection-source.png), [selected inspiration only](../../../.tmp/phase33/conceptBrowser-artifacts/final-selected-inspiration-only.png), [Initial review history](../../../.tmp/phase33/conceptBrowser-artifacts/spm-initial-approved-history.png), [Final without inspiration](../../../.tmp/phase33/conceptBrowser-artifacts/jpm-final-without-inspiration.png), [mobile Final history](../../../.tmp/phase33/conceptBrowser-artifacts/mobile-final-history.png).

Phase 3.3 implementation is complete and stopped without activation.
