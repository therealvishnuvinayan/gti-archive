# Phase 4.4D — Runtime Inspect, Concept and Sister Task integration

Implemented and verified locally on 23 October 2026. **Not activated.** Phase 4.4A+B+C remain implemented. Phase 4.4E, completion-document configuration and final runtime-project closure remain unavailable.

No Neon connection/migration, actual environment edit, live S3 operation, real account or permission change, notification, email, worker activation, push or deployment occurred. The user's staged A+B+C index is unchanged; D changes are unstaged. The ten enabled local flags are preserved, and `FLUX_RUNTIME_INTEGRATION` remains absent/disabled. The historical C candidate checksum is superseded by the D checksum in item 14.

1. **Exact file inventory.** Created:

   - `src/lib/tasker/runtime-references.ts`
   - `scripts/runtime-concepts-check.ts`
   - `src/lib/runtime-integration/PHASE-4.4D.md`

   Modified relative to the staged A+B+C baseline:

   - `prisma/migrations/20261024010000_runtime_integration/migration.sql`
   - `prisma/schema.prisma`
   - `scripts/run-authorization-isolated-integration.mjs`
   - `scripts/run-universal-tasker-isolated.mjs`
   - `scripts/runtime-tasker-check.ts`
   - `scripts/stage-runtime-browser-check.mjs`
   - `scripts/tasker-schema-baseline.mjs`
   - `scripts/tsconfig.universal-tasker.json`
   - `src/components/tasks/general-tasker.tsx`
   - `src/components/tasks/task-families.tsx`
   - `src/lib/authorization/task-policies.ts`
   - `src/lib/events/contracts.ts`
   - `src/lib/tasker/concepts.ts`
   - `src/lib/tasker/contracts.ts`
   - `src/lib/tasker/families.ts`
   - `src/lib/tasker/runtime-context.ts`
   - `src/lib/tasker/service.ts`
   - `src/lib/runtime-integration/PHASE-4.4.md`
   - `src/lib/runtime-integration/PHASE-4.4B.md`
   - `src/lib/runtime-integration/PHASE-4.4C.md`

   The earlier reports receive only a pointer to this combined candidate. Ignored verification artifacts are under `.tmp/phase44d/`; they are not application changes.

2. **Runtime Inspect File lifecycle.** Director and actual SPM/JPM runtime Owner/Co-owner managers create the existing `INSPECT_FILE` task. The actual Task Owner can upload/seal/pin a Tasker version, or select an eligible exact runtime-stage submission. Stage selection checks the genuine project, stage, configured FILE_REQUIREMENT, actual uploader, READY sealed version and current manager authority. Rejected, uploading and replaced submissions are excluded. Requirements configured with no separate review permit their valid SUBMITTED file; review-required sources must be ACCEPTED. Completed-stage evidence remains selectable when otherwise eligible.

   A source must exist before findings or completion requests. Findings, optional attachments, mandatory completion reasons, rejection/correction and independent actual Owner/Director review use existing Tasker commands. Each inspection has one immutable source. Replacing a stage submission does not retarget an established reference. Task acceptance never changes stage-file acceptance, stage gates, Archive verification or project state.

3. **Runtime Initial Concept lifecycle.** Manager-created tasks support supporting attachments/conversation, explicit text/file submission, retained revisions, completion requests and independent review. Supporting MESSAGE attachments do not become submitted/approved concepts. Evidence displays SUBMITTED, APPROVED, REJECTED or SUPERSEDED with actual uploader, submitter and reviewer attribution. The integration uses real runtime context without legacy concept folders, stages or fabricated Project records. It does not complete a runtime stage or project.

4. **Runtime Final Concept inspiration.** New selection is limited to eligible Initial Concept submissions in the same actual RuntimeProject. The selector must be Director or the genuine Initial Task Owner, with current manager authorization; runtime ownership/Co-ownership alone does not expose another Task Owner's evidence. Options distinguish submitted and approved versions, excluding supporting/draft, rejected and superseded versions. Exact source upload, submission, review and SharedFileVersion identities are retained.

   The Final executor receives only selected inspiration and the new task's context. Source conversation and unselected versions remain protected. Later Initial revisions cannot retarget established references; historical labels remain the state recorded at selection. Protected reads recheck current recipient authorization and runtime source-delegation authority, then verify the pinned object's metadata. Final work and review are independent. Creation without inspiration remains supported.

