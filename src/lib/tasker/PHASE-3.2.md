# Phase 3.2 — File Upload and Data Input Tasks

Initial implementation report, 2026-10-21. **Status at that checkpoint: not activated.** The existing Phase 3.1 configuration remains unchanged. No Neon connection/migration, live S3 operation, account/permission change, external worker, push or deployment was performed during the initial implementation.

**Current status:** [controlled development activation completed](PHASE-3.2-ACTIVATION.md). The approved migration is applied and the local deliverables flag is enabled; all required postchecks and isolated acceptance passed. The [preceding preflight](PHASE-3.2-PREFLIGHT.md) and sections below retain their historical checkpoint results.

## 1. Files created and modified

Created:

- `prisma/migrations/20261021230000_universal_tasker_deliverables/migration.sql`
- `src/lib/tasker/targets.ts`
- `src/lib/tasker/applications.ts`
- `src/lib/tasker/PHASE-3.2.md`
- `scripts/tasker-deliverables-integration-check.ts`
- `scripts/tasker-deliverables-browser-check.mjs`

Modified:

- `package.json`
- `prisma/schema.prisma`
- `scripts/run-universal-tasker-isolated.mjs`
- `scripts/tasker-schema-baseline.mjs`
- `scripts/tsconfig.universal-tasker.json`
- `scripts/universal-tasker-browser-check.mjs`
- `src/app/(dashboard)/tasks/page.tsx`
- `src/components/tasks/general-tasker.tsx`
- `src/components/tasks/project-tasker-link.tsx`
- `src/components/projects/stage-five-workspace.tsx`
- `src/lib/authorization/policy.ts`
- `src/lib/authorization/project-write-policies.ts`
- `src/lib/authorization/task-policies.ts`
- `src/lib/events/contracts.ts`
- `src/lib/files/access.ts`
- `src/lib/project-history.ts`
- `src/lib/project-private-folders.ts`
- `src/lib/project-research-files.ts`
- `src/lib/stage-five.ts`
- `src/lib/storage/s3.ts`
- `src/lib/tasker/contracts.ts`
- `src/lib/tasker/http.ts`
- `src/lib/tasker/service.ts`

Local verification artifacts are under `.tmp/phase32/`; they are not application code. No prior migration file or environment file was edited.

## 2. File Upload lifecycle and publication

FILE_UPLOAD uses the existing UniversalTask engine, ownership, assignment, metadata, conversation, upload, review, close and soft-delete actions. Its immutable target identifies one existing research/private folder and captures the actual project, workspace, folder owner and complete ancestor IDs/parent links.

Executor uploads are sealed task evidence. The latest SUBMIT alone is eligible for a new completion request; edits, rejection and refresh require a new submission. The request pins exact versions. Supporting-message attachments and superseded submissions are not silently included. Owner acceptance is explicit and reasoned; distinct-reviewer rules remain enforced.

Acceptance first commits a `PREPARED` application and reserved object keys, with a native task entry/event/outbox. A second authorized transaction revalidates both the current Task Owner and reviewer, the target and exact request. It conditionally copies sealed evidence, observes the destination, and creates READY native project attachments only when every required object is ready. Research folder links/private folder associations, shared identities, task completion, project history and audit commit together. Replay cannot publish twice. Direct close/delete never publishes.

`FAILED` records support an explicit retry by the same reviewer after refreshing task state. A changed reviewer can request changes and obtain a new completion request. A crash or revoked session may leave PREPARED rather than FAILED; it remains a durable reconciliation record. A retry validates an existing reserved object and reuses it. Changed objects are not overwritten to force success.

**Orphan/reconciliation policy:** copying can succeed while the database transaction rolls back. Reserved application/publication rows identify those objects. There is no automatic S3 cleanup worker. Review the application, current request, task state, native attachments, SharedFile references and observed object identity before retrying or classifying an orphan. A separately authorized maintenance operation may remove only an unreferenced reserved object belonging to an abandoned/rejected/closed application, after a retention interval and a fresh no-reference check. Keep the task/application history. Never remove accepted objects, sealed evidence or historical versions merely because a task was closed/deleted. No cleanup was executed here.

