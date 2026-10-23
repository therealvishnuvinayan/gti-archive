# Phase 4.4B — Runtime Project Tasker context and General Tasks

**Historical package report.** The current combined A+B+C+D candidate, checksum, counts and verification are documented in [PHASE-4.4D.md](PHASE-4.4D.md). Earlier hashes and rehearsal counts below remain historical.

**Implemented and verified locally on 23 October 2026. Not activated.** This package extends the existing Phase 4.4A creation governance with runtime General Tasks. It does not complete all of Phase 4.4. The pending migration remains unapplied to Neon and `FLUX_RUNTIME_INTEGRATION` remains absent/disabled in actual environment files.

No Neon connection or mutation, actual environment edit, real account/password/permission change, live S3 operation, external notification/worker, push, deployment, template creation or Phase 5 work occurred. All 115 historical migration files and the original Git index are unchanged. Existing working files remain present. The previous Phase 4.4A checksum and 116/136 rehearsal are historical; use the candidate details below for this combined A+B implementation.

1. **RuntimeProject representation.** UniversalTask remains the single task identity and lifecycle. Its optional one-to-one `runtimeContext` relation resolves through `RuntimeTaskContext.taskId` to a real `RuntimeProject` foreign key. Existing structured `projectId` and `flexibleProjectId` columns retain their original meaning. Runtime tasks leave both null. No legacy Project is fabricated. The API accepts `runtime:<id>` and returns `project.kind: "runtime"` with the actual ID and title. `sourceTaskId` records authorized reuse of minimal assigned-task context; it does not create a Sister relationship or inherit evidence.

   Association tables were chosen to preserve compatibility with the 115-migration database: existing Prisma models gain virtual relations, without new scalar columns that default queries would attempt to select. With integration disabled, task options/list/count/detail policies exclude runtime contexts using existing native columns and never require the new tables. An explicit 12-assertion rehearsal exercises the latest generated client on the actual 115 schema.

2. **Database integrity.** Restrictive foreign keys, immutable context guards and deferred consistency triggers require exactly one native or runtime project context at commit. Missing, mixed, forged and cross-project associations fail. Runtime contexts require GENERAL type, the real creator as Task Owner, an active real RuntimeProject, and either Director authority, genuine manager Owner/Co-owner scope, or a currently authorized same-project source task. Project and source-task row locks protect that decision. Existing task actor/session, version, lifecycle, distinct-reviewer, upload, provenance and history guards remain in place. A separate guard rejects runtime IDs anywhere in a Sister family link.

3. **General lifecycle.** Existing Tasker commands handle creation, executor assignment, edits, conversation, text/file responses, reasoned completion requests, Owner rejection/correction/approval, direct reasoned closure and soft deletion. Real Task Owner and executor identities remain separate. Director intervention retains the actual Director actor and override attribution. Exact replay returns recorded results; conflicting reuse and stale concurrent writers fail. Submitted files and previous responses remain retained through rejection and deletion. Completing or closing a task does not mutate a runtime stage, project, approval or archive; instantiating runtime stages creates no tasks.

4. **Authorization.** Director has global business oversight without inserted membership. SPM/JPM create through actual runtime Owner/Co-owner relationships and manage their own tasks; project management alone grants no authority over another user's task. Designer and Digital Lead execute assigned tasks and receive only task context. Authorized owners/executors can create a fresh General Task through `task:<id>`, including Designer ownership with an SPM executor. Spectators retain General Task read/download access and cannot create from spectator context or mutate tasks. Technical-only and unrelated users are denied. Lists, search, counts, details, commands, upload tickets and downloads use the same native resource relationships and current-session authorization. Task access grants no runtime-stage capability.

5. **Files and minimal context.** SharedFile/SharedFileVersion, native Tasker uploads, exact-version references and provenance are reused. A task file's real `taskId` leads to the immutable runtime context; its legacy project and runtime-stage bindings remain null. Only project identity/title, task brief/context, deadline, priority, people, task conversation and authorized supporting evidence are returned. Unrelated stages, fields, approvals and project files are not projected. Conditional sealing, ETag/provider-version pinning and genuine uploader attribution remain unchanged. Task files are not published to runtime file requirements, Archives or Library.

