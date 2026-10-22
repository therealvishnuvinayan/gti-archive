# FLUX V2 Phase 4.3 — Runtime stages, forms, files and approval gates

Implemented and verified on 22 October 2026. **Implementation is complete; development activation is not performed.** Neon remains at 114 successful migrations and 128 public tables. The candidate is unapplied. `FLUX_STAGE_RUNTIME` remains unset/disabled in actual `.env.local`; all nine existing flags remain `1`. No account, permission, live storage, worker, notification, push, deployment or Phase 4.4 action occurred.

**1. Baseline and preservation.** Work began from clean HEAD `d090e8f5b7339ad18a1887e9a86d7ff51ebb0dbd`. The Phase 4.1/4.2 implementation and activation reports, definition/publication services, shared file/approval/event foundations, central authorization, structured/flexible projects and project-governance boundaries were reviewed. Initial and final SELECT-only checks used the known direct development endpoint for `flux-v2-dev / develop / neondb`: PostgreSQL `18.6 (fd34222)`, direct fingerprint `5b001dbfcdb263fa`, pooled fingerprint `9d6f1df51a9db284`. All 128 live table fingerprints and every migration-ledger row match between checks, including nine accounts, password hashes, authorization assignments/history and sessions. Both baseline Prisma drift checks are empty. All 114 historical migration files and `.env`, `.env.local`, `.env.example` retain their starting SHA-256 hashes. No pre-existing file was deleted or staged.

**2. Project/runtime architecture.** `RuntimeProject` is the narrowly typed V2 project adapter. The native structured project path initializes the fixed Artwork sequence; FlexibleProject lacks the full Owner/Co-owner/Executor structure required here. A separate real project identity avoids falsely treating native stages or flexible milestones as configurable runtime stages. No existing project is converted. Native `Project`, `FlexibleProject`, `ProjectWorkflowStage`, Stage 5/6/7 and final-completion services retain their authority and behavior.

A runtime project records its genuine Owner and Director creator separately, with restrictive User references. `RuntimeParticipant` records Co-owners and optional Executors, who added them and when. There is no fictitious Director membership. The current milestone fixes initial relationships; participant editing, transfer and project final closure are unavailable. Executor participation alone grants no stage, file, count or approval access.

**3. Director-only creation.** `/projects/runtime/new` and the direct creation/options APIs require `project.runtimeCreate` through the existing V2 evaluator, plus a current Director session. The service reparses the exact published definition, checks its canonical hash and validation, validates every current active participant, and creates the project, complete ordered stages, creation history and transactional outbox atomically. Creation commands are idempotent. SPM/JPM cannot use this path. Their approved native preset and Director-approved creation governance remains unchanged.

**4. Immutable version binding.** Each project pins the PublishedWorkflowVersion ID, workflow identity, version number, complete approved definition hash, actual creator/time and runtime revision. Each RuntimeStage has its own ID, stable definition-stage ID, order, immutable configuration snapshot, state/revisions and completion actor/time/evidence. Database guards compare initial stage configuration to the exact pinned published snapshot and prevent duplicate stages or binding changes. Publishing version 2 leaves version 1 projects unchanged. Existing runtimes never resolve a mutable latest-template pointer.

**5. Information fields.** The runtime renders short/long text, numbers, dates, approved selects and read-only information, with labels, help, defaults, required indicators and bounds. Server validators enforce approved field IDs, finite numeric/range limits, text lengths, valid calendar dates and select options. Field values are stored under stable field IDs within the stable runtime-stage identity, with actual modifier and timestamp. Read-only values retain their approved default, including through forged direct APIs and SQL guards. Arbitrary columns, paths, extra authority properties and stale revisions are rejected. Required values may be initially absent but block readiness until supplied.

**6. Checklists and files.** Each configured checklist group/item has an actual completion projection, text or exact-version evidence, actor/time and retained history. Required evidence cannot be replaced by a checked box. File evidence must belong to the same stage and satisfy its configured acceptance rule.