## 3. Data Input lifecycle and supported targets

DATA_INPUT targets an **existing** `ProjectFileChecklistItem` in a real, AVAILABLE `ProjectWorkflowStage` with key `FINAL_LAYOUT`, through its real checklist, source attachment and Stage 5 handoff. It never initializes a fabricated field. Native field normalization is reused through `validateChecklistValue`; `applyTaskChecklistValueTx` updates exactly one item and its attachment links, preserving every other field.

| Existing field | Permitted input modes |
| --- | --- |
| OUTPUT_NAME, TAR, NICOTINE, BARCODE | TEXT |
| TECHNICAL_DRAWING, RELATED_GRAPHICS, THREEDS, QR_CODE | FILE, one or more |
| INVOICE | FILE, exactly one |
| TRACK_TRACE, TAX_STAMP | TEXT, FILE, TEXT_FILE |

The explicit server allowlist is `taskInputFields`. Unsupported: HEALTH_WARNING, COMPULSORY_TEXT, MARKETING_COPY, PRINTING_TECHNOLOGY, FINISHES, legacy TAR_NICOTINE, arbitrary columns/JSON paths/models, other stages and flexible-project fields. Flexible workspaces have no equivalent folder/checklist target adapter; General Tasks still support them.

A proposal replaces the chosen field's value and attachment links according to its requested mode; the review UI states this. Earlier attachment records, shared versions, publications and task evidence remain retained after later accepted revisions. Filling the item stops existing reminders for that exact field, matching native checklist-save behavior. It does not create requests, notifications or dispatches, or falsely complete a separate checklist request.

## 4. Role permissions

| Actor | Creation and acceptance |
| --- | --- |
| Director | Global business oversight with real actor attribution; no invented membership. Native writable-stage/target integrity still applies. |
| SPM / JPM | Only native project/folder/field destinations their current role and relationships allow. Actual task ownership is still required for review unless Director. |
| Designer / Digital Lead | GENERAL unchanged; FILE_UPLOAD only for an actually authorized folder, including their own private folders in eligible projects. DATA_INPUT creation denied. |
| Executor | Submits through the assigned task; may execute either type without parent folder/stage rights. |
| Spectator | View-only task metadata; new-type submission text/files/history are withheld, and file APIs deny access. GENERAL spectator behavior is unchanged. |
| Technical-only account | No business Tasker access. |

Reassignment, active-business-participant validation, session invalidation, ownership and independent review remain centralized. Existing project-manager status cannot take over another person's task. Owner revocation also blocks Director acceptance on the owner's behalf.

## 5. Folder isolation

Task upload tickets address only that task's temporary upload key; downloads require the task/upload/exact-version association and a current authorized task relationship. Executors are never added to project memberships or folder ACLs. Native published-file reads use native project authorization. Pinned shared-version download/preview/text-preview paths prevent accepted publication reads from silently following changed objects.

## 6. Field isolation and conflicts

Targets retain actual project/stage/checklist/handoff/source/field identity and field type, plus original value, attachment IDs, status, update timestamp and PostgreSQL row transaction token (`xmin`). The service locks the native Project root and checklist/handoff/item before comparing the complete expected state. Native writers use the same Project root lock. Two tasks capturing the same state cannot both overwrite it.

Stale state fails with `FIELD_CONFLICT_REFRESH_AND_RESUBMIT`; no field, publication or task completion commits. Current-versus-proposed information is shown only to a currently authorized owner/Director. Executor history hides native field-state snapshots. `REFRESH_TARGET` requires owner/Director authority and a reason, records the refreshed state, invalidates pending completion and requires a new submission/request. It cannot change the target identity. Missing/moved targets, permission revocation and completed stages fail closed.

