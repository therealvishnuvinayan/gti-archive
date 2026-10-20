# Phase 1.5B — project READ authorization

Phase 1.5D adds scoped governance inboxes without relaxing these project reads:
see [PROJECT-GOVERNANCE.md](./PROJECT-GOVERNANCE.md).

Implemented 2026-10-18. This is the current project-read report; it supersedes the
project-read portions of the historical Phase 1.5A inventory. Phase 1.5C now adds
native project mutation authorization: see [PROJECT-WRITE.md](./PROJECT-WRITE.md).
The write exclusions, registry counts and test outcomes below describe the end of
Phase 1.5B; the read boundary remains in force.

## Policies and registry

`runtime.ts` registers exactly `project.view`, `project.viewContext`,
`project.viewStage`, `project.viewFile`, and `project.viewFolder`.
`project-read-policies.ts` resolves namespaced structured/flexible project,
stage, attachment, concept, research-folder and private-folder targets from
Prisma. Unknown capabilities, target kinds, missing records and mismatched
resource associations deny. Non-Director membership and resource permission
remain separate checks in the existing central evaluator.

`project-read-rules.ts` supplies the same relationship predicates for list/count
queries. Its synchronous compatibility decisions require object identity bound
by server authentication; copying a user, adding a role, or serializing it does
not create authority. Public read services reload the actual session and compare
the expected user ID. They ignore supplied legacy roles/profiles. Raw principals,
scope builders and dependency-injected policy factories are trusted server
composition, not public endpoints. Session expiry, active status and authorization
version remain enforced by Phase 1.5A.

| Business identity | Structured projects | Flexible projects |
| --- | --- | --- |
| Director | All projects, stages, participants and READY files, including private folders; no membership required | All projects, milestones and READY files |
| SPM/JPM | Full read as actual owner/co-owner; executor or collaborator alone gets context | Full read as owner or existing collaborator; milestone responsibility alone gets context |
| Designer/Digital Lead | Context through a stored relationship; only own assigned concepts/files and specifically authorized folders | Context through owner/collaborator/milestone relationship; only own assigned milestones/files |
| Technical-only/unassigned | Denied, including legacy ADMIN/SUPER_ADMIN and stored membership | Denied |

Creation alone is not an additional read grant. Restricted roles do not acquire
full workflow access even if recorded as owner/co-owner. Structured collaborator
flags do not establish a new management role. No implicit responsibility or
support impersonation is invented.

## Restricted response

`getRestrictedProjectContext` and `getRestrictedFlexibleProjectContext` use
`runAuthorized` and explicit Prisma selections. Responses contain project
identity/name, real creator/owner names, project brief, available markets and
deliverables, deadline, and only the actor's assigned work. Tasks expose their
brief/deadline, real assigner where stored, authorized folder references and safe
file metadata. No budget, full stage workflow, unrelated assignments, contact
directory, storage credentials or other participants' private files is returned.

`stageBrief` is explicitly null: there is no independently authorized stage brief
to expose in this model. Flexible milestones have no stored assigner/folder
equivalent, so those fields are null. These are existing concepts/milestones, not
an implementation of Universal Tasker. The UI renders the server projection.

Structured executors retain access to canonical Brief/Tech research trees.
Private folders require their actual owner or Director. Other noncanonical
research workspaces require Director. Limited file access requires the actor's
assigned concept/starting reference or assigned flexible milestone. File/project,
stage/project and folder/project associations are checked; only READY files can
be signed. Private/research assets without a valid folder association deny.

## Screens, services and indirect reads

- Structured discovery, search, filters, list cards, counts, recent items, detail,
  shell, overview and stage routes use V2 scope. Restricted cards omit workflow,
  budget, unrelated participants and tags. Searches for restricted rows use safe
  names rather than hidden workflow fields. Mixed lists use name ordering.
- Flexible management lists/details remain full-read projections. The companion
  context index displays limited projects separately with safe links; the detail
  route falls back to a restricted milestone projection. Full-list count plus
  limited-context count equals the visible flexible total.
- Dashboard total uses the same structured/flexible visible index. Workflow KPIs,
  stages, deadline/attention panels and status subtotals use full-readable
  projects only; a restricted project contributes to the visible total without
  disclosing its workflow status. Assigned-task counts select only actor tasks
  (Director can see all). Structured sidebar totals are per structured type.
