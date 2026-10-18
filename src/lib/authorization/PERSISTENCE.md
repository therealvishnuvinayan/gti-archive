# Phase 1.2 — inactive role persistence foundation

No assignments, database connections, migrations, seeds or user changes are run by
this module. `assignment-plans.ts` is a pure planner without Prisma, session or
permission-resolver imports. Its successful result is
`REQUIRES_AUTHORIZED_TRANSACTION`, never an authorization grant or executed write.

## Storage boundary

`UserAuthorization` is an optional one-to-one record keyed by existing `User.id`:

- `businessRole`: nullable enum with the five Phase 1.1 business roles. Null is
  unassigned; there is no inferred mapping from `User.role`.
- `technicalPrivileges`: independent enum array, empty by default. Currently only
  TECHNICAL_ADMIN is supported, with SQL enforcing set semantics (no duplicates).
- `accountStatus`: ACTIVE or SUSPENDED, default ACTIVE on explicit initialization.
- `authorizationVersion`: positive integer, initially 1. SQL increments it exactly
  once for a business-role, privilege or status change. A no-op does not increment.
- Creation/update timestamps; no identity, credential or session data is copied.

An absent record means not mapped to V2, not a default business role. No records are
backfilled. A separate table keeps existing User scalar fields and default Prisma
user selections unchanged, even when a client is generated from the new schema.
There is no runtime read fallback to legacy roles in this foundation.

`UserAuthorizationChange` stores actor, subject, change ID, reason, version, time
and before/after V2 snapshots. Its primary key is `(userId, authorizationVersion)`.
The actor and subject reference real User records with RESTRICT deletion/update;
snapshots do not contain passwords or other identity fields. A transfer uses one
change ID and two audit rows, preserving both accounts' actual history.

SQL triggers create audit rows atomically with effective assignment/status changes.
History cannot be updated, deleted or truncated. Assignment records cannot be
deleted/truncated: suspend access instead. Missing/blank actor, reason or change ID
rejects a write. Attribution identifies an actor; it does not prove authorization.
Database ownership/superuser access can bypass safeguards and is outside application
privileges; operational access controls remain necessary.

## Director governance

The partial unique index permits at most one active Director, including concurrent
bootstrap attempts. A check constraint prevents a Director record being suspended.
Zero Directors is permitted before initial setup; no account is activated here.

The planner has explicit `BOOTSTRAP_DIRECTOR` and `TRANSFER_DIRECTOR` commands.
Ordinary assignments cannot acquire or remove the Director role. Bootstrap requires
no existing Director and an active target (or an explicitly initialized record).
Transfer requires the current Director, a different active target and matching
expected versions. The caller explicitly chooses the outgoing non-Director role
or null; no business role or technical privilege is silently inferred.

Transfer demotes the outgoing Director first, then promotes the recipient inside
one transaction. Immediate uniqueness prevents two Directors. A deferred constraint
trigger rejects a commit that removes the existing Director without a replacement.
Both versions advance, technical privileges are preserved independently, and audit
rows commit or roll back with the assignments. Once bootstrapped, losing the sole
Director through demotion, suspension, account deletion or record truncation is
blocked by these invariants. SQL enforces the invariants; the future authorized
writer must enforce the explicit bootstrap/transfer workflow.

Suspending ordinary accounts retains roles, technical assignments and history,
increments the version, and can be reversed with another audited/versioned change.
It does **not** block current login or revoke sessions in this phase: authentication
still uses the legacy model. Neither status nor version may be presented as an
active access-control safeguard until runtime integration is approved.

## Future writer requirements — not implemented

1. Resolve the actual authenticated actor and authorize the specific operation.
   Business role management and technical privilege management need independent
   authorization. Technical administration alone never authorizes business changes;
   Director authority alone never authorizes technical grants. Bootstrap and
   exceptional recovery need separately approved, audited operator procedures.
