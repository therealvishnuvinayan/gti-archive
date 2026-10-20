# FLUX V2 Phase 1.5C — project write authorization

Phase 1.5D now supplies governed creation, template proposals and shared final
completion: see [PROJECT-GOVERNANCE.md](./PROJECT-GOVERNANCE.md). The creation and
completion exclusions below record the end of Phase 1.5C. Its native write
restrictions remain in force; Stage 7 final closure now delegates to governance.

Implemented 2026-10-18. Native authenticated project mutations now use the V2
policy engine and a shared authorization/mutation transaction. This report
supersedes the project-write exclusions in the Phase 1.5A/B milestone reports.
Project creation approvals, approved templates and universal final completion
are **not implemented**. Unsupported operations below deny access.

## 1. Exact files created or modified

The manifest below is relative to the workspace snapshot taken before Phase
1.5C, including previously uncommitted Phase 1.5A/B files. A file already present
in that snapshot is classified as modified even if Git still lists it as
untracked. Existing working changes were preserved.

8 files created; 49 files modified (57 total).

Created:

- `scripts/authorization-project-write-integration-check.ts`
- `scripts/tsconfig.authorization-project-write.json`
- `src/lib/authorization/PROJECT-WRITE.md`
- `src/lib/authorization/project-transaction.ts`
- `src/lib/authorization/project-write-operations.ts`
- `src/lib/authorization/project-write-policies.ts`
- `src/lib/authorization/project-write.ts`
- `src/lib/project-management.ts`

Modified:

- `package.json`
- `scripts/final-permissions-regression-checks.mjs`
- `scripts/run-authorization-isolated-integration.mjs`
- `src/app/(dashboard)/projects/[slug]/edit/page.tsx`
- `src/app/(dashboard)/projects/[slug]/stages/concept-actions.ts`
- `src/app/(dashboard)/projects/actions.ts`
- `src/components/projects/create-project-form.tsx`
- `src/components/projects/revoke-stage-skip-button.tsx`
- `src/components/projects/revoke-task-completion-button.tsx`
- `src/lib/authorization/LEGACY-ENTRY-POINTS.md`
- `src/lib/authorization/PROJECT-READ.md`
- `src/lib/authorization/README.md`
- `src/lib/authorization/RUNTIME.md`
- `src/lib/authorization/definitions.ts`
- `src/lib/authorization/eligibility.ts`
- `src/lib/authorization/policy.ts`
- `src/lib/authorization/runtime.ts`
- `src/lib/comparison.ts`
- `src/lib/file-favorites.ts`
- `src/lib/flexible-project-attachments.ts`
- `src/lib/flexible-projects.ts`
- `src/lib/permissions/README.md`
- `src/lib/permissions/resolver.ts`
- `src/lib/prisma.ts`
- `src/lib/project-completion.ts`
- `src/lib/project-concept-access.ts`
- `src/lib/project-concepts.ts`
- `src/lib/project-creation.ts`
- `src/lib/project-folder-colors.ts`
- `src/lib/project-folder-pins.ts`
- `src/lib/project-form-drafts.ts`
- `src/lib/project-history.ts`
- `src/lib/project-inquiry.ts`
- `src/lib/project-owner-candidates.ts`
- `src/lib/project-private-folders.ts`
- `src/lib/project-research-access.ts`
- `src/lib/project-research-files.ts`
- `src/lib/project-research-import.ts`
- `src/lib/project-research.ts`
- `src/lib/project-stage-data.ts`
- `src/lib/project-stage-skip-revocation.ts`
- `src/lib/project-tracker.ts`
- `src/lib/projects.ts`
- `src/lib/realtime/server.ts`
- `src/lib/request-reminders.ts`
- `src/lib/stage-five.ts`
- `src/lib/stage-seven.ts`
- `src/lib/stage-six.ts`
- `src/lib/storage/s3.ts`

## 2. Registered mutation capabilities

