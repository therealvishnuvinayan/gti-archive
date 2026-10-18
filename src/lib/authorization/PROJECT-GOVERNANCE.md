# FLUX V2 Phase 1.5D — project creation and completion governance

Implemented locally on 2026-10-18. This report supersedes the creation and final
completion exclusions in the Phase 1.5A–C reports. Existing native read/write
restrictions remain in force. The migration has **not** been applied to Neon.

Activation follow-up: [PROJECT-GOVERNANCE-ACTIVATION.md](./PROJECT-GOVERNANCE-ACTIVATION.md)
records the verified Neon target, migration checksums, recovery readiness and
subsequent isolated browser verification. Neon modification remains paused for
the explicit migration approval required by the activation request.

## 1. Exact files created or modified

The manifest at the end of this report is relative to the clean workspace at the
start of Phase 1.5D. No earlier migration, account configuration, Archive/Library
source or S3 implementation was modified.

## 2. Creation governance

- Director creation activates supported Artwork or flexible projects atomically.
  Creator, Owner, co-owners, executors and the actor who adds participants are
  distinct, truthful records. Director oversight never creates a co-owner row.
- SPM direct creation requires an active, explicitly approved legacy Artwork
  preset reference. No approval is seeded or inferred from legacy configurations.
- JPM submits Artwork details as the actual Owner, with at least one active SPM
  co-owner. Submission creates no project. The Director approves/rejects the
  immutable request; the requester or Director may then activate it once.
- Configuration, workflow-definition hash, participant authorization versions,
  requester version and preset reference are retained. Approval and activation
  revalidate them. Requests expire seven days after submission. Rejected/expired
  history remains; revised details require a new request.
- Serializable transactions, row locks, one-time submission identifiers, conditional
  transitions and unique project references prevent duplicate decisions/activation.
  Serialization conflicts return a refresh/review message; no blind retries occur.
- Artwork creation initializes the existing seven-stage workflow and canonical
  research/private folders. It does not mirror participants into legacy Collaborator
  relationships or invent any of the six future V2 templates.

## 3. Completion governance

An actual SPM/JPM Owner submits a completion request. The Director reviews and
approves/rejects it. Approval and final project completion commit together. A
Director may instead finalize directly with a reason, producing a request,
approval and completion event in the same transaction. An existing pending request
must be reviewed first. Co-ownership alone cannot request final completion.

Artwork readiness requires the valid Stage 7 transition, all production units
ready/handed over with attributed supervision sign-off, all live production
approval steps approved, finished native work/uploads and consistent production
file/checklist/handoff associations. Removed approval steps remain historical
evidence rather than active approval requirements. Existing mandatory completion
documents must be resolved and present for the same project/workflow. Missing
external-project document configuration blocks completion; INTERNAL projects
without a document workflow retain their existing exemption. If a workflow exists,
its requirements are honored even for an INTERNAL project.

Flexible readiness requires at least one milestone, all milestones completed with
actual completer/timestamp evidence, and no pending uploads. Completing the last
milestone still leaves the project active until the Director decides.

Evidence snapshots include relevant workflow state, participants, files, approval
decisions, production handoff/checklist/sample evidence and completion documents.
An approval rechecks the snapshot and requester authority; changed evidence or
expired requests must be rejected and submitted afresh. External bearer-token
hashes are not copied into production approval/handover evidence.

Stage completion, readiness, request submission, Director approval, final project
completion and archiving remain distinct. Artwork finalization retains the native
ProjectClosure record, completes Stage 7 and stops its reminders. It does not
archive the project or remove files, approvals, documents or prior history.

## 4. Director decisions and audit

The inbox shows pending requests first, immutable submitted details, actual
requester, expiry, status, decision maker and reason. Director decisions require a
non-empty reason. Approval does not impersonate the requester. Director authority
is global business authority; it does not grant technical privileges.

