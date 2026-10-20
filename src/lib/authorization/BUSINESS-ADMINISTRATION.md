# Phase 1.5I — secure account administration

Implemented against Phase 1.5H HEAD `2efb88f`. This report supersedes H's
read-only account-administration limitation. Existing business authorization,
project lifecycle rules and independent technical privileges remain unchanged.

## Implemented surfaces

- **Business Users (`/users`)**: Director-only account directory, non-Director
  business-role assignment/removal, permitted suspension/reactivation, permission
  impact, recorded reasons and confirmations, and relevant audit history.
- **Settings → Manage technical privileges
  (`/settings/technical-administration`)**: Technical Administrator-only directory,
  grant/revoke Technical Administrator, and relevant technical history. This
  screen does not expose business-role editing, shared account-status editing,
  Director transfer, business approvals or business records. A dual-role account
  must hold each domain independently.
- **Transfer Director authority**: a separate section of Business Users. Select
  an available recipient, explicitly select the outgoing Director's business role,
  enter a reason and type `TRANSFER DIRECTOR`. Both accounts' expected versions
  are checked. The existing transaction atomically demotes/promotes and retains
  exactly one active Director, with two immutable audit rows under the same
  change ID and the genuine outgoing Director as actor. Both old sessions become
  invalid; the UI requires fresh login. Technical grants and ownership are
  preserved. Ordinary role/status edits cannot demote or suspend the Director.

All role/status/grant changes invalidate affected sessions, including additions
of privileges. Reactivation does not revive old tokens. Success, no-change,
denial, stale-version, interrupted-response and reauthentication feedback are
explicit. No automatic client mutation retry is performed. Refreshing requires
the operator to review and confirm the current version again.

Account-wide status already spans both domains. The business screen only offers
status changes permitted by the existing service: accounts with technical grants
require independent Technical Administrator authority as well as Director
authority. No technical-only status shortcut is introduced. The existing
technical service permits self-revocation; its confirmation explains the loss
of access and fresh-login requirement. No new last-Technical-Administrator
invariant or recovery bypass was invented.

## Security boundary

`administration.ts` composes the existing `createRoleAssignmentService` with the
root Prisma client and genuine request cookie reader. Every write continues
through `assignBusinessRole`, `setTechnicalPrivileges`,
`setAuthorizationStatus` or `transferDirector`. There is no new assignment engine,
direct assignment write or legacy-role fallback. The status service additionally
accepts a trusted business-surface restriction checked inside its existing locked
transaction; its original domain requirements remain enforced.

The new actions accept exact input keys, operation-specific confirmation and a
mandatory bounded reason. Actor IDs, claimed roles/privileges and extra fields
cannot select the actor. The existing service reauthenticates and checks authority
under its assignment/session locks; expected versions, database invariants,
transactional audit attribution and rollback behavior remain authoritative.
Only status/change ID/reauthentication metadata is returned, never internal
assignment snapshots or credentials. Framework Server Action origin protection
remains enabled and unchanged.

Directory/history reads are integrated into the same assignment service and use
its existing actor resolver and Director/technical domain predicates. They hold
the assignment SHARE lock and real session row lock until the projection is
complete. These are account-administration reads, not general technical support
or business resource grants. No runtime diagnostic/support policy was activated.

Directory DTOs contain identity, the selected domain's role/grant, shared account
status, expected version and permitted status-control visibility. History is
filtered by domain before serialization; events confined to the other domain,
including their reasons, are omitted. Returned history includes actual actor ID,
current actor name/email, timestamp, reason, domain-specific before/after values,
version and change ID. Actor names are current directory values, not historical
name snapshots. Pagination scans 50 versions per page with an older-version
cursor, including filtered pages; old history remains reachable. Password hashes,
invitation tokens, cookies, session tokens and raw audit JSON are never projected.

Legacy `users/actions.ts`, permission-profile editors, managed-user avatars and
collaborator/invitation mutations remain closed. Business and technical users
cannot gain a new domain by calling a hidden action directly. No general admin,
impersonation, password reset, recovery, diagnostics or delete-account UI was
added. Existing project, Archive and Library authorization remains intact.

## Onboarding decision

Reviewed `collaboration.ts`, `/register/[token]`, sign-in actions, `auth.ts` and
`auth-password.ts`. The legacy invitation lookup reports invalid and acceptance,
account creation and collaborator mutation services fail closed. Reopening these
paths would not provide a reviewed V2 role-limited, versioned onboarding workflow.

Secure onboarding is deferred as expressly allowed by this milestone. A future
milestone should reuse the existing normalized email handling, scrypt password
hashing/verification and versioned session issuance, with expiring, revocable,
hashed single-use invitations, atomic user/assignment/audit persistence, explicit
SPM/JPM/Designer/Digital Lead eligibility, duplicate-account/replay protection and
an approved post-commit email procedure. It must not reset existing passwords,
grant Director/technical privileges through invitation input or revive old tokens.
No invitation or email was sent in this phase.

## Verification

