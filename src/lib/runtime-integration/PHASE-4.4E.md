# Phase 4.4E — Runtime completion documents and final project completion

Implemented and verified locally on 23 October 2026. **Not activated.** This report supersedes the D candidate checksum and its 116/142 expected counts. Phase 4.4F and Phase 5 have not begun.

No Neon connection or migration, actual environment edit, live S3 operation, real account/permission/password change, external email, worker activation, push or deployment occurred. The existing staged A–D index is byte-identical; E remains unstaged. All ten enabled local flags are unchanged and `FLUX_RUNTIME_INTEGRATION` remains absent/disabled.

1. **Exact files created and modified.** Measured against the working tree at the start of E: **30 files, 10 created and 20 modified**. Ignored verification harnesses/artifacts under `.tmp/phase44e/` are separate from application changes.

   Created (10):

   - `scripts/runtime-completion-check.ts`
   - `src/app/(dashboard)/projects/runtime/[id]/completion/page.tsx`
   - `src/app/(dashboard)/projects/runtime/completion/page.tsx`
   - `src/app/api/runtime-projects/[id]/completion/files/[versionId]/route.ts`
   - `src/app/api/runtime-projects/[id]/completion/route.ts`
   - `src/app/api/runtime-projects/[id]/completion/uploads/[submissionId]/route.ts`
   - `src/components/projects/runtime-completion.tsx`
   - `src/lib/runtime-completion/contracts.ts`
   - `src/lib/runtime-completion/service.ts`
   - `src/lib/runtime-integration/PHASE-4.4E.md`

   Modified (20):

   - `prisma/migrations/20261024010000_runtime_integration/migration.sql`
   - `prisma/schema.prisma`
   - `scripts/run-authorization-isolated-integration.mjs`
   - `scripts/run-universal-tasker-isolated.mjs`
   - `scripts/runtime-tasker-check.ts`
   - `scripts/stage-runtime-browser-check.mjs`
   - `scripts/tasker-schema-baseline.mjs`
   - `scripts/tsconfig.universal-tasker.json`
   - `src/app/(dashboard)/projects/runtime/page.tsx`
   - `src/components/projects/stage-runtime.tsx`
   - `src/lib/approvals/engine.ts`
   - `src/lib/authorization/definitions.ts`
   - `src/lib/authorization/eligibility.ts`
   - `src/lib/authorization/stage-runtime-policies.ts`
   - `src/lib/authorization/task-policies.ts`
   - `src/lib/events/contracts.ts`
   - `src/lib/stage-runtime/service.ts`
   - `src/lib/tasker/runtime-context.ts`
   - `src/lib/tasker/runtime-references.ts`
   - `src/lib/tasker/service.ts`


2. **Director-approved policy model and UI.** `RuntimeDocumentPolicy` retains immutable, contiguous per-project revisions, all three explicit settings, reason, configuration hash and an FK to the genuine Director's immutable `RuntimeCompletionActivity`. That activity records the actual actor, authorization version, session, command identity, timestamp, confirmation and exact input. The policy's real RuntimeProject relationship resolves its immutable pinned PublishedWorkflowVersion; no published definition is modified.

   `/projects/runtime/[id]/completion` extends the project workspace with project Owner/Co-owners, pinned version, complete policy review, required reason and explicit confirmation. Every new project starts UNCONFIGURED; no default policy is inserted. Only the current Director can approve or revise it. SPM/JPM can view authorized policies. Earlier revisions remain visible with their actor, reason and hash.

3. **Requirement semantics.** The repository category `AUTHORITY_APPROVAL_PROOF` represents Approval Proof; the other categories are `COPYRIGHT_TRANSFER` and `INVOICE`. REQUIRED needs the latest eligible ACCEPTED exact version. OPTIONAL allows submission/review without becoming a final-completion gate. NOT_APPLICABLE denies new submission/review while retaining earlier documents and decisions. Rejected, uploading, failed or superseded versions do not satisfy a required category. A new upload immediately becomes the current version and requires fresh acceptance.

   Policy changes always supersede pending final requests. Required-document changes do so as well; optional-document activity does not add an unsupported gate. Earlier accepted evidence may satisfy a later policy when it is still the current eligible version. Explicit all-NOT_APPLICABLE approval is supported. No project-type inference, automatic INTERNAL exemption, native document ordering requirement or default all-required policy is introduced.