- Stage 1 inquiry, Stage 2 research, Stage 3/4 concept workspaces/chat, Stage 5,
  Stage 6, Stage 7, history, comparison via its project guard, completion records,
  document reads, drafts and inquiry-history suggestions are guarded. Direct
  restricted stage/chat access is denied; task links lead to safe project context.
- Structured/flexible attachment preview/download, private-folder pages/files,
  research-folder pages/files/text and import-option reads enforce V2 scope.
  Director's overview includes a file/folder index for discovery. Director may
  open locked stages for reading; stored workflow status stays unchanged.
- Project-backed Library rows and Archive search/list/count/download/preview
  paths require project scope. Flux AI uses the scoped Archive search. Manual
  Archive/Library assets retain their independent legacy domain rules. Chat AI
  checks full project access; stage-summary generation checks project and stage.
- Notification rows, unread counts and filtered totals use the same full-readable
  project-ID set and actual recipient. Unlinked historical notifications and
  restricted workflow notifications are omitted because their text/snapshots
  cannot be safely projected from existing fields.
- Non-Director calendar reads expose only the actor's own generic events and
  reminders. Shared unlinked calendar text and project/payment events are closed
  until project references exist. Director can see project/payment events;
  generic personal events still follow existing calendar visibility.

Director identity is never substituted for owner, creator, executor or assigner.
Stage 5 and completion views no longer create missing checklists/workflows. A
missing checklist reads as empty; a missing completion workflow reads as null.
Write flows must explicitly create needed state in their own authorized action.
Project viewing does not update membership, ownership or workflow status.

## Explicitly closed or legacy boundaries

| Boundary | Current behavior / follow-up |
| --- | --- |
| Tracker workspace and trash | Denied before loading or reconciling the shared saved spreadsheet. Cell copies/activity/snapshots need resource provenance and a read-only loader. |
| Project Ably subscriptions | New project-channel tokens denied. HTTP reads remain available and reauthenticate. Persistent subscriptions cannot currently enforce per-event session/version/relationship changes. Notification invalidation channels contain no project payload and retain recipient scope. |
| Restricted stage chat, comparison, checklist/approval/handover snapshots and workflow notifications | Full-read gate; no broad legacy recipient/admin fallback. Build narrow request/task projections in a later phase before restoring these screens for limited participants. Existing signed external approval/handover/archive links keep their explicit bearer-token scope and expiry; no new external grants were added. |
| Flexible full-list/detail helpers | Intentionally full-read only. Limited participation is exposed through the context index/context route, not those management-shaped responses. |
| Archive/Library management, creation, mutation, approval transitions, role/profile administration | Still legacy. Project-read filters do not implement V2 write authorization or the future Archive verification policy. |
| Internal raw loaders and legacy write helpers | `getProjectStageAccessRecordById`, default `getResearchFolderAccess`, `hasFlexibleProjectAccess`, concept management/work helpers and legacy global-role helpers remain for trusted internals/writes. They are not public V2 read grants; do not use them as new read entry points. |

Already-issued S3 URLs, external share links, previously returned data and existing
Ably credentials cannot be recalled by this code change. Their configured expiry
still applies; deployment/session-token invalidation policy is separate work.
Legacy services using `authorize` then fetching data have a point-in-time read
decision; they do not claim transactional domain-membership locking. The restricted
context services use `runAuthorized` with identity/session locks. No new authority
cache is introduced; project lists/counts and history are no longer cached across
requests. Long-running legacy mutations remain outside this phase's guarantee.

## Verification and Stage 7 investigation

The new `authorization:project-read-check` uses a new private PostgreSQL cluster,
Unix socket only, no inherited application URL/credentials, synthetic fixtures,
and the existing schema chain copied into disposable storage. It does not touch
Neon or S3 objects and removes the cluster afterward. No new migration/schema
change is present.

Coverage includes all five business roles, technical-only/unassigned legacy
administrators, owner/co-owner/executor/nonparticipant, restricted-role ownership,
both project types, stage/file/folder denial, context field whitelist, real owner
identity, forged users/extra actor fields, unknown targets, unregistered writes,
expired/stale-version sessions, list/count/dashboard/flexible alignment, scoped
notifications/Library, Director private-folder read-only flags and no view-induced
project/membership/workflow changes. Real auth, policies, Prisma and read services
are exercised; Next cookies/cache, legacy permission snapshots, pure fixture text
rendering, signing and realtime boundaries are stubbed. Object operations and
realtime publication throw. This is not a browser or live-storage test. The local
dependency tree lacks some sanitizer/Ably transitive modules; isolated tests do
not substitute for a production build/dependency verification.