File requirements use existing SharedFile, SharedFileVersion, SharedFileReference and S3 helpers. A RuntimeFileSubmission anchors the exact version and stage/capability, uploader, replacement lineage, upload state, reviewer/reason/time and failures. Counts and allowed MIME/extension declarations are checked. Upload targets address only a staging key; finalization conditionally copies the observed object into a sealed key, verifies metadata/integrity, then commits READY submission evidence. An acceptance-required upload stays insufficient until an independent configured reviewer explicitly accepts it. OWNER requires the actual Owner; REVIEWER requires an authorized manager or Director. No one can accept their own upload. Rejections and replacements retain old versions and reviewers; a replacement never inherits approval. An in-flight or failed replacement blocks readiness.

Protected downloads reauthorize the actual runtime project/stage and exact version, then use the existing conditional pinned-object reader. Historical rejected versions remain available only to currently authorized managers. No cross-stage/project file links, Tasker folder grants, Archive/Library publication or second storage implementation is added. An opaque ETag is explicitly described as a storage validator, not a cryptographic checksum.

**7. Ordered approval-engine adapter.** `approvals/runtime-stage.ts` registers the explicit `RUNTIME_STAGE` subject in the existing decision engine. RuntimeApprovalSubmission binds the stable stage, configured approval capability, evidence revision, immutable snapshot/hash, real requester and exact ApprovalRequest. Shared ApprovalStep, ApprovalEvidence, ApprovalDecision and ApprovalEvent records remain authoritative. Runtime approvals never fabricate completion-document subjects or events.

One to twelve configured steps execute in order using `DIRECTOR`, `SENIOR_PROJECT_MANAGER`, `PROJECT_OWNER` and `PROJECT_CO_OWNER`. Each decision checks the genuine current role/session, actual project relationship, precise configured step, snapshot/hash, revision and immutable file evidence. Explicit confirmation and a reason are required. Requesters and current field/checklist/file contributors cannot approve their own evidence, including Directors. The special workflow-publication self-decision exception is not reused. Native completion-document subjects retain their original one-to-eight-step limit and policies.

RETURN_FOR_CHANGES retains the rejection and requires a persisted evidence correction before fresh submission. BLOCK_STAGE leaves the stage blocked with no reopening/skip operation. Evidence changes supersede pending approvals and make prior approvals ineligible for new completion evidence. All approval native activity and shared events/outbox commit together; no automatic reviewer, notification or external consumer is registered.

**8. Readiness and progression.** The server ANDs required information, required checklist/evidence, active file counts/acceptance, approval capabilities that gate progression and explicitly configured preceding-stage dependencies. Ordering alone adds no predecessor gate. The UI distinguishes UNAVAILABLE, AVAILABLE, IN_PROGRESS, READY_FOR_COMPLETION, BLOCKED and COMPLETED. Completion is an explicit, reasoned, authorized command. It rechecks readiness, file observations and evidence under the project lock. A database readiness guard reinforces completion. Completed stages and their exact completion evidence are immutable; no skip/reopen API exists.

**9. Final project boundary.** Completing the last configured stage leaves RuntimeProject ACTIVE. It does not create a ProjectFinalCompletionRequest, grant final Director approval, complete a native Stage 7 workflow or archive anything. The UI states that final project closure is unavailable pending the separately reviewed Phase 4.4 adapter. Existing mandatory completion documents and native final-completion governance are not bypassed.

**10. Authorization and UI.** Central resource policies add Director-only creation and manager-scoped runtime list/read/manage capabilities. Director has global business access with truthful actor attribution. SPM/JPM require actual ownership or Co-ownership. Designers, Digital Leads, technical-only users and unrelated managers receive no runtime-stage access, including through direct URLs, list/count/search, downloads, upload tickets or commands. New routes stop before runtime-table queries while the flag is disabled.

The existing Projects and published-definition navigation links to a separate runtime workspace. It provides the pinned version, ordered stage navigation, forms, checklist evidence, upload/rejection/replacement/review, ordered approval snapshots and decisions, gate explanations, explicit completion and the latest 100 activity records. Earlier history remains retained. Definition previews, published versions, active stages and immutable completed stages are distinguished. Desktop/mobile browser acceptance used actual persisted projects, submissions and approvals. Inputs have accessible labels and errors; native controls support keyboard use. No exhaustive assistive-technology certification is claimed.

