# FLUX V2 — Phase 4.1: reusable stage definitions and Custom Stage Builder

Verification follow-up (2026-10-22): [verification closure and read-only activation preflight](./PHASE-4.1-PREFLIGHT.md) repairs the four legacy UI runners listed below, reruns the required regressions/browser acceptance, and independently verifies Neon. It supersedes the outstanding verification-debt status in this implementation-time report. Migration and feature activation still require separate approval.

Implemented on 2026-10-21. The working draft editor is available at `/projects/workflow-drafts` when `FLUX_STAGE_BUILDER_DRAFTS=1` is deliberately set in an isolated or later approved environment. **The actual local flag remains unset/disabled.** No Neon migration, project activation, publication, account change, S3 operation, push or deployment was performed. Phase 4.2 has not begun.

The Phase 3.4 activation/preflight reports were reviewed. They document `flux-v2-dev / develop / neondb`, PostgreSQL 18.6, 112 successful migrations and 122 public tables. This implementation did not reconnect to Neon; that remote state is the previously verified baseline, not a new live verification. All database mutation and browser testing below used fresh private PostgreSQL 14.19 clusters, synthetic accounts and fake storage/consumers. The 112 original migration files, `.env`, `.env.local`, `.env.example`, and both pre-existing staged Phase 3.4 reports retain their exact starting SHA-256 hashes. All seven existing local feature flags remain enabled.

**1. Files.** This change creates 15 files and modifies 13. Generated clients, builds, temporary fixtures, logs and screenshots are ignored artifacts. The two already-staged Phase 3.4 reports were not edited or restaged.

Created:

- `prisma/migrations/20261023010000_stage_builder_drafts/migration.sql`
- `scripts/stage-builder-integration-check.ts`
- `scripts/stage-builder-browser-check.mjs`
- `src/lib/stage-builder/contracts.ts`
- `src/lib/stage-builder/service.ts`
- `src/lib/stage-builder/http.ts`
- `src/lib/stage-builder/PHASE-4.1.md`
- `src/lib/authorization/stage-draft-policies.ts`
- `src/components/projects/stage-builder.tsx`
- `src/components/projects/stage-builder-entry.tsx`
- `src/app/(dashboard)/projects/workflow-drafts/page.tsx`
- `src/app/(dashboard)/projects/workflow-drafts/[id]/page.tsx`
- `src/app/api/workflow-drafts/route.ts`
- `src/app/api/workflow-drafts/[id]/route.ts`
- `src/app/api/workflow-drafts/[id]/clone/route.ts`

Modified:

- `package.json` — reproducible integration/browser commands.
- `prisma/schema.prisma` — draft identity/revisions, inverse relations and typed event value.
- `src/lib/authorization/runtime.ts` — registers the draft resource policy in the existing evaluator.
- `src/lib/events/contracts.ts` — strict draft event decoder in the existing event union.
- `src/app/(dashboard)/projects/page.tsx` — flag- and policy-protected management entry in structured/flexible views.
- `scripts/tsconfig.universal-tasker.json` — compiles draft integration coverage.
- `scripts/tasker-schema-baseline.mjs` — reconstructs earlier schemas without draft-only additions.
- `scripts/run-universal-tasker-isolated.mjs` — optional Phase 4.1 populated migration and integration rehearsal.
- `scripts/run-authorization-isolated-integration.mjs` — preserves earlier populated event/approval snapshots while checking the new expected counts.
- `scripts/universal-tasker-browser-check.mjs` — current migration count and optional 112-schema compatibility run.
- `scripts/tasker-deliverables-browser-check.mjs` — current migration count.
- `scripts/tasker-concepts-browser-check.mjs` — current migration count.
- `scripts/tasker-sisters-browser-check.mjs` — current migration count.

**2. Existing architecture and source preservation.**