6. **Existing UI and navigation.** Authorized runtime workspaces expose Project Tasker. The existing `/tasks` workspace supports runtime project scope and creation, mixed-context My Tasks, grid/list views, filters, priorities, deadlines and safe task-detail links. Runtime details link back to the scoped task list without granting stage access. Assigned-task creation exposes General only for runtime context. Runtime tasks do not display Sister creation, family inheritance or revision-comparison controls. Native family stacks continue to work.

7. **Explicit deferred-type boundaries.** Runtime FILE_UPLOAD, DATA_INPUT, INSPECT_FILE, INITIAL_CONCEPT, FINAL_CONCEPT and Sister creation are unavailable. Both direct runtime contexts and reused task contexts reject these operations. Runtime General creation also rejects destination/input-mode/concept-reference/Sister parameters instead of silently accepting a mixed adapter request. Existing supported structured/flexible adapters are preserved.

8. **Shared events and outbox.** The existing `flux_emit_task_event` producer adds an immutable `RuntimeTaskEventContext` alongside the native TASK_ACTIVITY BusinessEvent and EventOutbox. This context has genuine restrictive foreign keys to the event, runtime task context and RuntimeProject. It must match the exact native task; no legacy project association is supplied. Deferred event checks require one context. The decoder returns `runtimeProjectId` only after validating the association, and rejects runtime events lacking it. The internal dispatcher hydrates the relation only when its table exists, preserving old-schema delivery and historical native event shapes. Native task/history/context/event/outbox writes remain atomic. Forced late outbox failures roll creation, commands and file preparation back. Disposable internal delivery verifies receipt deduplication and stale-claim rejection; no production dispatcher is registered or activated.

9. **Phase 4.4A preservation.** Director direct creation, independent SPM creation, mandatory-SPM JPM requests, Director approval/rejection, exact approved instantiation, genuine creator/Owner/Co-owner attribution, immutable participants, concurrent/replayed decisions and creation event/outbox integrity remain implemented. The 49-assertion creation suite and persisted SPM/JPM browser paths pass. The A implementation is extended, not duplicated.

10. **Existing Tasker and project preservation.** The complete populated rehearsal retains all six Tasker types, Sisters and exact historical files/events, followed by Draft Builder, publication and Stage Runtime tests. Every original table row and all prior ledger checksums match before and after the candidate. New tables start empty. Runtime General tests separately compare original tasks/entries/uploads/events and all synthetic users, sessions, authorizations, runtime projects/stages/activity and Archive/Library counts after their commands. Browser snapshots confirm accounts/passwords/roles and runtime project/stage/participant records remain unchanged by General Tasks.

11. **Exact pending migration.**

    `prisma/migrations/20261024010000_runtime_integration/migration.sql`

    SHA-256: `98b6d3fe41abb3d9aca817adcd59be661705c6d6553ebd858bc7ee29e5a31fb4`

    Rehearsed from populated 115/134: **116 successful migrations, zero unfinished migrations, 138 public tables including the ledger, zero Prisma schema drift.** No additional migration file was introduced. The four new tables are `RuntimeCreationRequest`, `RuntimeCreationDecision`, `RuntimeTaskContext` and `RuntimeTaskEventContext`. No business seed, conversion or historical backfill is present. No physical columns are added to existing tables.

    Combined A+B additions: 13 restrictive FKs, 15 indexes including primary/unique indexes, two creation shape checks, two creation event enum values and 15 enabled custom triggers. Three A FKs remain initially deferred. The existing UniversalTask and BusinessEvent shape checks are extended with deferred context enforcement. Seven new functions cover creation and task context integrity; four functions are replaced narrowly: `flux_runtime_guard`, `flux_runtime_consistency`, `flux_event_write_guard` and `flux_emit_task_event`. Existing approval, Shared File provenance/reference/version and native Tasker guard branches remain intact.

    The candidate retains explicit BEGIN/COMMIT, a 5-second lock timeout and 60-second statement timeout. Rehearsals used disposable PostgreSQL 14.19, not Neon PostgreSQL 18.6. The last development baseline remains the separately verified 115/134 Phase 4.3 state; this package made no new live-database verification or activation attempt.

12. **Verification results.**