**11. Audit, concurrency and integrity.** RuntimeActivity is an append-only command/result and evidence history with real actor/role/authorization version/session, sequence, timestamp and native BusinessEvent reference. `RUNTIME_ACTIVITY` events carry only action and stable stage identity; they exclude field values, reasons, filenames, sessions and storage locators. The existing outbox, strict decoder, fake internal dispatcher and receipt deduplication are reused.

Authorization assignment/session locks protect current authority. A project-root row lock serializes stage, file, approval and completion mutations. Expected stage revisions reject stale writers. Actor/command advisory locks plus command hashes reject conflicting replay and make exact retries idempotent; approval replay rechecks current eligibility. Restrictive FKs, unique identities, immutable guards and deferred consistency checks bind project participants, stage/file projections, approval history and outbox to actual native activity. Forced late outbox failure rolls the business mutation and history back. No blind business-operation retry is added.

**12. Migration and database inventory.**

```text
prisma/migrations/20261023030000_stage_runtime/migration.sql
SHA-256: 7561f1b249489281a37ff356bbcda514092332fa0973482a5ee943aab5b213b8
```

The single additive candidate uses explicit BEGIN/COMMIT, a five-second lock timeout and sixty-second statement timeout. There is no business-data seed, historical conversion or backfill. Populated disposable testing produced **115 successful migrations and 134 public tables including the Prisma ledger, with no failed/pending migration or Prisma drift**. Neon remains at the approved 114/128 baseline; this candidate is the sole new local unapplied migration.

| New table | Columns | Purpose |
| --- | ---: | --- |
| RuntimeProject | 12 | Actual V2 project, ownership and immutable version binding |
| RuntimeParticipant | 6 | Initial Co-owners/Executors and genuine attribution |
| RuntimeStage | 13 | Configured stage, field/checklist projections and immutable completion |
| RuntimeFileSubmission | 15 | Exact file version, replacement, review and upload failure state |
| RuntimeApprovalSubmission | 10 | Native immutable stage approval subject/evidence |
| RuntimeActivity | 15 | Command, actor, evidence history and event anchor |

Verified new-table inventory: **19 indexes including six primary keys, 20 restrictive foreign keys, six checks, seven functions and nineteen enabled triggers**. Two FKs are initially deferred: runtime approval → ApprovalRequest and runtime activity → BusinessEvent.

Existing-model additions are nullable `SharedFile.runtimeStageId` and nullable unique `SharedFileReference.runtimeSubmissionId`, with two additional restrictive FKs, one additional unique index and one new origin check. Total additions therefore include 20 indexes, 22 FKs and seven checks. Four existing checks are extended: ApprovalRequest subject shape, ApprovalStep subject-specific limit, SharedFileReference single native source and BusinessEvent typed contract. Three existing enums each gain one value. No existing column is removed, renamed or made less restrictive.

New functions: `flux_runtime_authorized`, `flux_runtime_ready`, `flux_runtime_guard`, `flux_runtime_consistency`, `flux_emit_runtime_event`, `flux_runtime_approval_write`, `flux_runtime_approval_consistency`. Four existing functions gain a typed runtime branch while retaining previous branches: `flux_approval_write_guard`, `flux_approval_consistency_guard`, `flux_event_write_guard`, `flux_shared_file_reference_guard`. The nineteen triggers are six row guards, six truncate guards, six deferred consistency guards and one event producer.

**13. Compatibility and preservation verification.** Existing Tasker code changes are explicit legacy file-column projections needed for the new generated client to work before runtime activation; no Tasker destination, review rule or stage adapter is added. Historical schema reconstruction and migration/browser runners now exclude runtime additions at their earlier baselines. Existing assertions remain intact. Populated rehearsals compare every pre-existing column/row and prior ledger checksum; the two new nullable file columns are separately empty. Fixtures include all six completed Tasker types, Sisters/exact file versions, published workflow versions and approval history, plus native structured/flexible projects. The separate broad suite preserves accepted/rejected completion documents, file provenance, events/outbox delivery and Archive/Library data across the new migration.

**14. Verification results.**