- Full TypeScript: PASS.
- Targeted ESLint: PASS.
- Authorization foundation, persistence and V2 role/navigation checks: PASS.
- Assignment-service and runtime/session regressions: PASS.
- Project read/write, creation/completion governance and completion documents: PASS.
- Archive, Library and workspace authorization regressions: PASS.
- New administration action/read-model integration: PASS. Covers all V2 identities
  under adversarial legacy ADMIN/SUPER_ADMIN profiles; reason/confirmation/forged
  field validation; domain-specific reads/history; stale/no-op/replayed updates;
  concurrent conflicting writes; suspension/reactivation; first assignment;
  technical grants preserving business roles; session invalidation; paginated
  immutable history; protected Director transfer and self technical revocation.
- Production `pnpm build`: PASS, including bundling, type checking and page generation.
- Existing navigation/browser regression: PASS; 13 screenshots, all role landings/menus, creation and approval routes, task context, category boundaries, personal calendar and stale-cache isolation. Nine fixture assignments/passwords and the original project were preserved; zero JavaScript errors, external requests or storage operations.
- Administration browser acceptance: PASS. Chromium **153.0.8010.12**, **10
  screenshots**, genuine password logins for all five business roles and technical
  administration. Verified role/status/grant dialogs, impact and required reasons,
  business/technical history separation, direct HTTP Server Action forgery,
  cross-domain denial in both directions, replay rejection, stale-page errors,
  suspended-login denial, reactivation, Director handover, both affected session
  invalidations, outgoing Director denial, incoming Director login and technical
  self-revocation. Zero JavaScript errors, external requests or storage operations.

Database checks use new private PostgreSQL **14.19** clusters with TCP disabled,
whitelisted environments and disposable clients. All **105** repository migrations
are applied only in these fixtures and produce empty Prisma schema diffs. This is
not a new Neon migration/activation or a PostgreSQL 18.6 compatibility claim.

Build environment-file values are explicitly blanked, database URLs point at
unreachable loopback, and no migration command is invoked. `pnpm build` runs
`prisma generate && next build`. `vercel-build` would deploy migrations and was
not run. Browser tests copy the production build without `.env` files and use
genuine synthetic password logins with blocked external networking.

Existing fixture User rows, password hashes, legacy labels, audit rows and project
ownership are checked for preservation. Administration mutations change only the
expected disposable V2 assignments and new audit rows; test logins also create
fixture sessions. No live development account,
role, password, approval or business record was queried or modified. No Neon,
Archives/Library feature change, live S3, migration history, push or deployment.

Evidence: `/private/tmp/flux-phase15i-{types,lint,foundation,administration,regressions,build,browser}.log`
and `/private/tmp/flux-phase15i-browser-artifacts/`. Navigation evidence is in
`/private/tmp/flux-phase15i-navigation-browser.log` and
`/private/tmp/flux-phase15i-navigation-browser-artifacts/`.

Initial browser runs exposed a harness wait for streamed Settings content and an
ambiguous accessible name on the recipient dropdown. The wait was corrected and
the new selects now have explicit accessible names; the final administration run
passes. Settings also retained misleading legacy permission-profile/Archive-grant
copy; it now describes Business Users and independent technical administration.

## Remaining Phase 1 scope

The existing-account administration gap from H is implemented. Secure onboarding
remains deferred, as do technical support/recovery/diagnostics, calendar sharing,
Project Tracker, revocation-safe project realtime subscriptions, Archive
verification, Library sharing/broader manager management rights, template
publication/new templates, Custom Stage Builder and six-type Universal Tasker.
Those are not silently activated by account administration. Existing narrow
Archive and Library permissions and Director business-approval requirements are
unchanged.

Phase 1.5I is ready for scoped sign-off for existing-account administration and
the implemented Phase 1 authorization boundaries. Full product completion must
not imply completion of these explicitly deferred workflows. Live operator
acceptance/deployment has not been performed or requested. No next phase was started.

## Exact change manifest

9 files created; 11 modified. No schema or migration changes.

Created:

- `scripts/administration-browser-check.mjs`
- `scripts/administration-integration-check.ts`
- `scripts/tsconfig.administration.json`
- `src/app/(dashboard)/settings/technical-administration/page.tsx`
- `src/app/(dashboard)/users/v2-actions.ts`
- `src/components/users/administration-workspace.tsx`
- `src/lib/authorization/BUSINESS-ADMINISTRATION.md`
- `src/lib/authorization/administration-types.ts`
- `src/lib/authorization/administration.ts`

Modified:

- `package.json`
- `scripts/run-authorization-isolated-integration.mjs`
- `scripts/workspace-browser-check.mjs`
- `scripts/workspace-test-fixture.ts`
- `src/app/(dashboard)/help/page.tsx`
- `src/app/(dashboard)/settings/page.tsx`
- `src/app/(dashboard)/users/page.tsx`
- `src/components/settings/settings-workspace.tsx`
- `src/lib/authorization/LEGACY-ENTRY-POINTS.md`
- `src/lib/authorization/PHASE-1-COMPLETION.md`
- `src/lib/authorization/role-assignment-service.ts`
