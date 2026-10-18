# Current project authorization boundary

Phase 1.5B replaces legacy project READ grants with trusted V2 identity and
resource scope. See [PROJECT-READ.md](../authorization/PROJECT-READ.md). The
legacy ADMIN/SUPER_ADMIN and membership descriptions below apply to unmigrated
operations; they are not project-read authority. Phase 1.5C integrates native
project writes through transaction-scoped V2 policies; see
[PROJECT-WRITE.md](../authorization/PROJECT-WRITE.md). Synchronous project flags
are compatibility/UI checks, never a replacement for the domain mutation guard.
Creation, destructive project deletion and legacy completion overrides are closed.

# User Permissions

This folder's synchronous resolver remains the **legacy domain engine** during
Phase 1.5A. Its ADMIN/SUPER_ADMIN rules below are not V2 rules. Authenticated
sessions now enforce V2 account status/version independently. Migrating services
use the explicit server-only `v2.ts` adapter and the single evaluator in
`authorization/policy.ts`; see [the runtime boundary](../authorization/RUNTIME.md).
Never combine a V2 denial with a legacy OR fallback or cast a business role into
`UserRole`. No production resource policies are registered in Phase 1.5A.

Permission checks in GTI Archive use stable business keys such as `project.create`, `calendar.update`, and `archive.view`.

Routes, server action names, and API endpoints are implementation details. They can move without changing the underlying permission contract.

Use the helpers in this folder:

- `hasPermission(user, permissionKey)`
- `requirePermission(user, permissionKey)`
- `hasProjectPermission(user, project, permissionKey)`
- `requireProjectPermission(user, project, permissionKey)`

## Profile Storage

`definitions.ts` is the code source of truth for valid permission keys.

The database stores editable profile assignments for:

- global roles

Users are assigned one account role. `archive.view` controls Archive module access, while the per-user Archive setting refines which additional archive assets are visible. `project.create` uses a dedicated per-user grant for selected USER accounts. Project relationships and explicit `ProjectCollaborator` grants further scope access within an individual project; generic per-user permission overrides are not implemented.

Run `pnpm permissions:sync` after schema changes to upsert permission definitions and seed missing profile rows.

## Hard Rules

Permission keys grant capability only inside a valid business context.

Hard rules still apply:

- project membership still scopes standard-user project visibility
- project budget remains manager-only
- only project executors can submit work
- project owners and global project administrators can review and complete work
- notifications remain user-owned
- file and archive access is checked server-side

`ADMIN` is the normal global business administrator. `SUPER_ADMIN` keeps emergency fallback access and is protected from product role assignment or mutation.
