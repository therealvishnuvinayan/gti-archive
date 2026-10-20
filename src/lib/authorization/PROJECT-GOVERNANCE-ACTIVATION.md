# Phase 1.5D — development activation review

Verified 2026-10-18. **Authorized migration and post-migration verification PASS.**
Following explicit user approval, only `20261018170000_project_governance` was
applied to `flux-v2-dev / develop / neondb`. The command completed successfully at
`2026-10-18T17:09:54.993Z`; the post-migration snapshot was captured at
`2026-10-18T17:10:05.030Z`. No preset approval, project creation, account change,
push, deployment or later-phase work was performed.

## Migration execution result

The target, exactly one pending migration, the reviewed SHA-256, all 103 historical
checksums, existing schema, accounts/data fingerprints and recovery access were
reconfirmed before execution. They matched the approved review. The controlled
procedure then invoked Prisma migration deployment once against the reviewed
staging copy. There was no failure, retry, reset or repair operation.

| Post-migration check | Result |
| --- | --- |
| Database version | PostgreSQL `18.6 (653b019)` |
| Successful migrations / pending | **104 / 0**; all checksums match |
| Tables / Prisma drift | **96 / NONE** |
| Existing accounts, passwords and roles | All nine preserved; complete User and UserAuthorization row fingerprints unchanged |
| Existing authorization audit | All nine UserAuthorizationChange records preserved unchanged |
| Historical migration ledger | All 103 prior rows preserved unchanged |
| Existing application data | All 90 pre-existing application-table row counts and fingerprints unchanged |
| Existing table definitions and enums | Unchanged; only the reviewed additions appeared |
| Existing guard functions / custom triggers | All five functions and eight triggers unchanged |
| New governance constraints | 18 foreign keys and five CHECK constraints, all validated |
| New governance indexes / triggers | 22 indexes including primary keys, all valid/ready; ten enabled triggers |
| New guard function | Body matches the reviewed migration SQL |
| New governance data | All five tables empty; zero preset approvals or requests |
| Unexpected schema/data differences | None |

Execution evidence: `/private/tmp/flux-phase15d-migration-execution/`, including
`preflight.json`, `before.json`, `after.json`, `provider.json`,
`prisma-deploy.log` and `verification.json`. The controlled execution helper is
`/private/tmp/flux-phase15d-controlled-migration.mjs`. Inspection and postchecks
used database-enforced read-only connections. Only Prisma migration deployment
received the write-capable direct connection.

**Migration verification is complete. Work stopped at the user's requested
boundary. The Artwork preset remains unapproved; no projects were created.**
The sections below retain the pre-activation review and isolated-test evidence.

## 1. Verified development target and state before migration

| Item | Observed value |
| --- | --- |
| Neon project | `flux-v2-dev` / `little-hall-78798085` |
| Branch | `develop` / `br-frosty-moon-b43rvpbe` |
| Endpoint | `ep-raspy-salad-b4iqfan0` |
| Direct host | `ep-raspy-salad-b4iqfan0.c-6.us-east-2.aws.neon.tech` |
| Pooled host | `ep-raspy-salad-b4iqfan0-pooler.c-6.us-east-2.aws.neon.tech` |
| Database / schema | `neondb` / `public` |
| PostgreSQL | `18.6 (653b019)` |
| Applied migrations | 103, all finished, no rolled-back/failed entries |
| Historical checksums | All 103 match the local migration files |
| Pending migrations | Exactly `20261018170000_project_governance` |
| Existing schema | 91 tables; empty Prisma diff against the pre-governance schema |
| Current accounts | Nine active accounts; all expected roles match |
| Recovery retention | 21,600 seconds / six hours, confirmed by Neon metadata |

Provider metadata independently maps this endpoint to the named development
branch. All SQL inspection used `default_transaction_read_only=on`; the transaction
reported both default and current read-only settings as `on`. No application
session token or password was extracted or used.

