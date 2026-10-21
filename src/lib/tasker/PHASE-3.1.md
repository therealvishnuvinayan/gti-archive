FLUX V2 — Phase 3.1 implementation report (21 October 2026)

Phase 3.1 implements the Universal Tasker core and General Task workflow. The candidate migration and `FLUX_UNIVERSAL_TASKER` adoption flag have **not** been applied or enabled in the actual development environment. No Neon migration, real S3 operation, development-account change, external delivery, push or deployment was performed.

1. **Existing architecture assessed.** Concept work is represented by `ProjectConceptFolder` and its tasker `ProjectStage`, with assignment/assigner, brief acceptance, revisions, comments, completion requests and native project workflow rules. `user-tasks.ts` projects these records into My Tasks; flexible work uses projects, collaborators, milestones, notes and attachments. Existing task notifications, request reminders and Ably authorization are separate from the transactional event outbox. V2 authorization binds genuine current sessions to resource policies. Shared File Identity provides logical files, immutable exact versions, native references and provenance; the approval engine's registered subject remains completion-document submission. The new Tasker does not replace these domains.

2. **Historical implementation considered.** Inspected `8babfd1` and its `new-tasker` tree read-only, including service/types, family/Sister Task, dependency and reminder mechanisms. Reused the design patterns of project-independent identity, server-side context resolution, version expectations, canonical command hashing, retained file versions and explicit lifecycle transitions. Rejected the old legacy-role/project-owner authority and combined concept/Tasker projections. No historical migrations or branch files were restored; Sister Tasks, dependencies and reminder scheduling were not carried forward.

3. **Exact files created and modified.** The inventory at the end of this report records every changed or new repository file. Test artifacts are ignored local output under `.tmp/phase31-*.log`; browser screenshots and JSON are under `/private/tmp/flux-phase31-browser-artifacts/`.

4. **General Task lifecycle.** A creator becomes the immutable Task Owner. Creation requires a title, GENERAL type, deadline, priority, eligible executor, brief and authorized context. Supporting text, spectators and attachments are optional. Statuses are OPEN, IN_PROGRESS, COMPLETION_REQUESTED, COMPLETED and CLOSED, with independent soft deletion. Owners/executors exchange messages; executors submit responses and selected exact file versions. Completion requests require a reason and preserve an evidence snapshot/hash. They do not complete anything. An owner or independent Director reviewer approves or rejects with a reason; rejection returns work to IN_PROGRESS. Owners/Directors can close directly or soft-delete with a reason. Completed/closed history remains readable by participants; deleted history remains available to its owner/Director and is absent from normal lists. No task operation completes or changes its parent project.

   Every command has a hash, current version expectation and actor-scoped replay key. Task row locks serialize transitions; create replay keys use a transaction advisory lock. Identical replays return the original outcome; changed command bodies and stale versions fail. Self-assignment and self-review are denied, including a Director attempting to review their own intervention request. No unapproved self-review policy was introduced.

5. **Authorization and ownership.** All five active business roles can create General Tasks in authorized structured/flexible project context. A task's genuine owner/executor can also create from its minimal task context without acquiring project membership. A spectator cannot do this merely through spectator access. Director business authority needs no fictitious membership and records the actual actor and intervention flag. SPM/JPM project ownership does not make them owners of another person's task. Designer/Digital Lead can assign an eligible SPM and then review as the real Task Owner. Technical privileges and legacy ADMIN/SUPER_ADMIN labels confer no Tasker rights.

   Registered resource policies use existing capability conventions: `task.createGeneral`, `task.list`, `task.view`, `task.manage` (edit/assign), `task.message`, `task.execute` (submit), `task.requestCompletion`, `task.review`, `task.complete` (direct closure), `task.delete` and `task.download`. The five future creation capabilities remain unregistered. Services refresh the real session and lock identity/session state; HTTP input accepts no principal or ownership evidence. Lists, search, counts, options, direct detail routes and downloads are scoped. Mutations require the configured application origin, bounded JSON, strict fields and fresh version expectations. No new realtime channel or unguarded event feed exists.

