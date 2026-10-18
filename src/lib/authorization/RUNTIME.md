# FLUX V2 Phase 1.5A — runtime authorization foundation

Implemented on 2026-10-18. This phase changes authentication, adds the runtime
policy boundary, and strengthens assignment-service session validation. It does
not activate V2 business access by itself. **Phase 1.5B now activates the project
READ slice; see [PROJECT-READ.md](./PROJECT-READ.md) for current coverage and closed
boundaries. Phase 1.5C adds transactional native project WRITE policies; see
[PROJECT-WRITE.md](./PROJECT-WRITE.md).** The coverage/test/recommendation sections below preserve the 1.5A
milestone record; its empty-registry statement is historical.

## Authentication and sessions

`auth.getCurrentActor()` resolves a server-only, immutable `AuthenticatedPrincipal`:
user ID, email/name, business role, independent technical privileges, account
status (`ACTIVE` or `UNASSIGNED`), authorization version and internal session
ID/expiry. It contains no password hash, invite token, cookie or session bearer
token. Do not serialize it to browser props. Domain context belongs to an
individual authorization request and is loaded separately.

`resolveAuthenticatedSession(database, token)` looks up the exact stored token
and joins User/UserAuthorization in one database query. Roles never come from
the browser, legacy User.role, permission profiles or an actor object supplied
to a service. Unknown assignment values fail closed. Absent V2 assignment yields
no business role and no technical privileges, while permitting ordinary legacy
login during the controlled transition.

Login still verifies the existing scrypt password hash and issues the existing
HTTP-only, SameSite=Lax, root-path cookie (Secure in production), with one-day or
30-day expiry. The existing Session.token column stores
`v2.<authorizationVersion|unassigned>.<256-bit-random-value>`. This is an opaque
database session credential, not a self-authenticating JWT. The version is checked
only after the complete token matches a stored Session row. Altering its prefix
cannot authenticate. There is no browser role claim, signing key or new schema.

Session issuance locks UserAuthorization in SHARE mode while reading status and
creating the session, including first-assignment races. Assignment writers use
the existing conflicting governance lock. Suspended accounts cannot log in.

**All pre-1.5A unversioned sessions require a fresh login.** There is no automatic
upgrade of old sessions. A version mismatch always requires authentication again,
even when the role change added privileges. Logout deletes the matching stored
session and expires the cookie, including when that session is already invalid.

Every `getCurrentUser`, `getCurrentActor` and `requireUser` call performs fresh
authentication. The former Next ten-second session cache and React memoization
have been removed. Existing database governance triggers increment versions for
role, technical-privilege and status changes; first assignment also invalidates
an `unassigned` session. Suspension blocks the next authentication check;
reactivation never revives an older token. Expired, deleted, fabricated,
unversioned or mismatched sessions return null. Database failures propagate;
they never fall back to legacy identity or cached authority.

Already-returned responses cannot be recalled. An operation that passed a legacy
check before a concurrent revocation may finish; Phase 1.5A does not wrap every
legacy operation in a transaction. New `runAuthorized` services hold assignment
and session locks through the transaction to serialize revocation. Logout or
assignment changes that wait for such an operation take effect after it commits.

Legacy permission-profile caching remains for unmigrated legacy endpoints only.
Its cache tags, TTL and user-management invalidation cannot grant or retain V2
authority. User-management's old session-tag invalidation is now unnecessary for
authentication but remains untouched with the rest of that legacy flow. Extra
database reads are an intentional cost of immediate revocation; no new cross-
request authority cache was introduced.

## Privilege separation

Director receives eligibility for defined business capabilities, not technical
privileges. SPM and JPM require authorized resources; JPM creation additionally
needs Director approval and an SPM co-owner, while SPM creation requires an approved
template. Designer/Digital Lead task creation stays limited to General/File
Upload; Digital Lead retains its archive category/folder and verification
eligibility. TECHNICAL_ADMIN alone has no business eligibility, approval power,
membership, task ownership or impersonation authority. A dual-role account has
each independently assigned domain. Legacy ADMIN/SUPER_ADMIN never maps into
either V2 domain.

## Policy API and integration contract

`createAuthorizationService({ database, readSessionToken, policies })` is trusted
server composition, not a server action or public dependency injection endpoint.
It reuses Phase 1.1 eligibility and every named requirement from `contracts.ts`.
There is one V2 evaluator; resource loaders supply evidence, not alternate role
rules. Configurable legacy permission profiles are never consulted.