5. **Runtime Sisters and family lineage.** All six types use the existing immutable family and inherited-evidence models. Source tasks must be accessible through genuine Owner/executor/Director relationships, COMPLETED and non-deleted. Keep/Modify proposals require confirmation tied to the actual creator and exact values. The new creator becomes the genuine Owner; executor eligibility, deadline, priority and other retained fields are revalidated. Source/root lineage stays in the same actual project, including when two projects share a published version.

   Original tasks, uploads, decisions and events remain unchanged. Historical versions are read-only context, not fresh submissions or approval. Data Input Sisters capture current field state and apply only fresh work; File Upload Sisters require fresh sealed submission and independent acceptance, leaving configured stage review separate. Inspection upload reuse requires current source-owner/Director delegation, otherwise Modify can clear the source for a fresh authorized upload. Final inspiration is re-resolved under current eligibility/delegation; rejected/superseded versions do not gain new eligibility through a Sister.

6. **Genuine associations and database constraints.** RuntimeTaskContext now admits all six supported types, while native Project/flexible IDs keep their original meaning. Deferred consistency continues to require exactly one legitimate task/event context. Non-General runtime creation requires current manager scope even when using an assigned-task context. The new `RuntimeTaskReference` association has restrictive FKs to UniversalTaskReference, RuntimeProject and RuntimeFileSubmission. No existing scalar columns are added.

   The existing reference shape check and a new deferred guard require exactly one native-upload, native-attachment or typed runtime-stage source. Original native reference selection, sealed-source, exact review, one-inspection-source, provenance and lifecycle guards remain. Additional checks prevent cross-runtime inspiration and native/runtime mixing. The family guard compares child, immediate-source and root runtime project IDs. Source associations and lineage reject mutation, deletion and truncation. The new table has three restrictive FKs, three valid indexes including its primary key, four enabled triggers and three new functions; catalog checks pass. Existing A–C adapter catalog checks also pass.

7. **Exact-version file delegation.** No source S3 copy is needed for inspection/inspiration or inherited history. Task Owner upload sealing continues to use the existing conditional storage mechanism. New runtime-stage selection verifies exact submission/version/file origin and real uploader. Download/preview endpoints use task policies and exact reference/version IDs. Wrong project, unrelated source, forged/unselected version, revoked authority/session, missing objects and changed object metadata fail closed. ETags remain storage evidence, not a claimed cryptographic hash. A Tasker file grant confers no runtime-stage permission.

8. **Roles and restricted context.** Director oversight remains truthful and creates no fictitious membership. SPM/JPM runtime management governs creation, while task ownership/assignment governs task access and review. Designers and Digital Leads execute assigned inspection/concept work with minimal project identity, brief, selected sources and protected task conversation. They may create eligible General Sisters via their completed-task context and assign SPM; stage assignment grants no file-destination authority. DATA_INPUT/INSPECT_FILE/INITIAL_CONCEPT/FINAL_CONCEPT creation remains manager-only. Spectators have no Sister creation or protected non-General evidence access. Technical-only accounts receive no business authority.

9. **UI, navigation and My Tasks.** The existing `/tasks`, project-scoped Tasker, task forms and detail views now expose runtime Inspect/Initial/Final creation, stage source choices, Owner upload/pinning, protected exact previews/downloads, revision comparison and Sister Keep/Modify confirmation. Runtime stage-source details expose only relevant stage identification and source attribution. Existing family stacks, list expansion, filters, sorting and accessible-member counts work across genuine runtime families. Hidden roots/sources are not emitted as traversal keys. Restricted executors navigate back to task lists without receiving a stage-management link or grant.

10. **Provenance, audit and concurrency.** Current V2 sessions and authorization locks, task row locks and command advisory locks remain in use. Source selection, reference/FK association, SharedFileProvenance, task entry, runtime event context, BusinessEvent and EventOutbox commit atomically. Runtime concept events now decode under `conceptTaskCommand`; historical native contracts remain valid. Replays do not duplicate references/families; stale revisions and competing pins are rejected or return the recorded exact result. Deferred failure tests roll references/provenance/history/events/outbox and family evidence back together. No consumer, external worker or notification was activated.

11. **A+B+C and historical preservation.** All 115 applied SQL files are byte-identical to the starting baseline. The staged Git patch hash and `.env`, `.env.local`, `.env.example` hashes match. Creation governance/instantiation, deliverable application/target adapters, runtime stage command/file implementations, core authorization policies and dispatcher remain byte-identical to A+B+C. All original populated rows and ledger checksums match before/after the 115→116 rehearsal; all eight added tables start empty. There is no backfill. Existing synthetic account/password/role/session records are preserved; dedicated new disposable accounts test revocation without editing the original identities.