`ProjectGovernanceEvent` records creation preparation/submission, decisions,
activation, completion requests/decisions/finalization, preset approval/revocation
and template proposal review. Rows are append-only and linked to exactly one
governance record. SQL guards reject history updates/deletes/truncation, incorrect
actor attribution, snapshot changes and duplicate/invalid state transitions.
The transaction actor setting binds audit attribution; it is not a substitute for
runtime authorization or protection against a privileged database administrator.

## 5. SPM/JPM and restricted roles

SPMs create their own Artwork projects using approved presets and may submit
template creation/modification proposals. JPMs own their requested Artwork
projects and must retain the eligible SPM co-owner through activation. SPM/JPM
completion requests require actual current ownership. Their existing scoped
management and execution permissions remain unchanged.

Designer, Digital Lead, technical-only and unmapped accounts cannot use creation,
governance approval or finalization paths. Existing restricted task execution and
read projections remain intact. Native write policies continue to deny unrelated
resources, completed/archived work, unauthorized structural changes and forged
actors. All nine real accounts, passwords and current role assignments were left
untouched; tests used fictional accounts in new disposable databases.

## 6. Template compatibility

`legacy-artwork-seven-stages` is an explicit compatibility designation of the
existing workflow, not a published V2 template. The Director reviews the stages
and explicitly approves the current definition hash. SPM creation stays blocked
until this occurs. Revocation immediately invalidates that reference, including
pending creation requests. A replacement approval does not revive a revoked ID.
Changes to the definition/version invalidate old references; future behavior
changes to this preset must also update its compatibility version.

SPMs and Directors can submit immutable CREATE/MODIFY proposals with a brief and,
for modifications, a reference to the existing template/preset. The Director may
endorse/reject them with a reason. Endorsement is **not publication**, creates no
preset approval, and cannot be supplied as a project-creation grant. Full editing,
versioned publication and the future project-type engine remain deferred.

## 7. Persistence and migration

Additive migration: `prisma/migrations/20261018170000_project_governance/migration.sql`.

Five models: `LegacyProjectPresetApproval`, `ProjectCreationRequest`,
`ProjectFinalCompletionRequest`, `ProjectTemplateProposal`, `ProjectGovernanceEvent`.
Two enums describe supported existing project kinds and request lifecycle states.
Relations to existing User/Project/FlexibleProject models are additive; foreign
keys restrict deletion of referenced history. Partial unique indexes enforce one
active approval per preset definition and one pending completion request per
project. SQL checks enforce target consistency, decision metadata and legal states.
Triggers preserve immutable snapshots/history and transaction actor attribution.

All migrations were validated on fresh socket-only PostgreSQL fixtures, with
Prisma schema drift checks. Existing migration files are unchanged. The development
provisioning preflight's exact schema counts were updated from 103 migrations / 91
tables to 104 / 96. Database target identity checks, checksum matching, account
allowlists, business-data emptiness checks, signing and authorization guards were
not changed. No provisioning command was run against the application database.

## 8. Protected services and actions

| Entry point | Boundary |
| --- | --- |
| `submitProjectCreation` | Session + `project.requestCreation`; direct activation separately checks `project.create` in the same transaction |
| `decideProjectCreation` | Director-only `project.decideCreation`, request lock and reviewed hash |
| `activateApprovedProject` | `project.activateCreation`, requester/Director, fresh configuration/participants/preset, single activation |
| `approveLegacyArtworkPreset` / `revokeLegacyArtworkPreset` | Director-only `project.approveLegacyPreset`, exact definition and active approval lock |
| `requestProjectCompletion` | `project.requestCompletion`, actual Owner or Director, locked project and validated evidence |
| `decideProjectCompletion` | Director-only `project.approveCompletion`, locked project/request, reviewed evidence hash |
| `finalizeProjectAsDirector` | Director-only `project.finalize` plus approval policy in the same transaction |
| `closeStageSevenProject` and existing Stage 7 server action | Delegates to shared Director finalization; old parallel closure implementation removed |
| `submitTemplateProposal` / `decideTemplateProposal` | `template.createProposal` for SPM/Director; Director-only `template.decideProposal`; publication remains unregistered |
| `projectGovernanceAction` | Server-owned command dispatch, `requireUser`, validated fields; client actor/role fields never grant authority |
| `getGovernanceWorkspace` / `getCompletionPanel` | Trusted session, management role, own-request/current-owner scope or Director global scope |