2. Start a transaction, serialize governance changes and re-read authoritative
   assignments. The pure planner expects the complete V2 snapshot. Resolve target
   identities against User; missing assignment records do not prove users exist.
3. Check expected versions atomically on each write; null expects an absent record.
   Enforce affected-row counts and retry/reject stale plans, unique violations and
   serialization failures. A previously produced plan is never sufficient evidence.
4. Set `flux.authorization_actor_id`, `flux.authorization_reason` and
   `flux.authorization_change_id` transaction-locally from trusted server context.
   Generate one unique change ID per operation. These settings supply trigger audit
   metadata, not authority; never accept a caller-supplied actor identity as proof.
5. Apply ordered changes in the same transaction. Let SQL produce versions and
   history; do not insert audit snapshots manually or disable/defer uniqueness.
6. After commit, invalidate affected permission caches and sessions using the new
   version/status. Legacy User.role changes also need an explicit bridge before
   versions can represent *all* effective authorization changes.

No HTTP endpoint, server action, CLI account-assignment script, account mapping,
session column or new runtime permission engine is introduced by Phase 1.2.

## Migration scope and rollout gate

`prisma/migrations/20261018120000_v2_authorization_foundation/migration.sql` creates
only three enums, two new tables and their indexes/functions/triggers. It references
the existing User primary key but alters no existing table, role enum or record.
It performs no backfill, seed, grant or destructive cleanup.

The seven historical Tasker migrations remain absent and untouched. Their SQL uses
different objects from this foundation. This permits an isolated additive candidate
to be authored from the repository schema; it does **not** establish deployed schema
compatibility. Reconcile `_prisma_migrations` and actual objects in an explicitly
authorized later task before application. Do not replay historical migrations or
accept a reset as reconciliation. Do not use `db push` to substitute for this SQL:
Prisma cannot express the partial index, checks and triggers used here.

Deployment is blocked until that review and PostgreSQL transaction/concurrency
tests are approved. Existing `vercel-build` runs `scripts/prisma-migrate-deploy.mjs`;
this candidate must not be pushed/deployed automatically before the gate is met.

## Legacy dependencies retained

| Existing path | Dependency/conflict | Treatment |
| --- | --- | --- |
| `user-role-compatibility.ts`, `permissions/{definitions,effective,profiles,resolver}.ts` | SUPER_ADMIN/ADMIN business-wide access and editable legacy permission profiles conflict with final separation | Retain now; replace authority paths only during approved V2 integration |
| `project-creation.ts`, `project-owner-candidates.ts`, project/workspace access helpers | Legacy ADMIN/USER classifications select owners, co-owners, executors and visibility | Retain; adapt during participation integration |
| `user-permissions.ts`, user-management actions/UI | Mutate legacy User.role and archive settings, not V2 assignments/history/version | Retain; add an authorized V2 management boundary later |
| `auth.ts` | Sessions cache legacy User; new suspension/version is not evaluated | Retain; integrate status/version checks and invalidation in a dedicated phase |
| `collaboration.ts` global user deletion | A mapped or audited account will gain RESTRICT references not covered by the existing pre-delete checks | Retain; handle refusal and prefer suspension before account mapping goes live |
| `library.ts`, archive checks in `permissions/resolver.ts` | Legacy role-based Library management and universal Archive access do not implement final V2 rules | Protected and untouched; targeted later phases only |

No legacy removal is proposed for this phase. Archives, Library, S3, projects,
attachments and their existing relationships are preserved.

## Validation boundary

`pnpm authorization:persistence-check` runs isolated transition tests and static
schema/SQL checks. `pnpm authorization:foundation-check` retains Phase 1.1 coverage.
Prisma schema validation can run offline on a temporary schema copy with a dummy
URL and no project environment loading. No generated application client is changed.
Static SQL checks and schema validation do not execute PostgreSQL constraints or
prove concurrency behavior; database integration tests remain explicitly deferred.