12. **Regression and build results.** All required checks pass on disposable PostgreSQL **14.19**, fake S3 and current synthetic V2 sessions:

   | Check | Result |
   | --- | --- |
   | Populated 115→116 migration, exact preservation, empty additions, catalog, Prisma drift | PASS; 142 public tables, no drift |
   | Latest client on actual 115 schema, integration disabled | PASS; 12 assertions, no new-table access |
   | Phase 4.4A governance / B General / C deliverables | PASS; 49 / 463 / 376 assertions |
   | Phase 4.4D concepts/Sisters, expanded guard and fresh-application cases | PASS; 483 assertions |
   | Phase 4.3 runtime stages and ordered approvals | PASS; 503 assertions |
   | All six native/flexible Tasker types and native/flexible Sisters | PASS |
   | Draft Builder / publication | PASS; publication 414 assertions |
   | Broad authorization, session, administration, project governance/read/write, documents, approvals, files, events, Archive and Library | PASS; 112 reported checkpoints |
   | Authorization foundation/persistence, approval/event/Tasker units | PASS |
   | Both repaired legacy runners | PASS; task suites 66+57, concept suites 886 assertions across seven scripts |
   | Four repaired native UI runners | PASS; Stage 5: 94 source/30 isolated; Stage 6: 73/21; Stage 7: 81/29; Concept: 54/21 |
   | Full TypeScript and integration-test compilation | PASS |
   | Targeted ESLint | PASS; 16 TS/TSX/MJS files, zero warnings |
   | Isolated production build | PASS; dummy endpoints, no actual environment files |

   Intermediate failures were resolved: fixture self-review and source-spectator assumptions, Sister proposals retaining the creator as executor or explicit `undefined`, and a missing required actor field in a direct-SQL fixture. The new SQL authority helper uses PL/pgSQL so the authorization runner can construct its older pre-authorization baseline before exercising the current function. No completed check remains failing.

13. **Isolated Chromium acceptance.** PASS: **169 assertions, 40 screenshots, zero page errors, zero external requests** on Chromium **153.0.8010.12** and disposable PostgreSQL 14.19. Five business roles and two technical-only accounts use genuine synthetic sign-in. Persisted browser flows cover A creation governance, B General, C Data/File acceptance, Director inspection upload/pinning/rejection/correction, SPM/JPM authorized stage-source selection, Initial concept revision/review, Digital Lead Final selected-only inspiration and independent review, confirmed Initial Keep and Designer General Modify Sisters, family expansion/list/filter/sort and protected file denials. Original tasks and every runtime parent/stage/file snapshot remain unchanged by D browser task decisions.

   The 31 Tasker HTTP errors in browser evidence are deliberate negative checks (26×403, 5×400), not unexpected page failures. Browser Sister creation covers General and Initial; all six Sister types, cross-project/delegation attacks, fresh Data/File application, concurrency, rollback and missing/modified storage cases are covered in PostgreSQL integration tests. Browser binary preview requests verify protected exact streaming; visual binary differences are not calculated. No live provider or Neon acceptance was attempted.

14. **Pending migration and expected counts.**

   `prisma/migrations/20261024010000_runtime_integration/migration.sql`

   SHA-256: `efddc62f8d040473e42e405d21ccc55fdc711cdec45d51c6e7dc7f724e04210e`

   Verified disposable result: **116 successful migrations, zero unfinished/failed or pending migrations, 142 public tables including the Prisma ledger, zero schema drift.** The combined candidate adds eight tables: RuntimeCreationRequest, RuntimeCreationDecision, RuntimeTaskContext, RuntimeTaskEventContext, RuntimeTaskTarget, RuntimeTaskApplication, RuntimeTaskPublication and RuntimeTaskReference. The SQL retains explicit transaction boundaries, a five-second lock timeout and a sixty-second statement timeout.

   These are expected totals for a later separately authorized application of this exact candidate. Neon was not contacted; its supplied 115/134 baseline is not claimed as freshly inspected here. The C SHA `d77c1f2035db7375e8bd4a2700eadde28dc3f75fb722ad6e69259200f9cf7ada` and 116/141 rehearsal are historical. The earlier Phase 4.3 migration approval does not authorize this candidate.

15. **Limitations and Phase 4.4E readiness.** D is complete for local implementation and verification. The combined A–D candidate remains unapplied/unapproved for Neon; no PostgreSQL 18.6 execution or actual flag activation is claimed. Director-approved completion-document requirements, final-completion requests/closure, completed-project behavior, official GTI templates and Phase 5 remain unimplemented. The recorded user policy remains: unconfigured projects stay blocked until explicit Director-approved document requirements exist. This is a handoff for separately requested E work, not activation approval. **Stop at D.**

Evidence: `.tmp/phase44d/integration-final.log`, `fast-final.log`, `authorization.log`, `regressions.json`, `static-checks.json`, `lint-final.log`, `typecheck-final.log`, `build-result.json`, `browser/result.json`, the forty browser screenshots, `baseline.json`, `preservation.json` and `verification.json`. Reproduce the combined service/migration suite with `pnpm runtime-integration:check`. The browser uses the existing isolated runner with `FLUX_BROWSER_RUNTIME_INTEGRATION=1` and an isolated production build; it does not change actual flags.