No new HTTP API bypass exists. Direct server-action/service calls repeat all
checks. Old Artwork/flexible creation exports remain blocked, as do the
`project.completeArchive` seam, old completion-document mutators, deletion and
ownership-transfer paths. New governance overrides only creation/final-completion
capabilities; existing read/write registries remain registered.

## 9. UI flows

- `/projects/new`: role-aware creation/submission, actual active Director account,
  Owner/co-owner/executor selection, brief/scope/tags and explicit preset status.
  It displays the required Director Oversight note verbatim.
- `/projects/approvals`: Director inbox or a manager's own requests, reasons,
  evidence review, approve/reject, separate approved-project activation, expiry
  feedback, legacy preset designation/revocation and template proposals.
- Structured/flexible project overviews: readiness/blockers, Owner completion
  request, Director finalization, pending/completed/archived status and inbox link.
- Project lists link to governance. Private-project creation links to the governed
  form; unsupported manager flexible creation is not advertised. Stage 7 links to
  final-completion review instead of offering the retired closure control.

## 10. Verification

| Check | Final result |
| --- | --- |
| Full TypeScript: `pnpm exec tsc --noEmit --incremental false` | PASS, including scripts and application files |
| Repository ESLint: `pnpm lint`; final ESLint on all 31 changed source/test files | PASS, no errors or warnings |
| `authorization:foundation-check` / `authorization:persistence-check` | PASS |
| Isolated PostgreSQL foundation and assignment-service regression | PASS; custom guards, immutable authorization history, real concurrency and unrelated-row preservation |
| `authorization:runtime-check` equivalent runner flag `--runtime` | PASS; sessions, version invalidation, role/domain separation, forged identity and real login/logout |
| `authorization:project-read-check` equivalent flag `--project-read` | PASS; Director global access, manager scope, restricted projections, files/folders/lists and read-only behavior |
| `authorization:project-write-check` equivalent flag `--project-write` | PASS; native Artwork/flexible operations, locked/completed work, recipient identity, rollback and concurrent revocation |
| `authorization:project-governance-check` | PASS; actual services/actions, explicit presets/proposals, ownership, all role denials, concurrency/replay, stale configuration/evidence, document/sign-off preservation and native Stage 7 closure |
| `permissions:final-check` | PASS; legacy authority cannot bypass V2 governance |
| `users:v2:check` | PASS; disposable nine-account provisioning, exact target/schema guards, signatures/replay, guided interruption/resume and unchanged passwords/roles |
| Migration deployment and Prisma schema drift in disposable PostgreSQL 14.19 | PASS; 104 migrations, 96 tables, no Prisma drift |
| Final production `pnpm build` | **PASS**: bundling, Next TypeScript, page-data collection and all 50 static pages; `/projects/approvals` is dynamic |
| Browser smoke test | NOT RUN; no usable browser runner |

The authorization suites ran through
`node scripts/run-authorization-isolated-integration.mjs` with their corresponding
flags. The final governance and provisioning suites also passed independently.
All databases were new clusters with private sockets and TCP disabled, then
stopped and removed. Production-build `DATABASE_URL` and `DIRECT_URL` were
overridden to unreachable localhost port 9. Nothing was migrated or deployed by
the build.

Initial verification exposed a runtime test's missing generated-client mapping
and provisioning schema counts pinned to the previous phase; both were corrected
without disabling checks. The guided coordinator rejects both the old migration
count and an unexpected extra migration. There are **no remaining failing checks**.
Browser verification and controlled development activation remain outstanding.
Code is ready for review; this is not a claim that governance is already active on
Neon or that browser sign-off has occurred.

Hash comparison also confirmed that all 133 inspected historical migration,
Archive/Library/S3 and account/CLI configuration files were unchanged.

## 11. Outstanding limitations

- Neon migration and explicit Director designation of the legacy Artwork preset
  are pending. SPM creation is intentionally unavailable before both prerequisites.