| Check | Result |
| --- | --- |
| Full TypeScript (`tsconfig.typecheck.json`, no incremental cache) | PASS |
| Isolated integration TypeScript compilation | PASS |
| Targeted ESLint, 15 changed/new TS/TSX/MJS files, zero warnings | PASS; final browser/test edits rechecked |
| Isolated production build | PASS; Next.js 16.2.6, dummy DB URLs, no actual env files |
| Actual 115-schema integration-disabled compatibility | PASS, 12 assertions |
| Populated 115 → 116 migration/data/ledger preservation and Prisma diff | PASS, 138 tables, no drift |
| Runtime General Tasks | PASS, 463 assertions including role/file scope, lifecycle, mixed inputs, SQL integrity, expiry, concurrency/replay, rollback and internal event delivery |
| Phase 4.4A creation governance | PASS, 49 assertions |
| Stage Runtime | PASS, 503 assertions |
| All six existing Tasker types and Sisters | PASS, complete isolated runner |
| Draft Builder and published workflow governance | PASS, complete isolated runner |
| Broad authorization/session/admin/workspace/project governance/read/write, completion documents, files, approvals, events, Archives and Library | PASS, 112 checkpoints |
| Authorization foundation/persistence; approval/event/Tasker units | PASS |
| Repaired legacy task runner | PASS, 123 assertions across two suites |
| Repaired legacy concept runner | PASS, 885 assertions across seven suites; concurrency can vary totals |
| Stage 5 / Stage 6 / Stage 7 / Concept native UI checks | PASS: 94+30, 73+21, 81+29, 54+21 source assertions + isolated checkpoints |
| Isolated Chromium acceptance | PASS, 112 assertions, 24 screenshots, zero page errors or external attempts |
| Historical migration / environment / Git index preservation; whitespace | PASS |

Browser acceptance used Chromium 153.0.8010.12, synthetic role logins, disposable PostgreSQL and loopback fake S3. It persisted an SPM-owned runtime task, Designer assignment and My Tasks visibility, Designer-owned follow-up assigned to SPM, conversation, sealed file submission, pending completion, Owner rejection, correction and Owner approval. Spectator exact downloads, forbidden spectator writes, unrelated/technical/JPM task denials, deferred-type API denials and Director oversight were verified. Parent runtime stages/projects remained identical. Screenshots `15` through `19` document the General Task path alongside the retained stage and creation-governance screenshots.

During development, the native Concept options query exposed an extra-context-property regression; explicit native projection fixed it. A synthetic expired-session test initially failed to restore its `updatedAt`; the fixture now restores the complete original session. Browser selectors and waits were corrected to match the existing controls, await client hydration before upload, and distinguish persisted history from text still in the editor. The final runs above pass; these failures are not omitted acceptance coverage.

Evidence: `.tmp/phase44b/` contains `integration-final.log`, `authorization.log`, `regressions.json`, per-suite logs, `typecheck-final.log`, `lint.json`, `lint-browser-final.log`, `build-result.json`, `browser/result.json`, 24 screenshots and `preservation.json`. Reproduce the complete integration with `pnpm runtime-integration:check`. Browser mode uses `FLUX_BROWSER_RUNTIME_INTEGRATION=1` only inside the disposable harness and a separately isolated production build.

13. **Exact package file inventory.** Changes below are relative to the staged Phase 4.4A starting point. The original staging is preserved; Phase 4.4B changes remain unstaged.

Created:

- `scripts/runtime-tasker-check.ts`
- `src/lib/tasker/runtime-context.ts`
- `src/lib/runtime-integration/PHASE-4.4B.md`

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
- `src/lib/events/dispatcher.ts`
- `src/lib/runtime-integration/PHASE-4.4.md` — historical-report notice only
- `src/lib/stage-runtime/service.ts`
- `src/lib/tasker/contracts.ts`
- `src/lib/tasker/families.ts`
- `src/lib/tasker/service.ts`

14. **Remaining packages and readiness.** Phase 4.4B is complete for local review, with General Tasks only. Later packages still need runtime file destination application, runtime field application, Inspect/Concept references, guarded Sister lineage, Director-approved completion-document policy and evidence, Owner final-completion requests, Director final decisions, completed-project immutability and the remaining integrated navigation/acceptance. The selected completion policy remains: explicit Director-approved requirements are mandatory; unconfigured projects stay blocked. It is not implemented in this package. Runtime final closure and official standard templates remain unavailable.

This report does not authorize Neon migration, feature activation, push or deployment. No next package was started.