Stage 7 was a real pre-existing static-check failure: the checker on unmodified
`HEAD` demanded `!isBusinessAdministratorRole(user.role)` on stages 1/2/5/6/7,
but Stage 7 did not contain it. It affects this read slice. A blanket legacy USER
ban would also reject a V2 Director. The checker now explicitly requires central
full-project authorization and a denied-read state on all five routes; executable
tests verify Director access and restricted/technical denial at the service.
Legacy write-manager assertions remain. The old user-role foundation fixture
was also updated explicitly: a hand-built legacy profile cannot grant project
navigation/read access. Actual positive grants are covered by the session-backed
suite.

### Executed checks

| Check | Result |
| --- | --- |
| `pnpm authorization:foundation-check` | Passed |
| `pnpm authorization:persistence-check` | Passed |
| `pnpm user-role:foundation-check` | Passed with the explicitly updated legacy-profile read-denial assertions described above |
| `pnpm authorization:project-read-check` | Passed: isolated governance/schema verification, role/resource matrix, actual read services, session invalidation and read-side-effect checks; disposable cluster removed |
| `pnpm authorization:runtime-check` | Passed: isolated governance, assignment services and Phase 1.5A runtime regressions; disposable cluster removed |
| `pnpm permissions:final-check` | Passed, including the explicit Stage 7 read-gate correction |
| `pnpm typecheck` | Passed using the repository's `tsconfig.typecheck.json` |
| ESLint on all 57 changed TypeScript/TSX/MJS source files | Passed, zero errors and zero warnings |
| `git diff --check` | Passed |
| Prisma schema/migration changes | None; isolated runs also confirmed zero schema drift |

An initial generic `pnpm exec tsc --noEmit` failed on stale generated `.next`
route references and an existing provisioning-test `ProcessEnv.NODE_ENV` typing
issue. The supported repository typecheck above passes. No browser test or
production build was performed; the dependency limitations described above
remain a separate verification boundary.

## Recommended Phase 1.5C

Integrate bounded project/task mutation policies with current session validation,
transactional resource/relationship checks, real-actor audit and explicit workflow
transitions. Separate execution from management and Director intervention. Build
safe recipient/task read projections before reopening the closed legacy screens;
move lazy initialization into explicit authorized writes. Address tracker
provenance and realtime revocation separately. Do not combine this with Universal
Tasker, project creation redesign or Archive verification without a confirmed
scope.

No user assignments/passwords/accounts were changed. No bootstrap against the
application, live migration/reset, S3 object operation, push or deployment occurred.
Pre-existing Phase 1.5A workspace changes were retained.

## Exact Phase 1.5B file manifest

Compared with the workspace snapshot taken before this phase, preserving the
already-present Phase 1.5A edits. Git status includes that earlier uncommitted
work too; it is not used to attribute this phase.

### Created (8)

- [scripts/authorization-project-read-integration-check.ts](../../../scripts/authorization-project-read-integration-check.ts)
- [scripts/tsconfig.authorization-project-read.json](../../../scripts/tsconfig.authorization-project-read.json)
- [src/components/projects/restricted-project-context.tsx](../../components/projects/restricted-project-context.tsx)
- [src/lib/authorization/PROJECT-READ.md](PROJECT-READ.md)
- [src/lib/authorization/project-context.ts](project-context.ts)
- [src/lib/authorization/project-read-policies.ts](project-read-policies.ts)
- [src/lib/authorization/project-read-rules.ts](project-read-rules.ts)
- [src/lib/authorization/project-read.ts](project-read.ts)

### Modified (56)