- Flexible direct creation currently supports Director creation with a Director
  or SPM Owner, without co-owner/executor fields. Flexible SPM/JPM creation remains
  blocked until its participation model and approved template boundary can express
  the mandatory SPM co-owner correctly. Existing eligible flexible Owners can
  request final completion now once the migration is applied.
- External Artwork with unresolved/missing document requirements cannot finalize.
  The legacy document-request/upload mutation paths remain closed from Phase 1.5C;
  integrating those operational paths is a separate dependency, not waived here.
- Template proposals can be reviewed, but no full editor/publisher, six-type
  template catalogue, Custom Stage Builder or Universal Tasker is implemented.
- The Director inbox is the delivery mechanism. No outgoing approval email or
  notification delivery is claimed. Each inbox shows at most 100 records of each
  kind, pending first; older history remains in the database.
- Browser smoke testing was unavailable: no usable browser/automation runner was
  installed. Server actions/services, authorization and production compilation
  were tested without using Neon or S3.

## 12. Neon authorization and preserved resources

**Separate explicit approval is required before applying the migration to Neon.**
It was not applied. No actual projects, account rows, passwords, role assignments,
Archives, Library, S3 objects or historical migrations were changed. No commit,
push, deployment, database reset or later phase was performed.

## 13. Recommended next milestone

**Phase 1.5D controlled development activation and browser sign-off:** review and
explicitly authorize the additive migration, apply it to the approved development
target, have the actual Director review/designate the legacy Artwork preset, then
perform the role-based browser walkthrough. Keep synthetic projects in a separate
isolated environment. Scope the versioned template/document-workflow work only
after that sign-off; do not automatically begin it.

## Exact manifest

13 files created; 28 files modified (41 total).

Created:

- `prisma/migrations/20261018170000_project_governance/migration.sql`
- `scripts/authorization-project-governance-integration-check.ts`
- `scripts/tsconfig.authorization-project-governance.json`
- `src/app/(dashboard)/projects/approvals/page.tsx`
- `src/app/(dashboard)/projects/governance-actions.ts`
- `src/components/projects/governance-form.tsx`
- `src/components/projects/project-completion-governance.tsx`
- `src/lib/authorization/PROJECT-GOVERNANCE.md`
- `src/lib/authorization/project-governance-policies.ts`
- `src/lib/project-governance/completion.ts`
- `src/lib/project-governance/configuration.ts`
- `src/lib/project-governance/preset.ts`
- `src/lib/project-governance/service.ts`

Modified:

- `package.json`
- `prisma/schema.prisma`
- `scripts/authorization-project-write-integration-check.ts`
- `scripts/authorization-runtime-integration-check.ts`
- `scripts/development-provisioning/README.md`
- `scripts/development-provisioning/core.ts`
- `scripts/development-role-setup.mjs`
- `scripts/development-role-setup.test.mjs`
- `scripts/final-permissions-regression-checks.mjs`
- `scripts/run-authorization-isolated-integration.mjs`
- `src/app/(dashboard)/projects/[slug]/page.tsx`
- `src/app/(dashboard)/projects/flexible/[projectSlug]/page.tsx`
- `src/app/(dashboard)/projects/new/page.tsx`
- `src/app/(dashboard)/projects/page.tsx`
- `src/components/projects/flexible-projects-browser.tsx`
- `src/components/projects/flexible-projects-route-workspace.tsx`
- `src/components/projects/stage-seven-workspace.tsx`
- `src/lib/authorization/LEGACY-ENTRY-POINTS.md`
- `src/lib/authorization/PROJECT-READ.md`
- `src/lib/authorization/PROJECT-WRITE.md`
- `src/lib/authorization/RUNTIME.md`
- `src/lib/authorization/definitions.ts`
- `src/lib/authorization/eligibility.ts`
- `src/lib/authorization/policy.ts`
- `src/lib/authorization/runtime.ts`
- `src/lib/flexible-projects.ts`
- `src/lib/permissions/resolver.ts`
- `src/lib/stage-seven.ts`