- `authorize({ capability, targetId, reason? })` returns an explicit DENY or ALLOW
  decision. It is a point-in-time check, not a credential for a later mutation.
- `runAuthorized(request, async (tx, grant) => ...)` checks and executes within
  one transaction. A denial throws `AuthorizationDeniedError`. Use the immutable
  grant's actual `actorUserId`, `targetId`, `capability` and validated `reason` for
  the operation/audit. Never write using a separate fabricated actor or owner.
- `auth.getCurrentActor()` is for trusted identity resolution, not authorization
  by role truthiness. No policy/service API accepts a caller-supplied principal.
- `permissions/v2.ts` exposes `hasV2Permission` and `withV2Permission` for gradual
  replacement of legacy call sites. They accept V2 capability names explicitly;
  ambiguous legacy keys such as `project.update` are not automatically translated.

Request objects reject extra keys, including actor, role, privileges, permission
profile and resource context. Unknown capabilities deny. Known eligible
capabilities without a registered adapter deny with `POLICY_NOT_INTEGRATED`.
Missing or mismatched targets/projects deny, including for Director.

A registered loader receives `{ tx, actor, request }`. It must load the target or
creation container, project participation, task owner/executors/spectators,
action-specific resource permission, lifecycle and approval facts from server
storage. Browser-provided IDs only select a target. The loader must validate that
target and lock mutable domain rows for mutations. The evaluator holds the
UserAuthorization SHARE lock, then the Session shared row lock, in the same order
as assignment services. These locks protect the identity through commit; they do
not replace target-specific domain locks or business validation.

`AuthorizationContext` is the typed adapter contract. A project operation or task
creation requires the matching project; a task operation requires both matching
task and project. Non-Director project participation and resource grants are
independent checks. Task ownership, execution and spectator relationships are
checked separately; project ownership never grants task ownership. Spectators
cannot mutate through their relationship. Task review requires an explicitly
approved self-review policy result; no default self-approval rule is invented.

Evidence fields describe enforced facts, never blanket approvals supplied by the
client. `integrity` must prove workflow validity, real actor attribution, unchanged
ownership and preserved history. `taskLifecycleAllowed` and non-empty completion
reasons remain mandatory where specified. Technical operations require support
authorization, an actual audit record/actor and no business impersonation.
Adapters must ensure those facts and the operation agree in the same transaction;
the evaluator itself neither writes audit history nor invents a domain workflow.

`finalCompletionRequiresDirectorApproval` and
`publicationRequiresDirectorApproval` mean a request/proposal cannot finalize or
publish. They do not require Director approval merely to draft/submit a request.
JPM `directorApprovedCreation` is a separate gate at actual project creation.

Director may bypass resource permission and membership/relationship requirements
using independent business authority. The grant records when this is an override.
Target context, lifecycle, completion reasons, review policy, actor attribution,
ownership and history remain mandatory. Nothing rewrites a creator, owner,
executor, prior approval or submission acceptance.

## Enforcement coverage at the end of Phase 1.5A

| Boundary | Phase 1.5A behavior |
| --- | --- |
| Login, logout, getCurrentUser/getCurrentActor/requireUser | Active status, fresh version and expiry/revocation checks |
| Dashboard layout and existing guarded actions/API routes | Inherit the new authentication gate; business permissions remain legacy |
| Ordinary role-assignment service | Shared session resolver/version checks plus existing locked authority/planner/audit |
| V2 resource policy evaluator | Implemented and exercised with isolated database fixtures |
| Production resource registry in runtime.ts | Empty; no V2 project/task/archive/template/technical operation is enabled |
| Legacy synchronous permissions, user management, project/archive/stage/task services | Still unmigrated; no new V2 global grant and no V2/legacy OR fallback |

Legacy endpoints can still apply legacy rights, including shared Archive access
and ADMIN/SUPER_ADMIN authority. This phase does **not** claim that technical-only
or unassigned accounts are restricted to technical operations across the whole
old application. The V2 actor/evaluator gives them no business authority; legacy
domain enforcement is the explicitly recorded remaining work.

See [LEGACY-ENTRY-POINTS.md](./LEGACY-ENTRY-POINTS.md) for the file/line inventory of
direct authority derivation and legacy resolver consumers, including user
management, dashboard/navigation, queries, APIs and UI projections.

