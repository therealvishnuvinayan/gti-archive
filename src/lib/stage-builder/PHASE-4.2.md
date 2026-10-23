# Phase 4.2 — Director approval and immutable published workflow versions

Implemented and verified locally on 22 October 2026. **Publication remains disabled in actual development. No migration was applied to Neon.** This milestone adds definition governance and a read-only catalog; it does not add project creation or configurable stage execution.

The user explicitly resolved the Director-authored policy: **allow an explicit Director decision**. A Director may submit and subsequently approve their own definition with confirmation and a mandatory reason. Creation, a VALID status, and submission never publish automatically. Tasker and native document self-review safeguards remain unchanged.

## Submission, decisions, and version guarantees

SPMs may submit their own drafts; the Director has global draft authority. Submission requires the current saved revision, matching canonical SHA-256, complete server-side validation, an intended project classification, and a nonempty change summary. The server reparses the definition and recomputes its hash. Actor IDs, approval plans, version numbers, and publication status cannot be supplied by the client.

`WorkflowPublicationSubmission` pins the immutable `WorkflowDraftRevision`, actual submitting actor/role/authorization version/session, submission time, command identity/hash, classification, change summary, and preceding published version. Its unique revision reference permits one review per revision. Revising and resubmitting after rejection creates fresh evidence.

The existing `ApprovalRequest`, `ApprovalStep`, `ApprovalDecision`, and `ApprovalEvent` tables remain the approval authority. `WORKFLOW_DRAFT_REVISION` is an explicit configuration-only subject with the fixed server policy `workflow-publication.director.v1`: one Director step. Its immutable subject snapshot contains the exact definition and attribution; its evidence hash covers that snapshot and policy. It has no completion-document subject, native completion event, or fabricated `SharedFileVersion` evidence.

Both completion-document and workflow decisions use `decideTypedApproval` in `approvals/engine.ts`. The completion adapter retains its native mutation, event preparation, ordered review, replay, and finalization safeguards. New nullable native-document references on `ApprovalRequest` are protected by a subject-specific database check: all three remain mandatory for completion-document subjects and absent for workflow subjects.

Only the current genuine V2 Director may decide a workflow request. The API requires explicit confirmation, a nonempty reason, the pinned configuration hash, and the exact request/step/revision/evidence expectation. Current account, role, authorization version, session, resource permission, and source revision are checked again. Approval also checks and locks the submitter's current authorization assignment. If that assignment changed, approval is blocked; an authorized author must save and submit a fresh revision, or the Director may reject the old pending request.

Approval creates a `PublishedWorkflow` identity equal to its source workflow ID and an immutable `PublishedWorkflowVersion`. Each version retains its own immutable ID and contiguous number, complete approved definition/hash, source revision, original author, actual submitter and Director, request/decision IDs, approval reason/time, publication time, schema/validation status, classification, and native publication-event reference. Latest is derived from immutable version history, not a mutable definition pointer.

The workflow row is locked before request mutation, serializing submission, edit, supersession, and decision. An edit automatically supersedes a pending older review through a native revision trigger, including when publication is subsequently disabled. The supersession records the exact newer revision and actual editor. Approved older versions remain unchanged. Stale, superseded, rejected, and separately replayed decisions cannot publish. Exact authenticated command replay returns the original result; concurrent commands cannot create duplicate versions. Failed transactions leave no version gap.

Database guards prohibit updates, deletion, and truncation of publication identities, submissions, versions, and native audit records. Deferred consistency checks require the complete shared approval, native evidence, and publication to commit together. New immutable FKs use restrictive update/delete behavior; three cyclic request/event references are initially deferred.

## Authorization, audit, and interface

Central V2 resource policies authorize Director global access and SPM-owned submissions. Published definitions are readable by Director and SPM management users. Queue results and pending counts use the same ownership scope. JPM, Designer, Digital Lead, technical-only users, unauthenticated users, and legacy role/profile authority do not gain authoring, review, or publication access. Direct APIs and services enforce this independently of visible links.

`WorkflowPublicationAudit` anchors shared approval events to genuine actor/session evidence and, for supersession, the newer immutable revision. Four native event types are emitted transactionally:

- `WORKFLOW_PUBLICATION_SUBMITTED`
- `WORKFLOW_PUBLICATION_SUPERSEDED`
- `WORKFLOW_PUBLICATION_DECIDED`
- `WORKFLOW_VERSION_PUBLISHED`

Their generic payloads contain only the action, workflow/revision/request IDs, safe configuration hash, and publication ID/number when applicable. They exclude full definitions, decision reasons, credentials, session IDs, emails, and storage locators. Existing shared event guards and strict decoder support the new types without weakening the completion, Tasker, or draft branches. Each event creates an `internal.audit.v1` outbox row in the same transaction. Only the existing fake in-process dispatcher was exercised; no external worker, notification, email, or webhook was activated.

The Stage Builder now exposes submission, validation warnings, status, Director feedback, revision resubmission, published history, and a side-by-side comparison with the latest approved definition. Pending edits preserve the existing stale-save behavior. Saved text inputs/textareas have explicit accessible labels. Publication-disabled pages retain the Phase 4.1 experience.

Projects links to **Workflow Approvals** for Director, **My workflow submissions** for SPM, and the management catalog. The queue supports status filters and bounded pagination. Reviews show the exact immutable revision/hash, author/editor/submitter, time, change summary, ordered stages, information fields, files, checklists, approvals, gates, validation, reasoned decision, and audit history. Review wording distinguishes pending evidence from approved publication.

The read-only catalog provides current and historical versions, metadata, approval attribution/reason, validation/schema version, evidence IDs, and complete definition previews. Queue/catalog/history pages paginate in groups of 30; the draft panel shows the latest 50 submissions with a link to the complete scoped queue. Published definitions explicitly state that project creation and stage execution are unavailable. There is no project-creation action or executable template integration.

## Migration and inactive feature flag

Candidate: `prisma/migrations/20261023020000_workflow_publication/migration.sql`

SHA-256:

```text
6552870889a39ad1605678671c8a4671ac242ef062c823045ff8ec0fb6ec2c62
```

| Item | Verified disposable result |
| --- | --- |
| Successful migrations | 113 → 114 |
| Public tables, including Prisma ledger | 124 → 128 |
| Failed or unapplied candidate migrations | 0 |
| New tables | `WorkflowPublicationSubmission`, `WorkflowPublicationAudit`, `PublishedWorkflow`, `PublishedWorkflowVersion` |
| New indexes | 18, including four primary-key indexes |
| New foreign keys | 18, all validated; three initially deferred |
| New checks | 3; two existing subject/event checks extended |
| New functions | 6 |
| Existing functions extended | `flux_approval_write_guard`, `flux_approval_consistency_guard`, `flux_event_write_guard` |
| New triggers | 15 enabled: 12 retention/consistency guards, one supersession trigger, two event emitters |
| Schema drift | 0 |
| Historical backfill / automatic publication | 0; all four new tables empty immediately after migration |

The six new functions are `flux_workflow_actor_current`, `flux_workflow_publication_guard`, `flux_workflow_approval_consistency`, `flux_workflow_publication_consistency`, `flux_workflow_supersede_review`, and `flux_emit_workflow_publication_event`.

The migration is transactional and specifies a five-second local lock timeout and 60-second statement timeout. Existing tables receive no new scalar columns; only three approval-reference nullability constraints are generalized with the compensating typed-subject check. Consequently the new generated Prisma client can still select and insert existing models on the 113-migration schema.

`FLUX_STAGE_BUILDER_PUBLICATION=1` is the separate activation switch. It also requires `FLUX_STAGE_BUILDER_DRAFTS`, `FLUX_APPROVAL_ENGINE`, and `FLUX_SHARED_EVENTS`. **It is absent/disabled in actual `.env.local`.** Actual `.env`, `.env.local`, and `.env.example` remain byte-for-byte unchanged. A fresh process using Next's environment loader confirmed all eight existing flags still load as `1`, and publication remains off. New services and pages stop before querying publication tables when disabled.

## Verification and preservation