| Existing implementation | Finding and Phase 4.1 treatment |
| --- | --- |
| `project-workflow.ts`, `ProjectWorkflowStage` | Fixed enum keys, seven named stages and completed-prefix/available-stage/locked-suffix sequencing. Native project runtime only; not used as the new definition sequence. |
| `ProjectStage`, concept folders, native Stage 3/4 | Historical concept tasks, executor/reviewer state and handoffs stay native. Initial Concept and Final Concept remain Universal Tasker types, never mandatory stages in a new draft. |
| Stage 1 forms; Stage 2 research/private workspaces | Existing forms, briefs and protected folder services are useful source material, but their concrete tables/paths are not exposed through the draft schema. |
| `stage-five-fields.ts`, `stage-five.ts`, `ProjectFileChecklist*` | Existing field/control vocabulary, native evidence/status and request/response semantics inform the typed approach. The generic editor neither calls those writers nor imports their fixed checklist as a standard template. |
| `stage-six.ts`, production units and approval steps | Native production recipient, ordered approval/version and decision-integrity rules stay intact. No new adapter into this runtime. |
| `stage-seven.ts`, final completion governance | Native sample, supervision and sign-off prerequisites remain; Director remains final project-completion authority. |
| Flexible projects/milestones/attachments/notes | Existing project relationships and flexible milestone workspaces stay independent; no milestone receives these definitions automatically. |
| `tasker/targets.ts` | Data Input currently resolves only explicit native checklist/private-folder/research-folder targets, rechecks authority and expected state, and does not grant stage access to an executor. No new target was registered. |
| Shared File Identity, Reusable Approvals, shared events | Exact version/evidence contracts and native transactional adapter pattern are reused as boundaries. Only the event foundation gains an executable adapter in this milestone. |
| `project-governance/preset.ts`, `LegacyProjectPresetApproval`, `ProjectTemplateProposal` | The hash-approved seven-stage Artwork compatibility preset and its immutable proposal/decision history remain unchanged. A draft is neither an approved preset nor a submitted template proposal. |
| Projects management navigation and centralized V2 policy | The editor uses the existing DashboardLayout and Projects entry, with live authorization at page, service and API boundaries. |

Reviewed source documentation includes `authorization/README.md`, `PHASE-1-COMPLETION.md`, `PROJECT-GOVERNANCE.md`, the current authorization implementations, `files/FOUNDATION.md`, `approvals/APPROVALS.md`, `events/EVENTS.md`, and the Phase 3.4 implementation/activation context. Searches of the GTI workspace and local attachments did not locate the original detailed five-standard-template process specification. Other local instructions described a flexible-project prototype and a separate marketing-operations UI, not that specification. Existing source implementations and their reports remain source material; no detailed standard-template content was invented or converted.

**3. Registry and validation.** `WorkflowDefinition.schemaVersion` is exactly `1`. Supported intended project types are Artwork / Packaging, POSM, Retail Display, Exhibition Stand, Digital and Custom, plus an unspecified type. These values classify drafts; they do not seed five standard templates.

| Capability | Configured contract |
| --- | --- |
| INFORMATION | Instructions and fields with stable ID, label, help, required flag; short/long text, number, date, select and read-only types; type-checked defaults, numeric/length bounds, unique select options and valid calendar dates. Read-only fields cannot be required inputs. |
| FILE_REQUIREMENT | Title/instructions, accepted extension or exact MIME allowlist, min/max count, required flag, owner/reviewer/no acceptance, accepted-version completion gate. No upload/storage locator or submission record. |
| CHECKLIST | Stable group/item IDs, labels, descriptions, required/optional status, NONE/TEXT/SHARED_FILE_VERSION evidence. All required items and their evidence contribute to future readiness. |
| APPROVAL | Ordered stable step IDs, fixed eligibility (Director, SPM, project Owner or Co-owner), configured-input or exact-version evidence, mandatory explicit approval, return-for-changes/block-stage rejection and progression gate. Configuration is never approval authority. |

The server validates the same curated literals used to present client controls. Requests cannot replace the registry. Every object has an exact property allowlist; actor/permission/publication fields, column names, JSON paths, JavaScript, SQL and conditional-expression properties are rejected. Text is rendered as text, never executable HTML. IDs are bounded identifiers and unique across all stages, blocks, fields, items and steps within a workflow. Service and streamed HTTP byte limits bound configuration before persistence. Limits include 128 KiB definitions, 30 stages, 12 capabilities per stage, 40 information fields, 60 checklist items, 12 approval steps, 40 select options, 20 accepted file types and at most 100 files per requirement.