## 7. Exact versions and provenance

Original evidence continues through SharedFile, SharedFileVersion, SharedFileReference, UniversalTaskUpload and UniversalTaskEntry. Each accepted project copy receives a separate native attachment and shared identity/version. UniversalTaskPublication links the exact source version to the exact published version and attachment. Acceptance provenance covers both versions, the request, actual submitter/uploader, Task Owner and genuine reviewer.

Copy uses source `If-Match` and a version ID when supplied by storage. Reads pin ETag/version/checksum. **ETag is an opaque validator, not a cryptographic hash.** SHA-256 integrity is claimed only when storage supplies a FULL_OBJECT SHA-256 checksum; otherwise checksum evidence remains UNKNOWN. Storage whose copy changes the observed validator fails closed instead of claiming equivalence.

## 8. Audit, outbox and transaction guarantees

The native Tasker review gate is retained. No completion-document ApprovalRequest rows or unsupported approval subjects are fabricated. Existing evidence hashing is reused.

Native task entries emit TASK_ACTIVITY events with `deliverableTaskCommand` and the existing sanitized payload contract. PREPARE_APPLICATION, APPLICATION_FAILED and REFRESH_TARGET are explicitly supported. A successful acceptance commits native project records, exactly one field mutation where applicable, a TASK_DELIVERABLE_ACCEPTED ProjectActivityLog, task APPROVE, application/publication linkage, file provenance and event/outbox together. Deferred constraints require matching native history and complete accepted publication links. Evidence/targets/application identity cannot be rewritten or deleted.

The database transaction is atomic; S3 is not part of it. External failure/rollback does not complete a task. Durable reservation and explicit reconciliation cover object orphans. The external copy path runs within a bounded 30-second transaction; a large batch may require an explicit retry that reuses already observed reserved objects. No background delivery or notification service was activated.

## 9. UI and project integration

The existing `/tasks` grid/list, search, owner/executor/status filters, priorities, deadline indicators and legacy concept section remain. Eligible type choices appear only when an authorized native target exists. Future types remain disabled. Creation requires exact destination and supported input mode. Details show target, submission/file versions, history, state, publication outcome and failures.

Acceptance shows the exact proposal/files and destination and requires a review checkbox plus a reason. Stale conflicts show authorized current values and block acceptance; explicit refresh/resubmit is available. Native Stage 5 fields expose a scoped Data Input request link when supported and enabled. Existing project task links and minimal assigned-task contexts continue working. The completed-task conflict warning discovered in browser testing was corrected.

## 10. Preservation and legacy coverage

The runner verifies GENERAL on the **109-migration schema before applying Phase 3.2**, then snapshots all 116 existing tables, including populated General history, accounts, roles, passwords, native concepts and prior ledger rows. The new migration preserves those snapshots exactly and introduces no backfill. All 109 prior migration files and all three local environment files match their captured SHA-256 hashes.

General browser acceptance and V2 native concept execution/completion-request/locked-stage/authorization regressions pass. This is distinct from the two obsolete standalone runners noted below; their failure is not represented as a successful legacy suite. No real development account, permission or historical record was touched. The prior live baseline was supplied by the completed Phase 3.1 activation; it was not re-queried in this implementation phase.

## 11. Candidate migration

- Name: `20261021230000_universal_tasker_deliverables`
- SHA-256: `547060da2b87852e8c4e8fc9eb0cd6f930abcf788c007e08ba113e76f8ffed37`
- Expected after separate activation: **110 successful migrations; 119 public tables including `_prisma_migrations`; zero failed/pending migrations and zero Prisma schema drift.**
- Three new tables: UniversalTaskTarget, UniversalTaskApplication, UniversalTaskPublication.
- Adds a native activity enum value and expands existing task/event checks and guards. Historical tables/columns/data are not removed or converted; all prior migrations are untouched.
- Candidate-only schema and populated migration rehearsals pass on disposable PostgreSQL 14.19. The exact Neon 18.6 engine was not used locally.
- Gate: `FLUX_TASKER_DELIVERABLES=1`, additionally requiring existing `FLUX_UNIVERSAL_TASKER=1`. It is absent/off in actual local configuration. GENERAL remains active through its existing flag.