All database and browser tests used disposable PostgreSQL **14.19 (Homebrew)**, private Unix sockets with TCP disabled, synthetic V2 accounts, and fake external services. Browser acceptance used Chromium **153.0.8010.12** and an isolated production build. Actual development remains the previously verified Neon PostgreSQL 18.6 baseline; this task made no Neon connection or migration attempt.

The populated migration rehearsal compared complete canonical rows in every existing table and retained migration-ledger entries before/after. Its fixtures include existing workflow drafts/revisions, all six Tasker types, Sister families, native project stages, file provenance, events/outbox records, and account assignments. A separate populated approval/event rehearsal also preserved accepted/rejected decisions, completion-document history, exact file versions, event deliveries, and all 119 preceding tables. No historical row or previous migration checksum changed. Prisma reported an empty migration after each completed rehearsal.

| Verification | Result |
| --- | --- |
| Full application TypeScript: `pnpm exec tsc --noEmit --project tsconfig.typecheck.json` | PASS; required integration runners also compile their TypeScript |
| Targeted ESLint, all changed/new TS/TSX/MJS, `--max-warnings 0` | PASS |
| Isolated Next.js production build, no actual environment files | PASS |
| `stage-builder:publication-check` | PASS, including all six Tasker types, Sisters, Phase 4.1 regressions, populated migrations, 113-schema feature-off check, and **414 publication assertions** |
| Authorization/governance/administration/workspace/project read/write, file identity, approvals, events, Archives, Library, completion documents | PASS, **112 named checkpoints** |
| Authorization foundation/persistence, approval units, event units, Tasker/Sister units | PASS |
| Repaired legacy task runner | PASS, **123 assertions** across its two suites |
| Repaired legacy concept runner | PASS, **885 assertions** across seven suites |
| Stage 5 UI runner | PASS, **94 source assertions + 30 isolated checkpoints** |
| Stage 6 UI runner | PASS, **73 source assertions + 21 isolated checkpoints** |
| Stage 7 UI runner | PASS, **81 source assertions + 29 isolated checkpoints** |
| Concept UI runner | PASS, **54 source assertions + 21 isolated checkpoints** |
| Publication Chromium acceptance | PASS, **57 counted assertions, 16 screenshots**, zero page errors or external requests |
| Phase 4.1 Chromium on exactly 113 migrations, all eight existing flags enabled and publication disabled | PASS, **61 counted assertions, 14 screenshots**, zero page errors or external requests |

The publication integration checks cover invalid/incomplete and unclassified submissions, forged actor/plan/version inputs, exact snapshot/hash approval, rejection feedback, revision resubmission, automatic supersession, immutable v1/v2, explicit Director-authored decisions, concurrent approve/reject, concurrent replay, stale hashes/revisions, expired/invalidated/current-role sessions, SQL mutation/deletion/truncation denial, safe catalog metadata, and exact event decoding. Injected submission and late-publication outbox failures roll back the entire request/decision/version/audit/event transaction; a subsequent successful transaction uses version 1 without a gap. Fake dispatcher delivery produces one receipt and rejects duplicate delivery.

Browser acceptance exercises the actual SPM editor/submission, Director queue and full preview, mandatory reason/confirmation, approval, rejection, feedback, revision and supersession, stale open review, version history, draft comparison, Director-authored explicit publication, management catalog, mobile layout, and direct role/ownership/API denials. It verifies no project, runtime stage, native file evidence, or legacy preset is created. The separate feature-off run exercises the full Phase 4.1 editor and verifies publication endpoints return 404 while the publication table is absent.

Existing Director direct project creation, SPM approved executable Artwork preset creation, JPM approval/SPM Co-owner requirements, Director final completion, template-proposal governance, Stage 5/6/7/concept rules, all six Tasker types, Sister Tasks, and Archive/Library authorization passed their regressions. Publication neither alters those services nor adds a new executable project-creation choice.