Structural, authority and dependency errors reject writes. Incomplete authoring content can be saved with `INCOMPLETE` and actionable errors; a fully configured definition is `VALID`, which still confers no approval or project-creation eligibility. Validation status is computed by the server, stored in the immutable revision and recomputed for previews. Future contract changes must use a new schema version and keep explicit older-version decoding; existing v1 keys must not be silently reinterpreted.

**4. Working UI.** The editor provides workflow details, an ordered stage sidebar, a focused stage editor, collapsible capability configuration and advanced field settings, keyboard move buttons, add/remove/duplicate stages, capability editing, ordered approval-step editing, supported gate selectors, save/reopen, draft duplication, validation review, historical revision links and preview. The current history panel shows the latest 50 snapshots; earlier revisions are still addressable by the revision query parameter. Draft lists are paginated in groups of 30.

Every view displays **DRAFT — NOT APPROVED — NOT AVAILABLE FOR PROJECT CREATION**. The preview shows actual labels, help, defaults, bounds, file requirements, checklist evidence, approval order/rejection behavior and named dependencies. It has no runtime upload, decision or progression action. It uses the existing application shell, responsive cards, accessible input/select names, keyboard controls and live status/error announcements. Unsaved browser edits are protected by a navigation warning; stale-save rejection retains the local edits and provides a link to the current saved version in another tab.

**5. Revisions and concurrency.** `WorkflowDraft` is the stable creator-owned identity with a current revision counter and DRAFT-only status. `WorkflowDraftRevision` is an immutable native change record with definition, configuration validation state/hash, real actor/role/authorization version, command/hash, timestamp, action and optional clone-source revision. Creation makes revision 1; every successful save appends a snapshot. Previous revisions cannot be updated, deleted or truncated. Database constraints require a complete contiguous history at commit.

The V2 transaction protects assignment and current-session state; draft row locks serialize competing edits, and every revision uses the expected current revision. Actor/command advisory locking plus a unique command key makes exact retries idempotent and rejects reuse with different contents. Two simultaneous Director/SPM writes at the same revision produce exactly one success and one conflict. Cloning checks current source visibility/version, creates a new workflow with the actual cloner as creator, and preserves the original. Internal definition IDs remain scoped to the new workflow; stage duplication instead remaps all nested IDs and local gate references. Future published versions can reference an immutable revision without mutating it; publication is absent here.

**6. Authorization.** `stage-draft-policies.ts` registers the existing `template.configureCustomStages` capability. Director may read/edit/preview every draft. SPM may create, read, revise, preview and clone their own drafts; no cross-SPM or Director-owned access is inferred. Director edits preserve original creator identity and record the Director as the revision actor. This deliberately adds no draft-sharing ACL. JPM, Designer, Digital Lead, technical-only administrators, unauthenticated and invalid/stale sessions are denied. Technical privileges do not supply business authority. Existing eligibility and the explicit Director-publication requirement are reused; there is no second authorization engine or new publish capability.

All list/detail/history/clone/write operations authorize the current session in the server transaction, including direct API calls. Same-origin JSON writes, streamed body bounds, strict command objects and private/no-store responses protect the HTTP boundary. Read-only historical views retain the same current visibility restrictions as the draft.

**7. Gates and approval safeguards.** The fixed gate registry supports required fields, required checklist items, accepted files, completed approval steps and preceding-stage completion. References must resolve to the correct capability in that stage; file/approval gates must agree with that capability's required/acceptance settings. Predecessors must occur strictly earlier in the sequence, which rules out cycles, self-links, missing references and impossible ordering. Duplicate gates are rejected. Removing a referenced stage/capability requires first removing its explicit dependencies.

Readiness semantics are an AND of required fields, required checklist items/evidence, required file submissions, configured accepted-version and approval gates, and explicit gate conditions. Optional content is not independently mandatory. An optional file requirement's count constraints apply when a submission exists. These are definition semantics only; there is no stage readiness/progression executor. Approval eligibility names are candidate criteria for a future reviewed server adapter, not permission grants. Actual participant eligibility, exact evidence and decisions must be enforced through the Reusable Approval Engine later. Director final completion and SPM/JPM creation governance remain outside, and above, these definitions.

**8. Tasker, files, approvals and events.** `fieldTargets()` exposes schema version, stable stage/capability/field IDs and supported value types, with `runtimeAdapter: null`. A future adapter must additionally bind the workflow identity, immutable revision and actual runtime stage/field instance, then recheck Tasker and native destination authority/state. No Tasker type, automatic task, stage assignment, target resolver or live field mutation was added.