4. **Submission, review, versions and external links.** Managers use the existing storage allowlist/size validation, short-lived upload intent, incoming key, conditional sealing copy, observed integrity metadata and immutable SharedFileVersion. Upload alone leaves the document SUBMITTED. Explicit acceptance or reasoned rejection uses its exact version; replacement retains the earlier submission, decision, uploader and provenance. Protected download and preview routes verify the project, exact version and pinned object metadata, including historical versions after final completion.

   The native completion-document rule is preserved: an authorized Director or actual SPM/JPM Owner/Co-owner may review their own uploaded document. Tasker and runtime-stage independent-review rules remain unchanged.

   **Runtime external submission links remain denied.** Native `CompletionDocumentAccess` and document-event records require legacy Project/workflow relationships, while `BusinessEvent.actorId` requires an internal User. A safe runtime path needs a typed access/token model and a reviewed external-actor event/provenance adapter. This phase issues no runtime links, fabricates no external User, sends no email and provides no token bypass. Runtime expiry/revocation/external-email cases are therefore not claimed as implemented; existing native external-link regressions still pass. Internal upload expiry and cancellation remain enforced.

5. **Actual Owner completion request.** Only the current actual Owner can request completion, including when that Owner is the Director. Reason, confirmation, expected project revision, policy revision and completion-audit revision are mandatory. Every configured stage must be completed and its configured gates valid. The service rechecks sealed stage files and required completion documents against storage. A missing policy blocks the request even when every stage is complete.

   `RuntimeCompletionRequest` pins the published workflow, stage completion snapshots/revisions, explicit policy/hash, exact accepted submission/version/approval/decision IDs, actual Owner, reason, command and request revision. It leaves the project ACTIVE. One pending request per project is enforced in PostgreSQL. Relevant changes link the superseded request to the exact immutable activity that invalidated it. Existing open tasks are retained and are not made an extra completion gate.

6. **Director final decision and rejection.** The current Director sees a pending-request queue at `/projects/runtime/completion` and the complete project evidence in its workspace. Approval requires an exact pending request/hash, confirmation, reason, current Director authority, current Owner authorization and fresh stage/document/storage verification. The decision, request projection, COMPLETED project state, activity, BusinessEvent and outbox commit atomically. Partial unique indexes prevent competing pending requests and duplicate approved final decisions.

   Rejection has a mandatory reason and explicit confirmation, preserves history and leaves the project ACTIVE. A later Owner request is a new revision. Rejection does not require stale evidence to become approvable first. Identical replay returns the recorded result only after current action-specific authority is checked; conflicting commands or stale revisions deny.

7. **Director as Owner.** The native governance service/policies allow the Director to decide their own actual Owner request; they do not impose a separate-person final-project restriction. Runtime completion preserves that rule while requiring two separate, explicit, audited operations. Requesting never completes the project. This does not reuse the workflow-publication self-approval exception and does not weaken independent stage or Tasker review. The Director-as-Owner case is covered in PostgreSQL integration tests; no unresolved business-policy decision remains.

8. **Completed-project integrity.** Completion requires a genuine approved final decision. Identity, ownership, stage evidence, policies, documents, requests, decisions and audit remain retained. Stage/document/policy mutations and ordinary runtime Tasker changes deny after completion. Task detail controls become read-only; source-based creation and Sisters cannot create new work in a completed runtime project. Authorized project lists display COMPLETED, and historical task/document/stage access remains scoped. No archive publication, legacy Stage 7 record, task deletion, notification, reopen operation or automatic workflow transition is added.

9. **V2 authorization and restricted roles.** The central `project.runtimeCompletion` resource policy admits Director oversight and genuine SPM/JPM runtime Owner/Co-owner scope, with current-session resolution and authorization locks. Policy approval/final decisions additionally require the current Director, including on replay. Completion requests additionally require the actual Owner. Technical-only, Designer, Digital Lead, unrelated SPM/JPM, invalid/expired sessions and forged/cross-project evidence deny at service/API boundaries. An assigned Universal Task grants no completion-document or full-stage access. Direct file reads, previews, queue/list counts and unsupported external commands are protected.

   Runtime project locks precede task locks in task commands, task options and Sister reads. Database task-write guards hold a shared project lock so final completion cannot race a committing task write without introducing a lock upgrade deadlock.

10. **Approvals, provenance, audit and outbox.** `RUNTIME_DOCUMENT` is an explicitly registered shared-engine subject with the fixed `runtime-document.manager.v1` policy. It binds actual RuntimeDocumentSubmission and SharedFileVersion identities, with legacy Project/completion-submission/event FKs left null. Shared steps, exact evidence, immutable decisions and native review semantics are reused.

    Typed `RuntimeDocumentFile`, `RuntimeDocumentReference` and `RuntimeDocumentProvenance` associations preserve logical category origins, exact source references and actual submission/review activities without adding scalar columns to existing models. Deferred consistency rejects missing, mixed or cross-project associations. Runtime completion activities are immutable and contiguous, with genuine actors, command hashes and current sessions. The bounded `RUNTIME_COMPLETION_ACTIVITY` wire payload contains only the server-defined action; arbitrary snapshots, reasons, filenames and storage locators are excluded. Trigger-generated BusinessEvent/outbox writes share the business transaction. No external dispatcher is activated.

