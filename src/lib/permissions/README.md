# User Permissions

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