File/evidence configuration names `SHARED_FILE_VERSION`; it contains no bucket, storage key, copied file or free-form evidence locator. Future stage execution must reference exact `SharedFileVersion` records. Approval definitions create no `ApprovalRequest`, `ApprovalDecision` or native active workflow.

The revision insertion trigger emits `WORKFLOW_DRAFT_REVISED` through the existing `BusinessEvent` and `EventOutbox` tables in the same transaction. The event contains real actor, workflow/revision identity, sequence, timestamp and only the server-defined action, configuration hash and validation status. Names, instructions, input defaults, session identifiers, storage paths and secrets are excluded. An exact native revision FK and guard tie the event to its source. Existing event immutability, consumer key, dispatcher, retries and receipts are reused; a fake local consumer tested delivery without adding any worker, scheduler, email or production consumer.

**9. Preservation.** No existing project, workflow stage, flexible milestone, preset, task type, Sister relation, approval decision, file evidence, account, Archive or Library model is rewritten. There is no historical backfill. Migration rehearsals compare full canonical row snapshots for every pre-existing table and old Prisma ledger row. The Tasker rehearsal contains populated completed six-type tasks, native review/history, Sisters and shared versions; the separate event/approval rehearsal contains accepted/rejected approvals, completion history, exact file evidence and delivery diagnostics. All compare unchanged across the candidate. Flag-off checks execute against the actual reconstructed 112-migration schema. Existing application source was changed only for the guarded Projects entry, authorization registration and typed event decoding.

**10. Proposed migration.**

```text
prisma/migrations/20261023010000_stage_builder_drafts/migration.sql
SHA-256: 3527adb36ac84d49069e9f0db084af3df6af09d4bed890d5b64681afbd8430fe
```

| Inventory | Proposed changes |
| --- | --- |
| Tables | `WorkflowDraft` (6 columns), `WorkflowDraftRevision` (15 columns) |
| Indexes | 7 including both primary keys; creator/update lookup, event uniqueness, workflow/revision uniqueness, actor/command uniqueness and clone-source lookup |
| Foreign keys | 5 restrictive FKs: draft creator, revision workflow, actor, clone source, native event. The event FK is initially deferred for atomic native-trigger insertion. |
| New checks | `WorkflowDraft_shape`, `WorkflowDraftRevision_shape` |
| New functions | `flux_draft_guard`, `flux_draft_consistency`, `flux_emit_draft_event` |
| New triggers | 6: row/retention guards on each new table, deferred draft-history consistency, revision event emission |
| Existing-object extensions | One `BusinessEventType` value; `BusinessEvent_contract_check` and `flux_event_write_guard` extended with the draft branch, retaining prior Tasker/document branches |
| Existing Prisma models | Inverse relations on User and BusinessEvent only; no new columns on existing tables |
| Transaction / backfill | Explicit BEGIN/COMMIT; no seeded drafts, role grants, publication records or historical data writes |

Expected after a separately approved application: **113 successful migrations and 124 public tables including `_prisma_migrations`**, zero pending and zero Prisma drift. Repository migration count is now 113; the candidate is the only new migration. Remote application was expressly excluded. The local flag is disabled, so current application paths do not query the absent draft tables. Enabling the flag before the migration fails closed; it does not create tables automatically.

**11. Verification.**

| Verification | Result |
| --- | --- |
| Full `pnpm exec tsc --noEmit --incremental false` | PASS |
| Targeted ESLint, all changed TS/TSX/MJS, `--max-warnings 0` | PASS |
| Prisma validation/generation | PASS |
| Production build, Next.js 16.2.6 | PASS in isolated application copy; no environment files or live DB credentials; application sources match the workspace |
| `pnpm run stage-builder:check` | PASS: all six Tasker types/Sisters, populated 112→113 migration, zero drift/backfill, flag-off baseline, draft contracts/persistence/auth/concurrency/cloning/immutability/events |
| Broad V2 authorization/foundation integration | PASS: 108 checkpoints, including administration, current sessions, project read/write/creation/completion, native Stage 5/6/7, flexible workspaces, files/provenance, approvals/events, Archives and Library |
| Authorization foundation/persistence, approval/event and Tasker/Sister units | PASS |
| Repaired legacy Tasks runner | PASS: 66 Task assertions, 57 project-relationship assertions and 3 historical-assignment assertions; genuine V2 sessions |
| Repaired legacy concepts runner | PASS: 7 suites, 888 assertions; includes Stage 3/4 and Stage 5 handoff; zero external requests |
| Original migration/env/report fingerprints; `git diff --check` | PASS |

