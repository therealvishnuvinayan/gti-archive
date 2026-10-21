# Phase 3.4 — Sister Tasks, task families and Tasker UX

Implementation report, 2026-10-21. **Implemented; not activated.** `FLUX_TASKER_SISTERS` remains unset/off in actual local configuration. `.env.local`, `.env` and `.env.example` are byte-for-byte unchanged; the six previously enabled flags remain intact. A fresh isolated process using Next.js’s environment loader confirmed all six flags are `1` and Sisters is unset. No Neon connection or migration, real-account change, live S3 operation, external worker/notification activation, push or deployment was performed. Phase 4 was not started.

The supplied development baseline remains 111 applied migrations and 120 public tables. This implementation did not re-query Neon. All 111 repository migration checksums match the captured baseline. The pre-existing staged `PHASE-3.3-ACTIVATION.md` was preserved and is not part of this implementation's changes. Historical commit `8babfd1` was inspected read-only; no historical schema, delivery, legacy-family or notification implementation was restored.

**Creation and ownership.** A Sister is a normal UniversalTask of one of the existing six types. Its immediate source must be a persisted, enabled UniversalTask in COMPLETED status, not soft-deleted. The authenticated active business user must be Director, source Owner or source Executor; spectator-only access, technical privileges, unrelated project-management status and legacy task IDs do not qualify. The selected type/context independently passes the existing centralized creation capability and native target policies. Director remains the actual creator/Owner. SPM/JPM need legitimate source and creation context. Designer/Digital Lead may create GENERAL or an authorized FILE_UPLOAD only; they can execute assigned Sisters of all six types.

**Keep, Modify and confirmation.** The detail action loads reusable title/type/brief/context/deadline/priority, executor, spectators, destination/input mode, inspection/inspiration references and submitted/supporting-file history. Keep retains those values and the server compares them with the source; Modify permits authorized changes. The project remains the source project. Current participant, destination, source-delegation and creation rules apply to both modes. If the creator was the old executor, Modify must select a distinct new executor. Invalid retained spectators or unavailable targets must also be corrected explicitly.

A separate review displays source, actual new Owner, executor, type/title, deadline/priority, brief/context, spectators, project, target and selected historical versions. A checkbox and final confirmation are required. The server checks the explicit confirmation and a canonical digest binding the actual actor, command, source version, selected evidence and complete proposal. This digest is a consistency check, not an authorization credential; session, CSRF, capability and current source/target checks remain authoritative. The same confirmed command can replay safely; reusing its ID with different details fails.

**Original history and independent work.** The new task starts OPEN at version 1 with one native CREATED entry. Creation does not update the original task, assignments, status, deadline, files, entries, reviews, publications or events. It does not copy conversation, submission rows, approval decisions or completion state. Terminal editing/reopening remains prohibited; further work uses another Sister. Native distinct-reviewer safeguards and Director-only final project completion remain unchanged. A later explicit soft deletion preserves established lineage and evidence but blocks new derivation from that deleted source.

**Family integrity and authorization.** Two additive models suffice:

- `UniversalTaskFamilyLink`: new task, immediate completed source, immutable root, source version, Keep/Modify mode and the native creation entry.
- `UniversalTaskInheritedEvidence`: selected exact shared version, source upload/submission/review and truthful historical state, scoped to one new Sister.

Restrictive foreign keys, shape checks, insertion guards and deferred consistency enforce a fresh OPEN task, real creator, completed source, same project and root derived from the immediate source. A task cannot link to itself, introduce a cycle, forge a root, move families or acquire retroactive lineage. Immutable guards reject update/delete/TRUNCATE. Source rows are locked during creation. Commands serialize through the existing actor/command advisory lock and unique native ledger key. Branches and chains are supported; no old task is automatically converted into a family.

Every family member is independently filtered with task-detail-equivalent access, including deleted-task restrictions and enabled types. Hidden roots/sources have no returned ID/title; an accessible member supplies the traversal key. Counts and latest activity include only accessible tasks. Internal lineage snapshots are removed from generic entry responses; the separately authorized family projection supplies visible lineage. Existing historical file context does not expose the original conversation or other family members.

**Exact historical evidence.** The creator deliberately chooses up to 30 exact versions from native MESSAGE/SUBMIT attachments of the completed immediate source. Ready, sealed versions retain actual uploader, submitter, timestamp, original version identity and native review attribution. Supporting, submitted, rejected, superseded and approved states remain distinct. Earlier rejected versions are not relabelled as approved by a later acceptance. Selection creates read-only context and creation provenance, never a new upload, submission, application or acceptance. A version selected both as an inspection pin and historical context shares one native creation-provenance row.