- [package.json](../../../package.json)
- [scripts/final-permissions-regression-checks.mjs](../../../scripts/final-permissions-regression-checks.mjs)
- [scripts/run-authorization-isolated-integration.mjs](../../../scripts/run-authorization-isolated-integration.mjs)
- [scripts/user-role-foundation-check.ts](../../../scripts/user-role-foundation-check.ts)
- [src/app/(dashboard)/projects/[slug]/page.tsx](../../app/(dashboard)/projects/[slug]/page.tsx)
- [src/app/(dashboard)/projects/[slug]/stages/1/page.tsx](../../app/(dashboard)/projects/[slug]/stages/1/page.tsx)
- [src/app/(dashboard)/projects/[slug]/stages/2/page.tsx](../../app/(dashboard)/projects/[slug]/stages/2/page.tsx)
- [src/app/(dashboard)/projects/[slug]/stages/5/page.tsx](../../app/(dashboard)/projects/[slug]/stages/5/page.tsx)
- [src/app/(dashboard)/projects/[slug]/stages/6/page.tsx](../../app/(dashboard)/projects/[slug]/stages/6/page.tsx)
- [src/app/(dashboard)/projects/[slug]/stages/7/page.tsx](../../app/(dashboard)/projects/[slug]/stages/7/page.tsx)
- [src/app/(dashboard)/projects/flexible/[projectSlug]/page.tsx](../../app/(dashboard)/projects/flexible/[projectSlug]/page.tsx)
- [src/app/(dashboard)/projects/page.tsx](../../app/(dashboard)/projects/page.tsx)
- [src/app/api/realtime/ably/token/route.ts](../../app/api/realtime/ably/token/route.ts)
- [src/components/projects/concept-stage-route.tsx](../../components/projects/concept-stage-route.tsx)
- [src/components/projects/project-overview-workspace.tsx](../../components/projects/project-overview-workspace.tsx)
- [src/components/projects/stage-two-workspace.tsx](../../components/projects/stage-two-workspace.tsx)
- [src/components/projects/user-project-workspace.tsx](../../components/projects/user-project-workspace.tsx)
- [src/components/projects/user-projects-browser.tsx](../../components/projects/user-projects-browser.tsx)
- [src/lib/ai/access.ts](../ai/access.ts)
- [src/lib/archives.ts](../archives.ts)
- [src/lib/auth.ts](../auth.ts)
- [src/lib/authorization/LEGACY-ENTRY-POINTS.md](LEGACY-ENTRY-POINTS.md)
- [src/lib/authorization/README.md](README.md)
- [src/lib/authorization/RUNTIME.md](RUNTIME.md)
- [src/lib/authorization/definitions.ts](definitions.ts)
- [src/lib/authorization/eligibility.ts](eligibility.ts)
- [src/lib/authorization/policy.ts](policy.ts)
- [src/lib/authorization/runtime.ts](runtime.ts)
- [src/lib/calendar.ts](../calendar.ts)
- [src/lib/dashboard.ts](../dashboard.ts)
- [src/lib/flexible-project-attachments.ts](../flexible-project-attachments.ts)
- [src/lib/flexible-projects.ts](../flexible-projects.ts)
- [src/lib/library.ts](../library.ts)
- [src/lib/notification-center/service.ts](../notification-center/service.ts)
- [src/lib/permissions/README.md](../permissions/README.md)
- [src/lib/permissions/resolver.ts](../permissions/resolver.ts)
- [src/lib/project-completion.ts](../project-completion.ts)
- [src/lib/project-concept-access.ts](../project-concept-access.ts)
- [src/lib/project-concepts.ts](../project-concepts.ts)
- [src/lib/project-form-drafts.ts](../project-form-drafts.ts)
- [src/lib/project-history.ts](../project-history.ts)
- [src/lib/project-inquiry.ts](../project-inquiry.ts)
- [src/lib/project-private-folders.ts](../project-private-folders.ts)
- [src/lib/project-research-access.ts](../project-research-access.ts)
- [src/lib/project-research-files.ts](../project-research-files.ts)
- [src/lib/project-research-import.ts](../project-research-import.ts)
- [src/lib/project-research.ts](../project-research.ts)
- [src/lib/project-stage-summary.ts](../project-stage-summary.ts)
- [src/lib/project-tracker.ts](../project-tracker.ts)
- [src/lib/projects.ts](../projects.ts)
- [src/lib/stage-five.ts](../stage-five.ts)
- [src/lib/stage-seven.ts](../stage-seven.ts)
- [src/lib/stage-six.ts](../stage-six.ts)
- [src/lib/user-project-workspace.ts](../user-project-workspace.ts)
- [src/lib/user-projects.ts](../user-projects.ts)
- [src/lib/user-tasks.ts](../user-tasks.ts)