11. **A–D and native preservation.** The original D SQL body is unchanged; E extends the same transaction before its final COMMIT. All **115 applied migration files/checksums**, the staged Git patch and `.env`, `.env.local`, `.env.example` hashes match the starting baseline. Populated 115→116 rehearsal compares every original table/row and original ledger checksum, including accounts/passwords/roles/sessions, runtime stages, native projects/tasks/approvals, Shared Files, events, Archives and Library. All sixteen additions start empty; there is no rewrite or historical backfill.

    A–D and native six-type/Sister checks pass, including a supplemental native run after the full candidate. Native completion-document/governance code remains unchanged; existing Stage 6/7, native document and independent Tasker/stage protections remain effective. Seventeen latest-client checks on the actual 115 schema with integration disabled verify native reads and deny new completion entry points before any missing-table query. These are disposable fixture preservation results; Neon was not freshly inspected or contacted.

12. **Pending migration, checksum, counts and object inventory.**

    `prisma/migrations/20261024010000_runtime_integration/migration.sql`

    **SHA-256:** `0a7981b4ff8b3646a6e9acfca744ef4cd2c555698317c9a9ab469b6adff54bef`

    Verified expected result: **116 successful migrations, zero unfinished/failed or pending migrations, 150 public tables including the Prisma ledger, zero Prisma drift.** The supplied Neon baseline remains 115/134; this candidate has not been applied there. The D SHA `efddc62f8d040473e42e405d21ccc55fdc711cdec45d51c6e7dc7f724e04210e` is historical.

    The combined candidate adds **16 tables, 55 valid indexes including primary keys, 48 restrictive FKs, seven CHECK constraints on new tables, 24 new functions and 67 enabled triggers**. It replaces twelve existing function definitions and nine existing named CHECK constraints through narrowly typed branches, preserving the native paths. It extends existing enums with the two creation-event labels, RUNTIME_COMPLETION_ACTIVITY and RUNTIME_DOCUMENT; it creates no new enum type. Explicit transaction boundaries, five-second lock timeout and sixty-second statement timeout remain.

    | New table | Indexes, including primary key | Restrictive FKs | CHECKs |
    | --- | ---: | ---: | ---: |
    | RuntimeCompletionActivity | 4 | 3 | 1 |
    | RuntimeCompletionDecision | 5 | 3 | 1 |
    | RuntimeCompletionRequest | 5 | 4 | 1 |
    | RuntimeCreationDecision | 5 | 4 | 1 |
    | RuntimeCreationRequest | 4 | 3 | 1 |
    | RuntimeDocumentFile | 2 | 2 | 0 |
    | RuntimeDocumentPolicy | 3 | 2 | 1 |
    | RuntimeDocumentProvenance | 3 | 3 | 0 |
    | RuntimeDocumentReference | 2 | 2 | 0 |
    | RuntimeDocumentSubmission | 7 | 7 | 1 |
    | RuntimeTaskApplication | 2 | 2 | 0 |
    | RuntimeTaskContext | 3 | 3 | 0 |
    | RuntimeTaskEventContext | 3 | 3 | 0 |
    | RuntimeTaskPublication | 2 | 2 | 0 |
    | RuntimeTaskReference | 3 | 3 | 0 |
    | RuntimeTaskTarget | 2 | 2 | 0 |


    E accounts for eight of those tables, 31 indexes, 26 FKs, five CHECKs, eleven functions and 38 triggers. The full exact index, constraint, function and trigger names/definitions are retained in `.tmp/phase44e/combined-catalog.json`; E-only definitions are in `.tmp/phase44e/catalog.json`. The migration itself is the reviewable complete DDL inventory. Existing-table CHECK replacements cover BusinessEvent, UniversalTask, UniversalTaskTarget, UniversalTaskPublication, UniversalTaskReference, RuntimeProject, SharedFileReference, SharedFileProvenance and ApprovalRequest.