| Capability | Integrated use |
| --- | --- |
| `project.edit` | Project pinning, flexible metadata and inquiry-scoped contact creation |
| `project.manageParticipants` | Structured project editing and validated co-owner/executor changes |
| `project.manageStage` | Native inquiry/research/concept/stage management, draft saves, reviews, Stage 5 checklists, Stage 6 management and Stage 7 supervision |
| `project.executeTask` | Actual assigned concept execution/completion requests and flexible milestone execution |
| `project.writeFile` | Authorized native attachment/folder operations and favorites |
| `project.comment` | Authorized stage comments, submission captions and comparisons |
| `project.respond` | Authenticated checklist/production-approval responses with actual recipient checks |
| `project.approveCompletion` | Existing Stage 7 Director closure only |
| `project.directorIntervention` | Audited reopening of skipped concept stages and tasks completed without files |

`project-write-operations.ts` is the exact server-owned operation allowlist, with
target kinds, lifecycle stages and blocked modes. It is not supplied by the
browser. Unknown actions/target kinds deny. `project.create`, `project.delete`
and universal completion-request/template/Tasker capabilities remain unregistered.
The five Phase 1.5B read capabilities remain registered independently.

## 3. Server-side authorization behavior

Every integrated exported mutation enters `runProjectMutation` before its native
body runs. The wrapper resolves the stored session, authorization version,
active business role and actual resource relationships. It checks that the
caller's expected user ID matches the authenticated actor and supplies the
native implementation with a newly authenticated user. Supplied roles,
permission profiles, actor objects and ownership claims cannot grant access.

The central engine locks authorization assignments and the session; the project
adapter resolves and locks the actual structured/flexible project, then reloads
its resource associations, participation and lifecycle. Native queries and
nested transaction callbacks join that same Serializable transaction through
the request-local Prisma facade. Mutation-time stage-access reads bypass React
memoization. Error objects returned by native services cause rollback before
being returned to the caller. Expiry is checked again before the callback ends.
There is no implicit replay of a project mutation after an uncertain commit or
serialization failure; the caller must retry with fresh authorization.

The domain retains native file/project, folder/project, revision, handoff and
recipient checks. Completed/archived/closed projects, locked or completed stages
and completed milestones deny ordinary writes. Known draft forms must identify
an available native stage; an actor may delete their own draft without reopening
a stage. Resource IDs select records; they never prove ownership. Legacy
permission flags cannot turn a central denial into an allow.

Notification publishing and object deletion are deferred until database commit.
Rollback does not publish those changes or delete an object. Native upload/copy
workflows retain their existing storage behavior: this is database transaction
integrity, not a distributed S3 transaction. New external email dispatch is
closed until durable delivery can be tied to committed state.

## 4. Director global management

Director can manage eligible projects without owner/co-owner/executor membership.
No ownership, creator, assigner or executor record is replaced with Director.
Private-folder children retain the folder's real owner. Director receives no
technical privilege from this policy.

Reopening a skipped Stage 3/4 or a task completed without a file requires a
nonempty reason and preserves native downstream-stage, upload, checklist and
history restrictions. The reason and real actor are persisted in the existing
`STAGE_SKIP_REVOKED` activity or task intervention comment. Stage 7 closure uses
the real `closedById` after the native sign-off and sequence checks. Director
cannot override recipient identity, a completed approval or immutable file
history through an ordinary edit.

Successful operations also emit a structured application log after commit with
actor, project, operation, capability, target and override/reason. This is **not a
new durable universal database audit trail**. Deletion, ownership transfer and
approved-file reset operations remain closed where the existing model cannot
preserve sufficient evidence safely.

## 5. SPM/JPM scoped management

SPM/JPM manage structured projects only as their actual owner or co-owner.
Executor membership alone grants only the particular assigned work. Legacy
ADMIN/SUPER_ADMIN cannot grant global project authority. Flexible management
requires actual ownership; the flexible model has no independent co-owner table.
Existing flexible collaborator records remain read compatibility, not a V2 write
management grant. Neither manager role can perform Stage 7 final closure.

## 6. Designer/Digital Lead restrictions

Both roles are denied project creation, participant changes, structural editing,
stage approval/completion and project closure, even if a legacy row records them
as owner/co-owner. Actual concept assignment permits native task execution,
submission-related actions and completion requests; actual flexible milestone
responsibility permits that milestone's execution. Private-folder ownership
permits its scoped file operations. Unrelated tasks/folders and management-only
file purposes deny. These checks apply equally to an executor-only SPM/JPM.

