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
- collaborator types
- access presets retained for legacy compatibility

Users are assigned to a role and collaborator type. Per-user permission overrides and project-specific permission overrides are not implemented.

Run `pnpm permissions:sync` after schema changes to upsert permission definitions and seed missing profile rows.

## Hard Rules

Permission keys grant capability only inside a valid business context.

Hard rules still apply:

- project membership still scopes project visibility
- project budget remains owner-only
- only project executors can submit work
- only project owners can review submissions and complete/archive projects
- notifications remain user-owned
- file and archive access is checked server-side

`SUPER_ADMIN` keeps emergency fallback access to user and permission management.