6. **UI and dashboard.** `/tasks` shows a default grid and optional list, title/brief search, status/owner/executor filters, priority, deadlines, overdue markers and pagination. Creation, detail, conversation, supporting upload/version replacement, response submission, completion review, closure and deletion are usable. Dashboard links and the sidebar count include scoped General Tasks. Authorized structured and flexible workspaces link to project General Tasks. Restricted users receive task/project identity and authorized task content without full stages or unrelated files. Concept tasks are explicitly labelled separately. Other users' changes can be loaded with Refresh; no notification or realtime subsystem was activated.

7. **File identity, approvals and events.** `UniversalTaskUpload` is a task upload intent/source reference into the existing `SharedFile` / `SharedFileVersion` store, not a second blob store. Replacements append numbered versions; submitted references stay immutable. Tickets address a temporary key for up to ten minutes. Finalization checks observed type/size/ETag and conditionally copies to a separate evidence key, under the task lock. Downloads reauthorize both the task and exact upload/version and use conditional storage GET with ETag and any observed object VersionId/checksum. ETags are opaque validators, not cryptographic hashes. Downloads are private/no-store, attachment-only, sandboxed and nosniff. No Archive/Library publication is implemented or permitted by this adapter.

   Task completion uses a native, single-step Tasker review gate and Phase 2.2's canonical evidence hashing. It does not fabricate completion-document `ApprovalRequest` records or claim that adapter supports tasks. Native Tasker history records the actual reviewer, request and evidence snapshot. `TASK_ACTIVITY` is a strictly decoded Phase 2.3 event with genuine task/entry and structured-or-flexible project FKs. An entry trigger writes the event and existing outbox atomically; shared provenance links exact file versions to native task entries. Existing completion-event constraints remain a separate strict discriminator branch. No worker, scheduler or external consumer was started. The existing dispatcher now decodes both event types; sequence is per task, not a promise of globally ordered delivery.

8. **Legacy preservation and pre-migration compatibility.** No concept rows, stages, revisions, files, historical events or approvals are converted. With the new flag off, Tasker services deny and the existing task page continues its concept behavior without querying new tables. Explicit established-column projections keep existing shared-file and approval adapters working before Tasker columns exist. The dispatcher also supports the earlier event schema. The event regression exercises the new application code with the earlier shared-file/approval schema before installing Tasker. Native V2 concept creation, assigned execution, completion requests and stage locks pass the project-write regressions; the browser verifies the existing concept view.

9. **Migration.** Candidate: `prisma/migrations/20261021210000_universal_tasker_general/migration.sql`.

   SHA-256: `eec3b2134bf5629135168ee649b434ede7be2b39b15b1566c2f86d195f0d8a01`.

   Adds four tables: UniversalTask, UniversalTaskSpectator, UniversalTaskEntry and UniversalTaskUpload. Defines all six task types while enforcing GENERAL-only records. Adds task references to shared file/provenance/event models and a TASK_ACTIVITY event enum value. Existing completion-only references become nullable only behind strict native-source discriminator checks; no existing rows are rewritten. Restrictive FKs, immutable origins/history/versions, actor/session guards, deferred history/outbox consistency and UTC defaults protect the new records. The migration uses a transaction and bounded lock/statement timeouts.

   Expected reviewed activation: **108 → 109 successful migrations; 112 → 116 public tables including `_prisma_migrations`; zero pending migrations and zero Prisma drift after applying the candidate.** A populated disposable baseline containing all 108 prior migrations verified these numbers, unchanged prior rows/checksums, no task backfill and an empty schema diff. Tests ran on PostgreSQL **14.19**; the reported Neon **18.6** environment was not migrated or independently exercised.

10. **Verification results.** PASS: full `tsc --noEmit --incremental false`; targeted ESLint on every changed/new TS/TSX/MJS file with zero warnings; Tasker units and isolated integration; authorization foundation/persistence units; assignment/session/login regressions; project reads/writes and governance; shared-file migration/integrity; approval units/migration/integration; event units/migration/dispatcher; Archive and Library authorization; production `pnpm build`.

   The combined isolated regression run emitted 97 PASS summaries. Tasker tests cover Director→Designer and Designer-owner→SPM, SPM/JPM scoped creation, Digital Lead flexible context, spectator and technical/unrelated denial, files/revisions, rejection/resubmission, completion, closure, deletion, concurrent updates/finalization, replay/conflict, failed outbox and upload-finalization rollback, reassignment, self-review denial, expired sessions and HTTP-origin checks. Project, account and legacy concept/file snapshots remain unchanged. All storage/consumer operations use fakes. Build verification used an unreachable local database URL override; no migration command is part of `pnpm build`.