The account assignments remain one Director, two SPMs, one JPM, two Designers,
one Digital Lead and two technical-only administrators. All authorization versions
are 1; the nine authorization audit records are retained. The Director is the
actual configured account, Slavomir Kluziak. Legacy `User.role` remains `USER`
for all nine; it grants no additional business authority.

The only nonempty tables observed were User (9), UserAuthorization (9),
UserAuthorizationChange (9), Session (1), ProjectStatusGroupOption (6),
ProjectStatusOption (10) and the migration ledger (103). Preservation fingerprints
for all existing tables, five existing functions and eight custom triggers were
captured privately for the post-activation comparison. Fingerprints are evidence
for comparison, not a data backup.

Recovery readiness was checked without creating or restoring a branch. Neon
successfully returned the historical schema at `2026-10-18T16:58:51.633Z` (HTTP 200,
captured WAL LSN `0/22B8610`). This verifies access to historical state; a restore
was not executed. Refresh the recovery timestamp immediately before activation:
the six-hour window expires and is not a permanent backup.

## 2. Exact approved Neon operation — completed

Applied only the reviewed migration:

`20261018170000_project_governance`

SHA-256:

```text
73042f202836b90286ad04bcec1595027ba767e785f4e7ad42d13674715e1e5f
```

It adds five governance tables, two enums, 17 explicit indexes, 18 foreign keys,
five CHECK constraints, one guard function and ten triggers. It does not update
existing business rows or seed preset approvals. Expected result: **104 migrations
and 96 tables**. User, password and role records must remain identical.

A private reviewed copy of the schema and all 104 migrations is staged at
`/private/tmp/flux-phase15d-reviewed-migration/`; `review.json` records every
migration hash and the target identity. Staged schema SHA-256:
`b90ed15fca03a0f212207d66ab9ca073433f3c1c80ce58f3785562bc07d0f730`.

The procedure executed after explicit approval was:

1. Recheck provider endpoint/branch identity, recovery availability, the 103-entry
   ledger/checksums, account state, existing schema and every staged file hash.
   Abort if anything unexpected differs or another migration is pending.
2. Supply the allowlisted **direct** connection privately through the subprocess
   environment and run the installed Prisma CLI against only the reviewed copy:

   ```sh
   node /Users/vishnuvinayan/Projects/GTI/gti-archive/node_modules/prisma/build/index.js migrate deploy --schema /private/tmp/flux-phase15d-reviewed-migration/schema.prisma
   ```

3. Verify the new ledger entry/checksum, 104 migrations, 96 tables, no Prisma
   drift, validated constraints/guards, zero preset approvals and unchanged
   pre-existing rows/roles. Stop on any unexpected result; no automatic repair,
   reset, migration resolution or deletion is authorized.

`pnpm build` runs `prisma generate && next build` and does **not** migrate.
`pnpm vercel-build` invokes `scripts/prisma-migrate-deploy.mjs` before building
and **does automatically deploy pending migrations**. It was not run.

## 3. Isolated migration and regression verification

Fresh disposable PostgreSQL 14.19 clusters used private Unix sockets with TCP
disabled. They contained fictional accounts/data only and were removed afterward.
The isolated database version differs from Neon 18.6; the live preflight separately
verified the existing Neon schema and migration compatibility without writing.

