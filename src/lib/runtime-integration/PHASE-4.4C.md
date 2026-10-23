# Phase 4.4C — Runtime File Upload and Data Input Task integration

**Historical package report.** The current combined A+B+C+D candidate, checksum, counts and verification are documented in [PHASE-4.4D.md](PHASE-4.4D.md). The C checksum and 116/141 rehearsal below remain historical.

**Implemented and verified locally on 23 October 2026. Not activated.** This extends Phase 4.4A+B and stops at Phase 4.4C. The combined migration remains pending and unapproved for Neon. Actual environment files are unchanged; `FLUX_RUNTIME_INTEGRATION` remains disabled. No Neon connection, live S3 operation, development account/permission change, external worker/notification activation, push or deployment occurred.

1. **Exact package files.** Changes are relative to the user's staged A+B starting point. The Git index is byte-for-byte unchanged; C changes are unstaged.

   Created:

   - `scripts/runtime-deliverables-check.ts`
   - `src/lib/tasker/runtime-targets.ts`
   - `src/lib/runtime-integration/PHASE-4.4C.md`

   Modified:

   - `prisma/migrations/20261024010000_runtime_integration/migration.sql`
   - `prisma/schema.prisma`
   - `scripts/run-authorization-isolated-integration.mjs`
   - `scripts/run-universal-tasker-isolated.mjs`
   - `scripts/stage-runtime-browser-check.mjs`
   - `scripts/tasker-schema-baseline.mjs`
   - `scripts/tsconfig.universal-tasker.json`
   - `src/components/projects/stage-runtime.tsx`
   - `src/components/tasks/general-tasker.tsx`
   - `src/lib/authorization/task-policies.ts`
   - `src/lib/events/contracts.ts`
   - `src/lib/stage-runtime/files.ts`
   - `src/lib/stage-runtime/service.ts`
   - `src/lib/tasker/applications.ts`
   - `src/lib/tasker/contracts.ts`
   - `src/lib/tasker/http.ts`
   - `src/lib/tasker/runtime-context.ts`
   - `src/lib/tasker/service.ts`
   - `src/lib/tasker/targets.ts`
   - `src/lib/runtime-integration/PHASE-4.4.md` — historical-report notice
   - `src/lib/runtime-integration/PHASE-4.4B.md` — historical-report notice

2. **Runtime FILE_UPLOAD.** An eligible Director or genuine manager Owner/Co-owner selects an available stage's published FILE_REQUIREMENT. Existing UniversalTask commands assign the executor, retain supporting files and exact sealed submissions, request completion with a reason, reject/correct and accept. Acceptance applies only the latest eligible SUBMIT referenced by the completion request. Supporting and superseded uploads remain retained and are not published. The existing durable UniversalTaskApplication/UniversalTaskPublication records reserve destination object keys before copying. Accepted files become distinct native RuntimeFileSubmission/SharedFile/SharedFileVersion records through the existing runtime preparation and finalization functions. File type, size and available count limits still apply. No Archive or Library publication occurs.

3. **Runtime DATA_INPUT.** Targets identify an INFORMATION capability and stable field ID in the project's pinned published definition. Supported types are SHORT_TEXT, LONG_TEXT, NUMBER, DATE and SELECT. The adapter uses TEXT as the Tasker value mode, validates the proposal with the existing runtime field validator, and retains a typed JSON value in submission history. NUMBER becomes a finite bounded number; DATE requires a real calendar date; SELECT must match a published option. READ_ONLY, unsupported capabilities, FILE and TEXT_FILE fail closed. Maximum-length published capability and field identifiers are covered. Acceptance calls the extracted transaction form of the existing runtime stage command and changes exactly one field; it never completes a stage or project.

4. **Target and context integrity.** RuntimeTaskContext remains the genuine task-to-RuntimeProject FK association. A task has exactly one native or runtime context. Native project columns retain their meaning and remain null for runtime tasks. New RuntimeTaskTarget links the existing UniversalTaskTarget to a real RuntimeStage FK and validates capability, field, definition-stage, published-version and definition-hash identities. Its identity is immutable. RuntimeTaskApplication links an accepted application to real RuntimeActivity; RuntimeTaskPublication links a reserved publication to its exact RuntimeFileSubmission. Restrictive FKs, immutable guards and deferred consistency checks prevent missing/mixed target bindings, incomplete accepted publications and contradictory histories. Existing structured/flexible branches still require their original native associations and attachments. No legacy Project is fabricated.