| Check | Final result |
| --- | --- |
| Full TypeScript, `pnpm exec tsc --noEmit --project tsconfig.typecheck.json --incremental false` | PASS |
| Targeted ESLint, 41 changed TS/TSX/MJS files, `--max-warnings 0` | PASS |
| Prisma validation/generation and populated migration/drift | PASS |
| Isolated production build, Next.js 16.2.6 / Prisma 6.19.3 | PASS; dummy unreachable DB URLs, no environment files or live credentials |
| `pnpm run stage-runtime:check` | PASS; six Tasker types, Sisters, drafts, publication, 114-schema flag-off compatibility, populated 114→115 rehearsal and 503 runtime assertions |
| Workflow publication integration | PASS, 402 assertions in final run; concurrency outcome changes event-count-dependent totals |
| Broad authorization/administration/project/file/approval/event/Archives/Library suite | PASS, 112 checkpoints |
| Authorization foundation/persistence; approval/event/Tasker units | PASS |
| Repaired legacy task runner | PASS, 123 assertions |
| Repaired legacy concept completion runner | PASS, 886 assertions across seven suites; concurrency affects totals |
| Stage 5 UI runner | PASS, 94 source assertions + 30 isolated checkpoints |
| Stage 6 UI runner | PASS, 73 + 21 |
| Stage 7 UI runner | PASS, 81 + 29 |
| Concept UI runner | PASS, 54 + 21 |
| Git whitespace / all prior migration / environment preservation checks | PASS |

The four UI runners total 302 source assertions and 101 overlapping isolated checkpoints. The runtime suite includes independent eligible-SPM self-review denial, twelve ordered SPM/Co-owner/Director steps, blocking rejection, typed validation, file failure/replacement/conditional reads, pending supersession, explicit dependency versus ordering, stale authorization version/session, concurrent writes, exact/conflicting replay, immutable history, forced rollback and real outbox delivery through a fake in-process consumer.

**15. Browser acceptance.** Chromium 153.0.8010.12 ran against fresh private PostgreSQL clusters and a loopback fake S3 server, with browser/Node external-network guards. The app used copied production output and synthetic logins.

| Browser fixture | Assertions | Screenshots | Result |
| --- | ---: | ---: | --- |
| Runtime, 115 migrations | 72 | 16 | PASS: Director UI creation, genuine JPM form/checklist/upload/execution, SPM exact file review, independent ordered SPM/Director approval, rejection/correction/resubmission, immutable completion and mobile layout |
| Publication, runtime disabled on 114 migrations | 57 | 16 | PASS |
| Draft editor, publication/runtime disabled on 113 migrations | 61 | 14 | PASS |

Runtime browser denials cover unrelated SPM, Designer executor, Digital Lead and both technical-only accounts for page/API/file access. SPM/JPM creation and options enumeration are denied. Direct read-only-field, select, date, number, prerequisite and completed-stage mutation attempts are denied. Final-stage completion leaves the project ACTIVE with no final completion request or archive. Every browser suite reports **zero page errors and zero blocked external attempts**. All synthetic account/password/role snapshots are preserved.

Evidence root: `.tmp/phase43-kun0acme/`. Final integration log: `runtime-final.log`; browser receipts: `browsers-result.json`; runtime screenshots and receipt: `runtime-browser/`; legacy browser receipts: `publication-disabled-runtime114/`, `drafts-disabled113/`; all regression logs/exit receipts: `regressions-result.json`; production output/receipt: `build.log`, `build-result.json`; type/lint logs: `typecheck-final.log`, `lint-final.log`; hashes, manifest and combined results: `verification-summary.json`, `final-verification.json`. Live read-only evidence: `neon-before.json`, `neon-final.json`, `neon-preservation.json`, empty baseline diff SQL and `flags.json`. These are ignored local artifacts, not committed fixtures or production data.

**16. Operational limits and deferred scope.** Disposable execution used PostgreSQL 14.19; the candidate has not executed on Neon PostgreSQL 18.6. Provider recovery and live storage/IAM/versioning were not exercised; fresh recovery/lock/target/checksum preflight is required before activation. Database owner/schema-administrator tampering is outside application trigger protection.