| Scenario | Result |
| --- | --- |
| Actual 103 → 104 upgrade with nine pre-existing fixture accounts | PASS; every pre-existing row preserved; no preset seeded |
| Prisma schema consistency after upgrade | PASS; empty diff |
| Foreign keys and CHECK constraints | PASS; all 18 FKs and five checks validated; invalid reference/hash writes rejected |
| Foundation and assignment-service regressions | PASS |
| Runtime/session/version/technical-business separation | PASS |
| Project-read and project-write regressions | PASS |
| Request/decision persistence and actual audit attribution | PASS |
| Immutable configuration, completion evidence and audit history | PASS |
| Concurrent decisions/activation and replay prevention | PASS |
| Director direct Artwork creation | PASS; integration and browser |
| SPM approved preset creation; unapproved/revoked preset denial | PASS; approved/unapproved also verified in browser |
| JPM submission, Director approval/rejection and SPM co-owner | PASS; integration and browser |
| Designer/Digital Lead creation denial | PASS; integration and browser |
| Technical Admin business-approval denial | PASS; integration and browser |
| Actual Owner completion request; Director approval/rejection | PASS; integration and browser |
| Mandatory documents, sign-off and workflow conditions cannot be bypassed | PASS; integration; incomplete-work blocker also verified in browser |

Regression command:

```sh
node scripts/run-authorization-isolated-integration.mjs --services --runtime --project-read --project-governance --project-write
```

Log: `/private/tmp/flux-phase15d-activation-regressions.log`.

## 4. Browser verification and Director workflow

Headless Chromium `153.0.8010.12` was available in the local cache. Browser checks
ran a private copy of the existing successful production build
(`UM7j_sm6xn9tzmHzLw1g4`) against a disposable database. No `.env` files, Neon,
email or S3 credentials entered that app environment. Browser requests were
restricted to the local app; no external requests were observed.

All browser sessions were issued through the application's normal sign-in form
using newly created fixture credentials. No session was injected or fabricated.
The real development accounts were not used for these browser tests.

Verified screens: sign-in, `/projects/new`, `/projects/approvals`, Artwork project
overview, flexible project overview/final-completion panel and restricted-role
redirects to `/projects` or `/no-access`. Nine screenshots and the PASS result are
under `/private/tmp/flux-phase15d-browser-artifacts/`. No browser JavaScript errors
were recorded. The temporary runner is `/private/tmp/flux-phase15d-browser-check.mjs`.

The existing secure preset workflow is complete: the actual Director signs in,
opens `/projects/approvals`, reviews the seven-stage Artwork designation, supplies
an approval reason and submits **Approve this legacy preset**. Its server action
calls `approveLegacyArtworkPreset`, revalidates Director authority and the exact
definition, then records the real approving actor and immutable audit event.
No additional operator mechanism is needed.

Preset: `legacy-artwork-seven-stages`, version 1; definition SHA-256:
`c1dcbea51db867274375a9c11be5d79da64bf400009700b2d72cfccd005b9a50`.
**The preset is not approved in Neon.** Approval in the disposable browser fixture
does not authorize or create an approval in development. After migration, use the
real Director's authenticated UI session for that separate business decision.

## 5. Findings, preserved scope and sign-off status

No application bug or missing approval UI was found. Temporary browser selectors
were corrected to target visible controls and wait for streamed Next.js redirects
and the loaded completion-blocker panel; these were test-harness issues. No
authorization rule or application source was changed during this activation
review. The migration execution follow-up updated only this report and the status
in `PROJECT-GOVERNANCE.md`; application source and authorization rules were not
changed.

All 154 inspected protected historical migration, Archive/Library/S3 and account
configuration files retain their pre-Phase-1.5D hashes. No pre-existing application
rows were modified; the only database changes were the approved schema additions
and their migration-ledger entry. Archives, Library and S3 remain untouched.
No external email, password/role change,
project deletion, reset, `db push`, push, deployment or later milestone occurred.

**Migration activation and postchecks are complete.** The genuine Director's
development preset approval remains pending and was explicitly excluded from this
execution. V2 read/write authorization remains intact. SPM creation in development
stays blocked until that explicit preset designation. Full business activation
sign-off is not claimed; no further action will occur without the user's next
instruction.

Existing documented limits remain: external Artwork with unresolved document
requirements cannot finalize, and unsupported SPM/JPM flexible creation remains
blocked. This review did not expand template publication or document mutation
functionality. No development test projects are required for the verified flows;
creating any would require the separate explicit approval specified in the request.
