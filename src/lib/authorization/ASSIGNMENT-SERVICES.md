# Phase 1.4A — inactive assignment services

Phase 1.5A update: ordinary assignment calls now also use the shared runtime
session resolver and reject version-mismatched/unversioned sessions with
`STALE_SESSION`. Existing transaction locks, authority separation, planner and
audit behavior remain intact. See [RUNTIME.md](./RUNTIME.md). The rest of this
document describes the original Phase 1.4A milestone; it does not supersede the
current runtime rollout boundary.

These are server-only factories, with no instantiated application client, route,
server action, UI caller or environment loading. No V2 assignment, login change,
permission activation or database migration occurs by importing them. The existing
legacy permission resolver and user-management screens are unchanged.

## Ordinary service API

`createRoleAssignmentService({ database, readSessionToken })` takes an explicitly
selected Prisma client and a trusted server callback that reads the current
request's existing session cookie. The callback takes no mutation arguments.
Never build it from a submitted user ID, business role, legacy role or technical
privilege. This is a server composition dependency, not a client-provided option.

All methods validate unknown input, require exactly the listed keys, and reject
extra keys such as `actorUserId`, `fromUserId`, `changeId` or a full assignment.

| Method | Input | Required current authority |
| --- | --- | --- |
| `assignBusinessRole` | `userId`, `businessRole`, `expectedVersion`, `reason` | Active Director |
| `setTechnicalPrivileges` | `userId`, `technicalPrivileges`, `expectedVersion`, `reason` | Active TECHNICAL_ADMIN |
| `setAuthorizationStatus` | `userId`, `accountStatus`, `expectedVersion`, `reason` | Authority for every affected domain, as below |
| `transferDirector` | `toUserId`, `fromExpectedVersion`, `toExpectedVersion`, `outgoingBusinessRole`, `reason` | The active outgoing Director |

`businessRole` accepts the five V2 roles or null (explicitly unassigned), but
acquiring/removing DIRECTOR requires the dedicated bootstrap/transfer operation.
`technicalPrivileges` accepts `[]` or `["TECHNICAL_ADMIN"]`. Neither setter changes
the other domain or account status. Null expectedVersion means no existing V2
mapping; otherwise the exact positive current version is required. All targets
must be existing User records. Legacy roles never imply V2 authority or mappings.

Because accountStatus is shared across both domains, suspending/reactivating a
business account requires Director authority, and an account with technical
privileges requires technical authority. A mixed account requires both. An
unassigned account requires the Director. The Director can never be suspended,
even by a dual-authority actor. Changing a suspended target's role/privileges
preserves suspension; a suspended actor cannot execute any operation. Status
changes here do not affect legacy login or sessions until a later integration.

Results are `{ status: "NO_CHANGE" }` or
`{ status: "APPLIED", changeId, assignments }` after successful commit. Rejections
throw `AuthorizationMutationError` with a code (for example `STALE_VERSION`,
`BUSINESS_AUTHORITY_REQUIRED`, `TECHNICAL_AUTHORITY_REQUIRED` or
`DIRECTOR_TRANSFER_REQUIRED`). Database failures propagate; no success is returned
before commit. No-op writes create neither new versions nor audit history.

## Controlled initial setup

`createDirectorBootstrapInvoker({ database, trustedPublicKeyPem, audience })`
returns a private invocation function accepting `{ payload, signature }`.
`createInitialTechnicalAdministratorInvoker` uses the same trust mechanism with a
separate operation scope. Neither function is available on the ordinary service.

`payload` is a JSON string with exactly these fields:

```ts
{
  operation: "BOOTSTRAP_DIRECTOR" | "INITIAL_TECHNICAL_ADMIN",
  audience: string,
  actorUserId: string,
  targetUserId: string,
  expectedVersion: number | null,
  reason: string,
  changeId: string,
  issuedAt: number,  // Unix milliseconds
  expiresAt: number // Unix milliseconds; at most 10 minutes after issuedAt
}
```

`signature` is the base64url Ed25519 signature of the exact UTF-8 payload bytes.
The independently controlled setup authority must authenticate the actual
operator and approve the operation, target, version, reason and database audience
before signing. The service has no signing key or signing endpoint. Its public
verification key and audience must be pinned by trusted server/operator
configuration to the explicitly selected database, never supplied by the request.
There are no default keys, operator identities, credentials or environment URLs.
This is an explicit setup authorization, not ordinary technical-role eligibility.