5. **Executor and spectator isolation.** Central V2 policies require current business authorization and real runtime management scope at creation. Both the Task Owner and actual accepting reviewer are reauthorized against the destination at application. Assignment supplies only Tasker access: Designer/Digital Lead can submit and download their task evidence but cannot edit stages, enumerate runtime files or create runtime deliverable tasks. Native folder creation eligibility remains intact. Project management alone does not confer ownership of someone else's task. Deliverable spectators receive limited metadata and no conversation evidence, downloads, field baselines or application details. Technical-only and unrelated users are denied. Director actions preserve actual actor attribution and independent-review rules. General follow-ups may reuse an assigned runtime deliverable's minimal context without gaining stage authority; deliverable creation still requires a direct authorized runtime target.

6. **Separate stage-file review.** Task acceptance finalizes an eligible stage submission as SUBMITTED, with its real source uploader. It does not write ACCEPTED or supply a stage reviewer. OWNER and REVIEWER requirements remain unsatisfied until a separate eligible, reasoned native FILE_DECIDED action. Existing self-review checks remain in the stage writer and SQL guard. Explicit NONE requirements can use a correctly sealed submission without an invented review. The task detail shows the imported file's current stage state and configured acceptance requirement. Browser acceptance separately persisted task completion, pending stage review and later Owner stage acceptance.

7. **Conflicts and approval supersession.** Creation captures the field's original value/attribution, stage revision and evidence revision. Acceptance locks RuntimeProject then RuntimeStage, rechecks current Owner/reviewer permissions and immutable target identity, compares the baseline and revalidates the proposed value. A newer manager change or competing accepted task cannot be overwritten. Authorized REFRESH_TARGET records the new baseline and forces a fresh SUBMIT and completion request. The shared stage command increments evidence revision, supersedes pending approval requests through the existing approval adapter and leaves unrelated fields intact. Earlier approved evidence ceases to qualify when its evidence revision differs. Completed, unavailable and blocking-rejected stages remain protected; no Director decision is forged.

8. **Provenance and storage recovery.** Source and destination versions remain distinct immutable identities. Destination metadata retains the original filename and uploader, while the reserved key uses a sanitized filename. SharedFileReference retains each native SOURCE and SharedFileProvenance links source and destination versions to the real task acceptance entry. The native stage history identifies the accepting actor; the submission and subsequent stage decision identify uploader and stage reviewer separately. Conditional copies use the exact source ETag/provider version and verify destination metadata and any trustworthy SHA-256. An ETag is not described as a cryptographic checksum; UNKNOWN remains UNKNOWN when no full-object checksum is supplied. A copy that survives a later transaction rollback remains attached to its committed reservation. Explicit authorized acceptance retry verifies and reuses that object without another copy or duplicate submission. Storage failure cannot commit a READY stage file or COMPLETED task. No cleanup worker or object deletion was added.

9. **Audit, outbox, replay and concurrency.** Existing UniversalTaskEntry, RuntimeActivity, BusinessEvent and EventOutbox remain authoritative. The runtime stage command body was extracted into a transaction entry point shared by native stage routes and the narrow Tasker adapter; there is no second stage writer. Internal application arguments are not accepted by public command parsing and must match the actual task/application/target. Stage changes, native stage history, task acceptance, publication links, provenance and both event/outbox writes commit together. Reservation history commits separately before storage work. Forced late runtime-outbox failure rolled stage records and acceptance back while preserving the reserved object. Exact acceptance replay emitted no duplicate; concurrent file acceptance produced one submission, and two Data Input tasks with the same baseline produced one accepted field update. Real authorization revocation on a dedicated additional synthetic manager blocked both file and data application even through Director intervention. The original nine fixture accounts, permissions, passwords and sessions were preserved.

10. **UI and browser acceptance.** Existing `/tasks` retains mixed My Tasks, context scope, grid/list, priorities, deadlines, filters, task detail and history. Available runtime requirements and writable information fields expose contextual creation links. Task forms filter actual authorized targets; data proposals show field type, published SELECT options and number/date controls. Details show proposed values, exact-version task downloads, independent Owner acceptance/rejection, stale-field guidance, explicit refresh/resubmission, application outcome and separate stage-file status. No separate runtime Tasker dashboard or automatic stage task creation was added. Isolated Chromium 153.0.8010.12 passed **140 assertions and 29 screenshots**, with genuine synthetic role logins, persisted General/File Upload/Data Input workflows, exact downloads, direct API denials, zero page errors and zero external requests. Screenshots 20–24 cover the new workflows.