11. **Browser acceptance by role.** PASS on Chromium 153 with real password sign-ins for synthetic V2 accounts in an isolated production app. Director creates/rejects/approves. Designer reads the authorized brief, uploads/submits/revises/requests completion, then owns and approves work assigned to SPM. SPM responds/requests completion and creates a scoped task. JPM creates, closes and deletes with history retained. Digital Lead acts as a view-only spectator with authorized download, and creates within an assigned flexible project. An unrelated Designer and Technical Administrator are denied direct Tasker/file APIs. Grid/list, overdue display, project links, legacy concept visibility and mobile history were checked. Nine synthetic identities/passwords and parent projects are unchanged; no browser page errors or external requests occurred. No actual development account was used or changed.

12. **Deferred functionality and limits.** FILE_UPLOAD destination publication, DATA_INPUT acceptance, INSPECT_FILE, INITIAL_CONCEPT and FINAL_CONCEPT behavior all fail closed. Sister Tasks, dependencies, recurring reminders, new templates, Custom Stage Builder, external notifications and workers remain out of scope. Side-by-side comparison is deferred to a viewer milestone; exact historical versions can be downloaded now. Multi-step Tasker approval policies are not implemented. Abandoned/expired staging objects and objects from rolled-back finalization are not swept by this milestone; uncommitted objects acquire no authorized download reference, and no old evidence is overwritten. No real S3 durability/versioning/checksum configuration was asserted or changed. Turning off the Tasker flag hides/denies Tasker while retaining its database evidence.

13. **Controlled activation recommendation.** Ready for separately reviewed development activation once the candidate checksum, current 108-migration/112-table Neon baseline, recovery readiness and schema/lock preflight are confirmed. The first live use should repeat role acceptance on the approved PostgreSQL 18.6 development target after controlled migration. Enable `FLUX_UNIVERSAL_TASKER=1` only through that separately approved activation. Existing shared-file, approval and event flags were not changed. This implementation does not apply the migration, activate adoption, push/deploy or start Phase 3.2.

Exact repository file inventory follows.

Created:

```text
prisma/migrations/20261021210000_universal_tasker_general/migration.sql
scripts/run-universal-tasker-isolated.mjs
scripts/tasker-schema-baseline.mjs
scripts/tsconfig.universal-tasker-unit.json
scripts/tsconfig.universal-tasker.json
scripts/universal-tasker-browser-check.mjs
scripts/universal-tasker-integration-check.ts
scripts/universal-tasker-unit-check.ts
src/app/(dashboard)/tasks/[taskId]/page.tsx
src/app/api/tasker/[taskId]/files/[uploadId]/route.ts
src/app/api/tasker/[taskId]/files/route.ts
src/app/api/tasker/[taskId]/route.ts
src/app/api/tasker/route.ts
src/components/tasks/general-tasker.tsx
src/components/tasks/project-tasker-link.tsx
src/lib/authorization/task-policies.ts
src/lib/files/legacy-select.ts
src/lib/tasker/PHASE-3.1.md
src/lib/tasker/contracts.ts
src/lib/tasker/http.ts
src/lib/tasker/service.ts
```

Modified:

```text
package.json
prisma/schema.prisma
scripts/file-identity-integration-check.ts
scripts/run-authorization-isolated-integration.mjs
scripts/shared-events-integration-check.ts
scripts/shared-events-unit-check.ts
src/app/(dashboard)/page.tsx
src/app/(dashboard)/projects/[slug]/page.tsx
src/app/(dashboard)/projects/flexible/[projectSlug]/page.tsx
src/app/(dashboard)/tasks/page.tsx
src/lib/approvals/service.ts
src/lib/authorization/definitions.ts
src/lib/authorization/eligibility.ts
src/lib/authorization/policy.ts
src/lib/authorization/runtime.ts
src/lib/events/contracts.ts
src/lib/events/dispatcher.ts
src/lib/files/access.ts
src/lib/files/completion-adapter.ts
src/lib/user-tasks.ts
```