Local evidence is retained in ignored `.tmp/phase42-pmQiMv/`: `publication-integration.log`, `authorization.log`, individual unit/legacy/UI logs, `ui-results.json`, `build-result.json`, `build.log`, `typecheck.log`, `eslint.log`, `local-flags.json`, `change-inventory.json`, and `final-verification.json`. Browser results/screenshots are under `publication-browser/` and `drafts-browser-113/`. Counts above are reported separately because named checkpoints and assertion counters measure different things.

## Remaining policy and activation boundary

Retirement, revocation, deletion, approval expiry, future cross-owner draft derivation from a published catalog item, and standard-template designation are deferred. Published evidence is retained; there is no automatic retirement or revocation. New project instances must eventually pin one exact immutable version, but no runtime or project-stage integration is implemented here.

The implementation is ready for a **separate controlled Phase 4.2 development activation review**. Keep the flag disabled until that process authorizes the exact candidate checksum and repeats database identity, endpoint, all 113 checksums, drift, recovery, preservation, and lock checks. The disposable tests here used PostgreSQL 14.19; PostgreSQL 18.6 execution has not been rehearsed in this task and should be verified in the activation preflight. This report does not authorize applying the migration or enabling the flag.

No development accounts, live S3 objects, actual environment files, or prior Phase 4.1 activation report were modified. No push, deployment, external worker, Phase 4.3/4.4 execution integration, or Phase 5 standard-template work occurred.

## Exact file inventory

**Created (25):**

- `prisma/migrations/20261023020000_workflow_publication/migration.sql`
- `scripts/workflow-publication-browser-check.mjs`
- `scripts/workflow-publication-integration-check.ts`
- `src/app/(dashboard)/projects/published-workflows/[id]/page.tsx`
- `src/app/(dashboard)/projects/published-workflows/page.tsx`
- `src/app/(dashboard)/projects/workflow-approvals/[id]/page.tsx`
- `src/app/(dashboard)/projects/workflow-approvals/page.tsx`
- `src/app/api/published-workflows/[id]/route.ts`
- `src/app/api/published-workflows/route.ts`
- `src/app/api/workflow-approvals/[id]/decision/route.ts`
- `src/app/api/workflow-approvals/[id]/route.ts`
- `src/app/api/workflow-approvals/route.ts`
- `src/app/api/workflow-drafts/[id]/publication/route.ts`
- `src/app/api/workflow-drafts/[id]/submit/route.ts`
- `src/components/projects/workflow-publication.tsx`
- `src/lib/approvals/engine.ts`
- `src/lib/approvals/workflow.ts`
- `src/lib/authorization/workflow-publication-policies.ts`
- `src/lib/stage-builder/PHASE-4.2.md`
- `src/lib/stage-builder/hash.ts`
- `src/lib/stage-builder/publication-activation.ts`
- `src/lib/stage-builder/publication-contracts.ts`
- `src/lib/stage-builder/publication-http.ts`
- `src/lib/stage-builder/publication-page.ts`
- `src/lib/stage-builder/publication.ts`

**Modified (19):**

- `package.json`
- `prisma/schema.prisma`
- `scripts/approval-engine-integration-check.ts`
- `scripts/run-authorization-isolated-integration.mjs`
- `scripts/run-universal-tasker-isolated.mjs`
- `scripts/stage-builder-browser-check.mjs`
- `scripts/tasker-schema-baseline.mjs`
- `scripts/tsconfig.universal-tasker.json`
- `src/app/(dashboard)/projects/workflow-drafts/[id]/page.tsx`
- `src/components/projects/stage-builder-entry.tsx`
- `src/components/projects/stage-builder.tsx`
- `src/lib/approvals/completion.ts`
- `src/lib/approvals/service.ts`
- `src/lib/authorization/definitions.ts`
- `src/lib/authorization/eligibility.ts`
- `src/lib/authorization/runtime.ts`
- `src/lib/events/contracts.ts`
- `src/lib/stage-builder/http.ts`
- `src/lib/stage-builder/service.ts`

`src/lib/stage-builder/PHASE-4.1-ACTIVATION.md` was already untracked at the start and remains byte-for-byte unchanged; it is not a Phase 4.2 creation. HEAD and the staging area remain unchanged. All 113 prior migration SQL files retain their original SHA-256 checksums.