## 12. Verification results

| Verification | Result |
| --- | --- |
| Full TypeScript | PASS |
| Targeted ESLint, zero warnings | PASS |
| Production Next.js build with real credentials blanked and disabled loopback database | PASS |
| Populated migration, row/checksum preservation, zero drift | PASS |
| General + new deliverable integration, fake storage | PASS |
| Concurrent field acceptance, stale/refresh, changed/deleted/revoked targets | PASS |
| Conditional publication, replay, rollback after copy, orphan reuse, retained previous accepted files | PASS |
| Task/event/approval unit checks; authorization foundation/persistence | PASS |
| Existing V2 authorization/administration/workspace/project-read/project-write/governance/files/documents/approvals/events/Archive/Library suite | PASS — 107 PASS checks |
| General browser acceptance | PASS — 9 screenshots |
| New-type browser acceptance | PASS — 10 screenshots; Chromium 153; all five business roles and technical-only denial; zero page errors or external requests |
| Supplemental `tasks:integration-check` | Did not execute assertions: existing runner lacks Node `server-only` bootstrap. |
| Supplemental `concept-stage:completion-check` | Did not execute assertions: same existing `server-only` bootstrap failure. |

The supplemental runners also contain pre-V2 legacy-role fixtures/expectations, so merely bypassing their missing bootstrap would not be a valid V2 regression repair. Their authorization boundaries were not weakened to make them pass. Current V2 native-concept regressions and General browser legacy views provide the passing legacy coverage listed above.

Evidence: `.tmp/phase32/integration.log`, `regressions.log`, `types.log`, `lint.log`, `build.log`, the unit-result JSON files, `browser-artifacts/result.json`, `deliverableBrowser-artifacts/result.json`, the two `legacy*-result.json`/logs, and `preservation.json`.

## 13. Limitations

Only structured research/private folders and the explicitly listed existing Final Layout checklist fields are supported. No flexible-field surrogate, generic model/path writer, field initialization, completion-document adapter, Archive/Library publication, external worker or notification integration was added. INSPECT_FILE, INITIAL_CONCEPT, FINAL_CONCEPT, Sister Tasks and Custom Stage Builder remain outside this phase.

An unavailable/moved folder requires a new task for a currently authorized destination; field refresh retains the original field identity. Terminal task lifecycle remains unchanged; a later accepted revision uses a new task. Unreferenced copied objects require the explicit reconciliation/cleanup policy above. Spectators of the new types receive minimal metadata rather than submission access, resolving the request's stricter submission-isolation requirement.

The older standalone legacy runners need separate V2-aware harness maintenance. PostgreSQL 18.6 and real S3 were deliberately not exercised; local tests use PostgreSQL 14.19 and controlled fake storage.

## 14. Controlled development activation recommendation

**Keep Phase 3.2 disabled.** The implementation and passing V2 verification are ready for review; this report does not authorize activation. Review/remediate or explicitly accept the supplemental legacy-runner coverage gap, and preferably rehearse on PostgreSQL 18.6 before approving the candidate.

For a separately authorized activation, repeat Neon project/branch/database/version identity, all 109 prior ledger checksums, this exact candidate SHA-256, no-drift checks, recovery availability and comprehensive existing-data snapshots. Apply only this migration once; stop on any critical mismatch or migration failure. Verify 110 successful / 0 failed / 0 pending, 119 public tables, zero drift and preservation before separately enabling the new flag locally. Preserve the four existing flags and verify a fresh process. No automatic repair/retry, S3 cleanup, push, deployment or Phase 3.3 work is part of this implementation.