Protected evidence routes require a current Owner/Executor/Director relationship to the Sister, exact evidence/version association and pinned object integrity. Spectators do not receive inherited evidence or its download grant, including on General Sisters. Reads use the existing conditional ETag/version/checksum path. Only safe PDF/raster types can request inline preview; responses remain private/no-store, nosniff and sandboxed. No S3 object is copied by Sister creation, and no project-folder ACL/membership is granted. Source soft deletion does not break previously established evidence access through an authorized Sister.

| Type | Sister behavior |
| --- | --- |
| GENERAL | Fresh conversation, submissions and independent native review. |
| FILE_UPLOAD | Revalidates existing authorized folder/project/ancestry. Inherited files do not create applications or publications. Normal fresh submission and acceptance are required to publish. |
| DATA_INPUT | Revalidates the existing writable field/stage/type and captures a fresh native state/hash/token. Old accepted values are not reapplied. Later conflicts require the existing refresh/resubmit workflow. |
| INSPECT_FILE | Reuses the exact original pin only with current delegation authority. An old owner-uploaded pin requires that original upload-task Owner or Director; read/executor access alone is insufficient. A new authorized source can instead be selected/uploaded. Findings require independent submission/review. |
| INITIAL_CONCEPT | Historical concepts remain context. New concepts receive independent submission identities and decisions. |
| FINAL_CONCEPT | Retained/new inspiration passes current Initial Concept eligibility and delegation checks. Rejected/superseded/deleted sources cannot become newly eligible inspiration. Existing pins retain historical truth after later source changes. Native final project-completion authority is untouched. |

**Tasker presentation.** Grid and list group accessible related work into expandable family stacks, with root/source indicators, status, type, priority, deadline, accessible counts and latest authorized activity. Expanded members follow visible parent/child lineage; missing restricted parents are not fabricated. API task/family pages are bounded to 60 tasks with stable ordering and pagination. Family detail links preserve the family filter. Keyboard expansion and narrow mobile layouts are covered by browser tests.

Filters cover type, status, priority, authorized Owner/Executor, owned/assigned work, accessible tasks, scoped project tasks, overdue work and title/brief search. Sorts cover deadline, priority, creation time and recent activity. Existing project links provide project scope. Owner/Executor filter choices derive from visible task metadata. Family expansion can show other authorized members beyond the current search/filter match, explicitly labelled as accessible family work; it does not grant broader access.

Side-by-side comparison shows two native submitted responses, exact file/version metadata and links, submission times, review state and reviewer. Safe exact-version previews open separately. Comparison is within one task; cross-task/binary visual diff, inline synchronized PDF/image canvases and document conversion are not implemented. No arbitrary remote viewer is introduced.

**Atomic audit and events.** The native CREATED entry records source/root/version, actual actor, creation mode, new details and exact selected versions. Its existing typed TASK_ACTIVITY event/outbox remains authoritative. Task creation, family/evidence rows, concept references, provenance, entry and corresponding event/outbox commit together. Deferred checks prevent partial links/evidence or missing provenance. Forced outbox failure rolls back all of them. No ApprovalRequest surrogate, second approval engine, extra notification stream or external dispatcher was added.

**Candidate migration.** `prisma/migrations/20261022030000_universal_tasker_sisters/migration.sql`

SHA-256: `84fb73f0bc9939e260afd75dab7f91964a328108f543c556037a20de02bd3b1d`

Disposable result: **112 successful migrations, zero failed/pending, 122 public tables including `_prisma_migrations`, zero Prisma schema drift.** The two new tables start empty. Nine restrictive foreign keys, seven valid indexes including primary/unique indexes, two shape checks and seven enabled triggers are validated. Three new guard/consistency functions and narrow replacements of the existing reference/provenance guards support atomic historical selection. No prior migration file was changed.

The populated rehearsal first completes all six types on the 111-migration schema with Sisters off. It snapshots every existing public table and prior migration row, applies the candidate, then compares all old data exactly. Completed General/Deliverable/Concept tasks, original versions, messages, reviews, audit/events, accounts and legacy concept rows survive unchanged. The broader regression runner additionally preserves populated document approvals, decisions, delivery diagnostics and file provenance across the concept/Sister candidates. All local mutation tests use PostgreSQL 14.19 disposable Unix-socket clusters, synthetic V2 sessions and fake storage. Neon PostgreSQL 18.6 was intentionally not exercised.

**Verification results.** Evidence is in `.tmp/phase34/` (local, ignored artifacts). The runner blanks live credentials for production build, uses an unreachable loopback build database, and uses separate disposable databases for integration/browser tests. Browser apps contain no application environment files and block external requests.