Project ownership and task execution remain separate. Existing concepts and
milestones do not provide Universal Tasker's independent task-owner, spectator,
self-review and arbitrary task-type model; this phase does not invent those
fields or claim that model is implemented.

## 7. Technical Administrator restrictions

A technical-only account has no project write, approval, deletion or intervention
grant, including with legacy SUPER_ADMIN and stored membership. An account with
both domains uses only its separately assigned business role for project work.
There is no support impersonation or technical project override.

## 8. Project participation

Structured edits accept active SPM/JPM co-owners and active business-role
executors. Director cannot be manually added as co-owner. Technical-only,
unassigned and suspended candidates deny. A JPM-owned project must retain an SPM
co-owner. Ownership transfer and collaborator modifications deny.

Existing collaborator structures are retained; new grants are not mirrored into
them. Removing an executor removes its mirrored compatibility grant and current
concept execution assignment while retaining the recorded assigner. Existing
submissions and review records are not rewritten. New participation uses the
real actor for `addedById`. The edit form selects candidates by V2 assignment and
does not offer new collaborator management. Flexible milestone responsibility
is an explicit task relationship; it does not grant project ownership.

## 9. Structured/flexible workflow compatibility

Native stage/submission/revision/comparison services retain their integrity
checks behind the central wrapper. Stage 5 initializes a missing checklist only
inside its authorized save, validates source handoff/file associations and
records the actual updater. Reads remain side-effect free. Stage 6 retains
recipient identity, request-version and final-decision checks. Stage 7 preserves
the Phase 1.5B route gate and native sign-off/closure prerequisites.

Flexible milestone completion records the actual completer but leaves the
project active even when all milestones finish. Completed milestones cannot be
silently reopened or edited; deletion of milestones with completion/files/notes
denies. Native task order changes and copying a milestone do not erase the
original completion evidence. Existing completed flexible projects remain
closed to ordinary mutation.

Phase 1.5B full-stage/chat/approval snapshot restrictions remain in place.
Assigned native services can be called within their limited authority, but this
phase does not build a new task workspace or restore broad workflow screens to
restricted users. Narrow response/task UI and Universal Tasker ownership remain
later work. Native service integration is not a claim of browser-tested parity
for every Artwork workflow or storage operation.

## 10. Protected server actions and API endpoints

Existing routes delegate to guarded domain exports; calling the export or
bypassing the UI does not skip policy. Coverage includes:

- Project create/edit/pin/delete actions, concept/stage/reopening actions and
  flexible project/milestone actions.
- `/api/project-assets/upload-url`, `/complete`, chat-comment-upload preparation,
  completion/finalization/cancellation, attachment deletion, captions and favorites.
- `/api/projects/[projectId]/private-folders/...`, `/research/folders/...`,
  `/form-drafts/[formKey]` and stage chat comment mutations.
- `/api/flexible-projects/[projectId]/milestones/[milestoneId]/attachments/...`
  and `/api/flexible-project-attachments/[attachmentId]` deletion.
- Authenticated checklist-request responses/uploads and production-approval
  decision actions; the existing recipient checks remain additional requirements.
- Legacy project-completion/document endpoints reach explicitly blocked
  services. All tracker edit actions hit `requireEditableTracker`, which denies.

Direct server-action and upload-route invocation are exercised by the isolated
suite; this is not an HTTP/browser end-to-end test. Preview/download/detail URLs
retain the separately tested Phase 1.5B read policies.

## 11. Remaining legacy boundaries

The updated [LEGACY-ENTRY-POINTS.md](./LEGACY-ENTRY-POINTS.md) identifies the
remaining callers. Existing signed external checklist/production responses retain
their scoped tokens, recipient/version/expiry checks and native workflow
validation. Existing credential-protected scheduled reminders and overdue
processing remain system operations, not V2 user grants. Trusted `*Tx`,
initialization, tag and derived-checklist helpers remain internal composition;
public project initializers require an active authorized transaction.

Global master data/contact directory, account/profile/settings administration
and Archive/Library management are outside this migration. Legacy helpers in
those domains remain; this report does not claim application-wide V2 write
authorization. Phase 1.5C does not modify Archive/Library source files. The
project completion permission seam `project.completeArchive` is explicitly
closed so it cannot finalize a project through legacy project authority.

## 12. Explicitly blocked operations and follow-up