11. **A+B and native preservation.** The existing Director/SPM creation and JPM request/Director decision services remain unchanged. Their 49-assertion suite passes; runtime General retains all 463 assertions. All 503 stage-runtime assertions, draft/publication governance, six native Tasker types, Sisters, concept references and native field/file application pass. The populated rehearsal compares every original public-table row and migration checksum before/after the combined candidate, with all seven new integration tables initially empty. The latest generated client remains compatible with the actual 115-migration schema while integration is disabled (12 assertions). All 115 historical migration files and `.env`, `.env.example`, `.env.local` hashes match their starting values. Existing staging and unrelated work are preserved.

12. **Verification results.** All final required checks pass.

| Check | Final result |
| --- | --- |
| Full TypeScript; isolated integration compilation | PASS |
| Targeted ESLint, changed/new TS/TSX/MJS, zero warnings | PASS |
| Isolated production build, dummy DB URLs, no actual environment files | PASS |
| Populated 115 → 116 migration, old rows/checksums, empty new tables, Prisma diff | PASS, 141 tables, no drift |
| C adapter FK/index/function/trigger catalog | PASS |
| Runtime deliverable integration | PASS, 376 assertions |
| Integration disabled against actual 115 schema | PASS, 12 assertions |
| Phase 4.4A creation / Phase 4.4B General / Phase 4.3 stages | PASS, 49 / 463 / 503 assertions |
| All six native Tasker types, Sisters, Draft Builder, publication | PASS |
| Broad authorization/session/admin/workspace/project read/write/governance, completion documents, shared files, approvals, events, Archives and Library | PASS, 112 checkpoints |
| Authorization foundation/persistence, approval/event/Tasker units | PASS |
| Repaired legacy tasks / concept runners | PASS, 123 assertions across two suites / 885 across seven suites |
| Stage 5 / Stage 6 / Stage 7 / Concept native UI | PASS, 94+30 / 73+21 / 81+29 / 54+21 source assertions + isolated checkpoints |
| Final isolated Chromium acceptance | PASS, 140 assertions, 29 screenshots |
| Historical migrations, environment hashes, Git index, whitespace | PASS |

Development runs exposed and corrected a schema-projection relation-name collision, an extracted upload-finalization condition, native UUID command formatting, a remaining native attachment-only application consistency check and an optional deliverable UI type guard. Test setup also needed its correct Tasker command contract, local harness import path and a browser selector that distinguishes retained preparation/acceptance entries carrying the same reason. These failures are retained in `.tmp/phase44c/`; no failed check was waived. The final runs above pass. Live Neon/PostgreSQL 18.6 and real S3 verification were intentionally not run: this package authorizes disposable PostgreSQL and fake storage only.

Evidence: `.tmp/phase44c/integration-final.log`, `authorization.log`, `regressions.json`, individual regression logs, `typecheck-final.log`, `lint-final.log`, `build-result.json`, `browser/result.json`, screenshots and `preservation.json`. Reproduce the complete migration/integration suite with `pnpm runtime-integration:check`. Browser acceptance uses the isolated build and explicit test-only `FLUX_BROWSER_RUNTIME_INTEGRATION=1`.

13. **Exact pending candidate.**

    `prisma/migrations/20261024010000_runtime_integration/migration.sql`

    SHA-256: `d77c1f2035db7375e8bd4a2700eadde28dc3f75fb722ad6e69259200f9cf7ada`

    Actual disposable rehearsal: **115 successful / 134 public tables → 116 successful / 141 public tables**, including the Prisma ledger; **zero unfinished migrations and zero Prisma schema drift**. Three C adapter tables extend the four A+B tables. C adds six restrictive FKs, six valid indexes (including primary/unique indexes), ten enabled custom triggers and three functions, and narrowly extends existing guards/shape checks. Existing models receive only virtual relation additions, with no new physical columns. No destructive data change, backfill or invented historical audit record is present. The migration retains BEGIN/COMMIT, a 5-second lock timeout and a 60-second statement timeout. No extra migration was introduced.

    Rehearsals used disposable PostgreSQL 14.19, not Neon 18.6. The separately established development baseline remains `flux-v2-dev / develop / neondb`, 115 migrations and 134 tables; it was not contacted or newly verified here. The previous A and B hashes/counts are historical and must not be used to approve this combined candidate.

14. **Deferred boundaries and stop.** Runtime INSPECT_FILE, INITIAL_CONCEPT, FINAL_CONCEPT and Sisters remain unavailable for Phase 4.4D. Director-approved completion-document policy, Owner final-completion requests, Director final closure, standard templates and later packages remain unimplemented. The selected policy remains explicit Director-approved document requirements, with unconfigured projects blocked; C does not implement or activate it. No actual runtime project/stage or business data was created in Neon, no real account/permission or S3 object was modified, and no worker, notification, push or deployment was activated. Local review is complete. Migration activation and Phase 4.4D were not started.