Four additional, unchanged legacy **source-text** scanners fail both in this working tree and in an isolated export of untouched HEAD. They are not regressions introduced by Phase 4.1, and no authority was weakened to satisfy them:

- `stage-five:ui-check`: expects the former literal `redirect(returnTo ?? "/")`, while login now uses the V2 default-route resolver.
- `stage-six:ui-check`: expects the old implicit business-administrator authority pattern.
- `stage-seven:ui-check`: expects the old “Mark Project as Completed” UI string.
- `concept-stage:ui-check`: expects the old implicit administrator concept-authority pattern.

The applicable current-session/native integration suites pass. These four static scanners remain baseline test-maintenance debt and are disclosed rather than represented as passing. No required new Stage Builder acceptance scenario was skipped.

**12. Browser acceptance.** Isolated Chromium 153.0.8010.12, production Next.js, disposable PostgreSQL, synthetic logins and local fake Tasker storage. Stage Builder itself performs no storage operations. Successful-run results and screenshots are under `.tmp/phase41/`.

| Suite | Result | Screenshots | Page errors | External requests |
| --- | --- | --- | --- | --- |
| Stage Builder | PASS | 14 | 0 | 0 |
| Sister Tasks | PASS | 16 | 0 | 0 |
| Inspect File / Initial Concept / Final Concept | PASS | 13 | 0 | 0 |
| General Tasker | PASS | 9 | 0 | 0 |
| File Upload / Data Input | PASS | 10 | 0 | 0 |
| 112-schema flag-off application compatibility | PASS | 10 | 0 | 0 |
| **Total** | **PASS** | **72** | **0** | **0** |

Stage Builder coverage includes Director and SPM authoring, every field type, all capabilities, ordered approval steps and gates, save/reopen, keyboard stage order, stage duplication/removal, stable field IDs, immutable history, independent clone, incomplete validation, two-session conflict preservation, mobile editor/preview, cross-SPM isolation and JPM/Designer/Digital/technical browser/API denial. Forged origin, oversized bodies, extra approval fields and absent publish/approve/activate routes are checked. No project, preset approval or reusable approval request is created. Desktop preview and mobile-editor screenshots were visually reviewed.

**13. Deferred work and limits.** Stage runtime instances, actual information mutations, file uploads/acceptance, evidence binding, approval execution, Tasker hosting/adapters/automatic tasks, published/approved template versions, approval routing, the five standard templates, sharing of drafts between SPMs and historical project conversion are not implemented. History navigation is bounded in the UI as described above. Rejection behavior and reviewer eligibility cannot be operationally exercised until the reviewed runtime adapter exists. Local database tests cover PostgreSQL 14.19, not a new PostgreSQL 18.6 mutation run. Browser evidence covers Chromium desktop/mobile emulation, not Safari/Firefox, assistive-technology certification or live S3/PDF rendering.

**14. Activation recommendation.** The draft-only implementation is ready for review and a separate controlled development preflight, subject to acknowledgement/repair of the four pre-existing static-scanner failures. That preflight should reverify Neon identity, recovery readiness, the 112-ledger baseline, candidate checksum, full-row preservation and drift before any separately authorized application. Keep `FLUX_STAGE_BUILDER_DRAFTS` disabled until migration postchecks pass and controlled Director/SPM acceptance is authorized. Do not publish, activate project stages or start Phase 4.2 as part of activation.

Evidence: `.tmp/phase41/integration.log`, `authorization.log`, `legacy-tasks.log`, `legacy-concepts.log`, `typecheck.log`, `eslint.log`, `build.log`, `baseline.json`, `verification-summary.json`, `baseline-*-ui.log`, and each browser artifact folder's `result.json` / screenshots / `server.log`. Initial development runs exposed and fixed a Prisma advisory-lock return-type issue and select accessible names; the final successful runs use the corrected code. Isolated test clusters and application processes are cleaned up by their runners.