The approved operator and target must exist. A mapped suspended operator or target
is rejected. An unmapped operator is permitted only through the separately signed
setup authority; no legacy role is consulted. Expiry is checked against the
database clock inside the locked transaction and rechecked on retries.

Director bootstrap requires zero Directors. It preserves any existing technical
privileges and never grants them automatically. The database uniqueness constraint
and transaction serialization allow only one concurrent winner. Replay is denied
after the first Director is established, including after later transfers.

Initial technical setup grants only TECHNICAL_ADMIN and preserves business role.
It requires no current technical administrator AND no historical technical grant.
Once a technical grant has ever existed, the setup path stays closed even if all
technical privileges are later revoked. It cannot serve as a recovery operation.
Normal grants/revocations subsequently require an active technical administrator.
Revoking the last technical administrator can therefore require a future, separately
approved recovery procedure; no such procedure is implemented or activated here.

To invoke setup later, an approved private server/operator composition creates the
appropriate factory with the selected client, pinned public key and audience, then
passes the signed envelope to the returned function. No public HTTP endpoint,
signing utility or application-database CLI is shipped. Nothing invokes setup here
except tests against synthetic identities and temporary keys.

## Transaction and audit guarantees

The service starts a READ COMMITTED transaction and takes a SHARE ROW EXCLUSIVE
lock on UserAuthorization before reading the complete planner snapshot. This
serializes rare administrative mutations (including direct SQL writers) and absent
row creation. Other application tables are not locked by this governance lock.
The 5-second lock timeout and 15-second transaction timeout bound lock contention.
This conservative table lock favors correctness over high-volume assignment
throughput; reconsider only if measured administrative volume requires it.

Ordinary actors are resolved afresh from the Session table after acquiring that
lock. The session must be unexpired; Prisma's UTC timestamp storage is compared
explicitly against UTC. A shared row lock protects the session against concurrent
revocation until commit. Actor V2 status and authority are checked from the locked
snapshot, never cached session roles. Existing users and expected versions are
verified in the same transaction. Writes use compare-and-set row counts, with
uniqueness also protecting absent records.

The existing pure planner defines transitions. Director transfer derives the
outgoing identity from the authenticated actor, demotes first and promotes second.
Both writes and their audit records commit together or roll back together. The
outgoing non-Director role (or null) is explicit. Project/task ownership is never
rewritten; both accounts retain independent technical privileges.

Only parameterized transaction-local trigger metadata is written: actual actor,
mandatory reason and one server-generated change ID (or signed setup approval ID).
Existing PostgreSQL triggers generate immutable before/after audit rows and
increment versions. There is no competing application audit writer.

Only Prisma P2034 (known transaction abort/write conflict/deadlock) is retried, at
most three attempts, with full authentication, authority, version and setup-expiry
rechecks. Stale operations, lock timeouts, constraint errors and ambiguous connection
or commit outcomes are not automatically retried. An uncertain outcome must be
reconciled through authoritative assignment/history reads, not blindly resubmitted.

## Verification and rollout boundary

Run `node scripts/run-authorization-isolated-integration.mjs --services` with local
PostgreSQL tools installed. It creates a private disposable cluster, disables TCP,
whitelists its environment and verifies its identity. The original migration and
SQL governance suite runs unchanged; a second fresh database tests real Prisma
services. The generated client and compiled test output stay in the disposable
directory, which is removed after shutdown. No dependency installation or inherited
application database URL is used. The suite validates Prisma and checks empty
drift, genuine concurrent calls, signed setup, assignments, transfer/rollback,
privilege separation, audit, retries and preservation of all 88 business tables.

Before applying the migration to development: obtain separate approval, reconcile
that database's migration ledger and actual schema (including absent historical
Tasker migrations), review existing deletion behavior with restrictive references,
and prepare a backup/forward recovery plan without resets or history rewrites.
The automatic deployment migration path remains gated. Before account setup,
select explicit operator/Director/technical targets and configure independently
controlled signing authority and environment binding. Before runtime activation,
add approved route/CSRF protections, session/cache version invalidation and resource
authorization integration. None of those rollout steps is performed in Phase 1.4A.