13. **TypeScript, ESLint, integration and build.** All required checks pass using disposable PostgreSQL **14.19**, fake storage and synthetic current V2 sessions:

    | Check | Recorded result |
    | --- | --- |
    | Populated 115→116 preservation, empty new tables, catalog and Prisma drift | PASS; 116/150, zero drift |
    | Integration disabled on actual 115 schema | PASS; 17 assertions |
    | A creation / B General / C deliverables / D concepts and Sisters | PASS; 49 / 463 / 376 / 483 assertions |
    | E completion lifecycle and security | PASS; 329 assertions in final focused run |
    | Runtime stages / published workflows | PASS; 503 / 414 assertions in full progression |
    | Draft Builder, all six native/flexible Tasker types and Sisters | PASS; also rechecked native types/Sisters after the complete candidate |
    | Authorization/session/account administration, project read/write/governance, native documents, approvals, files/provenance, events/outbox, Archives, Library, workspace/search | PASS; 113 reported checkpoints |
    | Authorization foundation/persistence and approval/event/Tasker units | PASS |
    | Both repaired legacy runners | PASS; tasks 66+57 assertions, concepts 887 across seven scripts |
    | Four native UI checks | PASS; Stage 5: 94 source/30 isolated; Stage 6: 73/21; Stage 7: 81/29; Concept: 54/21 |
    | Full application TypeScript and integration-test compilation | PASS |
    | Targeted ESLint | PASS; 26 TS/TSX/MJS files, zero warnings |
    | Isolated production build | PASS; no actual environment files, dummy unreachable database URLs |

    E checks include missing/unconfigured policy, policy/reason/confirmation/role denials, required missing/pending/rejected evidence, optional/NA behavior, exact rejected/accepted revisions, native self-review, forged/wrong-project versions, required-policy/evidence supersession, missing/changed storage, Owner-only request, incomplete stage/approval gates, reasoned rejection, final approval, Director-as-Owner, competing Owner requests and approve/reject decisions, replay, expired sessions, request and final-decision outbox rollback, direct retention guards, completed-stage/document/task denial, and unchanged accounts/native completion/Archives.

    Verification found and resolved SQL CASE/alias and UTC-expiry errors, an optional task-ID field assumption in a shared trigger, and project/task lock-order conflicts under concurrent creation and browser Sister reads. Supplemental test fixtures were corrected to initialize their prerequisites. Final required runs have no unresolved failures; earlier failed runs are not reported as passes. Every SQL change was rehearsed in a new disposable cluster, without migration repair/reset against an application database.

14. **Isolated Chromium acceptance.** PASS: **226 assertions, 51 screenshots, zero page errors and zero external requests**, Chromium **153.0.8010.12**, disposable PostgreSQL 14.19. The final production build uses loopback fake S3 and genuine synthetic sign-ins for five business roles plus two technical-only accounts.

    Persisted browser operations cover A–D creation, six Tasker types, inspection/concept evidence, Keep/Modify Sisters and family views, followed by: UNCONFIGURED blocking; explicit Director REQUIRED/OPTIONAL/NOT_APPLICABLE approval; SPM upload; actual JPM rejection; corrected exact-version SPM submission and native self-review acceptance; protected downloads/previews; actual Owner completion request; Director pending queue; reasoned Director rejection; a new Owner request; final Director approval; COMPLETED list/status/history; and late task/document mutation denial. Database assertions confirm actual policy/reviewer/Owner/Director identities, exact accepted version in final evidence, unchanged stage snapshots, no fake legacy completion and no Archive creation.

    The 32 Tasker HTTP errors are intentional negative checks (27×403, 5×400), not unexpected page failures. Runtime completion denial cases are asserted separately. Browser coverage demonstrates the principal persisted lifecycle; concurrency, forced rollback, Director-as-Owner, all six Sister variants and additional policy/evidence attacks are covered in PostgreSQL tests. Runtime external links are unavailable and therefore have no browser expiry/revocation coverage. No live provider, Neon or PostgreSQL 18.6 acceptance is claimed. Evidence: `.tmp/phase44e/browser/result.json`, its 51 PNGs and `server.log`.

15. **Limitations, policy decisions and Phase 4.4F readiness.** E's core runtime lifecycle is implemented and locally verified. Runtime external-link adaptation remains explicitly unsupported as described in item 4; internal submissions satisfy approved requirements without a bypass. There is no unresolved Director-as-Owner policy question. Reopening, post-completion changes, official templates, archive publication, external workers and notifications remain unavailable.

    Exact storage evidence retains the existing Shared File limits: ETags are opaque validators, not invented cryptographic hashes; S3 sealing and PostgreSQL cannot form one distributed transaction, so a failed database commit after a copy can leave an orphan object. No cleanup worker or live storage inspection was added.

    Ready for a separately requested Phase 4.4F review/activation package, subject to its own fresh target/recovery/checksum/data-preservation preflight and explicit migration authorization. This report does not activate the candidate or flags. **Stop at Phase 4.4E.**

Verification artifacts: `.tmp/phase44e/preservation.json`, `integration.log`, `fast-all.log`, `fast-final.log`, `native-after.log`, `authorization.log`, `regressions.json`, `lint.log`, `typecheck-final.log`, `build-result.json`, `catalog.json`, `combined-catalog.json` and `browser/result.json`. The reproducible combined service/migration command is `pnpm runtime-integration:check`; isolated Chromium uses `scripts/stage-runtime-browser-check.mjs` with an isolated build and test-process-only integration flags.