## Verification and preservation

`pnpm authorization:runtime-check` uses the existing isolated harness: a newly
initialized local PostgreSQL cluster, private Unix socket, TCP disabled, an
environment whitelist with no inherited application URL, generated temporary
client and automatic shutdown/removal. All 103 repository migrations are applied
only there. Prisma validation and empty schema drift checks pass. The original
governance tests preserve all 88 business tables. Assignment test sessions are
explicitly renewed after fixture role changes; stale-session denial is separately
tested. No test connects to Neon or S3.

Checks executed:

- Full `pnpm typecheck` and targeted ESLint for all changed TypeScript/JavaScript.
- `pnpm authorization:foundation-check`, `pnpm authorization:persistence-check`
  and `pnpm user-role:foundation-check`.
- `node scripts/run-authorization-isolated-integration.mjs --services --runtime
  --provisioning`: governance, assignment concurrency/rollback, runtime and
  provisioning regressions in disposable databases.
- Runtime coverage: all five roles; technical-only/dual/unassigned identities;
  fixed restrictions; SPM/JPM approvals; task owner/executor/spectator separation;
  Director integrity; unknown/unintegrated capabilities; absent/mismatched
  context; forged role/actor/profile/evidence; suspension; role/privilege/status/
  first-assignment version changes; expired/old/deleted/fabricated tokens;
  direct assignment calls; real auth/password/Prisma login/logout logic, cookie
  options, remember-me, replay prevention and requireUser redirects.
- Framework tests stub Next request cookies/redirects and legacy permission
  snapshots; they do not claim a browser or live Neon end-to-end test.
- `pnpm permissions:final-check` fails at `Stage 7 USER route gate`. The identical
  failure was reproduced from a clean `git archive HEAD` copy, confirming it
  predates this phase. Stage 7 and the checker were left unchanged.

No users were recreated, reassigned or given new passwords outside disposable
fixtures. No business workflows/data, approval records, historical migrations,
storage or deployment configuration were changed. No push or deployment occurred.

**Migration approval: none needed.** Prisma schema and migrations are unchanged;
session version binding uses the existing token column. No development database
schema operation was performed or requested.

## Original Phase 1.5B recommendation (now implemented; see PROJECT-READ.md)

Deliver one complete project read-access slice: project discovery/list/detail
and the dashboard/sidebar/search/count projections of that visibility. Implement
the production `project.view` adapter and a matching scoped query builder for
Director, SPM/JPM and Designer/Digital Lead participation, explicitly excluding
technical-only/unassigned business access. Cover traditional and flexible
projects and all corresponding page, API and direct service entry points.

Replace legacy global-project bypasses only in that slice, remove the associated
OR fallbacks, and test direct URL/service calls, pagination/count leakage,
suspension/version changes and Director attribution. List queries cannot treat
a target-free `project.view` decision as unconditional access. Register the
capability only when every entry point in the slice enforces it.

Defer project mutations/creation/approvals, stage workflows and Tasker to later
domain work; defer Archive/Library/S3-facing access integration to its own slice.
User/account administration and permission-profile UI also remain explicit
pending integrations: use the existing separated assignment services, never a
Director-to-ADMIN conversion or technical-to-business bypass.

## Files

Created:

- `src/lib/authorization/session.ts`
- `src/lib/authorization/policy.ts`
- `src/lib/authorization/runtime.ts`
- `src/lib/permissions/v2.ts`
- `scripts/authorization-runtime-integration-check.ts`
- `scripts/tsconfig.authorization-runtime.json`
- `src/lib/authorization/RUNTIME.md`
- `src/lib/authorization/LEGACY-ENTRY-POINTS.md`

Modified:

- `src/lib/auth.ts`
- `src/lib/authorization/role-assignment-service.ts`
- `src/lib/authorization/contracts.ts` (runtime terminology only)
- `src/lib/authorization/definitions.ts` (runtime terminology only)
- `src/lib/authorization/eligibility.ts` (runtime terminology only)
- `src/lib/authorization/README.md`
- `src/lib/authorization/ASSIGNMENT-SERVICES.md`
- `src/lib/permissions/README.md`
- `scripts/authorization-services-integration-check.ts`
- `scripts/development-provisioning-integration-check.ts`
- `scripts/development-role-setup-integration-check.mjs`
- `scripts/run-authorization-isolated-integration.mjs`
- `package.json`