| Boundary | Reason / required future work |
| --- | --- |
| Structured and flexible project creation for every role | No approved versioned template definition or JPM Director-approval proof exists. Old creation grants cannot substitute. |
| Universal/flexible final completion and old completion-document setup/uploads | Requires a durable Director approval/request state machine in Phase 1.5D. Native Stage 7 Director closure is the supported existing exception. |
| Project deletion and ownership transfer | Requires retained history, referential rules and durable audited governance; no destructive shortcut. |
| Approved concept-file revocation/reset | Existing reset would overwrite review evidence; needs version-preserving intervention. |
| Completed milestone/project reopening beyond the explicit concept interventions | Requires its own audited workflow and downstream validation. |
| Collaborator changes | V2 participation uses owner/co-owners/executors; compatibility rows are retained only. |
| Outgoing external email requests/retries | Requires durable post-commit dispatch/outbox and idempotency. Existing previously issued token responses stay isolated. |
| Tracker mutations and restricted full workflow/recipient screens | Requires scoped provenance, narrow projections and safe mutation contracts. |
| Template publishing, Custom Stage Builder, Universal Tasker | Not implemented or enabled by this phase. |

## 13. Test results and outstanding failures

The table below records the initial implementation verification. The production
build failure was resolved during final stabilization; see section 16 for the
current sign-off results. Browser smoke testing remains unperformed.

All database tests used newly initialized PostgreSQL clusters with private Unix
sockets and TCP disabled. The harness verifies the data directory, database and
schema, applies the repository migrations only there, and stops/removes each
cluster afterward. No actual Neon data, account assignment, password or S3
object was used or changed. Synthetic fixture role mutations are confined to
those disposable databases. S3 functions are guarded stubs; realtime/framework
bindings and rich-text rendering are stubbed where required by the Node harness.
The authentication, authorization engine, transaction facade, native services
and Prisma queries run against the disposable database.

| Verification | Result |
| --- | --- |
| `pnpm typecheck` | Passed |
| ESLint on every Phase 1.5C changed TypeScript/TSX/MJS file | Passed, zero warnings/errors |
| `git diff --check` | Passed |
| `pnpm authorization:foundation-check` | Passed |
| `pnpm authorization:persistence-check` | Passed |
| `pnpm permissions:final-check` | Passed; old creation/static legacy expectations updated explicitly to the V2 closed boundary |
| `pnpm authorization:runtime-check` | Passed runtime/session and assignment-service regression suites; empty schema drift |
| `pnpm authorization:project-read-check` | Passed Phase 1.5B matrix, direct service denial, scope/projection and no-read-mutation regressions; empty schema drift |
| `pnpm authorization:project-write-check` | Passed actual native service/action/API invocation tests; empty schema drift |
| `pnpm build` with database URLs overridden to unused localhost port 9 | Bundling compiled successfully after a sandbox worker-port retry. Full build failed at unchanged `scripts/development-provisioning/cli.ts:47`: subprocess `env` lacks Next's required `NODE_ENV` type. Not a successful production build. |
| Browser smoke test | Not run: no local Playwright/Puppeteer or Chrome/Chromium installation was available. No production database was used as a workaround. |

Write integration covers Director non-owned edits and truthful identity; SPM
owner/JPM co-owner edits; unrelated, restricted-role and technical-only denials;
creation/deletion/ownership/participant escalation blocks; forged actor/role and
unknown-action denial; direct server action and upload API denial without rows
created; available/locked draft stages; actual assigned execution and unrelated
task/project denial; completed-stage denial; flexible last-task completion
without project finalization; private owner preservation; Stage 5 checklist
updates; Stage 6 recipient/version/final-decision integrity; reasoned Director
reopening; Director Stage 7 sign-off/closure; rollback of native error objects;
real concurrent role-revocation serialization; stale/expired session denial.

The fixtures preserve native reopening timestamps and closure prerequisites;
those checks were not relaxed to make tests pass. Full historical suites that
assume legacy role-only authority were not presented as V2 integration tests.
Ordinary audit logs are not durability-tested database audit rows, and the suite
does not claim real storage/email delivery coverage. Production-build typing and
browser smoke verification remain outstanding.

## 14. Migration and preservation