| Check | Result |
| --- | --- |
| Full TypeScript (`tsc --noEmit --incremental false`) | PASS |
| Targeted ESLint, zero warnings | PASS |
| Production `pnpm build` (Prisma generation + Next.js) | PASS |
| Tasker and Sister contract units | PASS |
| General, Deliverable, Concept and Sister integration | PASS; all 21 requested Sister scenarios, six-type compatibility, exact historical evidence, supporting inspection pin/provenance reuse, current Final inspiration and direct forged-lineage checks |
| Populated migration/preservation/catalog/drift | PASS; 111/120 → 112/122; no backfill |
| Concurrent creation, replay, stale source, rollback and large-family paging | PASS; repeated command produces one task/event; distinct commands produce independent branches; 60-row pages have stable unique membership and authorized counts |
| Authorization foundation/persistence, approval and shared-event units | PASS |
| Complete authorization/project/governance/completion/files/approvals/events/Archive/Library/workspace/administration regression runner | PASS; 108 PASS checkpoints |
| Repaired legacy task runner | PASS; task suite 66 assertions, project relationship suite 57, historical assignment migration 3 |
| Repaired legacy concept runner | PASS; seven suites, 886 assertions, genuine V2 sessions, zero external requests |
| Sister browser | PASS; five business roles, Keep/Modify, explicit confirmation, independent review, chains, exact rejected context, spectator/technical/unrelated denial, hidden sibling search/traversal, keyboard grid/list stacks, filters/sort, mobile stacks and comparison; 16 screenshots |
| General browser | PASS; 9 screenshots; ownership, revisions, review, spectator boundaries, five business roles, technical/unrelated denial and mobile history |
| File Upload/Data Input browser | PASS; 10 screenshots; explicit publication, field conflict/refresh/resubmission, role/target restrictions and evidence isolation |
| Inspect/Initial/Final Concept browser | PASS; 13 screenshots; exact inspection/inspiration pins, rejected/revised/approved history, independent Final review and source/role isolation |

All four final browser suites ran Chromium 153.0.8010.12: **48 screenshots, zero page errors and zero external requests**. No required local suite was skipped.

During implementation, expected-denial fixture handling and browser accessible naming were corrected; the final assertions remain intact. The initial sandboxed build could not bind Turbopack's local worker port; the isolated build passed with that local operation permitted. No live migration was attempted or retried.

**Limits and activation recommendation.** Keep the new flag disabled pending controlled development activation. Required local checks are recorded above; no live provider recovery/drift/lock preflight or PostgreSQL 18.6 execution is claimed. Browser coverage is Chromium with fake PDF bytes/storage, not Safari/Firefox or real document rendering/storage validation. Existing deadline rules validate calendar/time format and permit overdue dates; Keep does not introduce a future-only deadline rule. Source project identity remains fixed across a family. Up to 30 historical versions may be selected per Sister, and family pages contain at most 60 tasks.

Reopening approved originals, automatic replacement/republishing of accepted outputs, project completion changes, cross-family revision comparison, binary visual diffs, dependency/reminder systems, custom stages and templates remain outside this milestone. No new business override was introduced.

Recommend a separate Phase 3.4 controlled activation preflight: confirm the exact Neon project/branch/database/version, all 111 applied checksums, this candidate checksum, recovery readiness, locks, no drift and complete preservation fingerprints. Only after explicit authorization should this single migration be applied once and postchecked for 112/122 with zero failed/pending/drift. Only after preservation succeeds should local `FLUX_TASKER_SISTERS=1` be separately enabled, preserving the six flags and checking a fresh process. This report does not apply or authorize that activation.

**Exact file inventory.** Created:

```text
prisma/migrations/20261022030000_universal_tasker_sisters/migration.sql
scripts/tasker-sisters-browser-check.mjs
scripts/tasker-sisters-integration-check.ts
src/app/api/tasker/[taskId]/evidence/[referenceId]/route.ts
src/app/api/tasker/[taskId]/sister/route.ts
src/app/api/tasker/sister-preview/route.ts
src/components/tasks/task-families.tsx
src/lib/tasker/families.ts
src/lib/tasker/sister-contracts.ts
src/lib/tasker/PHASE-3.4.md
```

Modified:

```text
package.json
prisma/schema.prisma
scripts/run-authorization-isolated-integration.mjs
scripts/run-universal-tasker-isolated.mjs
scripts/tasker-concepts-browser-check.mjs
scripts/tasker-deliverables-browser-check.mjs
scripts/tasker-schema-baseline.mjs
scripts/tsconfig.universal-tasker.json
scripts/universal-tasker-browser-check.mjs
scripts/universal-tasker-unit-check.ts
src/app/(dashboard)/tasks/page.tsx
src/app/api/tasker/route.ts
src/components/tasks/general-tasker.tsx
src/lib/tasker/concepts.ts
src/lib/tasker/contracts.ts
src/lib/tasker/http.ts
src/lib/tasker/service.ts
```