S3 and PostgreSQL are not atomic. Failed storage finalization records FAILED where the database can commit; a database failure after copying can leave an uncommitted sealed object and an UPLOADING intent. Authorized users can inspect the recorded state, cancel a pending upload and submit an explicit replacement. There is no automatic cleanup or retry worker. Upload targets are bounded staging permissions; sealed keys are not exposed as upload destinations. Object loss or changed integrity fails reads/completion closed. Real S3 throughput, retention and recovery remain operational acceptance work. Uploads are capped at 100 MiB or the smaller existing application limit; JSON command requests retain the shared bounded-body limit.

Creation options show up to 100 recent published versions; runtime lists paginate 30 projects; workspace history shows the latest 100 entries. Management-only access is intentional. Workflow configurations must have genuinely eligible independent reviewers; Director intervention does not waive configured review/self-review boundaries. RETURN_FOR_CHANGES requires a persisted correction, while BLOCK_STAGE intentionally has no recovery UI in this phase.

Deferred: Tasker-driven stage uploads, generic runtime Data Input targets, automatic tasks, SPM/JPM new-template creation governance, standard GTI templates, participant changes, stage reopening/skipping, new final-project closure adapters and external consumers. No Phase 4.4 implementation was started.

**17. Activation recommendation.** Ready for a separate controlled Phase 4.3 development-activation preflight and explicit approval of this exact migration/checksum. Repeat development identity, all 114 checksums, baseline drift, recovery, data fingerprints and lock checks before any approved execution. Keep `FLUX_STAGE_RUNTIME` disabled until that migration and preservation verification are separately approved and complete. This report grants no migration, activation, deployment or Phase 4.4 authorization.

**Exact file inventory.** 23 created files, including this report; 23 modified files. Generated clients, disposable data, screenshots and logs are ignored artifacts.

Created:

- `prisma/migrations/20261023030000_stage_runtime/migration.sql`
- `scripts/stage-runtime-browser-check.mjs`
- `scripts/stage-runtime-integration-check.ts`
- `src/app/(dashboard)/projects/runtime/[id]/page.tsx`
- `src/app/(dashboard)/projects/runtime/new/page.tsx`
- `src/app/(dashboard)/projects/runtime/page.tsx`
- `src/app/api/runtime-projects/[id]/route.ts`
- `src/app/api/runtime-projects/[id]/stages/[stageId]/files/[versionId]/route.ts`
- `src/app/api/runtime-projects/[id]/stages/[stageId]/route.ts`
- `src/app/api/runtime-projects/[id]/stages/[stageId]/uploads/[submissionId]/route.ts`
- `src/app/api/runtime-projects/options/route.ts`
- `src/app/api/runtime-projects/route.ts`
- `src/components/projects/stage-runtime-entry.tsx`
- `src/components/projects/stage-runtime.tsx`
- `src/lib/approvals/runtime-stage.ts`
- `src/lib/authorization/stage-runtime-policies.ts`
- `src/lib/stage-runtime/PHASE-4.3.md`
- `src/lib/stage-runtime/activation.ts`
- `src/lib/stage-runtime/contracts.ts`
- `src/lib/stage-runtime/data.ts`
- `src/lib/stage-runtime/files.ts`
- `src/lib/stage-runtime/http.ts`
- `src/lib/stage-runtime/service.ts`

Modified:

- `package.json`
- `prisma/schema.prisma`
- `scripts/file-identity-integration-check.ts`
- `scripts/run-authorization-isolated-integration.mjs`
- `scripts/run-universal-tasker-isolated.mjs`
- `scripts/stage-builder-browser-check.mjs`
- `scripts/tasker-schema-baseline.mjs`
- `scripts/tsconfig.universal-tasker.json`
- `scripts/workflow-publication-browser-check.mjs`
- `src/app/(dashboard)/projects/page.tsx`
- `src/app/(dashboard)/projects/published-workflows/page.tsx`
- `src/components/projects/workflow-publication.tsx`
- `src/lib/approvals/engine.ts`
- `src/lib/authorization/definitions.ts`
- `src/lib/authorization/eligibility.ts`
- `src/lib/authorization/policy.ts`
- `src/lib/authorization/runtime.ts`
- `src/lib/events/contracts.ts`
- `src/lib/files/legacy-select.ts`
- `src/lib/stage-builder/publication-contracts.ts`
- `src/lib/tasker/applications.ts`
- `src/lib/tasker/concepts.ts`
- `src/lib/tasker/service.ts`