No schema or migration change was made for Phase 1.5C. No migration was applied
to Neon. Existing users, roles, passwords, application databases and objects were
preserved. There was no commit, push or deployment. Future approval, durable
audit/outbox or task-ownership schema changes require separate migration review
and approval.

## 15. Recommended next milestone

Phase 1.5D should define and implement governed creation/completion: an approved
versioned template reference, JPM approval with a required SPM co-owner, durable
Director completion requests/decisions and truthful retained audit history.
Design idempotent external delivery and deletion/transfer retention before
reopening those blocked paths. Repair the existing production-build typing
failure and add a browser smoke test against disposable data. Keep Universal
Tasker and Custom Stage Builder as separate later milestones.

## 16. Final stabilization — 2026-10-18

**Production build: PASS. Phase 1.5C is ready for sign-off within the documented
scope and closed governance boundaries.** No authorization or business-function
change was needed. Browser smoke testing remains outside the completed checks.

The failure was reproduced with `pnpm build` and with the full repository
TypeScript project. The exact compiler diagnostic was:

```text
scripts/development-provisioning/cli.ts(47,5): error TS2769: No overload matches this call.
  Overload 3 of 8, '(command: string, args?: readonly string[] | undefined, options?: SpawnSyncOptions | undefined): SpawnSyncReturns<string | NonSharedBuffer>', gave the following error.
    Property 'NODE_ENV' is missing in type '{ PATH: string | undefined; LANG: string; LC_ALL: string; DATABASE_URL: string; CHECKPOINT_DISABLE: string; PRISMA_HIDE_UPDATE_MESSAGE: string; }' but required in type 'ProcessEnv'.
```

Next.js augments `NodeJS.ProcessEnv` with required
`NODE_ENV: 'development' | 'production' | 'test'`. The CLI's explicitly allowlisted
`spawnSync` environment omitted it. The production build checks the CLI through
the root `tsconfig.json`; the narrower `pnpm typecheck` configuration includes
only application source, which explains its earlier success.

The one-line code fix adds `NODE_ENV: process.env.NODE_ENV` to that existing
allowlist. It forwards the caller's environment value without forcing a
development value or inheriting unrelated credentials. The launcher production
guard, target allowlist/fingerprints, database identity/version checks, read-only
schema-check URL, approval checks and authorization policies are unchanged.
No error suppression, type assertion, compiler exclusion or configuration
relaxation was introduced.

Files modified during stabilization (no new files):

- `scripts/development-provisioning/cli.ts` — one-line environment fix at line 47.
- `src/lib/authorization/PROJECT-WRITE.md` — this verification record.

| Final verification | Result |
| --- | --- |
| `pnpm typecheck` | PASS |
| `pnpm exec tsc --noEmit --project tsconfig.json --incremental false` | PASS, including scripts and generated Next route types |
| `pnpm exec tsc --noEmit --project scripts/tsconfig.development-provisioning.json` | PASS |
| `pnpm exec eslint scripts/development-provisioning/cli.ts` | PASS |
| `pnpm authorization:foundation-check` | PASS |
| `pnpm authorization:runtime-check` | PASS |
| `pnpm authorization:project-read-check` | PASS |
| `pnpm authorization:project-write-check` | PASS |
| `pnpm users:v2:check` | PASS; additional disposable provisioning/security regression coverage |
| `pnpm build` | PASS: compiled, TypeScript passed, all 49 static pages generated, optimization completed; exit 0 |
| `git diff --check` | PASS |

Builds explicitly overrode both database URLs to unused localhost port 9.
Database regression suites used fresh local private-socket PostgreSQL clusters,
checked isolation and empty schema drift, and removed the clusters afterward.
The live provisioning command was not run. All nine existing accounts and their
roles were left untouched; no connection to Neon was made by these checks.

Source snapshot comparison confirms unchanged authorization/business code,
account definitions, Prisma schema and migration history. Regression results
confirm Director global authority, SPM/JPM relationship-scoped management,
Designer/Digital Lead restrictions and Technical Administrator separation remain
intact, along with V2 read/write protections. No existing project, Archive,
Library, S3 or Tasker data was changed. There was no push, deployment or Phase
1.5D work. No failures remain in the checks run; browser smoke testing remains
an explicitly unperformed verification.
